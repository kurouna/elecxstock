// 取得の知らせ（data.updated）で手元の指標を置き換える（FR-S11: 取得に成功してから置き換える）。
// 先に消すと、新しい値が届くまで一覧の並べ替えで値の無い銘柄が最後に回り、行が跳ねる（選んでいる行の位置もずれる）
import type { InstrumentId } from '@shared/types'
import { afterAll, describe, expect, it } from 'vitest'
import { installBridge } from '../../support/bridge'
import { makeCore } from '../../support/core'

const core = makeCore()
installBridge(core)
afterAll(() => core.dispose())
const { app, applyDataUpdated, bridge } = await import('../../../src/renderer/stores/app.svelte')
const { yieldLines } = await import('@shared/yieldLines')

const A = 'JP:7203' as InstrumentId
const B = 'JP:8306' as InstrumentId

async function prime() {
  app.metrics.clear()
  for (const r of await bridge.call('metrics.get', { ids: [A, B] })) app.metrics.set(r.id, { ...r, close: -1 })
}

describe('FR-S11 取得の知らせで指標を消さずに置き換える', () => {
  it('知らせた銘柄は、新しい値が届くまで前の値のまま残り、届いたら置き換わる', async () => {
    await prime()
    const v0 = app.dataVersion
    const p = applyDataUpdated(new Set([A]))
    expect(app.metrics.get(A)?.close).toBe(-1) // 消していない
    await p
    expect(app.metrics.get(A)?.close).not.toBe(-1)
    expect(app.metrics.get(A)?.close).toBeGreaterThan(0)
    expect(app.metrics.get(B)?.close).toBe(-1) // 知らせていない銘柄はそのまま
    expect(app.dataVersion).toBe(v0 + 1)
    expect(app.updatedIds).toEqual(new Set([A]))
  })
  it('すべて（*）のときは手元にある銘柄をすべて置き換える', async () => {
    await prime()
    const p = applyDataUpdated('*')
    expect(app.metrics.size).toBe(2)
    await p
    expect(app.metrics.get(A)?.close).toBeGreaterThan(0)
    expect(app.metrics.get(B)?.close).toBeGreaterThan(0)
    expect(app.updatedIds).toBe('*')
  })
  it('Core に指標が無くなった銘柄は消す', async () => {
    await prime()
    const gone = 'JP:0000' as InstrumentId
    app.metrics.set(gone, { ...app.metrics.get(A)!, id: gone })
    await applyDataUpdated(new Set([gone]))
    expect(app.metrics.has(gone)).toBe(false)
    expect(app.metrics.has(A)).toBe(true)
  })
})

// 目標利回りの線（FR-C12）はチャート・グリッドが手元の指標（app.metrics の div12・yieldTrailing・close）から作る。取得の知らせで
// 指標が置き換わったら、線も新しい配当の値になる（グリッドは dataVersion で描き直す）
describe('FR-C12 取得の知らせのあと、目標利回りの線は新しい指標の配当で引く', () => {
  const s = { yieldLine: true, yieldTargets: [4] }
  it('置き換わる前は前の値、置き換わったら新しい div12 ÷ 目標', async () => {
    app.metrics.clear()
    const [r] = await bridge.call('metrics.get', { ids: [A] })
    expect(r!.div12).toBeGreaterThan(0)
    app.metrics.set(A, { ...r!, div12: 1, close: 10 })
    expect(yieldLines(app.metrics.get(A), s)[0]!.price).toBe(25)
    const v0 = app.dataVersion
    await applyDataUpdated(new Set([A]))
    expect(yieldLines(app.metrics.get(A), s)[0]!.price).toBeCloseTo(r!.div12! / 0.04)
    expect(app.dataVersion).toBe(v0 + 1)
  })
  it('配当が無くなった（div12 が 0）・実績利回りが出なくなったら引かない', async () => {
    const r = app.metrics.get(A)!
    app.metrics.set(A, { ...r, div12: 0 })
    expect(yieldLines(app.metrics.get(A), s)).toEqual([])
    app.metrics.set(A, { ...r, yieldTrailing: null })
    expect(yieldLines(app.metrics.get(A), s)).toEqual([])
  })
})
