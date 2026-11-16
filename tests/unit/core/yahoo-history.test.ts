// Yahoo の日足・配当の読み取り（yahoo.ts の fetchHistory）。yahoo-finance2 は差し替え、返した値がどう保存の形になるかだけを見る（値はすべて架空）
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { chart } = vi.hoisted(() => ({ chart: vi.fn() }))
vi.mock('yahoo-finance2', () => ({
  default: class {
    chart = chart
    quote = vi.fn()
  },
}))
const { createYahooProvider } = await import('@core/providers/yahoo')

/** 日本時間のその日の 0 時（Yahoo の東証の日足の時刻） */
const jst = (d: string) => new Date(`${d}T00:00:00+09:00`)
const fetch = () =>
  createYahooProvider().fetchHistory('9999.T', { from: '2026-11-01', interval: '1d', signal: new AbortController().signal })

beforeEach(() => chart.mockReset())

describe('出来高 0 の日（FR-T4）', () => {
  it('出来高 0 の日は Yahoo が返したとおり 0 で保存し、足を落とさない', async () => {
    chart.mockResolvedValue({
      quotes: [
        { date: jst('2026-11-11'), open: 500, high: 510, low: 495, close: 505, volume: 1200 },
        { date: jst('2026-11-12'), open: 505, high: 505, low: 505, close: 505, volume: 0 }, // 売買の無い日
        { date: jst('2026-11-13'), open: 506, high: 512, low: 500, close: 510, volume: 800 },
      ],
    })
    const { bars } = await fetch()
    expect(bars.map((b) => [b.d, b.v])).toEqual([
      ['2026-11-11', 1200],
      ['2026-11-12', 0],
      ['2026-11-13', 800],
    ])
    expect(bars[1]).toEqual({ d: '2026-11-12', o: 505, h: 505, l: 505, c: 505, v: 0 })
  })
  it('出来高が欠けた日も終値があれば保存する（出来高は 0）', async () => {
    chart.mockResolvedValue({ quotes: [{ date: jst('2026-11-12'), open: 300, high: 301, low: 299, close: 300, volume: null }] })
    const { bars } = await fetch()
    expect(bars).toEqual([{ d: '2026-11-12', o: 300, h: 301, l: 299, c: 300, v: 0 }])
  })
})

describe('配当の履歴の形（FR-H3）', () => {
  it('権利落ち日と 1 株あたりの額だけを持つ（支払日は Yahoo に無いので持たない＝空）', async () => {
    chart.mockResolvedValue({
      quotes: [],
      events: {
        dividends: [
          { date: jst('2026-03-30'), amount: 12.5 },
          { date: jst('2026-09-29'), amount: 13 },
          { date: jst('2026-06-29') }, // 額の無い行は捨てる
        ],
      },
    })
    const { dividends } = await fetch()
    expect(dividends).toEqual([
      { date: '2026-03-30', amount: 12.5 },
      { date: '2026-09-29', amount: 13 },
    ])
    for (const d of dividends) expect(Object.keys(d).sort()).toEqual(['amount', 'date'])
  })
})
