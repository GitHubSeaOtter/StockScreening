import datetime as dt
import unittest
from app.fundamentals import normalize, classify_business

class DividendTest(unittest.TestCase):
    def test_yield_uses_annual_amount_not_ambiguous_provider_percentage(self):
        v=normalize({"dividendRate":4,"regularMarketPrice":100,"dividendYield":400}, "TEST", dt.datetime.now(dt.timezone.utc))
        self.assertEqual(v["dividend_yield"],4)
        self.assertEqual(v["dividend_basis"],"forecast")

    def test_missing_dividend_is_unknown(self):
        v=normalize({"regularMarketPrice":100}, "TEST", dt.datetime.now(dt.timezone.utc))
        self.assertIsNone(v["dividend_yield"])
        self.assertIsNone(v["entitlement_date"])

    def test_japan_holiday_before_ex_date(self):
        stamp=dt.datetime(2026,11,4,tzinfo=dt.timezone.utc).timestamp()
        v=normalize({"exDividendDate":stamp}, "7203.T",dt.datetime.now(dt.timezone.utc))
        self.assertEqual(v["entitlement_date"],"2026-11-02")

    def test_us_good_friday_is_not_a_trading_day(self):
        stamp=dt.datetime(2026,4,6,tzinfo=dt.timezone.utc).timestamp()
        v=normalize({"exDividendDate":stamp}, "TEST",dt.datetime.now(dt.timezone.utc))
        self.assertEqual(v["entitlement_date"],"2026-04-02")

class ClassificationTest(unittest.TestCase):
    def test_semiconductor_industry(self):
        v=classify_business({"sector":"Technology","industry":"Semiconductor Equipment & Materials"})
        self.assertEqual(v["sector"],"Technology")
        self.assertTrue(v["semiconductor_related"])
        self.assertEqual(v["classification_source"],"industry")

    def test_semiconductor_materials_in_other_sector(self):
        v=classify_business({"sector":"Basic Materials","industry":"Specialty Chemicals","longBusinessSummary":"Supplies photoresists for semiconductor manufacturing."})
        self.assertTrue(v["semiconductor_related"])
        self.assertEqual(v["classification_source"],"business_summary")

    def test_company_name_and_missing_information(self):
        self.assertTrue(classify_business({"longName":"半導体材料テスト"})["semiconductor_related"])
        self.assertIsNone(classify_business({})["semiconductor_related"])
        self.assertFalse(classify_business({"industry":"Packaged Foods","longBusinessSummary":"Makes potato chips."})["semiconductor_related"])
