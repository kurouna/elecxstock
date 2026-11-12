// スクリーニングの判定（§5.2）: 数値の閾値・欠損の扱い・属性（市場・業種・種別）・お気に入り・無効な条件
import { describe, expect, it } from 'vitest'
import { runScreen } from '../../src/core/screener'
import type { Instrument, MetricsRow } from '../../src/shared/types'

const ins = (code: string, market: Instrument['market'], kind: Instrument['kind'], sectorJa: string): Instrument => ({
  id: `JP:${code}`,
  code,
  nameJa: code,
  nameEn: code,
  market,
  kind,
  sectorJa,
  sectorEn: '',
  status: 'active',
  userAdded: false,
})
const m = (code: string, yieldTrailing: number | null) => ({ id: `JP:${code}`, close: 1000, yieldTrailing }) as unknown as MetricsRow

const instruments = [
  ins('8306', 'P', 'stock', '銀行業'),
  ins('7203', 'P', 'stock', '輸送用機器'),
  ins('8951', 'R', 'reit', ''),
  ins('1306', 'E', 'etf', ''),
]
const metrics = new Map([m('8306', 3.6), m('7203', 2.4), m('8951', 4.1), m('1306', null)].map((x) => [x.id, x]))
const run = (conditions: Parameters<typeof runScreen>[0]['conditions'], favorites: string[] = []) =>
  runScreen({ conditions, instruments, metrics, favorites: new Set(favorites), watchlists: {} }).ids

describe('runScreen', () => {
  it('数値の閾値と、欠損の除外・含める', () => {
    expect(run([{ field: 'income.yield', op: '>=', value: 3.5 }])).toEqual(['JP:8306', 'JP:8951'])
    expect(run([{ field: 'income.yield', op: '>=', value: 3.5, includeMissing: true }])).toEqual(['JP:8306', 'JP:8951', 'JP:1306'])
  })
  it('業種・種別・市場（in / notin）', () => {
    expect(run([{ field: 'attr.sector', op: 'in', value: ['銀行業', '輸送用機器'] }])).toEqual(['JP:8306', 'JP:7203'])
    expect(run([{ field: 'attr.kind', op: 'notin', value: ['stock'] }])).toEqual(['JP:8951', 'JP:1306'])
    expect(run([{ field: 'attr.market', op: 'in', value: ['R'] }])).toEqual(['JP:8951'])
  })
  it('お気に入りと、今の版に無い条件は無効として外す', () => {
    const r = runScreen({
      conditions: [
        { field: 'user.favorite', op: '=', value: true },
        { field: 'holding.pnlPct', op: '>=', value: 0 },
      ],
      instruments,
      metrics,
      favorites: new Set(['JP:7203']),
      watchlists: {},
    })
    expect(r.ids).toEqual(['JP:7203'])
    expect(r.invalid).toEqual([1])
  })
})
