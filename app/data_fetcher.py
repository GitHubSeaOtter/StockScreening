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
USER_AGENT = "Mozilla/5.0 (compatible; StockScreener/1.0)"

# 価格取得に必要な履歴期間(基準日から遡る日数)。12ヶ月条件 + 余裕。
HISTORY_DAYS = 400
BATCH_SIZE = 200

# 純金信託・コモディティ(商品)を表す名称キーワード。
# ETF・ETN 区分の銘柄名にこれらが含まれる場合、category を "commodity" とする。
# 「金融」「銀行」等の誤検出を避けるため、単独の「金」「銀」は使わず具体語のみ。
COMMODITY_KEYWORDS = [
    "純金", "金地金", "金価格", "ゴールド", "GOLD",
    "白金", "プラチナ", "PLATINUM", "パラジウム", "PALLADIUM",
    "シルバー", "銀価格", "SILVER",
    "原油", "WTI", "天然ガス", "ガソリン",
    "コモディティ", "貴金属", "農産物", "穀物",
    "とうもろこし", "大豆", "小麦", "銅価格", "商品指数", "レアメタル",
]


def _cache_path(name: str) -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    return CACHE_DIR / name


def classify_category(market_segment: str, name: str = "") -> str:
    """JPX の「市場・商品区分」と銘柄名から分類する。

    戻り値: stock / etf / commodity / trust / other
    """
    seg = str(market_segment)
    nm = str(name)
    if "ETF" in seg or "ETN" in seg:
        if any(k in nm for k in COMMODITY_KEYWORDS):
            return "commodity"
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

    列: code, name, segment, category(stock/etf/commodity/trust), ticker(yfinance用)
    1日キャッシュする。
    """
    cache = _cache_path("jpx_list.parquet")
    if not force and cache.exists():
        age = dt.datetime.now().timestamp() - cache.stat().st_mtime
        if age < 24 * 3600:
            return pd.read_parquet(cache)

    logger.info("JPX 銘柄リストをダウンロード中...")
    resp = requests.get(JPX_LIST_URL, timeout=60, headers={"User-Agent": USER_AGENT})
    resp.raise_for_status()
    raw = pd.read_excel(io.BytesIO(resp.content))

    df = pd.DataFrame(
        {
            "code": raw["コード"].astype(str).str.strip(),
            "name": raw["銘柄名"].astype(str).str.strip(),
            "segment": raw["市場・商品区分"].astype(str).str.strip(),
        }
    )
    df["category"] = [
        classify_category(seg, nm) for seg, nm in zip(df["segment"], df["name"])
    ]
    df = df[df["category"] != "other"].reset_index(drop=True)
    df["ticker"] = df["code"] + ".T"
    df.to_parquet(cache)
    logger.info(
        "銘柄リスト取得完了: %d 銘柄 %s",
        len(df),
        df["category"].value_counts().to_dict(),
    )
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

    if frames:
        new_df = pd.concat(frames, ignore_index=True)
        if cached is not None:
            new_df = pd.concat([cached, new_df], ignore_index=True)
        new_df.to_parquet(cache)

    return result
