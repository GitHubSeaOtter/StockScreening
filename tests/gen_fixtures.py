"""合成データで特徴量を計算し、Python 条件評価の期待結果とともに fixtures.json を出力。"""
import datetime as dt
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app import features as F
from app import conditions as C

base = dt.date(2026, 7, 3)
dates = pd.bdate_range(end=base, periods=280).date

def mkdf(close):
    return pd.DataFrame({"Open": close, "High": close*1.01, "Low": close*0.99,
                         "Close": close, "Volume": 150000}, index=dates)

# A: 毎月12%上昇 / B: 横ばい500 / C: 2ヶ月前安値から反発 / D: 出来高薄い上昇
growth = np.power(1.12, np.arange(len(dates))/21.0)*100
flat = np.full(len(dates), 500.0)
c = np.full(len(dates), 1000.0); c[len(dates)-42:] = np.linspace(800, 960, 42)
dfs = {
    "1001": mkdf(growth), "1002": mkdf(flat), "1003": mkdf(c),
}
dfs["1004"] = mkdf(growth.copy()); dfs["1004"]["Volume"] = 3000  # 薄商い

feats = []
for code, df in dfs.items():
    ft = F.compute_features(df, base)
    ft["code"] = code
    feats.append(ft)

tests = [
    {"conditions": [{"type":"consecutive_monthly_gain","months":3,"min_pct":10}]},
    {"conditions": [{"type":"rise_from_recent_low","lookback_months":3,"min_pct":10}]},
    {"conditions": [{"type":"period_return","period":"1m","op":"<=","pct":0}]},
    {"conditions": [{"type":"price_range","min":450,"max":600}]},
    {"conditions": [{"type":"min_avg_volume","days":20,"min_volume":100000}]},
    {"conditions": [
        {"type":"consecutive_monthly_gain","months":3,"min_pct":10},
        {"type":"min_avg_volume","days":20,"min_volume":100000},
    ]},
    {"conditions": [{"type":"consecutive_monthly_gain","months":6,"min_pct":10}]},
]
for t in tests:
    t["expected"] = sorted(ft["code"] for ft in feats
                           if C.evaluate_conditions(ft, t["conditions"]))

out = {"features": feats, "tests": tests}
Path("tests/fixtures.json").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
print("fixtures 生成:", {t["conditions"][0]["type"]: t["expected"] for t in tests})
