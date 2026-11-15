import { describe, expect, it } from 'vitest'
import { clampSel, indexIn, SelectionFollow } from '../../../src/renderer/lib/selection'

describe('FR-KB2 FR-SC3 一覧で選んでいる行は銘柄で追う（取得で並びが入れ替わっても動かない）', () => {
  it('indexIn: 前の一覧の i 番目が新しい一覧の何番目か', () => {
    expect(indexIn(['a', 'b', 'c'], 1, ['c', 'b', 'a'])).toBe(1)
    expect(indexIn(['a', 'b', 'c'], 0, ['c', 'b', 'a'])).toBe(2)
    expect(indexIn(['a', 'b'], 1, ['a'])).toBe(-1)
    expect(indexIn(['a'], 5, ['a'])).toBe(-1)
    const o = [{ id: 'x' }, { id: 'y' }]
    expect(indexIn(o, 0, [{ id: 'y' }, { id: 'x' }], (r) => r.id)).toBe(1)
  })
  it('clampSel: 短くなったら最後に寄せる・空なら 0', () => {
    expect(clampSel(5, 3)).toBe(2)
    expect(clampSel(1, 3)).toBe(1)
    expect(clampSel(2, 0)).toBe(0)
  })
  it('一覧だけが変わったら、前に選んでいた銘柄の位置へ移る', () => {
    const f = new SelectionFollow<string>()
    f.sync(['a', 'b', 'c'], 0)
    expect(f.sync(['a', 'b', 'c'], 1)).toEqual({ sel: 1, anchor: -1 }) // ↓ で b
    expect(f.sync(['b', 'c', 'a'], 1).sel).toBe(0) // 値が変わって b が先頭に
    expect(f.sync(['c', 'a', 'b'], 0).sel).toBe(2)
  })
  it('選んでいた銘柄が消えたら、同じ位置（短くなれば最後）に残る', () => {
    const f = new SelectionFollow<string>()
    f.sync(['a', 'b', 'c'], 2)
    expect(f.sync(['a', 'b'], 2).sel).toBe(1)
    f.sync(['a', 'b', 'c'], 1)
    expect(f.sync(['a', 'c'], 1).sel).toBe(1)
    expect(f.sync([], 1).sel).toBe(0)
  })
  it('位置も同時に変えた（行を動かした・押した）ときはその位置のまま', () => {
    const f = new SelectionFollow<string>()
    f.sync(['a', 'b', 'c'], 0)
    expect(f.sync(['b', 'a', 'c'], 1).sel).toBe(1) // a を 1 つ下へ動かした
  })
  it('reset() のあとは追わない（並べ替え・別の一覧で先頭から）。次の取得からはまた追う', () => {
    const f = new SelectionFollow<string>()
    f.sync(['a', 'b', 'c'], 0)
    f.reset()
    expect(f.sync(['c', 'b', 'a'], 0).sel).toBe(0) // 並べ替えて先頭の c
    expect(f.sync(['a', 'c', 'b'], 0).sel).toBe(1) // 取得で入れ替わったら c を追う
  })
  it('reset() で一覧が変わらなかったときも、効き目は次の描き直しまで（後の取得では追う）', async () => {
    const f = new SelectionFollow<string>()
    f.sync(['a', 'b', 'c'], 0)
    f.reset()
    await Promise.resolve()
    expect(f.sync(['b', 'a', 'c'], 0).sel).toBe(1)
  })
  it('複数選択の起点も銘柄で追う（消えたら 1 行だけの選択に）', () => {
    const f = new SelectionFollow<string>()
    f.sync(['a', 'b', 'c', 'd'], 2, 0)
    expect(f.sync(['d', 'c', 'b', 'a'], 2, 0)).toEqual({ sel: 1, anchor: 3 })
    expect(f.sync(['b', 'c'], 1, 3)).toEqual({ sel: 1, anchor: -1 })
  })
  it('キーで動かしただけ（一覧はそのまま）なら、その位置を受け取る', () => {
    const rows = ['a', 'b', 'c']
    const f = new SelectionFollow<string>()
    f.sync(rows, 0)
    expect(f.sync(rows, 2).sel).toBe(2)
    expect(f.sync(rows, 9).sel).toBe(2)
  })
})
