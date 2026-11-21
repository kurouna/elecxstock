// リリースのデモ（録画は利用者がキャプチャアプリで行う）。スタブのプロバイダ（架空の値）で起動し、キー操作だけで場面を進める。
// 画面の下に字幕、右下に押したキーを重ねて出す（録画のときだけ。アプリには入れない）。
//
// 使い方: npm run build && npm run demo
//   DEMO_SIZE=1920x1080  窓の中身の大きさ（既定は最大化。キャプチャする大きさに合わせる）
//   DEMO_WAIT=8          タイトルを出してから始めるまでの秒数（その間に録画を始める）
//   DEMO_SPEED=1         速さの倍率（1.5 で速く、0.8 でゆっくり）
//   DEMO_MULTI=1         2 枚目の窓（フリー 2）を実際に開く場面にする（既定はマルチモニタの説明の画面だけ）
//   DEMO_SHOTS=<フォルダ> 場面ごとにスクリーンショットを残す（確認用）。DEMO_EXIT=1 で終わったら閉じる
// 終わったら終わりの画面のまま止まる。窓を閉じると終わる。
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from '@playwright/test'
import { HOLD, history, writeHistory } from './folio-fixture.mjs'
import { waitIdle } from './wait-idle.mjs'

const SPEED = Number(process.env.DEMO_SPEED ?? 1) || 1
const WAIT = Number(process.env.DEMO_WAIT ?? 8)
const SIZE = process.env.DEMO_SIZE ?? 'max'
const MULTI = process.env.DEMO_MULTI === '1'
const SHOTS = process.env.DEMO_SHOTS
/** マルチモニタの説明に使う画像（README のスクリーンショット。値は架空） */
const MULTI_IMG = `data:image/png;base64,${readFileSync(join(process.cwd(), 'docs', 'screenshots', 'multi.png')).toString('base64')}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms / SPEED))
const userData = mkdtempSync(join(tmpdir(), 'elecxstock-demo-'))
// 日時を固定する（平日の大引けのあと。日付・「あと N 日」・配当見込みの月が録り直しても同じになる）
const NOW = '2026-11-13'
const env = { ...process.env, ELECXSTOCK_PROVIDER: 'stub', ELECXSTOCK_USER_DATA: userData, ELECXSTOCK_NOW: `${NOW}T18:00:00+09:00` }
const call = (page, method, params = {}) => page.evaluate(([m, p]) => window.elecxstock.call(m, p), [method, params])

// ---------------------------------------------------------------- 1 回目: 初回の取り込みと、架空のウォッチリスト・保有を入れる（録画しない）
{
  console.log('準備: 架空のデータを取り込んでいます…')
  const app = await electron.launch({ args: ['.'], env })
  const page = await app.firstWindow()
  await page.getByRole('dialog').waitFor()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await waitIdle(page, 120_000)
  const u = await call(page, 'user.load')
  const fav = ['JP:8058', 'JP:7203', 'JP:8306', 'JP:9434', 'JP:94345', 'JP:8951', 'JP:3462', 'JP:8963', 'JP:2914', 'JP:8766']
  // 高配当のリスト（インカムのタブ）: J-REIT と 5 桁の優先株
  const income = ['JP:8951', 'JP:3462', 'JP:8963', 'JP:3281', 'JP:94345', 'JP:2914']
  // 監視のリスト（グリッドで 30 枚を並べる）: スタブのプライム・J-REIT から 30 銘柄
  const all = await call(page, 'instruments.all')
  const watch = all
    .filter((i) => i.market === 'P' || i.market === 'R')
    .map((i) => i.id)
    .slice(0, 30)
  const is = (w, id) => w.builtin === id || w.id === id
  const items = (w) => (is(w, 'favorites') ? fav : is(w, 'income') ? income : is(w, 'watch') ? watch : w.items)
  const lists = u.watchlists.map((w) => ({ ...w, items: items(w) }))
  await call(page, 'user.saveWatchlists', { watchlists: lists })
  // 保有（数量・取得単価はすべて架空）。ポートフォリオのタブの資産推移の記録と合うよう、README のスクリーンショットと同じ架空の保有にする
  await call(page, 'portfolio.save', { holdings: HOLD })
  await waitIdle(page, 120_000)
  // 今日の評価額 ÷ 取得額（スタブの架空の終値で決まる）。架空の資産推移（1 年半分）を記録の置き場所に書く（ポートフォリオのタブ）
  const today = (await call(page, 'folio.series', {})).points.at(-1)
  await app.close()
  writeHistory(userData, history(today ? today.value / today.cost : 1.05, NOW))
}

// ---------------------------------------------------------------- 2 回目: デモ
const app = await electron.launch({ args: ['.'], env })
const page = await app.firstWindow()
await waitIdle(page, 120_000)
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
    note.textContent = '※ 画面は開発中のものです。株価・利回りなどの値はすべて架空のデモデータです'
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
    // キーの表示はキーの位置（code）から作る（Shift で別の文字になるキーも、押したキーのとおりに出す）
    const name = (e) => {
      const c = e.code
      if (c.startsWith('Key')) return c.slice(3)
      if (c.startsWith('Digit')) return c.slice(5)
      const named = {
        Space: 'Space',
        NumpadAdd: '+',
        NumpadSubtract: '−',
        Comma: ',',
        ArrowUp: '↑',
        ArrowDown: '↓',
        ArrowLeft: '←',
        ArrowRight: '→',
        Escape: 'Esc',
      }
      return named[c] ?? (e.key.length === 1 ? e.key.toUpperCase() : e.key)
    }
    window.addEventListener(
      'keydown',
      (e) => {
        if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return
        const label = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', name(e)].filter(Boolean).join(' + ')
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

/** 説明の画面（画像と文。null で消す） */
const panel = (p, o) =>
  p.evaluate((o) => {
    const c = document.getElementById('demo-card')
    const note = document.getElementById('demo-note')
    if (!c) return
    if (!o) {
      c.style.opacity = '0'
      setTimeout(() => (c.style.display = 'none'), 500)
      if (note) note.style.display = ''
      return
    }
    const h = document.createElement('div')
    h.textContent = o.title
    Object.assign(h.style, { fontSize: '40px', fontWeight: '800' })
    const img = document.createElement('img')
    img.src = o.img
    Object.assign(img.style, { maxWidth: '78%', maxHeight: '58%', borderRadius: '8px', boxShadow: '0 16px 40px rgba(0,0,0,.5)' })
    const ls = o.lines.map((s) => {
      const d = document.createElement('div')
      d.textContent = s
      Object.assign(d.style, { fontSize: '24px', color: '#d6dde8' })
      return d
    })
    c.replaceChildren(h, img, ...ls)
    c.style.display = 'flex'
    c.style.opacity = '1'
  }, o)

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

const widget = (w) => page.locator(`[data-widget="${w}"]`).first()
/** F6 でペインを順に移り、そのペインにフォーカスを置く */
async function focusPane(target) {
  for (let i = 0; i < 30; i++) {
    if (await target.evaluate((e) => e.classList.contains('focused'))) return
    await page.keyboard.press('F6')
    await sleep(120)
  }
  throw new Error('demo: could not focus the pane')
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
  for (let i = 0; i < 3 && (await page.locator('.pane.maxed').count()); i++) {
    await press(page, 'Escape')
    await page
      .locator('.pane.maxed')
      .waitFor({ state: 'detached', timeout: 1500 })
      .catch(() => {})
  }
  await sleep(700)
}

await overlay(page)
// マウスを窓の左上の角へ（実際のカーソルが窓の上にあると十字線や hover の値が出る）
await page.mouse.move(0, 0)
await page.evaluate(() => document.querySelectorAll('.toasts .toast').forEach((t) => t.remove()))
await card(page, [
  'elecxstock',
  '日本株・J-REIT のデータを手元に取り込み、チャートを並べて見比べ、条件で絞り込むデスクトップアプリ',
  'マーケット・株価ボード・スクリーナー・チャートグリッド・配当シミュレータ・ポートフォリオ・アラート',
  'キーボードで操作でき、データは手元の SQLite に保存します。無料・オープンソース（MIT）です',
  '※ 画面は開発中のものです。株価・利回りなどの値はすべて架空のデモデータです',
])
console.log(`${WAIT} 秒後に始めます。いまのうちに録画を始めてください`)
await sleep(WAIT * 1000 * SPEED)
await sleep(2500)
await card(page, null)
await sleep(800)

await shot(page, 'title')
// 0. マーケットのタブ: 指数・為替などの一覧・騰落・ヒートマップ・ニュース・市場の推移
await press(page, 'Control+Shift+Digit1')
const heat = widget('heatmap')
await widget('board').locator('tbody tr').first().waitFor()
await heat.locator('.map .cell').first().waitFor()
await caption(page, 'マーケットのタブ: 指数・為替などの一覧、騰落、33 業種のヒートマップ、ニュース、市場の推移を 1 画面に')
await sleep(4000)
await shot(page, 'market')
// 0b. 株価ボード: ヒートマップのペインで V。東証のマーケットセンターの株価ボードのように、銘柄の終値と前日比をカードで並べる
await focusPane(heat)
await caption(page, 'ヒートマップのペインで V を押すと株価ボード。時価総額の上位の終値と前日比をカードで一望します')
await press(page, 'KeyV')
await heat.locator('.grid .card').first().waitFor()
await sleep(2500)
await caption(page, '値は日足の終値（場中の値ではありません）。上段に日経平均・TOPIX・東証REIT、上昇と下落の数を左右に')
await maximize()
await sleep(3500)
await shot(page, 'quote-board')
await caption(page, '矢印でカードを選ぶと、同じリンク色のチャートが追従します。S で騰落率の順に並べ替え')
await restore()
for (let i = 0; i < 3; i++) {
  await press(page, 'ArrowRight')
  await sleep(700)
}
await press(page, 'KeyS')
await sleep(2200)
await caption(page, 'G で一覧を切り替え（ウォッチリスト・保有・スクリーニング条件）。V でヒートマップに戻ります')
await press(page, 'KeyG')
await sleep(2200)
await shot(page, 'quote-board-fav')
await press(page, 'Shift+KeyG', 'KeyS', 'KeyS', 'KeyS', 'KeyV')
await heat.locator('.map .cell').first().waitFor()
await sleep(1200)

// 1. MTF: 日足・週足・月足。ウォッチリストをめくるとチャートが追従する
await press(page, 'Control+Shift+Digit4')
await caption(page, 'ウォッチリストで銘柄を選ぶと、日足・週足・月足のチャートが切り替わります')
await press(page, 'Alt+ArrowLeft', 'Alt+ArrowUp', 'Home')
for (let i = 0; i < 3; i++) {
  await press(page, 'ArrowDown')
  await sleep(700)
}
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
// 2b. アラート: 表示中の銘柄に条件を決めて知らせる
await caption(page, 'Ctrl+Alt+A で、表示中の銘柄にアラートを作ります（終値・利回りなど、スクリーナーと同じ条件）')
await press(page, 'Control+Alt+KeyA')
const form = page.locator('.dialog.alertform')
await form.waitFor()
await sleep(2500)
await shot(page, 'alert-form')
await press(page, 'Control+Enter')
await form.waitFor({ state: 'detached' })
await page.mouse.move(0, 0)
await caption(page, 'チャートにしきい値の点線。取得の終わりに判定し、Windows の通知とベルで知らせます（Ctrl+Alt+L で一覧）')
await sleep(2500)
await press(page, 'Control+Alt+KeyL')
await sleep(2500)
await shot(page, 'alerts')
await press(page, 'Escape')
await sleep(800)

// 3. スクリーナー: 条件を変えるとその場で絞られる
await press(page, 'Control+Shift+Digit2')
await caption(page, 'スクリーナーでは、条件を変えるとすぐに結果を絞り直します')
await sleep(1200)
for (let i = 0; i < 3; i++) {
  await press(page, 'ArrowDown')
  await sleep(500)
}
await press(page, 'Tab')
await sleep(500)
await press(page, 'ArrowLeft') // 利回りの下限を 1 段下げる（グリッドの 1 ページが埋まる数にする）
await sleep(1500)
await press(page, 'Escape')
await sleep(1200)

await shot(page, 'screener')
// 3b. 配当シミュレータ: 選んだ銘柄を持っていたら、配当と値動きはどうだったか・これからの見込み
const divsim = widget('divsim')
await focusPane(divsim)
await divsim.locator('.c-hero').first().waitFor({ timeout: 30_000 })
await caption(page, '配当シミュレータ: 選んだ銘柄を持っていたら、受け取った配当と値動きはどうだったか')
await maximize()
await divsim.locator('.c-hero').first().waitFor()
await sleep(3500)
await shot(page, 'divsim')
await caption(page, 'PageDown で「これから」。今の配当が続いたら受け取る見込みと、減配のシナリオ')
await press(page, 'PageDown')
await divsim.locator('.c-hero').first().waitFor()
await sleep(3500)
await press(page, 'PageUp')
await restore()
// スクリーナーへフォーカスを戻す（次の場面は結果をグリッドで開く）
await focusPane(widget('screener'))
await sleep(600)

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
// 並べる枚数を増やす・減らす（＋ / − キー）
await caption(page, '＋ と − キーで、並べるチャートの枚数を増やしたり減らしたりできます')
await press(page, 'NumpadSubtract')
await sleep(1300)
await press(page, 'NumpadSubtract')
await sleep(1300)
await press(page, 'NumpadAdd')
await sleep(1100)
await press(page, 'NumpadAdd')
await sleep(1300)
// 最大の 30 枚（6×5）: 対象を 30 銘柄の「監視」のリストに切り替える（G キー。Shift+G で逆順）
await caption(page, 'G キーで対象をウォッチリストに切り替え、最大 30 枚（6×5）のチャートを一度に表示します')
await press(page, 'Shift+KeyG', 'Shift+KeyG')
await sleep(1200)
await press(page, 'NumpadAdd')
await sleep(900)
await press(page, 'NumpadAdd')
await sleep(3000)
await shot(page, 'grid-30')
await press(page, 'NumpadSubtract', 'NumpadSubtract')
await sleep(800)
// ドロワー: 普段は畳んでおき、要るときだけ引き出す。ピン留めすると開いたまま
await caption(page, 'Ctrl+B で、左のドロワーからウォッチリストやスクリーナーを引き出せます')
await press(page, 'Control+b')
await sleep(1200)
await press(page, 'ArrowDown', 'ArrowDown')
await sleep(800)
await caption(page, 'Ctrl+Alt+B でピン留めすると、ドロワーを開いたままにできます')
await press(page, 'Control+Alt+b')
await sleep(1800)
await shot(page, 'drawer-pinned')
await caption(page, 'ピン留めを外すと、ドロワーは端に格納され、チャートを広く使えます')
await press(page, 'Control+Alt+b')
await sleep(600)
await press(page, 'Escape')
await sleep(1800)
await shot(page, 'drawer-closed')

// 4b. マイレイアウトのタブ: ペインを足す・種類を変える・入れ替える・閉じる
await press(page, 'Control+Shift+Digit8')
await caption(page, 'マイレイアウトのタブでは、ペインを自由に追加・移動・削除できます')
await sleep(1800)
await caption(page, 'Ctrl+Shift+E で右に、Ctrl+Shift+O で下に分割して、ペインを追加します')
// 分割では、足すペインの種類を続けて選ぶ（Enter でチャート。docs/design-dialogs.md §5）
await press(page, 'Control+Shift+KeyE')
await page.locator('.dialog.wpick').waitFor()
await sleep(700)
await press(page, 'Enter')
await sleep(900)
await press(page, 'Control+Shift+KeyO')
await page.locator('.dialog.wpick').waitFor()
await sleep(700)
await press(page, 'Enter')
await sleep(900)
await caption(page, 'Ctrl+Shift+N で、ペインの種類を変えられます')
await press(page, 'Control+Shift+KeyN')
await sleep(900)
await page.keyboard.type('銘柄情報') // 打って絞り込む
await page.locator('.dialog.wpick .card.sel[data-widget="info"]').waitFor()
await sleep(500)
await press(page, 'Enter')
await sleep(1500)
await shot(page, 'free-added')
await caption(page, 'Ctrl+Alt+Shift+矢印キーで、ペインを入れ替えます（タイトルのドラッグでも動かせます）')
await press(page, 'Control+Alt+Shift+ArrowLeft')
await sleep(1500)
await press(page, 'Control+Alt+Shift+ArrowRight')
await sleep(1300)
await caption(page, 'Ctrl+Shift+W で、ペインを閉じます')
await press(page, 'Control+Shift+KeyW')
await sleep(1100)
await press(page, 'Control+Shift+KeyW')
await sleep(1500)
await shot(page, 'free-closed')

// 5. インカム: 配当カレンダー・分配金の履歴
await press(page, 'Control+Shift+Digit6')
await caption(page, 'J-REIT の分配金・権利確定月・利回りを確認できます。5 桁の優先株にも対応しています')
await press(page, 'Home')
await sleep(1500)
for (let i = 0; i < 4; i++) {
  await press(page, 'ArrowDown')
  await sleep(900)
} // J-REIT をめくり、優先株（94345）で止まる
await sleep(1200)

await shot(page, 'income')
// 6. 保有
await press(page, 'Control+Shift+Digit7')
await caption(page, '証券会社の CSV から保有を取り込み、評価額・損益・取得利回りを確認できます')
await sleep(1200)
for (let i = 0; i < 3; i++) {
  await press(page, 'ArrowDown')
  await sleep(800)
}
await sleep(600)

await shot(page, 'holdings')
// 6b. ポートフォリオのタブ: 評価額・資産推移・資産構成・損益寄与・配当の分析
const folio = widget('folio')
await press(page, 'Control+Shift+Digit9')
await folio.locator('.c-hist svg').first().waitFor({ timeout: 30_000 })
await caption(page, 'ポートフォリオのタブ: 評価額と資産推移（毎日の更新で記録）、資産構成、損益寄与、配当の見込み')
await sleep(4500)
await shot(page, 'folio')
await caption(page, 'PageDown で配当の分析。年間配当の前年比と、増配・減配・新規・買い増し・売却に分けた増減の要因')
await press(page, 'PageDown')
await folio.locator('.c-dwf').waitFor()
await sleep(4000)
await shot(page, 'folio-div')
await press(page, 'PageUp')
await sleep(600)
// 7. マルチモニタ: 録画では映しにくいので、説明の画面（README のスクリーンショット）で見せる
if (!MULTI) {
  await caption(page, '')
  await panel(page, {
    title: 'マルチモニタに対応しています',
    lines: [
      'Ctrl+Alt+N で、2 枚目以降のモニタ用にチャートを並べた窓を最大 3 枚まで開けます',
      'リンク色を付けたチャートは、1 枚目で選んだ銘柄に追従します',
      '※ 画面は開発中のものです。値はすべて架空のデモデータです',
    ],
    img: MULTI_IMG,
  })
  await sleep(1000)
  await shot(page, 'multi-panel')
  await sleep(6000)
  await panel(page, null)
  await sleep(800)
}
// 7'. 2 枚目のモニタ用のフリーのウィンドウを実際に開く（DEMO_MULTI=1）
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
  // フリー 2 の左上のチャート（開いたときにフォーカスがある）をリンク 2（探して見比べるタブの色）にする → 1 枚目で選んだ銘柄を追う
  await caption(w, 'Ctrl+2 でリンク色を付けると、1 枚目で選んだ銘柄にチャートが追従します')
  await press(w, 'Control+Digit2')
  await sleep(1200)
  await caption(w, '')
  await page.bringToFront()
  await caption(page, '1 枚目で銘柄を選ぶと、2 枚目の窓のチャートも切り替わります')
  await press(page, 'Alt+ArrowLeft', 'Alt+ArrowUp', 'Home')
  for (let i = 0; i < 5; i++) {
    await press(page, 'ArrowDown')
    await sleep(900)
  }
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
// 9. コマンドバー・テーマ・ショートカット一覧・設定
await caption(page, 'すべての操作をキーボードで行えます。Ctrl+K のコマンドバーから呼び出せます')
await press(page, 'Control+k')
await page.keyboard.type('テーマ', { delay: 120 / SPEED })
await sleep(700)
await press(page, 'Enter')
await sleep(600)
await caption(page, 'ダークとライトのテーマを切り替えられます')
await sleep(2200)
await shot(page, 'light')
await caption(page, 'F1 キーで、ショートカットの一覧を表示します')
await press(page, 'F1')
await sleep(2600)
await press(page, 'Escape')
await press(page, 'Control+k')
await page.keyboard.type('テーマ', { delay: 120 / SPEED })
await press(page, 'Enter')
await sleep(800)
await caption(page, '設定画面では、表示・データ・キーの割り当て・ニュースなどを変更できます（Ctrl+,）')
await press(page, 'Control+Comma')
await sleep(1500)
// 一般 → 表示 → チャート → データ → キー → ニュース（↓ 5 回）。次の ↓ で「このアプリについて」（帰属表示）
for (let i = 0; i < 5; i++) {
  await press(page, 'ArrowDown')
  await sleep(1100)
}
await caption(page, 'チャートには TradingView の Lightweight Charts™ を使っています')
await press(page, 'ArrowDown')
await sleep(2500)
await shot(page, 'settings')
await press(page, 'Escape')
await sleep(600)
await caption(page, '')

await shot(page, 'help')
// 10. 終わりの画面
await card(page, [
  'elecxstock',
  '日本株・J-REIT のローカル分析デスクトップアプリ',
  'マーケット・株価ボード・スクリーナー・グリッド・配当シミュレータ・ポートフォリオ・アラート・ニュース',
  '無料・オープンソース（MIT） ・ Windows ・ github.com/kurouna/elecxstock',
  'チャート: TradingView Lightweight Charts™（Apache-2.0）',
  '※ 画面は開発中のものです。動画の株価・利回りなどの値はすべて架空のデモデータです',
])
await shot(page, 'end')
console.log('デモが終わりました。窓を閉じると終わります')
if (process.env.DEMO_EXIT === '1') await app.close()
else await new Promise((r) => app.on('close', r))
