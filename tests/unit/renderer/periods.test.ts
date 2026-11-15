// チャートの表示期間（§6.5.4・FR-G3）: 期間と時間軸から、表示する足の本数を決める
import { describe, expect, it } from 'vitest'
import { barsForPeriod, marketBars, PERIODS, periodOfKey } from '../../../src/renderer/lib/periods'

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

describe('表示期間のキー（Alt+1〜6。チャート・グリッド・マーケットで共通。§6.5.4・§6.5.6・FR-G3）', () => {
  const k = (code: string, o: Partial<KeyboardEvent> = {}) => ({
    code,
    altKey: true,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...o,
  })
  it('Alt+1〜6 は期間の位置 0〜5。ほかの修飾キー・数字以外は null', () => {
    expect(periodOfKey(k('Digit1'))).toBe(0)
    expect(periodOfKey(k('Digit6'))).toBe(5)
    expect(periodOfKey(k('Digit7'))).toBeNull()
    expect(periodOfKey(k('Digit3', { altKey: false }))).toBeNull()
    expect(periodOfKey(k('Digit3', { ctrlKey: true }))).toBeNull()
    expect(periodOfKey(k('Digit3', { shiftKey: true }))).toBeNull()
    expect(periodOfKey(k('KeyD'))).toBeNull()
  })
})

describe('マーケットのタイルの足の本数（§6.3 market-overview・FR-G3）', () => {
  it('既定は時間軸ごとの本数（日足 130・週足 104・月足 120）', () => {
    expect(marketBars(undefined, 'D')).toBe(130)
    expect(marketBars(undefined, 'W')).toBe(104)
    expect(marketBars(undefined, 'M')).toBe(120)
  })
  it('期間を選ぶと、チャートと同じ数え方の本数。全期間は取れる上限（3,000 本）', () => {
    expect(marketBars(2, 'D')).toBe(245)
    expect(marketBars(0, 'M')).toBe(12)
    expect(marketBars(4, 'W')).toBe(barsForPeriod(4, 'W', 3000))
    expect(marketBars(PERIODS.length - 1, 'D')).toBe(3000)
  })
})
