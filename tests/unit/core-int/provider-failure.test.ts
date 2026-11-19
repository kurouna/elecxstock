// 取得の失敗の記録（FR-F7）と、プロバイダが取れなくなったときの振る舞い（NFR-R3）。
// スタブを包んで失敗を起こし、Core のログ（worker がファイルに書く関数）を受け取って見る（値はすべて架空）
import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStubProvider } from '@core/providers/stub'
import { type Provider, ProviderError } from '@core/providers/types'
import { CoreService } from '@core/service'
import type { Method, Params, Results } from '@shared/api'
import { afterAll, afterEach, describe, expect, inject, it, vi } from 'vitest'

/** 失敗のしかた: なし・8306 の日足だけ（銘柄単位）・全部（銘柄単位の例外）・全部（プロバイダ単位の 503）・通信断 */
let mode: 'ok' | 'one' | 'all' | 'provider' | 'offline' = 'ok'
const stub = createStubProvider()
const provider: Provider = {
  ...stub,
  async fetchHistory(symbol, opt) {
    if (mode === 'offline') throw new ProviderError('offline', '架空の通信断: getaddrinfo ENOTFOUND')
    if (mode === 'one' && symbol === '8306.T') throw new Error('架空の失敗: No data found for 8306.T')
    if (mode === 'all') throw new Error('架空の障害: socket hang up')
    if (mode === 'provider') throw new ProviderError('provider', '架空の障害: HTTP 503 Service Unavailable', 503)
    return stub.fetchHistory(symbol, opt)
  },
  async fetchQuotes(symbols, opt) {
    if (mode === 'offline') throw new ProviderError('offline', '架空の通信断: getaddrinfo ENOTFOUND')
    if (mode === 'all') throw new Error('架空の障害: socket hang up')
    if (mode === 'provider') throw new ProviderError('provider', '架空の障害: HTTP 503 Service Unavailable', 503)
    return stub.fetchQuotes(symbols, opt)
  },
}

// 種の DB の写しで、ログを受け取る Core を作る（tests/support/core.ts の makeCore はログを受け取らないため）
const dir = mkdtempSync(join(tmpdir(), 'elecxstock-fail-'))
cpSync(inject('seedDir'), dir, { recursive: true })
const logs: string[] = []
const events: { event: string; data: unknown }[] = []
const svc = new CoreService(
  dir,
  provider,
  (event, data) => events.push({ event, data }),
  'test',
  (m) => logs.push(m),
)
const call = async <M extends Method>(method: M, params: Params<M>): Promise<Results[M]> =>
  structuredClone(await svc.call(method, structuredClone(params)))
const idle = async () => {
  for (let i = 0; i < 3000; i++) {
    const jobs = await call('jobs.list', {})
    if (jobs.every((j) => j.status === 'done' || j.status === 'failed' || j.status === 'cancelled')) return
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error('jobs not idle')
}
afterEach(() => {
  mode = 'ok'
})
afterAll(async () => {
  vi.useRealTimers()
  await svc.shutdown().catch(() => {})
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    /* Windows では閉じた直後に消せないことがある */
  }
})

describe('取得失敗の記録（FR-F7）', () => {
  it('失敗した銘柄と理由を記録し、jobs ペインの API（data.failures・jobs.list）で見られる', async () => {
    mode = 'one'
    const id = await call('jobs.refetch', { ids: ['JP:8306', 'JP:8316'] })
    await idle()
    const job = (await call('jobs.list', {})).find((j) => j.id === id)!
    expect(job.status).toBe('done')
    expect(job.failed).toBe(1)
    const f = await call('data.failures', {})
    const mine = f.filter((x) => x.id === 'JP:8306')
    expect(mine).toHaveLength(1)
    expect(mine[0]!.reason).toContain('No data found')
    expect(Number.isFinite(Date.parse(mine[0]!.at))).toBe(true)
    // 成功した銘柄は記録しない
    expect(f.some((x) => x.id === 'JP:8316')).toBe(false)
    expect((await call('data.status', {})).failures).toBeGreaterThanOrEqual(1)
  })
  it('次に取得に成功すれば、失敗の記録から外れる', async () => {
    await call('jobs.refetch', { ids: ['JP:8306'] })
    await idle()
    expect((await call('data.failures', {})).some((x) => x.id === 'JP:8306')).toBe(false)
  })
})

/** 閲覧・スクリーニングの結果（比べるための写し） */
const browse = async () => ({
  bars: await call('bars.get', { id: 'JP:7203', tf: 'D' }),
  metrics: await call('metrics.get', { ids: ['JP:7203', 'JP:8058', 'JP:8951'] }),
  quotes: await call('quotes.get', { ids: ['JP:7203'] }),
  screen: (
    await call('screener.run', {
      conditions: [{ field: 'income.yield', op: '>=', value: 3 }],
      favorites: [],
      watchlists: {},
    })
  ).ids,
})

describe('プロバイダが取れないとき（NFR-R3）', () => {
  it('すべての取得が失敗しても、既存のデータでの閲覧・スクリーニングは変わらず、原因がログに出る', async () => {
    const before = await browse()
    expect(before.screen.length).toBeGreaterThan(0)
    mode = 'all'
    logs.length = 0
    await call('jobs.start', { kind: 'daily' })
    await idle()
    const after = await browse()
    expect(after.bars.time).toEqual(before.bars.time)
    expect(after.bars.close).toEqual(before.bars.close)
    expect(after.metrics.map((m) => [m.id, m.asOf, m.close, m.yieldTrailing])).toEqual(
      before.metrics.map((m) => [m.id, m.asOf, m.close, m.yieldTrailing]),
    )
    expect(after.quotes).toEqual(before.quotes)
    expect(after.screen).toEqual(before.screen)
    expect(logs.some((l) => l.includes('socket hang up'))).toBe(true)
  })

  // プロバイダ単位の失敗（429・5xx）はバックオフで待つ（2→4→8→16→32 秒、5 回続くと 10 分止める）。setTimeout だけを偽にして進める
  let jobId = 0
  it('プロバイダ単位の失敗で取得が止まっている間も、閲覧・スクリーニングは続けられ、止まった原因が通知される', async () => {
    const before = await browse()
    mode = 'provider'
    events.length = 0
    logs.length = 0
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    jobId = await call('jobs.start', { kind: 'daily' })
    const paused = () => events.some((e) => e.event === 'provider.state' && (e.data as { paused: boolean }).paused)
    for (let i = 0; i < 100 && !paused(); i++) {
      await vi.advanceTimersByTimeAsync(5_000)
      await new Promise((r) => setImmediate(r))
    }
    expect(paused()).toBe(true)
    const st = events.find((e) => e.event === 'provider.state' && (e.data as { paused: boolean }).paused)!.data as {
      message?: string
    }
    expect(st.message).toContain('503')
    // 一覧の読み直し（jobs.list）でも止まっていることがわかる（知らせだけでなく DB にも残す）
    expect((await call('jobs.list', {})).find((j) => j.id === jobId)?.status).toBe('provider-paused')
    // 止まっている間の閲覧・スクリーニング
    const during = await browse()
    expect(during.bars.close).toEqual(before.bars.close)
    expect(during.metrics.map((m) => m.close)).toEqual(before.metrics.map((m) => m.close))
    expect(during.screen).toEqual(before.screen)
  })
  it('プロバイダ単位の失敗で止まった原因がログに出る', () => {
    expect(logs.some((l) => l.includes('503'))).toBe(true)
  })
  it('止めた取得は取り消せる（後片付け）', async () => {
    await call('jobs.cancel', { id: jobId })
    vi.useRealTimers()
    await idle()
    expect((await call('jobs.list', {})).find((j) => j.id === jobId)?.status).toBe('cancelled')
  })

  // 通信断は 30 秒ごとに試し直す。ログには切れたときと戻ったときに 1 回ずつ書く（試し直すたびには書かない）
  it('通信断になったこと・戻ったことがログに出る', async () => {
    mode = 'offline'
    logs.length = 0
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const id = await call('jobs.start', { kind: 'daily' })
    const offline = () => logs.filter((l) => l.startsWith('offline'))
    for (let i = 0; i < 100 && offline().length === 0; i++) {
      await vi.advanceTimersByTimeAsync(1_000)
      await new Promise((r) => setImmediate(r))
    }
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(30_000)
      await new Promise((r) => setImmediate(r))
    }
    expect(offline()).toHaveLength(1)
    expect(offline()[0]).toContain('ENOTFOUND')
    expect((await call('jobs.list', {})).find((j) => j.id === id)?.status).toBe('waiting-offline')
    mode = 'ok'
    for (let i = 0; i < 20 && !logs.includes('online again'); i++) {
      await vi.advanceTimersByTimeAsync(30_000)
      await new Promise((r) => setImmediate(r))
    }
    expect(logs.filter((l) => l === 'online again')).toHaveLength(1)
    expect((await call('jobs.list', {})).find((j) => j.id === id)?.status).not.toBe('waiting-offline')
    await call('jobs.cancel', { id })
    vi.useRealTimers()
    await idle()
  })
})
