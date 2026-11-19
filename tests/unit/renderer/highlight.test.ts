// 条件を選ぶダイアログ（FieldPicker）の検索語の強調（FR-FD2・FR-SC17。値はすべて架空）
import { describe, expect, it } from 'vitest'
import { highlightHtml, matchRange, normText } from '../../../src/renderer/lib/highlight'

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
  it('合成される文字（半角カナ＋半角濁点・結合用の濁点）でも当たり、文字の途中で切らない', () => {
    // 半角の ｶﾞ は NFKC で 1 文字の ガ になる（コードポイントごとに正規化すると カ＋゛ になって当たらない）
    expect(matchRange('ｶﾞｽ料金', 'ガス')).toEqual([0, 3])
    expect(highlightHtml('ｶﾞｽ料金', 'ガス')).toBe('<mark>ｶﾞｽ</mark>料金')
    expect(highlightHtml('がき', 'が')).toBe('<mark>が</mark>き')
    // 濁点の付いた文字の前半だけを囲まない（検索も全体を NFKC にするので か は が に当たらない）
    expect(matchRange('が', 'か')).toBeNull()
  })
  it('検索の当たり判定（normText）と強調が食い違わない', () => {
    for (const [s, q] of [
      ['ｶﾞｽ料金', 'ｶﾞ'],
      ['ｶﾞｽ料金', 'ガス'],
      ['がき', 'が'],
      ['ＲＯＥ', 'roe'],
      ['㍿の利益', '株式会社'],
      ['が', 'か'],
    ] as const) {
      expect(matchRange(s, q) != null).toBe(normText(s).includes(normText(q)))
    }
  })
})
