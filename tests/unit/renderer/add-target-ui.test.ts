// 銘柄ジャンプ・コマンドバーの「足す先」の振る舞いの決め方（docs/design-perf.md §5.1。L1）。
// Jump.svelte と Palette.svelte が同じ関数で決める（Enter・Ctrl+Enter・行のクリック・＋のボタン・下の段の案内）
import { describe, expect, it } from 'vitest'
import { addButton, enterAction } from '../../../src/renderer/lib/addTarget'
import type { AddTarget } from '../../../src/renderer/lib/panes'

const add = () => true
const list: AddTarget = { label: '高配当', title: '高配当 に追加して表示', add }
const fav: AddTarget = { label: '★', title: '★ に追加して表示', add, quiet: true }
const perf: AddTarget = { label: 'パフォーマンス比較', title: 'パフォーマンス比較に足す', add, primary: true, fullTitle: '5 銘柄まで' }

describe('FR-PC4 足す先と Enter', () => {
  it('Enter: 足す先が primary なら足す、ほかは表示する。Ctrl+Enter: 足す先があれば足す、無ければ何もしない', () => {
    expect(enterAction(null, false)).toBe('show')
    expect(enterAction(null, true)).toBe('none')
    expect(enterAction(list, false)).toBe('show')
    expect(enterAction(list, true)).toBe('add')
    expect(enterAction(fav, true)).toBe('add')
    expect(enterAction(perf, false)).toBe('add')
    expect(enterAction(perf, true)).toBe('add')
  })
  it('＋のボタン: quiet は出さない。満杯は薄くして満杯の説明。Enter で足す先は Ctrl+Enter の案内を出さない', () => {
    expect(addButton(null)).toBeNull()
    expect(addButton(fav)).toBeNull()
    expect(addButton(list)).toEqual({ label: '高配当', title: '高配当 に追加して表示', full: false, ctrlHint: true })
    expect(addButton(perf)).toEqual({ label: 'パフォーマンス比較', title: 'パフォーマンス比較に足す', full: false, ctrlHint: false })
    expect(addButton({ ...perf, full: true })).toMatchObject({ title: '5 銘柄まで', full: true })
  })
})
