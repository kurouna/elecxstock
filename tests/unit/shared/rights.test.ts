import { nextRightsDates, recordDayOf } from '@shared/rights'
import { describe, expect, it } from 'vitest'

describe('権利確定日の推定（rights.ts）', () => {
  it('権利落ち日の翌営業日が月の最後の営業日なら月末', () => {
    // 2026-03-31（火）が月の最後の営業日 → 権利落ち日は 03-30（月）
    expect(recordDayOf([{ date: '2026-03-30', amount: 10 }])).toBe('end')
  })
  it('20 日に確定する銘柄は 20、休場日なら前の営業日から数える', () => {
    expect(recordDayOf([{ date: '2026-02-19', amount: 10 }])).toBe(20)
    // 2027-02-20 は土曜 → 確定日 02-19（金）、権利付最終日はその 2 営業日前
    const [r] = nextRightsDates([2], '2026-11-15', 1, 20)
    expect(r).toEqual({ month: 2, lastCum: '2027-02-17', ex: '2027-02-18' })
  })
  it('配当の記録が無ければ月末', () => {
    expect(recordDayOf([])).toBe('end')
  })
})
