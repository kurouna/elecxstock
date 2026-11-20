// ペインの種類の登録表（docs/design-dialogs.md §5）: すべての種類に分類・説明・別名・図があり、日英がそろう（L2）
import { describe, expect, it } from 'vitest'
import { stubWindow } from '../../support/window'

stubWindow()
const { WIDGETS } = await import('../../../src/renderer/stores/layout.svelte')
const { WIDGET_INFO, WIDGET_GROUPS } = await import('../../../src/renderer/lib/widgetInfo')
const { ja, en } = await import('../../../src/renderer/lib/i18n')
const { FREE_WIDGETS } = await import('../../../src/renderer/lib/windowSlot')

describe('ペインの種類の登録表（§6.5, FR-L7）', () => {
  it('WIDGETS と同じ種類を、ちょうど 1 回ずつ持つ', () => {
    expect(Object.keys(WIDGET_INFO).sort()).toEqual([...WIDGETS].sort())
  })
  it('分類は決まった 5 つのどれかで、どの分類も 4 枚まで（4 列の格子に収まる）', () => {
    for (const g of WIDGET_GROUPS) {
      const n = WIDGETS.filter((w) => WIDGET_INFO[w].group === g).length
      expect(n, g).toBeGreaterThan(0)
      expect(n, g).toBeLessThanOrEqual(4)
    }
  })
  it('すべての種類に、日英の名前・説明と、線画の図・小さなアイコンがある', () => {
    for (const w of WIDGETS) {
      for (const d of [ja, en] as Record<string, string>[]) {
        expect(d[`widget.${w}`], w).toBeTruthy()
        expect(d[`widgetDesc.${w}`], w).toBeTruthy()
        expect(`widgetAlias.${w}` in d, w).toBe(true)
      }
      expect(WIDGET_INFO[w].fig.length, w).toBeGreaterThan(1)
      expect(WIDGET_INFO[w].icon, w).toMatch(/^M/)
    }
  })
  it('フリー N で使える種類は登録表にある', () => {
    for (const w of FREE_WIDGETS) expect(WIDGET_INFO[w], w).toBeTruthy()
  })
})
