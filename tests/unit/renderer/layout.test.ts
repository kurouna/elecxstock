// レイアウトの木の操作（FR-L1, L6, L9, L10）。window が要るので、Core の単体テストとは別に最小の窓口だけ用意する。
import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { elecxstock: { call: async () => undefined, on: () => () => {}, prioritize: () => {} } })

const L = await import('../../../src/renderer/stores/layout.svelte')

describe('レイアウト', () => {
  it('壊れた・重複した ID の木を正規化する', () => {
    const d = L.defaultDoc()
    const raw = JSON.parse(JSON.stringify(d))
    raw.entries.mtf.root.children[1].id = raw.entries.mtf.root.children[0].id // ID の重複
    raw.entries.grid = { root: { kind: 'pane', widget: 'nope' } } // 知らないウィジェット
    const n = L.normalizeDoc(raw)
    const ids = L.allPanes(n.entries.mtf).map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(n.entries.grid.root.kind).toBe('pane') // 既定に戻る
    expect(L.normalizeDoc(null).active).toBe('mtf')
  })
  it('分割・閉じる・サイズのリセットと取り消し', () => {
    L.layout.doc = L.defaultDoc()
    const first = L.allPanes(L.layout.entry, false)[0]!
    const id = L.splitPane(first.id, 'col', 'info')!
    expect(L.findPane(id)?.widget).toBe('info')
    L.closePane(id)
    expect(L.findPane(id)).toBeUndefined()
    const root = L.layout.entry.root as { sizes: number[] }
    root.sizes = [50, 50]
    L.resetSizes()
    expect(root.sizes).toEqual([24, 76])
    expect(L.undoResetSizes()).toBe(true)
    expect(root.sizes).toEqual([50, 50])
    L.resetLayout()
    expect((L.layout.entry.root as { sizes: number[] }).sizes).toEqual([24, 76])
  })
  it('区切り線をキーで動かす（Alt+Shift+矢印）', () => {
    L.layout.doc = L.defaultDoc()
    const wl = L.allPanes(L.layout.entry, false)[0]!
    L.nudgeDivider(wl.id, 'right')
    expect((L.layout.entry.root as { sizes: number[] }).sizes[0]).toBeGreaterThan(24)
  })
})
