# スクリーナーの項目 / Screener fields

<!-- このファイルは npm run gen:fields-doc が指標の登録表（src/shared/fields.ts）から作る。手で直さない -->

スクリーナーとアラートの条件に使える項目の一覧です（59 項目）。スクリーナーの「＋ 条件を追加」（Insert）で、分類ごとに並んだダイアログから選び、打って絞り込めます。値はすべて手元に取り込んだデータから計算します。

The fields you can use in screener and alert conditions (59 fields). Press Insert ("+ Add condition") in the screener to pick one from a dialog grouped by category, and type to filter. All values are computed from the data stored on your PC.

- 単位: 金額は表示の単位で打ちます（1 株あたりは円、最低投資金額は万円、時価総額・売買代金は億円）。「30万」「1.5億」のように単位を付けても読みます。/ Units: type money in the display unit (yen per share, 10k yen for minimum investment, 100M yen for market cap and turnover); suffixes such as 30万 or 1.5億 also work.
- 相対条件: 同じ種類の項目どうしで比べられます（例: 終値 ≥ 75日移動平均 +5%）。/ Relative conditions compare fields of the same kind (e.g. Last ≥ MA75 + 5%).
- 欠損: 値の無い銘柄を含めるかを条件ごとに選べます（市場データと実行時に計算する項目）。/ For market-data and computed fields you can choose per condition whether to include symbols without a value.
- 保有の項目（保有している・損益率・保有割合・業種の保有割合・取得利回り）は、保有の記録があるときだけダイアログに出ます。/ Holdings fields (held, P/L, weight, sector weight, yield on cost) appear in the dialog only when you have holdings.

## 銘柄の属性 / Attributes

| 項目 / Field | 単位 / Unit | 比べ方 / Ops | 相対条件の相手 / Compare with | 説明 / Description |
| --- | --- | --- | --- | --- |
| 市場区分<br>Market |  | ∈ ∉ |  | プライム・スタンダード・グロース・REIT・ETF<br>Prime, Standard, Growth, REIT, ETF |
| 業種(33業種)<br>Sector (TSE 33) |  | ∈ ∉ |  | Enter で業種を足す・外す、←→ で 1 業種ずつ切り替え<br>Enter adds or removes a sector; ←→ cycles one |
| 種別<br>Type |  | ∈ ∉ |  | 株式・J-REIT・ETF・優先株など<br>Stock, J-REIT, ETF, preferred and others |

## 配当 / Dividends

| 項目 / Field | 単位 / Unit | 比べ方 / Ops | 相対条件の相手 / Compare with | 説明 / Description |
| --- | --- | --- | --- | --- |
| 実績利回り<br>Trailing yield | % | ≥ ≤ | 利回り(直近2期の年換算) | 過去12か月の権利落ち日ベースの配当合計 ÷ 終値（ローカルの配当履歴から計算）<br>Dividends with ex-dates in the past 12 months ÷ last (from local history) |
| 利回り(直近2期の年換算)<br>Yield (last 2 periods) | % | ≥ ≤ | 実績利回り | 直近の決算期 2 回分の配当・分配金を年換算 ÷ 終値。決算期を変えた J-REIT 向け（FR-I3）<br>Last two distributions annualized ÷ last. For J-REITs that changed their fiscal period |
| 配当性向<br>Payout ratio | % | ≤ ≥ |  | 過去12か月の配当 ÷ EPS（Yahoo の実績 EPS）<br>Trailing 12M dividends ÷ EPS (Yahoo trailing EPS) |
| 連続増配年数<br>Dividend growth streak | 年 / y | ≥ ≤ |  | 暦年の配当合計で比べた連続増配の年数（保存期間の範囲内で数える）<br>Consecutive calendar years of higher dividends (within the retention period) |
| 連続非減配年数<br>No-cut streak | 年 / y | ≥ ≤ |  | 暦年の配当合計が前年を下回らなかった年数（保存期間の範囲内）<br>Consecutive calendar years without a cut (within the retention period) |
| 権利確定月<br>Record month | 月 / month | ∈ ∉ |  | 権利落ち日の翌営業日の月（過去 2 年の配当から）<br>Month after the ex-date (from the past two years) |
| 1株配当・分配金<br>Dividend per share | 円 / JPY | ≥ ≤ |  | 過去 12 か月の配当・分配金の合計（円の絶対値。主に一覧の列に）<br>Dividends in the past 12 months, mainly as a column |
| 増減配率(前年比)<br>Dividend change (YoY) | % | ≥ ≤ |  | 年途中を除いた最新の年の配当合計の前年比。直近の減配が分かる<br>YoY change of the latest full-year dividend total (shows recent cuts) |
| 5年の増配率<br>5-year dividend growth | %/年 / %/y | ≥ ≤ |  | 年途中を除いた最新の年と 5 年前の年の配当合計から求めた年率<br>Annual rate from the latest full year and the year five years before |

## 割安・財務 / Valuation

| 項目 / Field | 単位 / Unit | 比べ方 / Ops | 相対条件の相手 / Compare with | 説明 / Description |
| --- | --- | --- | --- | --- |
| PER<br>P/E | 倍 / x | ≤ ≥ |  | 終値 ÷ EPS（Yahoo の実績 EPS）<br>Last ÷ EPS (Yahoo trailing) |
| PBR<br>P/B | 倍 / x | ≤ ≥ |  | J-REIT は簿価ベース（NAV 倍率ではない）<br>Book value basis for J-REITs (not NAV) |
| ROE(実績・近似)<br>ROE (trailing, approx.) | % | ≥ ≤ |  | EPS ÷ BPS（期末の BPS で割る近似。どちらも Yahoo の実績）。EPS・BPS が 0 以下、REIT・ETF は欠損<br>EPS ÷ BPS (approximation with period-end BPS). Missing when EPS or BPS ≤ 0, and for REITs and ETFs |
| EPS<br>EPS | 円 / JPY | ≥ ≤ |  | 1 株あたり利益（Yahoo の実績）。円の絶対値で、主に一覧の列に<br>Earnings per share (Yahoo trailing), mainly as a column |
| BPS<br>BPS | 円 / JPY | ≥ ≤ |  | 1 株あたり純資産（Yahoo の実績）。円の絶対値で、主に一覧の列に<br>Book value per share (Yahoo), mainly as a column |

## 価格・規模 / Price & size

| 項目 / Field | 単位 / Unit | 比べ方 / Ops | 相対条件の相手 / Compare with | 説明 / Description |
| --- | --- | --- | --- | --- |
| 終値<br>Last | 円 / JPY | ≥ ≤ | 25日移動平均、75日移動平均、200日移動平均、52週高値、52週安値 | 最新の終値（分割調整済み）<br>Latest close (split-adjusted) |
| 前日比<br>Change | 円 / JPY | ≥ ≤ |  | 前日の終値からの値幅（分割調整済み）<br>Change from the previous close in JPY (split-adjusted) |
| 前日比率<br>Change % | % | ≥ ≤ |  | 前日の終値からの騰落率<br>Change from the previous close in % |
| 売買代金(20日平均)<br>Turnover (20D avg) | 億円 / ¥100M | ≥ ≤ |  | Yahoo に売買代金は無いため、終値 × 出来高の近似（20 取引日の平均）<br>Approximated as close × volume (20 trading-day average) |
| 時価総額<br>Market cap | 億円 / ¥100M | ≥ ≤ |  | 終値 × 発行済株式数（Yahoo）<br>Last × shares outstanding (Yahoo) |
| 最低投資金額<br>Minimum investment | 万円 / ¥10k | ≤ ≥ |  | 終値 × 売買単位（株式は 100 株、REIT は 1 口）。ETF・ETN・その他は単位が分からないので欠損<br>Last × trading unit (100 shares for stocks, 1 unit for REITs). Missing for ETFs and others (unit unknown) |

## 価格の水準 / Price levels

| 項目 / Field | 単位 / Unit | 比べ方 / Ops | 相対条件の相手 / Compare with | 説明 / Description |
| --- | --- | --- | --- | --- |
| 25日移動平均<br>25D MA | 円 / JPY | ≥ ≤ | 終値、75日移動平均、200日移動平均、52週高値、52週安値 | 終値の 25 取引日の平均。主に相対条件の相手（終値 ≥ 25 日移動平均）<br>25-day average of closes (mainly as a relative target) |
| 75日移動平均<br>75D MA | 円 / JPY | ≥ ≤ | 終値、25日移動平均、200日移動平均、52週高値、52週安値 | 終値の 75 取引日の平均<br>75-day average of closes |
| 200日移動平均<br>200D MA | 円 / JPY | ≥ ≤ | 終値、25日移動平均、75日移動平均、52週高値、52週安値 | 終値の 200 取引日の平均<br>200-day average of closes |
| 52週高値<br>52W high | 円 / JPY | ≥ ≤ | 終値、25日移動平均、75日移動平均、200日移動平均、52週安値 | 直近 245 取引日の高値<br>High of the past 245 trading days |
| 52週安値<br>52W low | 円 / JPY | ≥ ≤ | 終値、25日移動平均、75日移動平均、200日移動平均、52週高値 | 直近 245 取引日の安値<br>Low of the past 245 trading days |

## テクニカル / Technical

| 項目 / Field | 単位 / Unit | 比べ方 / Ops | 相対条件の相手 / Compare with | 説明 / Description |
| --- | --- | --- | --- | --- |
| 52週高値から<br>From 52W high | % | ≥ ≤ |  | 終値 ÷ 52 週高値 − 1<br>Last ÷ 52-week high − 1 |
| 25日線乖離<br>vs 25D MA | % | ≥ ≤ | 75日線乖離、200日線乖離 | 終値 ÷ 25 日移動平均 − 1<br>Last ÷ 25-day MA − 1 |
| 75日線乖離<br>vs 75D MA | % | ≥ ≤ | 25日線乖離、200日線乖離 | 終値 ÷ 75 日移動平均 − 1<br>Last ÷ 75-day MA − 1 |
| RSI(14)<br>RSI(14) |  | ≥ ≤ |  | 14 日の RSI（Wilder の平滑化）<br>14-day RSI (Wilder smoothing) |
| 出来高倍率(20日比)<br>Volume vs 20D avg | 倍 / x | ≥ ≤ |  | 最新の出来高 ÷ 直近 20 日の平均<br>Latest volume ÷ 20-day average |
| ゴールデンクロスから<br>Days since golden cross | 取引日 / trading days | ≤ ≥ |  | 25 日線が 75 日線を上に抜けてからの取引日数（直近 1 年）<br>Trading days since the 25D MA crossed above the 75D MA (past year) |
| デッドクロスから<br>Days since dead cross | 取引日 / trading days | ≤ ≥ |  | 25 日線が 75 日線を下に抜けてからの取引日数（直近 1 年）<br>Trading days since the 25D MA crossed below the 75D MA (past year) |
| 52週安値から<br>From 52W low | % | ≥ ≤ |  | 終値 ÷ 52 週安値 − 1（安値からどれだけ戻したか）<br>Last ÷ 52-week low − 1 |
| 年初来高値から<br>From YTD high | % | ≥ ≤ |  | 終値 ÷ 年初来の高値 − 1。1〜3 月は昨年来（前年 1 月から）<br>Last ÷ year-to-date high − 1 (from last January in Jan–Mar) |
| 年初来安値から<br>From YTD low | % | ≥ ≤ |  | 終値 ÷ 年初来の安値 − 1。1〜3 月は昨年来（前年 1 月から）<br>Last ÷ year-to-date low − 1 (from last January in Jan–Mar) |
| 200日線乖離<br>vs 200D MA | % | ≥ ≤ | 25日線乖離、75日線乖離 | 終値 ÷ 200 日移動平均 − 1（長期の傾向からの離れ）<br>Last ÷ 200-day moving average − 1 |

## リスク / Risk

| 項目 / Field | 単位 / Unit | 比べ方 / Ops | 相対条件の相手 / Compare with | 説明 / Description |
| --- | --- | --- | --- | --- |
| ボラティリティ(年率)<br>Volatility (annualized) | % | ≤ ≥ |  | 日々の騰落率の標準偏差（60 取引日）× √245。61 本未満は欠損<br>Std. dev. of daily returns over 60 trading days × √245 |
| ベータ(対日経平均)<br>Beta (vs Nikkei 225) |  | ≤ ≥ |  | 日経平均と日付で突き合わせた 1 年の日次の騰落率から。120 日未満は欠損。薄商いの銘柄は低く出やすい<br>From one year of daily returns matched by date with the Nikkei 225. Missing under 120 days |
| 最大下落率(3年)<br>Max drawdown (3Y) | % | ≥ ≤ |  | 3 年の中で高値からいちばん下げた割合（配当込み）<br>Largest fall from a high within three years (total return) |

## 予定 / Schedule

| 項目 / Field | 単位 / Unit | 比べ方 / Ops | 相対条件の相手 / Compare with | 説明 / Description |
| --- | --- | --- | --- | --- |
| 決算発表まで<br>Days to earnings | 日 / days | ≤ ≥ |  | 次の決算発表（Yahoo の予定・推定）までの暦日数。過ぎた予定・予定の無い銘柄は欠損<br>Calendar days to the next earnings date (Yahoo schedule or estimate). Missing when none |
| 権利付最終日まで<br>Days to last cum-rights day | 日 / days | ≤ ≥ |  | 次の権利付最終日（過去の権利落ち日から推定した権利確定日の 2 営業日前）までの暦日数<br>Calendar days to the next last cum-rights day (estimated from past ex-dates) |

## 騰落率 / Returns

| 項目 / Field | 単位 / Unit | 比べ方 / Ops | 相対条件の相手 / Compare with | 説明 / Description |
| --- | --- | --- | --- | --- |
| 1か月騰落率<br>1M return | % | ≥ ≤ | 3か月騰落率、1年騰落率、3年騰落率、6か月騰落率、年初来騰落率、1年騰落率(配当込み)、3年騰落率(配当込み) | 21 取引日前の終値から<br>From the close 21 trading days ago |
| 3か月騰落率<br>3M return | % | ≥ ≤ | 1か月騰落率、1年騰落率、3年騰落率、6か月騰落率、年初来騰落率、1年騰落率(配当込み)、3年騰落率(配当込み) | 63 取引日前の終値から<br>From the close 63 trading days ago |
| 1年騰落率<br>1Y return | % | ≥ ≤ | 1か月騰落率、3か月騰落率、3年騰落率、6か月騰落率、年初来騰落率、1年騰落率(配当込み)、3年騰落率(配当込み) | 245 取引日前の終値から<br>From the close 245 trading days ago |
| 3年騰落率<br>3Y return | % | ≥ ≤ | 1か月騰落率、3か月騰落率、1年騰落率、6か月騰落率、年初来騰落率、1年騰落率(配当込み)、3年騰落率(配当込み) | 735 取引日前の終値から<br>From the close 735 trading days ago |
| 6か月騰落率<br>6M return | % | ≥ ≤ | 1か月騰落率、3か月騰落率、1年騰落率、3年騰落率、年初来騰落率、1年騰落率(配当込み)、3年騰落率(配当込み) | 123 取引日前の終値から<br>From the close 123 trading days ago |
| 年初来騰落率<br>YTD return | % | ≥ ≤ | 1か月騰落率、3か月騰落率、1年騰落率、3年騰落率、6か月騰落率、1年騰落率(配当込み)、3年騰落率(配当込み) | 前年最後の終値から<br>From the last close of the previous year |
| 1年騰落率(配当込み)<br>1Y total return | % | ≥ ≤ | 1か月騰落率、3か月騰落率、1年騰落率、3年騰落率、6か月騰落率、年初来騰落率、3年騰落率(配当込み) | 配当で下がった分を戻した騰落率（チャートの「配当込み」と同じ）<br>Return with dividends added back (same as the chart's total return) |
| 3年騰落率(配当込み)<br>3Y total return | % | ≥ ≤ | 1か月騰落率、3か月騰落率、1年騰落率、3年騰落率、6か月騰落率、年初来騰落率、1年騰落率(配当込み) | 配当で下がった分を戻した 3 年の騰落率<br>Three-year return with dividends added back |

## リスト・保有 / Lists & holdings

| 項目 / Field | 単位 / Unit | 比べ方 / Ops | 相対条件の相手 / Compare with | 説明 / Description |
| --- | --- | --- | --- | --- |
| お気に入り<br>Favorite |  | = |  | ★を付けた銘柄<br>Symbols marked with ★ |
| ウォッチリスト<br>Watchlist |  | ∈ ∉ |  | 選んだウォッチリストにある銘柄<br>Symbols in the chosen watchlists |
| 保有<br>Held |  | = |  | 保有タブに記録した銘柄（どの口座区分でも）<br>Symbols recorded in the Holdings tab (any account) |
| 損益率<br>P/L % | % | ≤ ≥ |  | 保有の評価損益率（最新の終値 ÷ 平均取得単価 − 1。口座区分をまたいで合計）<br>Holding P/L % (latest close ÷ average cost − 1, across accounts) |
| 保有割合<br>Holding weight | % | ≤ ≥ |  | 保有全体の評価額に占める割合。保有していない銘柄は 0%（「≤ 3%」では未保有の銘柄もすべて通る）<br>Share of the total holdings value. 0% when not held (so "≤ 3%" includes every unheld symbol) |
| 業種の保有割合<br>Sector holding weight | % | ≤ ≥ |  | その銘柄の業種（J-REIT はまとめて）が保有全体の評価額に占める割合。分散のため、手薄な業種の銘柄を探す<br>Share of the symbol's sector in the total holdings value (to find under-weighted sectors) |
| 取得利回り<br>Yield on cost | % | ≥ ≤ |  | 過去 12 か月の配当 ÷ 平均取得単価。保有していない銘柄は欠損<br>Past 12 months of dividends ÷ average cost. Missing when not held |
