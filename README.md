# 株スクリーニングアプリ

東証上場銘柄を対象に、テクニカル条件でスクリーニングする Web アプリです。

**方式: GitHub Actions で定期実行 → JSON を出力 → GitHub Pages の静的ページで閲覧。**
サーバーを常時起動する必要がなく、iPhone のブラウザからいつでも結果を見られます。

```
GitHub Actions(平日 17:00 JST 定期実行)
  └─ build_dataset.py … JPX 銘柄一覧 + yfinance 株価を取得し、
                        全銘柄の特徴量を計算して docs/data/screening.json に出力・コミット
GitHub Pages(docs/)
  └─ index.html … screening.json を読み込み、ブラウザ内で条件評価・表示
```

## 機能

- **対象銘柄**: 東証上場銘柄(JPX 公式一覧を自動取得)。**株 / 信託(REIT等)/ ETF / 純金信託・商品(コモディティ)** でフィルタリング可能
- **条件指定**(複数条件を AND で組み合わせ):
  - N ヶ月連続で毎月 X% 以上上昇(例: 3ヶ月連続で 10% 以上増加)
  - 直近 N ヶ月以内に更新した安値から X% 以上上昇
  - 期間騰落率(3ヶ月 / 1ヶ月 / 1週間)が X% 以上・以下
  - 株価レンジ / 平均出来高(5・20・60日)
- **自然言語での条件指定**(任意): 「3ヶ月連続で10%以上上昇、株価は500円から3000円」のような文章を
  Claude API(claude-haiku-4-5)で条件に変換。API キー未設定でも手動指定で全機能利用可
- **結果表示**: 銘柄名・銘柄コード・終値・上昇率(3ヶ月 / 1ヶ月 / 1週間)をソート可能なリストで表示
- **基準日**: 前営業日。ただし営業日の日本時間 15:30 以降は当日(祝日・年末年始を自動考慮)

## セットアップ(GitHub 上で運用)

1. このリポジトリを GitHub に置く(このブランチをデフォルトブランチにマージ)
2. **Settings → Pages** で Source を「Deploy from a branch」、ブランチを対象ブランチの **`/docs`** に設定
3. **Actions → 定期スクリーニング → Run workflow** で初回データを生成
   (以降は平日 17:00 JST に自動実行され、`docs/data/screening.json` が更新される)
4. iPhone の Safari で GitHub Pages の URL(`https://<ユーザー名>.github.io/<リポジトリ名>/`)を開く

> ⏰ **cron による定期実行はデフォルトブランチのワークフローのみ有効**です(GitHub の仕様)。
> マージ前でも **Run workflow** から任意のブランチを選んで手動実行できます。

## ローカルでデータ生成

```bash
pip install -r requirements.txt
python build_dataset.py          # docs/data/screening.json を生成
python -m http.server -d docs 8000   # http://localhost:8000/ で確認
```

※ `www.jpx.co.jp` と `query1.finance.yahoo.com` への HTTPS アクセスが必要です。

## LLM API キー(任意)

自然言語での条件指定を使う場合のみ必要です。ページ下部の「⚙️ 設定」から
Anthropic API キーを保存すると、**この端末のブラウザ(localStorage)にのみ保存**され、
変換時に直接 Anthropic API へ送信されます。サーバーには保存されません。

## テスト

条件評価は Python(`app/conditions.py`)と JS(`docs/conditions.js`)で同一ロジックを実装し、
同じ特徴量に対して結果が一致することを parity テストで担保しています。

```bash
python tests/gen_fixtures.py   # Python 側で特徴量と期待結果を生成
node tests/parity.mjs          # JS 側が完全一致することを検証
```

## 構成

```
build_dataset.py       Actions から実行するデータ生成スクリプト
app/
  market_calendar.py   基準日ロジック(営業日・15:30 判定)
  data_fetcher.py      JPX 銘柄一覧 + yfinance 株価取得・分類(純金信託→commodity)
  features.py          1銘柄あたりの特徴量ベクトル計算
  conditions.py        条件評価(Python リファレンス実装)
docs/                  GitHub Pages 公開ディレクトリ
  index.html           静的ビューア(条件ビルダー + ブラウザ内評価)
  conditions.js        条件評価(JS 実装 / Python と同一ロジック)
  model-routing.md     モデル選定(コスト最適化)の記録
  data/screening.json  Actions が生成(初回実行までは存在しない)
.github/workflows/
  screening.yml        定期実行ワークフロー
tests/                 Python↔JS parity テスト
```

## データソース

- 銘柄一覧: JPX(日本取引所グループ)公開の東証上場銘柄一覧 `data_j.xls`
- 株価: Yahoo Finance(yfinance、ティッカーは `XXXX.T`)
