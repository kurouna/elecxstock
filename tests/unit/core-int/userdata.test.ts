// 利用者のデータの書き出しと取り込み（FR-S3, FR-S12）: 書き出したものを取り込むと元どおり。壊れたものは取り込まず、元に戻すで戻せる
import { afterAll, describe, expect, it } from 'vitest'
import { makeCore } from '../../support/core'

const core = makeCore()
const { call } = core
afterAll(() => core.dispose())

describe('利用者のデータの書き出しと取り込み（FR-S3, S4, S12, FR-AL10）', () => {
  it('書き出し → 変更 → 取り込みで元どおり。元に戻すで取り込む前に戻る', async () => {
    const u0 = await call('user.load', {})
    const fav = u0.watchlists.find((w) => w.builtin === 'favorites')!
    await call('watchlists.toggleItem', { list: fav.id, id: 'JP:8058' })
    await call('portfolio.save', { holdings: [{ code: '7203', account: 'tokutei', quantity: 100, avgCost: 1500 }] })
    const json = await call('user.exportAll', {})
    const exported = await call('user.load', {})
    // 変えてから取り込む
    await call('watchlists.toggleItem', { list: fav.id, id: 'JP:8058' })
    await call('user.saveScreens', { screens: [] })
    const changed = await call('user.load', {})
    await call('user.importAll', { json })
    const back = await call('user.load', {})
    expect(back.watchlists).toEqual(exported.watchlists)
    expect(back.screens).toEqual(exported.screens)
    expect(await call('portfolio.list', {})).toEqual([expect.objectContaining({ code: '7203', quantity: 100, avgCost: 1500 })])
    // 元に戻す
    expect(await call('user.undoImport', {})).toBe(true)
    const undone = await call('user.load', {})
    expect(undone.watchlists).toEqual(changed.watchlists)
    expect(undone.screens).toEqual(changed.screens)
  })
  it('形の違う・壊れた JSON は取り込まず、今のデータを変えない', async () => {
    const before = await call('user.load', {})
    await expect(call('user.importAll', { json: '{"broken"' })).rejects.toBeTruthy()
    await expect(call('user.importAll', { json: JSON.stringify({ format: 'other', version: 1 }) })).rejects.toBeTruthy()
    expect(await call('user.load', {})).toEqual(before)
  })
})
