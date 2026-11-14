// 10 年分の配当の記録（月次の系列の取得で入る）と指標（FR-I1・連続増配の年数）。スタブのプロバイダ（架空の値）。
// - 月次の系列を取ったら、その銘柄の指標を作り直す（初回の取得では指標の再計算 X のあとに月次の系列 M が動くため）
// - 分割の無い全期間の取り直し（F）で、日足の保存期間より前の配当を消さない
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { addYears, jstNow } from '@core/calendar'
import { divYears } from '@core/metrics'
import { createStubProvider } from '@core/providers/stub'
import { CoreService } from '@core/service'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const dir = mkdtempSync(join(tmpdir(), 'elecxstock-divhist-'))
const svc = new CoreService(dir, createStubProvider(), () => {}, 'test')
const idle = async () => {
  for (let i = 0; i < 600 && (await svc.call('jobs.list', {})).some((j) => j.status !== 'done' && j.status !== 'failed'); i++)
    await new Promise((r) => setTimeout(r, 20))
}
beforeAll(async () => {
  await svc.call('jobs.start', { kind: 'initial' })
  await idle()
}, 60_000)
afterAll(() => {
  svc.close()
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    /* Windows では閉じた直後に消せないことがある */
  }
})
const ID = 'JP:2914'
const retentionStart = () => addYears(jstNow().date, -5)

describe('10 年分の配当の記録と指標', () => {
  it('初回の取得のあと、連続増配の年数は日足より前の配当の記録も使って数えてある', async () => {
    const r = svc.repo
    const divs = r.dividends(ID)
    expect(divs.some((d) => d.date < retentionStart())).toBe(true) // 月次の系列で古い配当が入っている
    const m = (await svc.call('metrics.get', { ids: [ID] }))[0]!
    const want = divYears(divs, m.asOf!, r.firstDaily(ID)!)
    expect(m.divNoCutYears).toBe(want.divNoCutYears)
    expect(m.divUpYears).toBe(want.divUpYears)
  })
  it('分割の無い全期間の取り直しで、日足の保存期間より前の配当を消さない', async () => {
    const before = svc.repo.dividends(ID).filter((d) => d.date < retentionStart()).length
    expect(before).toBeGreaterThan(0)
    await svc.call('jobs.refetch', { ids: [ID] })
    await idle()
    expect(svc.repo.dividends(ID).filter((d) => d.date < retentionStart()).length).toBe(before)
  })
})
