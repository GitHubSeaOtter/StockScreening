"""直近週の終値と連続騰落条件の境界値を確認する。"""
import datetime as dt
import unittest

import pandas as pd

from app.conditions import evaluate_conditions
from app.features import compute_features


class WeeklyStreakTest(unittest.TestCase):
    def test_four_rising_weeks_excludes_flat_week(self):
        base = dt.date(2026, 10, 2)
        dates = [base - dt.timedelta(days=7 * k) for k in range(4, -1, -1)]
        prices = [80, 90, 100, 110, 120]
        frame = pd.DataFrame({"Close": prices, "Low": prices, "Volume": [100] * 5}, index=dates)
        feat = compute_features(frame, base)
        condition = {"type": "consecutive_period_return", "unit": "week", "periods": 4, "op": ">", "pct": 0}
        self.assertEqual(feat["wc"][:5], [120, 110, 100, 90, 80])
        self.assertTrue(evaluate_conditions(feat, [condition]))
        feat["wc"][0] = 110
        self.assertFalse(evaluate_conditions(feat, [condition]))

    def test_missing_week_does_not_count_as_rising(self):
        feat = {"wc": [120, 110, 100, None, 80]}
        condition = {"type": "consecutive_period_return", "unit": "week", "periods": 4, "op": ">", "pct": 0}
        self.assertFalse(evaluate_conditions(feat, [condition]))


if __name__ == "__main__":
    unittest.main()
