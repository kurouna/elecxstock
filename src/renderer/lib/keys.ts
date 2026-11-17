// キーの表記と照合（FR-KB5, KB6）。物理キー（KeyboardEvent.code）で判定し、表記は 'Ctrl+Shift+K' の形にそろえる。

const NAMES: Record<string, string> = {
  Comma: ',',
  Period: '.',
  Slash: '/',
  Semicolon: ';',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backquote: '`',
  Backslash: '\\',
  Quote: "'",
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Escape: 'Esc',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
  Space: 'Space',
}
const MODS = new Set(['ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'])

/** KeyboardEvent.code をキーの名前に（KeyA → A、Digit1 → 1、Numpad1 → Num1） */
export function codeName(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^Digit\d$/.test(code)) return code.slice(5)
  if (/^Numpad\d$/.test(code)) return `Num${code.slice(6)}`
  return NAMES[code] ?? code
}
/** 修飾キーだけの押下は null */
export function eventKey(e: KeyboardEvent): string | null {
  if (MODS.has(e.code)) return null
  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  parts.push(codeName(e.code))
  return parts.join('+')
}
/** 表記をそろえる（修飾キーは Ctrl → Alt → Shift の順、大文字小文字を区別しない） */
export function normalizeKey(s: string): string {
  if (!s) return ''
  const parts = s.split('+').map((x) => x.trim())
  const key = parts.pop() ?? ''
  const m = new Set(parts.map((x) => x.toLowerCase()))
  const out: string[] = []
  if (m.has('ctrl') || m.has('cmd') || m.has('meta')) out.push('Ctrl')
  if (m.has('alt')) out.push('Alt')
  if (m.has('shift')) out.push('Shift')
  out.push(key.length === 1 ? key.toUpperCase() : key)
  return out.join('+')
}
export function matches(e: KeyboardEvent, key: string | undefined): boolean {
  if (!key) return false
  const k = eventKey(e)
  return !!k && normalizeKey(k) === normalizeKey(key)
}
/**
 * ペインが使うので全体のアクションに割り当てないキー（ニュースのペインのコピー。FR-NW7。チャートの描画の Alt+T・Ctrl+Y。FR-C14）。
 * 全体のアクションはペインより先に照合するので、割り当てるとペインのキーが取られる
 */
export const PANE_RESERVED: readonly string[] = ['Ctrl+C', 'Ctrl+Alt+C', 'Alt+T', 'Ctrl+Y']
export const reservedKey = (key: string) => PANE_RESERVED.includes(normalizeKey(key))

/** 単キー（修飾なし）はペインの中の操作に使うので、アプリ全体の割り当てには使わせない（F1〜F12 は除く）。PANE_RESERVED も */
export function assignable(key: string): boolean {
  const n = normalizeKey(key)
  if (!n) return true
  if (reservedKey(n)) return false
  if (/^F([1-9]|1[0-2])$/.test(n.split('+').pop()!)) return true
  return n.includes('Ctrl+') || n.includes('Alt+')
}
