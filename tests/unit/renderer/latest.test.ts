// 最後の要求の応答だけを受け取る（NFR-A8 と同じ考え方。L1）
import { describe, expect, it } from 'vitest'
import { latest } from '../../../src/renderer/lib/latest'

describe('古い応答を捨てる（NFR-A8）', () => {
  it('あとから要求を出すと、前の要求は古くなる', () => {
    const fresh = latest()
    const a = fresh()
    expect(a()).toBe(true)
    const b = fresh()
    expect(a()).toBe(false)
    expect(b()).toBe(true)
  })
  it('応答が出した順と逆に届いても、最後の要求だけが通る', async () => {
    const fresh = latest()
    let shown = ''
    const run = async (v: string, ms: number) => {
      const ok = fresh()
      await new Promise((r) => setTimeout(r, ms))
      if (ok()) shown = v
    }
    await Promise.all([run('old', 20), run('new', 1)])
    expect(shown).toBe('new')
  })
  it('別々に作ったものは互いに影響しない', () => {
    const f = latest()
    const g = latest()
    const a = f()
    g()
    expect(a()).toBe(true)
  })
})
