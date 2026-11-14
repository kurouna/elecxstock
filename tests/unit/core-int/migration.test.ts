// DB の移行（FR-S10, FR-FD5）: 古い版の DB を開くと、指標の表を作り直し、起動のあとに日足から作り直す

import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { makeCore } from '../../support/core'

describe('DB の移行（FR-S2, S10）', () => {
  it('v4 の DB を開くと v5 に上がり、指標（権利確定日の日を含む）を作り直す', async () => {
    const seed = makeCore()
    const { dir } = seed
    // 種の DB を v4 に戻す（v5 で足した列の無い指標の表）
    await seed.svc.shutdown()
    const raw = new DatabaseSync(join(dir, 'market.db'))
    raw.exec('PRAGMA user_version = 4')
    raw.close()
    const core = makeCore({ dir })
    try {
      const v = core.svc.db.raw.prepare('PRAGMA user_version').get() as { user_version: number }
      expect(v.user_version).toBe(5)
      expect(core.svc.db.meta('metricsStale')).toBe('1')
      expect((await core.svc.call('metrics.get', { ids: ['JP:7203'] })).length).toBe(0) // 表を作り直した直後は空
      core.svc.start()
      for (let i = 0; i < 500 && core.svc.db.meta('metricsStale') !== '0'; i++) await new Promise((r) => setTimeout(r, 10))
      expect(core.svc.db.meta('metricsStale')).toBe('0')
      const [m] = await core.svc.call('metrics.get', { ids: ['JP:7203'] })
      expect(m?.close).toBeGreaterThan(0)
      expect(m && 'recordDay' in m).toBe(true)
    } finally {
      await core.dispose()
    }
  })
})
