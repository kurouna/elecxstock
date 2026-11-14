// 銘柄情報の追加の値（FR-I6〜I9）: 配当込みの騰落率・最大下落率・利回りの範囲・業種の中央値・決算発表・権利付最終日・増配率。値はすべて架空
import { addDays, isTradingDay } from '@shared/calendar'
import { describe, expect, it } from 'vitest'
import { computeInfoExtra, earningsOf, sectorStats } from '../../src/core/infoExtra'
import { adjust, type DayBar } from '../../src/core/series'
import { nextRightsDates } from '../../src/renderer/lib/dividends'

/** 営業日だけの日足（終値は与えた関数で） */
function bars(from: string, n: number, close: (i: number) => number): DayBar[] {
  const out: DayBar[] = []
  let d = from
  while (out.length < n) {
    if (isTradingDay(d)) {
      const c = close(out.length)
      out.push({ d, o: c, h: c * 1.01, l: c * 0.99, c, v: 1000 + out.length })
    }
    d = addDays(d, 1)
  }
  return out
}

describe('配当込みの騰落率と最大下落率（1 回の走査）', () => {
  // 1,400 本（約 5.7 年）。ゆるい上昇に、途中で 30% 下げてから戻す山を入れる
  const bs = bars(
    '2021-01-04',
    1400,
    (i) =>
      1000 * (1 + i / 2000) * (i >= 600 && i < 700 ? 1 - ((i - 600) / 100) * 0.3 : i >= 700 && i < 800 ? 0.7 + ((i - 700) / 100) * 0.3 : 1),
  )
  // 年 2 回の配当（権利落ち日は足のある日）
  const divs = bs.filter((_, i) => i % 122 === 61).map((b) => ({ date: b.d, amount: 12 }))
  const x = computeInfoExtra('JP:9999', bs, divs)

  it('配当込みの騰落率はチャートの「配当込み」（series.adjust）と同じ値になる', () => {
    const adj = adjust(bs.slice(-1226), 'total', [], divs)
    const ref = (k: number) => (adj.at(-1)!.c / adj.at(-1 - k)!.c - 1) * 100
    expect(x.tr.y1).toBeCloseTo(ref(245), 6)
    expect(x.tr.y3).toBeCloseTo(ref(735), 6)
    expect(x.tr.y5).toBeCloseTo(ref(1225), 6)
    // 配当込みは値段だけより大きい
    expect(x.tr.y5!).toBeGreaterThan(x.ret5y!)
  })
  it('最大下落率は山の高値から底まで（配当込み）。始まりと底の日も返す', () => {
    // チャートの配当込みの系列で、高値からいちばん下げたところを素直に数えた値と同じ
    const adj = adjust(bs.slice(-1226), 'total', [], divs)
    let peak = 0
    let worst = 0
    for (const b of adj) {
      peak = Math.max(peak, b.c)
      worst = Math.min(worst, b.c / peak - 1)
    }
    expect(x.mdd!.pct).toBeCloseTo(worst * 100, 6)
    expect(x.mdd!.pct).toBeLessThan(-25)
    expect(x.mdd!.from).toBe(bs[600]!.d)
    expect(x.mdd!.to).toBe(bs[700]!.d)
    expect(x.mdd!.years).toBe(5)
  })
  it('利回りの範囲（過去 12 か月の配当 ÷ 終値の最小と最大）', () => {
    // 年 24 円。終値 1,000〜1,700 ほどなので 1.4〜3.4% の間
    expect(x.yieldRange!.lo).toBeGreaterThan(1)
    expect(x.yieldRange!.hi).toBeLessThan(4)
    expect(x.yieldRange!.hi).toBeGreaterThan(x.yieldRange!.lo)
  })
  it('当日の値と 52 週の高値・安値の日', () => {
    const last = bs.at(-1)!
    expect(x.day).toEqual({ o: last.o, h: last.h, l: last.l, v: last.v, prev: bs.at(-2)!.c })
    expect(x.hi52d).toBe(last.d) // 上昇が続いているので最新が高値
  })
  it('足が足りなければ、ある分だけ（5 年の値は null）', () => {
    const short = computeInfoExtra('JP:9999', bs.slice(-400), divs)
    expect(short.tr.y1).not.toBeNull()
    expect(short.tr.y3).toBeNull()
    expect(short.tr.y5).toBeNull()
    expect(short.mdd!.years).toBe(2)
    expect(computeInfoExtra('JP:9999', [], []).day).toBeNull()
  })
  it('速さ: 1,250 本の 1 回の計算は 2ms 以内', () => {
    const t0 = performance.now()
    for (let i = 0; i < 100; i++) computeInfoExtra('JP:9999', bs, divs)
    expect((performance.now() - t0) / 100).toBeLessThan(2)
  })
})

describe('既定の保存期間（5 年）の日足でも 5 年の値を出す', () => {
  // 5 暦年分の日足は約 1,222 本で、245 本 × 5 = 1,225 本に少し足りない
  const bs = bars('2021-11-15', 1222, (i) => (i < 200 ? 800 : 1000) + i * 0.1)
  // 配当の記録は月次の系列で 10 年分ある（日足より前から）
  const divs = Array.from({ length: 20 }, (_, i) => ({ date: `${2016 + (i >> 1)}-${i % 2 ? '09' : '03'}-27`, amount: 20 }))
  const x = computeInfoExtra('JP:9999', bs, divs)
  it('5 年の騰落率（値段・配当込み）は最初の足から', () => {
    expect(bs.length).toBeLessThan(1226)
    expect(x.ret5y).toBeCloseTo((bs.at(-1)!.c / bs[0]!.c - 1) * 100, 6)
    expect(x.tr.y5).not.toBeNull()
    expect(x.tr.y5!).toBeGreaterThan(x.ret5y!)
    expect(x.mdd!.years).toBe(5)
  })
  it('利回りの範囲は、日足より前の配当の記録を使って最初の年から数える', () => {
    // 最初の 200 本は終値が低く（800）、利回りが高い（40 ÷ 800 = 5%）
    expect(x.yieldRange!.hi).toBeCloseTo(5, 1)
    expect(x.yieldRange!.years).toBe(5)
  })
  it('目標の日より 10 日以上あとに始まる足は使わない（上場したばかりなど）', () => {
    const short = computeInfoExtra('JP:9999', bs.slice(30), divs)
    expect(short.ret5y).toBeNull()
  })
})

describe('業種の中央値・決算発表', () => {
  it('中央値（PER は正のものだけ）。5 銘柄未満は出さない', () => {
    const rows = [3, 4, 5, 6, 7].map((y, i) => ({ sector: '卸売業', m: { yieldTrailing: y, per: i === 0 ? -5 : 10 + i, pbr: 1 + i / 10 } }))
    expect(sectorStats(rows, '卸売業')).toEqual({ name: '卸売業', n: 5, yield: 5, per: 12.5, pbr: 1.2 })
    expect(sectorStats(rows.slice(0, 4), '卸売業')).toBeNull()
  })
  it('次の決算発表は未来のときだけ。推定かどうかを添える', () => {
    expect(earningsOf({ earningsNext: '2027-02-04', earningsLast: '2026-11-04', earningsEst: true }, '2026-11-14')).toEqual({
      next: '2027-02-04',
      estimate: true,
      last: '2026-11-04',
    })
    expect(earningsOf({ earningsNext: '2026-08-01', earningsLast: '2026-08-01', earningsEst: false }, '2026-11-14')).toEqual({
      next: null,
      estimate: false,
      last: '2026-08-01',
    })
    expect(earningsOf(null, '2026-11-14')).toBeNull()
  })
})

describe('権利付最終日の目安と 5 年の増配率（FR-I8）', () => {
  it('月末の 2 営業日前。月末が休場日なら前の営業日から数える', () => {
    // 2027-03-31（水）→ 3/29（月）、落ち日 3/30。2026-12-31 は休場 → 12/30 から 2 営業日前の 12/28
    expect(nextRightsDates([3, 9], '2026-11-14')).toEqual([
      { month: 3, lastCum: '2027-03-29', ex: '2027-03-30' },
      { month: 9, lastCum: '2027-09-28', ex: '2027-09-29' },
    ])
    expect(nextRightsDates([6, 12], '2026-11-14')[0]).toEqual({ month: 12, lastCum: '2026-12-28', ex: '2026-12-29' })
    expect(nextRightsDates([], '2026-11-14')).toEqual([])
  })
})
