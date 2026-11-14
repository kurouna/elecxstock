import { computeValue, runScreen } from '@core/screener'
import { epochDay } from '@shared/rights'
import type { Instrument, MetricsRow } from '@shared/types'
import { describe, expect, it } from 'vitest'

describe('実行時に計算する指標（screener.computeValue）', () => {
  const ins = (code: string, kind: Instrument['kind'], sectorJa: string): Instrument => ({
    id: `JP:${code}`,
    code,
    nameJa: code,
    nameEn: code,
    market: kind === 'reit' ? 'R' : 'P',
    kind,
    sectorJa,
    sectorEn: '',
    status: 'active',
    userAdded: false,
  })
  const instruments = [ins('1', 'stock', '銀行業'), ins('2', 'stock', '銀行業'), ins('3', 'reit', ''), ins('4', 'stock', '小売業')]
  const row = (id: string, close: number, extra: Partial<MetricsRow> = {}) =>
    ({ id, close, div12: 30, earningsDay: null, rightsDay: null, ...extra }) as unknown as MetricsRow
  const metrics = new Map(
    [
      row('JP:1', 1000, { earningsDay: epochDay('2026-11-25'), rightsDay: epochDay('2026-11-10') }),
      row('JP:2', 500),
      row('JP:3', 2000),
      row('JP:4', 800),
    ].map((m) => [m.id as string, m]),
  )
  // 評価額: JP:1 = 300,000 / JP:2 = 100,000 / JP:3 = 100,000（計 500,000）
  const holdings = new Map([
    ['JP:1', { qty: 300, cost: 240000 }],
    ['JP:2', { qty: 200, cost: 120000 }],
    ['JP:3', { qty: 50, cost: 90000 }],
  ])
  const base = { instruments, metrics, favorites: new Set<string>(), watchlists: {}, holdings, today: '2026-11-15' }
  const ids = (field: string, op: '>=' | '<=', value: number) => runScreen({ ...base, conditions: [{ field, op, value }] }).ids

  it('保有割合: 持っていない銘柄は 0%', () => {
    expect(ids('holding.weight', '>=', 60)).toEqual(['JP:1'])
    expect(ids('holding.weight', '<=', 0)).toEqual(['JP:4'])
  })
  it('業種の保有割合: 銀行業 80%・REIT 20%・持っていない業種は 0%', () => {
    expect(ids('holding.sectorWeight', '>=', 80)).toEqual(['JP:1', 'JP:2'])
    expect(ids('holding.sectorWeight', '<=', 20).sort()).toEqual(['JP:3', 'JP:4'])
  })
  it('取得利回り = 過去 12 か月の配当 ÷ 平均取得単価（持っていなければ欠損）', () => {
    const inp = { ...base, conditions: [] }
    expect(computeValue('yoc', instruments[0]!, metrics.get('JP:1')!, inp)).toBeCloseTo((30 / 800) * 100)
    expect(computeValue('yoc', instruments[3]!, metrics.get('JP:4')!, inp)).toBeNull()
  })
  it('予定までの日数: 今日から数え、過ぎた日付は欠損', () => {
    const inp = { ...base, conditions: [] }
    expect(computeValue('earningsDays', instruments[0]!, metrics.get('JP:1')!, inp)).toBe(10)
    expect(computeValue('rightsDays', instruments[0]!, metrics.get('JP:1')!, inp)).toBeNull()
    expect(ids('event.earningsDays', '<=', 14)).toEqual(['JP:1'])
  })
  it('保有が無ければ保有割合は欠損', () => {
    const inp = { ...base, holdings: undefined, conditions: [] }
    expect(computeValue('weight', instruments[0]!, metrics.get('JP:1')!, inp)).toBeNull()
  })
})

describe('実行時に計算する指標の境界値', () => {
  it('予定までの日数: 今日なら 0、昨日なら欠損', () => {
    const ins = { id: 'JP:1', kind: 'stock', sectorJa: '' } as Instrument
    const at = (d: string) => ({ earningsDay: epochDay(d), rightsDay: null, recordMonths: [], recordDay: null }) as unknown as MetricsRow
    expect(computeValue('earningsDays', ins, at('2026-11-15'), { today: '2026-11-15' })).toBe(0)
    expect(computeValue('earningsDays', ins, at('2026-11-14'), { today: '2026-11-15' })).toBeNull()
  })
  it('権利付最終日が過ぎたら（次の更新までの間も）、権利確定月から次を出す', () => {
    const ins = { id: 'JP:1', kind: 'stock', sectorJa: '' } as Instrument
    const m = { rightsDay: epochDay('2026-09-28'), recordMonths: [3, 9], recordDay: 0 } as unknown as MetricsRow
    expect(computeValue('rightsDays', ins, m, { today: '2026-09-28' })).toBe(0)
    expect(computeValue('rightsDays', ins, m, { today: '2026-09-29' })).toBe(epochDay('2027-03-29') - epochDay('2026-09-29'))
  })
})
