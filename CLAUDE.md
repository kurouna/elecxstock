# CLAUDE.md

AI エージェント（と人）がこのリポジトリで作業するときの手引き。

elecxstock は、日本株と J-REIT のデータを手元の PC に取り込み、チャートを並べて見比べ、条件で絞り込むための
デスクトップアプリ。Electron 45 + Svelte 5 + TypeScript、MIT。Windows で開発・配布している（macOS・Linux は未検証）。

- 要求仕様: [docs/requirements.md](docs/requirements.md)（要求は `FR-` / `NFR-` の ID で参照する。P1 / P2 / P3）
- 設計判断と実測値: [docs/decisions.md](docs/decisions.md)
- 画面のモック: [docs/mock/](docs/mock/README.md)

仕様にある振る舞いを変えるときは、先に requirements.md の該当する ID を読み、変えたら requirements.md も直す。

## コマンド

```bash
npm ci                 # 依存の導入（postinstall で Electron の本体を落とす）
npm run dev            # electron-vite の開発サーバー + アプリ
npm run verify         # lint（Biome）+ 型検査（tsc / svelte-check）+ 単体テスト（Vitest）
npm run build          # out/ に製品版のバンドル（E2E はこれに対して動く）と THIRD_PARTY_NOTICES.txt
npx playwright test    # E2E（スタブのプロバイダ・使い捨ての userData。キーボードだけで操作する）
npm run package        # Windows のインストーラ（release/）
npm run test:packaged  # パッケージした exe を CDP で一度起動して描画を確かめる
LIVE=1 npm run contract  # 実際の Yahoo・JPX に対する契約テスト（ネットワークを使う）
npm run gen:screenshots  # README 用のスクリーンショット（スタブのデータ）
npm run gen:icon       # build/icon.svg から PNG・ICO
```

開発中にネットワークを使わずに動かすときは `ELECXSTOCK_PROVIDER=stub`（架空の値）、データの置き場所を分けるときは
`ELECXSTOCK_USER_DATA=<フォルダ>` を付ける。

## 構成

| 場所                                          | 役割                                                                                                                                                                         |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/`                                   | Core。Electron の utilityProcess で動く純 TS（**`electron` を import しない**。NFR-A1、Biome で禁止）。SQLite（`node:sqlite`）・取得ジョブ・指標・スクリーナー・利用者データ |
| `src/core/providers/`                         | データ源。`yahoo.ts`（yahoo-finance2）・`jpx.ts`（上場銘柄一覧の xlsx）・`stub.ts`（テスト用）                                                                               |
| `src/shared/`                                 | 全プロセス共通の型・API の契約（`api.ts`: メソッド名と zod スキーマ）・指標の登録表（`fields.ts`）・営業日（`calendar.ts`）                                                  |
| `src/main/index.ts`                           | 薄い main。ウィンドウ・安全策・Core の起動と、renderer と Core を MessagePort でつなぐ                                                                                       |
| `src/preload/index.ts`                        | `window.elecxstock` だけを出す                                                                                                                                               |
| `src/renderer/`                               | Svelte 5 の画面。`stores/`（状態・レイアウト）、`lib/commands.ts`（アクションとキー操作）、`components/widgets/`（ペイン）                                                   |
| `tests/unit` / `tests/e2e` / `tests/contract` | Vitest / Playwright（`_electron`）/ 実プロバイダ                                                                                                                             |

## 守ること

- **renderer は Core に `bridge.call(method, params)` だけで話す**。メソッドを足すときは `src/shared/api.ts` の
  `PARAMS`（zod）と `Results` を足し、`src/core/service.ts` に実装する。Core はすべての入力を zod で検証する。
- **Svelte の状態（Proxy）は構造化複製できない**。`stores/app.svelte.ts` の `bridge` が送る前にスナップショットにするので、
  `window.elecxstock` を直接呼ばない。
- **指標は `src/shared/fields.ts` の登録表に足す**（FR-FD1〜FD5）。画面（条件エディタ・列・並べ替え）は登録表から作る。
  市場データだけで決まる指標は `metrics` 表の列（`METRIC_COLUMNS`）と `src/core/metrics.ts` の計算を足す。
  登録表の整合は `tests/unit/fields.test.ts` が確かめる。
- **価格は分割調整済みで保存する**（Yahoo の値のまま）。未調整・配当込みは表示時に計算する（FR-D2）。
  `adjclose` は保存しない。分割を検知したら全期間を取り直す（FR-D3）。
- **取得に成功してから置き換える**（FR-S11）。消してから取り直すのは、利用者が明示した全データの削除だけ。
- **日付は日本時間の `YYYY-MM-DD`**（FR-T1）。営業日は `src/shared/calendar.ts`。PC の時刻帯に依存させない。
- **キー操作はアクションの登録表（`lib/commands.ts` の `ACTIONS` と `handleKey`）に足す**。単キーは `KeyboardEvent.code`
  で判定し、IME の変換中は無視する（FR-KB5）。マウスでしかできない操作を作らない（FR-KB4）。キーを変えたら
  F1 の一覧（`components/overlays/Help.svelte`）と requirements.md §6.5 も直す。
- **ペインのキー処理は `registerPane(id, { key, current, receive, selected })`** で登録する（`lib/panes.ts`）。
- **レイアウトの木の変更は `stores/layout.svelte.ts` の関数で行う**。ディスクから読んだ木は `normalizeDoc` を通す。
- **文言は `lib/i18n.ts` の `ja` と `en` の両方に足す**（キーの一致は単体テストが確かめる）。
- **色・文字・余白は `app.css` のトークン（CSS 変数）から取る**。陽線・陰線は `--up` / `--down`（日本式が既定）。
- 依存はすべて `devDependencies` に置き、バンドルに入れる（yahoo-finance2 の MCP 用の依存を配布物に入れないため）。
  バンドルに入る OSS を足したら `scripts/gen-notices.mjs` の `bundled` にも足す。GPL 系は入れない（`scripts/check-licenses.mjs`）。
- 通信先は Core の許可リスト（`src/core/worker.ts`）だけ。renderer の CSP は `connect-src 'none'`。

## テスト

- 新しい計算・判定には単体テストを書く（評価日を固定したフィクスチャで。例: `tests/unit/metrics.test.ts`）。
- 画面の振る舞いは E2E で、**キーボードだけで**確かめる（`tests/e2e/keyboard.spec.ts`）。プロバイダはスタブ。
- E2E とスクリーンショットは `npm run build` のあとに動かす（out/ を起動する）。

## コミット

- commitlint の形式（`type(scope): subject`）で、英語と日本語を `/` で区切って併記する。
- `main` へのプッシュで CI（`.github/workflows/ci.yml`）が走る。`v*` のタグでインストーラを GitHub Releases に公開する。
