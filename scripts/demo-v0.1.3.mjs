// v0.1.2 → v0.1.3 の変わったところのデモ（録画は利用者がキャプチャアプリで行う）。スタブのプロバイダ（架空の値）で起動し、
// キー操作だけで場面を進める。画面の下に字幕、右下に押したキーを重ねて出す（録画のときだけ。アプリには入れない）。
// 話題: マーケットのタブ（新しい並び・マーケット一覧（指数・為替・金利・商品・暗号資産）・騰落（市場・業種別、中へ入って戻る））、
// チャートの目標利回りの線（設定の「チャート」で ON にして目標を打つ → チャートの点線と凡例・グリッドのタイル）と
// ポートフォリオのタブの手直し（TOPIX ETF の表示・カードを選び替えても大きさが変わらない）
//
// 使い方: npm run build && npm run demo:0.1.3
//   DEMO_SIZE=1920x1080  窓の中身の大きさ（既定は最大化。キャプチャする大きさに合わせる）
//   DEMO_WAIT=8          タイトルを出してから始めるまでの秒数（その間に録画を始める）
//   DEMO_SPEED=1         速さの倍率（1.5 で速く、0.8 でゆっくり）
//   DEMO_SHOTS=<フォルダ> 場面ごとにスクリーンショットを残す（確認用）。DEMO_EXIT=1 で終わったら閉じる
//   DEMO_SHOTS_CLEAN=1   字幕・押したキーなしのスクリーンショットも <フォルダ>/clean/ に残す
//   DEMO_THEME=light     テーマを決めて始める（light / dark。既定は今の設定のまま）
// 終わったら終わりの画面のまま止まる。窓を閉じると終わる。
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from '@playwright/test'
import { call, caption, card, overlay, press, SIZE, SPEED, setTheme, shot, sleep, WAIT } from './demo-kit.mjs'
import { HOLD, history, writeHistory } from './folio-fixture.mjs'
import { waitIdle } from './wait-idle.mjs'

const userData = mkdtempSync(join(tmpdir(), 'elecxstock-demo-'))
// 日時を固定する（平日の大引けのあと。基準日・騰落の値が録り直しても同じになる）
const NOW = '2026-11-13'
const env = {
  ...process.env,
  ELECXSTOCK_PROVIDER: 'stub',
  ELECXSTOCK_USER_DATA: userData,
  ELECXSTOCK_NOW: `${NOW}T18:00:00+09:00`,
}
const idle = (page) => waitIdle(page, 120_000)

// ---------------------------------------------------------------- 1 回目: 初回の取り込みと、架空の保有・資産推移を入れる（録画しない）
{
  console.log('準備: 架空のデータを取り込んでいます…')
  const app = await electron.launch({ args: ['.'], env })
  const page = await app.firstWindow()
  await page.getByRole('dialog').waitFor()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await idle(page)
  await call(page, 'portfolio.save', { holdings: HOLD })
  await idle(page)
  await setTheme(page)
  const today = (await call(page, 'folio.series', {})).points.at(-1)
  const end = today ? today.value / today.cost : 1.05
  await app.close()
  writeHistory(userData, history(end, NOW))
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

/** F6 でペインを順に移り、そのペインにフォーカスを置く */
async function focusPane(widget, n = 0) {
  const target = page.locator(`[data-widget="${widget}"]`).nth(n)
  for (let i = 0; i < 20; i++) {
    if (await target.evaluate((e) => e.classList.contains('focused'))) return
    await page.keyboard.press('F6')
    await sleep(120)
  }
}
const board = page.locator('[data-widget="board"]')
const breadth = page.locator('[data-widget="breadth"]')
const chart = page.locator('[data-widget="chart"]').first()
const folio = page.locator('[data-widget="folio"]')
/** Tab でカードを巡り、name のカードを選ぶ */
async function cardTo(name) {
  const target = folio.locator(`.c-${name}`)
  for (let i = 0; i < 10; i++) {
    if (await target.evaluate((e) => e.classList.contains('focus'))) return
    await press(page, 'Tab')
    await sleep(700)
  }
}

await overlay(page)
await page.evaluate(() => document.querySelectorAll('.toasts .toast').forEach((t) => t.remove()))
await card(page, [
  'elecxstock 0.1.3',
  'マーケットのタブが新しくなりました',
  'マーケット一覧（指数・為替・金利・商品・暗号資産）・騰落（市場・業種別）・目標利回りの線',
  '※ 画面は開発中のものです。株価・指数・保有などの値はすべて架空のデモデータです',
])
console.log(`${WAIT} 秒後に始めます。いまのうちに録画を始めてください`)
await sleep(WAIT * 1000 * SPEED)
await sleep(2500)
await card(page, null)
await sleep(800)
await shot(page, 'title')

// 1. マーケットのタブ（Ctrl+Shift+1）: 新しい並び
await press(page, 'Control+Shift+Digit1')
await board.locator('tbody tr').first().waitFor()
await breadth.locator('tbody tr').first().waitFor()
await caption(page, 'Ctrl+Shift+1 でマーケットのタブ。左上にマーケット一覧、右にヒートマップ・チャート・騰落、下に市場の推移を並べました')
await sleep(4000)
await shot(page, 'market')

// 2. マーケット一覧: ↑↓ でチャートが追従、G で区分、← → と S で並べ替え
await focusPane('board')
await caption(page, 'マーケット一覧は日経平均・TOPIX 連動 ETF などの指数と、為替・金利・商品・暗号資産。↑↓ でチャートが追従します')
await press(page, 'Home')
await sleep(900)
for (let i = 0; i < 3; i++) {
  await press(page, 'ArrowDown')
  await sleep(1300)
}
await shot(page, 'board-chart')
await caption(page, 'G で区分を切り替えます（日本・米国・アジア・為替・金利・商品・暗号資産）')
for (let i = 0; i < 4; i++) {
  await press(page, 'KeyG')
  await board.locator('tbody tr').first().waitFor()
  await sleep(1500)
}
await press(page, 'ArrowDown')
await sleep(1500)
await shot(page, 'board-fx')
await caption(page, '← → で列を選び、S で並べ替え。キーとタブはウォッチリストと同じです')
await press(page, 'Control+PageUp', 'Control+PageUp', 'Control+PageUp', 'Control+PageUp')
await sleep(1200)
await press(page, 'ArrowRight', 'KeyS')
await sleep(1800)
await shot(page, 'board-sort')
await press(page, 'KeyS')
await sleep(1200)

// 3. 騰落: 市場（プライム・J-REIT）と業種別。Enter で中へ、Esc で戻る
await focusPane('breadth')
await caption(page, '騰落はプライムと J-REIT の値上がり・値下がり・新高値・新安値・売買代金')
await sleep(3500)
await shot(page, 'breadth')
await caption(page, 'G で業種別（33 業種、時価総額の加重の騰落率）。Enter でその業種の銘柄の一覧に入ります')
await press(page, 'KeyG')
await breadth.getByRole('tab', { selected: true, name: /業種別/ }).waitFor()
await sleep(1500)
await press(page, 'Home', 'ArrowDown', 'ArrowDown')
await sleep(1200)
await press(page, 'Enter')
await breadth.locator('tbody tr[data-id]').first().waitFor()
await sleep(1500)
await caption(page, '↓ でめくると、チャートがその銘柄になります')
for (let i = 0; i < 3; i++) {
  await press(page, 'ArrowDown')
  await sleep(1300)
}
await shot(page, 'breadth-in')
await caption(page, 'Esc で戻ると、入った業種の行を選んだまま。ヒートマップの業種の中から戻るときも同じです')
await press(page, 'Escape')
await breadth.locator('tbody tr.sel[data-key]').waitFor()
await sleep(3000)
await shot(page, 'breadth-back')

// 4. 目標利回りの線: インカムのタブのチャートで、設定の「チャート」から ON にして目標を打つ
await press(page, 'Control+Shift+Digit6')
await focusPane('chart')
await caption(page, 'インカムのタブ。チャートに J-REIT の日本ビルファンドを出します（コードを打つと銘柄ジャンプ）')
await press(page, 'Digit8', 'Digit9', 'Digit5', 'Digit1')
await page.locator('.dialog.jump .it.sel').waitFor()
await sleep(900)
await press(page, 'Enter')
await chart.locator('.legend').waitFor()
await sleep(1200)
// チャートを画面いっぱいに（Ctrl+Shift+Enter でペインを最大化）
await caption(page, 'Ctrl+Shift+Enter でチャートを画面いっぱいに')
await press(page, 'Control+Shift+Enter')
await page.locator('.pane.maxed[data-widget="chart"]').waitFor()
// マウスを窓の左上の角へ（実際のカーソルが窓の上にあると十字線が出て、凡例がその日の値になる）
await page.mouse.move(0, 0)
await sleep(1500)
await caption(page, '設定（Ctrl+,）の「チャート」で目標利回りの線を ON にし、目標の利回りを 3 つまで打ちます')
await press(page, 'Control+Comma')
const dlg = page.getByRole('dialog', { name: '設定' })
await dlg.waitFor()
await sleep(900)
await press(page, 'ArrowDown', 'ArrowDown')
await sleep(900)
await press(page, 'Tab')
await sleep(700)
await press(page, 'Space')
await sleep(1200)
await press(page, 'Tab', 'Control+a')
for (const [i, v] of ['3.5', '4.5', '5.5'].entries()) {
  if (i) await press(page, 'Tab')
  await page.keyboard.type(v, { delay: 160 / SPEED })
  await sleep(700)
}
await press(page, 'Enter')
await sleep(1500)
await shot(page, 'yield-settings')
await press(page, 'Escape')
await dlg.waitFor({ state: 'detached' })
await chart.locator('.legend .yl').first().waitFor()
await page.mouse.move(0, 0)
await caption(page, '過去 12 か月の配当 ÷ 目標利回りの株価に点線。凡例に目標の株価と、今の株価からの差を出します')
await sleep(4500)
await shot(page, 'yield-chart')
await press(page, 'Control+Shift+Enter')
await sleep(600)
// グリッドのタイルにも（目盛りの範囲に入る線だけ）
await press(page, 'Control+Shift+Digit3')
await page.locator('[data-widget="grid"] canvas[data-yield]:not([data-yield=""])').first().waitFor()
await caption(page, 'グリッドのタイルにも引きます（目盛りの範囲に入る線だけ）。並べたまま目標の株価と見比べられます')
await sleep(4500)
await shot(page, 'yield-grid')

// 5. ポートフォリオのタブ（Ctrl+Shift+9）の手直し
await press(page, 'Control+Shift+Digit9')
await folio.locator('.c-hero').waitFor()
await folio.locator('.c-hist svg').first().waitFor()
await caption(page, 'ポートフォリオのタブ: 評価額のカードの比べる相手は「TOPIX ETF」（TOPIX 連動 ETF 1306）と出すようにしました')
await sleep(4000)
await shot(page, 'folio')
await caption(page, 'Tab でカードを選び替えても、カードの大きさと資産構成のタイルの並びは変わりません')
await cardTo('alloc')
await cardTo('contrib')
await cardTo('div')
await sleep(1500)
await shot(page, 'folio-cards')
await caption(page, '')

// 6. 終わりの画面
await card(page, [
  'elecxstock 0.1.3',
  'マーケット一覧・騰落・目標利回りの線・ポートフォリオの手直し',
  '無料・オープンソース（MIT） ・ Windows ・ github.com/kurouna/elecxstock',
  'チャート: TradingView Lightweight Charts™（Apache-2.0）',
  '※ 画面は開発中のものです。動画の株価・指数・保有などの値はすべて架空のデモデータです',
])
await shot(page, 'end')
console.log('デモが終わりました。窓を閉じると終わります')
if (process.env.DEMO_EXIT === '1') await app.close()
else await new Promise((r) => app.on('close', r))
