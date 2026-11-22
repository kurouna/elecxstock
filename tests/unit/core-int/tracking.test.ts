import { afterAll, describe, expect, it } from 'vitest'
import { makeCore } from '../../support/core'

const core = makeCore()
const { call } = core
afterAll(() => core.dispose())

const meta = { broker: 'rakuten', importedAt: '2026-11-14T00:00:00Z', realized: null, dividends: null }
const h = (code: string) => ({ code, account: 'tokutei' as const, quantity: 100, avgCost: 1000 })
const tracked = async (code: string) => (await call('instruments.get', { ids: [`JP:${code}`] }))[0]?.userAdded

describe('保有の銘柄は市場によらず取得する（スタンダード・グロース・ETF）', () => {
  it('一覧にある銘柄でも、保有に入れたら取得の対象になり、外したら戻る', async () => {
    // 130A はグロース、1308 は ETF（スタブの一覧にある）
    expect(await tracked('130A')).toBe(false)
    await call('portfolio.applyCsv', { holdings: [h('130A')], meta })
    expect(await tracked('130A')).toBe(true)
    const jobs = await call('jobs.list', {})
    expect(jobs[0]!.kind).toBe('refetch')
    // 保有のフォーム（portfolio.save）でも同じ
    await call('portfolio.save', { holdings: [h('130A'), h('1308')] })
    expect(await tracked('1308')).toBe(true)
    // JSON の取り込みでも同じ
    await call('portfolio.save', { holdings: [] })
    expect(await tracked('130A')).toBe(false)
    await call('portfolio.applyImport', { holdings: [h('130A')], mode: 'replace' })
    expect(await tracked('130A')).toBe(true)
    // 利用者が足した銘柄には数えない（設定の上限・一覧に出さない）
    expect((await call('user.load', {})).settings.userInstruments).not.toContain('130A')
  })
})

describe('ウォッチリストの一括の取り込み・フリー N の★でも、その銘柄を取得の対象にする', () => {
  it('user.importAll と watchlists.toggleItem のあとすぐに対象になる', async () => {
    expect(await tracked('1308')).toBe(false)
    const all = JSON.parse(await call('user.exportAll', {}))
    all.watchlists[0].items.push('JP:1308')
    await call('user.importAll', { json: JSON.stringify(all) })
    expect(await tracked('1308')).toBe(true)
    expect(await tracked('9282')).toBe(false)
    const list = all.watchlists[0].builtin ?? all.watchlists[0].id
    await call('watchlists.toggleItem', { list, id: 'JP:9282' })
    expect(await tracked('9282')).toBe(true)
  })
})
