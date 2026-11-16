// 取得のレート制御: 1 リクエストの前の待ち（jobs.ts の throttle）。時間は偽のタイマーで進める（実際には待たない）
import { JobRunner, type JobsHost } from '@core/jobs'
import type { Provider } from '@core/providers/types'
import { createYahooProvider } from '@core/providers/yahoo'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Throttled = { throttle(signal: AbortSignal): Promise<void> }
function runner(minIntervalMs: number, jitterMs: number): Throttled {
  const provider = { id: 'test', minIntervalMs, jitterMs } as Provider
  return new JobRunner({ provider } as JobsHost) as unknown as Throttled
}
/** throttle が終わったか（偽のタイマーを ms 進めたあと） */
async function doneAfter(p: Promise<void>, ms: number): Promise<boolean> {
  let done = false
  void p.then(() => {
    done = true
  })
  await vi.advanceTimersByTimeAsync(ms)
  return done
}

beforeEach(() => {
  vi.useFakeTimers({ now: Date.parse('2026-11-13T18:00:00+09:00') })
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('リクエストの最小間隔と揺らぎ（FR-F2）', () => {
  it('Yahoo の既定は最小間隔 1.0 秒 + 揺らぎ', () => {
    const p = createYahooProvider()
    expect(p.minIntervalMs).toBe(1000)
    expect(p.jitterMs).toBeGreaterThan(0)
  })
  it('最初のリクエストは待たない。次は前のリクエストから最小間隔だけ待つ', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const r = runner(1000, 300)
    const signal = new AbortController().signal
    expect(await doneAfter(r.throttle(signal), 0)).toBe(true)
    const second = r.throttle(signal)
    expect(await doneAfter(second, 999)).toBe(false)
    expect(await doneAfter(second, 1)).toBe(true)
  })
  it('揺らぎの分だけ待ちが延びる（最小間隔 + 揺らぎ × 乱数）', async () => {
    const r = runner(1000, 300)
    const signal = new AbortController().signal
    await r.throttle(signal)
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const p = r.throttle(signal)
    expect(await doneAfter(p, 1149)).toBe(false)
    expect(await doneAfter(p, 1)).toBe(true)
  })
  it('前のリクエストから最小間隔が過ぎていれば待たない', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const r = runner(1000, 0)
    const signal = new AbortController().signal
    await r.throttle(signal)
    await vi.advanceTimersByTimeAsync(5000)
    expect(await doneAfter(r.throttle(signal), 0)).toBe(true)
  })
  it('間隔はプロバイダごとの値に従う', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const r = runner(250, 0)
    const signal = new AbortController().signal
    await r.throttle(signal)
    const p = r.throttle(signal)
    expect(await doneAfter(p, 249)).toBe(false)
    expect(await doneAfter(p, 1)).toBe(true)
  })
  it('待っている間に止められたら待ちをやめる', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const r = runner(1000, 0)
    const ac = new AbortController()
    await r.throttle(ac.signal)
    const p = r.throttle(ac.signal)
    ac.abort()
    await expect(p).rejects.toThrow('aborted')
  })
  it('Yahoo の間隔は 1.0 秒 + 0〜0.3 秒の揺らぎ（コードで決め、設定にはしない）', () => {
    const p = createYahooProvider()
    expect(p.minIntervalMs).toBe(1000)
    expect(p.jitterMs).toBe(300)
  })
})
