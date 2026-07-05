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

from app import data_fetcher, features, market_calendar

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

OUT_PATH = Path(__file__).resolve().parent / "docs" / "data" / "screening.json"


def main() -> None:
    base = market_calendar.base_date()
    logger.info("基準日: %s", base)

    meta = data_fetcher.fetch_ticker_list()
    tickers = meta["ticker"].tolist()
    logger.info("対象: %d 銘柄", len(tickers))

    prices = data_fetcher.fetch_prices(
        tickers,
        base,
        progress_cb=lambda d, t: logger.info("株価取得 %d/%d", d, t),
    )

    meta_by_ticker = meta.set_index("ticker")
    stocks: list[dict] = []
    for ticker, df in prices.items():
        if ticker not in meta_by_ticker.index:
            continue
        feat = features.compute_features(df, base)
        if feat["close"] is None:
            continue
        row = meta_by_ticker.loc[ticker]
        feat["code"] = row["code"]
        feat["name"] = row["name"]
        feat["cat"] = row["category"]
        stocks.append(feat)

    counts: dict[str, int] = {}
    for s in stocks:
        counts[s["cat"]] = counts.get(s["cat"], 0) + 1

    payload = {
        "base_date": base.isoformat(),
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
