// 時間の経過（docs/test-plan.md §4 の T）: 基準日時（金曜の大引けのあと）から次の営業日の大引けのあとに進め、日々の更新で 1 日分だけ進む（FR-F9, FR-T）
import { afterAll, describe, expect, it, vi } from 'vitest'
import { makeCore, runJob } from '../../support/core'

const core = makeCore()
const { call } = core
afterAll(() => {
  vi.useRealTimers()
  return core.dispose()
})

describe('次の営業日の更新（FR-F9, FR-T1）', () => {
  it('週末をまたいで月曜の大引けのあとに更新すると、基準日が月曜になり、日足が 1 本だけ増える', async () => {
    const before = (await call('metrics.get', { ids: ['JP:7203'] }))[0]!
    const bars0 = await call('bars.get', { id: 'JP:7203', tf: 'D' })
    expect(before.asOf).toBe('2026-11-13')
    // 2026-11-16（月）18:00 JST。Date だけを進め、タイマーは止めない（ジョブが進むように）
    vi.useFakeTimers({ toFake: ['Date'], now: Date.parse('2026-11-16T18:00:00+09:00'), shouldAdvanceTime: true })
    await runJob(core, 'daily')
    const after = (await call('metrics.get', { ids: ['JP:7203'] }))[0]!
    const bars1 = await call('bars.get', { id: 'JP:7203', tf: 'D' })
    expect(after.asOf).toBe('2026-11-16')
    expect(bars1.time.length - bars0.time.length).toBe(1)
    expect(bars1.time.at(-1)).toBe('2026-11-16')
    vi.useRealTimers()
  })
})
