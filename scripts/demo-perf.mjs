// X（旧 Twitter）投稿用の短いデモ: パフォーマンス比較（FR-PC1〜PC12。docs/design-perf.md）。録画は利用者がキャプチャアプリで行う。
// スタブのプロバイダ（架空の値）で起動し、キー操作だけで場面を進める。画面の下に字幕、右下に押したキーを重ねて出す（アプリには入れない）。
// 話題: マイレイアウトの「比較」のページ・銘柄ジャンプの Enter で足す・比べる相手（TOPIX・東証REIT指数の連動 ETF）・N 年前の札と
// カレンダー・十字線の小箱・% と配当込みと対数・20 年前（月次で継ぐ）・選んだ線を目立たせ、右の日足のチャートに出す
//
// 使い方: npm run build && npm run demo:perf
//   DEMO_SIZE=1920x1080  窓の中身の大きさ（X の動画は 16:9。既定は最大化）
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
import { caption, card, overlay, press, SIZE, SPEED, setTheme, shot, sleep, typeCode, WAIT } from './demo-kit.mjs'
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
// マウスを窓の左上の角へ（カーソルがチャートの上にあると十字線が出る）
const corner = () => page.mouse.move(0, 0)
await corner()

const tab = page.locator('.presets [aria-current="true"]')
const pf = page.locator('[data-widget="perf"]')
/** 読み込みが終わり、どの行も値を出すまで待つ（「読み込み中」「月次を取得中」が消える） */
const settled = () =>
  page.waitForFunction(
    () =>
      !document.querySelector('[data-widget="perf"] .pf-chartblk.loading') &&
      !/読み込み中|取得中/.test(document.querySelector('[data-widget="perf"] .pf-rows')?.textContent ?? ''),
    null,
    { timeout: 120_000 },
  )
/** 銘柄ジャンプでコードを打ち、候補が出てから Enter（このペインに足す） */
async function addCode(code) {
  await typeCode(page, code)
  await page.locator('.dialog.jump .it.sel .c', { hasText: code }).waitFor()
  await sleep(500)
  await press(page, 'Enter')
  await pf.locator(`.pf-rows [data-id="JP:${code}"]`).waitFor()
  await sleep(700)
}

await overlay(page)
await page.evaluate(() => document.querySelectorAll('.toasts .toast').forEach((t) => t.remove()))
// リンク 2 の銘柄（ページの種）をトヨタにしておく（録画の前）
await typeCode(page, '7203')
await page.locator('.dialog.jump .it.sel .c', { hasText: '7203' }).waitFor()
await page.keyboard.press('Enter')
await card(page, [
  'パフォーマンス比較',
  '基準日を 100 にして、複数の銘柄の値動きを 1 枚で比べる',
  'elecxstock ・ マイレイアウトの「比較」 ・ キーボードだけで',
  '※ 画面は開発中のものです。株価などの値はすべて架空のデモデータです',
])
console.log(`${WAIT} 秒後に始めます。いまのうちに録画を始めてください`)
await sleep(WAIT * 1000 * SPEED)
await sleep(2500)
await card(page, null)
await sleep(800)
await shot(page, 'title')
await corner()

// 1. マイレイアウトに「比較」のページを作る
await caption(page, 'マイレイアウト（Ctrl+Shift+8）で Insert。新しいページの初めの形に「比較」')
await press(page, 'Control+Shift+Digit8')
await tab.filter({ hasText: 'マイレイアウト' }).waitFor()
await sleep(900)
await press(page, 'Control+Shift+Digit8', 'Insert')
const shape = page.getByRole('dialog', { name: '新しいページの初めの形' })
await shape.waitFor()
await sleep(1000)
for (let i = 0; i < 5; i++) await press(page, 'ArrowDown')
await sleep(1500)
await shot(page, 'shape')
await press(page, 'Enter')
await page.locator('.dialog input').waitFor()
await page.keyboard.type('比較', { delay: 150 / SPEED })
await sleep(500)
await press(page, 'Enter')
await pf.waitFor()
await settled()
await caption(page, '左にパフォーマンス比較、右に日足のチャート。今のチャートの銘柄から始まります')
await sleep(3500)

// 2. 銘柄ジャンプの Enter で足す
await caption(page, '数字キーで銘柄ジャンプ → Enter でこのペインに足す（5 銘柄まで）')
for (const c of ['8306', '8035', '7974', '8058']) await addCode(c)
await settled()
await sleep(1500)
await shot(page, 'added')

// 3. 比べる相手
await caption(page, 'B で比べる相手: TOPIX と東証REIT指数の連動 ETF（1308・1343）を灰色の線で')
// 既定は 1308。B を 1 回で 1308 と 1343
await press(page, 'KeyB')
await settled()
await sleep(2500)

// 4. N 年前の札
await caption(page, 'Alt+1〜6 で基準日を年初・1・3・5・10・20 年前に。3 年前を 100 にすると…')
await press(page, 'Alt+Digit3')
await settled()
await sleep(3500)
await shot(page, 'three-years')

// 5. カレンダー
await caption(page, '日付を押すか Enter でカレンダー。PgUp PgDn で月、← → で日を選んで Enter')
await press(page, 'Tab')
await sleep(800)
await press(page, 'Enter')
await pf.getByTestId('pf-cal').waitFor()
await sleep(1200)
await press(page, 'PageDown', 'PageDown')
await sleep(600)
await press(page, 'ArrowRight', 'ArrowRight')
await sleep(1200)
await shot(page, 'calendar')
await press(page, 'Enter')
await settled()
await sleep(2500)

// 6. 十字線
await caption(page, 'チャートで ← →（Shift で 1 か月）。その日の値を値の順の小箱と左の一覧に。右端の札は終わりの日の値のまま')
await press(page, 'Shift+Tab')
await sleep(600)
await press(page, 'ArrowLeft')
for (let i = 0; i < 8; i++) {
  await press(page, 'Shift+ArrowLeft')
  await sleep(250)
}
await sleep(2500)
await shot(page, 'crosshair')

// 7. % ・配当込み・対数
await caption(page, 'P で 100 ⇔ 騰落率 %、T で配当込み、L で対数')
await press(page, 'KeyP')
await sleep(1800)
await press(page, 'KeyT')
await settled()
await sleep(1800)
await press(page, 'KeyL')
await sleep(2500)
await shot(page, 'pct-total-log')
await press(page, 'KeyL', 'KeyP', 'Escape')
await sleep(800)

// 8. 20 年前（月次で継ぐ）
await caption(page, 'Alt+6 で 20 年前。日足の保存期間より前は月末の終値で継ぎ、「ここから日足」の印を出します')
await press(page, 'Alt+Digit6')
await settled()
await sleep(4000)
await shot(page, 'twenty-years')

// 9. 一覧: 選んだ線を目立たせ、右のチャートに出す
await caption(page, 'Tab で一覧へ。↑ ↓ で選んだ線を太く。Enter で右の日足のチャートにその銘柄')
await press(page, 'Alt+Digit3')
await settled()
await press(page, 'Tab', 'Tab')
await sleep(800)
await press(page, 'ArrowDown')
await sleep(1200)
await press(page, 'ArrowDown')
await sleep(1500)
await press(page, 'Enter')
await sleep(2500)
await shot(page, 'list')
await caption(page, '過去の値動きの比較です。将来の値動きを示すものではありません')
await sleep(3500)
await caption(page, '')

// 10. 終わりの画面
await card(page, [
  'パフォーマンス比較',
  '基準日 = 100・5 銘柄 + TOPIX / 東証REIT・カレンダー・十字線・% / 配当込み / 対数・20 年前まで',
  '無料・オープンソース（MIT） ・ Windows ・ github.com/kurouna/elecxstock',
  '※ 画面は開発中のものです。動画の株価などの値はすべて架空のデモデータです',
])
await shot(page, 'end')
console.log('デモが終わりました。窓を閉じると終わります')
if (process.env.DEMO_EXIT === '1') await app.close()
else await new Promise((r) => app.on('close', r))
