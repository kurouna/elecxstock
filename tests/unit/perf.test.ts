// 性能（NFR-P3, CI5）: 2,000 銘柄のスクリーニングが 500ms 以内。CI でも毎回確かめる
import { runScreen } from '@core/screener'
import type { Instrument, MetricsRow } from '@shared/types'
import { describe, expect, it } from 'vitest'

const N = 2000
const instruments: Instrument[] = Array.from({ length: N }, (_, i) => ({
  id: `JP:${1000 + i}`,
  code: String(1000 + i),
  nameJa: `銘柄${i}`,
  nameEn: '',
  market: i % 10 === 0 ? 'R' : 'P',
  kind: i % 10 === 0 ? 'reit' : 'stock',
  sectorJa: ['銀行業', '化学', '機械'][i % 3]!,
  sectorEn: '',
  status: 'active',
  userAdded: false,
}))
const metrics = new Map(
  instruments.map((ins, i) => [
    ins.id,
    {
      id: ins.id,
      close: 1000 + i,
      yieldTrailing: (i % 70) / 10,
      turnover20: i * 1e7,
      ma75: 1000 + i * 0.98,
      pbr: (i % 30) / 10,
      recordMonths: [3, 9],
    } as unknown as MetricsRow,
  ]),
)

describe('性能', () => {
  it('2,000 銘柄・条件 6 つ（または・相対条件を含む）のスクリーニングが 500ms 以内（NFR-P3）', () => {
    const t0 = performance.now()
    for (let k = 0; k < 10; k++)
      runScreen({
        conditions: [
          { field: 'income.yield', op: '>=', value: 3 },
          { field: 'value.pbr', op: '<=', value: 1.5, or: true },
          { field: 'liq.turnover20', op: '>=', value: 1e8 },
          { field: 'price.close', op: '>=', value: 0, ref: 'price.ma75' },
          { field: 'attr.sector', op: 'in', value: ['銀行業', '化学'] },
          { field: 'income.recordMonth', op: 'in', value: ['3'] },
        ],
        instruments,
        metrics,
        favorites: new Set(),
        watchlists: {},
      })
    expect((performance.now() - t0) / 10).toBeLessThan(500)
  })
})
