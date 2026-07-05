"""1銘柄の価格データから、条件評価に必要な特徴量ベクトルを計算する。

ブラウザ側(docs/conditions.js)はこの特徴量ベクトルに対して条件を評価する。
Python 側の条件評価(app/conditions.py)と JS 側は同じ特徴量を入力とするため、
両者が一致することをテストで担保できる。

特徴量(1銘柄 = 1 dict):
  code, name, cat, close
  mc:  長さ13の配列。mc[k] = k ヶ月前の終値(0=基準日時点)。欠損は null。
  lm:  長さ13の配列。lm[k] = 直近 k ヶ月の安値。lm[0] は未使用(null)。
  r3, r1, rw: 3ヶ月 / 1ヶ月 / 1週間の騰落率(%)。欠損は null。
  v:   {"5":..., "20":..., "60":...} 直近 N 日の平均出来高。
"""
from __future__ import annotations

import datetime as dt

import pandas as pd

MONTHS = 12
VOLUME_WINDOWS = (5, 20, 60)


def _close_on_or_before(df: pd.DataFrame, d: dt.date) -> float | None:
    idx = [i for i in df.index if i <= d]
    if not idx:
        return None
    return float(df.loc[idx[-1], "Close"])


def _pct_return(df: pd.DataFrame, base: dt.date, days: int) -> float | None:
    now = _close_on_or_before(df, base)
    then = _close_on_or_before(df, base - dt.timedelta(days=days))
    if now is None or then is None or then == 0:
        return None
    return round((now / then - 1.0) * 100.0, 2)


def _round(v: float | None) -> float | None:
    return None if v is None else round(v, 2)


def compute_features(df: pd.DataFrame, base: dt.date) -> dict:
    """価格 DataFrame から特徴量 dict を計算する。"""
    mc: list[float | None] = []
    for k in range(MONTHS + 1):
        c = _close_on_or_before(df, base - dt.timedelta(days=30 * k))
        mc.append(_round(c))

    lm: list[float | None] = [None]  # lm[0] は未使用
    for k in range(1, MONTHS + 1):
        start = base - dt.timedelta(days=30 * k)
        window = df[(df.index >= start) & (df.index <= base)]
        lm.append(_round(float(window["Low"].min())) if not window.empty else None)

    v: dict[str, float | None] = {}
    below = df[df.index <= base]
    for w in VOLUME_WINDOWS:
        tail = below.tail(w)
        v[str(w)] = round(float(tail["Volume"].mean())) if not tail.empty else None

    return {
        "close": mc[0],
        "mc": mc,
        "lm": lm,
        "r3": _pct_return(df, base, 90),
        "r1": _pct_return(df, base, 30),
        "rw": _pct_return(df, base, 7),
        "v": v,
    }
