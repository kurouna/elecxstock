// ショートカット一覧の登録表（docs/design-dialogs.md §4。FR-KB7）: 1 行 1 操作・日英・アクションの実在・キーを持つアクションの網羅（L2）
import { describe, expect, it } from 'vitest'
import { stubWindow } from '../../support/window'

stubWindow()
const { ACTIONS } = await import('../../../src/renderer/lib/commands')
const { SHORTCUTS, SECTIONS, SECTION_KEY, helpSection } = await import('../../../src/renderer/lib/shortcuts')
const { WIDGETS } = await import('../../../src/renderer/stores/layout.svelte')
const { keyCombos } = await import('../../../src/renderer/lib/keys')
const { ja, en } = await import('../../../src/renderer/lib/i18n')

describe('ショートカット一覧の登録表（FR-KB7）', () => {
  it('どの段にも行があり、段の名前は日英にある', () => {
    for (const s of SECTIONS) {
      expect(
        SHORTCUTS.some((r) => r.sec === s),
        s,
      ).toBe(true)
      expect((ja as Record<string, string>)[SECTION_KEY[s]], s).toBeTruthy()
      expect((en as Record<string, string>)[SECTION_KEY[s]], s).toBeTruthy()
    }
  })
  it('1 行に 1 操作（名前に「 / 」で操作を詰めない）。日英の名前と小見出しがある', () => {
    for (const r of SHORTCUTS) {
      for (const i of [0, 1] as const) {
        expect(r.label[i].length, r.label[0]).toBeGreaterThan(0)
        expect(r.grp[i].length, r.label[0]).toBeGreaterThan(0)
        expect(r.label[i], r.label[i]).not.toMatch(/\s\/\s/)
      }
    }
  })
  it('アクションの行の ID は実在し、キーの表記は分解できる', () => {
    const ids = new Set(ACTIONS.map((a) => a.id))
    for (const r of SHORTCUTS) {
      if (r.act) expect(ids.has(r.act), r.act).toBe(true)
      else expect(keyCombos(r.keys ?? '', '').length, r.label[0]).toBeGreaterThan(0)
    }
  })
  it('キーを持つアクションはすべて一覧に載る（レイアウトのプリセットは Ctrl+Shift+1–9 の 1 行）', () => {
    const listed = new Set(SHORTCUTS.flatMap((r) => (r.act ? [r.act] : [])))
    const ranged = (a: (typeof ACTIONS)[number]) => a.id.startsWith('layout.') && /^Ctrl\+Shift\+[1-9]$/.test(a.key ?? '')
    expect(ACTIONS.filter((a) => a.key && !listed.has(a.id) && !ranged(a)).map((a) => a.id)).toEqual([])
    expect(SHORTCUTS.some((r) => r.keys === 'Ctrl+Shift+1–9')).toBe(true)
  })
  it('すべてのペインの種類に、先頭に出す段がある（FR-KB7「いまのペインで効くキーを先に」）', () => {
    for (const w of WIDGETS) expect(SECTIONS, w).toContain(helpSection(w))
  })
})
