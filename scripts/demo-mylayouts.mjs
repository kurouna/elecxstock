// X（旧 Twitter）投稿用の短いデモ: マイレイアウト（FR-L14。docs/design-mylayouts.md）。録画は利用者がキャプチャアプリで行う。
// スタブのプロバイダ（架空の値）で起動し、キー操作だけで場面を進める。画面の下に字幕、右下に押したキーを重ねて出す（アプリには入れない）。
// 話題: 8 番目のタブ「マイレイアウト」に名前を付けたページを何枚も持つ・▾（Ctrl+Shift+8 をもう一度）のメニュー・名前の変更・
// 初めの形を選んで新しいページ・ほかのタブを写してページに・1〜9 とコマンドバーで切り替え・消しても Ctrl+Z で戻せる
//
// 使い方: npm run build && npm run demo:mylayouts
//   DEMO_SIZE=1920x1080  窓の中身の大きさ（X の動画は 16:9。既定は最大化。幅 1860 以上でタブにページ名と時計が出る）
//   DEMO_WAIT=8          タイトルを出してから始めるまでの秒数（その間に録画を始める）
//   DEMO_SPEED=1         速さの倍率（1.5 で速く、0.8 でゆっくり）
//   DEMO_SHOTS=<フォルダ> 場面ごとにスクリーンショットを残す（確認・投稿の画像用）。DEMO_EXIT=1 で終わったら閉じる
//   DEMO_SHOTS_CLEAN=1   字幕・押したキーなしのスクリーンショットも <フォルダ>/clean/ に残す
//   DEMO_THEME=light     テーマを決めて始める（light / dark。既定は今の設定のまま）
// 終わったら終わりの画面のまま止まる。窓を閉じると終わる。
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from '@playwright/test'
import { call, caption, card, overlay, press, SIZE, SPEED, setTheme, shot, sleep, WAIT } from './demo-kit.mjs'
import { waitIdle } from './wait-idle.mjs'

const userData = mkdtempSync(join(tmpdir(), 'elecxstock-demo-'))
// 日時を固定する（平日の大引けのあと。録り直しても同じ値になる）
const NOW = '2026-11-13'
const env = {
  ...process.env,
  ELECXSTOCK_PROVIDER: 'stub',
  ELECXSTOCK_USER_DATA: userData,
  ELECXSTOCK_NOW: `${NOW}T18:00:00+09:00`,
}
const idle = (page) => waitIdle(page, 120_000)

// ---------------------------------------------------------------- 1 回目: 初回の取り込み（録画しない）
{
  console.log('準備: 架空のデータを取り込んでいます…')
  const app = await electron.launch({ args: ['.'], env })
  const page = await app.firstWindow()
  await page.getByRole('dialog').waitFor()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await idle(page)
  // お気に入りに架空の値の銘柄を入れておく（写した MTF のページのウォッチリストが空にならないように）
  for (const id of ['JP:7203', 'JP:8306', 'JP:8058', 'JP:9434', 'JP:8951', 'JP:6501'])
    await call(page, 'watchlists.toggleItem', { list: 'favorites', id })
  await setTheme(page)
  await app.close()
}

// ---------------------------------------------------------------- 2 回目: デモ
const app = await electron.launch({ args: ['.'], env })
const page = await app.firstWindow()
await idle(page)
await app.evaluate(({ BrowserWindow }, size) => {
  const w = BrowserWindow.getAllWindows()[0]
  if (size === 'max') w.maximize()
  else {
    const [x, y] = size.split('x').map(Number)
    w.unmaximize()
    w.setContentSize(x, y)
    w.center()
  }
  w.focus()
}, SIZE)
// マウスを窓の左上の角へ（カーソルが窓の上にあると十字線が出て、凡例がその日の値になる）
const corner = () => page.mouse.move(0, 0)
await corner()

const menu = page.locator('.page-menu[role="menu"]')
const tab = page.locator('.presets [aria-current="true"]')
/** 今のタブにその名前が出るまで待つ（ページを開いた・タブを替えた） */
const onTab = (text) => tab.filter({ hasText: text }).waitFor()
/** メニューで、text を含む行まで ↓ で送る（行の数はページの枚数で変わるので、位置ではなく中身で選ぶ） */
async function menuTo(text) {
  await menu.waitFor()
  await press(page, 'Home')
  for (let i = 0; i < 20; i++) {
    if (((await menu.locator('.it.sel').textContent()) ?? '').includes(text)) return
    await press(page, 'ArrowDown')
  }
  throw new Error(`メニューに見つからない: ${text}`)
}
/** 名前を打つダイアログに打って決める */
async function typeName(name) {
  await page.locator('.dialog input').waitFor()
  await page.keyboard.press('Control+a')
  await page.keyboard.type(name, { delay: 120 / SPEED })
  await sleep(500)
  await press(page, 'Enter')
}

await overlay(page)
await page.evaluate(() => document.querySelectorAll('.toasts .toast').forEach((t) => t.remove()))
await card(page, [
  'マイレイアウト',
  '自分専用の画面を、名前を付けて何枚でも',
  'elecxstock ・ 8 番目のタブ ・ キーボードだけで',
  '※ 画面は開発中のものです。株価などの値はすべて架空のデモデータです',
])
console.log(`${WAIT} 秒後に始めます。いまのうちに録画を始めてください`)
await sleep(WAIT * 1000 * SPEED)
await sleep(2500)
await card(page, null)
await sleep(800)
await shot(page, 'title')
await corner()

// 1. マイレイアウトのタブ（Ctrl+Shift+8）
await press(page, 'Control+Shift+Digit8')
await onTab('マイレイアウト')
await caption(page, 'Ctrl+Shift+8 で 8 番目のタブ「マイレイアウト」。ここに名前を付けたページを何枚も持てます')
await sleep(3500)
await shot(page, 'tab')

// 2. もう一度 Ctrl+Shift+8 でページのメニュー。F2 で名前を変える
await caption(page, 'もう一度 Ctrl+Shift+8（またはタブの ▾）でページのメニュー')
await press(page, 'Control+Shift+Digit8')
await menu.waitFor()
await sleep(2200)
await shot(page, 'menu')
await caption(page, 'F2 で名前を変えます')
await press(page, 'F2')
await typeName('いつもの')
await menu.filter({ hasText: 'いつもの' }).waitFor()
await sleep(1500)

// 3. Insert で新しいページ: 初めの形を選んで、名前を付ける
await caption(page, 'Insert で新しいページ。初めの形を選んで、名前を付けます')
await press(page, 'Insert')
await page.locator('.dialog').filter({ hasText: '4 分割' }).waitFor()
await sleep(1200)
await press(page, 'ArrowDown', 'ArrowDown')
await sleep(900)
await shot(page, 'shape')
await press(page, 'Enter')
await typeName('主力 4 銘柄')
await onTab('主力 4 銘柄')
await caption(page, 'できたページはすぐ開きます。タブには表示中のページの名前')
await sleep(3500)
await shot(page, 'new-page')

// 4. ほかのタブを写してページにする（MTF のタブを写す）
await caption(page, 'ほかのタブの並びを写してページにもできます。MTF のタブ（Ctrl+Shift+4）で Ctrl+Shift+L')
await press(page, 'Control+Shift+Digit4')
await onTab('MTF')
await sleep(1200)
await press(page, 'Control+Shift+KeyL')
await menuTo('今のタブを写して')
await sleep(900)
await press(page, 'Enter')
await typeName('朝の MTF')
await onTab('朝の MTF')
await caption(page, '写したページは自由に組み替えられます。元の MTF のタブはそのまま')
await sleep(3500)
await shot(page, 'copied')

// 5. 1〜9 とコマンドバーで切り替える
await caption(page, 'メニューで 1〜9 を押すと、そのページへすぐ切り替え')
await press(page, 'Control+Shift+Digit8')
await menu.waitFor()
await sleep(1500)
await shot(page, 'menu-3')
await press(page, 'Digit1')
await onTab('いつもの')
await sleep(1600)
await press(page, 'Control+Shift+Digit8', 'Digit2')
await onTab('主力 4 銘柄')
await sleep(1600)
await caption(page, 'コマンドバー（Ctrl+K）でページの名前を打っても開けます')
await press(page, 'Control+KeyK')
await page.locator('.dialog.palette input').waitFor()
await page.keyboard.type('朝の', { delay: 160 / SPEED })
await sleep(1500)
await shot(page, 'palette')
await press(page, 'Enter')
await onTab('朝の MTF')
await sleep(2000)

// 6. 消しても 10 秒以内なら Ctrl+Z で戻る
await caption(page, 'Delete を 2 回でページを消せます。10 秒以内なら Ctrl+Z で元どおり')
await press(page, 'Control+Shift+Digit8')
await menuTo('朝の MTF')
await press(page, 'Delete')
await sleep(900)
await press(page, 'Delete')
await menu.filter({ hasNotText: '朝の MTF' }).waitFor()
await sleep(1500)
await press(page, 'Escape')
await sleep(1000)
await press(page, 'Control+KeyZ')
await onTab('朝の MTF')
await sleep(2500)
await shot(page, 'undo')

// 7. 自動で保存・フリー 2〜4 の窓にも
await caption(page, 'ページの変更は自動で保存。新しいウィンドウ（Ctrl+Alt+N）にページを写して、2 枚目のモニタにも出せます')
await sleep(4500)
await caption(page, '')

// 8. 終わりの画面
await card(page, [
  'マイレイアウト',
  'ページの追加・写す・名前・並べ替え・削除と元に戻す・1〜9 で切り替え',
  '無料・オープンソース（MIT） ・ Windows ・ github.com/kurouna/elecxstock',
  'チャート: TradingView Lightweight Charts™（Apache-2.0）',
  '※ 画面は開発中のものです。動画の株価などの値はすべて架空のデモデータです',
])
await shot(page, 'end')
console.log('デモが終わりました。窓を閉じると終わります')
if (process.env.DEMO_EXIT === '1') await app.close()
else await new Promise((r) => app.on('close', r))
