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
    // 評価日を固定: 2024-10-31（架空の 10:1 分割 2024-09-20 の直後。値はすべて架空）
    const bars = days('2022-01-04', '2024-10-31', () => 200)
    const dividends = [
      { date: '2024-03-21', amount: 3.5 },
      { date: '2024-09-20', amount: 3.5 },
    ] // 分割調整済み（35 円 → 3.5 円）
    const m = computeMetrics('JP:9434', bars, dividends, [{ date: '2024-09-20', ratio: 10 }], null, '2024-10-31')
    expect(m.div12).toBeCloseTo(7)
    expect(m.yieldTrailing).toBeCloseTo(3.5)
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
    // 日足が短くても（保存期間 5 年など）、それより前の配当の記録（月次の系列で 10 年分）があれば、その年から数える
    // 記録の最初の年（3 月から）は年の途中かもしれないので、その次の年から数える
    expect(divYears(div, '2026-11-13', '2025-06-02').divNoCutYears).toBe(3)
    // 上場したばかりで配当の記録も短ければ期間不足
    expect(
      divYears(
        div.filter((d) => d.date >= '2025-01-01'),
        '2026-11-13',
        '2025-06-02',
      ).divUpYears,
    ).toBeNull()
  })
  it('既定の保存期間（5 年）でも、10 年分の配当の記録で増配の年数を数える（銘柄情報の棒グラフと食い違わない）', () => {
    const div = Array.from({ length: 10 }, (_, i) => ({ date: `${2016 + i}-03-28`, amount: 100 + i * 5 }))
    // 2016 年（記録の最初の年）は年の途中かもしれないので除き、2017〜2025 年の 8 回の増配を数える
    expect(divYears(div, '2026-11-13', '2021-11-15')).toEqual({ divUpYears: 8, divNoCutYears: 8 })
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
  it('海外の行（為替・暗号資産など）は、終値が高値・安値の外・高値 < 安値を異常値にしない（Yahoo の 24 時間の市場の日足はこの形になる）', () => {
    const ok = days('2026-01-05', '2026-01-30', () => 100)
    // ドル円の形: 終値が高値をわずかに超える（架空の値）
    const outside = [...ok, { d: '2026-02-02', o: 158.509, h: 158.514, l: 157.841, c: 158.52, v: 0 }]
    expect(anomalous(outside)).toBe(true)
    expect(anomalous(outside, true)).toBe(false)
    expect(anomalous([...ok, { d: '2026-02-02', o: 100, h: 90, l: 110, c: 100, v: 0 }], true)).toBe(false)
    // 終値 0 以下・出来高が負は、海外の行でも異常値
    expect(anomalous([...ok, { d: '2026-02-02', o: 100, h: 100, l: 0, c: 0, v: 0 }], true)).toBe(true)
    expect(anomalous([...ok, { d: '2026-02-02', o: 100, h: 100, l: 100, c: 100, v: -1 }], true)).toBe(true)
  })
  it('指標の行の異常値は、海外の行（為替）だけ高値・安値の検査を外す（日経平均・株式は今までどおり）', () => {
    const ok = days('2026-01-05', '2026-01-30', () => 100)
    const outside = [...ok, { d: '2026-02-02', o: 158.509, h: 158.514, l: 157.841, c: 158.52, v: 0 }]
    expect(computeMetrics('IDX:USDJPY', outside, [], [], null, '2026-02-02').anomaly).toBe(false)
    expect(computeMetrics('IDX:N225', outside, [], [], null, '2026-02-02').anomaly).toBe(true)
    expect(computeMetrics('JP:7203', outside, [], [], null, '2026-02-02').anomaly).toBe(true)
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

describe('最新の足の売買代金と 52 週の新高値・新安値（FR-BR5）', () => {
  // 評価日を固定: 2026-11-13（値はすべて架空）
  const base = days('2025-06-02', '2026-11-12', () => 1000)
  const withLast = (h: number, l: number, v = 2000) => [...base, { d: '2026-11-13', o: 1000, h, l, c: 1000, v }]
  it('売買代金は終値 × 出来高。出来高 0 は欠損', () => {
    expect(computeMetrics('JP:1', withLast(1010, 990), [], [], null, '2026-11-13').turnover).toBe(2_000_000)
    expect(computeMetrics('JP:1', withLast(1010, 990, 0), [], [], null, '2026-11-13').turnover).toBeNull()
  })
  it('高値が前の 52 週の高値を上回れば新高値、同じなら新高値ではない', () => {
    // 前の足の高値はすべて 1010
    expect(computeMetrics('JP:1', withLast(1011, 990), [], [], null, '2026-11-13')).toMatchObject({ newHi52: 1, newLo52: 0 })
    expect(computeMetrics('JP:1', withLast(1010, 990), [], [], null, '2026-11-13')).toMatchObject({ newHi52: 0, newLo52: 0 })
    expect(computeMetrics('JP:1', withLast(1000, 980), [], [], null, '2026-11-13')).toMatchObject({ newHi52: 0, newLo52: 1 })
  })
  it('前の 52 週の日足が足りなければ欠損', () => {
    const short = days('2026-03-02', '2026-11-13', () => 1000)
    expect(computeMetrics('JP:1', short, [], [], null, '2026-11-13')).toMatchObject({ newHi52: null, newLo52: null })
  })
})
