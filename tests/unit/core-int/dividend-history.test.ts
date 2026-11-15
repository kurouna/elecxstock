import { addYears, jstNow } from '@core/calendar'
import { divYears } from '@core/metrics'
import { afterAll, describe, expect, it } from 'vitest'
import { makeCore } from '../../support/core'

const core = makeCore()
const { svc, call, idle } = core
afterAll(() => core.dispose())

const ID = 'JP:2914'
const retentionStart = () => addYears(jstNow().date, -5)

describe('10 年分の配当の記録と指標', () => {
  it('初回の取得のあと、連続増配の年数は日足より前の配当の記録も使って数えてある', async () => {
    const r = svc.repo
    const divs = r.dividends(ID)
    expect(divs.some((d) => d.date < retentionStart())).toBe(true) // 月次の系列で古い配当が入っている
    const m = (await call('metrics.get', { ids: [ID] }))[0]!
    const want = divYears(divs, m.asOf!, r.firstDaily(ID)!)
    expect(m.divNoCutYears).toBe(want.divNoCutYears)
    expect(m.divUpYears).toBe(want.divUpYears)
  })
  it('分割の無い全期間の取り直しで、日足の保存期間より前の配当を消さない', async () => {
    const before = svc.repo.dividends(ID).filter((d) => d.date < retentionStart()).length
    expect(before).toBeGreaterThan(0)
    await call('jobs.refetch', { ids: [ID] })
    await idle()
    expect(svc.repo.dividends(ID).filter((d) => d.date < retentionStart()).length).toBe(before)
  })
})
