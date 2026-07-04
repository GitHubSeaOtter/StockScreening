"""スクリーニング条件エンジン。

条件は JSON のリストで表現し、すべて AND で評価する。

対応する条件タイプ:
- consecutive_monthly_gain: {"type": "consecutive_monthly_gain", "months": 3, "min_pct": 10}
    → N ヶ月連続で、各月 X% 以上上昇(基準日から 1 ヶ月ごとの終値を比較)
- rise_from_recent_low: {"type": "rise_from_recent_low", "lookback_months": 3, "min_pct": 10}
    → 直近 N ヶ月以内につけた安値から X% 以上上昇
- period_return: {"type": "period_return", "period": "3m"|"1m"|"1w", "op": ">="|"<=", "pct": 10}
    → 指定期間の騰落率が X% 以上 / 以下
- price_range: {"type": "price_range", "min": 100, "max": 5000}
    → 基準日終値が指定レンジ内(min / max は省略可)
- min_avg_volume: {"type": "min_avg_volume", "days": 20, "min_volume": 100000}
    → 直近 N 日の平均出来高が指定以上
"""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass

import pandas as pd

PERIOD_DAYS = {"3m": 90, "1m": 30, "1w": 7}


@dataclass
class StockResult:
    code: str
    name: str
    category: str
    close: float
    return_3m: float | None
    return_1m: float | None
    return_1w: float | None


def _close_on_or_before(df: pd.DataFrame, d: dt.date) -> float | None:
    """指定日以前で直近の終値。"""
    idx = [i for i in df.index if i <= d]
    if not idx:
        return None
    return float(df.loc[idx[-1], "Close"])


def _pct_return(df: pd.DataFrame, base: dt.date, days: int) -> float | None:
    now = _close_on_or_before(df, base)
    then = _close_on_or_before(df, base - dt.timedelta(days=days))
    if now is None or then is None or then == 0:
        return None
    return (now / then - 1.0) * 100.0


def _check_consecutive_monthly_gain(
    df: pd.DataFrame, base: dt.date, months: int, min_pct: float
) -> bool:
    """基準日から 1 ヶ月刻みの終値が、各区間で min_pct% 以上上昇しているか。"""
    points: list[float] = []
    for k in range(months + 1):
        c = _close_on_or_before(df, base - dt.timedelta(days=30 * k))
        if c is None:
            return False
        points.append(c)
    # points[0]=現在, points[k]=kヶ月前。古い方から順に検証。
    for k in range(months, 0, -1):
        older, newer = points[k], points[k - 1]
        if older == 0 or (newer / older - 1.0) * 100.0 < min_pct:
            return False
    return True


def _check_rise_from_recent_low(
    df: pd.DataFrame, base: dt.date, lookback_months: int, min_pct: float
) -> bool:
    start = base - dt.timedelta(days=30 * lookback_months)
    window = df[(df.index >= start) & (df.index <= base)]
    if window.empty:
        return False
    low = float(window["Low"].min())
    close = _close_on_or_before(df, base)
    if close is None or low <= 0:
        return False
    return (close / low - 1.0) * 100.0 >= min_pct


def check_conditions(df: pd.DataFrame, base: dt.date, conditions: list[dict]) -> bool:
    """全条件を AND 評価。データ不足の銘柄は False。"""
    for cond in conditions:
        ctype = cond.get("type")
        if ctype == "consecutive_monthly_gain":
            ok = _check_consecutive_monthly_gain(
                df, base, int(cond.get("months", 3)), float(cond.get("min_pct", 10))
            )
        elif ctype == "rise_from_recent_low":
            ok = _check_rise_from_recent_low(
                df,
                base,
                int(cond.get("lookback_months", 3)),
                float(cond.get("min_pct", 10)),
            )
        elif ctype == "period_return":
            days = PERIOD_DAYS.get(cond.get("period", "3m"), 90)
            r = _pct_return(df, base, days)
            if r is None:
                return False
            pct = float(cond.get("pct", 0))
            ok = r >= pct if cond.get("op", ">=") == ">=" else r <= pct
        elif ctype == "price_range":
            close = _close_on_or_before(df, base)
            if close is None:
                return False
            lo = cond.get("min")
            hi = cond.get("max")
            ok = (lo is None or close >= float(lo)) and (
                hi is None or close <= float(hi)
            )
        elif ctype == "min_avg_volume":
            days = int(cond.get("days", 20))
            window = df[df.index <= base].tail(days)
            if window.empty:
                return False
            ok = float(window["Volume"].mean()) >= float(cond.get("min_volume", 0))
        else:
            # 未知の条件タイプは不成立扱い(誤検出を防ぐ)
            return False
        if not ok:
            return False
    return True


def screen(
    prices: dict[str, pd.DataFrame],
    meta: pd.DataFrame,
    base: dt.date,
    conditions: list[dict],
) -> list[StockResult]:
    """条件に合致した銘柄の一覧(3ヶ月・1ヶ月・1週間の上昇率つき)を返す。"""
    meta_by_ticker = meta.set_index("ticker")
    results: list[StockResult] = []
    for ticker, df in prices.items():
        if ticker not in meta_by_ticker.index:
            continue
        if not check_conditions(df, base, conditions):
            continue
        row = meta_by_ticker.loc[ticker]
        close = _close_on_or_before(df, base)
        results.append(
            StockResult(
                code=row["code"],
                name=row["name"],
                category=row["category"],
                close=round(close, 2) if close is not None else 0.0,
                return_3m=_round(_pct_return(df, base, 90)),
                return_1m=_round(_pct_return(df, base, 30)),
                return_1w=_round(_pct_return(df, base, 7)),
            )
        )
    # 3ヶ月上昇率の降順でソート
    results.sort(key=lambda r: r.return_3m if r.return_3m is not None else -1e9, reverse=True)
    return results


def _round(v: float | None) -> float | None:
    return None if v is None else round(v, 2)
