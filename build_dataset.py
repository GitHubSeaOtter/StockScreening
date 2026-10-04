#!/usr/bin/env python3
"""全銘柄の特徴量を計算し docs/data/screening.json に出力する。

GitHub Actions から定期実行される。ローカルでも `python build_dataset.py` で実行可。
外部ネットワーク(www.jpx.co.jp / query1.finance.yahoo.com)へのアクセスが必要。
"""
from __future__ import annotations

import datetime as dt
import json
import logging
from pathlib import Path

import pandas as pd

from app import data_fetcher, features, market_calendar, us_markets

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).resolve().parent / "docs" / "data"
OUT_PATH = DATA_DIR / "screening.json"
CHARTS_DIR = DATA_DIR / "charts"

# チャート用に保持する日足の最大本数(約1年ぶんの営業日)。
CHART_MAX_POINTS = 260


def write_chart(df, row, base) -> None:
    """1銘柄の日足チャートデータ(日付・終値・出来高)を JSON で出力する。

    タップ時にブラウザが遅延読み込みする。直近 CHART_MAX_POINTS 本に絞る。
    """
    d = df.sort_index().tail(CHART_MAX_POINTS)
    chart = {
        "c": row["code"],
        "n": row["name"],
        "cat": row["category"],
        "base": base.isoformat(),
        "d": [x.isoformat() for x in d.index],
        "close": [round(float(v), 2) for v in d["Close"]],
        "vol": [int(v) if v == v else 0 for v in d["Volume"]],  # NaN→0
    }
    (CHARTS_DIR / f"{row['code']}.json").write_text(
        json.dumps(chart, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )


def main() -> None:
    base = market_calendar.base_date()
    us_base = us_markets.us_base_date()
    logger.info("基準日: 東証 %s / 米国 %s", base, us_base)

    jp_meta = data_fetcher.fetch_ticker_list()
    jp_meta["markets"] = [["jpx"] for _ in range(len(jp_meta))]
    us_meta = us_markets.fetch_constituents()
    meta = pd.concat([jp_meta, us_meta], ignore_index=True)
    tickers = meta["ticker"].tolist()
    logger.info("対象: %d 銘柄", len(tickers))

    prices = data_fetcher.fetch_prices(
        tickers,
        max(base, us_base),
        progress_cb=lambda d, t: logger.info("株価取得 %d/%d", d, t),
    )

    CHARTS_DIR.mkdir(parents=True, exist_ok=True)

    meta_by_ticker = meta.set_index("ticker")
    stocks: list[dict] = []
    for ticker, df in prices.items():
        if ticker not in meta_by_ticker.index:
            continue
        row = meta_by_ticker.loc[ticker]
        stock_base = base if "jpx" in row["markets"] else us_base
        feat = features.compute_features(df, stock_base)
        if feat["close"] is None:
            continue
        # 米国祝日など、対象日の終値が存在しない場合は古い値を公開しない。
        if "jpx" not in row["markets"] and stock_base not in df.index:
            continue
        feat["code"] = row["code"]
        feat["name"] = row["name"]
        feat["cat"] = row["category"]
        feat["markets"] = row["markets"]
        feat["currency"] = "JPY" if "jpx" in row["markets"] else "USD"
        stocks.append(feat)
        write_chart(df, row, stock_base)

    us_stocks = {s["code"]: s for s in stocks if "jpx" not in s["markets"]}
    after = us_markets.fetch_after_hours(list(us_stocks), {code: s["close"] for code, s in us_stocks.items()}, us_base)
    for code, quote in after.items():
        us_stocks[code].update(quote)

    counts: dict[str, int] = {}
    for s in stocks:
        counts[s["cat"]] = counts.get(s["cat"], 0) + 1
    market_counts = {market: sum(market in s["markets"] for s in stocks)
                     for market in ("jpx", "dow", "nasdaq100")}
    for market, expected in (("jpx", len(jp_meta)),
                             ("dow", sum("dow" in m for m in us_meta["markets"])),
                             ("nasdaq100", sum("nasdaq100" in m for m in us_meta["markets"]))):
        if expected and market_counts[market] < expected * 0.7:
            raise RuntimeError(f"{market} の株価取得率が低すぎます: {market_counts[market]}/{expected}")

    payload = {
        "base_date": base.isoformat(),
        "us_base_date": us_base.isoformat(),
        "market_counts": market_counts,
        "generated_at": dt.datetime.now(market_calendar.JST).isoformat(timespec="seconds"),
        "counts": counts,
        "total": len(stocks),
        "stocks": stocks,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    logger.info("出力完了: %s (%d 銘柄, %s)", OUT_PATH, len(stocks), counts)


if __name__ == "__main__":
    main()
