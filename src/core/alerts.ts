// アラート（FR-AL1〜AL10。design-alerts.md）: 条件の確かめ・分割の換算・判定・鳴るかの決め方と、判定の状態・履歴の保存。
// 条件はスクリーナーと同じ形（Condition）で、判定もスクリーナーの判定（evaluateConditions）を使う。
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { adjustedConditions, alertConditionOk, fieldValue, type Held, HISTORY_LIMIT, usesHoldings } from '@shared/alerts'
import type { Alert, AlertFire, AlertInvalid, AlertState, Condition, Instrument, JstDate, MetricsRow, Split } from '@shared/types'
import { evaluateConditions } from './screener'

export {
  ALERT_LIMIT,
  adjustedConditions,
  alertConditionOk,
  distanceOf,
  nowValueOf,
  splitFactorAfter,
  splitSensitive,
} from '@shared/alerts'

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
