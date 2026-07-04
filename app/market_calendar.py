"""基準日の決定ロジック。

仕様:
- 基準日は前営業日。
- ただし営業日で日本時間 15:30 を過ぎていたら当日を基準にする。

営業日 = 平日 かつ 日本の祝日でない かつ 東証の年末年始休業(12/31〜1/3)でない。
"""
from __future__ import annotations

import datetime as dt
from zoneinfo import ZoneInfo

import jpholiday

JST = ZoneInfo("Asia/Tokyo")
MARKET_CLOSE = dt.time(15, 30)


def is_business_day(d: dt.date) -> bool:
    if d.weekday() >= 5:
        return False
    if jpholiday.is_holiday(d):
        return False
    # 東証は 12/31〜1/3 が休業
    if (d.month == 12 and d.day == 31) or (d.month == 1 and d.day <= 3):
        return False
    return True


def previous_business_day(d: dt.date) -> dt.date:
    d = d - dt.timedelta(days=1)
    while not is_business_day(d):
        d = d - dt.timedelta(days=1)
    return d


def base_date(now: dt.datetime | None = None) -> dt.date:
    """スクリーニングの基準日を返す。"""
    if now is None:
        now = dt.datetime.now(JST)
    elif now.tzinfo is None:
        now = now.replace(tzinfo=JST)
    else:
        now = now.astimezone(JST)

    today = now.date()
    if is_business_day(today) and now.time() >= MARKET_CLOSE:
        return today
    return previous_business_day(today)
