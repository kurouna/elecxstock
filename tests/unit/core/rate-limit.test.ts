// 取得のレート制御: 1 リクエストの前の待ち（jobs.ts の throttle）。時間は偽のタイマーで進める（実際には待たない）
import { JobRunner, type JobsHost, paceOf } from '@core/jobs'
import type { Provider } from '@core/providers/types'
import { createYahooProvider } from '@core/providers/yahoo'
import {
  fetchMinutes,
  firstRunEstimate,
  secondsPerRequest,
  YAHOO_INTERVAL_MS,
  YAHOO_JITTER_MS,
  YAHOO_SLOW_FOR_MS,
  YAHOO_SLOW_INTERVAL_MS,
  YAHOO_SLOW_JITTER_MS,
} from '@shared/pace'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Throttled = { throttle(signal: AbortSignal): Promise<void>; slowed: boolean; slowedAt: number }
function runner(minIntervalMs: number, jitterMs: number, slow: Partial<Provider> = {}): Throttled {
  const provider = { id: 'test', minIntervalMs, jitterMs, ...slow } as Provider
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
  it('Yahoo の間隔は src/shared/pace.ts の定数（コードで決め、設定にはしない。値を変えてもテストは変えなくてよい）', () => {
    const p = createYahooProvider()
    expect(p.minIntervalMs).toBe(YAHOO_INTERVAL_MS)
    expect(p.jitterMs).toBe(YAHOO_JITTER_MS)
  })
  it('429 のあとは遅い間隔の定数を使う（最小間隔より長いときだけ）', () => {
    const p = createYahooProvider()
    expect(p.slowIntervalMs).toBe(YAHOO_SLOW_INTERVAL_MS)
    expect(p.slowJitterMs).toBe(YAHOO_SLOW_JITTER_MS)
    expect(p.slowForMs).toBe(YAHOO_SLOW_FOR_MS)
    const fast = { minIntervalMs: 400, jitterMs: 150, slowIntervalMs: YAHOO_SLOW_INTERVAL_MS, slowJitterMs: YAHOO_SLOW_JITTER_MS }
    expect(paceOf(fast, true)).toEqual({ intervalMs: YAHOO_SLOW_INTERVAL_MS, jitterMs: YAHOO_SLOW_JITTER_MS })
    expect(paceOf(p, false)).toEqual({ intervalMs: YAHOO_INTERVAL_MS, jitterMs: YAHOO_JITTER_MS })
  })
})

describe('429 のあとの間隔（FR-F2）', () => {
  it('遅い間隔が無い・最小間隔以下なら、429 のあとも最小間隔のまま（定数を 1 秒に戻しても速くならない）', () => {
    expect(paceOf({ minIntervalMs: 400, jitterMs: 150 }, true)).toEqual({ intervalMs: 400, jitterMs: 150 })
    expect(paceOf({ minIntervalMs: 1000, jitterMs: 0, slowIntervalMs: 1000, slowJitterMs: 300 }, true)).toEqual({
      intervalMs: 1000,
      jitterMs: 0,
    })
    expect(paceOf({ minIntervalMs: 1200, jitterMs: 0, slowIntervalMs: 1000 }, true)).toEqual({ intervalMs: 1200, jitterMs: 0 })
  })
  it('遅い揺らぎが無ければ、ふだんの揺らぎを使う', () => {
    expect(paceOf({ minIntervalMs: 400, jitterMs: 150, slowIntervalMs: 1000 }, true)).toEqual({ intervalMs: 1000, jitterMs: 150 })
  })
  it('遅くしたあとは、遅い間隔だけ待つ', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const r = runner(400, 0, { slowIntervalMs: 1000, slowJitterMs: 0 })
    const signal = new AbortController().signal
    await r.throttle(signal)
    r.slowedAt = Date.now()
    expect(r.slowed).toBe(true)
    const p = r.throttle(signal)
    expect(await doneAfter(p, 999)).toBe(false)
    expect(await doneAfter(p, 1)).toBe(true)
  })
  it('遅くしてから 24 時間たったら、元の間隔に戻る', async () => {
    const r = runner(400, 0, { slowIntervalMs: 1000, slowJitterMs: 0 })
    r.slowedAt = Date.now()
    await vi.advanceTimersByTimeAsync(YAHOO_SLOW_FOR_MS - 1)
    expect(r.slowed).toBe(true)
    await vi.advanceTimersByTimeAsync(1)
    expect(r.slowed).toBe(false)
  })
})

describe('所要時間の見積もり（FR-F2・FR-FR2）', () => {
  it('1 リクエストは間隔 + 揺らぎの平均 + 書き込みなど', () => {
    expect(secondsPerRequest(400, 150)).toBeCloseTo(0.525)
    expect(secondsPerRequest(1000, 0)).toBeCloseTo(1.05)
  })
  it('分は四捨五入で、1 分未満は 1 分・0 回は 0 分', () => {
    expect(fetchMinutes(1650, 400, 150)).toBe(14)
    expect(fetchMinutes(1650, 1000, 0)).toBe(29)
    expect(fetchMinutes(10, 400, 150)).toBe(1)
    expect(fetchMinutes(0)).toBe(0)
    expect(fetchMinutes(Number.NaN)).toBe(0)
  })
  it('初回の取得の案内は定数から作る（間隔を戻せば案内も戻る）', () => {
    const e = firstRunEstimate()
    expect(e.n).toBe('1,650')
    expect(e.req).toBe('3,300')
    expect(e.min).toBe(fetchMinutes(1650))
    expect(e.monthlyMin).toBe(e.min)
    expect(e.sec).toBe(String(Math.round((YAHOO_INTERVAL_MS + YAHOO_JITTER_MS / 2) / 100) / 10))
  })
})
