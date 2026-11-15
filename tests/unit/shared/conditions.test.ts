import { conditionValid, runScreen } from '@core/screener'
import { alertConditionOk, conditionMet, distanceOf, splitSensitive } from '@shared/alerts'
import type { Condition, Instrument, MetricsRow } from '@shared/types'
import { describe, expect, it } from 'vitest'

describe('無効な条件（FR-SC11）', () => {
  it('相対条件の相手が別の種類（終値 ≥ 時価総額）なら無効。スクリーナーもアラートも', () => {
    const bad = { field: 'price.close', op: '>=' as const, value: 0, ref: 'value.marketCap' }
    const ok = { field: 'price.close', op: '>=' as const, value: 0, ref: 'price.ma75' }
    expect(conditionValid(bad)).toBe(false)
    expect(conditionValid(ok)).toBe(true)
    expect(alertConditionOk(bad)).toBe(false)
    expect(alertConditionOk(ok)).toBe(true)
  })
  it('分割で換算するのは 1 株あたりの金額だけ（売買代金・最低投資金額は換算しない）', () => {
    const c = (field: string) => ({ field, op: '<=' as const, value: 1 })
    expect(splitSensitive(c('price.close'))).toBe(true)
    expect(splitSensitive(c('value.eps'))).toBe(true)
    expect(splitSensitive(c('liq.turnover20'))).toBe(false)
    expect(splitSensitive(c('price.minInvest'))).toBe(false)
  })
  it('保有の記録が無いときの保有の指標は無効にして、残りの条件で走らせる', () => {
    const ins: Instrument = {
      id: 'JP:1',
      code: '1',
      nameJa: '1',
      nameEn: '1',
      market: 'P',
      kind: 'stock',
      sectorJa: '銀行業',
      sectorEn: '',
      status: 'active',
      userAdded: false,
    }
    const r = runScreen({
      conditions: [
        { field: 'holding.weight', op: '>=', value: 0 },
        { field: 'price.close', op: '>=', value: 0 },
      ],
      instruments: [ins],
      metrics: new Map([['JP:1', { id: 'JP:1', close: 100 } as unknown as MetricsRow]]),
      favorites: new Set(),
      watchlists: {},
      holdings: new Map(),
    })
    expect(r.invalid).toEqual([0])
    expect(r.ids).toEqual(['JP:1'])
  })
})

describe('相対条件の相手との差（FR-SC5, FR-AL1）', () => {
  const ins = { id: 'JP:1', code: '1', kind: 'stock', sectorJa: '' } as unknown as Instrument
  const row = (o: Partial<MetricsRow>) => ({ id: 'JP:1', close: 1000, ...o }) as unknown as MetricsRow
  const run = (c: Condition, m: MetricsRow) =>
    runScreen({
      conditions: [c],
      instruments: [{ ...ins, nameJa: '1', nameEn: '1', market: 'P', sectorEn: '', status: 'active', userAdded: false } as Instrument],
      metrics: new Map([['JP:1', m]]),
      favorites: new Set(),
      watchlists: {},
    }).ids.length === 1
  it('価格どうしは相手の ±x %（終値 ≥ 75日移動平均 +5% → 75日線 × 1.05）', () => {
    const c: Condition = { field: 'price.close', op: '>=', value: 5, ref: 'price.ma75' }
    expect(run(c, row({ close: 1050, ma75: 1000 }))).toBe(true)
    expect(run(c, row({ close: 1049, ma75: 1000 }))).toBe(false)
    expect(conditionMet(c, row({ close: 1050, ma75: 1000 }), undefined, 'JP:1')).toBe(true)
  })
  it('% の指標どうし（騰落率・乖離率・利回り）は相手 ± x ポイント。相手が負・0 でも向きが逆にならない', () => {
    // 1年騰落率(配当込み) ≥ 1年騰落率 +5 ポイント
    const c: Condition = { field: 'ret.tr1y', op: '>=', value: 5, ref: 'ret.1y' }
    expect(run(c, row({ tr1y: -6, ret1y: -10 }))).toBe(false) // −10 + 5 = −5 に届かない
    expect(run(c, row({ tr1y: -5, ret1y: -10 }))).toBe(true)
    expect(run(c, row({ tr1y: 5, ret1y: 0 }))).toBe(true) // 相手が 0 でも差が効く
    expect(run(c, row({ tr1y: 4.9, ret1y: 0 }))).toBe(false)
    expect(conditionMet(c, row({ tr1y: -6, ret1y: -10 }), undefined, 'JP:1')).toBe(false)
    // 利回り(直近2期) ≥ 実績利回り +0.5 ポイント
    const y: Condition = { field: 'income.yield2p', op: '>=', value: 0.5, ref: 'income.yield' }
    expect(run(y, row({ yield2p: 4.5, yieldTrailing: 4 }))).toBe(true)
    expect(run(y, row({ yield2p: 4.4, yieldTrailing: 4 }))).toBe(false)
  })
  it('条件までの距離: 価格の相対条件は %、% の指標どうしはポイント（FR-AL8）', () => {
    const px: Condition = { field: 'price.close', op: '>=', value: 0, ref: 'price.ma75' }
    expect(distanceOf([px], row({ close: 900, ma75: 1000 }), undefined, 'JP:1')).toEqual({
      kind: 'pct',
      value: expect.closeTo((1000 / 900 - 1) * 100, 6),
    })
    const ret: Condition = { field: 'ret.tr1y', op: '>=', value: 5, ref: 'ret.1y' }
    expect(distanceOf([ret], row({ tr1y: -8, ret1y: -10 }), undefined, 'JP:1')).toEqual({ kind: 'pt', value: 3 })
  })
})
