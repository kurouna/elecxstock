// v0.1.7 → v0.1.9 の変わったところのデモ（録画は利用者がキャプチャアプリで行う）。スタブのプロバイダ（架空の値・架空の見出し）で起動し、
// キー操作だけで場面を進める。画面の下に字幕、右下に押したキーを重ねて出す（録画のときだけ。アプリには入れない）。
// 話題: ニュースのペイン（0.1.8）、タブの切り替えの動き（下線が滑り、中身が少し滑って入る）、ペインの最大化・戻すの動き、
// ドロワーのタブの動き、F11 の全画面（0.1.9）
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
import { caption, card, overlay, press, SIZE, SPEED, setTheme, shot, sleep, WAIT } from './demo-kit.mjs'
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
const current = page.locator('.presets [aria-current="true"]')
/** レイアウトのタブを替え、そのタブになるまで待つ */
async function tabTo(n, name) {
  await press(page, `Control+Shift+Digit${n}`)
  await current.filter({ hasText: name }).waitFor()
}

await overlay(page)
await page.evaluate(() => document.querySelectorAll('.toasts .toast').forEach((t) => t.remove()))
await card(page, [
  'elecxstock 0.1.9',
  'ペインの最大化とタブの切り替えに、控えめな動きを付けました',
  'タブの切り替え・ペインの最大化と戻す・ドロワー・F11 の全画面、そして 0.1.8 のニュースのペイン',
  '※ 画面は開発中のものです。株価・指数・見出しなどの値はすべて架空のデモデータです',
])
console.log(`${WAIT} 秒後に始めます。いまのうちに録画を始めてください`)
await sleep(WAIT * 1000 * SPEED)
await sleep(2500)
await card(page, null)
await sleep(800)
await shot(page, 'title')

// 1. ニュースのペイン（0.1.8）: マーケットのタブの左下
await tabTo(1, 'マーケット')
await news.locator('.row[role="option"]').first().waitFor()
await caption(page, 'マーケットのタブの左下にニュースのペイン。日銀・JPX・Bloomberg などの見出しを時刻順に並べます（見出しとリンクだけ）')
await sleep(4000)
await shot(page, 'news')
await focusPane('news')
await caption(page, 'G で分類のタブ、↑↓ で見出しを選び、Enter でブラウザで開きます')
for (let i = 0; i < 2; i++) {
  await press(page, 'KeyG')
  await sleep(1300)
}
await press(page, 'ArrowDown', 'ArrowDown')
await sleep(1200)
await shot(page, 'news-tab')
await caption(page, 'Ctrl+C で選んだ見出しを文字でコピー。訳したいときは好きなアプリへ（アプリは翻訳しません）')
await press(page, 'Control+KeyC')
await page.locator('.toasts .toast').first().waitFor()
await sleep(2500)
await shot(page, 'news-copy')

// 2. タブの切り替え: 下線が選んだタブへ滑り、中身が少し滑って入る（右のタブなら右から）
await caption(page, 'タブを替えると、下線が選んだタブへ滑り、中身が少し滑って入ります（右のタブへ移れば右から）')
await sleep(2500)
await tabTo(3, 'グリッド')
await sleep(1600)
await tabTo(4, 'MTF')
await sleep(1600)
await tabTo(5, 'トリプル')
await sleep(1600)
await shot(page, 'tab-right')
await caption(page, '左のタブへ戻ると左から。動きは 0.2 秒ほどで、続けて押しても画面は暗くなりません')
await sleep(2000)
await tabTo(2, 'スクリーナー')
await sleep(1600)
await tabTo(4, 'MTF')
await sleep(600)
await tabTo(3, 'グリッド')
await sleep(1800)
await shot(page, 'tab-left')

// 3. ペインの最大化と戻す: どこが広がったか・どこへ戻ったかを目で追える
await tabTo(4, 'MTF')
await focusPane('chart', 1)
await caption(page, 'Ctrl+Shift+Enter でペインを最大化。元の場所から広がります')
await sleep(2200)
await press(page, 'Control+Shift+Enter')
await page.locator('.pane.maxed').waitFor()
await sleep(2200)
await shot(page, 'max')
await caption(page, 'Esc で元の場所へ戻ります')
await sleep(1500)
await press(page, 'Escape')
await page.locator('.pane.maxed').waitFor({ state: 'detached' })
await sleep(2200)
await shot(page, 'restore')
await caption(page, '別のペインでも。大きさは一度で変え、動かすのは位置だけなので、チャートは描き直しが 1 回で済みます')
await press(page, 'Alt+ArrowRight')
await sleep(900)
await press(page, 'Control+Shift+Enter')
await page.locator('.pane.maxed').waitFor()
await sleep(1800)
await press(page, 'Escape')
await page.locator('.pane.maxed').waitFor({ state: 'detached' })
await sleep(1800)

// 4. ドロワーのタブ: Ctrl+Tab で切り替えると、下線と中身が同じように動く
await tabTo(3, 'グリッド')
await caption(page, 'グリッドのタブで左のドロワーを開き（Ctrl+B）、ピン留め（Ctrl+Alt+B）')
await press(page, 'Control+KeyB')
await page.locator('.dock.open').waitFor()
await sleep(1200)
await press(page, 'Control+Alt+KeyB')
await page.locator('.dock.pinned').waitFor()
await sleep(1500)
await caption(page, 'Ctrl+Tab でドロワーのタブを切り替えると、下線と中身が同じように動きます')
for (let i = 0; i < 3; i++) {
  await press(page, 'Control+Tab')
  await sleep(1500)
}
await shot(page, 'drawer')
await press(page, 'Control+Alt+KeyB')
await sleep(1200)

// 5. F11 の全画面
await caption(page, 'F11 で窓を全画面に。もう一度押すと戻ります')
await sleep(1500)
await press(page, 'F11')
await page.waitForFunction(() => window.innerHeight >= screen.height - 2)
await page.mouse.move(0, 0) // 全画面で窓の位置が変わるので、十字線・hover の値が出ないよう角へ戻す
await sleep(2500)
await shot(page, 'fullscreen')
await press(page, 'F11')
await page.waitForFunction(() => window.innerHeight < screen.height - 2)
await sleep(1500)
await caption(page, '動きは設定の「動きを減らす」か Windows のアニメーションの設定で止められます')
await sleep(3500)
await caption(page, '')

// 6. 終わりの画面
await card(page, [
  'elecxstock 0.1.9',
  'タブの切り替え・ペインの最大化に動き / F11 の全画面 / ニュースのペイン（0.1.8）',
  '無料・オープンソース（MIT） ・ Windows ・ github.com/kurouna/elecxstock',
  'チャート: TradingView Lightweight Charts™（Apache-2.0）',
  '※ 画面は開発中のものです。動画の株価・指数・見出しなどの値はすべて架空のデモデータです',
])
await shot(page, 'end')
console.log('デモが終わりました。窓を閉じると終わります')
if (process.env.DEMO_EXIT === '1') await app.close()
else await new Promise((r) => app.on('close', r))
