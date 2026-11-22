// パフォーマンス比較: bars.get の結果の divFrom（配当の記録の始まり。docs/design-perf.md §3.4。L3）。値はスタブの架空の値
import { addYears, jstNow, retentionStart, toJstDate } from '@shared/calendar'
import { afterAll, describe, expect, it } from 'vitest'
import { makeCore } from '../../support/core'

const core = makeCore()
const { call } = core
afterAll(() => core.dispose())

describe('FR-PC5 FR-PC6 bars.get の divFrom と monthlyFetched', () => {
  it('月次系列を取る前は日足の保存期間の始まり、取ったあとは取った日の 10 年前（日・週・月のどれでも同じ）', async () => {
    const id = 'JP:8058'
    const today = jstNow().date
    const years = (await call('user.load', {})).settings.retentionYears
    core.svc.repo.db.run('UPDATE fetch_state SET last_monthly = NULL WHERE id = ?', id)
    core.svc.repo.db.run('DELETE FROM monthly_bars WHERE id = ?', id)
    const before = await call('bars.get', { id, tf: 'D' })
    expect(before.divFrom).toBe(retentionStart(today, years))
    expect(before.monthlyFetched).toBe(false)
    // 'M' を読むと月次系列の取得を積む
    await call('bars.get', { id, tf: 'M' })
    await core.idle()
    const lm = core.svc.repo.fetchState(id).lastMonthly
    expect(lm).toBeTruthy()
    const fetched = toJstDate(new Date(lm!))
    const want = addYears([fetched, today].sort()[0]!, -10)
    for (const tf of ['D', 'W', 'M'] as const) {
      const r = await call('bars.get', { id, tf, adjustment: 'total' })
      expect(r.divFrom).toBe(want)
      expect(r.monthlyFetched).toBe(true)
    }
  })
})
