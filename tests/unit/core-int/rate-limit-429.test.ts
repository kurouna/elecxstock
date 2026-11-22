// 回数の制限（429）を受けたら、24 時間は遅い間隔にする（FR-F2）。スタブを包んで 1 回だけ失敗させる（値はすべて架空）。
// バックオフの待ち（setTimeout）だけを偽にして進める
import { createStubProvider } from '@core/providers/stub'
import { type Provider, ProviderError } from '@core/providers/types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeCore, type TestCore } from '../../support/core'

const stub = createStubProvider()
/** 最初の一括気配だけ失敗させるプロバイダ。slow を省くと遅い間隔の無いプロバイダ */
function failingOnce(err: ProviderError, slow = true): Provider {
  let failed = false
  return {
    ...stub,
    ...(slow ? { slowIntervalMs: 5, slowJitterMs: 0 } : {}),
    async fetchQuotes(symbols, opt) {
      if (!failed) {
        failed = true
        throw err
      }
      return stub.fetchQuotes(symbols, opt)
    },
  }
}

/** 日々の更新を走らせ、偽の時計を進めて終わるまで待つ */
async function runDaily(core: TestCore): Promise<void> {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  const id = await core.svc.call('jobs.start', { kind: 'daily' })
  let status = ''
  for (let i = 0; i < 200 && status !== 'done'; i++) {
    status = (await core.svc.call('jobs.list', {})).find((j) => j.id === id)?.status ?? ''
    if (status === 'done') break
    await vi.advanceTimersByTimeAsync(5_000)
    await new Promise((r) => setImmediate(r))
  }
  vi.useRealTimers()
  expect(status).toBe('done')
  await core.idle()
}

let core: TestCore | null = null
afterEach(async () => {
  vi.useRealTimers()
  await core?.dispose()
  core = null
})

describe('429 で遅い間隔に落とす（FR-F2）', () => {
  it('429 を受けたら遅い間隔にし、取得は続けて終える', async () => {
    core = makeCore({ provider: failingOnce(new ProviderError('provider', '架空の Too Many Requests', 429)) })
    expect(core.svc.jobs.slowed).toBe(false)
    await runDaily(core)
    expect(core.svc.jobs.slowed).toBe(true)
    expect((await core.call('jobs.list', {}))[0]?.status).toBe('done')
  })
  it('429 でないプロバイダ単位の失敗（503）では遅くしない', async () => {
    core = makeCore({ provider: failingOnce(new ProviderError('provider', '架空の Service Unavailable', 503)) })
    await runDaily(core)
    expect(core.svc.jobs.slowed).toBe(false)
  })
  it('遅い間隔を持たないプロバイダは、429 でも遅くしない', async () => {
    core = makeCore({ provider: failingOnce(new ProviderError('provider', '架空の Too Many Requests', 429), false) })
    await runDaily(core)
    expect(core.svc.jobs.slowed).toBe(false)
  })
})
