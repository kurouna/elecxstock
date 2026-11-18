# CLAUDE.md

AI エージェント（と人）がこのリポジトリで作業するときの手引き。

elecxstock は、日本株と J-REIT のデータを手元の PC に取り込み、チャートを並べて見比べ、条件で絞り込むための
デスクトップアプリ。Electron 45 + Svelte 5 + TypeScript、MIT。Windows で開発・配布している（macOS・Linux は未検証）。

- 要求仕様: [docs/requirements.md](docs/requirements.md)（要求は `FR-` / `NFR-` の ID で参照する。P1 / P2 / P3）
- 設計判断と実測値: [docs/decisions.md](docs/decisions.md)
- 画面のモック: [docs/mock/](docs/mock/README.md)
- P3 の設計: [docs/design-p3.md](docs/design-p3.md)・アラート: [docs/design-alerts.md](docs/design-alerts.md)・ポートフォリオ: [docs/design-portfolio.md](docs/design-portfolio.md)・マルチモニタ: [docs/design-multimonitor.md](docs/design-multimonitor.md)・マイレイアウト: [docs/design-mylayouts.md](docs/design-mylayouts.md)・常駐と自動起動: [docs/design-background.md](docs/design-background.md)・ニュース: [docs/design-news.md](docs/design-news.md)（フィードの一覧: [docs/news-feeds.md](docs/news-feeds.md)）・最大化とタブの動き: [docs/design-motion.md](docs/design-motion.md)・チャートの描画（トレンドライン）: [docs/design-drawings.md](docs/design-drawings.md)・配当シミュレータ（設計案）: [docs/design-simulator.md](docs/design-simulator.md)
- 保有の JSON の形式: [docs/holdings-format.md](docs/holdings-format.md)
- **テストの作り（層・部品・きまり・手順）: [docs/testing.md](docs/testing.md)**（計画と経緯: [docs/test-plan.md](docs/test-plan.md)）

仕様にある振る舞いを変えるときは、先に requirements.md の該当する ID を読み、変えたら requirements.md も直す。

## コマンド

```bash
npm ci                 # 依存の導入（postinstall で Electron の本体を落とす）
npm run dev            # electron-vite の開発サーバー + アプリ
npm run verify         # lint（Biome）+ 型検査（tsc / svelte-check）+ 単体・結合テスト（Vitest）+ 要求の ID の突き合わせ
npm run test:fast      # 純粋な関数・登録表だけ（数秒。書きながら回す）
npm run coverage       # カバレッジとフォルダごとの下限（CI の unit ジョブ）
npm run trace -- --list  # テストの無い要求の ID
npm run build          # out/ に製品版のバンドル（E2E はこれに対して動く）と THIRD_PARTY_NOTICES.txt
npx playwright test    # E2E（スタブのプロバイダ・使い捨ての userData。キーボードだけで操作する）
npm run package        # Windows のインストーラ（release/）
npm run test:packaged  # パッケージした exe を CDP で一度起動して描画を確かめる
LIVE=1 npm run contract  # 実際の Yahoo・JPX とニュースのフィードに対する契約テスト（ネットワークを使う）
npm run gen:screenshots  # README 用のスクリーンショット（スタブのデータ）
npm run gen:fields-doc   # docs/screener-fields.md（スクリーナーの項目の一覧）を指標の登録表から作る
npm run gen:news-feeds-doc  # docs/news-feeds.md（ニュースのフィードの一覧）を resources/news/feeds.json から作る
npm run demo:0.1.9     # 版ごとのデモ（録画は利用者が行う。下の「デモ」）
npm run gen:icon       # build/icon.svg から PNG・ICO
```

開発中にネットワークを使わずに動かすときは `ELECXSTOCK_PROVIDER=stub`（架空の値）、データの置き場所を分けるときは
`ELECXSTOCK_USER_DATA=<フォルダ>` を付ける。時刻を固定するときは `ELECXSTOCK_NOW=2026-11-13T18:00:00+09:00`（スタブのときだけ効く。テストの基準日時）。
サインイン時の起動は開発版では登録されない（electron.exe を登録してしまうため）。確かめるときは `npm run package` の `release/win-unpacked/elecxstock.exe` を使う（`--hidden`・`--quit` も付けられる）。

## 構成

| 場所                                          | 役割                                                                                                                                                                                                                                                       |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/`                                   | Core。Electron の utilityProcess で動く純 TS（**`electron` を import しない**。NFR-A1、Biome で禁止）。SQLite（`node:sqlite`）・取得ジョブ・指標・スクリーナー・利用者データ・保有（`holdings.ts`）・アラート（`alerts.ts`）・資産推移の記録（`folio.ts`） |
| `src/core/providers/`                         | データ源。`yahoo.ts`（yahoo-finance2）・`jpx.ts`（上場銘柄一覧の xlsx）・`stub.ts`（テスト用）                                                                                                                                                             |
| `src/shared/`                                 | 全プロセス共通の型・API の契約（`api.ts`: メソッド名と zod スキーマ）・指標の登録表（`fields.ts`）・営業日（`calendar.ts`）                                                                                                                                |
| `src/main/index.ts`                           | 薄い main。ウィンドウ（1 枚目 + フリー 2〜4）・安全策・Core の起動と、renderer と Core を窓ごとの MessagePort でつなぐ。窓をまたぐリンクのバス。位置の計算は `placement.ts`（純関数）。常駐（通知領域）・サインイン時の起動は `background.ts`              |
| `src/preload/index.ts`                        | `window.elecxstock` だけを出す                                                                                                                                                                                                                             |
| `src/renderer/`                               | Svelte 5 の画面。`stores/`（状態・レイアウト）、`lib/commands.ts`（アクションとキー操作）、`lib/columns.ts`（一覧の列）、`lib/chartMenu.ts`・`lib/indicators.ts`（チャート）、`components/widgets/`（ペイン）                                              |
| `tests/unit` / `tests/e2e` / `tests/contract` | Vitest / Playwright（`_electron`）/ 実プロバイダ                                                                                                                                                                                                           |

## 守ること

- **renderer は Core に `bridge.call(method, params)` だけで話す**。メソッドを足すときは `src/shared/api.ts` の
  `PARAMS`（zod）と `Results` を足し、`src/core/service.ts` に実装する。Core はすべての入力を zod で検証する。
- **Svelte の状態（Proxy）は構造化複製できない**。Core への呼び出し（`call`・`prioritize`）は `stores/app.svelte.ts` の
  `bridge` / `rpc` を通す（送る前にスナップショットにする）。`window.elecxstock.call` を直接呼ばない。main の機能
  （ファイルの保存・ダイアログ・窓の操作・窓どうしのバス）は `window.elecxstock` の各メソッドを呼んでよいが、Svelte の状態を
  そのまま渡さない（`$state.snapshot` などで素の値にする）。
- **指標は `src/shared/fields.ts` の登録表に足す**（FR-FD1〜FD5）。画面（条件エディタ・列・並べ替え）は登録表から作る。
  市場データだけで決まる指標は `metrics` 表の列（`METRIC_COLUMNS`）と `src/core/metrics.ts` の計算を足す。
  登録表の整合は `tests/unit/registry/` が確かめる（指標の性質の表はスナップショット）。条件を選ぶダイアログ（`overlays/FieldPicker.svelte`）の分類は `GROUP_OF`、
  単位・別名・説明は `UNIT_OF`・`ALIAS_OF`・`DESC_OF`、相対条件の相手は同じ `refGroup` だけ。実行時に計算する指標（保有・予定までの日数）は
  `src/shared/compute.ts` の `COMPUTE_KEYS` と `computeValue` に足す（スクリーナーと結果表の列が共有する）。1 株あたりの金額（円で表し、
  分割で換算する）かは `perShare(f)`（単位で見分ける。売買代金は category が price でも億円）、打つときの単位は `moneyScale(f)`。
- **価格は分割調整済みで保存する**（Yahoo の値のまま）。未調整・配当込みは表示時に計算する（FR-D2）。
  `adjclose` は保存しない。分割を検知したら全期間を取り直す（FR-D3）。
- **取得に成功してから置き換える**（FR-S11）。消してから取り直すのは、利用者が明示した全データの削除だけ。
- **日付は日本時間の `YYYY-MM-DD`**（FR-T1）。営業日は `src/shared/calendar.ts`。PC の時刻帯に依存させない。
- **日足の保存期間の始まりは `retentionStart()`（`src/shared/calendar.ts`）だけで決める**（取得と削除の境をそろえる。N 年の指標に足りるよう 31 日の余裕を足している。既定は 3 年・FR-D6）。
- **キー操作はアクションの登録表（`lib/commands.ts` の `ACTIONS` と `handleKey`）に足す**。単キーは `KeyboardEvent.code`
  で判定し、IME の変換中は無視する（FR-KB5）。マウスでしかできない操作を作らない（FR-KB4）。キーを変えたら
  F1 の一覧（`components/overlays/Help.svelte`）と requirements.md §6.5 も直す。
- **アクションのキーは `ACTIONS` の `key`（既定）で持ち、照合は `keyOf()` を通す**（設定 `keymap` の上書きがあるため。FR-KB6）。
  ペインの中の単キーは各ペインの `key()` で持つ（割り当ては変えられない）。
- **ペインのキー処理は `registerPane(id, { key, current, receive, selected, columns, run })`** で登録する（`lib/panes.ts`）。
  一覧のペインは `columns()` を返すと、CSV 書き出し・一覧の取り直しが使える。ペインを足したら `stores/layout.svelte.ts` の
  `WIDGETS`・`components/Pane.svelte`・i18n の `widget.*` に足す。
- **一覧の列は `lib/columns.ts`**（登録表の指標から作る）。行のセルは `widgets/RowCells.svelte`。
- **アラート**（[docs/design-alerts.md](docs/design-alerts.md)）: 判定は Core（`src/core/alerts.ts` と `service.evaluateAlerts`。取得のジョブの終わりに 1 回）。
  条件・分割の換算・距離などの純粋な関数は `src/shared/alerts.ts`（Core とダイアログが共有）。条件はスクリーナーの `Condition` で、
  指標や比べ方を別に作らない。定義は利用者のデータ（`alerts.json`）、判定の状態と履歴は `AlertBook`（世代なし・書き出しの対象外）。
  ★・ウォッチリスト・保有・スクリーンを書くメソッドを足したら、`service.ts` の `SCREEN_REBASE` にも足す（スクリーンのアラートが
  利用者の操作で鳴らないように基準を取り直す）。通知の文言は 1 枚目の renderer が作る（Core は文言を持たない）。
- **保有の計算（移動平均法・分割の調整）は Core の `holdings.ts`**。保有の JSON の形式を変えたら `docs/holdings-format.md` も直す。
- **設定の項目を足すときは 3 か所**: `src/shared/types.ts` の `Settings`・`src/shared/api.ts` の `settingsSchema`・`src/shared/settings.ts` の `DEFAULT_SETTINGS`。
  読み込みは既定値との浅いマージなので、入れ子にせず平たい項目にする（保存済みの設定ファイルを読めなくしない）。画面は `overlays/Settings.svelte` のタブ
  （一般・表示・チャート・データ・キー・このアプリについて）。打った値の読み取り・検証は `src/shared/` の関数にする（例: `yieldLines.ts` の `targetsFromInputs`）。
- **チャートの水平線**（アラートのしきい値・目標利回り FR-C12）は `ChartView.svelte` の `createPriceLine` で、作り直し（`build()`）のたびに引き直す。
  グリッドのタイルは Lightweight Charts ではなく `gridDraw.ts`（2D Canvas）なので、チャートに線や印を足したらタイルにも要るか考える。目標利回りの株価は `src/shared/yieldLines.ts`。
- **一覧の選択は行の位置ではなく中身（銘柄などのキー）で持つ**（`lib/selection.ts` の `SelectionFollow`）。取得で値が変わって並びが入れ替わっても、選んだ銘柄から
  動かさない。並べ替え・一覧の切り替えのように先頭へ戻すときだけ `reset()`。取得の知らせの指標は `stores/app.svelte.ts` の `applyDataUpdated` で、新しい値が届いてから置き換える（先に消さない）。
- **`patchState` は `pane.state` を丸ごと置き換える**。`$effect` で `pane.state.X` や、毎回作り直す `Set`・配列を直に読むと、関係のない変更でも走る
  （選択や表示の範囲が戻る）。`$derived` で値や中身のキー（`[...set].join()` など）にしてから読む。
- **選んだときだけ出す行（キーの案内など）は出し入れせず、場所を取ったまま見えなくする**（`visibility: hidden`）。カードの高さが変わると、ツリーマップなどが並び直す。
- **ペインの最大化・戻すは `lib/paneMax.ts` の `setMaximized`（動きあり）か `clearMaximized`（動きなし）を通す**（`app.maximized` を直に書かない。タブ・ページの切り替えと、ペインを閉じる・動かすときに `layout.svelte.ts` が消すのは例外。FLIP の動き。FR-L3・FR-V9）。
  動きの時間は app.css のトークン（`--motion-max` など）で、動きを減らすときは 0ms。canvas の大きさを `getBoundingClientRect` で決めない（飛んでいる間は transform で縮んでいる。`gridDraw.ts` の `tileSize`）。
  タブの下線は `lib/ink.ts`（`use:ink`）、タブの中身が入ってくる動きは `playIn`（Workspace・Dock）。最大化の動きは transform だけ（z-index・影は別の動き）にする。
  Dock はレイアウトのタブをまたいで使い回されるので、ドロワーの動きは持ち主（`identity(dock)`）とペインの ID で判断する。全画面（F11）は main の `win:fullscreen`（権限の要求はすべて拒否しているので、renderer の `requestFullscreen` は使えない）。
- **表示倍率はルートの CSS の `zoom`**（FR-V10）。`getBoundingClientRect`・`clientX` は倍率が掛かった px、`clientWidth`・`offsetWidth`・style の px は掛かっていない。混ぜずに `lib/pointer.ts`（`localX`・`tipBeside`・`rootZoom`）でそろえる。
- **レイアウトの木の変更は `stores/layout.svelte.ts` の関数で行う**。ディスクから読んだ木は `normalizeDoc` を通す。
  マイレイアウト（8 番目のタブ）のページの正は `layout.pages`（layouts.json）で、`doc.entries.free` は表示中のページの作業用の写し。
  すべてのレイアウトを回す処理は `doc.entries` ではなく `allEntries()`（表示中でないページも含む）を回す。写すときは `cloneEntry` で ID を振り直す
  （[docs/design-mylayouts.md](docs/design-mylayouts.md)）。
- **文言は `lib/i18n.ts` の `ja` と `en` の両方に足す**（キーの一致は単体テストが確かめる）。保存した条件の組は、`ja` では「スクリーニング条件」と書く（「スクリーン」は画面と読まれる。コード・文書・`en` は screen／スクリーンのまま。requirements.md §5.2）。
- **色・文字・余白は `app.css` のトークン（CSS 変数）から取る**。陽線・陰線は `--up` / `--down`（日本式が既定）。
- 依存はすべて `devDependencies` に置き、バンドルに入れる（yahoo-finance2 の MCP 用の依存を配布物に入れないため）。
  バンドルに入る OSS を足したら `scripts/gen-notices.mjs` の `bundled` にも足す。GPL 系は入れない（`scripts/check-licenses.mjs`）。
- 通信先は Core の許可リスト（`src/core/netGuard.ts` の `ALLOWED_HOSTS`。`worker.ts` が `globalThis.fetch` を `guardFetch` で差し替える。リダイレクトの行き先も確かめる）だけ。renderer の CSP は `connect-src 'none'`。
- **ニュース**（[docs/design-news.md](docs/design-news.md)。FR-NW1〜NW9）: コードは `news/` のフォルダ（`src/shared/news/`・`src/core/news/`・`src/main/news/`・`src/renderer/news/`・`tests/unit/news/`）に閉じ、
  既存のファイルへの差し込みは設計 §11 の箇所だけ（`tests/unit/news/registry.test.ts` が import を読んで確かめる。差し込みを足したら `GATES` にも足す）。
  - フィードは `resources/news/feeds.json`（asar の中）にだけ足す。直したら `npm run gen:news-feeds-doc`（docs/news-feeds.md）。既定でオンにできるのは規約を確かめたフィードだけ（`terms.checked`）。規約の調査と判断は docs/news-feeds-terms.md（フィードを足す・既定でオンにするときは、規約を読んでここに書き、`terms` に URL と日付を入れる）。候補を選んだ記録は docs/news-feeds-notes.md。
  - 通信は `worker.ts` が作るニュースの専用の fetch（`guardFetch` に述語。オンのフィードのホストだけ）。`src/core/news/` は `globalThis.fetch` に触れない。既存の許可リストにフィードのホストを足さない。
  - 未回答・オフ・管理者の停止（レジストリ・`ELECXSTOCK_NEWS=off`）では fetch を 1 回も呼ばない。ペインが見えている間（renderer の `news.watch`）だけ取る。
  - 翻訳はしない。見出しは文字として描き（`{@html}` を使わない）、コピーは `window.elecxstock.copyText`（main の `app:copyText`）。Ctrl+C・Ctrl+Alt+C は全体のアクションに割り当てない（`lib/keys.ts` の `PANE_RESERVED`）。
  - ニュースの設定・キャッシュは `data/news/`（アプリの `Settings`・DB・利用者のデータの JSON には入れない）。スタブのプロバイダのときは `src/core/news/stub.ts` の架空の見出しを返す。E2E の種はニュースを「取る」で答えた状態（`tests/e2e/support/global-setup.ts`）。
- **マルチモニタ**（[docs/design-multimonitor.md](docs/design-multimonitor.md)）: 2 枚目以降はタブなしの「フリー 2〜4」。窓の種類は
  `lib/windowSlot.ts`（`SLOT`・`IS_FREE`・`FREE_WIDGETS`・`blockedInFree`）。利用者のデータの持ち主は 1 枚目で、フリー N は読むだけ
  （★・◆は Core の `watchlists.toggleItem`、アラートは新しく作ることだけ `alerts.save`、チャートの描画は `drawings.*` で 1 本ずつ書ける）。Core は利用者のデータを変えたら `user.changed` を全窓に配るので、利用者のデータを書く
  メソッドを足したら `src/core/changes.ts` の `CHANGES` にも足す。フリー N のレイアウトは `user.saveWindowLayout` で自分の分だけ保存する。
  フリー N で使えない操作を足したら `blockedInFree` に足す。
- **常駐と自動起動**（[docs/design-background.md](docs/design-background.md)）: 判断は `src/shared/background.ts` の純粋な関数、実行（窓の出し入れ・トレイ・
  サインイン時の起動）は `src/main/background.ts`。main は `closeToTray` を settings.json から判断のたびに読む（renderer から設定を送らない）。サインイン時の起動と
  「通知領域に入れておく」は settings.json に持たず、Windows の Run キーが正。**窓を戻す処理は `background.reveal()` だけを通す**（トレイ・二度目の起動・通知のクリック）。
  隠れている窓の位置は記録しない（`rememberWin`）。窓を前に出す経路や、終了の流れ（`before-quit`）を足したら、しまっている窓と `quitting` を考える。
  E2E は `ELECXSTOCK_BACKGROUND_STUB=1`（`globalThis.__elecxstockBackground`）で、実際のタスクバー・レジストリに触れない。
- **elecxstock-cli**（[kurouna/elecxstock-cli](https://github.com/kurouna/elecxstock-cli)。このアプリのデータをターミナルで読むだけの CUI）は、
  このリポジトリをサブモジュールとしてタグに固定して使う。次を変えたら、elecxstock-cli も直す必要が出ることがある（リリースのノートに書き、
  elecxstock-cli 側でサブモジュールのタグと `DB_VERSION` を上げて突き合わせのテストを通す）:
  DB の表・列・移行（`user_version`。`metrics` の列を含む）、利用者のデータの JSON の形（`USER_FILE_SCHEMAS`・`STORE_VERSION`）、データの置き場所、
  `Repo` の読むメソッド、`CoreService` の材料の組み立て（`folioMarket`・保有・`alertViews`・スクリーナーの入力・`bars`）、`src/renderer/lib/folio.ts` の純粋な関数。

## テスト

- **実装を足す・直すときは、[docs/testing.md](docs/testing.md) のテストアーキテクチャに基づき、テストを必ず足す・直す**。手順（testing.md §6）:
  1. 変える要求の ID を requirements.md で確かめる。
  2. 不具合を直すときは、**先に再現するテストを書いて落ちることを確かめてから**直す。
  3. 当てはまる層（L1 純粋な関数・L2 登録表・L3 Core の結合・L4 画面のロジックの結合・L5 E2E）と観点（境界・欠損・単位・状態の変化・初期状態・時間の経過など）を選んで足す。
     下の層で確かめられることを上の層に上げない。
  4. 同じ作りの箇所（スクリーナーとアラートのダイアログ、Screener・ChartGrid・Watchlist など）を検索し、同じ関数にまとめるか同じテストを足す。
  5. `npm run verify` と、画面を変えたら `npm run build` のあと `npx playwright test` を通す。基準（要求の ID・カバレッジ）が良くなったら更新する。
- **コンポーネント（`.svelte`）に計算・変換・判定を書かない**。`src/shared/` か `src/renderer/lib/` の関数にしてテストする（例: 条件の値の入力と表示は
  `src/shared/conditionInput.ts`、スクリーンを走り直させる状態は `stores/app.svelte.ts` の `screenInputs()`）。
- テストの `describe` の名前に要求の ID を入れる（`npm run trace` が突き合わせる）。テストで確かめない要求は `tests/trace-exempt.json` に理由を書く。
- renderer からの要求の処理（窓の制限・zod の検証・変更の通知）は `src/core/dispatch.ts`。worker と結合のテストが共有する。

- **テスト・デモ・スクリーンショットのデータはすべて架空**（実際の市場データは権利関係があるため使わない・コミットしない）。
  スタブ（`src/core/providers/stub.ts`）とモック（`docs/mock/mock-data.js`）は、銘柄名とコードだけ実在で、株価・利回り・配当・権利月・分割は
  乱数や実際と無関係な値にする。契約テスト（`LIVE=1`）で取った値も保存しない。

- 新しい計算・判定には単体テストを書く（評価日を固定したフィクスチャで。`tests/support/fixtures.ts`。例: `tests/unit/core/metrics.test.ts`）。
- 見た目の回帰（`tests/e2e/visual.spec.ts`）はダイアログの要素を基準画像と比べる。意図して見た目を変えたら
  `npx playwright test visual --update-snapshots` で基準画像を作り直し、差分を目で確かめてからコミットする。
- 画面の振る舞いは E2E で、**キーボードだけで**確かめる。プロバイダはスタブ、時刻は `ELECXSTOCK_NOW`（基準日時）。固定の待ちを足さない。
- E2E とスクリーンショットは `npm run build` のあとに動かす（out/ を起動する）。E2E を流している間に `npm run build` しない（ビルドが src/ より古いと E2E は始まらない）。
- キャンバスの中（チャートの線・タイル）は読めないので、凡例の文字か、描いたものを出す `data-*`（グリッドのタイルの `canvas[data-yield]`）で確かめる。
  スタブには境界を試す銘柄がある（8002 は無配に転じた・1605 は上場 12 か月未満。`stub.ts` の `EDGE`）。
- 最大化・タブの切り替えには動きがある（docs/design-motion.md）。E2E で矩形を読む前は `motionDone`（`tests/e2e/support/ops.ts`）で動きの終わりを待つ（`tab()` は待つ）。
  動きそのものを確かめるときは、時間のトークン（`--motion-max` など）を `addStyleTag` で延ばすか、`getAnimations()` を止めて測る。スクリーンショット・デモの撮影は `animations: 'disabled'`。
- マウスの位置に頼らない。CI のマシンでは実際のカーソルが窓の上にあると十字線や hover の値が変わるので、`ci.yml` で E2E の前にカーソルを窓の外へ動かし、
  `tests/e2e/support/launch.ts` も窓が出てからテストのマウスを角へ置いている。

## デモ

リリースの紹介動画のためのデモのスクリプト（`scripts/demo*.mjs`）。**録画は利用者がキャプチャアプリで行う**ので、スクリプトはアプリを動かして見せるところまで。

- 版ごとに `scripts/demo-v<版>.mjs` を作り、package.json に `"demo:<版>"` を足す（例: `demo-v0.1.1.mjs` と `npm run demo:0.1.1`）。前の版から変わったところを、話題ごとに場面にする。初めての紹介は `scripts/demo.mjs`（`npm run demo`）。
- ポートフォリオの架空の保有と資産推移は `scripts/folio-fixture.mjs`（デモとスクリーンショットが共有する。ポートフォリオだけ撮り直すのは `node scripts/gen-screenshots.mjs folio`）。
- 字幕・押したキー・タイトルと終わりの画面は `scripts/demo-kit.mjs` の `overlay`・`caption`・`card`・`press`・`shot` を使う（画面に重ねるだけで、アプリには入れない）。
- 作り方:
  1. 1 回目の起動で、初回の取り込みと架空のウォッチリスト・保有を入れて閉じる（録画しない）。2 回目の起動がデモ。
  2. スタブのプロバイダ・使い捨ての userData・`ELECXSTOCK_NOW`（テストの基準日時）で起動する。日付や「あと N 日」が録り直しても同じになる。
  3. 操作は**キーだけ**で進め、場面ごとに字幕で何をしているかを出す。待ちは固定の時間ではなく、出てくる要素を `waitFor` で待つ（遅い PC でもずれない）。
  4. 最初と最後に、版と話題・「値はすべて架空」の注意を出す。左下にも架空の値の注意を出し続ける（`overlay` が出す）。
- 環境変数: `DEMO_SIZE`（窓の中身の大きさ。既定は最大化）・`DEMO_WAIT`（タイトルを出してから始めるまでの秒数。録画を始める間）・
  `DEMO_SPEED`（速さの倍率）・`DEMO_SHOTS=<フォルダ>`（場面ごとのスクリーンショット）・`DEMO_EXIT=1`（終わったら閉じる）。
- **作ったら、録画の前に必ず通しで動かして確かめる**: `npm run build` のあと
  `DEMO_SHOTS=<フォルダ> DEMO_EXIT=1 DEMO_WAIT=0 DEMO_SPEED=2 DEMO_SIZE=1600x960 node scripts/demo-v<版>.mjs` を実行し、場面ごとのスクリーンショットを見て、
  字幕どおりの画面になっているか（ダイアログが開いた・値が変わった・ペインが変わった）を確かめる。選択肢のダイアログのように打っても絞り込めない画面は、↓ で送る。
- 画面の作り（並び・文言・キー）を変えたら、デモのスクリプトも動くか確かめる（E2E には入っていない）。

## コミット

- commitlint の形式（`type(scope): subject`）で、英語と日本語を `/` で区切って併記する。
- `main` へのプッシュで CI（`.github/workflows/ci.yml`）が走る。`v*` のタグでインストーラを GitHub Releases に公開する。
