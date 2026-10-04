"""米国指数の重複排除と時間外価格の基準日を確認する。"""
import datetime as dt
import unittest
from unittest.mock import patch

import pandas as pd

from app import us_markets


class USMarketsTest(unittest.TestCase):
    def test_constituents_are_deduplicated(self):
        dow = pd.DataFrame({"Symbol": ["AAPL"] * 30, "Company": ["Apple"] * 30})
        nasdaq = pd.DataFrame({"Ticker": ["AAPL"] + [f"Q{i}" for i in range(90)],
                               "Company": ["Apple"] + [f"Company {i}" for i in range(90)]})
        response = type("Response", (), {"text": "<html></html>", "raise_for_status": lambda self: None})()
        with patch.object(us_markets.requests, "get", return_value=response), \
             patch.object(us_markets.pd, "read_html", side_effect=[[dow], [nasdaq]]):
            rows = us_markets.fetch_constituents().set_index("code")
        self.assertEqual(len(rows), 91)
        self.assertEqual(rows.loc["AAPL", "markets"], ["dow", "nasdaq100"])

    def test_after_hours_uses_only_target_date_and_compares_daily_close(self):
        times = pd.to_datetime(["2026-10-02 15:55", "2026-10-02 16:05", "2026-10-02 19:55",
                                "2026-10-03 16:05"]).tz_localize(us_markets.NEW_YORK)
        frame = pd.DataFrame({"Close": [100.0, 101.0, 103.0, 105.0]}, index=times)
        with patch.object(us_markets.yf, "download", return_value=frame):
            quote = us_markets.fetch_after_hours(["AAPL"], {"AAPL": 100.0}, dt.date(2026, 10, 2))
        self.assertEqual(quote["AAPL"]["after"], 103.0)
        self.assertEqual(quote["AAPL"]["after_pct"], 3.0)

    def test_dow_falls_back_when_source_has_no_constituent_table(self):
        nasdaq = pd.DataFrame({"Ticker": [f"Q{i}" for i in range(90)],
                               "Company": [f"Company {i}" for i in range(90)]})
        response = type("Response", (), {"text": "<html></html>", "raise_for_status": lambda self: None})()
        with patch.object(us_markets.requests, "get", return_value=response), \
             patch.object(us_markets.pd, "read_html", side_effect=[[pd.DataFrame({"Year": [2026]})], [nasdaq]]):
            rows = us_markets.fetch_constituents()
        self.assertEqual(sum("dow" in markets for markets in rows["markets"]), 30)

    def test_missing_session_has_no_after_price(self):
        times = pd.to_datetime(["2026-10-02 15:55"]).tz_localize(us_markets.NEW_YORK)
        frame = pd.DataFrame({"Close": [100.0]}, index=times)
        with patch.object(us_markets.yf, "download", return_value=frame):
            self.assertEqual(us_markets.fetch_after_hours(["AAPL"], {"AAPL": 100.0}, dt.date(2026, 10, 2)), {})


if __name__ == "__main__":
    unittest.main()
