// キーの表記と照合（FR-KB5, KB6）・ツリーマップの配置
import { describe, expect, it } from 'vitest'
import { assignable, eventKey, normalizeKey } from '../../../src/renderer/lib/keys'
import { neighbor, sectorMembers, squarify } from '../../../src/renderer/lib/treemap'

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

describe('ヒートマップの業種のタイルで選ぶ銘柄（FR-W4）', () => {
  it('タイルに描いた銘柄だけ（★のみ表示なら★の銘柄だけ）。業種の無い銘柄は「—」のタイル', () => {
    const sec: Record<string, string> = { a: '銀行業', b: '銀行業', c: '', d: '輸送用機器' }
    const pool = ['a', 'c', 'd'] // ★のみ表示で b は出ていない
    expect(sectorMembers(pool, '銀行業', (x) => sec[x])).toEqual(['a'])
    expect(sectorMembers(pool, '—', (x) => sec[x])).toEqual(['c'])
    expect(sectorMembers(pool, '電気機器', (x) => sec[x])).toEqual([])
  })
})

describe('IME の変換中の判定をそろえる（FR-KB5）', () => {
  it('composing: isComposing に加え、変換を始めるキー（keyCode 229）も変換中とみなす', async () => {
    const { composing } = await import('../../../src/renderer/lib/keys')
    expect(composing({ isComposing: true, keyCode: 13 })).toBe(true)
    expect(composing({ isComposing: false, keyCode: 229 })).toBe(true)
    expect(composing({ isComposing: false, keyCode: 13 })).toBe(false)
  })
  it('renderer のキー処理は e.isComposing を直に読まず、composing(e) を通す（keyCode 229 の取りこぼしをなくす）', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs')
    const { join, relative, sep } = await import('node:path')
    const root = join(__dirname, '../../../src/renderer')
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((n) => {
        const p = join(d, n)
        return statSync(p).isDirectory() ? walk(p) : /\.(ts|svelte)$/.test(n) ? [p] : []
      })
    const bad = walk(root)
      .filter((p) => !p.endsWith(join('lib', 'keys.ts')))
      .filter((p) => /\.isComposing\b/.test(readFileSync(p, 'utf8')))
      .map((p) => relative(root, p).split(sep).join('/'))
    expect(bad).toEqual([])
  })
})
