// 使い方の案内のデモ: 中長期の投資家が最初に行う流れ（録画は利用者がキャプチャアプリで行う）。スタブのプロバイダ（架空の値）で起動し、
// 画面の下に字幕、右下に押したキーを重ねて出す（録画のときだけ。アプリには入れない）。
// 筋: マーケットのタブで地合いを見る → MTF のタブで銘柄ジャンプからウォッチリストに入れ、週足・月足で流れを見る →
// スクリーナーのタブで条件を決める → 結果の銘柄を銘柄情報・チャート・配当シミュレータで確かめる（それぞれ最大化して全体を見せる）→
// 設定で目標利回りの線を ON にしてチャートに出し、その株価でアラートを作る。字幕は画面にあること・事実だけを書く。
//
// 使い方: npm run build && npm run demo:user-guide
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
import { caption, card, overlay, press, SIZE, SPEED, setTheme, shot, sleep, typeCode, WAIT } from './demo-kit.mjs'
import { waitIdle } from './wait-idle.mjs'

const userData = mkdtempSync(join(tmpdir(), 'elecxstock-demo-'))
// 日時を固定する（平日の大引けのあと。録り直しても同じ足・同じ値になる）
const NOW = '2026-11-13'
const env = {
  ...process.env,
  ELECXSTOCK_PROVIDER: 'stub',
  ELECXSTOCK_USER_DATA: userData,
  ELECXSTOCK_NOW: `${NOW}T18:00:00+09:00`,
}
const idle = (page) => waitIdle(page, 120_000)

// ---------------------------------------------------------------- 1 回目: 初回の取り込み（録画しない）。ウォッチリストは空のまま（デモで入れる）
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

const current = page.locator('.presets [aria-current="true"]')
const widget = (w) => page.locator(`[data-widget="${w}"]`).first()
const board = widget('board')
const breadth = widget('breadth')
const watchlist = widget('watchlist')
const screener = widget('screener')
const info = widget('info')
const chart = widget('chart')
const divsim = widget('divsim')

/** F6 でペインを順に移り、そのペインにフォーカスを置く */
async function focusPane(target) {
  for (let i = 0; i < 30; i++) {
    if (await target.evaluate((e) => e.classList.contains('focused'))) return
    await page.keyboard.press('F6')
    await sleep(120)
  }
  throw new Error('demo: could not focus the pane')
}
/** レイアウトのタブを替え、そのタブになるまで待つ */
async function tabTo(n, name) {
  await press(page, `Control+Shift+Digit${n}`)
  await current.filter({ hasText: name }).waitFor()
  await sleep(500)
}
/** フォーカスしているペインを最大化し、動きが終わるまで待つ */
async function maximize() {
  await press(page, 'Control+Shift+Enter')
  await page.locator('.pane.maxed').waitFor()
  await page.mouse.move(0, 0)
  await sleep(700)
}
/** 最大化を戻し、元の場所に着くまで待つ */
async function restore() {
  // ペインの中の選択（配当の棒・カードなど）があると、1 回目の Esc はそれを外す
  for (let i = 0; i < 3 && (await page.locator('.pane.maxed').count()); i++) {
    await press(page, 'Escape')
    await page
      .locator('.pane.maxed')
      .waitFor({ state: 'detached', timeout: 1500 })
      .catch(() => {})
  }
  if (await page.locator('.pane.maxed').count()) throw new Error('demo: the pane did not restore')
  await sleep(700)
}
/** 銘柄ジャンプ: コードを打って候補が出るまで待つ */
async function jump(code) {
  await typeCode(page, code)
  await page.locator('.dialog.jump .it.sel').waitFor()
  await sleep(900)
}
/** 条件を選ぶダイアログで項目を探して足し、値を打つ（打った文字が見えるように、ゆっくり打つ） */
async function addCondition(search, value) {
  await press(page, 'Insert')
  await page.locator('.dialog.picker').waitFor()
  await sleep(900)
  await page.keyboard.type(search, { delay: 140 / SPEED })
  await sleep(1200)
  await press(page, 'Enter')
  await page.locator('.dialog.picker').waitFor({ state: 'detached' })
  await sleep(700)
  await typeValue(value)
}
/** フォーカスしている条件の値を Enter で打つ */
async function typeValue(value) {
  await press(page, 'Enter')
  await page.locator('.dialog').last().waitFor()
  await page.keyboard.press('Control+a')
  await page.keyboard.type(value, { delay: 160 / SPEED })
  await sleep(600)
  await press(page, 'Enter')
  await sleep(1500)
}
/** スクリーナーの結果の件数（「10 / 52 件」の先の数） */
async function hits() {
  const s = (await screener.textContent()) ?? ''
  return Number(/(\d+)\s*\/\s*\d+\s*件/.exec(s)?.[1] ?? 0)
}

// 録画の前に: マーケットのタブを開いておく
await page.keyboard.press('Control+Shift+Digit1')
await current.filter({ hasText: 'マーケット' }).waitFor()
await board.locator('tbody tr').first().waitFor()

await overlay(page)
await page.evaluate(() => document.querySelectorAll('.toasts .toast').forEach((t) => t.remove()))
await card(page, [
  'elecxstock の使い方',
  '中長期の投資で、はじめに行う流れ',
  '市場を見る → 銘柄を登録する → 条件で探す → 銘柄情報・チャート・配当シミュレータで確かめる → 目標の株価でアラート',
  '※ 画面は開発中のものです。株価・利回りなどの値はすべて架空のデモデータです',
])
console.log(`${WAIT} 秒後に始めます。いまのうちに録画を始めてください`)
await sleep(WAIT * 1000 * SPEED)
await sleep(2500)
await card(page, null)
await sleep(800)
await shot(page, 'title')

// ---------------------------------------------------------------- 1. マーケットのタブで地合いを見る
await caption(page, 'マーケットタブ（Ctrl+Shift+1）で、まず市場全体の地合いを確認')
await sleep(3500)
await shot(page, 'market')
await focusPane(board)
await caption(page, 'マーケット一覧: 指数・為替・金利・商品。↑↓ で選ぶと右のチャートが切り替わる')
await press(page, 'Home')
for (let i = 0; i < 3; i++) {
  await press(page, 'ArrowDown')
  await sleep(1100)
}
await shot(page, 'market-board')
await focusPane(breadth)
await caption(page, '騰落: プライムと J-REIT の値上がり・値下がりの銘柄数、新高値・新安値')
await sleep(3000)
await caption(page, 'G で業種別に切り替え。どの業種が買われているかを確認')
await press(page, 'KeyG')
await breadth.getByRole('tab', { selected: true, name: /業種別/ }).waitFor()
await sleep(3000)
await shot(page, 'market-sectors')
await press(page, 'KeyG')
await sleep(600)

// ---------------------------------------------------------------- 2. MTF のタブ: 銘柄ジャンプでウォッチリストに入れる
await tabTo(4, 'MTF')
await focusPane(watchlist)
await caption(page, 'MTF タブ（Ctrl+Shift+4）: 左にウォッチリスト、右に日足・週足・月足のチャート')
await sleep(3500)
await shot(page, 'mtf')
await caption(page, 'どこでも銘柄コード（1〜9 から）を打つと銘柄ジャンプ')
await jump('8058')
await shot(page, 'jump')
await caption(page, 'ウォッチリストにフォーカスがあるとき、Ctrl+Enter でそのリストに追加して表示')
await sleep(1500)
await press(page, 'Control+Enter')
await page.locator('.dialog.jump').waitFor({ state: 'detached' })
await sleep(2200)
await shot(page, 'jump-added')
await caption(page, '続けて気になる銘柄を登録')
for (const code of ['9434', '8306']) {
  await jump(code)
  await press(page, 'Control+Enter')
  await page.locator('.dialog.jump').waitFor({ state: 'detached' })
  await sleep(1200)
}
await caption(page, '↑↓ で銘柄を選ぶと、日足・週足・月足が切り替わる。中長期では週足・月足で大きな流れを確認')
await press(page, 'Home')
await sleep(1500)
for (let i = 0; i < 2; i++) {
  await press(page, 'ArrowDown')
  await sleep(1800)
}
await shot(page, 'mtf-list')

// ---------------------------------------------------------------- 3. スクリーナーのタブ: 条件で探す
await tabTo(2, 'スクリーナー')
await focusPane(screener)
await caption(page, 'スクリーナータブ（Ctrl+Shift+2）: 左から スクリーナー・銘柄情報・チャート・配当シミュレータ')
await sleep(3800)
await shot(page, 'screener')
await caption(page, '初期の条件は「高配当銘柄」。Tab で条件へ移り、Enter で値を打つ（実績利回り 4% → 3.5%）')
await press(page, 'Tab')
await sleep(1200)
await typeValue('3.5')
await shot(page, 'screener-yield')
await caption(page, 'Insert で条件を追加。打って項目を絞り、Enter で決定。連続非減配年数 5 年以上')
await addCondition('非減配', '5')
await shot(page, 'screener-nocut')
await caption(page, '割安さも見る: PBR 1.5 倍以下')
await addCondition('PBR', '1.5')
await shot(page, 'screener-pbr')
await caption(page, `条件を変えるとすぐに結果を絞り直す（${await hits()} 件）`)
await press(page, 'Escape')
await sleep(2500)

// ---------------------------------------------------------------- 4. 結果の行を動かすと銘柄情報・チャートが付いてくる
await caption(page, '結果の行を ↑↓ で動かすと、銘柄情報とチャートが追従')
await press(page, 'Home')
await sleep(1300)
// 目標利回り（4.5%）の線が今の株価の下に来る銘柄（実績利回りが 4.5% 未満）を選ぶ
const rows = await screener.locator('tbody tr').allInnerTexts()
const yields = rows.map((r) => Number(/([\d.]+)%\s*$/.exec(r.trim())?.[1] ?? 0))
let pick = yields.findIndex((y) => y > 0 && y < 4.3)
if (pick < 0) pick = 0
for (let i = 0; i < Math.max(pick, 2); i++) {
  await press(page, 'ArrowDown')
  await sleep(1300)
}
for (let i = Math.max(pick, 2); i > pick; i--) {
  await press(page, 'ArrowUp')
  await sleep(1300)
}
await sleep(800)
await shot(page, 'screener-rows')

// ---------------------------------------------------------------- 5. 銘柄情報を最大化して全体を見る
await focusPane(info)
await caption(page, '銘柄情報にフォーカスを移し（F6）、Ctrl+Shift+Enter で最大化')
await sleep(1500)
await maximize()
await caption(page, '決算発表・権利付最終日までの日数、主な指標、配当の推移')
await sleep(3800)
await shot(page, 'info-max')
await caption(page, '配当の棒は ← → で選び、Y で「年ごと」と「回ごと」を切り替え')
await press(page, 'ArrowLeft', 'ArrowLeft', 'ArrowLeft')
await sleep(1200)
await press(page, 'KeyY')
await sleep(2000)
await shot(page, 'info-per-time')
await press(page, 'KeyY')
await sleep(600)
await caption(page, '連続増配・利回りの 3 年の範囲・配当込みの騰落率と最大下落率も一画面で')
await sleep(3800)
await shot(page, 'info-more')
await caption(page, 'Esc で元の大きさに戻す')
await restore()

// ---------------------------------------------------------------- 6. チャートを最大化して長い期間を見る
await focusPane(chart)
await caption(page, 'チャートも最大化して、長い期間の値動きを確認')
await maximize()
await sleep(1800)
await caption(page, 'W で週足。Alt+6 で全期間（保存しているのは既定で 3 年）')
await press(page, 'KeyW')
await sleep(1500)
await press(page, 'Alt+Digit6')
await sleep(3000)
await shot(page, 'chart-weekly')
await caption(page, 'M で月足。D で日足に戻す。Alt+1〜6 で 3 か月〜全期間')
await press(page, 'KeyM')
await sleep(3000)
await shot(page, 'chart-monthly')
await press(page, 'KeyD', 'Alt+Digit3')
await sleep(1500)
await restore()

// ---------------------------------------------------------------- 7. 配当シミュレータを最大化する
await focusPane(divsim)
await caption(page, '配当シミュレータ: 選んだ銘柄を持っていたら、配当と値動きはどうだったか')
await divsim.locator('.c-hero').first().waitFor()
await sleep(1200)
await maximize()
await divsim.locator('.c-hero').first().waitFor()
await sleep(3500)
await shot(page, 'divsim-past')
await caption(page, 'Tab でカードを巡る。受け取った配当・配当込みの値動き・TOPIX 連動 ETF との比較')
for (let i = 0; i < 3; i++) {
  await press(page, 'Tab')
  await sleep(1700)
}
await shot(page, 'divsim-cards')
await press(page, 'Escape')
await caption(page, 'PageDown で「これから」。今の配当が続いたら、受け取る配当の見込みと減配シナリオ')
await press(page, 'PageDown')
await divsim.locator('.c-hero').first().waitFor()
await sleep(4000)
await shot(page, 'divsim-ahead')
await caption(page, 'O で対象を「1 銘柄」⇔「群」に切り替え。群はスクリーナーの結果の銘柄をまとめて持った場合')
await press(page, 'KeyO')
await divsim.locator('.c-hero').first().waitFor()
await sleep(4000)
await shot(page, 'divsim-group')
await press(page, 'PageUp')
await divsim.locator('.c-hero').first().waitFor()
await caption(page, 'PageUp で「過去」。条件で選んだ銘柄を均等に持っていたら。TOPIX 連動 ETF と比べて条件を確かめる')
await sleep(4000)
await shot(page, 'divsim-group-past')
await press(page, 'KeyO')
await sleep(1000)
await restore()

// ---------------------------------------------------------------- 8. 目標利回りの線を ON にしてチャートに出す
await focusPane(chart)
await maximize()
await caption(page, '目標利回りの線: 設定（Ctrl+,）の「チャート」で ON にし、目標の利回りを打つ')
await sleep(2000)
await press(page, 'Control+Comma')
const settings = page.getByRole('dialog', { name: '設定' })
await settings.waitFor()
await sleep(900)
await press(page, 'ArrowDown', 'ArrowDown')
await settings.getByRole('tab', { selected: true, name: 'チャート' }).waitFor()
await sleep(900)
await press(page, 'Tab')
await sleep(700)
await press(page, 'Space')
await sleep(1200)
await press(page, 'Tab', 'Control+a')
for (const [i, v] of ['4.5', '5.5'].entries()) {
  if (i) await press(page, 'Tab')
  await page.keyboard.type(v, { delay: 160 / SPEED })
  await sleep(700)
}
await press(page, 'Enter')
await sleep(1500)
await shot(page, 'yield-settings')
await press(page, 'Escape')
await settings.waitFor({ state: 'detached' })
const yl = chart.locator('.legend .yl').first()
await yl.waitFor()
await page.mouse.move(0, 0)
await caption(page, '過去 12 か月の配当 ÷ 目標利回りの株価に点線。凡例に目標の株価と、今の株価からの差')
await sleep(4500)
await shot(page, 'yield-chart')

// ---------------------------------------------------------------- 9. 目標の株価でアラートを作る
// 目標 4.5% の株価（凡例の「目標 4.5% 1,234 (−5.0%)」の株価）
const target = Number(/目標\s*\S+\s+([\d,.]+)/.exec((await yl.textContent()) ?? '')?.[1]?.replaceAll(',', '') ?? 0)
await caption(page, 'その株価まで下がったら知らせる: Ctrl+Alt+A で、表示中の銘柄にアラートを作る')
await sleep(1500)
await press(page, 'Control+Alt+KeyA')
const form = page.locator('.dialog.alertform')
await form.waitFor()
await sleep(2200)
await shot(page, 'alert-form')
await caption(page, `条件は「終値 ≤」。Enter で値を打つ（目標利回り 4.5% の株価 ${target.toLocaleString('ja-JP')} 円）`)
await press(page, 'Enter')
await sleep(500)
await page.keyboard.press('Control+a')
await page.keyboard.type(String(target), { delay: 160 / SPEED })
await sleep(700)
await press(page, 'Enter')
await sleep(2200)
await shot(page, 'alert-value')
await caption(page, 'Ctrl+Enter で作成。チャートにベルの付いた点線（しきい値）を表示')
await press(page, 'Control+Enter')
await form.waitFor({ state: 'detached' })
await page.mouse.move(0, 0)
await sleep(3800)
await shot(page, 'alert-chart')
await caption(page, '取得のジョブの終わりに判定し、トースト・Windows の通知・ベルで知らせる。Ctrl+Alt+L で一覧と履歴')
await press(page, 'Control+Alt+KeyL')
await sleep(3500)
await shot(page, 'alerts')
await press(page, 'Escape')
await sleep(800)
await restore()
await caption(page, '')

// ---------------------------------------------------------------- 10. 終わりの画面
await card(page, [
  'elecxstock',
  '市場を見る → 登録する → 探す → 確かめる → 待つ。すべてキーボードで（マウスでも）',
  'F1 でキーの一覧 ・ Ctrl+K でコマンドバー',
  '無料・オープンソース（MIT） ・ Windows ・ github.com/kurouna/elecxstock',
  'チャート: TradingView Lightweight Charts™（Apache-2.0）',
  '※ 画面は開発中のものです。動画の株価などの値はすべて架空のデモデータです',
])
await shot(page, 'end')
console.log('デモが終わりました。窓を閉じると終わります')
if (process.env.DEMO_EXIT === '1') await app.close()
else await new Promise((r) => app.on('close', r))
