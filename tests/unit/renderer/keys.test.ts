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
  it('欄に直に書いた Enter の処理（onkeydown={(e) => …}）は composing(e) を見る（変換を確定する Enter で決めない）', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs')
    const { join, relative, sep } = await import('node:path')
    const root = join(__dirname, '../../../src/renderer')
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((n) => {
        const p = join(d, n)
        return statSync(p).isDirectory() ? walk(p) : n.endsWith('.svelte') ? [p] : []
      })
    /** onkeydown={…} の中身（波かっこの対応を数えて切り出す） */
    const handlers = (src: string): string[] => {
      const out: string[] = []
      for (const m of src.matchAll(/onkeydown=\{/g)) {
        let depth = 1
        let i = m.index + m[0].length
        while (i < src.length && depth > 0) {
          if (src[i] === '{') depth++
          else if (src[i] === '}') depth--
          i++
        }
        out.push(src.slice(m.index + m[0].length, i - 1))
      }
      return out
    }
    const bad = walk(root).flatMap((p) =>
      handlers(readFileSync(p, 'utf8'))
        .filter((h) => /=>/.test(h) && /'Enter'/.test(h) && !/composing\(/.test(h))
        .map((h) => `${relative(root, p).split(sep).join('/')}: ${h.trim().slice(0, 60)}`),
    )
    expect(bad).toEqual([])
  })
})

describe('キーの表記の分解と、押したキーでの当たり（FR-KB7）', () => {
  it('「 / 」で別の組み合わせ、空白で並び、+ で同時押しに分ける', async () => {
    const { keyCombos } = await import('../../../src/renderer/lib/keys')
    const parts = (x: string) => keyCombos(x, '').map((alt) => alt.map((c) => c.keys))
    expect(parts('Ctrl+Shift+N / Ctrl+Z')).toEqual([[['Ctrl', 'Shift', 'N']], [['Ctrl', 'Z']]])
    expect(parts('D W M')).toEqual([[['D'], ['W'], ['M']]])
    // + と − そのものもキー
    expect(parts('+ −')).toEqual([[['+'], ['−']]])
    expect(parts('Ctrl+Alt+=')).toEqual([[['Ctrl', 'Alt', '=']]])
    expect(parts('')).toEqual([])
  })
  it('押した組み合わせに当たる組み合わせの表記だけを当てる（範囲・矢印・全角のマイナスも）', async () => {
    const { keyHits, comboHits } = await import('../../../src/renderer/lib/keys')
    expect(comboHits('Alt+1–6', 'Alt+3')).toBe(true)
    expect(comboHits('Alt+1–6', 'Alt+7')).toBe(false)
    expect(comboHits('Alt+1–6', '3')).toBe(false)
    expect(comboHits('1–9', '5')).toBe(true)
    expect(comboHits('Ctrl+1–5', 'Ctrl+3')).toBe(true)
    expect(comboHits('Arrows', '←')).toBe(true)
    expect(comboHits('Alt+Shift+Arrows', 'Alt+Shift+↓')).toBe(true)
    expect(comboHits('Ctrl+Alt+−', 'Ctrl+Alt+-')).toBe(true)
    // 修飾キーの順・大小文字によらない
    expect(comboHits('Ctrl+Shift+N', 'Shift+Ctrl+n')).toBe(true)
    expect(comboHits('Ctrl+Shift+N', 'Ctrl+N')).toBe(false)
    expect(keyHits('D W M / Alt+1–6', 'Alt+3')).toBe(true)
    expect(keyHits('D W M / Alt+1–6', 'W')).toBe(true)
    expect(keyHits('D W M / Alt+1–6', 'Ctrl+W')).toBe(false)
    expect(keyHits('', 'W')).toBe(false)
  })
})
describe('キーの表記を描く形（FR-KB7）', () => {
  it('組み合わせごとに、押したキーに当たるかの印を付ける（当たらない組み合わせは印なし）', async () => {
    const { keyCombos } = await import('../../../src/renderer/lib/keys')
    expect(keyCombos('D W M / Alt+1–6', 'Alt+3')).toEqual([
      [
        { keys: ['D'], hit: false },
        { keys: ['W'], hit: false },
        { keys: ['M'], hit: false },
      ],
      [{ keys: ['Alt', '1–6'], hit: true }],
    ])
    expect(keyCombos('Ctrl+Z', '')).toEqual([[{ keys: ['Ctrl', 'Z'], hit: false }]])
    expect(keyCombos('', 'A')).toEqual([])
  })
})
describe('キーを押して探す: 記号のキー（FR-KB7）', () => {
  it('+ は物理キーでは Shift+=（US）・Shift+;（JIS）・テンキー。− はテンキーも', async () => {
    const { comboHits, keyHits } = await import('../../../src/renderer/lib/keys')
    expect(comboHits('+', 'Shift+=')).toBe(true)
    expect(comboHits('+', 'Shift+;')).toBe(true)
    expect(comboHits('+', 'NumpadAdd')).toBe(true)
    expect(comboHits('−', 'NumpadSubtract')).toBe(true)
    expect(keyHits('+ −', 'Shift+=')).toBe(true)
    expect(comboHits('Ctrl+Alt+=', 'Ctrl+Alt+=')).toBe(true)
  })
  it('Arrows は矢印で描く', async () => {
    const { keyCombos } = await import('../../../src/renderer/lib/keys')
    expect(keyCombos('Alt+Shift+Arrows', '')).toEqual([[{ keys: ['Alt', 'Shift', '←→↑↓'], hit: false }]])
  })
})

describe('キーの割り当ての表（FR-KB6）', () => {
  it('既定と同じキーなら上書きを消す（変えた印・数に入れない）。null は既定に戻す。空は割り当てなし', async () => {
    const { withKey } = await import('../../../src/renderer/lib/keys')
    expect(withKey({ a: 'Ctrl+M' }, 'a', 'Shift+Ctrl+Enter', 'Ctrl+Shift+Enter')).toEqual({})
    expect(withKey({}, 'a', 'Ctrl+M', 'Ctrl+Shift+Enter')).toEqual({ a: 'Ctrl+M' })
    expect(withKey({ a: 'Ctrl+M' }, 'a', null, 'Ctrl+Shift+Enter')).toEqual({})
    expect(withKey({}, 'b', '', 'Ctrl+B')).toEqual({ b: '' })
  })
})

// レビューの指摘（2026-11-21）の再現
describe('キーの割り当ての表: 既定が割り当てなしの操作（FR-KB6）', () => {
  it('既定が割り当てなしの操作を外しても、上書きを残さない（変えた数に入れない）', async () => {
    const { withKey } = await import('../../../src/renderer/lib/keys')
    expect(withKey({}, 'x', '', '')).toEqual({})
    expect(withKey({ x: 'Ctrl+Alt+X' }, 'x', '', '')).toEqual({})
    // 既定のある操作を外すのは上書き（空）のまま
    expect(withKey({}, 'b', '', 'Ctrl+B')).toEqual({ b: '' })
  })
  it('割り当てられないキーの文言は、ペインの中で使うキー全体のこと（ニュースのコピーだけではない。Alt+T・Ctrl+Y も入る）', async () => {
    const { NEWS_EN, NEWS_JA } = await import('../../../src/shared/news/i18n')
    const { PANE_RESERVED } = await import('../../../src/renderer/lib/keys')
    expect(PANE_RESERVED).toContain('Alt+T')
    expect(NEWS_JA['keys.reserved']).not.toContain('ニュース')
    expect(NEWS_EN['keys.reserved']).not.toMatch(/news/i)
    expect(NEWS_JA['keys.reserved']).toContain('{key}')
    expect(NEWS_EN['keys.reserved']).toContain('{key}')
    // 日本語は助詞で終えない
    expect(NEWS_JA['keys.reserved']).not.toMatch(/[はがをにでとへもの]$/)
  })
})
