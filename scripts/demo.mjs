// リリースのデモ（録画は利用者がキャプチャアプリで行う）。スタブのプロバイダ（架空の値）で起動し、キー操作だけで場面を進める。
// 画面の下に字幕、右下に押したキーを重ねて出す（録画のときだけ。アプリには入れない）。
//
// 使い方: npm run build && npm run demo
//   DEMO_SIZE=1920x1080  窓の中身の大きさ（既定は最大化。キャプチャする大きさに合わせる）
//   DEMO_WAIT=8          タイトルを出してから始めるまでの秒数（その間に録画を始める）
//   DEMO_SPEED=1         速さの倍率（1.5 で速く、0.8 でゆっくり）
//   DEMO_MULTI=0         2 枚目の窓（フリー 2）の場面を飛ばす
//   DEMO_SHOTS=<フォルダ> 場面ごとにスクリーンショットを残す（確認用）。DEMO_EXIT=1 で終わったら閉じる
// 終わったら終わりの画面のまま止まる。窓を閉じると終わる。
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from '@playwright/test'

const SPEED = Number(process.env.DEMO_SPEED ?? 1) || 1
const WAIT = Number(process.env.DEMO_WAIT ?? 8)
const SIZE = process.env.DEMO_SIZE ?? 'max'
const MULTI = process.env.DEMO_MULTI !== '0'
const SHOTS = process.env.DEMO_SHOTS
const sleep = (ms) => new Promise((r) => setTimeout(r, ms / SPEED))
const userData = mkdtempSync(join(tmpdir(), 'elecxstock-demo-'))
const env = { ...process.env, ELECXSTOCK_PROVIDER: 'stub', ELECXSTOCK_USER_DATA: userData }
const call = (page, method, params = {}) => page.evaluate(([m, p]) => window.elecxstock.call(m, p), [method, params])

// ---------------------------------------------------------------- 1 回目: 初回の取り込みと、架空のウォッチリスト・保有を入れる（録画しない）
{
  console.log('準備: 架空のデータを取り込んでいます…')
  const app = await electron.launch({ args: ['.'], env })
  const page = await app.firstWindow()
  await page.getByRole('dialog').waitFor()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await page
    .locator('footer')
    .getByText(/待機|Idle/)
    .waitFor({ timeout: 120_000 })
  const u = await call(page, 'user.load')
  const fav = ['JP:8058', 'JP:7203', 'JP:8306', 'JP:9434', 'JP:94345', 'JP:8951', 'JP:3462', 'JP:8963', 'JP:2914', 'JP:8766']
  // 高配当のリスト（インカムのタブ）: J-REIT と 5 桁の優先株
  const income = ['JP:8951', 'JP:3462', 'JP:8963', 'JP:3281', 'JP:94345', 'JP:2914']
  const is = (w, id) => w.builtin === id || w.id === id
  const lists = u.watchlists.map((w) => (is(w, 'favorites') ? { ...w, items: fav } : is(w, 'income') ? { ...w, items: income } : w))
  await call(page, 'user.saveWatchlists', { watchlists: lists })
  // 保有（数量・取得単価はすべて架空）
  await call(page, 'portfolio.save', {
    holdings: [
      { code: '7203', account: 'tokutei', quantity: 200, avgCost: 15200 },
      { code: '9434', account: 'nisa_growth', quantity: 1000, avgCost: 1650 },
      { code: '8951', account: 'nisa_growth', quantity: 10, avgCost: 88000 },
      { code: '3462', account: 'tokutei', quantity: 8, avgCost: 96000 },
      { code: '94345', account: 'nisa_growth', quantity: 300, avgCost: 4100 },
    ],
  })
  await page
    .locator('footer')
    .getByText(/待機|Idle/)
    .waitFor({ timeout: 120_000 })
  await app.close()
}

// ---------------------------------------------------------------- 2 回目: デモ
const app = await electron.launch({ args: ['.'], env })
const page = await app.firstWindow()
await page
  .locator('footer')
  .getByText(/待機|Idle/)
  .waitFor({ timeout: 120_000 })
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

/** 字幕・押したキー・タイトルの画面を重ねる（操作は邪魔しない） */
async function overlay(p) {
  await p.evaluate(() => {
    if (document.getElementById('demo-overlay')) return
    const font = '"Yu Gothic UI", "Segoe UI", sans-serif'
    const root = document.createElement('div')
    root.id = 'demo-overlay'
    Object.assign(root.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '2147483647', fontFamily: font })
    // 字幕（下の真ん中）
    const cap = document.createElement('div')
    cap.id = 'demo-cap'
    Object.assign(cap.style, {
      position: 'absolute',
      left: '50%',
      bottom: '56px',
      transform: 'translateX(-50%)',
      maxWidth: '90%',
      whiteSpace: 'nowrap',
      padding: '12px 26px',
      borderRadius: '10px',
      background: 'rgba(8,10,14,.86)',
      border: '1px solid rgba(255,255,255,.14)',
      color: '#fff',
      fontSize: 'min(24px, 1.6vw)',
      fontWeight: '700',
      letterSpacing: '.02em',
      textAlign: 'center',
      boxShadow: '0 10px 30px rgba(0,0,0,.45)',
      opacity: '0',
      transition: 'opacity .25s',
    })
    // 値は架空（左下に出し続ける）
    const note = document.createElement('div')
    note.id = 'demo-note'
    note.textContent = '※ 画面の株価・利回りなどの値はすべて架空のデモデータです'
    Object.assign(note.style, {
      position: 'absolute',
      left: '14px',
      bottom: '30px',
      padding: '3px 10px',
      borderRadius: '4px',
      background: 'rgba(8,10,14,.75)',
      color: '#cfd6e0',
      fontSize: '13px',
    })
    // 押したキー（右下）
    const keys = document.createElement('div')
    Object.assign(keys.style, {
      position: 'absolute',
      right: '24px',
      bottom: '56px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
      gap: '6px',
    })
    // タイトル・終わりの画面
    const card = document.createElement('div')
    card.id = 'demo-card'
    Object.assign(card.style, {
      position: 'absolute',
      inset: '0',
      display: 'none',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '18px',
      background: 'radial-gradient(ellipse at 50% 35%, #1c2230, #0b0d10 70%)',
      color: '#e8edf4',
      textAlign: 'center',
      transition: 'opacity .5s',
    })
    root.append(cap, note, keys, card)
    document.body.append(root)
    const name = (e) => {
      const k = e.key
      if (k === ' ') return 'Space'
      if (k.length === 1) return k.toUpperCase()
      return { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Escape: 'Esc' }[k] ?? k
    }
    window.addEventListener(
      'keydown',
      (e) => {
        if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return
        const label = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && e.key.length > 1 && 'Shift', name(e)]
          .filter(Boolean)
          .join(' + ')
        const chip = document.createElement('div')
        chip.textContent = label
        Object.assign(chip.style, {
          padding: '6px 14px',
          borderRadius: '6px',
          background: 'rgba(8,10,14,.86)',
          border: '1px solid rgba(255,255,255,.22)',
          borderBottomWidth: '3px',
          color: '#fff',
          fontSize: '20px',
          fontWeight: '700',
          fontFamily: '"Cascadia Mono", Consolas, monospace',
          transition: 'opacity .3s',
        })
        keys.append(chip)
        while (keys.children.length > 4) keys.firstChild?.remove()
        setTimeout(() => {
          chip.style.opacity = '0'
          setTimeout(() => chip.remove(), 300)
        }, 1400)
      },
      true,
    )
  })
}
const caption = (p, text) =>
  p.evaluate((t) => {
    const c = document.getElementById('demo-cap')
    if (!c) return
    c.textContent = t
    c.style.opacity = t ? '1' : '0'
  }, text)
/** タイトル・終わりの画面（lines: [大きい行, 小さい行…]）。null で消す */
const card = (p, lines) =>
  p.evaluate((ls) => {
    const c = document.getElementById('demo-card')
    const note = document.getElementById('demo-note')
    if (!c) return
    if (!ls) {
      c.style.opacity = '0'
      setTimeout(() => (c.style.display = 'none'), 500)
      if (note) note.style.display = ''
      return
    }
    c.replaceChildren(
      ...ls.map((s, i) => {
        const d = document.createElement('div')
        d.textContent = s
        Object.assign(
          d.style,
          i === 0
            ? { fontSize: '72px', fontWeight: '800', letterSpacing: '.02em' }
            : { fontSize: i === 1 ? '28px' : '20px', color: i === 1 ? '#e8edf4' : '#9aa6b6' },
        )
        return d
      }),
    )
    c.style.display = 'flex'
    c.style.opacity = '1'
    if (note) note.style.display = 'none'
  }, lines)

/** キーを押す（少し間を空けて、見ている人が追えるように） */
const press = async (p, ...keys) => {
  for (const k of keys) {
    await p.keyboard.press(k)
    await sleep(380)
  }
}
let shotNo = 0
const shot = async (p, name) => {
  if (SHOTS) await p.screenshot({ path: join(SHOTS, `${String(++shotNo).padStart(2, '0')}-${name}.png`) })
}
const typeCode = (p, code) => press(p, ...[...code].map((c) => (/\d/.test(c) ? `Digit${c}` : `Key${c}`)))

await overlay(page)
await page.evaluate(() => document.querySelectorAll('.toasts .toast').forEach((t) => t.remove()))
await card(page, [
  'elecxstock',
  '日本株・J-REIT のデータを手元に取り込み、チャートを並べて見比べ、条件で絞り込むデスクトップアプリ',
  'キーボードで操作でき、データは手元の SQLite に保存します。無料・オープンソース（MIT）です',
  '※ 画面の株価・利回りなどの値はすべて架空のデモデータです',
])
console.log(`${WAIT} 秒後に始めます。いまのうちに録画を始めてください`)
await sleep(WAIT * 1000 * SPEED)
await sleep(2500)
await card(page, null)
await sleep(800)

await shot(page, 'title')
// 1. MTF: 日足・週足・月足。ウォッチリストをめくるとチャートが追従する
await press(page, 'Control+Shift+Digit4')
await caption(page, 'ウォッチリストで銘柄を選ぶと、日足・週足・月足のチャートが切り替わります')
await press(page, 'Alt+ArrowLeft', 'Alt+ArrowUp', 'Home')
for (let i = 0; i < 3; i++) await press(page, 'ArrowDown'), await sleep(700)
await sleep(800)

await shot(page, 'mtf')
// 2. 銘柄ジャンプと時間軸
await caption(page, '銘柄コードを入力すると、その銘柄のチャートに切り替わります')
await press(page, 'Alt+ArrowRight')
await typeCode(page, '8058')
await sleep(600)
await press(page, 'Enter')
await sleep(1200)
await caption(page, 'D・W・M キーで、日足・週足・月足を切り替えます')
await press(page, 'w')
await sleep(900)
await press(page, 'm')
await sleep(900)
await press(page, 'd')
await sleep(900)

await shot(page, 'jump')
// 3. スクリーナー: 条件を変えるとその場で絞られる
await press(page, 'Control+Shift+Digit2')
await caption(page, 'スクリーナーでは、条件を変えるとすぐに結果を絞り直します')
await sleep(1200)
for (let i = 0; i < 3; i++) await press(page, 'ArrowDown'), await sleep(500)
await press(page, 'Tab')
await sleep(500)
await press(page, 'ArrowRight') // 利回りの下限を 1 段上げる
await sleep(1500)
await press(page, 'Escape')
await sleep(1200)

await shot(page, 'screener')
// 4. グリッド: 絞った結果をチャートで一度に見比べる
await caption(page, '絞り込んだ銘柄を、最大 30 枚のチャートで一度に見比べられます')
await press(page, 'Control+Shift+KeyG')
await sleep(1800)
await press(page, 'ArrowRight', 'Space', 'ArrowRight', 'ArrowRight', 'Space')
await sleep(600)
await caption(page, 'Space キーで気になる銘柄に印を付け、W キーで週足に切り替えます')
await press(page, 'w')
await sleep(1500)
await press(page, 'd')
await sleep(800)

await shot(page, 'grid')
// 5. インカム: 配当カレンダー・分配金の履歴
await press(page, 'Control+Shift+Digit6')
await caption(page, 'J-REIT の分配金・権利確定月・利回りを確認できます。5 桁の優先株にも対応しています')
await press(page, 'Home')
await sleep(1500)
for (let i = 0; i < 4; i++) await press(page, 'ArrowDown'), await sleep(900) // J-REIT をめくり、優先株（94345）で止まる
await sleep(1200)

await shot(page, 'income')
// 6. 保有
await press(page, 'Control+Shift+Digit7')
await caption(page, '証券会社の CSV から保有を取り込み、評価額・損益・取得利回りを確認できます')
await sleep(1200)
for (let i = 0; i < 3; i++) await press(page, 'ArrowDown'), await sleep(800)
await sleep(600)

await shot(page, 'holdings')
// 7. 2 枚目のモニタ用のフリーのウィンドウ
if (MULTI) {
  await press(page, 'Control+Shift+Digit4')
  await caption(page, 'Ctrl+Alt+N で、2 枚目のモニタ用にチャートを並べた窓を開けます')
  const next = app.waitForEvent('window')
  await press(page, 'Control+Alt+n')
  await sleep(600)
  await press(page, 'ArrowDown') // 4 分割
  await press(page, 'Enter')
  const w = await next
  await w.waitForLoadState('domcontentloaded')
  await w.locator('[data-widget="chart"] canvas').first().waitFor({ timeout: 30_000 })
  // 1 枚のモニタでも見えるように、1 枚目を左、フリー 2 を右に並べる
  await app.evaluate(({ BrowserWindow, screen }) => {
    const a = screen.getPrimaryDisplay().workArea
    const all = BrowserWindow.getAllWindows()
    const main = all.find((x) => !x.webContents.getURL().includes('w=free'))
    const free = all.find((x) => x.webContents.getURL().includes('w=free2'))
    main?.unmaximize()
    main?.setBounds({ x: a.x, y: a.y, width: Math.round(a.width * 0.55), height: a.height })
    free?.unmaximize()
    free?.setBounds({ x: a.x + Math.round(a.width * 0.55), y: a.y, width: a.width - Math.round(a.width * 0.55), height: a.height })
    free?.focus()
  })
  await overlay(w)
  await sleep(1500)
  // フリー 2 の左上のチャート（開いたときにフォーカスがある）をリンク 1 にする → 1 枚目で選んだ銘柄を追う
  await caption(w, 'Ctrl+1 でリンク色を付けると、1 枚目で選んだ銘柄にチャートが追従します')
  await press(w, 'Control+Digit1')
  await sleep(1200)
  await caption(w, '')
  await page.bringToFront()
  await caption(page, '1 枚目で銘柄を選ぶと、2 枚目の窓のチャートも切り替わります')
  await press(page, 'Alt+ArrowLeft', 'Alt+ArrowUp', 'Home')
  for (let i = 0; i < 5; i++) await press(page, 'ArrowDown'), await sleep(900)
  await sleep(800)
  if (SHOTS) await w.screenshot({ path: join(SHOTS, 'free2.png') })
  await shot(page, 'multi-main')
  await w.close()
  await app.evaluate(({ BrowserWindow }, size) => {
    const m = BrowserWindow.getAllWindows()[0]
    if (size === 'max') m.maximize()
    else {
      const [x, y] = size.split('x').map(Number)
      m.setContentSize(x, y)
      m.center()
    }
    m.focus()
  }, SIZE)
  await sleep(800)
}

await shot(page, 'multi')
// 8. 日々の更新
await caption(page, '日々の更新は、一括気配と照合に絞って取得し、高速化しています（F5）')
await press(page, 'F5')
await sleep(2500)
await caption(page, 'ウォッチリストと保有の銘柄は、優先して先に更新します')
await sleep(3500)

await shot(page, 'update')
// 9. コマンドバー・テーマ・ショートカット一覧
await caption(page, 'すべての操作をキーボードで行えます。Ctrl+K のコマンドバーから呼び出せます')
await press(page, 'Control+k')
await page.keyboard.type('テーマ', { delay: 120 / SPEED })
await sleep(700)
await press(page, 'Enter')
await sleep(1600)
await caption(page, 'F1 キーで、ショートカットの一覧を表示します')
await press(page, 'F1')
await sleep(2600)
await press(page, 'Escape')
await press(page, 'Control+k')
await page.keyboard.type('テーマ', { delay: 120 / SPEED })
await press(page, 'Enter')
await sleep(800)
await caption(page, '')

await shot(page, 'help')
// 10. 終わりの画面
await card(page, [
  'elecxstock',
  '日本株・J-REIT のローカル分析デスクトップアプリ',
  '無料・オープンソース（MIT） ・ Windows ・ github.com/kurouna/elecxstock',
  '※ 動画の株価・利回りなどの値はすべて架空のデモデータです',
])
await shot(page, 'end')
console.log('デモが終わりました。窓を閉じると終わります')
if (process.env.DEMO_EXIT === '1') await app.close()
else await new Promise((r) => app.on('close', r))
