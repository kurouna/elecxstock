// 同じ値を出す 2 つの経路の突き合わせ（docs/test-plan.md §5）。例 1 つではなく境界の組（EDGE_SETS）で回す
import { computeMetrics } from '@core/metrics'
import { runScreen } from '@core/screener'
import { alertConditionOk, conditionMet, heldFrom } from '@shared/alerts'
import { FIELDS, refFields, usable } from '@shared/fields'
import type { Condition, MetricsRow } from '@shared/types'
import { describe, expect, it } from 'vitest'
import { annualDividends } from '../../../src/renderer/lib/dividends'
import { EDGE_SETS, holding, instrument, TODAY } from '../../support/fixtures'

describe('配当の指標と銘柄情報の配当のグラフ（FR-I1, FR-I8, FR-SC）', () => {
  // 評価日 2026-11-13。前年比は 2025 と 2024、5 年の増配率は 2025 と 2020 の年の合計で比べる（記録の最初の年が年の途中なら使わない）
  const want: Record<string, { yoy: number | null; cagr: number | null }> = {
    '10 年・毎年増配': { yoy: (19 / 18 - 1) * 100, cagr: ((19 / 14) ** 0.2 - 1) * 100 },
    '保存期間 5 年（日足より前の配当の記録あり）': { yoy: (19 / 18 - 1) * 100, cagr: ((19 / 14) ** 0.2 - 1) * 100 },
    '上場 5 年未満（年の途中から）': { yoy: 0, cagr: null },
    無配に転じた: { yoy: -100, cagr: null },
    配当の記録が無い: { yoy: null, cagr: null },
  }
  for (const set of EDGE_SETS) {
    it(set.name, () => {
      const m = computeMetrics('JP:1', set.bars, set.dividends, [], null, TODAY)
      const w = want[set.name]!
      expect(m.divYoy == null ? null : m.divYoy, 'divYoy').toSatisfy((v: number | null) =>
        w.yoy == null ? v == null : Math.abs(v! - w.yoy) < 1e-9,
      )
      expect(m.divCagr5, 'divCagr5').toSatisfy((v: number | null) => (w.cagr == null ? v == null : Math.abs(v! - w.cagr) < 1e-9))
      // グラフの 2025 年の棒の前年比も同じ（グラフと指標で食い違わない）
      const chart = annualDividends(set.dividends, TODAY).find((x) => x.year === 2025)?.yoy ?? null
      if (w.yoy != null) expect(chart, 'グラフの前年比').toBeCloseTo(w.yoy, 9)
    })
  }
})

describe('スクリーナーの判定とアラートの判定（FR-SC5, FR-AL1）', () => {
  const ins = EDGE_SETS.map((_, i) => instrument({ code: String(i + 1), sectorJa: i % 2 ? '小売業' : '銀行業' }))
  // 境界の組すべて（上場 5 年未満・無配に転じた・配当なしでは欠損が出る）
  const rows: MetricsRow[] = EDGE_SETS.map((set, i) => ({
    ...computeMetrics(`JP:${i + 1}`, set.bars, set.dividends, [], null, TODAY),
  }))
  const metrics = new Map(rows.map((r) => [r.id, r]))
  const hs = [holding({ code: '1', quantity: 300, avgCost: 900 })]
  const held = heldFrom(hs)
  const fields = FIELDS.filter((f) => usable(f) && alertConditionOk({ field: f.id, op: '>=', value: 0 }))
  it('アラートで使える指標・相対条件のすべてで、同じ値なら同じ結果（欠損は外れる）', () => {
    let n = 0
    let missing = 0
    for (const f of fields)
      for (const r of rows)
        for (const op of ['>=', '<='] as const) {
          const conds: Condition[] = [
            { field: f.id, op, value: 0 },
            { field: f.id, op, value: 5 },
            ...refFields(f).map((g) => ({ field: f.id, op, value: 2, ref: g.id })),
          ]
          for (const c of conds) {
            const met = conditionMet(c, r, held, r.id)
            const scr = runScreen({
              conditions: [c],
              instruments: ins,
              metrics,
              favorites: new Set(),
              watchlists: {},
              holdings: held,
              today: TODAY,
            })
            // 判定できない（欠損）は、欠損を含めない条件のスクリーナーでは外れる
            expect(scr.ids.includes(r.id), `${f.id} ${op} ${c.ref ?? c.value} ${r.id}`).toBe(met === true)
            n++
            if (met == null) missing++
          }
        }
    expect(n).toBeGreaterThan(100)
    expect(missing).toBeGreaterThan(10) // 欠損の組み合わせも確かめた
  })
})
