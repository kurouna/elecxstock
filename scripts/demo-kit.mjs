// デモの共通の部品（字幕・押したキー・タイトルの画面・キーを押す）。scripts/demo-v0.1.1.mjs が使う（scripts/demo.mjs と同じ見た目）
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

export const SPEED = Number(process.env.DEMO_SPEED ?? 1) || 1
export const WAIT = Number(process.env.DEMO_WAIT ?? 8)
export const SIZE = process.env.DEMO_SIZE ?? 'max'
const SHOTS = process.env.DEMO_SHOTS
/** 1 で、場面ごとのスクリーンショットを字幕・押したキーなしでも撮る（DEMO_SHOTS の下の clean/。架空の値の注意は残す） */
const CLEAN = process.env.DEMO_SHOTS_CLEAN === '1'
/** light / dark: 2 回目の起動の前にテーマを決める（準備の起動で setTheme を呼ぶ）。動画とスクリーンショットで変えるとき */
export const THEME = process.env.DEMO_THEME
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms / SPEED))
export const call = (page, method, params = {}) => page.evaluate(([m, p]) => window.elecxstock.call(m, p), [method, params])

/** 字幕・押したキー・タイトルの画面を重ねる（操作は邪魔しない） */
export async function overlay(p) {
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
    keys.id = 'demo-keys'
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
export const caption = (p, text) =>
  p.evaluate((t) => {
    const c = document.getElementById('demo-cap')
    if (!c) return
    c.textContent = t
    c.style.opacity = t ? '1' : '0'
  }, text)
/** タイトル・終わりの画面（lines: [大きい行, 小さい行…]）。null で消す */
export const card = (p, lines) =>
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
export const panel = (p, o) =>
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
export const press = async (p, ...keys) => {
  for (const k of keys) {
    await p.keyboard.press(k)
    await sleep(380)
  }
}
let shotNo = 0
export const shot = async (p, name) => {
  if (!SHOTS) return
  const file = `${String(++shotNo).padStart(2, '0')}-${name}.png`
  await p.screenshot({ path: join(SHOTS, file), animations: 'disabled' })
  if (!CLEAN) return
  // 字幕と押したキーを隠して撮り直す（タイトル・終わりの画面と架空の値の注意はそのまま）
  mkdirSync(join(SHOTS, 'clean'), { recursive: true })
  const toggle = (hide) =>
    p.evaluate((h) => {
      for (const id of ['demo-cap', 'demo-keys']) {
        const e = document.getElementById(id)
        if (e) e.style.visibility = h ? 'hidden' : ''
      }
    }, hide)
  await toggle(true)
  await p.screenshot({ path: join(SHOTS, 'clean', file), animations: 'disabled' })
  await toggle(false)
}
/** DEMO_THEME があれば、準備の起動でテーマを保存する（2 回目の起動はそのテーマで始まる） */
export async function setTheme(p) {
  if (THEME !== 'light' && THEME !== 'dark') return
  const u = await call(p, 'user.load')
  await call(p, 'user.saveSettings', { settings: { ...u.settings, theme: THEME } })
}
export const typeCode = (p, code) => press(p, ...[...code].map((c) => (/\d/.test(c) ? `Digit${c}` : `Key${c}`)))
