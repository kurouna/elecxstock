// 「20 日平均」などの期間は暦日ではなく取引日の本数で数える（値はすべて架空）
import { computeMetrics, NEED } from '@core/metrics'
import type { DayBar } from '@core/series'
import { describe, expect, it } from 'vitest'
import { bars } from '../../support/fixtures'

/** 年末年始の休場（12/31〜1/3）をまたぐ 20 本。終値 100、出来高 1000。i 本目だけ出来高 0 */
function across(n: number, zeroAt?: number): DayBar[] {
  return bars('2026-12-14', n, () => 100).map((b, i) => ({ ...b, v: i === zeroAt ? 0 : 1000 }))
}
const metricsOf = (b: DayBar[]) => computeMetrics('JP:9999', b, [], [], null, b.at(-1)!.d)

describe('期間は取引日の本数で数える（FR-T4）', () => {
  it('20 日平均の売買代金は直近の 20 本。休場をまたいで暦日が 20 日を超えても 20 本で計算する', () => {
    const b = across(NEED.turnover)
    expect(b[0]!.d).toBe('2026-12-14')
    expect(b.at(-1)!.d).toBe('2027-01-13') // 暦日では 31 日（年末年始と成人の日 1/11 を含む）
    expect(metricsOf(b).turnover20).toBeCloseTo(100 * 1000)
    expect(metricsOf(b.slice(1)).turnover20).toBeNull() // 19 本では足りない
  })
  it('出来高 0 の日も 1 本として数え、平均の分母に入る', () => {
    const m = metricsOf(across(NEED.turnover, 5))
    expect(m.turnover20).toBeCloseTo((100 * 1000 * 19) / 20)
  })
  it('出来高の倍率は、最新の足の前の 20 本（出来高 0 の日を含む）の平均で割る', () => {
    const b = across(NEED.turnover + 1, 3)
    b[b.length - 1] = { ...b.at(-1)!, v: 1900 }
    expect(metricsOf(b).volRatio).toBeCloseTo(1900 / ((1000 * 19) / 20))
  })
  it('最新の足の出来高が 0 の日は売買代金を欠損にする（0 円にしない）', () => {
    const b = across(NEED.turnover, NEED.turnover - 1)
    expect(metricsOf(b).turnover).toBeNull()
  })
  it('移動平均（25 日）も直近の 25 本', () => {
    const b = bars('2026-12-01', 30, (i) => 100 + i)
    // 最後の 25 本の終値は 105〜129。平均 117
    expect(metricsOf(b).ma25).toBeCloseTo(117)
  })
})
