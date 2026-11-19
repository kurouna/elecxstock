// チャートグリッドの操作の対象と並べ替え（FR-G7・G10。レビューの指摘）。銘柄のコードだけで、値は使わない
import { describe, expect, it } from 'vitest'
import { afterRemove, appendLimited, gridTarget, pageOf, selOnClick, swapInOwn } from '../../../src/renderer/lib/gridNav'

describe('操作の対象のタイル（FR-G7）', () => {
  it('拡大していなければ選んでいるタイル', () => {
    expect(gridTarget(null, ['A', 'B', 'C'], 1)).toBe('B')
  })
  it('拡大中は、拡大する前に選んでいた位置（sel）が 0 でなくても、拡大している銘柄', () => {
    // 拡大中の見えている並びは 1 枚だけ（shown = [zoom]）。sel は拡大する前の 5 のまま
    expect(gridTarget('F', ['F'], 5)).toBe('F')
  })
  it('タイルが無ければ undefined', () => {
    expect(gridTarget(null, [], 0)).toBeUndefined()
  })
})

describe('Alt+← → の並べ替え（FR-G10）', () => {
  const own = ['A', 'B', 'C', 'D', 'E', 'F']
  it('隣と入れ替え、動かした先の位置を返す', () => {
    expect(swapInOwn(own, own, 2, 1)).toEqual({ own: ['A', 'B', 'D', 'C', 'E', 'F'], at: 3 })
    expect(swapInOwn(own, own, 2, -1)).toEqual({ own: ['A', 'C', 'B', 'D', 'E', 'F'], at: 1 })
  })
  it('端では何もしない', () => {
    expect(swapInOwn(own, own, 0, -1)).toBeNull()
    expect(swapInOwn(own, own, 5, 1)).toBeNull()
  })
  it('★・◆で絞り込んでいるときは、見えている隣の銘柄と入れ替える（own の同じ位置の別の銘柄と入れ替えない）', () => {
    const codes = ['B', 'D', 'F'] // 絞り込んだ並び
    const r = swapInOwn(own, codes, 1, 1) // D を右（F）と
    expect(r).toEqual({ own: ['A', 'B', 'C', 'F', 'E', 'D'], at: 2 })
  })
  it('ページの端を越えたら、次のページの先頭を選ぶ（選択がページの外に出ない）', () => {
    const r = swapInOwn(own, own, 3, 1)! // 2×2 の 1 ページ目の最後 → 2 ページ目
    expect(pageOf(r.at, 4)).toEqual({ page: 1, sel: 0 })
    const l = swapInOwn(own, own, 4, -1)! // 2 ページ目の先頭 → 1 ページ目の最後
    expect(pageOf(l.at, 4)).toEqual({ page: 0, sel: 3 })
  })
})

describe('マーケットの小さなチャートに足す（FR-U6。レビューの指摘）', () => {
  it('上限に達していたら足さず full（「追加」と知らせない）', () => {
    const full = Array.from({ length: 12 }, (_, i) => `JP:${1300 + i}`)
    expect(appendLimited(full, 'JP:9999', 12)).toEqual({ ids: full, result: 'full' })
  })
  it('上限の手前なら末尾に足す。もうあれば exists', () => {
    expect(appendLimited(['A', 'B'], 'C', 12)).toEqual({ ids: ['A', 'B', 'C'], result: 'added' })
    expect(appendLimited(['A', 'B'], 'A', 12)).toEqual({ ids: ['A', 'B'], result: 'exists' })
    // 上限ちょうどで、もうある銘柄は exists（full より先）
    expect(appendLimited(['A', 'B'], 'B', 2).result).toBe('exists')
  })
})

describe('拡大中のタイルの操作（FR-G7・G10。レビュー 3 回目）', () => {
  it('拡大している銘柄を外す（Delete・✕）と格子に戻り、選んでいた位置は保つ', () => {
    expect(afterRemove('F', 'F', 5)).toEqual({ zoom: null, sel: 5 })
  })
  it('拡大していなければ、外したあとは 1 つ前のタイルを選ぶ（先頭では先頭）', () => {
    expect(afterRemove(null, 'C', 2)).toEqual({ zoom: null, sel: 1 })
    expect(afterRemove(null, 'A', 0)).toEqual({ zoom: null, sel: 0 })
  })
  it('拡大中のタイル・★・◆のクリックは、拡大する前の位置（sel）を変えない（見えている 1 枚の位置は 0）', () => {
    expect(selOnClick('F', 5, 0)).toBe(5)
    expect(selOnClick(null, 5, 2)).toBe(2)
  })
})
