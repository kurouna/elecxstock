// 取り直しの規則（CLAUDE.md「守ること」）: 取得に成功してから置き換える（FR-S11）、分割を見つけたら全期間を取り直す（FR-D3）、
// 銘柄を指定した取り直し（FR-S7）。スタブを包んで、失敗と新しい分割を起こす（値はすべて架空）
import { createStubProvider } from '@core/providers/stub'
import type { Provider } from '@core/providers/types'
import { afterAll, describe, expect, it } from 'vitest'
import { makeCore } from '../../support/core'

const stub = createStubProvider()
let mode: 'ok' | 'fail' | 'split' = 'ok'
const SPLIT = '2026-11-10'
const provider: Provider = {
  ...stub,
  minIntervalMs: 0,
  jitterMs: 0,
  async fetchHistory(symbol, opt) {
    if (symbol === '8058.T' && mode === 'fail') throw Object.assign(new Error('network down'), { kind: 'network' })
    const r = await stub.fetchHistory(symbol, opt)
    if (symbol !== '8058.T' || mode !== 'split' || opt.interval !== '1d') return r
    // 架空の 1:2 の分割: 分割の前の値（分割調整済み）は半分になる
    return {
      ...r,
      bars: r.bars.map((b) => (b.d < SPLIT ? { ...b, o: b.o / 2, h: b.h / 2, l: b.l / 2, c: b.c / 2 } : b)),
      splits: [...r.splits, { date: SPLIT, ratio: 2 }],
    }
  },
}
const core = makeCore({ provider })
const { call } = core
afterAll(() => core.dispose())
const closes = async () => (await call('bars.get', { id: 'JP:8058', tf: 'D' })).close

describe('取り直し（FR-S7, S11, FR-D3）', () => {
  it('取り直しに失敗したら、前のデータをそのまま残す（FR-S11）', async () => {
    const before = await closes()
    mode = 'fail'
    await call('jobs.refetch', { ids: ['JP:8058'] })
    await core.idle()
    expect(await closes()).toEqual(before)
    expect((await call('data.failures', {})).some((f) => f.id === 'JP:8058')).toBe(true)
  })
  it('取り直しで新しい分割が見つかれば、全期間を新しい基準に置き換え、月次の系列も取り直す（FR-D3）', async () => {
    const before = await closes()
    const t = (await call('bars.get', { id: 'JP:8058', tf: 'D' })).time
    mode = 'split'
    await call('jobs.refetch', { ids: ['JP:8058'] })
    await core.idle()
    const after = await call('bars.get', { id: 'JP:8058', tf: 'D' })
    expect(after.splits.some((s) => s.date === SPLIT && s.ratio === 2)).toBe(true)
    const i = t.findIndex((d) => d >= '2026-11-02')
    expect(after.close[i]! / before[i]!).toBeCloseTo(0.5, 6) // 分割の前は半分（分割調整済み）
    expect(after.close.at(-1)).toBeCloseTo(before.at(-1)!, 6) // 分割の後は同じ
    // 月次の系列の取り直しのジョブが続けて走った（月足も新しい基準）
    const m = await call('bars.get', { id: 'JP:8058', tf: 'M', adjustment: 'unadjusted' })
    expect(m.close.length).toBeGreaterThan(12)
    const jobs = await call('jobs.list', {})
    expect(jobs.some((j) => j.kind === 'refetch' && j.status === 'done')).toBe(true)
    mode = 'ok'
  })
})
