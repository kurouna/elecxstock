# P3 の設計

P3（要求仕様 §12「P3 以降」）を実装に入る前の設計。要求は [requirements.md](requirements.md) の ID で参照する。
P2（v0.0.2）までの構成（Core = utilityProcess、renderer は `bridge.call` だけ、指標の登録表、利用者のデータは JSON）を崩さずに足せることを前提にする。

- 書いた日: 2026-11-13（v0.0.2 の時点）
- 実装の順番の案は §11。外部 API の仕様は **実装の前に P0 と同じ要領で実データを確かめる**（§12 の未決事項）。

---

## 1. 範囲

| #   | 機能                                         | 要求                     | 主な変更の場所                                                          |
| --- | -------------------------------------------- | ------------------------ | ----------------------------------------------------------------------- |
| 1   | 保有に基づくスクリーニング                   | FR-H4, H6, FD3           | `shared/fields.ts`（`compute`）、`core/screener.ts`、`core/holdings.ts` |
| 2   | 利用者が式で作る指標                         | FR-FD6                   | 新規 `shared/expr.ts`、利用者のデータ `formulas.json`                   |
| 3   | メモ・タグ（notes ペイン）                   | §4 `UserInstrumentData`  | 利用者のデータ `instruments.json`、新規ペイン `notes`                   |
| 4   | 描画ツール（水平線・トレンドライン・価格帯） | FR-C8                    | `ChartView.svelte`（Series Primitives）、`drawings.json`                |
| 5   | 価格アラート                                 | FR-C10                   | Core（更新のたびに判定）、`alerts.json`、OS の通知                      |
| 6   | チャートの PNG 書き出し・コピー              | FR-C11                   | `ChartView.svelte`（`takeScreenshot`）、main の IPC                     |
| 7   | 別ウィンドウ（マルチモニタ）                 | FR-L7                    | main（ウィンドウ管理）、`LayoutDoc` の版を上げる                        |
| 8   | J-Quants（予想配当・財務・支払日）           | §3 データ源、FR-H3, I 系 | 新規 `core/providers/jquants.ts`、API キーの保存（NFR-S2）              |
| 9   | EDINET（有報ベースの財務）                   | §3 データ源              | 新規 `core/providers/edinet.ts`                                         |
| 10  | 適時開示（disclosures ペイン）               | §6.3                     | 取得元は §12 で確かめてから決める                                       |
| 11  | 手入力・CSV での値の補完                     | §3 データ源              | 新規 `overrides` 表、取り込みの画面                                     |
| 12  | J-REIT の一時的な増減をならす                | FR-I5                    | `core/metrics.ts`                                                       |
| 13  | CLI                                          | §8.1, NFR-A7             | 新規 `src/cli/`（同じ Core を素の Node で動かす）                       |

NAV 倍率（§5.1）は取得元が見つかったときだけ足す（J-REIT 各社の開示を集める手段が無いため、P3 の範囲には入れない）。

---

## 2. 保有に基づくスクリーニング（FR-H4, H6）

### 2.1 指標

`fields.ts` に予約した `holding.pnlPct`（`source: { kind: 'compute' }`、`availableFrom: 'P3'`）と同じ形で足す。値は **保存しない**（FR-FD3。保有を変えるとすぐ反映し、市場データの DB を取り直しても失われない）。

| ID                     | 名前                   | 計算                                                    | 型      |
| ---------------------- | ---------------------- | ------------------------------------------------------- | ------- |
| `holding.held`         | 保有中                 | どれかの口座区分で数量 > 0                              | bool    |
| `holding.qty`          | 保有数量               | 口座区分の合計                                          | number  |
| `holding.avgCost`      | 平均取得単価           | 合計の取得価額 ÷ 合計の数量（口座区分をまたぐ加重平均） | money   |
| `holding.value`        | 評価額                 | 終値 × 数量                                             | money   |
| `holding.pnl`          | 評価損益額             | 評価額 − 取得価額                                       | money   |
| `holding.pnlPct`       | 損益率                 | 評価損益額 ÷ 取得価額                                   | percent |
| `holding.yoc`          | 取得単価利回り         | 過去 12 か月の配当 ÷ 平均取得単価                       | percent |
| `holding.fromCost`     | 平均取得単価からの乖離 | 終値 ÷ 平均取得単価 − 1                                 | percent |
| `holding.daysSinceBuy` | 最後に買ってからの日数 | 取引の履歴がある保有だけ（無ければ欠損）                | number  |
| `holding.weight`       | 保有全体に占める割合   | 評価額 ÷ 全保有の評価額                                 | percent |
| `holding.account`      | 口座区分               | 保有している口座区分（in / notin）                      | enum    |

### 2.2 計算の場所

- Core の `screener.run` は今 `metrics` 表だけを読む。保有の指標は **Core が保有の記録（`UserStore.load('holdings')`）と metrics から、スクリーニングの前に 1 回だけ** 銘柄ごとの値を作って `Map<InstrumentId, HoldingMetrics>` にし、`runScreen` の入力に足す（`ScreenInput.holdings`）。
- `runScreen` の `test()` に `src.kind === 'compute'` の分岐を足し、`holdings.get(id)?.[key]` を引く。欠損の扱い（FR-SC8）は metrics と同じ。
- 一覧の列（`lib/columns.ts`）も、同じ計算を renderer 側で `app.holdings` と `metric()` から行う（`lib/portfolio.ts` の `valuation()` を広げる）。計算式は `shared/holdingMetrics.ts` に純関数で置き、Core と renderer で共有する。

### 2.3 保有が無いとき（FR-H6）

- 条件エディタの候補（`addCond`）と列の選択は、`app.holdings.length === 0` のとき `category: 'holding'` を出さない。
- 保存したスクリーンに保有の指標があり、保有が空なら、その条件は **無効**（FR-SC11）。`conditionValid()` に「`requires: ['holdings']` で保有が空」を足す。

### 2.4 画面

- スクリーナーの既定のスクリーンに「買い増しの候補（損益率 ≤ −10% かつ 実績利回り ≥ 4% かつ 75 日線乖離 ≥ 0%）」を足す（保有があるときだけ `defaultScreens()` に入れる）。
- portfolio ペインに「スクリーナーで開く」（保有中 = true の条件を持ったスクリーナー）を置く。

### 2.5 テスト

- `shared/holdingMetrics.ts` の単体テスト（口座区分をまたぐ平均・分割の調整・欠損）。
- `runScreen` に保有を渡したときの判定、保有が空のときの無効化。

---

## 3. 利用者が式で作る指標（FR-FD6）

### 3.1 形

```ts
interface Formula {
  id: string // 'f:xxxx'。FieldDef.id にそのまま使う
  name: LocalizedName
  expr: string // 例: 'income.yield / value.pbr'
  type: 'number' | 'percent' | 'ratio' | 'money'
  digits: number
  created: number
  updated: number
}
```

- 保存先は利用者のデータ `formulas.json`（FR-S4, S12 と同じ保護。書き出し・取り込みに含める）。
- 起動時と変更時に、`FIELDS` に `{ id: f.id, source: { kind: 'compute', key: f.id }, category: 'user', availableFrom: 'P3' }` として足す（登録表は `FIELD_BY_ID` を作り直す関数を持たせる）。

### 3.2 式の言語

- **自前の小さな構文解析器**（`shared/expr.ts`。`eval`・`Function` は使わない。CSP の `script-src 'self'` も守れる）。
- 使えるもの: 数値、指標の ID（`income.yield` のように登録表の ID）、`+ - * /`、括弧、比較は無し（条件はスクリーナーでかける）、関数 `min(a,b)`・`max(a,b)`・`abs(a)`・`log(a)`。
- 解析の結果は AST にして保存の前に検証する: 知らない ID・`compute` を参照する ID（循環を避けるため、式は市場データの指標と保有の指標だけを参照できる）・ゼロ除算は実行時に欠損（null）。
- 評価は 2,000 銘柄 × 式 10 個で 50ms 以内を目標にする（AST を一度だけクロージャに変換して使う）。

### 3.3 画面

- コマンドバー「指標を式で作る…」→ 名前 → 式（入力中に候補の ID を出す）→ 型。
- 設定に「式の指標」の一覧（編集・削除。削除した式を使うスクリーンの条件は FR-SC11 のとおり無効になる）。

---

## 4. メモ・タグ（notes ペイン）

- §4 の `UserInstrumentData`（`tags?`・`note?`）を利用者のデータ `instruments.json` に `Record<InstrumentId, { tags?: string[]; note?: string; updated: number }>` として持つ。`holdings` は P2 で別ファイルにしたので、ここには置かない（§4 の記述を直す）。
- notes ペイン: リンクグループの銘柄のメモ（Markdown のプレーンテキスト。描画はしない）とタグ。Enter で編集、Esc で保存して抜ける。
- タグは指標の登録表に `user.tag`（`enum`、`source: { kind: 'user', key: 'tag' }`）として足し、スクリーナー・列で使えるようにする。
- 一覧の行の名前の横に、メモがある印（✎）を出す。

---

## 5. 描画ツール（FR-C8）

- 種類: 水平線（価格）・トレンドライン（2 点）・価格帯（2 つの価格）。
- 保存: `drawings.json` に `Record<InstrumentId, Drawing[]>`。点は **日付と分割調整済みの価格** で持つ（時間軸を替えても同じ所に出る。週足・月足ではその日付を含む足に合わせる）。
- 描画: Lightweight Charts の Series Primitives（`ISeriesPrimitive`）で 1 つのプリミティブがその銘柄の全図形を描く。
- キー: チャートで `H`（水平線を今の十字線の価格に置く）、`Shift+T`（トレンドライン: X の十字線で始点・終点を選ぶ）、`B`（価格帯）、`Delete`（選んだ図形を消す）、`[` `]`（図形を選ぶ）。マウスでも置ける（FR-KB4 の逆。キーの代替を先に作る）。
- 価格の調整を「未調整」にしたときは、分割係数で図形も戻す（`series.ts` の係数を使う）。

---

## 6. 価格アラート（FR-C10）

詳しい仕様・設計は [design-alerts.md](design-alerts.md)（requirements.md §6.14）。ここにあった固定の種類の案（`above` / `below` など）は、スクリーナーの条件をそのまま使う形に置き換えた。

---

## 7. チャートの PNG 書き出し・コピー（FR-C11）

実装は保存だけ（コピーは持たない）。データは Yahoo Finance のもので、画像の公開は再配布にあたり得るため、**設定の「チャート」で ON にしたときだけ**使える（`Settings.chartSave`、既定 OFF）。

- `IChartApi.takeScreenshot(true, false)`（プリミティブは入れ、十字線は入れない）で Canvas を得る（`ChartView` の `snapshot()`）。凡例（HTML）は入らないので、
  「コード 銘柄名 · 時間軸」と見えている期間の 1 行を上に描き足してから PNG にする（`lib/chartImage.ts`）。
- 保存は main の IPC `app:savePng`（`saveText` と同じく保存ダイアログを main が出す。renderer から任意のパスには書かせない。PNG の印で始まらないものは書かない）。
- 入口: チャートの見出しのボタン（指標の右。狭いと表示期間より先に隠し、「⋯」の「画像を保存」に残る）と、チャートのペインの単キー **S**。OFF のときはどれも出さず、S も効かない。

---

## 8. 別ウィンドウ（FR-L7）

詳しい仕様・設計は [design-multimonitor.md](design-multimonitor.md)（こちらを優先する）。

### 8.1 形

- `LayoutDoc` を版 2 にし、`windows: { id: string; entry: LayoutEntry; bounds: Rect; display?: string }[]` を足す。メインのウィンドウは今の `entries`。
- main がウィンドウを作り、各ウィンドウに **自分の MessagePort** を渡す（Core とは直結。main を通さない設計を保つ）。Core は複数のポートを持ち、イベントはすべてのポートに送る。
- 利用者のデータ（ウォッチリスト・設定など）は Core が持っているので、変更は Core のイベント `user.changed` で全ウィンドウに配る（今は renderer が自分で持ち、保存だけ Core に投げている。→ **renderer の状態を Core のイベントで同期する形に変える**のが一番大きな変更）。

### 8.2 操作

- コマンドバー「ペインを別ウィンドウに出す」（フォーカス中のペイン）・「ウィンドウを本体に戻す」。
- リンクグループはウィンドウをまたいで働く（`layout.doc.links` も Core のイベントで同期）。
- 閉じたディスプレイの位置にあるウィンドウは、起動時にメインのディスプレイに戻す（`screen.getAllDisplays()`。NFR-Q8 と同じ）。

### 8.3 リスク

- 状態の同期の作り替えが大きい。先に「ウォッチリスト・設定・スクリーン・レイアウトのリンク」を Core のイベントで配る形にし（1 ウィンドウのままで入れられる）、そのあとでウィンドウを増やす。

---

## 9. 外部のデータ源（J-Quants・EDINET・適時開示）

### 9.1 共通

- **利用者が API キー（またはアカウント）を設定したときだけ** 使う。キーは main の `safeStorage` で暗号化して `userData` に置き（NFR-S2）、Core には起動時に main から渡す（Core はファイルに平文で書かない）。
- 通信先は Core の許可リスト（`worker.ts`）に足す。設定でデータ源ごとに切れる。
- 取得は今の `JobRunner` のジョブの種類を足す（`fundamentals`・`disclosures`）。失敗の分類・レート制御・一時停止は既存のものを使う。
- 取った値は `metrics` とは別の表（`fundamentals`・`forecasts`・`disclosures`）に置き、指標は登録表に `requires: ['fundamentals']` として足す。

### 9.2 J-Quants（予想配当・財務・支払日）

- 使う値: 会社予想の 1 株配当（**予想配当利回り** = 予想配当 ÷ 終値）、決算の実績（EPS・BPS・配当性向）、配当の支払日（FR-H3 の空欄を埋める）。
- プランによって提供の遅れ・期間が違うので、**どのプランで何が取れるかを §12 で確かめてから** 指標を足す。取れない値は欠損として扱う（FR-D9）。
- 予想配当が取れたら、Yahoo の値（P0 で一貫しないと判断）は使わない方針のまま、予想配当利回りの指標 `income.yieldForecast` を足す。

### 9.3 EDINET（有報ベースの財務）

- 有価証券報告書の XBRL から、自己資本比率・ROE・配当性向（実績）などを取る。書類の一覧 API → 書類の取得 → XBRL の解析（必要な要素だけを読む小さな解析器）。
- 取得は四半期に 1 回程度でよいので、ジョブは週に 1 回まで。

### 9.4 適時開示（disclosures ペイン）

- 取得元の候補: TDnet の公開ページ、または J-Quants などの API。**利用規約上、自動取得してよい取得元が確かめられたものだけを使う**（§12）。確かめられなければ、ペインは「開示のページを開く」リンクだけにする（外部リンクは許可リスト、NFR-S3）。
- ペイン: リンクグループの銘柄、またはウォッチリストの銘柄の開示を新しい順に。Enter で開示のページを OS のブラウザで開く。

---

## 10. 手入力・CSV での値の補完、FR-I5、CLI

### 10.1 値の補完

- 新しい表 `overrides(id, field, value, source, updated)`。指標の計算（`computeMetrics`）のあとで上書きする。上書きした値には印を付ける（一覧・symbol-info）。
- CSV の形: `code,field,value`（`field` は metrics の列名）。取り込みの前に件数と内容を見せる（保有の取り込みと同じ流れ）。

### 10.2 FR-I5（J-REIT の一時的な増減をならす）

- 連続増配・非減配の判定に「直近 4 期の中央値との比」を使う方式を足し、設定で選べるようにする（既定は今の暦年合計）。使いながら決める（要求のとおり）。

### 10.3 CLI

- `src/cli/` に、Core の `CoreService` を素の Node で動かす入口を作る（`node:sqlite` は Node 22.5 以降。最低版は Node 24 とする。NFR-A7）。
- コマンド: `elecxstock update`（日々の更新）、`elecxstock screen <スクリーン名> --csv`、`elecxstock export holdings`。データの置き場所はアプリと同じ（`%APPDATA%\elecxstock\data`）。アプリが起動中は書き込みのコマンドを断る（DB のロックとジョブの重複を避ける。`meta` 表に起動中の印を持つ）。
- 配布はアプリのインストール先に `elecxstock-cli.cmd` を置く形（Node は同梱の Electron を `ELECTRON_RUN_AS_NODE=1` で使う）。

---

## 11. 実装の順番（案）

| 段   | 内容                                                           | 理由                                                          |
| ---- | -------------------------------------------------------------- | ------------------------------------------------------------- |
| P3-a | 保有に基づくスクリーニング、式の指標、メモ・タグ、PNG 書き出し | 外部に依存せず、P2 の構造（登録表・利用者のデータ）に足すだけ |
| P3-b | 描画ツール、価格アラート                                       | チャートとジョブに足す。OS の通知の権限まわりを確かめる       |
| P3-c | 利用者のデータの同期を Core のイベントに寄せる → 別ウィンドウ  | 作り替えが大きいので、先に同期だけを入れて安定させる          |
| P3-d | J-Quants・EDINET・適時開示、値の補完、CLI                      | §12 の確認の結果しだいで範囲が変わる                          |

各段の終わりに、要求仕様と照らした確認・E2E（キーボードだけ）・見た目の回帰の基準画像の更新を行う。

---

## 12. 未決事項（実装の前に確かめる）

| 項目                         | 確かめること                                                                               | 関連  |
| ---------------------------- | ------------------------------------------------------------------------------------------ | ----- |
| J-Quants のプラン            | 無料・有料のプランごとに、予想配当・財務・支払日が取れるか、提供の遅れ、リクエストの上限   | §9.2  |
| EDINET API                   | API キーの取得の手順、書類の一覧と XBRL の取得の上限、必要な要素の名前（自己資本比率など） | §9.3  |
| 適時開示の取得元             | 自動取得が利用規約で認められている取得元があるか                                           | §9.4  |
| OS の通知                    | 署名の無いアプリで Windows のトースト通知が出るか（AppUserModelId は設定済み）             | §6    |
| 複数ウィンドウと MessagePort | 1 つの utilityProcess に複数の renderer のポートをつないだときの性能・切断時の扱い         | §8    |
| CLI と DB のロック           | アプリの起動中に CLI が読み取りだけをしたときの WAL の扱い                                 | §10.3 |
