// 異常値の検知（FR-D5）: 分割イベントのない ±50% 超のギャップは印を付ける（P1）。高値 < 安値・終値 0 は metrics.test.ts の anomalous（P2）
import { addDays, isTradingDay } from '@core/calendar'
import { computeMetrics } from '@core/metrics'
import type { DayBar } from '@core/series'
import { describe, expect, it } from 'vitest'

/** 2026-01-05 から取引日ごとに終値を並べる（値は架空） */
function bars(closes: number[]): DayBar[] {
  const out: DayBar[] = []
  for (let d = '2026-01-05'; out.length < closes.length; d = addDays(d, 1))
    if (isTradingDay(d)) {
      const c = closes[out.length]!
      out.push({ d, o: c, h: c, l: c, c, v: 1000 })
    }
  return out
}
const flat = (n: number, c: number) => Array.from({ length: n }, () => c)
const run = (b: DayBar[], splits: { date: string; ratio: number }[] = []) =>
  computeMetrics('JP:1', b, [], splits, null, b.at(-1)!.d).gapSuspect

describe('分割のないギャップの検知（FR-D5）', () => {
  it('前日比 +50% ちょうど・−50% ちょうどは印を付けない（境界）', () => {
    expect(run(bars([...flat(30, 100), 150]))).toBe(false)
    expect(run(bars([...flat(30, 100), 50]))).toBe(false)
  })
  it('前日比 +50% 超・−50% 超は印を付ける', () => {
    expect(run(bars([...flat(30, 100), 151]))).toBe(true)
    expect(run(bars([...flat(30, 100), 49]))).toBe(true)
  })
  it('分割の日のギャップは印を付けない', () => {
    const b = bars([...flat(30, 100), 30])
    expect(run(b, [{ date: b.at(-1)!.d, ratio: 3 }])).toBe(false)
  })
  it('分割の日と違う日のギャップは印を付ける', () => {
    const b = bars([...flat(30, 100), 30, 30])
    expect(run(b, [{ date: b.at(-1)!.d, ratio: 3 }])).toBe(true)
  })
})
