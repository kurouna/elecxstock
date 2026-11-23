// 利回りの変化の内訳: info.extra の yieldPath（docs/design-yield-breakdown.md §3.1。L3）。値はスタブの架空の値
import { afterAll, describe, expect, it, vi } from 'vitest'
import { makeCore } from '../../support/core'

const core = makeCore()
const { call } = core
afterAll(() => core.dispose())

describe('FR-I11 info.extra の yieldPath', () => {
  it('月ごとの点（古い順・月は重ならない）。今の点の利回りは指標の実績利回りと同じ', async () => {
    for (const id of ['JP:8058', 'JP:8951']) {
      const x = await call('info.extra', { id })
      const p = x.yieldPath!
      expect(p.length, id).toBeGreaterThan(24)
      expect(p.map((q) => q.m)).toEqual([...p.map((q) => q.m)].sort())
      expect(new Set(p.map((q) => q.m)).size).toBe(p.length)
      const now = p.at(-1)!
      const [m] = await call('metrics.get', { ids: [id] })
      expect((now.div12 / now.price) * 100, id).toBeCloseTo(m!.yieldTrailing!, 6)
      expect(now.d).toBe(m!.asOf)
    }
  })
  it('無配に転じた 8002 は今の 12 か月の配当が 0。上場 12 か月未満の 1605 は点が無い', async () => {
    const a = (await call('info.extra', { id: 'JP:8002' })).yieldPath!
    expect(a.at(-1)!.div12).toBe(0)
    expect(a.some((q) => q.div12 > 0)).toBe(true)
    const b = (await call('info.extra', { id: 'JP:1605' })).yieldPath
    expect(b === null || b.length === 0).toBe(true)
  })
  it('月次系列が無いときは日足の範囲だけで出し、取得をこの起動で 1 回だけ頼む', async () => {
    const id = 'JP:8306'
    core.svc.repo.db.run('DELETE FROM monthly_bars WHERE id = ?', id)
    core.svc.repo.db.run('UPDATE fetch_state SET last_monthly = NULL WHERE id = ?', id)
    const spy = vi.spyOn(core.svc.jobs, 'enqueue')
    const x = await call('info.extra', { id })
    await call('info.extra', { id })
    await call('info.extra', { id })
    const asks = spy.mock.calls.filter(([, items]) => items.includes(`M:${id}`))
    expect(asks).toHaveLength(1)
    spy.mockRestore()
    // 日足の保存期間（既定 3 年）の分だけ: 点はおよそ 2 年分
    const p = x.yieldPath!
    expect(p.length).toBeGreaterThan(12)
    expect(p.length).toBeLessThan(30)
  })
  it('月足のチャートが月次系列を頼んでいれば、重ねて頼まない', async () => {
    const id = 'JP:8058'
    core.svc.repo.db.run('DELETE FROM monthly_bars WHERE id = ?', id)
    core.svc.repo.db.run('UPDATE fetch_state SET last_monthly = NULL WHERE id = ?', id)
    const spy = vi.spyOn(core.svc.jobs, 'enqueue')
    await call('bars.get', { id, tf: 'M' })
    await call('info.extra', { id })
    expect(spy.mock.calls.filter(([, items]) => items.includes(`M:${id}`))).toHaveLength(1)
    spy.mockRestore()
  })
  it('ETF は分配金があれば点を出す。正の配当の記録が無い銘柄は null', async () => {
    expect((await call('info.extra', { id: 'JP:1308' })).yieldPath?.length).toBeGreaterThan(12)
    core.svc.repo.db.run("DELETE FROM actions WHERE id = ? AND type = 'div'", 'JP:1308')
    expect((await call('info.extra', { id: 'JP:1308' })).yieldPath).toBeNull()
  })
})
