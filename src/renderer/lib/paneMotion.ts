// ペインの最大化・戻すの動き（FLIP）とタブの下線の位置を出す純粋な関数（FR-L3・FR-V9。docs/design-motion.md）。
// ペインは一度で最終の大きさにし、元の矩形から transform で飛ばす（大きさを毎フレーム変えるとチャートが描き直し続けるため）。

/** getBoundingClientRect の矩形（表示倍率が掛かった px） */
export interface Box {
  left: number
  top: number
  width: number
  height: number
}

/** 後の矩形に置いた要素を、前の矩形の上に描く transform（要素の中心が基準） */
export interface Flip {
  dx: number
  dy: number
  sx: number
  sy: number
}

/**
 * 前の矩形から後の矩形へ飛ばす transform。矩形は倍率が掛かった px だが、transform の translate は
 * ルートの zoom の中で倍率が掛かるので、差は zoom で割る（比は割らない）。どちらかの面積が 0 なら null（飛ばさない）
 */
export function flipFrom(before: Box, after: Box, zoom: number): Flip | null {
  if (before.width <= 0 || before.height <= 0 || after.width <= 0 || after.height <= 0) return null
  const z = zoom > 0 ? zoom : 1
  const dx = (before.left + before.width / 2 - (after.left + after.width / 2)) / z
  const dy = (before.top + before.height / 2 - (after.top + after.height / 2)) / z
  const sx = before.width / after.width
  const sy = before.height / after.height
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.001 && Math.abs(sy - 1) < 0.001) return null
  return { dx, dy, sx, sy }
}

const n4 = (v: number): string => String(Number(v.toFixed(4)))

/** Flip を CSS の transform にする */
export function flipTransform(f: Flip): string {
  return `translate(${n4(f.dx)}px, ${n4(f.dy)}px) scale(${n4(f.sx)}, ${n4(f.sy)})`
}

/** CSS の時間のトークン（`150ms`・`0.15s`）をミリ秒にする。読めない・負の値は 0（動かさない） */
export function motionMs(raw: string): number {
  const m = /^\s*(-?[\d.]+)\s*(ms|s)\s*$/.exec(raw)
  if (!m) return 0
  const v = Number(m[1]) * (m[2] === 's' ? 1000 : 1)
  return Number.isFinite(v) && v > 0 ? v : 0
}

/**
 * タブの下線の位置: 選んだボタン（マイレイアウトはタブと ▾ の 2 つ）の左端から右端まで。
 * offsetLeft・offsetWidth（倍率が掛かっていない px）で渡す。選んだものが無ければ null
 */
export function inkSpan(items: { left: number; width: number }[]): { left: number; width: number } | null {
  const xs = items.filter((r) => r.width > 0)
  if (!xs.length) return null
  const left = Math.min(...xs.map((r) => r.left))
  const right = Math.max(...xs.map((r) => r.left + r.width))
  return { left, width: right - left }
}

/**
 * タブを替えたときに中身が入ってくる向き: 並び（order）で右のタブへ移ったら 1（右から）、左なら -1、
 * 同じタブの中（マイレイアウトのページどうし `free:<id>`）や並びに無いものは 0（滑らせずに出すだけ）
 */
export function slideDir(prev: string, next: string, order: readonly string[]): -1 | 0 | 1 {
  const base = (k: string) => k.split(':')[0]!
  const a = order.indexOf(base(prev))
  const b = order.indexOf(base(next))
  if (a < 0 || b < 0 || a === b) return 0
  return b > a ? 1 : -1
}

/** タブの中身が入ってくる動き。透明から始めず（読めるまでを遅らせない）、向きの分だけ少し滑らせる。fade が false（連打で前の動きの途中）なら滑らせるだけ */
export const ENTER_FROM_OPACITY = 0.3
export const ENTER_SHIFT_PX = 16
export function enterFrames(dir: -1 | 0 | 1, fade = true): Keyframe[] {
  return [
    { opacity: fade ? ENTER_FROM_OPACITY : 1, transform: `translateX(${dir * ENTER_SHIFT_PX}px)` },
    { opacity: 1, transform: 'none' },
  ]
}

/**
 * ドロワーのタブを替えたときに中身を滑らせる向き。null は動かさない:
 * ドロワーが開いて落ち着いていない（閉じた状態から選んだ・開く動きと重なる）、初めて、同じペインのまま（前のペインを外して番号が詰まった）、
 * 前のペインがもう無い。hint はキーの操作の向き（Ctrl+Tab は 1、Ctrl+Shift+Tab は -1。端で折り返しても向きを保つ）で、0 なら並びの位置で決める
 */
export function drawerSlide(
  prevId: string | null,
  nextId: string | null,
  ids: readonly string[],
  hint: -1 | 0 | 1,
  shown: boolean,
): -1 | 1 | null {
  if (!shown || !prevId || !nextId || prevId === nextId) return null
  const a = ids.indexOf(prevId)
  const b = ids.indexOf(nextId)
  if (a < 0 || b < 0) return null
  if (hint) return hint
  return b > a ? 1 : -1
}

const idOf = new WeakMap<object, number>()
let lastIdentity = 0
/** オブジェクトの同一性を数にする（コンポーネントが使い回されて中身の持ち主が替わったことを見分ける。例: タブをまたいだドロワー） */
export function identity(o: object): number {
  let n = idOf.get(o)
  if (n === undefined) {
    n = ++lastIdentity
    idOf.set(o, n)
  }
  return n
}
