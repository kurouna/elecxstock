// v0.1.1 → v0.1.2 の変わったところのデモ（録画は利用者がキャプチャアプリで行う）。スタブのプロバイダ（架空の値）で起動し、
// キー操作だけで場面を進める。画面の下に字幕、右下に押したキーを重ねて出す（録画のときだけ。アプリには入れない）。
// 話題: ポートフォリオのタブ（概要: 評価額・資産推移と十字線・ベンチマーク・資産構成・口座の構成比・損益寄与。
// 配当の分析: 年間配当と増減の要因・配当見込みの月・配当の内訳・分類ごとの表）
//
// 使い方: npm run build && npm run demo:0.1.2
//   DEMO_SIZE=1920x1080  窓の中身の大きさ（既定は最大化。キャプチャする大きさに合わせる）
//   DEMO_WAIT=8          タイトルを出してから始めるまでの秒数（その間に録画を始める）
//   DEMO_SPEED=1         速さの倍率（1.5 で速く、0.8 でゆっくり）
//   DEMO_SHOTS=<フォルダ> 場面ごとにスクリーンショットを残す（確認用）。DEMO_EXIT=1 で終わったら閉じる
// 終わったら終わりの画面のまま止まる。窓を閉じると終わる。
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from '@playwright/test'
import { call, caption, card, overlay, press, SIZE, SPEED, shot, sleep, WAIT } from './demo-kit.mjs'
import { HOLD, history, writeHistory } from './folio-fixture.mjs'
import { waitIdle } from './wait-idle.mjs'

const userData = mkdtempSync(join(tmpdir(), 'elecxstock-demo-'))
// 日時を固定する（平日の大引けのあと。予定までの日数・配当見込みの月が録り直しても同じになる）
const NOW = '2026-11-13'
const env = {
  ...process.env,
  ELECXSTOCK_PROVIDER: 'stub',
  ELECXSTOCK_USER_DATA: userData,
  ELECXSTOCK_NOW: `${NOW}T18:00:00+09:00`,
}
const idle = (page) => waitIdle(page, 120_000)

// ---------------------------------------------------------------- 1 回目: 初回の取り込みと、架空の保有を入れる（録画しない）
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
  // 今日の評価額 ÷ 取得額（スタブの架空の終値で決まる）
  const today = (await call(page, 'folio.series', {})).points.at(-1)
  const end = today ? today.value / today.cost : 1.05
  await app.close()
  // 架空の資産推移（1 年半分）を記録の置き場所に書く。2 回目の起動で今日の分が足される
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

const folio = page.locator('[data-widget="folio"]')
/** Tab でカードを巡り、name のカードを選ぶ */
async function cardTo(name) {
  const target = folio.locator(`.c-${name}`)
  for (let i = 0; i < 10; i++) {
    if (await target.evaluate((e) => e.classList.contains('focus'))) return
    await press(page, 'Tab')
    await sleep(500)
  }
}

await overlay(page)
await page.evaluate(() => document.querySelectorAll('.toasts .toast').forEach((t) => t.remove()))
await card(page, [
  'elecxstock 0.1.2',
  'ポートフォリオのタブができました',
  '資産推移の記録・資産構成と損益寄与・配当の分析',
  '※ 画面は開発中のものです。株価・配当・保有などの値はすべて架空のデモデータです',
])
console.log(`${WAIT} 秒後に始めます。いまのうちに録画を始めてください`)
await sleep(WAIT * 1000 * SPEED)
await sleep(2500)
await card(page, null)
await sleep(800)
await shot(page, 'title')

// 1. ポートフォリオのタブ（Ctrl+Shift+9）: 概要の段
await press(page, 'Control+Shift+Digit9')
await folio.locator('.c-hero').waitFor()
await folio.locator('.c-hist svg').first().waitFor()
await caption(page, 'Ctrl+Shift+9 でポートフォリオのタブ。評価額・含み損益・トータル損益と、口座の構成比を上にまとめます')
await sleep(3500)
await shot(page, 'overview')

// 2. 資産推移: 毎日の記録。← → で日を動かすと、その日の評価額・構成・損益寄与になる
await cardTo('hist')
await caption(page, '資産推移は毎日の更新で記録します。← → で日を動かすと、その日の評価額・資産構成・損益寄与に変わります')
await press(page, 'ArrowLeft')
// 押し続けたように少しずつ戻す（右下のキーの表示は最初の 1 回だけ）
for (let i = 0; i < 70; i++) {
  await page.keyboard.press('ArrowLeft')
  await sleep(40)
}
await sleep(1500)
await shot(page, 'cross')
await press(page, 'Escape')
await sleep(800)
// 期間（Alt+1〜6）と % 表示・ベンチマーク
await caption(page, 'Alt+1〜6 で期間、P で % 表示（時間加重の収益率）、B で日経平均・TOPIX 連動 ETF（1306）と比べます')
await press(page, 'Alt+Digit3')
await sleep(1400)
await press(page, 'KeyB')
await sleep(2200)
await shot(page, 'bench')
await press(page, 'KeyB')
await press(page, 'KeyB')
await press(page, 'KeyP')
await sleep(1200)

// 3. 資産構成（ツリーマップ）: G で分け方、矢印でタイル、選ぶとチャートと銘柄情報に出る
await cardTo('alloc')
await caption(page, '資産構成は業種ごとのツリーマップ。矢印でタイルを選ぶと、右のチャートと銘柄情報に出ます')
for (const k of ['ArrowRight', 'ArrowDown', 'ArrowRight']) {
  await press(page, k)
  await sleep(1100)
}
await shot(page, 'alloc')
await caption(page, 'G で分け方を 17 業種・口座・種別に切り替えます')
for (let i = 0; i < 2; i++) {
  await press(page, 'KeyG')
  await sleep(1800)
}
await shot(page, 'alloc-acct')

// 4. 損益寄与: T で今日・今月・今年・取得来
await cardTo('contrib')
await caption(page, '損益寄与は T で今日・今月・今年・取得来。どの銘柄が増やし、どの銘柄が減らしたかを並べます')
for (let i = 0; i < 3; i++) {
  await press(page, 'KeyT')
  await sleep(1500)
}
await press(page, 'ArrowDown', 'ArrowDown')
await sleep(1200)
await shot(page, 'contrib')
await press(page, 'Escape')
await sleep(600)

// 配当見込み（概要の段のカード）: 今後 12 か月の月
await cardTo('div')
await caption(page, '今後 12 か月の配当見込みを月ごとに。← → で月を選ぶと、その月の銘柄と額が出ます')
for (let i = 0; i < 4; i++) {
  await press(page, 'ArrowRight')
  await sleep(1000)
}
await shot(page, 'div-month')
await press(page, 'Escape')
await sleep(600)

// 5. 配当の分析の段（PgDn）
await press(page, 'PageDown')
await folio.locator('.c-dsum').waitFor()
await caption(page, 'PgDn で配当の分析。年間配当（税引後）の前年比と、増配・減配・新規・買い増し・売却に分けた増減の要因です')
await sleep(4000)
await shot(page, 'div')
// 配当の内訳（ドーナツ）
await cardTo('dshare')
await caption(page, '配当の内訳は G で銘柄・業種・口座などに分けられます')
for (let i = 0; i < 2; i++) {
  await press(page, 'KeyG')
  await sleep(1600)
}
await shot(page, 'dshare')
// 分類ごとの表
await cardTo('dtab')
await caption(page, '分類ごとの表は → で開き、S で年間・前年比・利回り・取得利回り・増配率の順に並べ替えます')
await press(page, 'Home', 'ArrowRight')
await sleep(1200)
await press(page, 'ArrowDown')
await sleep(900)
await press(page, 'KeyS')
await sleep(1500)
await press(page, 'KeyS')
await sleep(1500)
await shot(page, 'dtab')
await caption(page, '')

// 6. 終わりの画面
await card(page, [
  'elecxstock 0.1.2',
  'ポートフォリオのタブ: 資産推移の記録・資産構成と損益寄与・配当の分析',
  '無料・オープンソース（MIT） ・ Windows ・ github.com/kurouna/elecxstock',
  'チャート: TradingView Lightweight Charts™（Apache-2.0）',
  '※ 画面は開発中のものです。動画の株価・配当・保有などの値はすべて架空のデモデータです',
])
await shot(page, 'end')
console.log('デモが終わりました。窓を閉じると終わります')
if (process.env.DEMO_EXIT === '1') await app.close()
else await new Promise((r) => app.on('close', r))
