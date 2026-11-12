// スクリーニング（§5.2）。指標の登録表（FR-FD1）に従って条件を評価する。metrics 表だけを読む（FR-S10）。
import { FIELD_BY_ID } from '@shared/fields'
import type { Condition, Instrument, InstrumentId, MetricsRow, ScreenResult } from '@shared/types'

export interface ScreenInput {
  conditions: Condition[]
  instruments: Instrument[]
  metrics: Map<InstrumentId, MetricsRow>
  favorites: Set<InstrumentId>
  watchlists: Record<string, InstrumentId[]>
}

/** 条件が評価できるか（FR-SC11: 今の版に無い・使えない指標は無効として残す） */
export function conditionValid(c: Condition): boolean {
  const f = FIELD_BY_ID.get(c.field)
  if (f?.availableFrom !== 'P1') return false
  return f.operators.includes(c.op)
}

export function runScreen(inp: ScreenInput): ScreenResult {
  const t0 = performance.now()
  const invalid: number[] = []
  const active = inp.conditions.filter((c, i) => {
    const ok = conditionValid(c)
    if (!ok) invalid.push(i)
    return ok
  })
  const wl = new Map(Object.entries(inp.watchlists).map(([k, v]) => [k, new Set(v)]))
  const ids: InstrumentId[] = []
  const rows: MetricsRow[] = []
  for (const ins of inp.instruments) {
    if (ins.market === 'I') continue
    const m = inp.metrics.get(ins.id)
    if (!m) continue
    let ok = true
    for (const c of active) {
      const f = FIELD_BY_ID.get(c.field)!
      const src = f.source
      if (src.kind === 'metrics') {
        const x = (m as unknown as Record<string, number | null>)[src.column]
        if (x == null) {
          if (!c.includeMissing) ok = false // 欠損は既定で除外（FR-SC8）
          continue
        }
        const v = Number(c.value)
        if (c.op === '>=' ? !(x >= v) : c.op === '<=' ? !(x <= v) : false) ok = false
      } else if (src.kind === 'attr') {
        const x = String(ins[src.key])
        const vs = Array.isArray(c.value) ? c.value : [String(c.value)]
        const hit = vs.includes(x)
        if (c.op === 'in' ? !hit : c.op === 'notin' ? hit : x !== String(c.value)) ok = false
      } else if (src.key === 'favorite') {
        if (inp.favorites.has(ins.id) !== Boolean(c.value)) ok = false
      } else {
        const lists = Array.isArray(c.value) ? c.value : [String(c.value)]
        const hit = lists.some((l) => wl.get(l)?.has(ins.id))
        if (c.op === 'in' ? !hit : hit) ok = false
      }
      if (!ok) break
    }
    if (ok) {
      ids.push(ins.id)
      rows.push(m)
    }
  }
  return { ids, rows, invalid, ms: Math.round((performance.now() - t0) * 10) / 10 }
}
