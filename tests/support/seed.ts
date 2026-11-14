// Vitest の globalSetup: 初回取得を済ませた Core の DB（種）を 1 回だけ作り、結合のテストはその写しを使う（docs/testing.md）。
// 基準日時（TEST_NOW）で作る。実行をまたいでは残さない（日付・移行・スタブ・指標の計算で古くなるため）
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStubProvider } from '@core/providers/stub'
import { CoreService } from '@core/service'
import { TEST_NOW } from '@shared/clock'
import type { TestProject } from 'vitest/node'

declare module 'vitest' {
  export interface ProvidedContext {
    seedDir: string
  }
}

export default async function setup(project: TestProject): Promise<() => void> {
  const dir = mkdtempSync(join(tmpdir(), 'elecxstock-seed-'))
  // この処理の間だけ時刻をずらす（Vitest 本体の時刻には残さない）
  const Real = Date
  const offset = Date.parse(TEST_NOW) - Real.now()
  globalThis.Date = new Proxy(Real, {
    construct: (t, a, nt) => Reflect.construct(t, a.length === 0 ? [Real.now() + offset] : a, nt),
    get: (t, p, r) => (p === 'now' ? () => Real.now() + offset : Reflect.get(t, p, r)),
  })
  try {
    const svc = new CoreService(dir, createStubProvider(), () => {}, 'test')
    await svc.call('jobs.start', { kind: 'initial' })
    for (let i = 0; i < 3000; i++) {
      const jobs = await svc.call('jobs.list', {})
      if (jobs.every((j) => j.status === 'done' || j.status === 'failed' || j.status === 'cancelled')) break
      await new Promise((r) => setTimeout(r, 20))
    }
    await svc.shutdown() // ジョブを止め、WAL を書き戻して閉じる（写せるように）
  } finally {
    globalThis.Date = Real
  }
  project.provide('seedDir', dir)
  return () => rmSync(dir, { recursive: true, force: true })
}
