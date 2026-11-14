// v0.0.3 のレビューで見つかった問題の回帰テスト: 一覧に無い銘柄の一括追加、利用者の銘柄は Core が持つ、再計算の中断
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { makeCore } from '../../support/core'

const core = makeCore()
const { svc, dir } = core
afterAll(() => core.dispose())

const meta = { broker: 'rakuten', importedAt: '2026-11-14T00:00:00Z', realized: null, dividends: null }
const h = (code: string) => ({ code, account: 'tokutei' as const, quantity: 100, avgCost: 1000 })

describe('保有の取り込みで一覧に無い銘柄を足す', () => {
  it('何銘柄でも設定の保存と取り直しのジョブは 1 回ずつ', async () => {
    const gens = () => readdirSync(join(dir, 'user', 'backups')).filter((f) => f.startsWith('settings.')).length
    const before = gens()
    const jobs0 = (await svc.call('jobs.list', {})).length
    await svc.call('portfolio.applyCsv', { holdings: ['1001', '1002', '1003', '1004', '1005'].map(h), meta })
    expect(gens() - before).toBeLessThanOrEqual(1)
    const jobs = await svc.call('jobs.list', {})
    expect(jobs.length - jobs0).toBe(1)
    expect(jobs[0]!.kind).toBe('refetch')
    expect(jobs[0]!.total).toBe(10) // F: と M: が 5 銘柄ずつ
    expect((await svc.call('user.load', {})).settings.userInstruments).toEqual(['1001', '1002', '1003', '1004', '1005'])
  })
  it('renderer の古い設定を保存しても、Core が足した銘柄は消えない', async () => {
    const s = (await svc.call('user.load', {})).settings
    await svc.call('user.saveSettings', { settings: { ...s, userInstruments: [], density: 'compact' } })
    const after = (await svc.call('user.load', {})).settings
    expect(after.density).toBe('compact')
    expect(after.userInstruments).toHaveLength(5)
  })
})
