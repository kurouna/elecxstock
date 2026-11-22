// パフォーマンス比較のペインの登録（docs/design-perf.md §2.7・§8・§9 の L2）: ペインの種類・フリー N・ひな形「比較」・F1 の一覧
import { describe, expect, it, vi } from 'vitest'
import { freeShapeArg } from '../../../src/main/shapes'
import { stubWindow } from '../../support/window'

stubWindow()
const L = await import('../../../src/renderer/stores/layout.svelte')
const { FREE_WIDGETS } = await import('../../../src/renderer/lib/windowSlot')
const { PAGE_SHAPES } = await import('../../../src/renderer/lib/pages')
const { SHAPE_FIG, shapeFigOf } = await import('../../../src/renderer/lib/shapeFigs')
const { WIDGET_INFO } = await import('../../../src/renderer/lib/widgetInfo')
const { SHORTCUTS, helpSection } = await import('../../../src/renderer/lib/shortcuts')
const { ja, en } = await import('../../../src/renderer/lib/i18n')
const { freeWindowShapes } = await import('../../../src/renderer/lib/commands')
vi.stubGlobal('CSS', { escape: (s: string) => s })

describe('FR-PC1 FR-PC12 パフォーマンス比較の登録', () => {
  it('ペインの種類・フリー N に置ける・ペインの種類のダイアログの図と文言', () => {
    expect(L.WIDGETS).toContain('perf')
    expect(FREE_WIDGETS).toContain('perf')
    expect(WIDGET_INFO.perf.fig.length).toBeGreaterThan(1)
    for (const k of ['widget.perf', 'widgetDesc.perf', 'win.shape.perf', 'win.shape.perfHint'] as const) {
      expect((ja as Record<string, string>)[k], k).toBeTruthy()
      expect((en as Record<string, string>)[k], k).toBeTruthy()
    }
  })
  it('マイレイアウトの新しいページとフリー N の形に「比較」（図つき）', () => {
    expect(PAGE_SHAPES.map((x) => x[0])).toContain('free:perf')
    expect(SHAPE_FIG.perf.length).toBeGreaterThan(1)
    expect(shapeFigOf('free:perf')).toBe('perf')
    expect(freeWindowShapes().map((x) => x.id)).toContain('perf')
    expect(freeShapeArg('perf')).toBe('perf')
  })
  it('ひな形は パフォーマンス比較 62% + 日足のチャート 38%（どちらもリンク 2）。初期状態に戻す先も同じ', () => {
    for (const e of [L.shapeEntry('free:perf'), L.freeShape('perf')]) {
      const root = e.root as {
        kind: string
        dir: string
        sizes: number[]
        children: { widget: string; link: number; state: Record<string, unknown> }[]
      }
      expect(root.kind).toBe('split')
      expect(root.dir).toBe('row')
      expect(root.sizes).toEqual([62, 38])
      expect(root.children.map((c) => [c.widget, c.link])).toEqual([
        ['perf', 2],
        ['chart', 2],
      ])
      expect(root.children[1]!.state.tf).toBe('D')
    }
  })
  it('F1 の一覧にペインのキーの段があり、フォーカス中は先頭', () => {
    expect(helpSection('perf')).toBe('perf')
    const keys = SHORTCUTS.filter((r) => r.sec === 'perf').map((r) => r.keys)
    for (const k of ['Insert', 'Delete', 'Alt+1–6', 'P', 'T', 'L', 'H', 'B', 'I'])
      expect(
        keys.some((x) => x?.split(' / ').includes(k) || x === k),
        k,
      ).toBe(true)
  })
})

describe('FR-PC11 判定をしない', () => {
  it('パフォーマンス比較の文言に勝ち負け・割安などの言葉が無く、過去の値動きの比較である旨がある', () => {
    const J = ja as Record<string, string>
    const E = en as Record<string, string>
    const keys = Object.keys(J).filter((k) => k.startsWith('pf.'))
    expect(keys.length).toBeGreaterThan(40)
    for (const k of keys) {
      expect(J[k], k).not.toMatch(/勝ち|負け|割安|割高|おすすめ|買い時|売り時|有望|予想/)
      expect(E[k], k).not.toMatch(/\b(win|winner|loser|cheap|undervalued|recommend|forecast|buy now)\b/i)
    }
    expect(J['pf.disclaimer']).toMatch(/過去の値動きの比較/)
    expect(J['pf.disclaimer']).toMatch(/将来の値動きを示すものではありません/)
  })
})
