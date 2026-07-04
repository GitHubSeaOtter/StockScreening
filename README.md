# 株スクリーニングアプリ

東証上場銘柄を対象に、テクニカル条件でスクリーニングする Web アプリです。
PC 上で Python サーバーを起動し、**iPhone のブラウザ**(同一 Wi-Fi 内)からアクセスして使います。

## 機能

- **対象銘柄**: 東証上場銘柄(JPX 公式の銘柄一覧を自動取得)。株 / 信託(REIT 等)/ ETF でフィルタリング可能
- **条件指定**(複数条件を AND で組み合わせ):
  - N ヶ月連続で毎月 X% 以上上昇(例: 3ヶ月連続で 10% 以上増加)
  - 直近 N ヶ月以内に更新した安値から X% 以上上昇
  - 期間騰落率(3ヶ月 / 1ヶ月 / 1週間)が X% 以上・以下
  - 株価レンジ、平均出来高
- **自然言語での条件指定**(任意): 「3ヶ月連続で10%以上上昇、株価は500円から3000円」のような文章を
  Claude API(claude-haiku-4-5)で条件 JSON に変換。API キー未設定でも手動指定で全機能利用可
- **結果表示**: 銘柄名・銘柄コード・終値・上昇率(3ヶ月 / 1ヶ月 / 1週間)をソート可能なリストで表示
- **基準日**: 前営業日。ただし営業日の日本時間 15:30 以降は当日(祝日・年末年始は自動考慮)

## セットアップ

```bash
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

PC の IP アドレスを確認し(例: `192.168.1.10`)、iPhone の Safari で
`http://192.168.1.10:8000/` を開きます。

> 初回スクリーニングは全銘柄(約4,000)の株価取得に数分かかります。
> 取得結果は基準日単位で `cache/` にキャッシュされ、同日 2 回目以降は高速です。

## LLM API キー(任意)

自然言語での条件指定を使う場合のみ必要です。画面下部の「⚙️ 設定」から
Anthropic API キーを保存してください。キーは **サーバーのローカル
(`config/settings.json`)にのみ保存** され、`.gitignore` 済みです。

## データソース

- 銘柄一覧: JPX(日本取引所グループ)公開の東証上場銘柄一覧 `data_j.xls`
- 株価: Yahoo Finance(yfinance、ティッカーは `XXXX.T`)

※ 実行環境から `www.jpx.co.jp` と `query1.finance.yahoo.com` への
HTTPS アクセスが必要です。

## 構成

```
app/
  main.py            FastAPI サーバー(ジョブ管理・API)
  market_calendar.py 基準日ロジック(営業日・15:30 判定)
  data_fetcher.py    JPX 銘柄リスト + yfinance 株価取得・キャッシュ
  screener.py        条件エンジン(JSON 条件を AND 評価)
  llm_parser.py      自然言語→条件 JSON 変換(claude-haiku-4-5、任意)
  static/index.html  iPhone 向けモバイル UI
docs/model-routing.md  モデル選定(コスト最適化)の記録
```
