"""東証上場銘柄リスト(JPX)と株価データ(yfinance)の取得・キャッシュ。"""
from __future__ import annotations

import datetime as dt
import io
import logging
from pathlib import Path

import pandas as pd
import requests
import yfinance as yf

logger = logging.getLogger(__name__)

CACHE_DIR = Path(__file__).resolve().parent.parent / "cache"

# JPX が公開している東証上場銘柄一覧(月次更新)
JPX_LIST_URL = (
    "https://www.jpx.co.jp/markets/statistics-equities/misc/"
    "tvdivq0000001vg2-att/data_j.xls"
)

# 価格取得に必要な履歴期間(基準日から遡る日数)。3ヶ月条件 + 余裕。
HISTORY_DAYS = 400
BATCH_SIZE = 200


def _cache_path(name: str) -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    return CACHE_DIR / name


def classify_category(market_segment: str) -> str:
    """JPX の「市場・商品区分」を stock / etf / trust / other に分類する。"""
    seg = str(market_segment)
    if "ETF" in seg or "ETN" in seg:
        return "etf"
    if "REIT" in seg or "ファンド" in seg or "投資信託" in seg:
        return "trust"
    if "PRO Market" in seg or "出資証券" in seg:
        return "other"
    if "プライム" in seg or "スタンダード" in seg or "グロース" in seg:
        return "stock"
    return "other"


def fetch_ticker_list(force: bool = False) -> pd.DataFrame:
    """東証上場銘柄一覧を取得して DataFrame で返す。

    列: code(4桁+市場拡張), name, segment, category(stock/etf/trust/other), ticker(yfinance用)
    1日キャッシュする。
    """
    cache = _cache_path("jpx_list.parquet")
    if not force and cache.exists():
        age = dt.datetime.now().timestamp() - cache.stat().st_mtime
        if age < 24 * 3600:
            return pd.read_parquet(cache)

    logger.info("JPX 銘柄リストをダウンロード中...")
    resp = requests.get(JPX_LIST_URL, timeout=60)
    resp.raise_for_status()
    raw = pd.read_excel(io.BytesIO(resp.content))

    df = pd.DataFrame(
        {
            "code": raw["コード"].astype(str).str.strip(),
            "name": raw["銘柄名"].astype(str).str.strip(),
            "segment": raw["市場・商品区分"].astype(str).str.strip(),
        }
    )
    df["category"] = df["segment"].map(classify_category)
    df = df[df["category"] != "other"].reset_index(drop=True)
    df["ticker"] = df["code"] + ".T"
    df.to_parquet(cache)
    logger.info("銘柄リスト取得完了: %d 銘柄", len(df))
    return df


def fetch_prices(
    tickers: list[str],
    base: dt.date,
    force: bool = False,
    progress_cb=None,
) -> dict[str, pd.DataFrame]:
    """基準日までの日足を取得する。

    戻り値: {ticker: DataFrame(index=date, columns=[Open, High, Low, Close, Volume])}
    基準日単位で parquet にキャッシュする。
    """
    start = base - dt.timedelta(days=HISTORY_DAYS)
    end = base + dt.timedelta(days=1)  # yfinance の end は排他的

    cache = _cache_path(f"prices_{base.isoformat()}.parquet")
    cached: pd.DataFrame | None = None
    if not force and cache.exists():
        cached = pd.read_parquet(cache)

    result: dict[str, pd.DataFrame] = {}
    missing: list[str] = []
    if cached is not None:
        have = set(cached["ticker"].unique())
        for t in tickers:
            if t in have:
                sub = cached[cached["ticker"] == t].set_index("date")
                result[t] = sub[["Open", "High", "Low", "Close", "Volume"]]
            else:
                missing.append(t)
    else:
        missing = list(tickers)

    total = len(missing)
    if total == 0:
        return result

    logger.info("株価ダウンロード: %d 銘柄", total)
    frames: list[pd.DataFrame] = []
    for i in range(0, total, BATCH_SIZE):
        batch = missing[i : i + BATCH_SIZE]
        try:
            data = yf.download(
                tickers=batch,
                start=start.isoformat(),
                end=end.isoformat(),
                interval="1d",
                group_by="ticker",
                auto_adjust=True,
                threads=True,
                progress=False,
            )
        except Exception:
            logger.exception("バッチ取得失敗: %s...", batch[0])
            continue

        for t in batch:
            try:
                sub = data[t] if len(batch) > 1 else data
            except KeyError:
                continue
            sub = sub.dropna(subset=["Close"])
            if sub.empty:
                continue
            sub = sub[["Open", "High", "Low", "Close", "Volume"]].copy()
            sub.index = pd.to_datetime(sub.index).date
            sub.index.name = "date"
            result[t] = sub
            rec = sub.reset_index()
            rec["ticker"] = t
            frames.append(rec)

        if progress_cb:
            progress_cb(min(i + BATCH_SIZE, total), total)

    # キャッシュ追記保存
    if frames:
        new_df = pd.concat(frames, ignore_index=True)
        if cached is not None:
            new_df = pd.concat([cached, new_df], ignore_index=True)
        new_df.to_parquet(cache)

    return result
