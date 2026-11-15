# CLAUDE.md

AI エージェント（と人）がこのリポジトリで作業するときの手引き。

elecxstock は、日本株と J-REIT のデータを手元の PC に取り込み、チャートを並べて見比べ、条件で絞り込むための
デスクトップアプリ。Electron 45 + Svelte 5 + TypeScript、MIT。Windows で開発・配布している（macOS・Linux は未検証）。

- 要求仕様: [docs/requirements.md](docs/requirements.md)（要求は `FR-` / `NFR-` の ID で参照する。P1 / P2 / P3）
- 設計判断と実測値: [docs/decisions.md](docs/decisions.md)
- 画面のモック: [docs/mock/](docs/mock/README.md)
- P3 の設計: [docs/design-p3.md](docs/design-p3.md)・アラート: [docs/design-alerts.md](docs/design-alerts.md)
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
LIVE=1 npm run contract  # 実際の Yahoo・JPX に対する契約テスト（ネットワークを使う）
npm run gen:screenshots  # README 用のスクリーンショット（スタブのデータ）
npm run gen:fields-doc   # docs/screener-fields.md（スクリーナーの項目の一覧）を指標の登録表から作る
npm run demo:0.1.1     # 版ごとのデモ（録画は利用者が行う。下の「デモ」）
npm run gen:icon       # build/icon.svg から PNG・ICO
```

開発中にネットワークを使わずに動かすときは `ELECXSTOCK_PROVIDER=stub`（架空の値）、データの置き場所を分けるときは
`ELECXSTOCK_USER_DATA=<フォルダ>` を付ける。時刻を固定するときは `ELECXSTOCK_NOW=2026-11-13T18:00:00+09:00`（スタブのときだけ効く。テストの基準日時）。

## 構成

| 場所                                          | 役割                                                                                                                                                                                                                         |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/`                                   | Core。Electron の utilityProcess で動く純 TS（**`electron` を import しない**。NFR-A1、Biome で禁止）。SQLite（`node:sqlite`）・取得ジョブ・指標・スクリーナー・利用者データ・保有（`holdings.ts`）・アラート（`alerts.ts`） |
| `src/core/providers/`                         | データ源。`yahoo.ts`（yahoo-finance2）・`jpx.ts`（上場銘柄一覧の xlsx）・`stub.ts`（テスト用）                                                                                                                               |
| `src/shared/`                                 | 全プロセス共通の型・API の契約（`api.ts`: メソッド名と zod スキーマ）・指標の登録表（`fields.ts`）・営業日（`calendar.ts`）                                                                                                  |
| `src/main/index.ts`                           | 薄い main。ウィンドウ（1 枚目 + フリー 2〜4）・安全策・Core の起動と、renderer と Core を窓ごとの MessagePort でつなぐ。窓をまたぐリンクのバス。位置の計算は `placement.ts`（純関数）                                        |
| `src/preload/index.ts`                        | `window.elecxstock` だけを出す                                                                                                                                                                                               |
| `src/renderer/`                               | Svelte 5 の画面。`stores/`（状態・レイアウト）、`lib/commands.ts`（アクションとキー操作）、`lib/columns.ts`（一覧の列）、`lib/chartMenu.ts`・`lib/indicators.ts`（チャート）、`components/widgets/`（ペイン）                |
| `tests/unit` / `tests/e2e` / `tests/contract` | Vitest / Playwright（`_electron`）/ 実プロバイダ                                                                                                                                                                             |

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
- **レイアウトの木の変更は `stores/layout.svelte.ts` の関数で行う**。ディスクから読んだ木は `normalizeDoc` を通す。
- **文言は `lib/i18n.ts` の `ja` と `en` の両方に足す**（キーの一致は単体テストが確かめる）。
- **色・文字・余白は `app.css` のトークン（CSS 変数）から取る**。陽線・陰線は `--up` / `--down`（日本式が既定）。
- 依存はすべて `devDependencies` に置き、バンドルに入れる（yahoo-finance2 の MCP 用の依存を配布物に入れないため）。
  バンドルに入る OSS を足したら `scripts/gen-notices.mjs` の `bundled` にも足す。GPL 系は入れない（`scripts/check-licenses.mjs`）。
- 通信先は Core の許可リスト（`src/core/worker.ts`）だけ。renderer の CSP は `connect-src 'none'`。
- **マルチモニタ**（[docs/design-multimonitor.md](docs/design-multimonitor.md)）: 2 枚目以降はタブなしの「フリー 2〜4」。窓の種類は
  `lib/windowSlot.ts`（`SLOT`・`IS_FREE`・`FREE_WIDGETS`・`blockedInFree`）。利用者のデータの持ち主は 1 枚目で、フリー N は読むだけ
  （★・◆は Core の `watchlists.toggleItem`、アラートは新しく作ることだけ `alerts.save`）。Core は利用者のデータを変えたら `user.changed` を全窓に配るので、利用者のデータを書く
  メソッドを足したら `src/core/changes.ts` の `CHANGES` にも足す。フリー N のレイアウトは `user.saveWindowLayout` で自分の分だけ保存する。
  フリー N で使えない操作を足したら `blockedInFree` に足す。

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
- E2E とスクリーンショットは `npm run build` のあとに動かす（out/ を起動する）。

## デモ

リリースの紹介動画のためのデモのスクリプト（`scripts/demo*.mjs`）。**録画は利用者がキャプチャアプリで行う**ので、スクリプトはアプリを動かして見せるところまで。

- 版ごとに `scripts/demo-v<版>.mjs` を作り、package.json に `"demo:<版>"` を足す（例: `demo-v0.1.1.mjs` と `npm run demo:0.1.1`）。前の版から変わったところを、話題ごとに場面にする。初めての紹介は `scripts/demo.mjs`（`npm run demo`）。
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
