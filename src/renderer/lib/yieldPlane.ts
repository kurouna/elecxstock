// 配当と株価の平面の形（docs/design-yield-breakdown.md §3.4。FR-I11）: 横 = 1 株配当（直近 12 か月）、縦 = 株価の両対数。
// x と y の 1 px あたりの倍率を同じにして、同じ利回りの線（株価 = 配当 ÷ 利回り）を 45° の平行線にする。コンポーネントは描くだけ
import type { YieldPoint } from '@shared/yieldPath'

export interface Pad {
  l: number
  r: number
  t: number
  b: number
}
export interface PlaneBox {
  w: number
  h: number
  pad: Pad
  /** 対数の範囲（ln 配当・ln 株価） */
  lx0: number
  lx1: number
  ly0: number
  ly1: number
}
type XY = Pick<YieldPoint, 'price' | 'div12'>
/** 枠: 点（配当が正のものだけ）を 15% の余白で囲み、狭い方を広げて x と y の倍率をそろえる。点が無ければ null */
export function planeBox(points: readonly XY[], w: number, h: number, pad: Pad): PlaneBox | null {
  const ps = points.filter((p) => p.div12 > 0 && p.price > 0)
  if (!ps.length) return null
  const iw = Math.max(1, w - pad.l - pad.r)
  const ih = Math.max(1, h - pad.t - pad.b)
  let lx0 = Math.log(Math.min(...ps.map((p) => p.div12)) * 0.85)
  let lx1 = Math.log(Math.max(...ps.map((p) => p.div12)) * 1.15)
  let ly0 = Math.log(Math.min(...ps.map((p) => p.price)) * 0.85)
  let ly1 = Math.log(Math.max(...ps.map((p) => p.price)) * 1.15)
  const k = Math.max((lx1 - lx0) / iw, (ly1 - ly0) / ih)
  const cx = (lx0 + lx1) / 2
  const cy = (ly0 + ly1) / 2
  lx0 = cx - (k * iw) / 2
  lx1 = cx + (k * iw) / 2
  ly0 = cy - (k * ih) / 2
  ly1 = cy + (k * ih) / 2
  return { w, h, pad, lx0, lx1, ly0, ly1 }
}
/** 配当・株価 → 画面の座標 */
export function toXY(b: PlaneBox, div: number, price: number): [number, number] {
  const iw = b.w - b.pad.l - b.pad.r
  const ih = b.h - b.pad.t - b.pad.b
  return [b.pad.l + ((Math.log(div) - b.lx0) / (b.lx1 - b.lx0)) * iw, b.pad.t + (1 - (Math.log(price) - b.ly0) / (b.ly1 - b.ly0)) * ih]
}
export interface IsoLine {
  yield: number
  x1: number
  y1: number
  x2: number
  y2: number
}
/**
 * 同じ利回りの線（ln 株価 = ln 配当 − ln 利回り）を枠で切った線分。左下 → 右上。枠に入らない利回りは出さない。
 * 札は右上の端（x2, y2）に置く
 */
export function isoLines(b: PlaneBox, yields: readonly number[]): IsoLine[] {
  const out: IsoLine[] = []
  for (const y of yields) {
    const c = Math.log(y)
    // ly = lx − c が枠に入る lx の範囲
    const a = Math.max(b.lx0, b.ly0 + c)
    const z = Math.min(b.lx1, b.ly1 + c)
    if (!(z > a)) continue
    const [x1, y1] = toXY(b, Math.exp(a), Math.exp(a - c))
    const [x2, y2] = toXY(b, Math.exp(z), Math.exp(z - c))
    out.push({ yield: y, x1, y1, x2, y2 })
  }
  return out
}
export interface TrailSeg {
  x1: number
  y1: number
  x2: number
  y2: number
  /** 古い 0 → 新しい 1（色と太さに使う） */
  t: number
}
/** 軌跡の線分（配当 0 の月で切る） */
export function trail(path: readonly XY[], b: PlaneBox): TrailSeg[] {
  const out: TrailSeg[] = []
  const n = path.length
  for (let i = 1; i < n; i++) {
    const p = path[i - 1]!
    const q = path[i]!
    if (!(p.div12 > 0 && q.div12 > 0)) continue
    const [x1, y1] = toXY(b, p.div12, p.price)
    const [x2, y2] = toXY(b, q.div12, q.price)
    out.push({ x1, y1, x2, y2, t: n > 1 ? i / (n - 1) : 1 })
  }
  return out
}
/** 十字線の月を動かす（月で持つ）。無ければ ← → で今の月。← → は 1 か月、Shift で 12 か月、端で止まる。Home End。ほかは null */
export function cursorStep(path: readonly Pick<YieldPoint, 'm'>[], m: string | null, key: string, shift: boolean): string | null {
  const n = path.length
  if (!n) return null
  if (key === 'Home') return path[0]!.m
  if (key === 'End') return path[n - 1]!.m
  if (key !== 'ArrowLeft' && key !== 'ArrowRight') return null
  const at = m ? path.findIndex((p) => p.m === m) : -1
  if (at < 0) return path[n - 1]!.m
  const step = (key === 'ArrowLeft' ? -1 : 1) * (shift ? 12 : 1)
  return path[Math.max(0, Math.min(n - 1, at + step))]!.m
}
/** 十字線の月の位置（無い・選んでいなければ今 = 最後） */
export function cursorIndex(path: readonly Pick<YieldPoint, 'm'>[], m: string | null): number {
  const at = m ? path.findIndex((p) => p.m === m) : -1
  return at < 0 ? path.length - 1 : at
}
/** 同じ利回りの線（1〜12% の 1 pt ごと。§2.3） */
export const ISO_YIELDS: readonly number[] = Array.from({ length: 12 }, (_, i) => (i + 1) / 100)
/** 対数の目盛り（1・2・5 の 10 のべきのうち、lo〜hi に入るもの） */
export function logTicks(lo: number, hi: number): number[] {
  const out: number[] = []
  for (let e = -2; e < 8; e++)
    for (const m of [1, 2, 5]) if (m * 10 ** e >= lo && m * 10 ** e <= hi) out.push(Number((m * 10 ** e).toPrecision(1)))
  return out
}
/** 始まりの利回りの札を下げる量: 今の札と近い（横 200 px・縦 20 px 以内）と重なるので 1 行（16 px）下げる */
export function labelDy(start: IsoLine | undefined, now: IsoLine | undefined): number {
  return start && now && Math.abs(start.x2 - now.x2) < 200 && Math.abs(start.y2 - now.y2) < 20 ? 16 : 0
}
