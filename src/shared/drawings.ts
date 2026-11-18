// チャートの描画（トレンドライン。FR-C13〜C18・docs/design-drawings.md）の形式と純粋な関数。
// Core（保存・タイル用の換算）と renderer（描く・キーの操作）が共有する。画面の部品はここに計算を持たない。
import { z } from 'zod'
import { addDays, dayOfWeek, isTradingDay, prevTradingDay, tradingDaysBetween } from './calendar'
import type { Adjustment, Timeframe } from './types'

/** 銘柄ごとの図形の上限 */
export const DRAWING_LIMIT = 100
/** 色のトークン（app.css の --draw-1〜6）。フェーズ 1 は選ぶ画面が無く、省略（既定の色）だけ */
export const DRAW_COLORS = ['--draw-1', '--draw-2', '--draw-3', '--draw-4', '--draw-5', '--draw-6'] as const
export const EXTENDS = ['none', 'right', 'left', 'both'] as const
export type Extend = (typeof EXTENDS)[number]

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
/** 点: 日付（日本時間）と、その日の未調整の価格（円）。分割があっても書き換えない（FR-C16） */
export const drawingPointSchema = z.object({ date: day, raw: z.number().positive().max(1e9) })
export const trendDrawingSchema = z.object({
  id: z.string().min(1).max(40),
  kind: z.literal('trend'),
  a: drawingPointSchema,
  b: drawingPointSchema,
  extend: z.enum(EXTENDS),
  priceLabel: z.boolean(),
  /** 引いたときの軸（線の価格の正の定義。フェーズ 3 のトレンドラインのアラートが使う） */
  log: z.boolean(),
  color: z.enum(DRAW_COLORS).optional(),
  width: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  dash: z.enum(['solid', 'dashed', 'dotted']).optional(),
  created: z.string().max(40),
  updated: z.string().max(40),
})
/** 図形（後で水平線・価格帯を足す） */
export const drawingSchema = z.discriminatedUnion('kind', [trendDrawingSchema])
export type Drawing = z.infer<typeof drawingSchema>
export type TrendDrawing = z.infer<typeof trendDrawingSchema>
export type DrawingPoint = z.infer<typeof drawingPointSchema>
/**
 * drawings.json: 銘柄 → 図形。要素は検証せずに受ける（知らない kind・通らない図形を、古い版が読んでも消さない）。
 * 図形ごとの検証は readDrawings
 */
export const drawingsFileSchema = z.record(z.string().max(24), z.array(z.unknown()).max(1000))

/** 通る図形だけ（知らない kind・壊れた図形は読み飛ばす） */
export function readDrawings(list: readonly unknown[]): Drawing[] {
  const out: Drawing[] = []
  for (const x of list) {
    const r = drawingSchema.safeParse(x)
    if (r.success) out.push(r.data)
  }
  return out
}
/** a を前の日付にそろえる */
export function normalizeDrawing<D extends Drawing>(d: D): D {
  return d.a.date <= d.b.date ? d : { ...d, a: d.b, b: d.a }
}

// ---- 価格の換算（FR-C16） ----

type SplitLike = { date: string; ratio: number }
/** その日より後の分割の比率の積（core/series.ts の splitFactor と同じ） */
export function splitFactorAt(date: string, splits: readonly SplitLike[]): number {
  let f = 1
  for (const s of splits) if (s.date > date) f *= s.ratio
  return f
}
/** 点の価格を表示の空間へ。配当込みは出さない（フェーズ 2） */
export function toShown(raw: number, date: string, adj: Adjustment, splits: readonly SplitLike[]): number | null {
  if (adj === 'total') return null
  return adj === 'unadjusted' ? raw : raw / splitFactorAt(date, splits)
}
/** 表示の価格をその日の未調整の価格へ */
export function toRaw(price: number, date: string, adj: Adjustment, splits: readonly SplitLike[]): number | null {
  if (adj === 'total') return null
  return adj === 'unadjusted' ? price : price * splitFactorAt(date, splits)
}

// ---- 日付 → 足の番号（FR-C13） ----

const mondayOf = (d: string) => addDays(d, -((dayOfWeek(d) + 6) % 7))
const weeksBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${mondayOf(b)}T00:00:00Z`) - Date.parse(`${mondayOf(a)}T00:00:00Z`)) / 604_800_000)
const monthNo = (d: string) => Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7))
const tradingOnOrBefore = (d: string) => (isTradingDay(d) ? d : prevTradingDay(d))

/**
 * 日付 → 足の論理番号。範囲の中は「その日以前で最後の足」（足の日付は期間の最初の取引日）。最初の足より前・最後の足より後は、
 * 日足は営業日の数、週足は週の数、月足は月の数で外挿する（チャートの時刻は一目均衡表で未来に暦日が足されるので使わない）
 */
export function indexOfDate(date: string, time: readonly string[], tf: Timeframe): number {
  const n = time.length
  if (!n) return Number.NaN
  const first = time[0]!
  const last = time[n - 1]!
  if (date < first) {
    if (tf === 'D') return -tradingDaysBetween(tradingOnOrBefore(date), first)
    if (tf === 'W') return -weeksBetween(date, first)
    return monthNo(date) - monthNo(first)
  }
  // 最後の足の期間より後
  const beyond = tf === 'D' ? tradingOnOrBefore(date) > last : tf === 'W' ? weeksBetween(last, date) > 0 : monthNo(date) > monthNo(last)
  if (beyond) {
    if (tf === 'D') return n - 1 + tradingDaysBetween(last, tradingOnOrBefore(date))
    if (tf === 'W') return n - 1 + weeksBetween(last, date)
    return n - 1 + monthNo(date) - monthNo(last)
  }
  let lo = 0
  let hi = n - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (time[mid]! <= date) lo = mid
    else hi = mid - 1
  }
  return lo
}

// ---- 吸着（FR-C14・C15） ----

export type SnapKey = 'o' | 'h' | 'l' | 'c'
export interface SnapLevel {
  k: SnapKey
  v: number
}
/** 足の吸着の点を値の大きい順に（同じ値はまとめる）。ラインは終値だけ */
export function snapLevels(bar: Record<SnapKey, number>, ctype: 'candle' | 'bar' | 'line'): SnapLevel[] {
  if (ctype === 'line') return [{ k: 'c', v: bar.c }]
  const all: SnapLevel[] = (['h', 'c', 'o', 'l'] as const).map((k) => ({ k, v: bar[k] }))
  // 同じ値は高値・安値を残す（ローソクの端の点として読める）
  const rank: Record<SnapKey, number> = { h: 0, l: 0, c: 1, o: 2 }
  all.sort((x, y) => y.v - x.v || rank[x.k] - rank[y.k])
  return all.filter((x, i) => i === 0 || x.v !== all[i - 1]!.v)
}
/** ↑（dir=1）・↓（dir=-1）で隣の点。今の価格が点の上なら隣へ、点の間（自由な価格）ならその向きで最も近い点。端では止まる */
export function nextSnap(levels: readonly SnapLevel[], price: number, dir: 1 | -1): SnapLevel {
  const at = levels.findIndex((x) => x.v === price)
  if (at >= 0) return levels[Math.max(0, Math.min(levels.length - 1, at - dir))]!
  if (dir < 0) return levels.find((x) => x.v < price) ?? levels.at(-1)!
  return [...levels].reverse().find((x) => x.v > price) ?? levels[0]!
}
/** マウスの吸着（弱）: ポインタの y から threshold px 以内で最も近い点（無ければ null） */
export function nearestSnap(levels: readonly { k: SnapKey; y: number }[], y: number, threshold: number): SnapKey | null {
  let best: SnapKey | null = null
  let d = threshold
  for (const l of levels) {
    const e = Math.abs(l.y - y)
    if (e <= d) {
      d = e
      best = l.k
    }
  }
  return best
}

/**
 * 山・谷へ跳ぶ（Ctrl+← →）: i から dir の向きに、前後 span 本の範囲で高値が最大（山）か安値が最小（谷）の足を探す。
 * 前後に span 本ずつ足がある足だけ（端の足は山・谷にしない）。同じ値が並ぶときは左の足だけ。両方なら山
 */
export function swingFrom(
  high: readonly number[],
  low: readonly number[],
  i: number,
  dir: 1 | -1,
  span = 5,
): { i: number; kind: 'h' | 'l' } | null {
  const n = high.length
  for (let j = i + dir; j >= 0 && j < n; j += dir) {
    if (j < span || j >= n - span) continue
    let isHi = true
    let isLo = true
    // 同じ値が並ぶときは左の足だけを山・谷にする（左は厳しく、右は同じ値まで許す）
    for (let k = j - span; k <= j + span; k++) {
      if (k < j ? high[k]! >= high[j]! : high[k]! > high[j]!) isHi = false
      if (k < j ? low[k]! <= low[j]! : low[k]! < low[j]!) isLo = false
    }
    if (isHi) return { i: j, kind: 'h' }
    if (isLo) return { i: j, kind: 'l' }
  }
  return null
}

// ---- 線の形（px。FR-C13） ----

export interface Px {
  x: number
  y: number
}
/** x での線の y（2 点の x が同じなら null） */
export function yAtX(a: Px, b: Px, x: number): number | null {
  if (a.x === b.x) return null
  return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x)
}
/**
 * 延長を含めた線の両端（左 → 右）。延長は px で外挿して描く範囲の端（0・width）まで（価格で外挿すると対数軸で 0 以下になる）。
 * 2 点の x が同じ（同じ足）なら延長しない
 */
export function segment(a: Px, b: Px, extend: Extend, width: number): [Px, Px] {
  const [L, R] = a.x <= b.x ? [a, b] : [b, a]
  if (L.x === R.x) return [L, R]
  const left = (extend === 'left' || extend === 'both') && L.x > 0 ? { x: 0, y: yAtX(L, R, 0)! } : L
  const right = (extend === 'right' || extend === 'both') && R.x < width ? { x: width, y: yAtX(L, R, width)! } : R
  return [left, right]
}
/** 点から線分までの距離（px） */
export function distToSegment(p: Px, s0: Px, s1: Px): number {
  const dx = s1.x - s0.x
  const dy = s1.y - s0.y
  const len = dx * dx + dy * dy
  const t = len ? Math.max(0, Math.min(1, ((p.x - s0.x) * dx + (p.y - s0.y) * dy) / len)) : 0
  return Math.hypot(p.x - (s0.x + t * dx), p.y - (s0.y + t * dy))
}
/** 足 i が線の範囲（延長を含む）にあるか（価格ラベル）。同じ足の 2 点は出さない */
export function covers(i: number, ai: number, bi: number, extend: Extend): boolean {
  const lo = Math.min(ai, bi)
  const hi = Math.max(ai, bi)
  if (lo === hi) return false
  if (i < lo) return extend === 'left' || extend === 'both'
  if (i > hi) return extend === 'right' || extend === 'both'
  return true
}
/** E キーの延長の順（左はメニューから） */
export function extendNext(e: Extend): Extend {
  return e === 'none' ? 'right' : e === 'right' ? 'both' : e === 'both' ? 'none' : 'right'
}

// ---- 選ぶ順（G・Shift+G） ----

/** 表示範囲 [from, to] に掛かる図形を先に、足 anchor に近い順（同じなら ID 順） */
export function selectionOrder(
  items: readonly { id: string; ai: number; bi: number }[],
  from: number,
  to: number,
  anchor: number,
): string[] {
  const key = (x: { ai: number; bi: number }) => {
    const lo = Math.min(x.ai, x.bi)
    const hi = Math.max(x.ai, x.bi)
    return { inView: hi >= from && lo <= to, dist: anchor < lo ? lo - anchor : anchor > hi ? anchor - hi : 0 }
  }
  return [...items]
    .map((x) => ({ id: x.id, ...key(x) }))
    .sort((p, q) => Number(q.inView) - Number(p.inView) || p.dist - q.dist || (p.id < q.id ? -1 : 1))
    .map((x) => x.id)
}
export function nextSelection(order: readonly string[], cur: string | null, dir: 1 | -1): string | null {
  if (!order.length) return null
  const i = cur == null ? -1 : order.indexOf(cur)
  if (i < 0) return dir > 0 ? order[0]! : order.at(-1)!
  return order[(i + dir + order.length) % order.length]!
}

// ---- 状態の遷移（design-drawings.md §3.1・§8） ----

export type DrawTarget = 'none' | 'all' | 'a' | 'b'
export type DrawMode = { m: 'idle' } | { m: 'start' } | { m: 'end'; a: DrawingPoint } | { m: 'sel'; id: string; target: DrawTarget }
export type DrawEvent =
  | { t: 'begin' }
  | { t: 'enter'; point: DrawingPoint }
  | { t: 'created'; id: string }
  | { t: 'esc' }
  | { t: 'space' }
  | { t: 'select'; id: string }
  | { t: 'removed'; id: string }
  /** 作り直し（時間軸・調整・種類・指標） */
  | { t: 'rebuild' }
  /** フォーカスが外れた・MTF でほかの段へ */
  | { t: 'blur' }
  /** 銘柄が変わった */
  | { t: 'symbol' }
  /** 描けない表示（比較・配当込み）になった */
  | { t: 'hidden' }

const IDLE: DrawMode = { m: 'idle' }
const TARGETS: DrawTarget[] = ['none', 'all', 'a', 'b']
export function step(s: DrawMode, e: DrawEvent): DrawMode {
  switch (e.t) {
    case 'blur':
    case 'symbol':
    case 'hidden':
      return IDLE
    case 'rebuild':
      return s.m === 'start' || s.m === 'end' ? IDLE : s
    case 'begin':
      return { m: 'start' }
    case 'enter':
      return s.m === 'start' ? { m: 'end', a: e.point } : s
    case 'created':
      return s.m === 'end' ? { m: 'sel', id: e.id, target: 'none' } : s
    case 'esc':
      return s.m === 'end' ? { m: 'start' } : IDLE
    case 'space':
      return s.m === 'sel' ? { ...s, target: TARGETS[(TARGETS.indexOf(s.target) + 1) % TARGETS.length]! } : s
    case 'select':
      return s.m === 'idle' || s.m === 'sel' ? { m: 'sel', id: e.id, target: 'none' } : s
    case 'removed':
      return s.m === 'sel' && s.id === e.id ? IDLE : s
  }
}

// ---- Core のメソッド（api.ts の PARAMS・Results に混ぜる。docs/design-drawings.md §7.2） ----

const instrumentId = z.string().min(3).max(24)
/** 書くときの図形: 作った時刻・更新の時刻は Core が付ける（取り消しで足し直すときは作った時刻を保つ） */
const drawingInput = trendDrawingSchema.extend({ created: z.string().max(40).optional(), updated: z.string().max(40).optional() })
export const DRAWINGS_PARAMS = {
  'drawings.all': z.object({}),
  'drawings.create': z.object({ id: instrumentId, drawing: drawingInput }),
  /** expected: 読んだときの updated（違えば断って今の値を返す。窓どうしの同時の編集で上書きしない） */
  'drawings.update': z.object({ id: instrumentId, drawing: drawingInput, expected: z.string().max(40) }),
  'drawings.remove': z.object({ id: instrumentId, drawingId: z.string().min(1).max(40), expected: z.string().max(40) }),
  'drawings.clear': z.object({ id: instrumentId }),
  /** グリッドのタイル: 分割調整の表示の価格にした点（FR-C18） */
  'drawings.shown': z.object({ ids: z.array(instrumentId).max(60) }),
} as const
/** 直す・消すの結果。断ったときは今の値（消されていれば null） */
export type DrawingWrite = { ok: true; drawing: Drawing } | { ok: false; current: Drawing | null }
/** タイルに描く線（分割調整の表示の価格） */
export interface ShownLine {
  id: string
  a: { date: string; price: number }
  b: { date: string; price: number }
  extend: Extend
  color?: Drawing['color']
  width?: Drawing['width']
  dash?: Drawing['dash']
}
export interface DrawingsResults {
  'drawings.all': Record<string, Drawing[]>
  'drawings.create': DrawingWrite
  'drawings.update': DrawingWrite
  'drawings.remove': DrawingWrite
  'drawings.clear': Drawing[]
  'drawings.shown': Record<string, ShownLine[]>
}

/** タイルに描く線（足の番号と表示の価格。色はトークン名） */
export interface TileLine {
  ai: number
  ap: number
  bi: number
  bp: number
  extend: Extend
  color: string
  dash: 'solid' | 'dashed' | 'dotted'
}
/** Core が換算した線をタイルの足の番号にする（足が無ければ描かない） */
export function tileLines(lines: readonly ShownLine[] | undefined, time: readonly string[], tf: Timeframe): TileLine[] {
  if (!lines?.length || time.length < 2) return []
  return lines.map((l) => ({
    ai: indexOfDate(l.a.date, time, tf),
    ap: l.a.price,
    bi: indexOfDate(l.b.date, time, tf),
    bp: l.b.price,
    extend: l.extend,
    color: l.color ?? '--draw-1',
    dash: l.dash ?? 'solid',
  }))
}
