// チャートの表示期間（FR-C13）: 期間と時間軸から、表示する足の本数を決める
import { describe, expect, it } from 'vitest'
import { barsForPeriod, PERIODS } from '../../../src/renderer/lib/periods'

describe('barsForPeriod', () => {
  it('日足 1 年は約 245 本、週足 1 年は 52 本、月足 5 年は 60 本', () => {
    expect(barsForPeriod(2, 'D', 5000)).toBe(245)
    expect(barsForPeriod(2, 'W', 5000)).toBe(52)
    expect(barsForPeriod(4, 'M', 5000)).toBe(60)
  })
  it('短すぎる期間は下限の本数にし、手元の本数を超えない。全期間はすべて', () => {
    expect(barsForPeriod(0, 'M', 500)).toBe(12)
    expect(barsForPeriod(4, 'D', 300)).toBe(300)
    expect(barsForPeriod(PERIODS.length - 1, 'D', 1234)).toBe(1234)
  })
})
