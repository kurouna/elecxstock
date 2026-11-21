// ダイアログの中で Tab を折り返す（FR-KB2。docs/design-dialogs.md §10「どのダイアログも Tab で外へフォーカスを出さない」）
import { describe, expect, it } from 'vitest'
import { tabWrap } from '../../../src/renderer/lib/focusTrap'

describe('Tab の折り返し（FR-KB2）', () => {
  it('後ろ（Shift なら前）にまだ止まれる部品があれば、ブラウザに任せる', () => {
    expect(tabWrap(3, 1, 1, false)).toBeNull()
    expect(tabWrap(3, 1, 1, true)).toBeNull()
  })
  it('末尾で Tab は先頭へ、先頭で Shift+Tab は末尾へ', () => {
    expect(tabWrap(3, 2, 0, false)).toBe(0)
    expect(tabWrap(3, 0, 2, true)).toBe(2)
  })
  it('止まれる部品が無ければ、どこへも動かさない（-1）', () => {
    expect(tabWrap(0, 0, 0, false)).toBe(-1)
  })
})
