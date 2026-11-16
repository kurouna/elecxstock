// 既定のスクリーン（FR-SC15）: 条件が登録表の指標・比べ方で、スタブのデータで実際に動く
import { defaultScreens } from '@core/userstore'
import { FIELD_BY_ID } from '@shared/fields'
import { afterAll, describe, expect, it } from 'vitest'
import { makeCore } from '../../support/core'

const core = makeCore()
afterAll(() => core.dispose())

describe('既定のスクリーン（FR-SC15）', () => {
  const defs = defaultScreens(1)
  it('ID は重ならない', () => {
    expect(new Set(defs.map((s) => s.id)).size).toBe(defs.length)
  })
  it('高配当銘柄は実績利回り 4% 以上', () => {
    expect(defs.find((s) => s.id === 'high-yield')!.conditions).toContainEqual({ field: 'income.yield', op: '>=', value: 4 })
  })
  it.each(defs.map((s) => [s.id, s] as const))('%s: 条件はすべて登録表にあり、無効な条件が無い', async (_id, s) => {
    for (const c of s.conditions) expect(FIELD_BY_ID.has(c.field), c.field).toBe(true)
    const r = await core.call('screener.run', { conditions: s.conditions, favorites: [], watchlists: {} })
    expect(r.invalid).toEqual([])
  })
})
