// スタブの境界の銘柄（架空。docs/test-plan.md §3.1）を Core に通す: 無配に転じた・上場 1 年未満（FR-I, §5.1）
import { afterAll, describe, expect, it } from 'vitest'
import { makeCore } from '../../support/core'

const core = makeCore()
afterAll(() => core.dispose())

describe('境界の銘柄（FR-I, §5.1）', () => {
  it('無配に転じた銘柄（8002）: 増減配率は −100%、5 年の増配率・利回りは欠損か 0', async () => {
    const [m] = await core.svc.call('metrics.get', { ids: ['JP:8002'] })
    expect(m?.divYoy).toBe(-100)
    expect(m?.divCagr5).toBeNull()
    expect(m?.div12 ?? 0).toBe(0)
    // 減配の条件（増減配率 ≤ −50%）で拾える
    const r = await core.svc.call('screener.run', {
      conditions: [{ field: 'income.divYoy', op: '<=', value: -50 }],
      favorites: [],
      watchlists: {},
    })
    expect(r.ids).toContain('JP:8002')
  })
  it('上場 1 年未満の銘柄（1605）: 1 年・3 年の騰落率と 3 年の最大下落率は欠損、短い期間の値は出る', async () => {
    const [m] = await core.svc.call('metrics.get', { ids: ['JP:1605'] })
    expect(m?.close).toBeGreaterThan(0)
    expect(m?.ret1y).toBeNull()
    expect(m?.ret3y).toBeNull()
    expect(m?.mdd3y).toBeNull()
    expect(m?.ret1m).not.toBeNull()
    expect(m?.vol60).not.toBeNull()
    // 欠損を含めない条件では外れ、含めると入る（FR-SC）
    const run = (includeMissing: boolean) =>
      core.svc.call('screener.run', {
        conditions: [{ field: 'ret.1y', op: '>=', value: -1000, includeMissing }],
        favorites: [],
        watchlists: {},
      })
    expect((await run(false)).ids).not.toContain('JP:1605')
    expect((await run(true)).ids).toContain('JP:1605')
  })
})
