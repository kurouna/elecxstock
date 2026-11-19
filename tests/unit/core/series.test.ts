import { adjustMonthly, type DayBar, mergeMonthly } from '@core/series'
import { describe, expect, it } from 'vitest'

describe('月足の配当込み（FR-C4）: 日足の期間より前の月足も配当で調整する', () => {
  const bar = (d: string, c: number): DayBar => ({ d, o: c, h: c, l: c, c, v: 1 })
  // 月足は 1〜6 月（終値 100）、日足は 4 月から（終値 100）。5 月 1 日に配当 10、2 月 1 日に配当 5
  const monthly = ['2026-01-30', '2026-02-27', '2026-03-31', '2026-04-30', '2026-05-29', '2026-06-30'].map((d) => bar(d, 100))
  const daily = ['2026-04-01', '2026-04-30', '2026-05-01', '2026-05-29', '2026-06-30'].map((d) => bar(d, 100))
  const dividends = [
    { date: '2026-02-02', amount: 5 },
    { date: '2026-05-01', amount: 10 },
  ]
  it('境目で段差が出ない', () => {
    const adjDaily = daily.map((b, i) => (i < 2 ? { ...b, c: 90 } : b)) // 日足の配当込み（5 月より前は 0.9 倍）
    const m = adjustMonthly(monthly, 'total', [], dividends, daily, adjDaily)
    const { bars } = mergeMonthly(m, adjDaily)
    const close = (d: string) => bars.find((b) => b.d.startsWith(d))!.c
    expect(close('2026-03')).toBeCloseTo(90) // 5 月の配当で 0.9 倍
    expect(close('2026-04')).toBeCloseTo(90)
    expect(close('2026-05')).toBeCloseTo(100)
    // 2 月の配当は前の月の終値で割る（1 − 5 / 100）。1 月はさらに 0.95 倍
    expect(close('2026-01')).toBeCloseTo(90 * 0.95)
    expect(close('2026-02')).toBeCloseTo(90)
  })
  it('日足の最初の月の中（日足の始まりより後）に権利落ちがあっても、その月の月足を調整しすぎない', () => {
    // 日足は 4 月 1 日から。4 月 27 日に配当 10（権利落ち）。4 月の月足の終値は落ちたあとの値なので調整しない
    const d2 = ['2026-04-01', '2026-04-24', '2026-04-27', '2026-04-30', '2026-05-29'].map((d) => bar(d, 100))
    const adj2 = d2.map((b, i) => (i < 2 ? { ...b, c: 90 } : b))
    const m = adjustMonthly(monthly, 'total', [], [{ date: '2026-04-27', amount: 10 }], d2, adj2)
    const { bars } = mergeMonthly(m, adj2)
    const close = (d: string) => bars.find((b) => b.d.startsWith(d))!.c
    expect(close('2026-04')).toBeCloseTo(100)
    expect(close('2026-03')).toBeCloseTo(90) // 3 月末は権利落ちの前（1 − 10 / 100）
    expect(close('2026-01')).toBeCloseTo(90)
  })
  it('分割調整（既定）・未調整はこれまでどおり', () => {
    expect(adjustMonthly(monthly, 'split', [], dividends, daily, daily)).toEqual(monthly)
    const un = adjustMonthly(monthly, 'unadjusted', [{ date: '2026-03-02', ratio: 2 }], [], daily, daily)
    expect(un[0]!.c).toBe(200)
    expect(un[3]!.c).toBe(100)
  })
  it('前月の終値以上・0 以下の配当（記録の誤り）は掛けない（日足の adjust と同じ。価格が 0 以下にならない）', () => {
    const adjDaily = daily.map((b, i) => (i < 2 ? { ...b, c: 90 } : b))
    for (const amount of [100, 150, 0, -5]) {
      const m = adjustMonthly(monthly, 'total', [], [{ date: '2026-02-02', amount }, dividends[1]!], daily, adjDaily)
      expect(m[0]!.c, String(amount)).toBeCloseTo(90) // 2 月の配当は無かったことにする（5 月の配当の 0.9 倍だけ）
      for (const b of m) expect(b.c).toBeGreaterThan(0)
    }
  })
})
