// 取得中に閉じたとき（FR-F1）: 止めた項目は「待ち」に戻り、次の起動で続きから終わる。月次系列の取り直しは失われない
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStubProvider } from '@core/providers/stub'
import { CoreService } from '@core/service'
import { afterAll, describe, expect, it } from 'vitest'

const dir = mkdtempSync(join(tmpdir(), 'elecxstock-stop-'))
afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    /* Windows では閉じた直後に消せないことがある */
  }
})
// 1 リクエストごとに少し待たせ、取得の途中で閉じられるようにする
const make = () => new CoreService(dir, { ...createStubProvider(), minIntervalMs: 15 }, () => {}, 'test')
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('取得中に閉じて、次の起動で再開する（FR-F1）', () => {
  it('閉じると実行中のジョブは待ちに戻り、再起動で続きから完了する。重複して始め直さない', async () => {
    const a = make()
    const id = await a.call('jobs.start', { kind: 'initial' })
    // いくつかの項目が終わるまで待つ（全部は終わらせない）
    for (let i = 0; i < 400; i++) {
      const j = (await a.call('jobs.list', {})).find((x) => x.id === id)!
      if (j.done >= 5) break
      await sleep(20)
    }
    const before = (await a.call('jobs.list', {})).find((x) => x.id === id)!
    expect(before.done).toBeLessThan(before.total)
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
    expect(jobs.filter((x) => x.kind === 'initial')).toHaveLength(1)
    const st = await b.call('data.status', {})
    expect(st.withBars).toBe(st.instruments)

    // 月次系列の取り直しが要る印（分割のあとに閉じたなど）が残っていれば、日々の更新が拾う
    b.repo.needMonthly('JP:7203')
    expect(b.jobs.planFor('daily')).toContain('M:JP:7203')
    expect(b.jobs.planFor('daily').filter((x) => x.startsWith('M:'))).toHaveLength(1)
    await b.shutdown()
  }, 180_000)
})

describe('起動の直後に閉じる・閉じる知らせが二度届く（FR-F1）', () => {
  it('起動で遅らせた処理（資産推移の記録・指標の作り直し）は、閉じたあとに走らない。二度閉じても投げない', async () => {
    const d = mkdtempSync(join(tmpdir(), 'elecxstock-stop2-'))
    const logs: string[] = []
    const c = new CoreService(
      d,
      createStubProvider(),
      () => {},
      'test',
      (m) => logs.push(m),
    )
    c.db.setMeta('metricsStale', '1')
    const rejected: unknown[] = []
    const onRej = (e: unknown) => rejected.push(e)
    process.on('unhandledRejection', onRej)
    try {
      c.start()
      await Promise.all([c.shutdown(), c.shutdown()])
      await c.shutdown()
      await sleep(200) // 遅らせた処理（50ms・80ms）が走るはずの時間を過ぎるまで
      expect(logs.filter((l) => l.startsWith('folio:'))).toEqual([])
      expect(rejected).toEqual([])
    } finally {
      process.off('unhandledRejection', onRej)
      try {
        rmSync(d, { recursive: true, force: true })
      } catch {
        /* Windows では閉じた直後に消せないことがある */
      }
    }
  })
})
