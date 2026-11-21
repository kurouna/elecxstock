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
/**
 * IME の変換中か（FR-KB5）。isComposing に加え、変換を始めるキー（Chromium では isComposing が false のまま keyCode 229・key 'Process' で届く）も変換中とみなす
 */
export function composing(e: Pick<KeyboardEvent, 'isComposing' | 'keyCode'>): boolean {
  return e.isComposing || e.keyCode === 229
}

// ---- キーの表記の分解と、押したキーでの当たり（ショートカット一覧・コマンドバー。docs/design-dialogs.md §2・§4）

/** 1 つの組み合わせの表記（'Ctrl+Shift+N'・'+'・'Ctrl+Alt+='）を、同時に押すキーに分ける */
function comboParts(tok: string): string[] {
  if (tok.length <= 1) return [tok]
  // 末尾の + は「+ キー」（Ctrl++ など）
  if (tok.endsWith('++')) return [...tok.slice(0, -2).split('+'), '+']
  return tok.includes('+') ? tok.split('+') : [tok]
}
/** 比べるためのキーの名前（全角のマイナスと半角、大小文字をそろえる） */
const keyName = (k: string) => (k === '−' ? '-' : k.length === 1 ? k.toUpperCase() : k)
const modsOf = (ps: string[]) =>
  ps
    .map((m) => m.toLowerCase())
    .map((m) => (m === 'cmd' || m === 'meta' ? 'ctrl' : m))
    .sort()
    .join('+')
/**
 * 組み合わせの表記 tok が、押した組み合わせ combo（eventKey の形）に当たるか。
 * 範囲（'1–9'・'Alt+1–6'）と、矢印をまとめた 'Arrows' にも当てる
 */
/**
 * 押した組み合わせを表記の形に寄せる: + は物理キーでは Shift+=（US）・Shift+;（JIS）・テンキー（NumpadAdd）、
 * − はテンキー（NumpadSubtract）でも押せる
 */
function typedCombo(combo: string): string {
  if (combo === 'Shift+=' || combo === 'Shift+;' || combo === 'NumpadAdd') return '+'
  if (combo === 'NumpadSubtract') return '-'
  return combo
}
export function comboHits(tok: string, combo: string): boolean {
  if (!combo) return false
  const want = comboParts(typedCombo(combo))
  const wk = keyName(want.pop()!)
  const have = comboParts(tok)
  const hk = keyName(have.pop()!)
  if (modsOf(have) !== modsOf(want)) return false
  if (hk === wk) return true
  const r = /^(\d)[–-](\d)$/.exec(hk)
  if (r && /^\d$/.test(wk)) return +wk >= +r[1]! && +wk <= +r[2]!
  return hk === 'Arrows' && '←→↑↓'.includes(wk)
}
/** 表記（' / ' や空白で並んだもの）のどれかが、押した組み合わせに当たるか */
export function keyHits(keys: string, combo: string): boolean {
  if (!keys || !combo) return false
  return keys.split(/\s\/\s/).some((alt) => alt.split(' ').some((tok) => tok && comboHits(tok, combo)))
}
/** 表記を描く形: 別の組み合わせ（' / '）ごとに、並んだ組み合わせと、押したキー hit に当たるか */
export function keyCombos(keys: string, hit: string): { keys: string[]; hit: boolean }[][] {
  if (!keys.trim()) return []
  return keys.split(/\s\/\s/).map((alt) =>
    alt
      .split(' ')
      .filter(Boolean)
      // 矢印をまとめた Arrows は矢印で描く
      .map((tok) => ({ keys: comboParts(tok).map((k) => (k === 'Arrows' ? '←→↑↓' : k)), hit: !!hit && comboHits(tok, hit) })),
  )
}

/** キーの割り当ての表（設定 keymap）に 1 つ書く。既定と同じキーなら上書きを消す（変えた印・数に入れない）。null は既定に戻す、'' は割り当てなし（既定が割り当てなしの操作では上書きを消す） */
export function withKey(km: Readonly<Record<string, string>>, id: string, key: string | null, def: string): Record<string, string> {
  const out = { ...km }
  if (key == null || normalizeKey(key) === normalizeKey(def)) delete out[id]
  else out[id] = key
  return out
}
