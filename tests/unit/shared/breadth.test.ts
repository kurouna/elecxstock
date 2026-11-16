// 騰落の集計（FR-BR2, FR-BR3。L1）。値はすべて架空
import { type BreadthIn, breadth } from '@shared/breadth'
import { describe, expect, it } from 'vitest'

const row = (id: string, group: string, m: Partial<BreadthIn['m']>): BreadthIn => ({
  id,
  group,
  m: {
    asOf: '2026-11-13',
    chgPct: null,
    ret1m: null,
    ret3m: null,
    retYtd: null,
    ret1y: null,
    marketCap: null,
    turnover: null,
    newHi52: null,
    newLo52: null,
    ...m,
  },
})

describe('市場の騰落（FR-BR2）', () => {
  it('値上がり・値下がり・変わらずを数え、前日比の欠損はどれにも入れない', () => {
    const [p] = breadth([
      row('JP:1', 'P', { chgPct: 1.2 }),
      row('JP:2', 'P', { chgPct: -0.4 }),
      row('JP:3', 'P', { chgPct: 0 }),
      row('JP:4', 'P', { chgPct: null }),
      row('JP:5', 'P', { chgPct: 3 }),
    ])
    expect(p).toMatchObject({ key: 'P', n: 5, up: 2, down: 1, flat: 1 })
  })
  it('新高値・新安値と売買代金の合計。値が無ければ売買代金は欠損', () => {
    const [p] = breadth([
      row('JP:1', 'P', { newHi52: 1, turnover: 1e9 }),
      row('JP:2', 'P', { newHi52: 0, newLo52: 1, turnover: 5e8 }),
      row('JP:3', 'P', { newHi52: null }),
    ])
    expect(p).toMatchObject({ newHi: 1, newLo: 1, turnover: 1.5e9 })
    expect(breadth([row('JP:9', 'R', { chgPct: 1 })])[0]!.turnover).toBeNull()
  })
  it('いちばん新しい基準日より古い銘柄は、上げ下げ・新高値・売買代金に数えない', () => {
    const [p] = breadth([
      row('JP:1', 'P', { chgPct: 1, turnover: 1e9, newHi52: 1 }),
      row('JP:2', 'P', { asOf: '2026-11-12', chgPct: -1, turnover: 9e9, newLo52: 1 }),
    ])
    expect(p).toMatchObject({ asOf: '2026-11-13', n: 2, up: 1, down: 0, newHi: 1, newLo: 0, turnover: 1e9 })
  })
  it('集まりごとに分け、最初に出てきた順に並べる', () => {
    const rs = breadth([row('JP:1', 'P', {}), row('JP:2', 'R', {}), row('JP:3', 'P', {})])
    expect(rs.map((r) => [r.key, r.n, r.ids])).toEqual([
      ['P', 2, ['JP:1', 'JP:3']],
      ['R', 1, ['JP:2']],
    ])
  })
})

describe('業種別の騰落率（FR-BR3）', () => {
  it('時価総額で加重する。値か時価総額の無い銘柄は加重に入れない', () => {
    const [s] = breadth([
      row('JP:1', '銀行業', { chgPct: 2, ret1m: 10, marketCap: 3e12 }),
      row('JP:2', '銀行業', { chgPct: -2, ret1m: null, marketCap: 1e12 }),
      row('JP:3', '銀行業', { chgPct: 50, marketCap: null }),
      row('JP:4', '銀行業', { chgPct: 50, marketCap: 0 }),
    ])
    expect(s!.ret.d1).toBeCloseTo((2 * 3 + -2 * 1) / 4) // 1.0
    expect(s!.ret.m1).toBeCloseTo(10)
    expect(s!.ret.ytd).toBeNull()
  })
  it('加重の騰落率は古い基準日の銘柄も入れる（ヒートマップと同じ）', () => {
    const [s] = breadth([
      row('JP:1', '銀行業', { chgPct: 1, marketCap: 1e12 }),
      row('JP:2', '銀行業', { asOf: '2026-11-12', chgPct: 3, marketCap: 1e12 }),
    ])
    expect(s!.ret.d1).toBeCloseTo(2)
  })
})
