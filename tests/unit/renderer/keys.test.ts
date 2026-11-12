// キーの表記と照合（FR-KB5, KB6）・ツリーマップの配置
import { describe, expect, it } from 'vitest'
import { assignable, eventKey, normalizeKey } from '../../../src/renderer/lib/keys'
import { neighbor, squarify } from '../../../src/renderer/lib/treemap'

const ev = (code: string, m: Partial<KeyboardEvent> = {}) =>
  ({ code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...m }) as KeyboardEvent
describe('キー', () => {
  it('物理キーから表記を作り、修飾キーの順をそろえる', () => {
    expect(eventKey(ev('KeyK', { ctrlKey: true, shiftKey: true }))).toBe('Ctrl+Shift+K')
    expect(eventKey(ev('Digit1', { ctrlKey: true, shiftKey: true }))).toBe('Ctrl+Shift+1')
    expect(eventKey(ev('ShiftLeft', { shiftKey: true }))).toBeNull()
    expect(normalizeKey('shift+ctrl+k')).toBe('Ctrl+Shift+K')
  })
  it('単キーはアプリ全体の割り当てに使わせない（F キーは可）', () => {
    expect(assignable('S')).toBe(false)
    expect(assignable('Shift+S')).toBe(false)
    expect(assignable('F9')).toBe(true)
    expect(assignable('Ctrl+Alt+J')).toBe(true)
  })
})
describe('ツリーマップ', () => {
  it('面積は値に比例し、枠からはみ出さない', () => {
    const r = squarify([6, 6, 4, 3, 2, 2, 1], (x) => x, { x: 0, y: 0, w: 600, h: 400 })
    const total = r.reduce((s, p) => s + p.w * p.h, 0)
    expect(total).toBeCloseTo(600 * 400, 0)
    expect(r[0]!.w * r[0]!.h).toBeCloseTo((6 / 24) * 600 * 400, 0)
    for (const p of r) expect(p.x + p.w).toBeLessThanOrEqual(600.001)
    expect(neighbor(r, 0, 'right')).not.toBe(0)
  })
})
