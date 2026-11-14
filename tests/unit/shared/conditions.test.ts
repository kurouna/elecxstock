import { conditionValid, runScreen } from '@core/screener'
import { alertConditionOk, splitSensitive } from '@shared/alerts'
import type { Instrument, MetricsRow } from '@shared/types'
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
