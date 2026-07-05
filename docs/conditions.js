// 特徴量ベクトルに対する条件評価(ブラウザ / Node 共用)。
// app/conditions.py と同一ロジック。tests/ の parity テストで一致を検証する。
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ScreenConditions = factory();
})(typeof self !== "undefined" ? self : this, function () {
  function evalCond(f, c) {
    switch (c.type) {
      case "consecutive_monthly_gain": {
        const m = c.months | 0;
        const p = +c.min_pct;
        for (let k = m; k >= 1; k--) {
          const older = f.mc[k];
          const newer = f.mc[k - 1];
          if (older == null || newer == null || older <= 0) return false;
          if ((newer / older - 1) * 100 < p) return false;
        }
        return true;
      }
      case "rise_from_recent_low": {
        const l = c.lookback_months | 0;
        const p = +c.min_pct;
        const low = f.lm[l];
        if (low == null || low <= 0 || f.close == null) return false;
        return (f.close / low - 1) * 100 >= p;
      }
      case "period_return": {
        const r = { "3m": f.r3, "1m": f.r1, "1w": f.rw }[c.period];
        if (r == null) return false;
        return c.op === "<=" ? r <= +c.pct : r >= +c.pct;
      }
      case "price_range": {
        if (f.close == null) return false;
        if (c.min != null && f.close < +c.min) return false;
        if (c.max != null && f.close > +c.max) return false;
        return true;
      }
      case "min_avg_volume": {
        const v = f.v[String(c.days)];
        if (v == null) return false;
        return v >= +c.min_volume;
      }
      default:
        return false;
    }
  }

  function evaluateConditions(f, conditions) {
    return conditions.every((c) => evalCond(f, c));
  }

  return { evalCond, evaluateConditions };
});
