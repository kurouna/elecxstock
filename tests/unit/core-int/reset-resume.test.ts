// 全データの取り直しの途中で閉じたとき（FR-S9）: 次の起動で続きから取り直し、二重に始めない。
// 取り直しの途中は、日足の無い銘柄が残る（画面はこれを「未取得」と出す）
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStubProvider } from '@core/providers/stub'
import { CoreService } from '@core/service'
import { afterAll, describe, expect, it } from 'vitest'

const dir = mkdtempSync(join(tmpdir(), 'elecxstock-reset-'))
afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    /* Windows では閉じた直後に消せないことがある */
  }
})
// 1 リクエストごとに少し待たせ、取り直しの途中で閉じられるようにする
const make = () => new CoreService(dir, { ...createStubProvider(), minIntervalMs: 15 }, () => {}, 'test')
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('全データの取り直しの途中で閉じて、次の起動で続きから取り直す（FR-S9）', () => {
  it('閉じると取り直しは待ちに戻り、再起動で続きから完了する。取り直しを二重に始めない', async () => {
    const a = make()
    const id = await a.call('jobs.reset', { keepDelisted: false })
    for (let i = 0; i < 400; i++) {
      const j = (await a.call('jobs.list', {})).find((x) => x.id === id)!
      if (j.done >= 5) break
      await sleep(20)
    }
    const before = (await a.call('jobs.list', {})).find((x) => x.id === id)!
    expect(before.done).toBeLessThan(before.total)
    // 途中は日足の無い銘柄が残る
    const mid = await a.call('data.status', {})
    expect(mid.withBars).toBeLessThan(mid.instruments)
    await a.shutdown()

    const b = make()
    const left = (await b.call('jobs.list', {})).find((x) => x.id === id)!
    expect(left.status).toBe('queued')
    expect(left.done).toBeGreaterThanOrEqual(before.done) // 終わった項目はやり直さない
    b.start()
    for (let i = 0; i < 3000; i++) {
      const j = (await b.call('jobs.list', {})).find((x) => x.id === id)!
      if (j.status === 'done') break
      await sleep(20)
    }
    const jobs = await b.call('jobs.list', {})
    expect(jobs.find((x) => x.id === id)!.status).toBe('done')
    expect(jobs.filter((x) => x.kind === 'reset')).toHaveLength(1)
    const st = await b.call('data.status', {})
    expect(st.withBars).toBe(st.instruments)
    await b.shutdown()
  }, 180_000)
})
