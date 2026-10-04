"""Wikipedia の構成銘柄表と Yahoo Finance の時間外価格。"""
from __future__ import annotations

import datetime as dt
import io
import logging
import re
from zoneinfo import ZoneInfo

import pandas as pd
import requests
import yfinance as yf

logger = logging.getLogger(__name__)
NEW_YORK = ZoneInfo("America/New_York")
INDEX_PAGES = {
    "dow": "https://en.wikipedia.org/wiki/Dow_Jones_Industrial_Average",
    "nasdaq100": "https://en.wikipedia.org/wiki/List_of_NASDAQ-100_companies",
}
# Wikipedia の Dow ページから構成銘柄表が消えた場合に使う直近の控え。
# 毎回ページを優先する。銘柄入替があればこの一覧を更新する。
DOW_SNAPSHOT = """AAPL Apple
AMGN Amgen
AMZN Amazon
AXP American Express
BA Boeing
CAT Caterpillar
CRM Salesforce
CSCO Cisco
CVX Chevron
DIS Disney
GS Goldman Sachs
HD Home Depot
HON Honeywell
IBM IBM
JNJ Johnson & Johnson
JPM JPMorgan Chase
KO Coca-Cola
MCD McDonald's
MMM 3M
MRK Merck
MSFT Microsoft
NKE Nike
NVDA Nvidia
PG Procter & Gamble
SHW Sherwin-Williams
TRV Travelers
UNH UnitedHealth
V Visa
VZ Verizon
WMT Walmart"""


def fetch_constituents() -> pd.DataFrame:
    """同じ銘柄が両指数にある場合も一行にまとめる。取得失敗はジョブ失敗とする。"""
    members: dict[str, dict] = {}
    for market, url in INDEX_PAGES.items():
        response = requests.get(url, headers={"User-Agent": "StockScreening/1.0 (public index data)"}, timeout=45)
        response.raise_for_status()
        table = None
        seen = []
        for candidate in pd.read_html(io.StringIO(response.text)):
            candidate.columns = [str(c[-1] if isinstance(c, tuple) else c).strip() for c in candidate.columns]
            seen.append((len(candidate), candidate.columns.tolist()))
            symbol_col = next((c for c in ("Symbol", "Ticker") if c in candidate.columns), None)
            if symbol_col and "Company" in candidate.columns and len(candidate) >= (25 if market == "dow" else 90):
                table = candidate
                break
        if table is None and market == "dow":
            logger.warning("NYダウの構成銘柄表がないため同梱一覧を使用: %s", seen[:5])
            table = pd.DataFrame([line.split(" ", 1) for line in DOW_SNAPSHOT.splitlines()], columns=["Ticker", "Company"])
            symbol_col = "Ticker"
        if table is None:
            raise ValueError(f"{market} の構成銘柄表が見つかりません: {seen}")
        for _, row in table.iterrows():
            code = str(row[symbol_col]).strip().replace(".", "-")
            if not re.fullmatch(r"[A-Z0-9-]{1,12}", code):
                continue
            item = members.setdefault(code, {"code": code, "ticker": code, "name": str(row["Company"]).strip(), "category": "stock", "markets": []})
            if market not in item["markets"]:
                item["markets"].append(market)
        logger.info("%s: %d 構成銘柄", market, len(table))
    return pd.DataFrame(members.values())


def us_base_date(now: dt.datetime | None = None) -> dt.date:
    """米東部 16 時以後は当日、それ以前は直前の平日。休場日は実株価で判定。"""
    now = (now or dt.datetime.now(NEW_YORK)).astimezone(NEW_YORK)
    day = now.date()
    if now.time() < dt.time(16):
        day -= dt.timedelta(days=1)
    while day.weekday() >= 5:
        day -= dt.timedelta(days=1)
    return day


def fetch_after_hours(tickers: list[str], regular_close: dict[str, float], base: dt.date) -> dict[str, dict]:
    """当日の 16:00–20:00 ET の最終取引値を、当日の日足終値と比較する。"""
    result: dict[str, dict] = {}
    for start in range(0, len(tickers), 50):
        batch = tickers[start:start + 50]
        try:
            data = yf.download(tickers=batch, period="5d", interval="5m", prepost=True,
                               group_by="ticker", auto_adjust=False, threads=True, progress=False)
        except Exception:
            logger.exception("時間外価格の取得に失敗: %s", batch[0])
            continue
        for ticker in batch:
            try:
                frame = data[ticker] if isinstance(data.columns, pd.MultiIndex) else data
                if frame.empty or frame.index.tz is None:
                    continue
                local = frame.tz_convert(NEW_YORK)
                mask = [(t.date() == base and dt.time(16) <= t.time() < dt.time(20)) for t in local.index]
                after = local.loc[mask].dropna(subset=["Close"])
                close = regular_close.get(ticker)
                if after.empty or not close or close <= 0:
                    continue
                last = after.iloc[-1]
                stamp = after.index[-1]
                result[ticker] = {"after": round(float(last["Close"]), 2),
                                  "after_pct": round((float(last["Close"]) / close - 1) * 100, 2),
                                  "after_at": stamp.isoformat(timespec="minutes")}
            except (KeyError, TypeError, ValueError):
                logger.exception("時間外価格の処理に失敗: %s", ticker)
    logger.info("時間外価格: %d/%d 銘柄", len(result), len(tickers))
    return result
