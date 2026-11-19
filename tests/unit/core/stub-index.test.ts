// スタブのプロバイダの指数（架空の日経平均）: 時刻が進めば、その日までの足を返す（ほかの銘柄と同じく日付ごとに作る。docs/testing.md §3, FR-U6）
import { createStubProvider } from '@core/providers/stub'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => vi.useRealTimers())

describe('スタブの指数の足（FR-U6）', () => {
  it('基準日時から 1 週間進めると、最後の足も 1 週間進む。株の足とそろう', async () => {
    const p = createStubProvider()
    const last = async (s: string) =>
      (await p.fetchHistory(s, { from: '2026-10-01', interval: '1d', signal: new AbortController().signal })).bars.at(-1)?.d
    expect(await last('^N225')).toBe('2026-11-13')
    vi.useFakeTimers({ toFake: ['Date'], now: Date.parse('2026-11-20T18:00:00+09:00'), shouldAdvanceTime: true })
    expect(await last('7203.T')).toBe('2026-11-20')
    expect(await last('^N225')).toBe('2026-11-20')
  })
})
