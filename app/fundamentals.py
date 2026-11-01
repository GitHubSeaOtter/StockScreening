"""Yahoo Finance の配当・評価指標。日付不明を推測で補わない。"""
from __future__ import annotations

import concurrent.futures
import datetime as dt
import json
import logging
import math
import re
from pathlib import Path

import exchange_calendars as xcals
import pandas as pd
import yfinance as yf

from app.market_calendar import JST, previous_business_day

logger = logging.getLogger(__name__)
CACHE = Path(__file__).resolve().parent.parent / "cache" / "fundamentals.json"


def number(value):
    return float(value) if isinstance(value, (int, float)) and math.isfinite(value) else None


def classify_business(info):
    sector = str(info.get("sector") or "").strip() or None
    industry = str(info.get("industry") or "").strip() or None
    summary = str(info.get("longBusinessSummary") or info.get("description") or "")
    name = " ".join(str(info.get(k) or "") for k in ("longName", "shortName"))
    keyword = re.compile(r"semiconductor|semi-conductor|半導体", re.IGNORECASE)
    related, source = None, None
    for source_name, value in (("industry", industry), ("business_summary", summary), ("company_name", name)):
        if value and keyword.search(value):
            related, source = True, source_name
            break
    if related is None and (industry or summary):
        related, source = False, "industry_or_summary"
    return {"sector": sector, "industry": industry, "semiconductor_related": related,
            "classification_source": source, "classification_version": 1}


def normalize(info, ticker, checked):
    price = number(info.get("regularMarketPrice")) or number(info.get("currentPrice"))
    annual = number(info.get("dividendRate"))
    basis = "forecast"
    if annual is None:
        annual = number(info.get("trailingAnnualDividendRate"))
        basis = "trailing"
    result = {
        "dividend_yield": round(annual / price * 100, 3) if annual is not None and price and price > 0 else None,
        "dividend_basis": basis if annual is not None else None,
        "pe": number(info.get("trailingPE")), "pbr": number(info.get("priceToBook")),
        "fundamentals_at": checked.isoformat(), "ex_dividend_date": None, "entitlement_date": None,
    }
    result.update(classify_business(info))
    stamp = info.get("exDividendDate")
    if isinstance(stamp, (int, float)) and stamp > 0:
        ex = dt.datetime.fromtimestamp(stamp, dt.timezone.utc).date()
        result["ex_dividend_date"] = ex.isoformat()
        if ticker.endswith(".T"):
            last = previous_business_day(ex)
        else:
            cal = xcals.get_calendar("XNYS")
            last = cal.date_to_session(pd.Timestamp(ex) - pd.Timedelta(days=1), direction="previous").date()
        result["entitlement_date"] = last.isoformat()
    return result


def fetch_fundamentals(tickers):
    now = dt.datetime.now(JST)
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    try:
        cached = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    except (ValueError, OSError):
        cached = {}
    # 定期実行では1日キャッシュ。取得失敗時の古い値は最大7日だけ使用する。
    def fresh(item, days):
        try:
            return now - dt.datetime.fromisoformat(item["fundamentals_at"]) < dt.timedelta(days=days)
        except (KeyError, ValueError, TypeError):
            return False
    missing = [t for t in tickers if not fresh(cached.get(t, {}), 1) or cached.get(t, {}).get("classification_version") != 1]
    logger.info("配当・評価指標を取得: %d 銘柄 (cache=%d)", len(missing), len(tickers)-len(missing))
    failures = 0
    def fetch(t):
        try:
            info = yf.Ticker(t).get_info()
            if not info or not any(k in info for k in ("regularMarketPrice", "currentPrice")):
                return t, None
            return t, normalize(info, t, now)
        except Exception:
            return t, None
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        for i, (ticker, values) in enumerate(pool.map(fetch, missing), 1):
            if values is not None:
                cached[ticker] = values
            else:
                failures += 1
            if i % 200 == 0:
                logger.info("配当・評価指標 %d/%d (失敗=%d)", i, len(missing), failures)
    cached = {t: item for t, item in cached.items() if t in tickers and fresh(item, 7)}
    CACHE.write_text(json.dumps(cached, ensure_ascii=False), encoding="utf-8")
    logger.info("配当・評価指標: %d/%d 銘柄 (取得失敗=%d)", len(cached), len(tickers), failures)
    return cached
