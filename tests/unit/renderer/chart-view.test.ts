// チャートの凡例の足と、作り直したときの表示期間（§7, FR-C1・C3。レビューの指摘）。値はすべて架空
import { describe, expect, it } from 'vitest'
import { legendBar, legendIndex, rangeAfterBuild } from '../../../src/renderer/lib/chartView'

const times = ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']

describe('凡例の足（FR-C3）', () => {
  it('十字線の日付の足を出す', () => {
    expect(legendIndex('2026-11-11', times)).toBe(1)
    expect(legendIndex('2026-11-13', times)).toBe(3)
  })
  it('一目の先行スパンの未来（足に無い日付）は null（-1 にしない。凡例は最後の足）', () => {
    expect(legendIndex('2026-12-18', times)).toBeNull()
    expect(legendBar(legendIndex('2026-12-18', times), times.length)).toBe(3)
  })
  it('十字線が無いときは null', () => {
    expect(legendIndex(null, times)).toBeNull()
    expect(legendIndex(undefined, times)).toBeNull()
    expect(legendIndex('', times)).toBeNull()
  })
  it('凡例の足: 範囲の外・負・null は最後の足、足が無ければ null', () => {
    expect(legendBar(2, 4)).toBe(2)
    expect(legendBar(0, 4)).toBe(0)
    expect(legendBar(-1, 4)).toBe(3)
    expect(legendBar(4, 4)).toBe(3)
    expect(legendBar(null, 4)).toBe(3)
    expect(legendBar(null, 0)).toBeNull()
    expect(legendBar(3, 0)).toBeNull()
  })
})

describe('作り直したときの表示期間（§7, FR-C1）', () => {
  it('同じ時間軸の作り直し（指標・調整・データの更新）は前の表示を保つ', () => {
    expect(rangeAfterBuild({ from: 610, to: 753 }, 'D', 'D', 750, 140)).toEqual({ from: 610, to: 753 })
  })
  it('日足 → 月足: 日足の論理番号を持ち越さず、末尾から表示する（未来の空白へ飛ばない）', () => {
    const r = rangeAfterBuild({ from: 610, to: 753 }, 'D', 'M', 36, 160)
    expect(r).toEqual({ from: 0, to: 39 })
    expect(r.from).toBeLessThan(36)
  })
  it('月足 → 日足: 最古の足ではなく末尾から表示する', () => {
    expect(rangeAfterBuild({ from: 0, to: 39 }, 'M', 'D', 750, 140)).toEqual({ from: 610, to: 753 })
  })
  it('初めて描く（前の時間軸が無い・前の表示が無い）ときは末尾から', () => {
    expect(rangeAfterBuild(null, null, 'W', 160, 110)).toEqual({ from: 50, to: 163 })
    expect(rangeAfterBuild(null, 'W', 'W', 160, 110)).toEqual({ from: 50, to: 163 })
    expect(rangeAfterBuild({ from: 1, to: 2 }, null, 'W', 160, 110)).toEqual({ from: 50, to: 163 })
  })
})
