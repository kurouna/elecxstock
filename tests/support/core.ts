// Core の結合のテスト（L3）の部品: 種の DB の写しで CoreService を作る・ジョブが終わるまで待つ（docs/testing.md）
import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { dispatch } from '@core/dispatch'
import { createStubProvider } from '@core/providers/stub'
import type { Provider } from '@core/providers/types'
import { CoreService } from '@core/service'
import type { Method, Params, Results } from '@shared/api'
import { inject } from 'vitest'

export interface CoreEvent {
  event: string
  data: unknown
}
export interface TestCore {
  svc: CoreService
  /**
   * 製品と同じ経路で呼ぶ: zod の検証・窓（main）の制限を通し、引数と結果を構造化複製する（MessagePort と同じ）。
   * svc.call を直接呼ぶと Core の中の値をそのまま共有するので、呼んだあとの変更が前の結果に映る
   */
  call: <M extends Method>(method: M, params: Params<M>) => Promise<Results[M]>
  dir: string
  events: CoreEvent[]
  /** Core のイベントを受ける（renderer の窓口が使う） */
  onEvent: (f: (e: CoreEvent) => void) => void
  /** 待っている・動いているジョブが無くなるまで待つ */
  idle: (ms?: number) => Promise<void>
  /** 閉じて一時フォルダを消す */
  dispose: () => Promise<void>
}

/**
 * Core を作る。既定は初回取得の済んだ種の写し（速い）。`fresh` は空のフォルダ（初回取得そのものを確かめるとき）。
 * `dir` を渡すと、そのフォルダを開き直す（再起動を確かめるとき）
 */
export function makeCore(opts: { fresh?: boolean; dir?: string; provider?: Provider } = {}): TestCore {
  const dir = opts.dir ?? mkdtempSync(join(tmpdir(), 'elecxstock-test-'))
  if (!opts.fresh && !opts.dir) cpSync(inject('seedDir'), dir, { recursive: true })
  const events: CoreEvent[] = []
  const subs: ((e: CoreEvent) => void)[] = []
  const svc = new CoreService(
    dir,
    opts.provider ?? createStubProvider(),
    (event, data) => {
      const e = { event, data }
      events.push(e)
      for (const f of subs) f(e)
    },
    'test',
  )
  const idle = async (ms = 60_000) => {
    const t0 = Date.now()
    for (;;) {
      const jobs = await svc.call('jobs.list', {})
      if (jobs.every((j) => j.status === 'done' || j.status === 'failed' || j.status === 'cancelled')) return
      if (Date.now() - t0 > ms) throw new Error(`jobs not idle: ${JSON.stringify(jobs.filter((j) => j.status !== 'done'))}`)
      await new Promise((r) => setTimeout(r, 10))
    }
  }
  let disposed = false
  const dispose = async () => {
    if (disposed) return
    disposed = true
    await svc.shutdown().catch(() => {})
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* Windows では閉じた直後に消せないことがある */
    }
  }
  let seq = 0
  const call = async <M extends Method>(method: M, params: Params<M>): Promise<Results[M]> => {
    const { reply } = await dispatch(svc, { prioritize: () => {} }, 'main', { id: ++seq, method, params: structuredClone(params) })
    if ('error' in reply) throw reply.error
    return structuredClone(reply.result) as Results[M]
  }
  return { svc, call, dir, events, onEvent: (f) => subs.push(f), idle, dispose }
}

/** ジョブを始めて、終わるまで待つ */
export async function runJob(core: TestCore, kind: 'initial' | 'daily' | 'refetchAll' | string): Promise<void> {
  await core.svc.call('jobs.start', { kind } as never)
  await core.idle()
}
