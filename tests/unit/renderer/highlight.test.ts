// 条件を選ぶダイアログ（FieldPicker）の検索語の強調（FR-FD2・FR-SC17。値はすべて架空）。
// 強調は {@html} を使わず、当たった範囲（[始め, 終わり)）を Hl.svelte に渡して描く
import { describe, expect, it } from 'vitest'
import { hlRanges, matchRange, normText } from '../../../src/renderer/lib/highlight'

describe('検索語の強調（FR-SC17）', () => {
  it('当たった所の範囲を返す。空の語・当たらない語は範囲なし', () => {
    expect(hlRanges('配当利回り', '利回り')).toEqual([[2, 5]])
    expect(hlRanges('a<b', '')).toEqual([])
    expect(hlRanges('P/E', 'xyz')).toEqual([])
  })
  it('記号を含む名前でも、元の文字の位置で返す', () => {
    expect(hlRanges('R&D', 'amp')).toEqual([])
    expect(hlRanges('R&D比率', '&d')).toEqual([[1, 3]])
    expect(hlRanges('R&D比率', '比率')).toEqual([[3, 5]])
  })
  it('全角・半角・大小文字の違いを無視し、元の文字の位置で返す（NFKC で長さが変わっても）', () => {
    expect(hlRanges('ＲＯＥ（自己資本利益率）', 'roe')).toEqual([[0, 3]])
    expect(matchRange('㍿の利益', '利益')).toEqual([2, 4]) // ㍿ は NFKC で 4 文字
    expect(hlRanges('PER', 'ｐｅ')).toEqual([[0, 2]])
  })
  it('合成される文字（半角カナ＋半角濁点・結合用の濁点）でも当たり、文字の途中で切らない', () => {
    // 半角の ｶﾞ は NFKC で 1 文字の ガ になる（コードポイントごとに正規化すると カ＋゛ になって当たらない）
    expect(matchRange('ｶﾞｽ料金', 'ガス')).toEqual([0, 3])
    expect(hlRanges('がき', 'が')).toEqual([[0, 1]])
    // 濁点の付いた文字の前半だけを囲まない（検索も全体を NFKC にするので か は が に当たらない）
    expect(matchRange('が', 'か')).toBeNull()
  })
  it('検索の当たり判定（normText）と強調が食い違わない', () => {
    for (const [s, q] of [
      ['ｶﾞｽ料金', 'ｶﾞ'],
      ['ｶﾞｽ料金', 'ガス'],
      ['がき', 'が'],
      ['ＲＯＥ', 'roe'],
      ['㍿の利益', '株式会社'],
      ['が', 'か'],
    ] as const) {
      expect(matchRange(s, q) != null).toBe(normText(s).includes(normText(q)))
    }
  })
})
