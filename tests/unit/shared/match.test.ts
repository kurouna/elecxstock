// 探して選ぶダイアログの照合（コマンドバー・ショートカット一覧・ペインの種類・設定。docs/design-dialogs.md §2）
import { describe, expect, it } from 'vitest'
import { fold, matchText, rankBy, segments } from '../../../src/shared/match'

const hits = (text: string, q: string) => {
  const m = matchText(q, text)
  return m
    ? segments(text, m.ranges)
        .filter((s) => s.hit)
        .map((s) => s.text)
    : null
}

describe('照合（FR-KB1, KB7）', () => {
  it('NFKC・小文字・カタカナをひらがなに寄せて比べる', () => {
    expect(fold('ＡＢＣ')).toBe('abc')
    expect(fold('ヒートマップ')).toBe('ひーとまっぷ')
    expect(hits('ヒートマップ', 'ひーと')).toEqual(['ヒート'])
    expect(hits('トヨタ自動車', 'とよた')).toEqual(['トヨタ'])
    expect(hits('Alert', 'ALE')).toEqual(['Ale'])
  })
  it('空白で分けた語をすべて含むものだけ残す（AND）。どこが当たったかを元の文字の位置で返す', () => {
    expect(hits('保有の記録を JSON に書き出す', '保有 書き出')).toEqual(['保有', '書き出'])
    expect(matchText('保有 読み込', '保有の記録を JSON に書き出す')).toBeNull()
    // 全角の空白でも分ける
    expect(hits('保有の記録を JSON に書き出す', '保有　json')).toEqual(['保有', 'JSON'])
  })
  it('空の語はすべてに当たり、範囲は無い', () => {
    expect(matchText('', 'なんでも')).toEqual({ score: 0, ranges: [] })
    expect(matchText('   ', 'なんでも')).toEqual({ score: 0, ranges: [] })
  })
  it('別名でも当てるが、強調はしない。点数は名前で当たるより低い', () => {
    const byAlias = matchText('株価ボード', 'ヒートマップ', ['株価ボード', 'カード'])
    expect(byAlias).not.toBeNull()
    expect(byAlias!.ranges).toEqual([])
    const byName = matchText('ヒート', 'ヒートマップ', ['株価ボード'])
    expect(byName!.score).toBeGreaterThan(byAlias!.score)
    expect(matchText('株価ボード', 'ヒートマップ')).toBeNull()
  })
  it('語の頭で当たったものを上に（頭 > 区切りのあと > 中ほど）', () => {
    const head = matchText('書き', '書き出す')!.score
    const afterSep = matchText('書き', '保有・書き出す')!.score
    const mid = matchText('書き', '保有の書き出す')!.score
    expect(head).toBeGreaterThan(afterSep)
    expect(afterSep).toBeGreaterThan(mid)
  })
  it('合成される文字や長さの変わる文字でも、元の文字の境で切る', () => {
    expect(hits('ｶﾞｲﾄﾞ', 'ガイ')).toEqual(['ｶﾞｲ'])
    expect(hits('㍿テスト', '株式会社')).toEqual(['㍿'])
  })
  it('segments: 範囲が重なっても文字を落とさず、順に区切る', () => {
    const segs = segments('abcdef', [
      [1, 3],
      [2, 4],
    ])
    expect(segs.map((s) => s.text).join('')).toBe('abcdef')
    expect(segs).toEqual([
      { text: 'a', hit: false },
      { text: 'bcd', hit: true },
      { text: 'ef', hit: false },
    ])
    expect(segments('abc', [])).toEqual([{ text: 'abc', hit: false }])
    expect(segments('', [])).toEqual([])
  })
  it('rankBy: 当たったものだけを点数の順に（同じ点数は元の順）', () => {
    const items = ['保有の書き出し', '書き出す', 'ほかのもの', '一覧を書き出す']
    const r = rankBy('書き出', items, (x) => x)
    expect(r.map((x) => x.item)).toEqual(['書き出す', '保有の書き出し', '一覧を書き出す'])
    expect(rankBy('', items, (x) => x).map((x) => x.item)).toEqual(items)
  })
})
