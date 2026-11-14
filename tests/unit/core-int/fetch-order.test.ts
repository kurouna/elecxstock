// 取得の順番（FR-F8）: 日々の更新でも、指数・ウォッチリスト・保有の銘柄の気配を先に取る（すぐに新しい値を見られるように）
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStubProvider } from '@core/providers/stub'
import { CoreService } from '@core/service'
import { afterAll, describe, expect, it } from 'vitest'

const dir = mkdtempSync(join(tmpdir(), 'elecxstock-order-'))
const calls: string[][] = []
/** 気配（Q）と日足（H）の呼び出しの順 */
const log: string[] = []
const stub = createStubProvider()
// 気配は 3 銘柄ずつ（並びの違いがバッチの順番に出るように）
const provider = {
  ...stub,
  quoteBatchSize: 3,
  fetchQuotes: (symbols: string[], o: Parameters<typeof stub.fetchQuotes>[1]) => {
    calls.push([...symbols])
    log.push('Q')
    return stub.fetchQuotes(symbols, o)
  },
  fetchHistory: (symbol: string, o: Parameters<typeof stub.fetchHistory>[1]) => {
    if (o.interval === '1d') log.push(`H:${symbol}`)
    return stub.fetchHistory(symbol, o)
  },
}
const svc = new CoreService(dir, provider, () => {}, 'test')
afterAll(() => {
  svc.close()
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    /* Windows では閉じた直後に消せないことがある */
  }
})
const idle = async () => {
  for (let i = 0; i < 500 && (await svc.call('jobs.list', {})).some((j) => j.status !== 'done' && j.status !== 'failed'); i++)
    await new Promise((r) => setTimeout(r, 20))
}

describe('日々の更新の順番（FR-F8, FR-F9）', () => {
  it('指数のあと、ウォッチリストと保有の銘柄の気配を先に取る', async () => {
    // コード順では後ろの銘柄を選ぶ（9434・8951 はウォッチリスト、9432 は保有）。
    // ウォッチリストは一覧を取り込む前に入れておく（入れたときの取得のジョブを出さず、日々の更新で初めて日足を取る）
    const u = await svc.call('user.load', {})
    const lists = u.watchlists.map((w, i) => (i === 0 ? { ...w, items: ['JP:9434', 'JP:8951'] } : w))
    await svc.call('user.saveWatchlists', { watchlists: lists })
    await svc.call('jobs.start', { kind: 'universe' })
    await idle()
    await svc.call('portfolio.save', { holdings: [{ code: '9432', account: 'tokutei', quantity: 100, avgCost: 1000 }] })
    await idle()
    calls.length = 0
    log.length = 0
    await svc.call('jobs.start', { kind: 'daily' })
    await idle()
    const order = calls.flat()
    expect(order.length).toBeGreaterThan(10)
    expect(order[0]).toBe('^N225')
    expect(new Set(order.slice(1, 4))).toEqual(new Set(['9434.T', '8951.T', '9432.T']))
    // 残りはこれまでどおりコード順で、すべて 1 回ずつ
    expect(new Set(order).size).toBe(order.length)
    // 気配のあとの日足の取り直し（ここでは日足が無いので全期間）も、その銘柄の分は次のバッチより先に
    const q3 = log.indexOf('Q', log.indexOf('Q', log.indexOf('Q') + 1) + 1) // 3 つめのバッチ
    for (const s of ['9434.T', '8951.T']) {
      expect(log.indexOf(`H:${s}`)).toBeGreaterThan(0)
      expect(log.indexOf(`H:${s}`)).toBeLessThan(q3)
    }
  })
})
