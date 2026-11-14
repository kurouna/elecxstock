import { afterAll, describe, expect, it } from 'vitest'
import { makeCore } from '../../support/core'

const core = makeCore()
const { svc } = core
afterAll(() => core.dispose())

describe('指標の再計算の中断', () => {
  it('止める合図があれば残りを書かずに止まる', async () => {
    const ac = new AbortController()
    ac.abort()
    await expect(svc.jobs.recomputeAll(ac.signal)).rejects.toThrow('aborted')
  })
})
