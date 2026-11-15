// v0.1.0 → v0.1.1 の変わったところのデモ（録画は利用者がキャプチャアプリで行う）。スタブのプロバイダ（架空の値）で起動し、
// キー操作だけで場面を進める。画面の下に字幕、右下に押したキーを重ねて出す（録画のときだけ。アプリには入れない）。
// 話題: スクリーナー（新しい 23 項目・分類ごとのダイアログ・金額の単位・新しい並び）、銘柄情報（予定・配当の推移・配当込みの値動き）、
// アラート、ペインの種類を変える・すべてのタブのレイアウトを戻す
//
// 使い方: npm run build && npm run demo:0.1.1
//   DEMO_SIZE=1920x1080  窓の中身の大きさ（既定は最大化。キャプチャする大きさに合わせる）
//   DEMO_WAIT=8          タイトルを出してから始めるまでの秒数（その間に録画を始める）
//   DEMO_SPEED=1         速さの倍率（1.5 で速く、0.8 でゆっくり）
//   DEMO_SHOTS=<フォルダ> 場面ごとにスクリーンショットを残す（確認用）。DEMO_EXIT=1 で終わったら閉じる
// 終わったら終わりの画面のまま止まる。窓を閉じると終わる。
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from '@playwright/test'
import { call, caption, card, overlay, press, SIZE, SPEED, shot, sleep, typeCode, WAIT } from './demo-kit.mjs'

const userData = mkdtempSync(join(tmpdir(), 'elecxstock-demo-'))
// 日時を固定する（平日の大引けのあと。決算発表・権利付最終日までの日数が録り直しても同じになる）
const env = {
  ...process.env,
  ELECXSTOCK_PROVIDER: 'stub',
  ELECXSTOCK_USER_DATA: userData,
  ELECXSTOCK_NOW: '2026-11-13T18:00:00+09:00',
}
const idle = (page) =>
  page
    .locator('footer')
    .getByText(/待機|Idle/)
    .waitFor({ timeout: 120_000 })

// ---------------------------------------------------------------- 1 回目: 初回の取り込みと、架空のウォッチリスト・保有を入れる（録画しない）
{
  console.log('準備: 架空のデータを取り込んでいます…')
  const app = await electron.launch({ args: ['.'], env })
  const page = await app.firstWindow()
  await page.getByRole('dialog').waitFor()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await idle(page)
  const u = await call(page, 'user.load')
  const fav = ['JP:8058', 'JP:7203', 'JP:8306', 'JP:9434', 'JP:94345', 'JP:8951', 'JP:3462', 'JP:8963', 'JP:2914', 'JP:8766']
  const lists = u.watchlists.map((w) => (w.builtin === 'favorites' ? { ...w, items: fav } : w))
  await call(page, 'user.saveWatchlists', { watchlists: lists })
  // 保有（数量・取得単価はすべて架空）。銘柄情報の保有の帯と、スクリーナーの保有の項目に使う
  await call(page, 'portfolio.save', {
    holdings: [
      { code: '7203', account: 'tokutei', quantity: 200, avgCost: 15200 },
      { code: '8058', account: 'nisa_growth', quantity: 300, avgCost: 9800 },
      { code: '8951', account: 'nisa_growth', quantity: 10, avgCost: 88000 },
      { code: '94345', account: 'nisa_growth', quantity: 300, avgCost: 4100 },
    ],
  })
  await idle(page)
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

/** F6 でペインを順に移り、そのペインにフォーカスを置く */
async function focusPane(widget, n = 0) {
  const target = page.locator(`[data-widget="${widget}"]`).nth(n)
  for (let i = 0; i < 20; i++) {
    if (await target.evaluate((e) => e.classList.contains('focused'))) return
    await page.keyboard.press('F6')
    await sleep(120)
  }
}
/** 条件を選ぶダイアログで項目を探して足す（打った文字が見えるように、ゆっくり打つ） */
async function addField(text, shift = false) {
  await page.keyboard.type(text, { delay: 140 / SPEED })
  await sleep(900)
  await press(page, shift ? 'Shift+Enter' : 'Enter')
  if (shift) {
    // 続けて足すときは、検索を消して次の項目へ
    await page.keyboard.press('Control+a')
    await page.keyboard.press('Backspace')
  }
}

await overlay(page)
await page.evaluate(() => document.querySelectorAll('.toasts .toast').forEach((t) => t.remove()))
await card(page, [
  'elecxstock 0.1.1',
  'スクリーナーと銘柄情報が新しくなりました',
  '条件の項目が 58 に・分類ごとに選ぶダイアログ・予定と配当の推移・アラート',
  '※ 画面は開発中のものです。株価・利回りなどの値はすべて架空のデモデータです',
])
console.log(`${WAIT} 秒後に始めます。いまのうちに録画を始めてください`)
await sleep(WAIT * 1000 * SPEED)
await sleep(2500)
await card(page, null)
await sleep(800)
await shot(page, 'title')

// 1. スクリーナーのタブの新しい並び: スクリーナー・銘柄情報・チャート 2 枚
await press(page, 'Control+Shift+Digit2')
await caption(page, 'スクリーナーのタブは、結果・銘柄情報・チャートを横に並べる形になりました')
await sleep(1500)
await caption(page, '結果の行を ↑↓ で動かすと、銘柄情報とチャートが追従します')
await press(page, 'Home')
for (let i = 0; i < 3; i++) {
  await press(page, 'ArrowDown')
  await sleep(900)
}
await shot(page, 'screener')

// 2. 条件を選ぶダイアログ（分類ごと・打って絞り込み・説明）
await caption(page, 'Insert で、条件の項目を分類ごとに並べたダイアログを開きます（58 項目）')
await press(page, 'Insert')
await page.locator('.dialog.picker').waitFor()
await sleep(2200)
await shot(page, 'fields')
await caption(page, '打って絞り込めます。選んだ項目の説明が下に出ます')
await addField('増配率', true)
await sleep(600)
await caption(page, 'Shift+Enter で続けて足すと、足した項目に ✓ が付きます')
await addField('権利付最終日')
await sleep(900)
await shot(page, 'fields-added')

// 3. 新しい項目で絞る（権利付最終日までの日数・5 年の増配率）
await caption(page, '新しい項目: 権利付最終日までの日数、配当の増減率と 5 年の増配率、ROE、ボラティリティ、最大下落率など')
await sleep(2200)
await caption(page, '値は Enter で打ちます。権利付最終日まで 60 日以内の銘柄に絞ります')
await press(page, 'Enter')
await page.locator('.dialog').last().waitFor()
await page.keyboard.press('Control+a')
await page.keyboard.type('60', { delay: 160 / SPEED })
await sleep(500)
await press(page, 'Enter')
await sleep(1500)
await shot(page, 'rights')

// 4. 金額の単位（時価総額は億円で打つ）
await caption(page, '金額は表示の単位で打ちます。時価総額は「億円」、最低投資金額は「万円」。「30万」のように単位を付けても読みます')
await press(page, 'Insert')
await page.locator('.dialog.picker').waitFor()
await addField('時価総額')
await sleep(600)
await press(page, 'Enter')
await page.locator('.dialog').last().waitFor()
await sleep(700)
await page.keyboard.press('Control+a')
await page.keyboard.type('5000', { delay: 160 / SPEED })
await sleep(800)
await press(page, 'Enter')
await sleep(1800)
await shot(page, 'money')

// 5. 銘柄情報: 予定・配当の推移・値動き
await caption(page, '銘柄情報: 決算発表と権利付最終日までの日数、主な指標、配当の推移、配当込みの値動き')
await press(page, 'Tab') // 条件から結果の行へ
await press(page, 'Home')
await sleep(800)
await focusPane('info')
await sleep(1600)
await shot(page, 'info')
await caption(page, '配当の棒は ← → で選べます。Y で「年ごと」と「回ごと」を切り替えます')
await press(page, 'ArrowLeft', 'ArrowLeft', 'ArrowLeft')
await sleep(800)
await press(page, 'KeyY')
await sleep(1600)
await press(page, 'KeyY')
await sleep(600)
await shot(page, 'info-dividends')
await caption(page, '5 年の増配率・連続増配・利回りの 5 年の範囲・配当込みの騰落率と最大下落率もここで見られます')
await page
  .locator('[data-widget="info"] .scroll, [data-widget="info"]')
  .first()
  .evaluate((e) => e.scrollBy({ top: 600, behavior: 'smooth' }))
await sleep(2800)
await page
  .locator('[data-widget="info"] .scroll, [data-widget="info"]')
  .first()
  .evaluate((e) => e.scrollTo({ top: 0, behavior: 'smooth' }))
await sleep(1000)

// 6. アラート
await caption(page, 'アラート: Ctrl+Alt+A で、表示中の銘柄に条件を付けます（終値・利回り・移動平均・保有の損益率など）')
await focusPane('chart')
await press(page, 'Control+Alt+KeyA')
await page.locator('.dialog.alertform').waitFor()
await sleep(2400)
await shot(page, 'alert-form')
await press(page, 'Control+Enter')
await sleep(900)
await caption(page, '取得のジョブの終わりに判定し、トースト・Windows の通知・ベルで知らせます。Ctrl+Alt+L で一覧と履歴')
await press(page, 'Control+Alt+KeyL')
await sleep(2600)
await shot(page, 'alerts')
await press(page, 'Escape')
await sleep(600)

// 7. ペインの種類を変える（Ctrl+Shift+N）
await caption(page, 'Ctrl+Shift+N で、フォーカス中のペインを別の種類に変えられます（チャートを配当カレンダーに、など）')
await press(page, 'Control+Shift+KeyN')
await sleep(1600)
await shot(page, 'widget')
// 選択肢を ↓ で「配当カレンダー」まで送って Enter
const items = await page.locator('.dialog .it').allTextContents()
const to = items.findIndex((x) => x.includes('配当カレンダー'))
for (let i = 0; i < to; i++) await press(page, 'ArrowDown')
await sleep(500)
await press(page, 'Enter')
await sleep(1800)
await shot(page, 'widget-changed')

// 8. すべてのタブのレイアウトを初期状態に戻す
await caption(page, 'レイアウトを崩しても、設定の「表示」から、すべてのタブを初期の並びに戻せます')
await press(page, 'Control+Comma')
await page.getByRole('dialog', { name: '設定' }).waitFor()
await press(page, 'ArrowDown')
await sleep(1000)
await page.getByRole('button', { name: 'すべてのタブのレイアウトを初期状態に戻す' }).focus()
await sleep(400)
await press(page, 'Enter')
await sleep(1600)
await shot(page, 'reset-confirm')
await press(page, 'ArrowRight', 'Enter')
await sleep(1200)
await press(page, 'Escape')
await sleep(1200)
await shot(page, 'reset-done')

// 9. マーケットの指数のチャートも期間を選べる
await caption(page, 'マーケットの指数のチャートも、チャートと同じく Alt+1〜6 で期間を選べます')
await press(page, 'Control+Shift+Digit1')
await focusPane('market')
await sleep(800)
await press(page, 'Alt+Digit3')
await sleep(1600)
await press(page, 'Alt+Digit5')
await sleep(1600)
await shot(page, 'market')
await caption(page, '')

// 10. 終わりの画面
await card(page, [
  'elecxstock 0.1.1',
  'スクリーナーの 23 項目の追加・銘柄情報の作り直し・アラート',
  '無料・オープンソース（MIT） ・ Windows ・ github.com/kurouna/elecxstock',
  'チャート: TradingView Lightweight Charts™（Apache-2.0）',
  '※ 画面は開発中のものです。動画の株価・利回りなどの値はすべて架空のデモデータです',
])
await shot(page, 'end')
console.log('デモが終わりました。窓を閉じると終わります')
if (process.env.DEMO_EXIT === '1') await app.close()
else await new Promise((r) => app.on('close', r))
void typeCode
