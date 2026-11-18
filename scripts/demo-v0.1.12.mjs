// v0.1.12 のデモ: チャートのトレンドライン（0.1.11 で足し、0.1.12 で同期と山・谷の扱いを直した）（録画は利用者がキャプチャアプリで行う）。スタブのプロバイダ（架空の値）で起動し、
// 画面の下に字幕、右下に押したキーを重ねて出す（録画のときだけ。アプリには入れない）。
// 筋: MTF のタブの日足のチャートを最大化 → 見出しの「指標」ボタンから引く（← → ↑ ↓・Enter）→ Alt+T で引く →
// Ctrl+← → で「山」「谷」へ跳び、谷どうし（支持線）・山どうし（抵抗線）を結ぶ → 延長と価格ラベル → 選んで動かす・端点を別の谷へ →
// 消す・Ctrl+Z → 週足に替えても同じ位置。字幕は対応した内容・事実だけを書く。
// 「指標」ボタンを押す場面だけは、ボタンを枠で示してから押す（それ以外はキーだけ）。
//
// 使い方: npm run build && npm run demo:0.1.12
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
import { waitIdle } from './wait-idle.mjs'

const userData = mkdtempSync(join(tmpdir(), 'elecxstock-demo-'))
// 日時を固定する（平日の大引けのあと。録り直しても同じ足・同じ線になる）
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
  // 左のウォッチリストが空にならないよう、お気に入りを入れておく（銘柄名とコードだけ実在。値はスタブの架空の値）
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

const current = page.locator('.presets [aria-current="true"]')
const chart = page.locator('[data-widget="chart"]').first()
const host = chart.locator('.host').first()
const dialog = page.locator('.dialog')
/** トレンドラインの状態（チャートの data-draw-state）と線（data-drawings） */
const state = async () => JSON.parse((await host.getAttribute('data-draw-state')) ?? '{"m":"idle"}')
const lines = async () => JSON.parse((await host.getAttribute('data-drawings')) ?? '[]')
async function until(f) {
  for (let i = 0; i < 100; i++) {
    if (await f()) return
    await sleep(50)
  }
  throw new Error('demo: the expected state did not come')
}
const modeIs = (m) => until(async () => (await state()).m === m)
const countIs = (n) => until(async () => (await lines()).length === n)

/** F6 でペインを順に移り、そのペインにフォーカスを置く */
async function focusPane(target) {
  for (let i = 0; i < 20; i++) {
    if (await target.evaluate((e) => e.classList.contains('focused'))) return
    await page.keyboard.press('F6')
    await sleep(120)
  }
}
/**
 * Ctrl+← / Ctrl+→ で山・谷へ跳ぶのを、欲しい種類（h: 山・l: 谷）で ok を満たす点に着くまで繰り返す（1 回ずつ見せる）。
 * 跳べなくなったら（端）止める
 */
async function swingTo(dir, kind, ok = () => true, max = 25) {
  for (let i = 0; i < max; i++) {
    const before = (await state()).date
    await press(page, dir < 0 ? 'Control+ArrowLeft' : 'Control+ArrowRight')
    await sleep(350)
    const s = await state()
    if (s.date === before) return s
    if (s.snap === kind && ok(s)) return s
  }
  return state()
}
/** 要素を枠で示す（録画で、どのボタンを押すかが分かるように。アプリには入れない） */
async function spotlight(loc, on) {
  await loc.evaluate((e, v) => {
    e.style.transition = 'outline-color .25s, box-shadow .25s'
    e.style.outline = v ? '3px solid #f2c04a' : ''
    e.style.outlineOffset = v ? '3px' : ''
    e.style.boxShadow = v ? '0 0 0 8px rgba(242,192,74,.25)' : ''
  }, on)
}

// 録画の前に: MTF のタブへ
await page.keyboard.press('Control+Shift+Digit4')
await current.filter({ hasText: 'MTF' }).waitFor()
await host.waitFor()

await overlay(page)
// 架空の値の注意は右上へ（左下はチャートの操作の案内の行と重なる）
await page.evaluate(() => {
  const n = document.getElementById('demo-note')
  if (n) Object.assign(n.style, { left: 'auto', bottom: 'auto', right: '72px', top: '78px' })
})
await page.evaluate(() => document.querySelectorAll('.toasts .toast').forEach((t) => t.remove()))
await card(page, [
  'elecxstock 0.1.12',
  'チャートにトレンドラインを引く（0.1.11〜）',
  '「指標」ボタン・Alt+T で引く / 山・谷へのジャンプ / 延長・価格ラベル / 動かす・消す・戻す',
  '※ 画面は開発中のものです。株価などの値はすべて架空のデモデータです',
])
console.log(`${WAIT} 秒後に始めます。いまのうちに録画を始めてください`)
await sleep(WAIT * 1000 * SPEED)
await sleep(2500)
await card(page, null)
await sleep(800)
await shot(page, 'title')

// 1. MTF のタブの日足のチャートを最大化する
await focusPane(chart)
await caption(page, 'MTF タブの日足チャート。Ctrl+Shift+Enter で最大化')
await sleep(2200)
await press(page, 'Control+Shift+Enter')
await page.locator('.pane.maxed').waitFor()
await sleep(1800)
await shot(page, 'max')

// 2. 「指標」ボタンから引く
const ind = chart.getByRole('button', { name: '指標' })
await caption(page, 'チャート見出しの「指標」ボタン（I キーでも可）からトレンドラインを引く')
await spotlight(ind, true)
await sleep(2200)
await shot(page, 'ind-button')
await ind.click()
await page.mouse.move(0, 0)
await dialog.waitFor()
await spotlight(ind, false)
await sleep(1200)
await caption(page, 'メニューの最後の「トレンドライン」→「トレンドラインを引く」')
await press(page, 'End')
await sleep(1200)
await shot(page, 'menu')
await press(page, 'Enter')
await dialog.filter({ hasText: 'トレンドラインを引く' }).waitFor()
await sleep(1500)
await shot(page, 'menu-draw')
await press(page, 'Enter')
await modeIs('start')
await caption(page, '十字のカーソルが最後の足の高値に。左下に操作の案内を表示')
await sleep(3000)
await shot(page, 'start')
await caption(page, '← → で足を 1 本ずつ（Shift で 10 本）、↓ で その足の 終値・始値・安値 に吸着')
await press(page, 'Shift+ArrowLeft', 'Shift+ArrowLeft', 'Shift+ArrowLeft', 'Shift+ArrowLeft')
await sleep(600)
await press(page, 'ArrowDown', 'ArrowDown', 'ArrowDown')
await sleep(1500)
await shot(page, 'start-moved')
await caption(page, 'Enter で始点を決定。始点からカーソルまで点線が付いてくる')
await press(page, 'Enter')
await modeIs('end')
await press(page, 'Shift+ArrowRight', 'Shift+ArrowRight')
await sleep(600)
await press(page, 'ArrowDown', 'ArrowDown', 'ArrowDown')
await sleep(1800)
await shot(page, 'end')
await caption(page, 'Enter で終点を決定。引いた線は選択状態になり、両端に取っ手を表示')
await press(page, 'Enter')
await modeIs('sel')
await sleep(2800)
await shot(page, 'first-line')
await caption(page, 'Delete で消去（Ctrl+Z で元に戻せる）')
await press(page, 'Delete')
await countIs(0)
await sleep(1500)
await press(page, 'Control+KeyZ')
await countIs(1)
await sleep(2000)
await shot(page, 'undo')

// 3. Alt+T と、山・谷へのジャンプ
await caption(page, 'Alt+T でいつでも引き始め')
await sleep(1800)
await press(page, 'Alt+KeyT')
await modeIs('start')
await sleep(1500)
await caption(page, 'Ctrl+← → で前後の「山」（前後 5 本で高値が最も高い足）・「谷」（安値が最も低い足）へジャンプ')
await sleep(2500)
for (let i = 0; i < 4; i++) {
  await press(page, 'Control+ArrowLeft')
  await sleep(900)
}
await shot(page, 'swing-jumps')
await caption(page, '山では高値、谷では安値に自動で吸着')
await sleep(2200)
// 谷どうしを結ぶ（支持線）: 始点は左の谷、終点は右の谷
// 表示中の足の最も安い谷（夏の底）から、10 月の谷へ結ぶ
const daily = await call(page, 'bars.get', { id: 'JP:7203', tf: 'D' })
const minLow = Math.min(...daily.low.slice(-140))
await caption(page, '谷 → 谷 で支持線: Ctrl+← を続けて、夏の底の谷で始点を決定')
await swingTo(-1, 'l', (s) => s.price <= minLow * 1.005)
await sleep(1200)
await shot(page, 'support-start')
await press(page, 'Enter')
await modeIs('end')
await caption(page, 'Ctrl+→ で 10 月の谷までジャンプし、Enter で終点を決定')
await swingTo(1, 'l', (s) => s.date >= '2026-10-01')
await sleep(1200)
await shot(page, 'support-end')
await press(page, 'Enter')
await modeIs('sel')
await sleep(1800)
await caption(page, 'E で延長（なし → 右へ → 左右へ）。右へ延ばすと、今日の位置の支持線の価格を右の目盛りに表示')
await press(page, 'KeyE')
await sleep(3000)
await shot(page, 'support')
await press(page, 'Escape')
await modeIs('idle')
await sleep(800)

// 山どうしを結ぶ（抵抗線）: 右から左へ
await caption(page, '山 → 山 で抵抗線: Alt+T → Ctrl+← で直近の山 → Enter → Ctrl+← を続けて 8〜9 月の高い山 → Enter')
await press(page, 'Alt+KeyT')
await modeIs('start')
await sleep(800)
await swingTo(-1, 'h')
await sleep(900)
await press(page, 'Enter')
await modeIs('end')
// 8〜9 月の最も高い山へ
const summer = daily.time.map((d, i) => (d >= '2026-08-01' && d < '2026-10-01' ? daily.high[i] : 0))
const topHigh = Math.max(...summer)
await swingTo(-1, 'h', (st) => st.date < '2026-10-01' && st.price >= topHigh * 0.995)
await sleep(1200)
await shot(page, 'resist-end')
await press(page, 'Enter')
await modeIs('sel')
await press(page, 'KeyE')
await sleep(2800)
await shot(page, 'resist')
await press(page, 'Escape')
await modeIs('idle')
await sleep(800)

// 4. 選んで動かす
await caption(page, 'G で引いた線を選択（続けて押すと次の線）')
await press(page, 'KeyG')
await modeIs('sel')
await sleep(1500)
await press(page, 'KeyG')
await sleep(1800)
await shot(page, 'select')
await caption(page, 'Space で動かす対象を 線全体 → 始点 → 終点 と切替。始点を Ctrl+← で前の谷・山へ付け替え')
await press(page, 'Space')
await sleep(1200)
await press(page, 'Space')
await sleep(1200)
await press(page, 'Control+ArrowLeft')
await sleep(1200)
await press(page, 'Control+ArrowLeft')
await sleep(1800)
await shot(page, 'move-start')
await caption(page, 'Ctrl+Z で付け替えを元に戻す')
await press(page, 'Control+KeyZ')
await sleep(2000)
await press(page, 'Escape')
await modeIs('idle')
await sleep(800)

// 5. 時間軸を替えても同じ日付・価格の所に出る
await caption(page, '週足（W）・月足（M）に切り替えても、線は同じ日付・価格の位置。銘柄ごとに保存され、株式分割でもずれない')
await press(page, 'KeyW')
await sleep(3200)
await shot(page, 'weekly')
await press(page, 'KeyD')
await sleep(2200)
await caption(page, 'マウスでも、クリック 2 回で引く・ドラッグで動かす・右クリックでメニュー。F1 にキーの一覧')
await sleep(3500)
await caption(page, 'Esc で最大化を戻す')
await press(page, 'Escape')
await page.locator('.pane.maxed').waitFor({ state: 'detached' })
await sleep(2000)
await shot(page, 'restore')
await caption(page, '')

// 6. 終わりの画面
await card(page, [
  'elecxstock 0.1.12',
  'チャートにトレンドラインを引く（キーボードだけでも、マウスでも）',
  '無料・オープンソース（MIT） ・ Windows ・ github.com/kurouna/elecxstock',
  'チャート: TradingView Lightweight Charts™（Apache-2.0）',
  '※ 画面は開発中のものです。動画の株価などの値はすべて架空のデモデータです',
])
await shot(page, 'end')
console.log('デモが終わりました。窓を閉じると終わります')
if (process.env.DEMO_EXIT === '1') await app.close()
else await new Promise((r) => app.on('close', r))
