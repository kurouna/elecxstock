// 値はすべて架空。評価日を固定
import { addDays, isTradingDay } from '@core/calendar'
import { beta, computeMetrics, volatility } from '@core/metrics'
import type { DayBar } from '@core/series'
import type { Quote } from '@shared/types'
import { describe, expect, it } from 'vitest'

function days(from: string, to: string, f: (i: number) => number): DayBar[] {
  const out: DayBar[] = []
  let i = 0
  for (let d = from; d <= to; d = addDays(d, 1))
    if (isTradingDay(d)) {
      const c = f(i++)
      out.push({ d, o: c, h: c * 1.01, l: c * 0.99, c, v: 1000 })
    }
  return out
}
const quote = (q: Partial<Quote>) => q as unknown as Quote

describe('最低投資金額・ROE', () => {
  const bars = days('2025-01-06', '2026-11-13', () => 1234)
  const q = quote({ eps: 120, bps: 1000 })
  it('株式は 100 株・REIT は 1 口。ETF は単位が分からないので欠損', () => {
    expect(computeMetrics('JP:1', bars, [], [], q, '2026-11-13', undefined, { kind: 'stock' }).minInvest).toBe(123400)
    expect(computeMetrics('JP:2', bars, [], [], q, '2026-11-13', undefined, { kind: 'reit' }).minInvest).toBe(1234)
    expect(computeMetrics('JP:3', bars, [], [], q, '2026-11-13', undefined, { kind: 'etf' }).minInvest).toBeNull()
  })
  it('ROE = EPS ÷ BPS（株式だけ。0 以下は欠損）', () => {
    expect(computeMetrics('JP:1', bars, [], [], q, '2026-11-13', undefined, { kind: 'stock' }).roe).toBeCloseTo(12)
    expect(computeMetrics('JP:2', bars, [], [], q, '2026-11-13', undefined, { kind: 'reit' }).roe).toBeNull()
    const neg = quote({ eps: -5, bps: 1000 })
    expect(computeMetrics('JP:1', bars, [], [], neg, '2026-11-13', undefined, { kind: 'stock' }).roe).toBeNull()
  })
})

describe('配当の増減率', () => {
  it('前年比と 5 年の年率（年の合計。評価日の年は途中なので前年まで）', () => {
    const bars = days('2018-01-04', '2024-10-31', () => 1000)
    // 年の合計: 2018 = 10, 2019 = 12, … 2023 = 20
    const dividends = [2018, 2019, 2020, 2021, 2022, 2023, 2024].flatMap((y) => [
      { date: `${y}-03-28`, amount: 5 + (y - 2018) },
      { date: `${y}-09-27`, amount: 5 + (y - 2018) },
    ])
    const m = computeMetrics('JP:1', bars, dividends, [], null, '2024-10-31')
    expect(m.divYoy).toBeCloseTo((20 / 18 - 1) * 100)
    expect(m.divCagr5).toBeCloseTo(((20 / 10) ** (1 / 5) - 1) * 100)
  })
  it('記録の最初の年（年の途中から）は比べない', () => {
    const bars = days('2022-06-01', '2024-10-31', () => 1000)
    const dividends = [2022, 2023].map((y) => ({ date: `${y}-09-27`, amount: 10 }))
    const m = computeMetrics('JP:1', bars, dividends, [], null, '2024-10-31')
    expect(m.divYoy).toBeNull()
    expect(m.divCagr5).toBeNull()
  })
})

describe('年初来', () => {
  it('1〜3 月は昨年来の高値・安値。騰落率は前年最後の終値から', () => {
    const bars = days('2024-01-04', '2026-02-13', (i) => 100 + i)
    const m = computeMetrics('JP:1', bars, [], [], null, '2026-02-13')
    const since = bars.filter((b) => b.d >= '2025-01-01')
    const close = bars.at(-1)!.c
    expect(m.ytdFromHi).toBeCloseTo((close / Math.max(...since.map((b) => b.h)) - 1) * 100)
    expect(m.ytdFromLo).toBeCloseTo((close / Math.min(...since.map((b) => b.l)) - 1) * 100)
    const prev = bars.filter((b) => b.d < '2026-01-01').at(-1)!.c
    expect(m.retYtd).toBeCloseTo((close / prev - 1) * 100)
  })
  it('起点より後に上場した銘柄は欠損', () => {
    const m = computeMetrics(
      'JP:1',
      days('2025-06-02', '2026-02-13', () => 100),
      [],
      [],
      null,
      '2026-02-13',
    )
    expect(m.ytdFromHi).toBeNull()
    expect(m.ytdFromLo).toBeNull()
  })
})

describe('リスク', () => {
  it('ボラティリティ: 動かなければ 0、61 本未満は欠損', () => {
    expect(volatility(days('2026-01-05', '2026-11-13', () => 500))).toBe(0)
    expect(volatility(days('2026-10-01', '2026-11-13', () => 500))).toBeNull()
    const zig = days('2026-01-05', '2026-11-13', (i) => (i % 2 ? 101 : 100))
    expect(volatility(zig)).toBeGreaterThan(10)
  })
  it('ベータ: 日付で突き合わせる。日経平均の 2 倍動けば 2、組が 120 未満なら欠損', () => {
    const idx = days('2025-06-02', '2026-11-13', (i) => 30000 * (1 + 0.01 * Math.sin(i / 3)))
    const bars: DayBar[] = []
    for (let i = 0; i < idx.length; i++) {
      const r = i ? idx[i]!.c / idx[i - 1]!.c - 1 : 0
      const c = i ? bars[i - 1]!.c * (1 + 2 * r) : 1000
      bars.push({ ...idx[i]!, c })
    }
    const index = new Map(idx.map((b) => [b.d, b.c]))
    expect(beta(bars, index)).toBeCloseTo(2, 6)
    // 売買停止で日足が飛んでも、日付で合わせるのでずれない
    const gap = bars.filter((_, i) => i % 10 !== 5)
    expect(beta(gap, index)).toBeCloseTo(2, 1)
    expect(beta(bars, new Map(idx.slice(-100).map((b) => [b.d, b.c])))).toBeNull()
    expect(beta(bars, undefined)).toBeNull()
  })
  it('3 年の最大下落率（配当込み）: 200 → 120 で −40%', () => {
    const bars = days('2023-11-01', '2026-11-13', (i) => (i < 300 ? 100 + i / 3 : i < 500 ? 200 - (i - 300) * 0.4 : 120 + (i - 500) * 0.1))
    const m = computeMetrics('JP:1', bars, [], [], null, '2026-11-13')
    expect(m.mdd3y).toBeCloseTo(-40, 0)
  })
  it('日足が 700 本に足りなければ最大下落率は欠損', () => {
    const m = computeMetrics(
      'JP:1',
      days('2025-01-06', '2026-11-13', () => 100),
      [],
      [],
      null,
      '2026-11-13',
    )
    expect(m.mdd3y).toBeNull()
  })
})

describe('配当込みの騰落率', () => {
  it('値動きが無くても、1 年に 10 円の配当で約 +11%（100 → 90 に落ちた分を戻す）', () => {
    const bars = days('2025-06-02', '2026-11-13', (i) => (i < 300 ? 100 : 90))
    const ex = bars[300]!.d
    const m = computeMetrics('JP:1', bars, [{ date: ex, amount: 10 }], [], null, '2026-11-13')
    expect(m.ret1y).toBeCloseTo(-10)
    expect(m.tr1y).toBeCloseTo(0, 6)
  })
})

describe('境界値', () => {
  it('ボラティリティ: 60 本は欠損、61 本で出る', () => {
    const bars = days('2026-01-05', '2026-11-13', (i) => 100 + (i % 3))
    expect(volatility(bars.slice(-60))).toBeNull()
    expect(volatility(bars.slice(-61))).not.toBeNull()
  })
  it('ベータ: 突き合わせた組が 119 なら欠損、120 で出る', () => {
    const bars = days('2026-01-05', '2026-11-13', (i) => 100 * (1 + 0.01 * Math.sin(i)))
    const index = new Map(bars.map((b) => [b.d, b.c * 300]))
    expect(beta(bars.slice(-120), index)).toBeNull()
    expect(beta(bars.slice(-121), index)).toBeCloseTo(1, 6)
  })
  it('最大下落率: 699 本は欠損、700 本で出る。配当で落ちた分は下落に数えない', () => {
    const bars = days('2022-01-04', '2026-11-13', () => 0)
      .slice(-700)
      .map((b, i) => {
        const c = i < 200 ? 100 : 90
        return { ...b, o: c, h: c * 1.01, l: c * 0.99, c }
      })
    const ex = [{ date: bars[200]!.d, amount: 10 }]
    const asOf = bars.at(-1)!.d
    expect(computeMetrics('JP:1', bars.slice(1), ex, [], null, asOf).mdd3y).toBeNull()
    expect(computeMetrics('JP:1', bars, ex, [], null, asOf).mdd3y).toBeCloseTo(0, 6)
    expect(computeMetrics('JP:1', bars, [], [], null, asOf).mdd3y).toBeCloseTo(-10, 6)
  })
  it('年初来: 3 月 31 日は昨年来、4 月 1 日から今年', () => {
    const bars = days('2024-01-04', '2026-04-01', () => 100)
    const spike = bars.findIndex((b) => b.d >= '2025-06-02')
    bars[spike] = { ...bars[spike]!, h: 200 }
    const mar = computeMetrics('JP:1', bars.slice(0, -1), [], [], null, '2026-03-31')
    const apr = computeMetrics('JP:1', bars, [], [], null, '2026-04-01')
    expect(mar.ytdFromHi).toBeCloseTo(-50)
    expect(apr.ytdFromHi).toBeCloseTo((100 / 101 - 1) * 100)
  })
  it('年初来: 最初の日足が 1 月 11 日までなら出し、12 日からなら欠損', () => {
    expect(
      computeMetrics(
        'JP:1',
        days('2023-01-11', '2023-06-30', () => 100),
        [],
        [],
        null,
        '2023-06-30',
      ).ytdFromHi,
    ).not.toBeNull()
    expect(
      computeMetrics(
        'JP:1',
        days('2023-01-12', '2023-06-30', () => 100),
        [],
        [],
        null,
        '2023-06-30',
      ).ytdFromHi,
    ).toBeNull()
  })
  it('権利確定日の日を metrics に持つ（月末は 0）', () => {
    const bars = days('2024-01-04', '2026-11-13', () => 1000)
    const m = computeMetrics('JP:1', bars, [{ date: '2026-03-30', amount: 10 }], [], null, '2026-11-13')
    expect(m.recordMonths).toEqual([3])
    expect(m.recordDay).toBe(0)
  })
  it('無配に転じた年の増減配率は −100%（減配の条件から漏らさない）', () => {
    const bars = days('2022-01-04', '2026-11-13', () => 1000)
    const m = computeMetrics('JP:1', bars, [{ date: '2024-03-28', amount: 10 }], [], null, '2026-11-13')
    expect(m.divYoy).toBe(-100)
  })
  it('5 年の増配率: 5 年前が記録の最初の年（年の途中から）なら欠損', () => {
    const bars = days('2020-06-01', '2026-11-13', () => 1000)
    const dividends = [2020, 2021, 2022, 2023, 2024, 2025].map((y) => ({ date: `${y}-09-27`, amount: 10 }))
    expect(computeMetrics('JP:1', bars, dividends, [], null, '2026-11-13').divCagr5).toBeNull()
  })
})
