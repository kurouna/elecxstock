// 結果表の列（画面）と Core の値の突き合わせ（docs/test-plan.md §5。FR-SC3, FR-H4, FR-H6）。
// 冷えた状態（保有のタブを開いていない・スクリーナーの結果の銘柄の指標しか手元に無い）から始め、遅れて届く指標の前と後で確かめる
import type { InstrumentId } from '@shared/types'
import { afterAll, describe, expect, it } from 'vitest'
import { installBridge } from '../../support/bridge'
import { makeCore } from '../../support/core'

const core = makeCore()
installBridge(core)
afterAll(() => core.dispose())
const { app, loadInstruments } = await import('../../../src/renderer/stores/app.svelte')
const { loadHoldings, valuation } = await import('../../../src/renderer/lib/portfolio')
const { COLUMN_BY_ID } = await import('../../../src/renderer/lib/columns')

const HOLD = [
  { code: '7203', account: 'tokutei' as const, quantity: 100, avgCost: 1500 },
  { code: '8306', account: 'tokutei' as const, quantity: 200, avgCost: 900 },
  { code: '8058', account: 'nisa_growth' as const, quantity: 100, avgCost: 2000 },
]
const waitFor = async (f: () => boolean, ms = 3000) => {
  const t0 = Date.now()
  while (!f()) {
    if (Date.now() - t0 > ms) throw new Error('timeout')
    await new Promise((r) => setTimeout(r, 10))
  }
}
/** Core のスクリーナーで、その銘柄の値が v（±tol）か */
async function coreHas(field: string, id: InstrumentId, v: number, tol = 1e-6): Promise<boolean> {
  const r = await window.elecxstock.call('screener.run', {
    conditions: [
      { field, op: '>=', value: v - tol },
      { field, op: '<=', value: v + tol },
    ],
    favorites: [],
    watchlists: {},
  })
  return r.ids.includes(id)
}

describe('保有の列と Core（FR-H4, FR-H6, FR-SC3）', () => {
  it('保有のタブを開く前でも、保有割合などの列は Core と同じ値になる（ほかの保有の銘柄の終値を取ってくる）', async () => {
    await loadInstruments()
    await core.call('portfolio.save', { holdings: HOLD })
    await loadHoldings()
    // スクリーナーの結果（銀行業だけ）の指標だけが手元にある状態
    const r = await window.elecxstock.call('screener.run', {
      conditions: [{ field: 'attr.sector', op: 'in', value: ['銀行業'] }],
      favorites: [],
      watchlists: {},
    })
    expect(r.ids).toContain('JP:8306')
    for (const row of r.rows) app.metrics.set(row.id, row)
    expect(app.metrics.has('JP:7203')).toBe(false)
    const cols = ['holding.weight', 'holding.sectorWeight', 'holding.yoc', 'holding.pnlPct'].map((id) => COLUMN_BY_ID.get(id)!)
    for (const c of cols) c.sort!('JP:8306') // 列を描く（ほかの保有の銘柄の指標を頼む）
    await waitFor(() => HOLD.every((h) => app.metrics.has(`JP:${h.code}` as InstrumentId)))
    for (const c of cols)
      for (const h of HOLD) {
        const id = `JP:${h.code}` as InstrumentId
        const v = c.sort!(id) as number
        expect(v, `${c.id} ${id}`).not.toBeNull()
        expect(await coreHas(c.id, id, v), `${c.id} ${id} = ${v}`).toBe(true)
      }
  })
  it('保有の評価（保有のタブ）の損益率は、Core の損益率と同じ', async () => {
    for (const h of app.holdings) {
      const v = valuation(h).pnlPct!
      expect(await coreHas('holding.pnlPct', `JP:${h.code}` as InstrumentId, v)).toBe(true)
    }
  })
  it('保有を変えると、列は作り直した値になる（状態の変化。FR-H7）', async () => {
    const id = 'JP:8306' as InstrumentId
    const w0 = COLUMN_BY_ID.get('holding.weight')!.sort!(id) as number
    await core.call('portfolio.save', { holdings: HOLD.map((h) => (h.code === '8306' ? { ...h, quantity: 2000 } : h)) })
    await loadHoldings()
    const w1 = COLUMN_BY_ID.get('holding.weight')!.sort!(id) as number
    expect(w1).toBeGreaterThan(w0)
    expect(await coreHas('holding.weight', id, w1)).toBe(true)
  })
})
