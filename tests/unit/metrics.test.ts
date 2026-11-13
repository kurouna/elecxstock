import { addDays, isTradingDay } from '@core/calendar'
import { anomalous, computeMetrics, crossDays, divYears, recordMonth, yieldTwoPeriods } from '@core/metrics'
import { adjust, aggregate, type DayBar, mergeMonthly, splitFactor } from '@core/series'
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

describe('利回りの基準合わせ（FR-I2）', () => {
  it('過去12か月以内に 10:1 分割した銘柄でも、保存値（分割調整済み）どうしで割れば揃う', () => {
    // 評価日を固定: 2024-10-31（9434 の 10:1 分割 2024-09-27 の直後）
    const bars = days('2022-01-04', '2024-10-31', () => 200)
    const dividends = [
      { date: '2024-03-28', amount: 4.3 },
      { date: '2024-09-27', amount: 4.3 },
    ] // 分割調整済み（43 円 → 4.3 円）
    const m = computeMetrics('JP:9434', bars, dividends, [{ date: '2024-09-27', ratio: 10 }], null, '2024-10-31')
    expect(m.div12).toBeCloseTo(8.6)
    expect(m.yieldTrailing).toBeCloseTo(4.3)
  })
  it('上場12か月未満は期間不足（欠損）', () => {
    const m = computeMetrics(
      'JP:130A',
      days('2026-03-02', '2026-11-13', () => 255),
      [],
      [],
      null,
      '2026-11-13',
    )
    expect(m.yieldTrailing).toBeNull()
    expect(m.hi52).toBeNull() // 245 本に足りない（FR-D9）
  })
  it('権利確定月は権利落ち日の翌営業日の月', () => {
    expect(recordMonth('2026-03-30')).toBe(3)
    expect(recordMonth('2026-12-28')).toBe(12)
  })
})

describe('足の計算（FR-D2, D4, D7）', () => {
  const d = days('2026-01-05', '2026-03-31', (i) => 100 + i)
  it('週足は月曜始まり、足の日付は週の最初の取引日', () => {
    const w = aggregate(d, 'W')
    expect(w[0]!.d).toBe('2026-01-05')
    expect(w[1]!.d).toBe('2026-01-13') // 12 日は成人の日
  })
  it('月足は日足の最初の月まで月次系列、その後は集計', () => {
    const monthly: DayBar[] = [
      { d: '2025-12-01', o: 1, h: 2, l: 1, c: 2, v: 1 },
      { d: '2026-01-01', o: 9, h: 9, l: 9, c: 9, v: 9 },
    ]
    const { bars, monthlyUntil } = mergeMonthly(monthly, d)
    expect(monthlyUntil).toBe(2)
    expect(bars.map((b) => b.d.slice(0, 7))).toEqual(['2025-12', '2026-01', '2026-02', '2026-03'])
  })
  it('未調整は分割係数で戻す・配当込みは配当から計算', () => {
    const splits = [{ date: '2026-02-02', ratio: 5 }]
    expect(splitFactor('2026-01-30', splits)).toBe(5)
    const un = adjust(d, 'unadjusted', splits, [])
    expect(un[0]!.c).toBeCloseTo(d[0]!.c * 5)
    expect(un.at(-1)!.c).toBe(d.at(-1)!.c)
    const tot = adjust(d, 'total', [], [{ date: '2026-03-02', amount: 10 }])
    expect(tot[0]!.c).toBeLessThan(d[0]!.c)
    expect(tot.at(-1)!.c).toBe(d.at(-1)!.c)
  })
})

describe('P2 の指標（増配年数・クロス・2 期の年換算・異常値）', () => {
  it('連続増配・非減配の年数は暦年の合計で数える', () => {
    const div = [2021, 2022, 2023, 2024, 2025].flatMap((y, i) => [
      { date: `${y}-03-28`, amount: 10 + i },
      { date: `${y}-09-27`, amount: y === 2023 ? 10 : 10 + i },
    ])
    // 合計: 2021=20, 2022=22, 2023=22, 2024=26, 2025=28
    const r = divYears(div, '2026-11-13', '2021-01-04')
    expect(r.divUpYears).toBe(2) // 2025>2024>2023、2023=2022 で止まる
    expect(r.divNoCutYears).toBe(4)
    expect(divYears(div, '2026-11-13', '2025-06-02').divUpYears).toBeNull() // 期間不足
  })
  it('25 日線が 75 日線を上に抜けてからの日数', () => {
    const bars = days('2025-01-06', '2025-12-30', (i) => (i < 150 ? 1000 - i : 850 + (i - 150) * 5))
    const r = crossDays(bars)
    expect(r.gcDays).not.toBeNull()
    expect(r.gcDays!).toBeLessThan(bars.length - 150)
  })
  it('直近 2 期の分配を年換算（半年ごとなら 2 回分の合計）', () => {
    const div = [
      { date: '2025-12-26', amount: 3000 },
      { date: '2026-06-26', amount: 3200 },
    ]
    expect(yieldTwoPeriods(div, '2026-11-13', 124_000)).toBeCloseTo((6200 / 124_000) * 100)
    expect(yieldTwoPeriods([div[1]!], '2026-11-13', 124_000)).toBeNull()
  })
  it('高値 < 安値・終値 0 は異常値', () => {
    const ok = days('2026-01-05', '2026-01-30', () => 100)
    expect(anomalous(ok)).toBe(false)
    expect(anomalous([...ok, { d: '2026-02-02', o: 100, h: 90, l: 110, c: 100, v: 1 }])).toBe(true)
    expect(anomalous([...ok, { d: '2026-02-02', o: 100, h: 100, l: 0, c: 0, v: 1 }])).toBe(true)
  })
})

describe('直近の日足だけで指標を作る（METRIC_BARS）', () => {
  it('全期間を渡したときと、直近 METRIC_BARS 本 + 最初の日付を渡したときで、指標がすべて同じ', async () => {
    const { METRIC_BARS } = await import('@core/metrics')
    // 10 年分の波打つ系列（クロス・52 週高値・3 年騰落率がどれも出る）
    const bars = days('2014-01-06', '2024-10-31', (i) => 1000 + 300 * Math.sin(i / 40) + i * 0.5)
    expect(bars.length).toBeGreaterThan(METRIC_BARS * 2)
    const dividends = [2015, 2017, 2019, 2021, 2022, 2023, 2024].flatMap((y) => [
      { date: `${y}-03-28`, amount: 10 + (y - 2015) },
      { date: `${y}-09-27`, amount: 10 + (y - 2015) },
    ])
    const full = computeMetrics('JP:1', bars, dividends, [], null, '2024-10-31')
    const recent = computeMetrics('JP:1', bars.slice(-METRIC_BARS), dividends, [], null, '2024-10-31', bars[0]!.d)
    expect(recent).toEqual(full)
    expect(full.ret3y).not.toBeNull()
    expect(full.divNoCutYears).not.toBeNull()
  })
})
