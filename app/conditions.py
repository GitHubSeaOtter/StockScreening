"""特徴量ベクトルに対する条件評価(Python リファレンス実装)。

docs/conditions.js と完全に同じロジックを実装する。両者は同一の特徴量 dict を
入力とし、tests/ の parity テストで一致を検証する。

条件タイプ:
  consecutive_monthly_gain {months, min_pct}
  rise_from_recent_low     {lookback_months, min_pct}
  period_return            {period: "3m"|"1m"|"1w", op: ">="|"<=", pct}
  price_range              {min?, max?}
  min_avg_volume           {days: 5|20|60, min_volume}
"""
from __future__ import annotations


def _eval_cond(f: dict, c: dict) -> bool:
    ctype = c.get("type")
    if ctype == "consecutive_monthly_gain":
        m = int(c.get("months", 3))
        p = float(c.get("min_pct", 10))
        mc = f["mc"]
        for k in range(m, 0, -1):
            older, newer = mc[k], mc[k - 1]
            if older is None or newer is None or older <= 0:
                return False
            if (newer / older - 1.0) * 100.0 < p:
                return False
        return True

    if ctype == "rise_from_recent_low":
        l = int(c.get("lookback_months", 3))
        p = float(c.get("min_pct", 10))
        low = f["lm"][l] if l < len(f["lm"]) else None
        close = f["close"]
        if low is None or low <= 0 or close is None:
            return False
        return (close / low - 1.0) * 100.0 >= p

    if ctype == "period_return":
        r = {"3m": f["r3"], "1m": f["r1"], "1w": f["rw"]}.get(c.get("period"))
        if r is None:
            return False
        pct = float(c.get("pct", 0))
        return r <= pct if c.get("op") == "<=" else r >= pct

    if ctype == "price_range":
        close = f["close"]
        if close is None:
            return False
        lo, hi = c.get("min"), c.get("max")
        if lo is not None and close < float(lo):
            return False
        if hi is not None and close > float(hi):
            return False
        return True

    if ctype == "min_avg_volume":
        v = f["v"].get(str(c.get("days")))
        if v is None:
            return False
        return v >= float(c.get("min_volume", 0))

    return False  # 未知の条件は不成立


def evaluate_conditions(f: dict, conditions: list[dict]) -> bool:
    """全条件を AND 評価する。"""
    return all(_eval_cond(f, c) for c in conditions)
