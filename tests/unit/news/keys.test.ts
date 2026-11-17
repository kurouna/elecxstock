// キーの割り当ての制限（FR-NW7・FR-KB6）: ニュースのペインのコピーのキーは全体のアクションに割り当てられない
import { describe, expect, it } from 'vitest'
import { assignable, reservedKey } from '../../../src/renderer/lib/keys'

describe('FR-NW7 コピーのキーは全体のアクションに割り当てない', () => {
  it('Ctrl+C・Ctrl+Alt+C は割り当てられない（表記の揺れも）', () => {
    for (const k of ['Ctrl+C', 'ctrl+c', 'Ctrl+Alt+C', 'Alt+Ctrl+C']) {
      expect(reservedKey(k), k).toBe(true)
      expect(assignable(k), k).toBe(false)
    }
  })
  it('ほかの Ctrl のキーは今までどおり割り当てられる', () => {
    expect(assignable('Ctrl+Shift+C')).toBe(true)
    expect(assignable('Ctrl+Alt+D')).toBe(true)
    expect(reservedKey('Ctrl+Shift+C')).toBe(false)
  })
})
