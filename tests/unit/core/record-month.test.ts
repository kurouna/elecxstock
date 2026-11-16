// 権利確定月 = 権利落ち日の翌営業日の月。月末・週末・年末年始の休場をまたぐ境界を見る（値はすべて架空）
import { computeMetrics, recordMonth } from '@core/metrics'
import { describe, expect, it } from 'vitest'
import { days } from '../../support/fixtures'

describe('権利確定月（FR-H3）', () => {
  it('翌営業日が同じ月なら、権利落ち日の月', () => {
    expect(recordMonth('2026-03-30')).toBe(3) // 翌日 3/31（火）
    expect(recordMonth('2026-09-28')).toBe(9) // 翌日 9/29（火）
  })
  it('月末の権利落ち日は、翌営業日（翌月）の月', () => {
    expect(recordMonth('2026-04-30')).toBe(5) // 翌日 5/1（金）
  })
  it('週末をまたいで翌月になる', () => {
    expect(recordMonth('2026-07-31')).toBe(8) // 金曜 → 8/3（月）
  })
  it('祝日の連休をまたぐ', () => {
    expect(recordMonth('2026-09-18')).toBe(9) // 金曜 → 9/19〜23 の連休 → 9/24（木）
  })
  it('年末の休場（12/31〜1/3）をまたぐと 1 月', () => {
    expect(recordMonth('2026-12-30')).toBe(1) // 大納会 → 2027-01-04（月）
  })
  it('指標の権利確定月は、直近 2 年の配当の権利落ち日から作る', () => {
    const b = days('2026-10-01', '2026-11-13', () => 1000)
    const dividends = [
      { date: '2024-03-28', amount: 10 }, // 2 年より前は数えない
      { date: '2025-04-30', amount: 10 },
      { date: '2026-04-30', amount: 10 },
      { date: '2026-10-29', amount: 10 },
    ]
    const m = computeMetrics('JP:9999', b, dividends, [], null, '2026-11-13')
    expect([...m.recordMonths].sort((x, y) => x - y)).toEqual([5, 10])
  })
})
