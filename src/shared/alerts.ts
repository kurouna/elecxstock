// アラートの条件の確かめ・分割の換算・指標の値・条件までの距離（FR-AL1・AL8。design-alerts.md）。
// Core（判定）と renderer（ダイアログの「いま」・一覧）の両方が使う純粋な関数
import type { Held } from './compute'
import { FIELD_BY_ID, perShare, refFields, refInPoints, refTarget, usable } from './fields'
import type { Alert, AlertView, Condition, InstrumentId, JstDate, MetricsRow, Split } from './types'

export const ALERT_LIMIT = 500
/** スクリーンのアラートの上限（スクリーンを判定のたびに走らせるため。§3.4） */
export const SCREEN_ALERT_LIMIT = 20
/** スクリーンのアラートが 1 回の判定で知らせる銘柄の数（残りは「ほか N 件」。FR-AL2） */
export const SCREEN_FIRE_MAX = 20
export const HISTORY_LIMIT = 500

export type { Held }
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
      return usable(g) && g.source.kind === 'metrics' && NUMERIC.has(g.type) && refFields(f).some((x) => x.id === g.id)
    }
    return true
  }
  return f.source.kind === 'compute' && f.source.key === 'pnlPct' && !c.ref
}

/** 分割・併合で換算する条件か: 1 株あたりの価格の指標（終値・移動平均・52 週高値など）で、相対条件の無いもの（§3.3） */
export function splitSensitive(c: Condition): boolean {
  const f = FIELD_BY_ID.get(c.field)
  return !!f && perShare(f) && !c.ref
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
  return y == null ? null : refTarget(c.field, y, Number(c.value))
}

/** 1 つの条件が成り立つか（値が欠ければ null） */
export function conditionMet(c: Condition, m: MetricsRow, held: Held | undefined, id: InstrumentId): boolean | null {
  const x = fieldValue(c.field, m, held, id)
  const t = targetOf(c, m, held, id)
  if (x == null || t == null) return null
  return c.op === '>=' ? x >= t : x <= t
}

/**
 * 条件までの距離（FR-AL8）: 成り立っていない条件のうちいちばん遠いもの。金額（価格・EPS など）と価格どうしの相対条件は「あと何 %」、
 * 率の指標は「あと何ポイント」。金額で今の値が 0 以下かしきい値が負（EPS・BPS）のときは % にできないので、円の差（kind: 'yen'）
 */
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
    // % は今の値が正でしきい値が 0 以上のときだけ（EPS・BPS は負・0 になる。−100 → 100 が −200%、0 が 0% にならないよう、円の差にする）。
    // 正の値 → 0（1 株配当 ≤ 0）は −100% のまま
    const inMoney = (f?.type === 'money' && !c.ref) || (!!c.ref && !refInPoints(c.field))
    const d: NonNullable<AlertView['distance']> = !inMoney
      ? { kind: 'pt', value: t - x }
      : x > 0 && t >= 0
        ? { kind: 'pct', value: (t / x - 1) * 100 }
        : { kind: 'yen', value: t - x }
    if (!best || Math.abs(d.value) > Math.abs(best.value)) best = d
  }
  return best
}

/**
 * アラートを作るときの既定の条件（FR-AL7。ダイアログで指標を選んだとき）。1 株あたりの金額は今の値の 5% 下（≤）、ほかは今の値（≥）、
 * 今の値が無ければ登録表の既定。step(v) はその値の刻み（丸めに使う）。
 * 5% は絶対値から引き、丸めたあとも今の値より下に置く（負・0 になる EPS・BPS で、作った直後から成り立たないように）
 */
export function defaultAlertCondition(field: string, now: number | null, step: (v: number) => number): Condition {
  const f = FIELD_BY_ID.get(field)
  const base: Condition = { field, op: '<=', value: 0 }
  const round = (v: number, st: number) => Math.round(Math.round(v / st) * st * 1e6) / 1e6 || 0
  if (f && perShare(f) && now != null) {
    const raw = now - Math.abs(now) * 0.05
    const st = step(raw)
    let v = round(raw, st)
    if (v >= now) v = round(Math.floor(raw / st) * st, st)
    if (v >= now) v = round(v - st, st)
    return { ...base, value: v }
  }
  if (now != null) return { ...base, op: '>=', value: round(now, f?.type === 'percent' ? 0.1 : (f?.step ?? 1)) }
  return { ...base, value: typeof f?.default === 'number' ? f.default : 0 }
}

/** 1 つめの条件の指標の今の値（一覧の「現在」） */
export function nowValueOf(a: Alert, m: MetricsRow | undefined, held: Held | undefined): number | null {
  const c = a.conditions[0]
  return c && m && a.target.kind === 'symbol' ? fieldValue(c.field, m, held, a.target.id) : null
}

/** アラートの銘柄（スクリーンのアラートは null） */
export const symbolOf = (a: Pick<Alert, 'target'>): InstrumentId | null => (a.target.kind === 'symbol' ? a.target.id : null)
