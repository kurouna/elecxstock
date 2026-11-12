// スクリーニング（§5.2）。指標の登録表（FR-FD1）に従って条件を評価する。metrics 表だけを読む（FR-S10）。
// 条件は「または」（Condition.or）でまとめたグループを「かつ」でつなぐ（FR-SC5）。相対条件は Condition.ref で別の指標と比べる。
import { FIELD_BY_ID, migrateConditions, usable } from '@shared/fields'
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
  if (!usable(f) || f.source.kind === 'compute') return false
  if (!f.operators.includes(c.op)) return false
  if (c.ref) {
    const g = FIELD_BY_ID.get(c.ref)
    if (!usable(g) || g.source.kind !== 'metrics' || f.source.kind !== 'metrics' || (c.op !== '>=' && c.op !== '<=')) return false
  }
  return true
}

type Row = Record<string, unknown>

/** 1 つの条件を評価する。true / false、または欠損（FR-SC8）で null */
function test(c: Condition, ins: Instrument, m: MetricsRow, inp: ScreenInput, wl: Map<string, Set<InstrumentId>>): boolean | null {
  const f = FIELD_BY_ID.get(c.field)!
  const src = f.source
  if (src.kind === 'metrics') {
    const x = (m as unknown as Row)[src.column]
    if (Array.isArray(x)) {
      // 権利確定月など、複数の値を持つ指標: 1 つでも当たれば「含まれる」
      const vs = (Array.isArray(c.value) ? c.value : [String(c.value)]).map(String)
      const hit = x.some((v) => vs.includes(String(v)))
      return c.op === 'notin' ? !hit : hit
    }
    if (x == null || typeof x !== 'number') return null
    let v = Number(c.value)
    if (c.ref) {
      const g = FIELD_BY_ID.get(c.ref)!
      const y = g.source.kind === 'metrics' ? (m as unknown as Row)[g.source.column] : null
      if (y == null || typeof y !== 'number') return null
      v = y * (1 + Number(c.value) / 100) // 相手の値 ± value %
    }
    return c.op === '>=' ? x >= v : c.op === '<=' ? x <= v : false
  }
  if (src.kind === 'attr') {
    const x = String(ins[src.key])
    const vs = Array.isArray(c.value) ? c.value : [String(c.value)]
    const hit = vs.includes(x)
    return c.op === 'in' ? hit : c.op === 'notin' ? !hit : x === String(c.value)
  }
  if (src.kind === 'user' && src.key === 'favorite') return inp.favorites.has(ins.id) === Boolean(c.value)
  const lists = Array.isArray(c.value) ? c.value : [String(c.value)]
  const hit = lists.some((l) => wl.get(l)?.has(ins.id))
  return c.op === 'in' ? hit : !hit
}

export function runScreen(inp: ScreenInput): ScreenResult {
  const t0 = performance.now()
  const invalid: number[] = []
  // 保存したときの指標の版から今の版へ移す（FR-FD5）。移せなかった条件は無効
  const { conditions, failed } = migrateConditions(inp.conditions)
  const groups: { c: Condition }[][] = []
  conditions.forEach((c, i) => {
    const ok = conditionValid(c) && !failed.includes(i)
    if (!ok) {
      invalid.push(i)
      return
    }
    if (c.or && groups.length) groups.at(-1)!.push({ c })
    else groups.push([{ c }])
  })
  const wl = new Map(Object.entries(inp.watchlists).map(([k, v]) => [k, new Set(v)]))
  const ids: InstrumentId[] = []
  const rows: MetricsRow[] = []
  for (const ins of inp.instruments) {
    if (ins.market === 'I') continue
    const m = inp.metrics.get(ins.id)
    if (!m) continue
    let ok = true
    for (const g of groups) {
      // グループの中は「または」。欠損は includeMissing の条件だけ当たりとみなす（FR-SC8）
      let any = false
      for (const { c } of g) {
        const r = test(c, ins, m, inp, wl)
        if (r === true || (r === null && c.includeMissing)) {
          any = true
          break
        }
      }
      if (!any) {
        ok = false
        break
      }
    }
    if (ok) {
      ids.push(ins.id)
      rows.push(m)
    }
  }
  return { ids, rows, invalid, ms: Math.round((performance.now() - t0) * 10) / 10 }
}
