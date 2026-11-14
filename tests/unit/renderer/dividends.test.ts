// 銘柄情報の配当・分配金のグラフ（FR-I1）: 年ごとの合計（暦年。連続増配の数え方と同じ）と、回ごとの前年比
import { describe, expect, it } from 'vitest'
import { annualDividends, eventYoy, yearsThatFit } from '../../../src/renderer/lib/dividends'

const d = (date: string, amount: number) => ({ date, amount })

describe('annualDividends', () => {
  const divs = [
    d('2021-03-29', 10),
    d('2021-09-28', 10),
    d('2022-03-30', 11),
    d('2022-09-29', 12),
    d('2023-03-30', 12),
    d('2023-09-28', 10),
    d('2024-03-28', 15),
  ]
  it('暦年ごとに合計し、回数・前年比・減配を出す。今年は年途中として前年比を出さない', () => {
    const a = annualDividends(divs, '2024-10-31')
    expect(a.map((x) => [x.year, x.total, x.count])).toEqual([
      [2021, 20, 2],
      [2022, 23, 2],
      [2023, 22, 2],
      [2024, 15, 1],
    ])
    expect(a[0]!.yoy).toBeNull()
    expect(a[1]!.yoy).toBeCloseTo(15)
    expect(a[2]!.cut).toBe(true)
    expect(a[1]!.cut).toBe(false)
    expect(a[3]!.partial).toBe(true)
    expect(a[3]!.yoy).toBeNull()
    expect(a[3]!.cut).toBe(false) // 年途中は減配と判定しない
  })
  it('配当の無い年も 0 の棒として埋める（減配の 0 を見落とさない）', () => {
    const a = annualDividends([d('2020-06-01', 5), d('2022-06-01', 6)], '2023-01-10')
    expect(a.map((x) => [x.year, x.total])).toEqual([
      [2020, 5],
      [2021, 0],
      [2022, 6],
      [2023, 0],
    ])
    expect(a[1]!.cut).toBe(true)
    expect(a[3]!.partial).toBe(true)
  })
  it('基準日より後の配当は数えない。空なら空', () => {
    expect(annualDividends([d('2025-01-01', 9)], '2024-12-31')).toEqual([])
    expect(annualDividends([], '2024-12-31')).toEqual([])
  })
})

describe('eventYoy', () => {
  it('1 年前の同じ時期（± 45 日）の回と比べる', () => {
    const divs = [d('2023-03-30', 10), d('2023-09-28', 10), d('2024-03-28', 12)]
    expect(eventYoy(divs, 2)).toBeCloseTo(20)
    expect(eventYoy(divs, 0)).toBeNull()
  })
})

describe('yearsThatFit', () => {
  it('棒 1 本に 44px を取り、5〜10 本（10 年）に収める', () => {
    expect(yearsThatFit(100)).toBe(5)
    expect(yearsThatFit(352)).toBe(8)
    expect(yearsThatFit(2000)).toBe(10)
  })
})
