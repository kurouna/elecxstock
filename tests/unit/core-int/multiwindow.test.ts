import { afterAll, describe, expect, it } from 'vitest'
import { makeCore } from '../../support/core'

const core = makeCore()
const { svc } = core
afterAll(() => core.dispose())

describe('レイアウトの保存（1 枚目とフリー N）', () => {
  it('フリー N は自分の分だけ保存し、1 枚目の保存はフリー N の配置を消さない', async () => {
    await svc.call('user.saveLayout', { layout: { version: 1, active: 'mtf', entries: { mtf: { a: 1 } }, links: {} } })
    await svc.call('user.saveWindowLayout', { slot: 'free2', entry: { root: { kind: 'pane', id: 'g', widget: 'grid' } } })
    await svc.call('user.saveWindowLayout', { slot: 'free3', entry: { root: { kind: 'pane', id: 'c', widget: 'chart' } } })
    // 1 枚目が（windows を知らずに）丸ごと保存し直しても、フリー N の配置は残る
    await svc.call('user.saveLayout', { layout: { version: 1, active: 'grid', entries: { mtf: { a: 2 } }, links: {} } })
    const l = (await svc.call('user.load', {})).layout as { active: string; windows: Record<string, { root: { widget: string } }> }
    expect(l.active).toBe('grid')
    expect(l.windows.free2!.root.widget).toBe('grid')
    expect(l.windows.free3!.root.widget).toBe('chart')
  })
  it('★・◆は Core で入れ・外しし、保存する', async () => {
    let ls = await svc.call('watchlists.toggleItem', { list: 'favorites', id: 'JP:7203' })
    expect(ls.find((w) => w.builtin === 'favorites')!.items).toContain('JP:7203')
    ls = await svc.call('watchlists.toggleItem', { list: 'favorites', id: 'JP:7203' })
    expect(ls.find((w) => w.builtin === 'favorites')!.items).not.toContain('JP:7203')
    ls = await svc.call('watchlists.toggleItem', { list: 'candidates', id: 'JP:8058' })
    expect((await svc.call('user.load', {})).watchlists.find((w) => w.builtin === 'candidates')!.items).toEqual(['JP:8058'])
  })
})
