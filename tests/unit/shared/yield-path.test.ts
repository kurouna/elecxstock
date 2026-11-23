// 利回りの変化の内訳（docs/design-yield-breakdown.md §3。L1）: 月末の終値・12 か月の配当・期間の始まり・内訳・一言・棒の目盛り。値はすべて架空
import { addDays, isTradingDay } from '@shared/calendar'
import { describe, expect, it } from 'vitest'
import {
  barScale,
  barWidth,
  breakdownFor,
  monthCloses,
  spanStart,
  yieldBreakdown,
  yieldCaption,
  yieldPath,
} from '../../../src/shared/yieldPath'

/** from〜to の営業日の日足（終値は一定 c、または日ごとに step ずつ） */
function days(from: string, to: string, c = 1000, step = 0) {
  const out: { d: string; c: number }[] = []
  let x = c
  for (let d = from; d <= to; d = addDays(d, 1))
    if (isTradingDay(d)) {
      out.push({ d, c: x })
      x += step
    }
  return out
}
/** 月次系列（YYYY-MM-01。終値は月ごとに step ずつ） */
function months(from: string, to: string, c = 500, step = 0) {
  const out: { d: string; c: number }[] = []
  let x = c
  for (let ym = from; ym <= to; ) {
    out.push({ d: `${ym}-01`, c: x })
    x += step
    const [y, m] = ym.split('-').map(Number) as [number, number]
    ym = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
  }
  return out
}
const div = (date: string, amount: number) => ({ date, amount })

describe('FR-I11 月末の終値（monthCloses）', () => {
  it('日足の月は最後の足・今月は最新の足・日足の始まりの月より前だけ月次（日はその月の最終営業日）', () => {
    const c = monthCloses(days('2024-03-11', '2024-06-12', 1000, 1), months('2023-01', '2024-05', 500, 10))
    expect(c[0]).toEqual({ m: '2023-01', d: '2023-01-31', c: 500 })
    // 2024-02 が最後の月次（2024-03 は日足の月）
    const i = c.findIndex((x) => x.m === '2024-03')
    expect(c[i - 1]!.m).toBe('2024-02')
    expect(c[i - 1]!.d).toBe('2024-02-29')
    expect(c[i]!.d).toBe('2024-03-29') // 3 月の最後の足
    expect(c.at(-1)).toMatchObject({ m: '2024-06', d: '2024-06-12' }) // 今月は最新の足
    expect(c.map((x) => x.m)).toEqual([...new Set(c.map((x) => x.m))])
  })
  it('月次が無ければ日足だけ。日足が無ければ月次だけ', () => {
    expect(monthCloses(days('2024-03-11', '2024-04-30'), [])).toHaveLength(2)
    expect(monthCloses([], months('2020-01', '2020-03')).map((x) => x.d)).toEqual(['2020-01-31', '2020-02-28', '2020-03-31'])
  })
})

describe('FR-I11 12 か月の配当と点の範囲（yieldPath）', () => {
  const closes = monthCloses(days('2023-10-16', '2026-11-13', 1000), months('2015-01', '2026-11', 1000))
  it('終わった月は権利落ち日の月で数える（月末の日付がずれても 2 回入らない）', () => {
    // 2023-03-30 と 2024-03-28 の権利落ち。2024-03 の点（日は 2024-03-29）の 12 か月は 2023-04〜2024-03 なので 1 回だけ
    const p = yieldPath(closes, [div('2023-03-30', 20), div('2023-09-27', 20), div('2024-03-28', 20), div('2024-09-26', 20)], '2016-11-13')!
    const at = (m: string) => p.find((x) => x.m === m)!
    expect(at('2024-03').div12).toBe(40)
    expect(at('2024-02').div12).toBe(40)
    expect(at('2024-10').div12).toBe(40)
  })
  it('今月だけは最新の足の日の 1 年前より後〜その日（指標の実績利回りと同じ）', () => {
    const p = yieldPath(closes, [div('2025-11-13', 30), div('2025-11-14', 25), div('2026-05-27', 25)], '2016-11-13')!
    const now = p.at(-1)!
    expect(now.m).toBe('2026-11')
    expect(now.d).toBe('2026-11-13')
    expect(now.div12).toBe(50) // 2025-11-13 はちょうど 1 年前なので入らない
    // 終わった月の 2026-10 は 2025-11〜2026-10 の月で数える（2025-11-13 も入る）
    expect(p.find((x) => x.m === '2026-10')!.div12).toBe(80)
  })
  it('配当の記録の始まりより前と、最初の足の 1 年後より前の月は出さない', () => {
    const ds = [div('2020-03-27', 10), div('2021-03-29', 10), div('2026-03-27', 10)]
    const p = yieldPath(closes, ds, '2019-06-01')!
    // 12 か月の窓（m の 11 か月前の月の初め）が 2019-06-01 以後: 最初の点は 2020-05
    expect(p[0]!.m).toBe('2020-05')
    // 上場して間もない銘柄: 最初の足が 2026-03-02 → 2027-02 まで点が無い（今月の 2026-11 も出さない）
    const young = monthCloses(days('2026-03-02', '2026-11-13'), [])
    expect(yieldPath(young, [div('2026-09-28', 10)], '2016-11-13')).toEqual([])
  })
  it('上場・取り込みの最初の足は実際の日で見る（月次の月の日付は月末に直してあるので使わない）', () => {
    const mc = monthCloses([], months('2020-01', '2022-06'))
    // 最初の足が 2020-01-06 → 2020-01 から 12 か月の窓が埋まる 2020-12 が最初の点
    expect(yieldPath(mc, [div('2020-03-27', 10)], '2016-11-13', '2020-01-06')![0]!.m).toBe('2020-12')
    // 最初の足が月の半ば（2020-01-20）なら 1 か月遅れる
    expect(yieldPath(mc, [div('2020-03-27', 10)], '2016-11-13', '2020-01-20')![0]!.m).toBe('2021-01')
  })
  it('0 以下の配当は使わない。正の配当が 1 回も無ければ null', () => {
    const p = yieldPath(closes, [div('2026-03-27', 10), div('2026-04-01', -5), div('2026-04-02', 0)], '2016-11-13')!
    expect(p.at(-1)!.div12).toBe(10)
    expect(yieldPath(closes, [div('2026-03-27', 0)], '2016-11-13')).toBeNull()
    expect(yieldPath(closes, [], '2016-11-13')).toBeNull()
  })
})

describe('FR-I11 期間の始まり（spanStart）', () => {
  const pt = (m: string, price: number, div12: number) => ({ m, d: `${m}-28`, price, div12 })
  const series = (n: number, f: (i: number) => number) => {
    const out = []
    for (let i = 0; i < n; i++) {
      const y = 2017 + Math.floor((i + 11) / 12)
      const mm = ((i + 11) % 12) + 1
      out.push(pt(`${y}-${String(mm).padStart(2, '0')}`, 1000, f(i)))
    }
    return out
  }
  it('5 年前の月から。足りなければある分だけ。最長は最初の点から', () => {
    const p = series(108, () => 30) // 2017-12〜2026-11
    expect(spanStart(p, 5)).toEqual({ i0: 108 - 61, years: 5, started: false })
    expect(spanStart(p, 'max')).toEqual({ i0: 0, years: 9, started: false })
    const short = series(25, () => 30)
    expect(spanStart(short, 5)).toEqual({ i0: 0, years: 2, started: false })
  })
  it('始まりの 12 か月の配当が 0 なら、配当が出た最初の月の 11 か月後から（started）。13 点に満たない・今が 0 なら null', () => {
    const p = series(108, (i) => (i < 60 ? 0 : 30))
    expect(spanStart(p, 'max')).toMatchObject({ i0: 71, started: true })
    expect(
      spanStart(
        series(108, (i) => (i < 90 ? 0 : 30)),
        'max',
      ),
    ).toBeNull()
    expect(
      spanStart(
        series(108, (i) => (i < 107 ? 30 : 0)),
        5,
      ),
    ).toBeNull()
    expect(spanStart([], 5)).toBeNull()
    // 今の 12 か月が埋まっていない（直近 11 か月に配当 0 の月がある = 1 年以内に配当を再開した）なら出さない
    expect(
      spanStart(
        series(108, (i) => (i >= 90 && i < 100 ? 0 : 30)),
        5,
      ),
    ).toBeNull()
  })
})

describe('FR-I11 配当を途中で始めた銘柄（レビューの反映）', () => {
  it('年 2 回の配当を途中で始め、金額が一定なら、内訳の配当は増えていない（12 か月の合計が埋まるだけの増配に見せない）', () => {
    const closes = monthCloses(days('2023-10-16', '2026-11-13', 1000), months('2016-01', '2026-11', 1000))
    const ds: { date: string; amount: number }[] = []
    for (let y = 2020; y <= 2026; y++) ds.push(div(`${y}-03-27`, 20), div(`${y}-09-26`, 20))
    const p = yieldPath(
      closes,
      ds.filter((x) => x.date <= '2026-11-13'),
      '2016-11-13',
    )!
    const s = spanStart(p, 'max')!
    expect(s.started).toBe(true)
    expect(p[s.i0]!.m).toBe('2021-02')
    expect(yieldBreakdown(p, s.i0, p.length - 1)!.lD).toBeCloseTo(0)
  })
  const closes = monthCloses(days('2023-10-16', '2026-11-13', 1000), months('2016-01', '2026-11', 1000))
  const semi = (from: number, to: number) => {
    const ds: { date: string; amount: number }[] = []
    for (let y = from; y <= to; y++) ds.push(div(`${y}-03-27`, 20), div(`${y}-09-26`, 20))
    return ds
  }
  it('始まりの点が 12 か月の合計が埋まる途中（最初の配当が 5 年前の少し前）でも、最後に 0 だった月の 12 か月後から', () => {
    // 2021-09 に配当を始めた（5 年前の 2021-11 の 12 か月はまだ 1 回分）
    const p = yieldPath(
      closes,
      semi(2021, 2026).filter((x) => x.date >= '2021-09-01' && x.date <= '2026-11-13'),
      '2016-11-13',
    )!
    const s = spanStart(p, 5)!
    expect(s.started).toBe(true)
    expect(p[s.i0]!.m).toBe('2022-08')
    expect(yieldBreakdown(p, s.i0, p.length - 1)!.lD).toBeCloseTo(0)
  })
  it('休んでから再開した配当も、再開して 12 か月が埋まる月から', () => {
    const ds = [...semi(2016, 2019), ...semi(2022, 2026)].filter((x) => x.date <= '2026-11-13')
    const p = yieldPath(closes, ds, '2016-11-13')!
    const s = spanStart(p, 5)!
    expect(s.started).toBe(true)
    expect(p[s.i0]!.m).toBe('2023-02')
    expect(yieldBreakdown(p, s.i0, p.length - 1)!.lD).toBeCloseTo(0)
  })
  it('ずっと払っている銘柄は動かさない', () => {
    const p = yieldPath(
      closes,
      semi(2016, 2026).filter((x) => x.date >= '2016-11-13' && x.date <= '2026-11-13'),
      '2016-11-13',
    )!
    const s = spanStart(p, 5)!
    expect(s.started).toBe(false)
    expect(p[s.i0]!.m).toBe('2021-11')
  })
})

describe('FR-I11 内訳・一言・棒の目盛り', () => {
  const P = (price: number, div12: number) => ({ m: '2026-01', d: '2026-01-30', price, div12 })
  it('利回りの ln 比 = 配当の ln 比 − 株価の ln 比。増減率と pt', () => {
    const b = yieldBreakdown([P(1000, 40), P(800, 44)], 0, 1)!
    expect(b.y0).toBeCloseTo(0.04)
    expect(b.y1).toBeCloseTo(0.055)
    expect(b.lY).toBeCloseTo(b.lD - b.lP)
    expect(b.dD).toBeCloseTo(0.1)
    expect(b.dP).toBeCloseTo(-0.2)
    expect(b.dY).toBeCloseTo(0.375)
    expect(b.pt).toBeCloseTo(1.5)
    expect(yieldBreakdown([P(1000, 0), P(800, 44)], 0, 1)).toBeNull()
    expect(yieldBreakdown([P(1000, 40), P(800, 0)], 0, 1)).toBeNull()
  })
  const cap = (p0: number, d0: number, p1: number, d1: number) => yieldCaption(yieldBreakdown([P(p0, d0), P(p1, d1)], 0, 1)!)
  it('一言の 6 通り（判定の言葉は使わない）', () => {
    expect(cap(1000, 40, 1010, 40.4)).toEqual({ kind: 'flat' })
    expect(cap(1000, 40, 1300, 52)).toMatchObject({ kind: 'same', dD: expect.any(Number), dP: expect.any(Number) })
    expect(cap(1000, 40, 700, 40)).toEqual({ kind: 'main', up: true, by: 'price' })
    expect(cap(1000, 40, 1000, 30)).toEqual({ kind: 'main', up: false, by: 'div' })
    expect(cap(1000, 40, 900, 46)).toEqual({ kind: 'both', up: true })
    // 逆向き: 増配 +50% が株価の上昇 +20% を上回った（利回りは上がった）
    expect(cap(1000, 40, 1200, 60)).toEqual({ kind: 'over', up: true, by: 'div' })
    // 逆向き: 株価の上昇 +60% が増配 +10% を上回った（利回りは下がった）
    expect(cap(1000, 40, 1600, 44)).toEqual({ kind: 'over', up: false, by: 'price' })
  })
  it('棒の目盛りは 0.15 を下限に、いちばん大きい ln 比。長さは半分の幅で頭打ち', () => {
    const b = yieldBreakdown([P(1000, 40), P(980, 40.4)], 0, 1)!
    expect(barScale(b)).toBe(0.15)
    const big = yieldBreakdown([P(1000, 40), P(400, 40)], 0, 1)!
    expect(barScale(big)).toBeCloseTo(Math.log(2.5))
    expect(barWidth(big.lY, barScale(big))).toBeCloseTo(50)
    expect(barWidth(0.075, 0.15)).toBeCloseTo(25)
    expect(barWidth(-1, 0.15)).toBe(50)
  })
})

describe('FR-I11 欄に出すもの（breakdownFor）', () => {
  const pt = (i: number, div12: number) => ({
    m: `20${20 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`,
    d: '2020-01-31',
    price: 1000,
    div12,
  })
  const mk = (n: number, f: (i: number) => number) => Array.from({ length: n }, (_, i) => pt(i, f(i)))
  it('点が無い・13 点未満・配当が一度も無ければ出さない。今だけ 0 なら「今は無配」。ほかは内訳', () => {
    expect(breakdownFor(null, 5)).toEqual({ kind: 'hidden' })
    expect(
      breakdownFor(
        mk(12, () => 30),
        5,
      ),
    ).toEqual({ kind: 'hidden' })
    expect(
      breakdownFor(
        mk(40, () => 0),
        5,
      ),
    ).toEqual({ kind: 'hidden' })
    expect(
      breakdownFor(
        mk(40, (i) => (i < 39 ? 30 : 0)),
        5,
      ),
    ).toEqual({ kind: 'none' })
    expect(
      breakdownFor(
        mk(40, () => 30),
        5,
      ),
    ).toMatchObject({ kind: 'ok', i0: 0, years: 3, started: false })
    // 配当を始めて 13 点に満たない
    expect(
      breakdownFor(
        mk(40, (i) => (i < 30 ? 0 : 30)),
        5,
      ),
    ).toEqual({ kind: 'hidden' })
  })
})
