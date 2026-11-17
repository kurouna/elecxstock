// v0.1.7 → v0.1.9 の変わったところのデモ（録画は利用者がキャプチャアプリで行う）。スタブのプロバイダ（架空の値・架空の見出し）で起動し、
// キー操作だけで場面を進める。画面の下に字幕、右下に押したキーを重ねて出す（録画のときだけ。アプリには入れない）。
// 筋: タブの切り替えの動き（下線が滑り、中身が少し滑って入る）→ ペインの最大化・戻すの動き → ニュースのペイン（0.1.8）を最大化して紹介 →
// ドロワーのタブの動き。字幕は対応した内容・事実だけを書く（「控えめ」などの評価や「見てみます」などの語りは入れない）。グリッドは録画の前に 3×3 にして空きを作らない
//
// 使い方: npm run build && npm run demo:0.1.9
//   DEMO_SIZE=1920x1080  窓の中身の大きさ（既定は最大化。キャプチャする大きさに合わせる）
//   DEMO_WAIT=8          タイトルを出してから始めるまでの秒数（その間に録画を始める）
//   DEMO_SPEED=1         速さの倍率（1.5 で速く、0.8 でゆっくり）
//   DEMO_SHOTS=<フォルダ> 場面ごとにスクリーンショットを残す（確認用）。DEMO_EXIT=1 で終わったら閉じる
//   DEMO_SHOTS_CLEAN=1   字幕・押したキーなしのスクリーンショットも <フォルダ>/clean/ に残す
//   DEMO_THEME=light     テーマを決めて始める（light / dark。既定は今の設定のまま）
// 動きそのもの（200ms ほど）は録画で見せる。スクリーンショットは動きを止めて撮る（demo-kit の shot）ので、動きの終わりの画面になる。
// 終わったら終わりの画面のまま止まる。窓を閉じると終わる。
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from '@playwright/test'
import { call, caption, card, overlay, press, SIZE, SPEED, setTheme, shot, sleep, WAIT } from './demo-kit.mjs'
import { waitIdle } from './wait-idle.mjs'

const userData = mkdtempSync(join(tmpdir(), 'elecxstock-demo-'))
// 日時を固定する（平日の大引けのあと。見出しの時刻・基準日が録り直しても同じになる）
const NOW = '2026-11-13'
const env = {
  ...process.env,
  ELECXSTOCK_PROVIDER: 'stub',
  ELECXSTOCK_USER_DATA: userData,
  ELECXSTOCK_NOW: `${NOW}T18:00:00+09:00`,
}
const idle = (page) => waitIdle(page, 120_000)

// ---------------------------------------------------------------- 1 回目: 初回の取り込み（録画しない）。ニュースは初回起動の既定（取る）のまま
{
  console.log('準備: 架空のデータを取り込んでいます…')
  const app = await electron.launch({ args: ['.'], env })
  const page = await app.firstWindow()
  await page.getByRole('dialog').waitFor()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await idle(page)
  // ドロワーのウォッチリストが空にならないよう、お気に入りを入れておく（銘柄名とコードだけ実在。値はスタブの架空の値）
  for (const id of ['JP:7203', 'JP:8306', 'JP:8058', 'JP:9434', 'JP:8951', 'JP:6501', 'JP:8316']) {
    await call(page, 'watchlists.toggleItem', { list: 'favorites', id })
  }
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
// マウスを窓の左上の角へ（実際のカーソルが窓の上にあると十字線や hover の値が出る）
await page.mouse.move(0, 0)

/** F6 でペインを順に移り、そのペインにフォーカスを置く */
async function focusPane(widget, n = 0) {
  const target = page.locator(`[data-widget="${widget}"]`).nth(n)
  for (let i = 0; i < 20; i++) {
    if (await target.evaluate((e) => e.classList.contains('focused'))) return
    await page.keyboard.press('F6')
    await sleep(120)
  }
}
const news = page.locator('[data-widget="news"]')
const grid = page.locator('[data-widget="grid"]')
const current = page.locator('.presets [aria-current="true"]')
/** レイアウトのタブを替え、そのタブになるまで待つ */
async function tabTo(n, name) {
  await press(page, `Control+Shift+Digit${n}`)
  await current.filter({ hasText: name }).waitFor()
}
/** フォーカスしているペインを最大化し、動きが終わるまで待つ */
async function maximize() {
  await press(page, 'Control+Shift+Enter')
  await page.locator('.pane.maxed').waitFor()
}
/** 最大化を戻し、元の場所に着くまで待つ */
async function restore() {
  await press(page, 'Escape')
  await page.locator('.pane.maxed').waitFor({ state: 'detached' })
}

// 録画の前に: グリッドのタブはスクリーナーの結果（10 銘柄）を出すので、3×3 にして空きのない画面にしておく（− で格子を粗く）
await page.keyboard.press('Control+Shift+Digit3')
await current.filter({ hasText: 'グリッド' }).waitFor()
await focusPane('grid')
await grid.locator('canvas[data-id]').first().waitFor()
await page.keyboard.press('Minus')
await grid.getByText('3×3', { exact: true }).waitFor()
await page.keyboard.press('Control+Shift+Digit1')
await current.filter({ hasText: 'マーケット' }).waitFor()
await news.locator('.row[role="option"]').first().waitFor()

await overlay(page)
await page.evaluate(() => document.querySelectorAll('.toasts .toast').forEach((t) => t.remove()))
await card(page, [
  'elecxstock 0.1.9',
  'タブ切替・ペイン最大化のアニメーション',
  'タブ切替・ペインの最大化と復元・ドロワーのタブ切替・ニュースペイン（0.1.8）',
  '※ 画面は開発中のものです。株価・指数・見出しなどの値はすべて架空のデモデータです',
])
console.log(`${WAIT} 秒後に始めます。いまのうちに録画を始めてください`)
await sleep(WAIT * 1000 * SPEED)
await sleep(2500)
await card(page, null)
await sleep(800)
await shot(page, 'title')

// 1. タブの切り替え: 下線が選んだタブへ滑り、中身が少し滑って入る（右のタブなら右から）
await caption(page, 'タブ切替時、下線が選択タブへ移動し、表示内容が切替方向からスライド')
await sleep(2500)
await tabTo(3, 'グリッド')
await sleep(1600)
await tabTo(4, 'MTF')
await sleep(1600)
await tabTo(5, 'トリプル')
await sleep(1600)
await shot(page, 'tab-right')
await caption(page, '左方向への切替は左からスライド（0.2 秒）。連続して切り替えても画面の明滅なし')
await sleep(2000)
await tabTo(2, 'スクリーナー')
await sleep(1600)
await tabTo(4, 'MTF')
await sleep(600)
await tabTo(3, 'グリッド')
await sleep(1800)
await shot(page, 'tab-left')

// 2. ペインの最大化と戻す: どこが広がったか・どこへ戻ったかを目で追える
await tabTo(4, 'MTF')
await focusPane('chart', 1)
await caption(page, 'Ctrl+Shift+Enter でペインを最大化。元の位置から拡大')
await sleep(2200)
await maximize()
await sleep(2200)
await shot(page, 'max')
await caption(page, 'Esc で元の位置へ復元')
await sleep(1500)
await restore()
await sleep(2200)
await shot(page, 'restore')
await caption(page, 'サイズの変更は 1 回のみで、アニメーションは位置だけ。チャートの再描画も 1 回')
await press(page, 'Alt+ArrowRight')
await sleep(900)
await maximize()
await sleep(1800)
await restore()
await sleep(1800)

// 3. ニュースのペイン（0.1.8）: マーケットのタブの左下。最大化して大きく見せる
await tabTo(1, 'マーケット')
await focusPane('news')
await caption(page, 'マーケットタブ左下のニュースペイン（0.1.8）')
await sleep(2800)
await shot(page, 'news-small')
await maximize()
await sleep(1500)
await caption(page, '日本銀行・JPX・Bloomberg 等の見出しを時刻順に表示。取得は見出しとリンクのみ（本文・画像は取得しない）')
await sleep(4000)
await shot(page, 'news')
await caption(page, 'G で分類切替、↑↓ で見出しを選択、Enter でブラウザに表示')
for (let i = 0; i < 2; i++) {
  await press(page, 'KeyG')
  await sleep(1300)
}
await press(page, 'ArrowDown', 'ArrowDown')
await sleep(1200)
await shot(page, 'news-tab')
await caption(page, 'Ctrl+C で選択した見出しをテキストとしてコピー')
await press(page, 'Control+KeyC')
await page.locator('.toasts .toast').first().waitFor()
await sleep(2500)
await shot(page, 'news-copy')
await caption(page, 'Esc で元の位置へ復元')
await sleep(1200)
await restore()
await sleep(2000)

// 4. ドロワーのタブ: Ctrl+Tab で切り替えると、下線と中身が同じように動く
await tabTo(3, 'グリッド')
await caption(page, 'グリッドタブの左ドロワーを表示（Ctrl+B）・固定（Ctrl+Alt+B）')
await press(page, 'Control+KeyB')
await page.locator('.dock.open').waitFor()
await sleep(1200)
await press(page, 'Control+Alt+KeyB')
await page.locator('.dock.pinned').waitFor()
await sleep(1500)
await caption(page, 'Ctrl+Tab でドロワーのタブを切替。下線と表示内容も同様にアニメーション')
for (let i = 0; i < 3; i++) {
  await press(page, 'Control+Tab')
  await sleep(1500)
}
await shot(page, 'drawer')
await press(page, 'Control+Alt+KeyB')
await sleep(1200)

// 5. 無効にする方法
await caption(page, 'アニメーションは設定の「動きを減らす」または Windows のアニメーション効果の設定で無効化')
await sleep(3500)
await caption(page, '')

// 6. 終わりの画面
await card(page, [
  'elecxstock 0.1.9',
  'タブ切替・ペイン最大化のアニメーション / ニュースペイン（0.1.8）',
  '無料・オープンソース（MIT） ・ Windows ・ github.com/kurouna/elecxstock',
  'チャート: TradingView Lightweight Charts™（Apache-2.0）',
  '※ 画面は開発中のものです。動画の株価・指数・見出しなどの値はすべて架空のデモデータです',
])
await shot(page, 'end')
console.log('デモが終わりました。窓を閉じると終わります')
if (process.env.DEMO_EXIT === '1') await app.close()
else await new Promise((r) => app.on('close', r))
