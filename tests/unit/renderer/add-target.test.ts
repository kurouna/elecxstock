// 銘柄ジャンプ・コマンドバーの「足す先」をフォーカス中のペインに聞く（docs/design-perf.md §5.1。L4）。
// ウォッチリストは今の振る舞い（★は＋を出さずに足す・保有のタブは変えられない）のまま、パフォーマンス比較が同じ口を使う
import type { Watchlist } from '@shared/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PaneNode, WidgetId } from '../../../src/renderer/stores/layout.svelte'
import { stubWindow } from '../../support/window'

stubWindow()
vi.stubGlobal('CSS', { escape: (s: string) => s })
const { app } = await import('../../../src/renderer/stores/app.svelte')
const L = await import('../../../src/renderer/stores/layout.svelte')
const C = await import('../../../src/renderer/lib/commands')
const { registerPane } = await import('../../../src/renderer/lib/panes')
const { perfTarget } = await import('../../../src/renderer/lib/perfTarget')

const wl = (id: string, items: string[] = []): Watchlist => ({ id, name: { ja: id, en: id }, items }) as Watchlist
function pane(widget: WidgetId, state: Record<string, unknown> = {}): PaneNode {
  const p: PaneNode = { kind: 'pane', id: `p-${widget}-${Math.random()}`, widget, link: 2, state }
  L.layout.doc = L.normalizeDoc({ version: 1, active: 'free', entries: { free: { root: p, docks: {} } }, links: {} })
  return L.findPane(p.id)!
}
beforeEach(() => {
  app.watchlists = [wl('favorites'), wl('w1', ['JP:7203'])]
  app.toasts = []
  app.focus = null
})

describe('FR-PC4 足す先（addTarget）', () => {
  it('フォーカス中のペインが足す先を持たなければ null', () => {
    const p = pane('chart')
    app.focus = p.id
    expect(C.focusedAddTarget()).toBeNull()
  })
  it('ウォッチリスト: リスト名で足し、表示もする。★は＋を出さない（quiet）が Ctrl+Enter で足せる', () => {
    const p = pane('watchlist', { list: 'w1' })
    const off = registerPane(p.id, { addTarget: () => C.watchlistTarget(p) })
    app.focus = p.id
    const t = C.focusedAddTarget()!
    expect(t.label).toBe('w1')
    expect(t.quiet).toBeFalsy()
    expect(t.add('JP:8058')).toBe(true)
    expect(app.watchlists.find((w) => w.id === 'w1')!.items).toEqual(['JP:7203', 'JP:8058'])
    p.state = { list: 'favorites' }
    app.focus = p.id // 足すと表示する（MTF のタブに移ってフォーカスが動く）ので戻す
    const f = C.focusedAddTarget()!
    expect(f.quiet).toBe(true)
    expect(f.add('JP:8306')).toBe(true)
    expect(app.watchlists.find((w) => w.id === 'favorites')!.items).toEqual(['JP:8306'])
    off()
  })
  it('ウォッチリストの保有のタブ: 足さずに理由を知らせる', () => {
    const p = pane('watchlist', { list: 'holdings' })
    app.focus = p.id
    const t = C.watchlistTarget(p)!
    expect(t.quiet).toBe(true)
    expect(t.add('JP:8058')).toBe(false)
    expect(app.toasts.at(-1)!.msg).toMatch(/保有/)
  })
  it('パフォーマンス比較: 足すと銘柄が増え、5 銘柄で full。full のときは足さずに知らせる', () => {
    const p = pane('perf', { pfIds: ['A', 'B', 'C', 'D'], pfSlots: { A: 1, B: 2, C: 3, D: 4 } })
    const t = perfTarget(p, null)
    expect(t.full).toBe(false)
    expect(t.add('E')).toBe(true)
    expect(p.state.pfIds).toEqual(['A', 'B', 'C', 'D', 'E'])
    expect(p.state.pfSlots).toEqual({ A: 1, B: 2, C: 3, D: 4, E: 5 })
    const t2 = perfTarget(p, null)
    expect(t2.full).toBe(true)
    expect(t2.add('F')).toBe(false)
    expect(p.state.pfIds).toHaveLength(5)
    expect(app.toasts.at(-1)!.msg).toMatch(/5 銘柄まで/)
    // 比べる相手は満杯でも足せる（色の枠を使わない）
    expect(t2.add('JP:1343')).toBe(true)
    expect(p.state.pfBench).toEqual(['JP:1306', 'JP:1343'])
  })
  it('パフォーマンス比較: 足した銘柄は知らせる・同じ銘柄は足さない', () => {
    const p = pane('perf', { pfIds: ['A'], pfSlots: { A: 1 } })
    expect(perfTarget(p, null).add('A')).toBe(false)
    expect(p.state.pfIds).toEqual(['A'])
  })
  it('パフォーマンス比較: 開いただけ（足す先を読んだだけ）では状態を書かない', () => {
    const p = pane('perf')
    const before = p.state
    const t = perfTarget(p, 'JP:7203')
    expect(t.label).toBeTruthy()
    expect(p.state).toBe(before)
    // 種の銘柄に足すと、種も書く
    expect(t.add('JP:8058')).toBe(true)
    expect(p.state.pfIds).toEqual(['JP:7203', 'JP:8058'])
  })
})
