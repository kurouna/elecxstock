// 取りこぼしの確認（FR-F9）: 日々の更新の最後に 1 回だけ、気配の取れなかった銘柄と日足の欠けた銘柄を取り直す
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStubProvider } from '@core/providers/stub'
import { ProviderError } from '@core/providers/types'
import { CoreService } from '@core/service'
import { afterAll, describe, expect, it } from 'vitest'

const dir = mkdtempSync(join(tmpdir(), 'elecxstock-check-'))
const stub = createStubProvider()
/** 気配を頼んだ回数（銘柄ごと）と、日足を頼んだ回数 */
const quoted = new Map<string, number>()
const hist = new Map<string, number>()
let armed = false
let failedBatch = false
let dropped = false
let histFailed = false
const provider = {
  ...stub,
  quoteBatchSize: 3,
  fetchQuotes: async (symbols: string[], o: Parameters<typeof stub.fetchQuotes>[1]) => {
    for (const s of symbols) quoted.set(s, (quoted.get(s) ?? 0) + 1)
    const r = await stub.fetchQuotes(symbols, o)
    if (!armed) return r
    // 8058 を含むバッチは 1 回目だけ丸ごと失敗する
    if (symbols.includes('8058.T') && !failedBatch) {
      failedBatch = true
      throw new ProviderError('symbol', 'batch failed')
    }
    // 7203 は 1 回目の応答から抜ける。9433 はいつも抜ける（取り直しは 1 回だけ）
    return r.filter((q) => {
      if (q.symbol === '9433.T') return false
      if (q.symbol === '7203.T' && !dropped) {
        dropped = true
        return false
      }
      return true
    })
  },
  fetchHistory: async (symbol: string, o: Parameters<typeof stub.fetchHistory>[1]) => {
    if (armed && o.interval === '1d') {
      hist.set(symbol, (hist.get(symbol) ?? 0) + 1)
      // 6501 の日足は 1 回目だけ失敗する
      if (symbol === '6501.T' && !histFailed) {
        histFailed = true
        throw new ProviderError('symbol', 'history failed')
      }
    }
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

describe('日々の更新の最後の取りこぼしの確認', () => {
  it('取れなかった気配・欠けた日足を 1 回だけ取り直す', async () => {
    await svc.call('jobs.start', { kind: 'universe' })
    await idle()
    quoted.clear()
    armed = true
    await svc.call('jobs.start', { kind: 'daily' })
    await idle()
    // バッチごと失敗した 8058 と、応答から抜けた 7203 はもう 1 回頼む
    expect(quoted.get('8058.T')).toBe(2)
    expect(quoted.get('7203.T')).toBe(2)
    // いつも抜ける 9433 も 2 回まで（確認は 1 回だけで、繰り返さない）
    expect(quoted.get('9433.T')).toBe(2)
    // 取りこぼしの無い銘柄は 1 回だけ
    expect(quoted.get('9434.T')).toBe(1)
    // 1 回目に失敗した 6501 の日足は、最後にもう 1 回取る
    expect(hist.get('6501.T')).toBe(2)
    const m = await svc.call('metrics.get', { ids: ['JP:8058', 'JP:7203', 'JP:6501'] })
    expect(m.map((x) => x.close != null)).toEqual([true, true, true])
  })
})
