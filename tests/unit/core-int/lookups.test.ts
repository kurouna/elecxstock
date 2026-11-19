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

  it('銘柄の一覧だけを取り直して業種が変わったら、指標が同じでも数え直す', async () => {
    const all = await call('instruments.all', {})
    const by = new Map<string, string[]>()
    for (const i of all) if (i.kind === 'stock' && i.sectorJa) by.set(i.sectorJa, [...(by.get(i.sectorJa) ?? []), i.id])
    const [sector, ids] = [...by].sort((a, b) => b[1].length - a[1].length)[0]!
    const before = (await call('info.extra', { id: ids[0]! })).sector!.n
    const provider = (svc as unknown as { provider: { fetchUniverse: (o: unknown) => Promise<{ code: string; sectorJa: string }[]> } })
      .provider
    const real = provider.fetchUniverse.bind(provider)
    // 別の業種の銘柄を 1 つ、この業種へ移す
    const other = all.find(
      (i) => i.kind === 'stock' && i.sectorJa && i.sectorJa !== sector && i.market === all.find((x) => x.id === ids[0])?.market,
    )!
    const moved = other.id.replace(/^JP:/, '')
    const spy = vi
      .spyOn(provider, 'fetchUniverse')
      .mockImplementation(async (o) => (await real(o)).map((r) => (r.code === moved ? { ...r, sectorJa: sector } : r)))
    try {
      await call('jobs.start', { kind: 'universe' })
      await core.idle()
      expect((await call('info.extra', { id: ids[0]! })).sector!.n).toBe(before + 1)
    } finally {
      spy.mockRestore()
    }
  })

  it('プライム・REIT 以外の銘柄を利用者の追加から外したら、指標が同じでも数え直す（スクリーナーの対象から外れる）', async () => {
    // スタブのグロースの銘柄（130A）を、いちばん大きい業種に入れて（一覧の取り直し）から、利用者の追加に出し入れする。
    // 上のテストが業種を動かしているので、別の Core で確かめる
    const own = makeCore()
    const { call, svc } = own
    const all = await call('instruments.all', {})
    const by = new Map<string, string[]>()
    for (const i of all) if (i.kind === 'stock' && i.sectorJa && i.market === 'P') by.set(i.sectorJa, [...(by.get(i.sectorJa) ?? []), i.id])
    const [sector, ids] = [...by].sort((a, b) => b[1].length - a[1].length)[0]!
    const code = '130A'
    const provider = (svc as unknown as { provider: { fetchUniverse: (o: unknown) => Promise<{ code: string; sectorJa: string }[]> } })
      .provider
    const real = provider.fetchUniverse.bind(provider)
    const spy = vi
      .spyOn(provider, 'fetchUniverse')
      .mockImplementation(async (o) => (await real(o)).map((r) => (r.code === code ? { ...r, sectorJa: sector } : r)))
    try {
      await call('jobs.start', { kind: 'universe' })
      await own.idle()
      const before = (await call('info.extra', { id: ids[0]! })).sector!.n
      const std = await call('instruments.addUser', { code })
      expect(std?.market).toBe('G')
      await own.idle()
      expect((await call('info.extra', { id: ids[0]! })).sector!.n).toBe(before + 1)
      // 外しても指標の写しと一覧の版は変わらない（取得は無い）が、スクリーナーの対象から外れるので母集団からも外れる
      await call('instruments.removeUser', { code })
      expect((await call('info.extra', { id: ids[0]! })).sector!.n).toBe(before)
    } finally {
      spy.mockRestore()
      own.dispose()
    }
  })
})
