// アラートの条件の確かめ・分割の換算・指標の値・条件までの距離（FR-AL1・AL8。design-alerts.md）。
// Core（判定）と renderer（ダイアログの「いま」・一覧）の両方が使う純粋な関数
import { FIELD_BY_ID, usable } from './fields'
import type { Alert, AlertView, Condition, InstrumentId, JstDate, MetricsRow, Split } from './types'

export const ALERT_LIMIT = 500
/** スクリーンのアラートの上限（スクリーンを判定のたびに走らせるため。§3.4） */
export const SCREEN_ALERT_LIMIT = 20
/** スクリーンのアラートが 1 回の判定で知らせる銘柄の数（残りは「ほか N 件」。FR-AL2） */
export const SCREEN_FIRE_MAX = 20
export const HISTORY_LIMIT = 500

export type Held = Map<InstrumentId, { qty: number; cost: number }>
/** 保有を銘柄ごとの数量と取得額の合計にまとめる（口座区分をまたぐ。Core の判定とダイアログの「いま」が使う） */
export function heldFrom(holdings: { code: string; quantity: number; avgCost: number }[]): Held {
  const out: Held = new Map()
  for (const h of holdings) {
    if (!(h.quantity > 0)) continue
    const id = `JP:${h.code}` as InstrumentId
    const v = out.get(id) ?? { qty: 0, cost: 0 }
    v.qty += h.quantity
    v.cost += h.quantity * h.avgCost
    out.set(id, v)
  }
  return out
}
const NUMERIC = new Set(['number', 'percent', 'money', 'ratio'])

/** アラートの条件として使えるか（FR-AL1）: 数値の市場の指標か保有の損益率、比べ方は >= <=、相対条件は市場の指標どうし */
export function alertConditionOk(c: Condition): boolean {
  if (c.or || c.includeMissing) return false
  if (c.op !== '>=' && c.op !== '<=') return false
  if (typeof c.value !== 'number' || !Number.isFinite(c.value)) return false
  const f = FIELD_BY_ID.get(c.field)
  if (!usable(f) || !NUMERIC.has(f.type)) return false
  if (f.source.kind === 'metrics') {
    if (c.ref) {
      const g = FIELD_BY_ID.get(c.ref)
      return usable(g) && g.source.kind === 'metrics' && NUMERIC.has(g.type)
    }
    return true
  }
  return f.source.kind === 'compute' && f.source.key === 'pnlPct' && !c.ref
}

/** 分割・併合で換算する条件か: 1 株あたりの価格の指標（終値・移動平均・52 週高値など）で、相対条件の無いもの（§3.3） */
export function splitSensitive(c: Condition): boolean {
  const f = FIELD_BY_ID.get(c.field)
  return !!f && f.category === 'price' && f.type === 'money' && !c.ref
}

/** 基準日より後の分割・併合の比率の積（5:1 の分割なら 5。価格は分割調整済みなので、しきい値をこれで割る） */
export function splitFactorAfter(basis: JstDate, splits: Split[]): number {
  let f = 1
  for (const s of splits) if (s.date > basis && s.ratio > 0) f *= s.ratio
  return f
}

/** 分割・併合で換算した条件。換算が要らなければ null */
export function adjustedConditions(a: Alert, splits: Split[]): Condition[] | null {
  const f = splitFactorAfter(a.basis, splits)
  if (f === 1 || !a.conditions.some(splitSensitive)) return null
  return a.conditions.map((c) => (splitSensitive(c) ? { ...c, value: Number(c.value) / f } : c))
}

export const usesHoldings = (c: Condition) => FIELD_BY_ID.get(c.field)?.requires?.includes('holdings') ?? false

/** 指標の値（条件の比べる側）。保有の損益率は保有から計算する */
export function fieldValue(field: string, m: MetricsRow, held: Held | undefined, id: InstrumentId): number | null {
  const f = FIELD_BY_ID.get(field)
  if (!f) return null
  if (f.source.kind === 'metrics') {
    const v = (m as unknown as Record<string, unknown>)[f.source.column]
    return typeof v === 'number' && Number.isFinite(v) ? v : null
  }
  if (f.source.kind === 'compute' && f.source.key === 'pnlPct') {
    const h = held?.get(id)
    if (!h || !(h.cost > 0) || m.close == null) return null
    return ((m.close * h.qty) / h.cost - 1) * 100
  }
  return null
}
/** 条件の比べる相手（しきい値。相対条件なら相手の指標 ± %） */
export function targetOf(c: Condition, m: MetricsRow, held: Held | undefined, id: InstrumentId): number | null {
  if (!c.ref) return Number(c.value)
  const y = fieldValue(c.ref, m, held, id)
  return y == null ? null : y * (1 + Number(c.value) / 100)
}

/** 1 つの条件が成り立つか（値が欠ければ null） */
export function conditionMet(c: Condition, m: MetricsRow, held: Held | undefined, id: InstrumentId): boolean | null {
  const x = fieldValue(c.field, m, held, id)
  const t = targetOf(c, m, held, id)
  if (x == null || t == null) return null
  return c.op === '>=' ? x >= t : x <= t
}

/** 条件までの距離（FR-AL8）: 成り立っていない条件のうちいちばん遠いもの。価格・相対条件は「あと何 %」、ほかは「あと何ポイント」 */
export function distanceOf(
  conditions: Condition[],
  m: MetricsRow | undefined,
  held: Held | undefined,
  id: InstrumentId,
): AlertView['distance'] {
  if (!m) return null
  let best: AlertView['distance'] = null
  for (const c of conditions) {
    const x = fieldValue(c.field, m, held, id)
    const t = targetOf(c, m, held, id)
    if (x == null || t == null) continue
    if (c.op === '>=' ? x >= t : x <= t) continue
    const f = FIELD_BY_ID.get(c.field)
    const d: NonNullable<AlertView['distance']> =
      f?.type === 'money' || c.ref ? { kind: 'pct', value: x !== 0 ? (t / x - 1) * 100 : 0 } : { kind: 'pt', value: t - x }
    if (!best || Math.abs(d.value) > Math.abs(best.value)) best = d
  }
  return best
}

/** 1 つめの条件の指標の今の値（一覧の「現在」） */
export function nowValueOf(a: Alert, m: MetricsRow | undefined, held: Held | undefined): number | null {
  const c = a.conditions[0]
  return c && m && a.target.kind === 'symbol' ? fieldValue(c.field, m, held, a.target.id) : null
}

/** アラートの銘柄（スクリーンのアラートは null） */
export const symbolOf = (a: Pick<Alert, 'target'>): InstrumentId | null => (a.target.kind === 'symbol' ? a.target.id : null)
