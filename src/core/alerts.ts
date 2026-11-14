// アラート（FR-AL1〜AL10。design-alerts.md）: 条件の確かめ・分割の換算・判定・鳴るかの決め方と、判定の状態・履歴の保存。
// 条件はスクリーナーと同じ形（Condition）で、判定もスクリーナーの判定（evaluateConditions）を使う。
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { FIELD_BY_ID, usable } from '@shared/fields'
import type {
  Alert,
  AlertFire,
  AlertInvalid,
  AlertState,
  AlertView,
  Condition,
  Instrument,
  InstrumentId,
  JstDate,
  MetricsRow,
  Split,
} from '@shared/types'
import { evaluateConditions } from './screener'

export const ALERT_LIMIT = 500
export const HISTORY_LIMIT = 500

type Held = Map<InstrumentId, { qty: number; cost: number }>
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

const usesHoldings = (c: Condition) => FIELD_BY_ID.get(c.field)?.requires?.includes('holdings') ?? false

/** 指標の値（条件の比べる側）。保有の損益率は保有から計算する */
function fieldValue(field: string, m: MetricsRow, held: Held | undefined, id: InstrumentId): number | null {
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
function targetOf(c: Condition, m: MetricsRow, held: Held | undefined, id: InstrumentId): number | null {
  if (!c.ref) return Number(c.value)
  const y = fieldValue(c.ref, m, held, id)
  return y == null ? null : y * (1 + Number(c.value) / 100)
}

export interface EvalInput {
  instrument: Instrument | undefined
  metrics: MetricsRow | undefined
  holdings: Held | undefined
  splits: Split[]
  /** 初回・全データの取り直しのジョブが残っている（値がそろっていない） */
  loading: boolean
  /** 直近の取引の終わった日。基準日がこれより古ければ取得に失敗している */
  lastSession: JstDate
}
export interface EvalResult {
  met: boolean | null
  invalid?: AlertInvalid
  /** 判定に使った条件（分割で換算したもの） */
  conditions: Condition[]
  splitAdjusted: boolean
  values: Record<string, number | null>
  asOf?: JstDate
  provisional: boolean
}

/** 1 つのアラートを判定する（§3.2） */
export function evaluateAlert(a: Alert, inp: EvalInput): EvalResult {
  const adj = adjustedConditions(a, inp.splits)
  const conditions = adj ?? a.conditions
  const base = { conditions, splitAdjusted: !!adj, values: {}, provisional: false }
  const bad = (invalid: AlertInvalid): EvalResult => ({ ...base, met: null, invalid })
  if (!a.conditions.every(alertConditionOk)) return bad('condition')
  if (inp.loading) return bad('loading')
  const ins = inp.instrument
  if (!ins) return bad('missing')
  if (ins.status === 'delisted') return bad('delisted')
  const m = inp.metrics
  if (!m?.asOf) return bad('missing')
  if (m.gapSuspect || m.anomaly) return bad('suspect')
  if (m.asOf < inp.lastSession) return bad('stale')
  if (conditions.some(usesHoldings) && !inp.holdings?.has(ins.id)) return bad('noHoldings')
  const values: Record<string, number | null> = {}
  for (const c of conditions) {
    values[c.field] = fieldValue(c.field, m, inp.holdings, ins.id)
    if (c.ref) values[c.ref] = fieldValue(c.ref, m, inp.holdings, ins.id)
  }
  const r = evaluateConditions(conditions, ins, m, inp.holdings)
  if (r.invalid) return { ...base, met: null, invalid: 'condition', values }
  if (r.met === null) return { ...base, met: null, invalid: 'missing', values, asOf: m.asOf }
  return { ...base, met: r.met, values, asOf: m.asOf, provisional: m.provisional }
}

/**
 * 鳴るかを決め、次の状態を返す（§3.1）。前の状態が無い・met が null（作った・直した・再開した直後）なら基準を取るだけで鳴らさない。
 * 同じ基準日では判定し直さない。判定できないときは met を変えない
 */
export function decide(prev: AlertState | undefined, r: EvalResult, now: string): { state: AlertState; fire: boolean } {
  if (r.invalid || r.met === null) {
    return {
      state: {
        met: prev?.met ?? null,
        ...(prev?.asOf ? { asOf: prev.asOf } : {}),
        ...(prev?.lastFired ? { lastFired: prev.lastFired } : {}),
        invalid: r.invalid ?? 'missing',
      },
      fire: false,
    }
  }
  const keep = prev?.lastFired ? { lastFired: prev.lastFired } : {}
  if (!prev || prev.met === null) return { state: { met: r.met, ...(r.asOf ? { asOf: r.asOf } : {}), ...keep }, fire: false }
  if (prev.asOf && prev.asOf === r.asOf && !prev.invalid) return { state: prev, fire: false }
  const fire = prev.met === false && r.met === true
  return { state: { met: r.met, ...(r.asOf ? { asOf: r.asOf } : {}), ...(fire ? { lastFired: now } : keep) }, fire }
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
  return c && m ? fieldValue(c.field, m, held, a.target.id) : null
}

/**
 * 判定の状態と履歴（alertState.json・alertHistory.json）。判定のたびに書くので世代を作らず、書き出しの対象にもしない（§2）。
 * 書けなくても判定は止めない（メモリにだけ持つ）
 */
export class AlertBook {
  private state: Record<string, AlertState> | null = null
  private history: AlertFire[] | null = null
  constructor(private dir: string) {}
  private read<T>(name: string, def: T): T {
    const p = join(this.dir, name)
    if (!existsSync(p)) return def
    try {
      const raw = JSON.parse(readFileSync(p, 'utf8')) as { data?: T }
      return (raw?.data ?? def) as T
    } catch {
      return def
    }
  }
  private write(name: string, data: unknown): void {
    try {
      const p = join(this.dir, name)
      writeFileSync(`${p}.tmp`, JSON.stringify({ version: 1, data }))
      renameSync(`${p}.tmp`, p)
    } catch {
      /* 書けなくても判定は続ける */
    }
  }
  states(): Record<string, AlertState> {
    this.state ??= this.read<Record<string, AlertState>>('alertState.json', {})
    return this.state
  }
  setStates(next: Record<string, AlertState>): void {
    this.state = next
    this.write('alertState.json', next)
  }
  fires(): AlertFire[] {
    this.history ??= this.read<AlertFire[]>('alertHistory.json', [])
    return this.history
  }
  setFires(next: AlertFire[]): void {
    this.history = next.slice(0, HISTORY_LIMIT)
    this.write('alertHistory.json', this.history)
  }
  unread(): number {
    return this.fires().filter((f) => !f.read).length
  }
}
