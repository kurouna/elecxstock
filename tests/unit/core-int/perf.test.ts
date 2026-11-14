// 性能（NFR-P2）: ローカルにある銘柄のチャートの切り替え（日足 5 年 + 週・月の集計込み）が 100ms 以内。種の DB（既定の保存期間 5 年）で測る
import { afterAll, describe, expect, it } from 'vitest'
import { makeCore } from '../../support/core'

const core = makeCore()
const { call } = core
afterAll(() => core.dispose())

describe('チャートの切り替え（NFR-P2）', () => {
  it('日足・週足・月足（分割調整・未調整・配当込み）を 1 銘柄ずつ 100ms 以内', async () => {
    const ids = ['JP:7203', 'JP:8058', 'JP:9434', 'JP:8951']
    // 温める（最初の 1 回は SQL の準備を含む）
    await call('bars.get', { id: ids[0]!, tf: 'D' })
    const times: number[] = []
    for (const id of ids)
      for (const tf of ['D', 'W', 'M'] as const)
        for (const adjustment of ['split', 'unadjusted', 'total'] as const) {
          const t0 = performance.now()
          const r = await call('bars.get', { id, tf, adjustment })
          times.push(performance.now() - t0)
          expect(r.close.length).toBeGreaterThan(10)
        }
    times.sort((a, b) => a - b)
    expect(times.at(-1)!).toBeLessThan(100)
  })
})
