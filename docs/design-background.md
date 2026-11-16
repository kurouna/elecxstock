# 常駐と自動起動（設計）

要求は [requirements.md](requirements.md) §6.18（FR-BG1〜BG8）。ウィンドウの作りは [design-multimonitor.md](design-multimonitor.md)。

## 1. 目的と範囲

- **閉じても通知領域に残す**: 1 枚目の × で終わらず、窓を隠して動き続ける。自動の更新（FR-F6）とアラートの通知（FR-AL5）が窓を出していなくても続く。
- **Windows にサインインしたら起動する**: 加えて「起動したら通知領域に入れておく」（窓を出さずに始める）を選べる。
- **範囲外**: 最小化で通知領域へしまうこと、どのアプリからでも効く表示・非表示のショートカット、macOS・Linux（elecxstock は Windows だけを配る）。

elecdex（GPL-3.0）の同じ機能を参考にするが、**コードは写さず考え方だけを使う**（NFR-A6）。

## 2. 方針

- **判断は純粋な関数、実行は main**。判断は `src/shared/background.ts`（main と renderer が共有。L1 で確かめる）。実行（窓の出し入れ・トレイ・
  サインイン時の起動の登録）は `src/main/background.ts`。`src/main/index.ts` からはそこの関数を呼ぶだけにする。
- **すべて既定でオフ**。利用者がはっきり選んだときだけ動く。
- **設定の正は 1 か所ずつ**:
  - 「閉じても残す」（`closeToTray`）は利用者の設定（`settings.json`。Core の持ち物）。
  - 「サインインしたら起動する」と「起動したら通知領域に入れておく」は **Windows の登録（Run キーの値とその引数）が正**で、`settings.json` には持たない。
    タスクマネージャーでも無効にできるので、毎回読み直す。
- **main は settings.json を判断のたびに読む**（`startTheme` と同じく、Core が書いたファイルを読むだけ。UserStore は一時ファイルに書いてから置き換えるので、
  書きかけを読むことはない）。renderer から main へ設定を送る IPC は作らない。読むのは窓を閉じたとき・起動したとき・トレイを作るときだけなので、重くない。
- **読み取り専用（`app.readOnly`）の間は `closeToTray` のスイッチを押せなくする**。`saveSettings` は先に画面の値を変えて保存の失敗を握りつぶすので、
  押せると画面は「オン」、ファイル（main が読む）は「オフ」とずれる。サインイン時の起動は Windows の登録が正なので、読み取り専用でも押せる。
- **窓を戻す処理は 1 つ**（`reveal()`）。トレイ・二度目の起動・通知のクリックのどれからでも同じ処理を通す。

## 3. 設定

`Settings` に平たい項目を 1 つ足す（3 か所: `types.ts`・`api.ts` の `settingsSchema`・`settings.ts` の `DEFAULT_SETTINGS`）。

| 項目          | 既定  | 意味                                                          |
| ------------- | ----- | ------------------------------------------------------------- |
| `closeToTray` | false | 1 枚目の × で終わらず、すべての窓を隠して通知領域で動き続ける |

設定の画面は「一般」タブに 3 つのスイッチを並べる。押せるか・どの注意を出すかは `loginView(login, { readOnly })`（`src/shared/background.ts`）が決める。

| スイッチ                           | 正                     | 押せないとき・注意                                                                                                                                                                                                                                         |
| ---------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 閉じても通知領域で動かし続ける     | `settings.closeToTray` | 読み取り専用の間は押せない。横に「終了は Ctrl+Shift+Q か、通知領域（^ の中）のアイコンのメニューから」                                                                                                                                                     |
| Windows にサインインしたら起動する | Run キーの値           | 開発版（`app.isPackaged` が偽）では押せず「インストールした版でだけ使えます」（electron.exe を登録してしまうため）。タスクマネージャーで無効にされていたらオフで出し「タスクマネージャーのスタートアップで無効になっています。オンにすると有効に戻ります」 |
| 起動したら通知領域に入れておく     | Run キーの値の引数     | サインイン時の起動がオフの間は押せない。横に「通知領域（^ の中）のアイコンから開けます」                                                                                                                                                                   |

文言は i18n の `ja` と `en` の両方に足す。

## 4. 振る舞い

### 4.1 閉じる（FR-BG1・BG2）

`decideClose({ slot, closeToTray, quitting })` → `'hide' | 'close'`。

- 1 枚目（`main`）で `closeToTray` がオンで、終了の途中（`quitting`）でないとき → `'hide'`。それ以外は `'close'`（今までどおり）。
- フリー N は、単独で閉じたときは今までどおり閉じる（次の起動で開き直さない）。
- `'hide'` のとき（`putAway()`）:
  1. 見えている窓の位置を記録する（`rememberWin` → `saveState`。今の `close` の処理と同じ）。
  2. すべての窓（1 枚目と開いているフリー N）を `setSkipTaskbar(true)` にしてから `hide()` する。最小化中の窓を閉じた（タスクバーのサムネイルの ×）場合も同じ。
     最小化したまま隠すとタスクバーのボタンが残ることが elecdex で確かめられているので、`setSkipTaskbar` で確実に外す。
  3. 全窓の遅らせている保存を流し込む（`flushWindows()`。待たない）。隠れている間は操作が無いので、シャットダウンで終わっても保存は済んでいる（§4.3）。
  4. トレイのアイコンを出す（§4.4）。
  5. 初めてしまったときだけ、Windows の通知で「通知領域で動いています。タスクバーの ^ の中のアイコンから開けます」と知らせる。出したことは `window.json` の `trayHint` に記録する
     （`settings.json` は Core の持ち物なので main は書かない）。通知のクリックは `reveal()`。
- **はっきりした終了は常に終わる**（入口は `requestQuit()` にまとめ、終了の途中なら何もしない。`app.quit()` を二度呼ぶと保存の流し込みを待たずに進むため）: Ctrl+Shift+Q（`app:quit`）・トレイのメニューの「終了」・二度目の起動の `quit`（§4.6）。どれも `app.quit()` → `before-quit` で
  `quitting = true` になり、そのあとの `close` は `'close'` になる。

### 4.2 戻す（FR-BG3）

`reveal()`:

1. しまうために隠した窓をすべて出す。最小化が残っていれば `restore()`、`setSkipTaskbar(false)`、`show()`。利用者が最小化しておいた見えている窓（フリー N）はそのまま。
2. 隠して作った窓に、取っておいた最大化・全画面を当てる（§4.5）。
3. 1 枚目を前に出す（最小化していれば `restore()` して `focus()`）。
4. トレイのアイコンを消す。
5. しまっている最中（`stowed()`）は、このあと作る窓（隠して起動したあとに開き直すフリー N）も隠して作る。戻したあとに作る窓は普通に出す。

アプリを通らずに窓が出る経路（タスクバー・タスクスイッチャーなど）に備えて、すべての窓の `show` で、最小化が残っていれば `restore()` し、`setSkipTaskbar(false)` にする。
最小化と非表示が重なると、出しても操作を受け付けない窓に見える（elecdex で起きた不具合）。

戻す経路:

| 経路                                       | 今                            | 変更                                                  |
| ------------------------------------------ | ----------------------------- | ----------------------------------------------------- |
| トレイのクリック・ダブルクリック・「開く」 | （新規）                      | `reveal()`                                            |
| トレイの「設定」                           | （新規）                      | `reveal()` のあと、1 枚目に `app:openSettings` を送る |
| 二度目の起動（`open`）                     | `restore()` と `focus()` だけ | `reveal()`                                            |
| アラートの通知のクリック                   | 1 枚目だけを `show()`         | `reveal()` のあと `alerts:open`                       |
| しまったときの案内の通知のクリック         | （新規）                      | `reveal()`                                            |

### 4.3 終了・シャットダウン（FR-BG4）

- `before-quit` の流れ（全窓の保存の流し込み → Core の停止）は変えない。
- **位置の記録（`rememberWin`）は、しまうために隠した窓（隠して作った窓を含む）を飛ばす**。background が隠した窓を覚えていて（`hidden(slot)`）、`rememberWin` はそれを見る
  （`before-quit` と `close` の両方に効く）。`isVisible()` は使わない（Windows では最小化した窓も偽になり、最小化した窓の位置を記録しなくなる）。
  隠れた窓では最大化などの値が当てにならない（隠して作って最大化を取っておいた窓は `isMaximized()` が偽）。しまうときに記録した値が正しい。
- `state.open`（次の起動で開き直すフリー N）は、隠れているフリー N も含める（`wins` に残っているので今のままでよい）。
- `saveState` は一時ファイルに書いてから置き換える（今はじかに書くので、途中で切れると `window.json` が壊れ、位置と `trayHint` を失う）。
- **Windows のシャットダウン・サインアウト**では `before-quit` が来ない。常駐させると、これが普通の終わり方になる。
  - `query-session-end`（止めない）: 全窓の保存の流し込みを始める（`flushWindows()`）。
  - `session-end`（窓の数だけ来るので 1 回だけ動かす）: `quitting = true`、見えている窓の位置の記録と `saveState()`（同期で書く）、Core に `shutdown` を送る
    （待てないので、できる範囲で）。Core の項目の書き込みはトランザクションなので、途中で切れても半端な状態は残らない（FR-F1）。

### 4.4 トレイ（FR-BG5）

- **アイコンは、窓をしまっている間だけ出す**。見えている間は出さない。設定を変えたときに main へ知らせる経路が要らなくなり、出しっぱなしのアイコンが残らない。
  Windows 11 は新しいアイコンを ^ の中に入れるので、初回だけ案内し（§4.1）、設定の画面にも書く（§3）。
- GUID は渡さない（署名していない exe ではパスに結び付き、インストール先の変更や開発版とぶつかる。作り直すアイコンなので利点も小さい）。
- 画像は `build/icon.ico`（16px を含み、にじまない）。`electron-builder.yml` の `files` に足す。
- ツールチップは `elecxstock`。クリックで `reveal()`（1 回目のクリックでアイコンが消えるので、ダブルクリックは受けない）。
  アイコンはクリック・メニューのイベントの中から消すことになるので、`destroy()` はそのイベントが終わってから（`setImmediate`）行う。右クリックのメニューは「開く」「設定」「終了」。
- メニューの言語は、作るときに settings.json の `lang` を読んで決める（アイコンはしまうたびに作り直すので、いつも今の言語になる）。
- メニューの中身は `trayMenu(lang)`（純粋な関数）が返すデータ。E2E はスタブ（§6）から同じデータを読み、項目を選ぶ。
- キーボードだけでも操作できる: Win+B で通知領域に入り、矢印で選び、Enter で開く・Shift+F10 でメニュー。もう一度起動しても前に出る（§4.6）。終了は Ctrl+Shift+Q でもできることを、設定の画面のスイッチの横に書く。

### 4.5 サインイン時の起動（FR-BG6・BG7）

- Electron の `app.setLoginItemSettings` / `getLoginItemSettings` を使う（自分でレジストリを触らない）。値の名前は `dev.kurouna.elecxstock` に固定する
  （アンインストーラが消せるように。製品版の AppUserModelId と同じ）。`path` は `process.execPath`、`args` は「通知領域に入れておく」なら `['--hidden']`、でなければ `[]`。
- 状態は毎回読む（`loginState`）:
  - 登録: `launchItems` に、名前が `LOGIN_ITEM_NAME` で `scope: 'user'` の項目があるか。`enabled` が偽ならタスクマネージャーで無効にされている。
  - 引数: `launchItems` の `args` は読めない（Electron は常に空を返す）が、比べることはできる。`getLoginItemSettings({ path, args: ['--hidden'] }).openAtLogin` が真なら
    「通知領域に入れておく」。
- オン・オフと引数は 1 つの口で書く: `app:setLoginItem({ on, hidden })`。
  - オンにする（オフから）: `enabled: true` で書く（無効にされていても有効に戻す）。
  - 登録されたまま `hidden` だけ変える: 同じく `enabled: true` で書く。「通知領域に入れておく」はサインイン時の起動がオン（無効にされていない）のときだけ押せるので、無効にされた登録を黙って有効に戻すことはない。
  - オフ: 値を消す。
  - 読む口は `app:loginItem`。どちらも `{ available, on, hidden, disabledByOs }` を返す。
- 起動のたびに比べて書き直すことはしない。
- インストール先を変えると、古い登録は見えず「オフ」と出る。オンにし直すと同じ名前で上書きされる。アンインストールでも消える。

**隠して起動する**: `startHiddenNow({ hiddenArg, saved })` → 起動の引数に `--hidden` があり、かつ初回の同意と初回の取り込みが済んでいる（settings.json の `disclaimerAccepted` と
`firstRunDone`）とき真。済んでいなければ窓を出す（見えない窓のまま初回の画面で止まらないように）。

- 隠して作る窓（1 枚目と、前回開いていたフリー N）は、`ready-to-show` で出さない。`maximize()` は隠れた窓も出してしまうので、最大化・全画面は
  当てずに取っておき（`deferred`）、最初の `reveal()` で `show()` のあとに当てる。
- 窓を隠したまま renderer は動く（`backgroundThrottling: false`）ので、自動の更新とアラートは起動直後から動く。トレイのアイコンを出す。
- 案内の通知は出さない（利用者が選んだ起動の仕方なので。^ の中にあることは設定の画面に書く）。

### 4.6 単一起動と二度目の起動（FR-BG8）

- 起動の引数から `launchAction(argv)` → `'quit' | 'hidden' | 'open'` を決め、`requestSingleInstanceLock({ action })` の `additionalData` で 1 つ目に渡す
  （`second-instance` の `argv` は並びが変わったり足されたりするので使わない）。
- ロックを取れなかった（2 つ目）ときは `app.exit(0)` ですぐ終える。`whenReady` の処理（Core の起動・窓を作る）は、ロックを取れたときだけ登録する。
- ロックを取れた（1 つ目）のに `quit` のとき（動いているものが無い）は、窓も Core も作らずに `app.exit(0)`。
- 1 つ目が受け取ったとき（`secondInstance(action, quitting)`）:
  - `quit` → 終了の途中でなければ `app.quit()`（保存の流し込みと Core の停止を通る）。途中なら何もしない（`before-quit` の流れを短絡させない）。
  - `hidden` → 何もしない（サインイン時の起動は「動いていればよい」）。
  - `open` → `reveal()`。

**インストーラ**: electron-builder の NSIS は、動いているアプリを `taskkill`（PowerShell があれば `Stop-Process`）で止める。どちらも保存の流し込みと Core の停止を
通らない。常駐させるとアプリが動いたまま上書きの更新をすることが増える。`build/installer.nsh` で `customCheckAppRunning` を定義する
（インストールの節と、アンインストールの節で呼ばれる。ウィザードを開いただけでは呼ばれない）:

1. `nsProcess::FindProcess` で `elecxstock.exe` が動いているか確かめる。動いていなければ何もしない
   （`--quit` を知らない古い版の exe を実行すると、普通に起動してしまうため）。
2. 動いていれば `"$INSTDIR\elecxstock.exe" --quit` を待たずに実行し（`Exec`）、`nsProcess` で最長 10 秒、終わるのを待つ。
   古い版は `--quit` を知らずに窓を前に出すだけなので、10 秒待ってから次へ進む。
3. electron-builder の今の処理（`IS_POWERSHELL_AVAILABLE` → `_CHECK_APP_RUNNING`）を続ける。`customCheckAppRunning` を定義すると
   `getProcessInfo.nsh` の取り込みと `Var pid` が外れるので、自分で入れる。

**アンインストール**: `customUnInstall` の `${ifNot} ${isUpdated}` の中で、Run と `StartupApproved\Run` の値 `dev.kurouna.elecxstock` を消す。データを残すかの問いとは別に、無条件で消す。

## 5. 作り

| 場所                                           | 中身                                                                                                                                                                                                                    |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/background.ts`                     | 定数（`HIDDEN_ARG`・`QUIT_ARG`・`LOGIN_ITEM_NAME`）と純粋な関数（`savedBackground`・`decideClose`・`launchAction`・`secondInstance`・`startHiddenNow`・`loginArgs`・`loginState`・`loginView`・`trayMenu`・`trayHint`） |
| `src/main/background.ts`                       | `createBackground(deps)`: トレイ（本物とスタブ）・サインイン時の起動（本物とスタブ）・`putAway`・`reveal`・`session-end`。窓の一覧と状態の保存は `index.ts` から受け取る                                                |
| `src/main/index.ts`                            | 単一起動のロックと `launchAction`、`close` で `decideClose`、`second-instance`、隠して作る窓、`app:notify` のクリック、`rememberWin` の見えない窓、`saveState` の置き換え、IPC 2 本                                     |
| `src/main/placement.ts`                        | `WindowStateV2` に `trayHint?: boolean`。`parseState` が残す                                                                                                                                                            |
| `src/preload/index.ts`・`src/shared/bridge.ts` | `loginItem()`・`setLoginItem({ on, hidden })`・`onOpenSettings(cb)`                                                                                                                                                     |
| `overlays/Settings.svelte`                     | 「一般」タブの 3 つのスイッチ（`loginView` の結果を出すだけ）                                                                                                                                                           |
| `components/App.svelte`                        | `onOpenSettings` で設定を開く（1 枚目だけ）                                                                                                                                                                             |
| `build/installer.nsh`                          | `customCheckAppRunning`（`--quit`）、`customUnInstall`（Run キーの値を消す）                                                                                                                                            |
| `electron-builder.yml`                         | `files` に `build/icon.ico`                                                                                                                                                                                             |

elecxstock-cli への影響: settings.json に `closeToTray` が増えるだけ（既定値つき。読む側の zod は知らない項目を落とす）。DB・置き場所・`Repo` は変えない。
リリースのノートに書く。

### 5.1 文書

- requirements.md に §6.18（FR-BG1〜BG8）を足す。FR-F1（「アプリを閉じても」→「終了しても」）、FR-AL5（通知を押すと、しまっている窓も出す）、§6.5（Ctrl+Shift+Q は
  しまう設定でも終える）、§8.1（main の役割に常駐とサインイン時の起動）を直す。
- design-multimonitor.md §3.1（「主ウィンドウを閉じるとアプリを終える」→ しまう設定ではフリー N も一緒に隠す）。
- decisions.md に決めたこと（§7）を足す。
- 実機でしか確かめられない要求は `tests/trace-exempt.json` に理由を書く。

## 6. テスト

- **L1**（`tests/unit/shared/background.test.ts`）: `decideClose`（スロット・オン/オフ・終了の途中）、`launchAction`（引数の組み合わせ）、`secondInstance`（3 つの動き・終了の途中）、
  `startHiddenNow`（引数の有無・初回が済んでいない・壊れた settings.json）、`savedBackground`（欠けた項目・`{ data }` の形と平たい形・壊れた JSON）、`loginArgs`、
  `loginState`（無い・ほかの名前・machine の項目・無効にされた・引数）、`loginView`（開発版・無効にされた・読み取り専用・オン/オフでの 3 つ目のスイッチ）、`trayMenu`（ja/en）。
- **L1**（`tests/unit/main/placement.test.ts`）: `parseState` が `trayHint` を残す・知らない値を落とす。
- **L2**: 設定の 3 か所の整合と i18n のキーの一致は今のテストが確かめる。
- **L5**（`tests/e2e/background.spec.ts`。`ELECXSTOCK_BACKGROUND_STUB=1`）: トレイとサインイン時の起動はメモリの上のスタブにし、実際のタスクバー・レジストリに触れない
  （`globalThis.__elecxstockBackground` から読む・操作する）。スタブはスタブのプロバイダのときだけ効く。
  1. 設定の画面をキーで開き、「閉じても通知領域で動かし続ける」をキーでオンにする → `settings.json` に書かれるのを待つ → 1 枚目を閉じる → アプリは動いたまま・
     窓は見えない・トレイが出る・案内の通知が 1 回。トレイの「開く」→ 窓が出る・トレイが消える。もう一度しまっても案内は増えない。トレイの「終了」→ アプリが終わる。
  2. フリー N を開いた状態でしまう → フリー N も隠れる → 戻すと一緒に出る。
  3. 最小化してから閉じる → 戻すと最小化が解けている。
  4. `--hidden` で起動（初回が済んだ種）→ 窓は見えない・トレイが出る → トレイのクリックで出る。初回が済んでいない userData では窓が出る。
  5. 二度目の起動: `child_process.spawn` で同じ `ELECXSTOCK_USER_DATA` を渡して `--quit` で起動する（すぐ終わるので Playwright ではつなげない）→ 1 つ目が `close` する。
  6. サインイン時の起動をキーでオン → スタブに登録される。3 つ目をオン → 引数が `--hidden` になる。スタブで無効にする → 注意が出る。読み取り専用ではない。
- `launch.ts` に `args`・`env` と、窓が見えるのを待たない起動（`hidden`）を足す。後片付け（`app.close()`）は `app.quit()` を通るので、しまう設定でも終わる。
- 実機での確認（自動化しない）: 本物のトレイの表示とメニュー、Run キーの登録・引数の比べ方・タスクマネージャーでの無効、インストーラの上書きの更新で保存してから終わること、
  隠れている間の CPU の使用率。

## 7. 決めたこと・割り切り

- **トレイのアイコンは、しまっている間だけ出す**。Teams や Slack は出しっぱなしだが、elecxstock は見えている間に通知領域からする操作が無い（終了は Ctrl+Shift+Q）。
- **最小化でしまう・どこからでも効くショートカットは作らない**（頼まれていない。あとから足せるよう、判断の関数は分けてある）。
- **シャットダウンでは renderer の保存を待てない**。代わりに、しまうときと `query-session-end` で流し込みを始めておく。
- **最大化したまま最小化した窓**は、閉じたときに `isMaximized()` が偽になり最大化を失う（今の `close` の処理と同じ。変えない）。
- **隠れている間も描画を止めない**。elecxstock の画面は変化が無ければ描き直さないので、まず実機で使用率を測り、高ければ止める手立てを足す。
