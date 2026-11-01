(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.NLExamples=factory();})(typeof self!=='undefined'?self:this,function(){return [
  {
    "text": "銀行関連",
    "expression": "banking == 1",
    "interpretation": "銀行・銀行持株会社の業種を日米の分類のどちらかで判定します。"
  },
  {
    "text": "半年間毎月上昇",
    "expression": "monthly_up(6)",
    "interpretation": "基準日から暦の1ヶ月ずつ遡る6区間がすべて上昇。"
  },
  {
    "text": "過去一年上昇期間が多い",
    "expression": "monthly_up_count(12) > 6",
    "interpretation": "単位を月とし、過去12ヶ月中7ヶ月以上が上昇。"
  },
  {
    "text": "過去一年、上昇した週が多い",
    "expression": "weekly_up_count(52) > 26",
    "interpretation": "過去52週中27週以上が上昇。"
  },
  {
    "text": "過去一年で上昇月が8ヶ月以上",
    "expression": "monthly_up_count(12) >= 8",
    "interpretation": "過去12ヶ月中8ヶ月以上が上昇。"
  },
  {
    "text": "過去一年で上昇月が半分以上",
    "expression": "monthly_up_count(12) >= 6",
    "interpretation": "過去12ヶ月中6ヶ月以上が上昇。"
  },
  {
    "text": "過去一年で上昇月が下落月より多い",
    "expression": "monthly_up_count(12) > monthly_down_count(12)",
    "interpretation": "横ばい月を除き、上昇月数が下落月数を上回る。"
  },
  {
    "text": "直近10営業日のうち6日以上上昇",
    "expression": "daily_up_count(10) >= 6",
    "interpretation": "直近10営業日の前日比で6日以上が上昇。"
  },
  {
    "text": "半年間毎月3%以上上昇",
    "expression": "monthly_min_gain(6) >= 3",
    "interpretation": "直近6ヶ月の各月の騰落率がすべて3%以上。"
  },
  {
    "text": "半年間毎月5%以上下落",
    "expression": "monthly_max_gain(6) <= -5",
    "interpretation": "直近6ヶ月の各月の騰落率がすべて-5%以下。"
  },
  {
    "text": "過去一年で5%以上上昇した月が8回以上",
    "expression": "monthly_gain_count(12,5) >= 8",
    "interpretation": "過去12ヶ月中、月間騰落率が5%以上だった月が8回以上。"
  },
  {
    "text": "過去一年で5%以上下落した月が4回以上",
    "expression": "monthly_loss_count(12,-5) >= 4",
    "interpretation": "過去12ヶ月中、月間騰落率が-5%以下だった月が4回以上。"
  },
  {
    "text": "直近4週すべて下落",
    "expression": "weekly_down(4)",
    "interpretation": "直近4つの週区間がすべて下落。"
  },
  {
    "text": "過去一年で下落月が8ヶ月以上",
    "expression": "monthly_down_count(12) >= 8",
    "interpretation": "過去12ヶ月中8ヶ月以上が下落。"
  },
  {
    "text": "半年間の合計で上昇",
    "expression": "change(126) > 0",
    "interpretation": "約半年の126営業日前と現在の価格を比較。毎月連続上昇とは区別。"
  },
  {
    "text": "過去一年で合計20%以上上昇",
    "expression": "change(252) >= 20",
    "interpretation": "約一年の252営業日前と現在の価格を比較。"
  },
  {
    "text": "金融セクター",
    "expression": "sector == \"Financial Services\"",
    "interpretation": "銀行・保険・証券などを含む金融セクター。"
  },
  {
    "text": "保険関連",
    "expression": "industry_has(\"Insurance\") || jpx_industry == \"保険業\"",
    "interpretation": "YahooまたはJPXの保険業種に該当。"
  },
  {
    "text": "銀行か半導体関連で配当利回り3%以上",
    "expression": "(banking == 1 || semiconductor == 1) && dividend_yield >= 3",
    "interpretation": "銀行または半導体関連のうち、配当利回り3%以上。"
  },
  {
    "text": "銀行を除く",
    "expression": "banking == 0",
    "interpretation": "銀行以外。業種未取得の銘柄は除外。"
  },
  {
    "text": "半導体関連で3ヶ月10%以上上昇",
    "expression": "semiconductor == 1 && r3 >= 10",
    "interpretation": "半導体関連かつ直近約3ヶ月の騰落率10%以上。"
  },
  {
    "text": "株価500円から3000円",
    "expression": "close >= 500 && close <= 3000",
    "interpretation": "東証を選択して、価格の上下限で絞り込み。"
  },
  {
    "text": "配当利回り3〜6%で権利付き最終日まで30日以内",
    "expression": "dividend_yield >= 3 && dividend_yield <= 6 && rights_days >= 0 && rights_days <= 30",
    "interpretation": "利回り3〜6%、権利付き最終日が今日から30暦日以内。"
  },
  {
    "text": "20日平均が60日平均より上、株価も20日平均より上",
    "expression": "sma(20) > sma(60) && close > sma(20)",
    "interpretation": "価格と短期・中期移動平均の位置関係。"
  },
  {
    "text": "RSIが35〜50で60日平均より上",
    "expression": "rsi(14) >= 35 && rsi(14) <= 50 && close > sma(60)",
    "interpretation": "14営業日RSIと60日平均を組み合わせる。"
  },
  {
    "text": "出来高が平均の2倍以上で前日比プラス",
    "expression": "volume_ratio >= 2 && change(1) > 0",
    "interpretation": "当日出来高が20日平均の2倍以上で、前日比がプラス。"
  },
  {
    "text": "一年の終値高値から2%以内",
    "expression": "close >= high(252) * 0.98",
    "interpretation": "252営業日の終値高値との比較。"
  },
  {
    "text": "直近20日の値動きが小さい",
    "expression": "volatility(20) <= 25",
    "interpretation": "例として20営業日の年率ボラティリティ25%以下。"
  },
  {
    "text": "半年間毎月上昇して平均出来高10万株以上",
    "expression": "monthly_up(6) && avg_volume(20) >= 100000",
    "interpretation": "直近6ヶ月の連続上昇と20営業日の平均出来高を両方確認。"
  }
];});
