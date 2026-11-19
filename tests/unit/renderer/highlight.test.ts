// 条件を選ぶダイアログ（FieldPicker）の検索語の強調（FR-FD2・FR-SC17。値はすべて架空）
import { describe, expect, it } from 'vitest'
import { highlightHtml, matchRange } from '../../../src/renderer/lib/highlight'

describe('検索語の強調（FR-SC17）', () => {
  it('当たった所を <mark> で囲み、ほかはエスケープする', () => {
    expect(highlightHtml('配当利回り', '利回り')).toBe('配当<mark>利回り</mark>')
    expect(highlightHtml('a<b', '')).toBe('a&lt;b')
    expect(highlightHtml('P/E', 'xyz')).toBe('P/E')
  })
  it('& を含む名前で、エスケープした文字（&amp;）の中を囲まない', () => {
    expect(highlightHtml('R&D', 'amp')).toBe('R&amp;D')
    expect(highlightHtml('R&D比率', '&d')).toBe('R<mark>&amp;D</mark>比率')
    expect(highlightHtml('R&D比率', '比率')).toBe('R&amp;D<mark>比率</mark>')
  })
  it('全角・半角・大小文字の違いを無視し、元の文字の位置で囲む（NFKC で長さが変わっても）', () => {
    expect(highlightHtml('ＲＯＥ（自己資本利益率）', 'roe')).toBe('<mark>ＲＯＥ</mark>（自己資本利益率）')
    expect(matchRange('㍿の利益', '利益')).toEqual([2, 4]) // ㍿ は NFKC で 4 文字
    expect(highlightHtml('㍿の利益', '利益')).toBe('㍿の<mark>利益</mark>')
    expect(highlightHtml('PER', 'ｐｅ')).toBe('<mark>PE</mark>R')
  })
})
