// 銘柄の検索（FR-W4）と銘柄情報の業種の中央値（FR-I7）を Core に通す。値はすべて架空
import { afterAll, describe, expect, it, vi } from 'vitest'
import { makeCore } from '../../support/core'

const core = makeCore()
const { call, svc } = core
afterAll(() => core.dispose())

describe('銘柄の検索（FR-W4）', () => {
  it('% と _ は文字として探す（すべての銘柄に当たらない）', async () => {
    expect(await call('instruments.search', { q: '%', limit: 50 })).toEqual([])
    expect(await call('instruments.search', { q: '_', limit: 50 })).toEqual([])
    expect(await call('instruments.search', { q: '72%3', limit: 50 })).toEqual([])
    expect(await call('instruments.search', { q: '7_03', limit: 50 })).toEqual([])
    // ふつうの検索は変わらない（コードの前方一致が先）
    expect((await call('instruments.search', { q: '720', limit: 5 }))[0]?.id).toBe('JP:7203')
  })
})

describe('業種の中央値（FR-I7）', () => {
  it('同じ業種の銘柄を続けて開いても、指標が変わるまでは全銘柄をなめ直さない。値は同じ', async () => {
    const all = await call('instruments.all', {})
    const by = new Map<string, string[]>()
    for (const i of all) if (i.kind === 'stock' && i.sectorJa) by.set(i.sectorJa, [...(by.get(i.sectorJa) ?? []), i.id])
    const [sector, ids] = [...by].sort((a, b) => b[1].length - a[1].length)[0]!
    expect(ids.length).toBeGreaterThanOrEqual(5)
    const spy = vi.spyOn(svc.repo, 'universe')
    try {
      const a = await call('info.extra', { id: ids[0]! })
      const b = await call('info.extra', { id: ids[1]! })
      expect(a.sector?.name).toBe(sector)
      expect(b.sector).toEqual(a.sector)
      expect(spy).toHaveBeenCalledTimes(1)
      // 取得で指標が変わったら数え直す
      await call('jobs.refetch', { ids: [ids[0]!] })
      await core.idle()
      const c = await call('info.extra', { id: ids[0]! })
      expect(spy).toHaveBeenCalledTimes(2)
      expect(c.sector?.n).toBe(a.sector?.n)
    } finally {
      spy.mockRestore()
    }
  })
})
