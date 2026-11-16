// 大引け後の仮の足（FR-D8）と、指標の基準日・仮の印（FR-S13）。
// スタブを包んで、当日の日足がまだ無い（Yahoo が終値を空で返す）状態と、大引け前の時刻の気配を作る（値はすべて架空）
import { createStubProvider } from '@core/providers/stub'
import type { Provider } from '@core/providers/types'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { makeCore, runJob } from '../../support/core'

/** 基準日時（TEST_NOW）の日。金曜で、直近の取引日 */
const TODAY = '2026-11-13'
/** 当日の日足をまだ返さない銘柄 */
const HIDE = new Set(['8058.T', '8001.T'])
let hide = true
const stub = createStubProvider()
const provider: Provider = {
  ...stub,
  async fetchHistory(symbol, opt) {
    const r = await stub.fetchHistory(symbol, opt)
    if (!hide || !HIDE.has(symbol) || opt.interval !== '1d') return r
    return { ...r, bars: r.bars.filter((b) => b.d < TODAY) }
  },
  async fetchQuotes(symbols, opt) {
    const qs = await stub.fetchQuotes(symbols, opt)
    // 8001 は大引けの 1 分前（15:29）の気配（場中の値）。ほかはスタブのまま 15:30（大引けちょうど）
    return qs.map((q) => (q.symbol === '8001.T' ? { ...q, time: Date.parse(`${TODAY}T15:29:00+09:00`) } : q))
  },
}
const core = makeCore({ provider })
const { call } = core
afterAll(() => core.dispose())

beforeAll(async () => {
  // 種の DB から当日の日足を消し、日々の更新で気配から補えるかを見る
  core.svc.repo.db.run(`DELETE FROM daily_bars WHERE id IN ('JP:8058', 'JP:8001') AND d >= ?`, TODAY)
  await runJob(core, 'daily')
})

const quote = async (id: string) => (await call('quotes.get', { ids: [id] }))[0]!
const metric = async (id: string) => (await call('metrics.get', { ids: [id] }))[0]!

describe('大引け後の仮の足（FR-D8）', () => {
  it('気配の時刻が大引け（15:30）以降なら、当日の足を気配の値で補い「仮」の印を付ける', async () => {
    const b = await call('bars.get', { id: 'JP:8058', tf: 'D' })
    const q = await quote('JP:8058')
    expect(b.time.at(-1)).toBe(TODAY)
    expect(b.provisional).toEqual([b.time.length - 1])
    expect(b.close.at(-1)).toBe(q.price)
    expect(b.open.at(-1)).toBe(q.open)
  })
  it('気配の時刻が大引けより前（15:29）なら、当日の足を作らない（場中の値は日足に保存しない）', async () => {
    const b = await call('bars.get', { id: 'JP:8001', tf: 'D' })
    expect(b.time.at(-1)).toBe('2026-11-12')
    expect(b.provisional).toEqual([])
    // 気配そのものは保存している（画面に「途中」として出すため）
    expect((await quote('JP:8001')).price).not.toBeNull()
  })
  it('仮の足は週足の集計と指標（metrics）の計算に含める', async () => {
    const q = await quote('JP:8058')
    const w = await call('bars.get', { id: 'JP:8058', tf: 'W' })
    expect(w.close.at(-1)).toBe(q.price)
    const m = await metric('JP:8058')
    expect(m.close).toBe(q.price)
  })
  it('次の日足の取得で、仮の足を本物の足に置き換える', async () => {
    hide = false
    await call('jobs.refetch', { ids: ['JP:8058'] })
    await core.idle()
    const b = await call('bars.get', { id: 'JP:8058', tf: 'D' })
    expect(b.time.at(-1)).toBe(TODAY)
    expect(b.provisional).toEqual([])
    expect((await metric('JP:8058')).provisional).toBe(false)
    hide = true
  })
})

describe('指標の基準日と仮の印（FR-S13）', () => {
  it('各行に基準日（asOf）と仮の印を持ち、終値・利回りは日足の基準日の値', async () => {
    const m = await metric('JP:7203')
    expect(m.asOf).toBe(TODAY)
    expect(m.provisional).toBe(false)
    const b = await call('bars.get', { id: 'JP:7203', tf: 'D' })
    expect(m.close).toBe(b.close[b.time.indexOf(m.asOf!)])
    expect(m.yieldTrailing).toBeCloseTo((m.div12! / m.close!) * 100, 9)
    // 気配で補った仮の足が基準の行は、仮の印が付く（FR-D8 の仮の足を、置き換える前に作り直して見る）
    core.svc.repo.db.run(`DELETE FROM daily_bars WHERE id = 'JP:8058' AND d >= ?`, TODAY)
    await runJob(core, 'daily')
    const p = await metric('JP:8058')
    expect(p.asOf).toBe(TODAY)
    expect(p.provisional).toBe(true)
  })
  it('PER・PBR は気配の値（日足の基準日が古くても、気配の時刻の値を使う）', async () => {
    const m = await metric('JP:8001')
    const q = await quote('JP:8001')
    expect(m.asOf).toBe('2026-11-12')
    expect(q.time! > m.asOf!).toBe(true) // 気配の時刻は日足の基準日より新しい
    expect(m.per).toBe(q.per)
    expect(m.pbr).toBe(q.pbr)
  })
  it('基準日が直近の営業日より古い行には印（stale）が付き、スクリーナーの結果の行にも出る', async () => {
    expect((await metric('JP:8001')).stale).toBe(true)
    expect((await metric('JP:7203')).stale).toBe(false)
    const r = await call('screener.run', {
      conditions: [{ field: 'price.close', op: '>=', value: 0 }],
      favorites: [],
      watchlists: {},
    })
    const row = r.rows.find((x) => x.id === 'JP:8001')
    expect(row?.stale).toBe(true)
    expect(r.rows.find((x) => x.id === 'JP:7203')?.stale).toBe(false)
  })
  it('基準日の古い行も、スクリーナーの結果からは外さない（薄く表示するだけ）', async () => {
    const r = await call('screener.run', {
      conditions: [{ field: 'price.close', op: '>=', value: 0 }],
      favorites: [],
      watchlists: {},
    })
    expect(r.ids).toContain('JP:8001')
  })
})
