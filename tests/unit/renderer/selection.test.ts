import { describe, expect, it } from 'vitest'
import { clampSel, indexIn, LinkFollow, listCurrent, moveSel, SelectionFollow } from '../../../src/renderer/lib/selection'

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

describe('FR-KB2 一覧のキーで選ぶ位置（↑↓・PageUp/PageDown・Home/End）', () => {
  it('端で止まり、空の一覧では 0（-1 にしない）', () => {
    expect(moveSel('ArrowDown', 0, 3)).toBe(1)
    expect(moveSel('ArrowDown', 2, 3)).toBe(2)
    expect(moveSel('ArrowUp', 0, 3)).toBe(0)
    expect(moveSel('PageDown', 0, 30)).toBe(10)
    expect(moveSel('PageUp', 5, 30)).toBe(0)
    expect(moveSel('Home', 5, 30)).toBe(0)
    expect(moveSel('End', 0, 30)).toBe(29)
    for (const k of ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End']) expect(moveSel(k, 0, 0)).toBe(0)
    expect(moveSel('Enter', 1, 3)).toBeNull()
  })
})

describe('FR-KB2 FR-SC3 リンク先の銘柄の行を選ぶ（並べ替え・別の一覧では先頭のまま）', () => {
  it('リンク先が変わったら、一覧にあればその行', () => {
    const l = new LinkFollow<string>()
    expect(l.pick('b', ['a', 'b'])).toBe(1)
    expect(l.pick('c', ['a', 'b'])).toBe(-1)
    expect(l.pick('a', ['a', 'b'])).toBe(0)
    expect(l.pick(null, ['a', 'b'])).toBe(-1)
  })
  it('一覧だけが変わったとき（結果が遅れて届いた・取得で並びが変わった）も、リンク先の行', () => {
    const l = new LinkFollow<string>()
    expect(l.pick('b', [])).toBe(-1)
    expect(l.pick('b', ['a', 'b'])).toBe(1)
    expect(l.pick('b', ['b', 'a'])).toBe(0)
  })
  it('hold() のあと（並べ替え・別の一覧・★のみ表示）は、リンク先が変わるまで一覧の変化では選び直さない', () => {
    const l = new LinkFollow<string>()
    expect(l.pick('c', ['a', 'b', 'c'])).toBe(2)
    l.hold()
    expect(l.pick('c', ['c', 'b', 'a'])).toBe(-1) // 並べ替えた: 先頭のまま
    expect(l.pick('c', ['b', 'c', 'a'])).toBe(-1) // 別のスクリーンの結果が遅れて届いた・取得
    expect(l.pick('b', ['b', 'c', 'a'])).toBe(0) // ↓ で送った・銘柄ジャンプ: また追う
    expect(l.pick('b', ['c', 'b', 'a'])).toBe(1)
  })
  it('hold() のあとでも、同じ銘柄へもう一度リンクした（銘柄ジャンプ・ほかのペインが送った）ら、その行へ移る', () => {
    const l = new LinkFollow<string>()
    expect(l.pick('c', ['a', 'b', 'c'], 1)).toBe(2)
    l.hold()
    expect(l.pick('c', ['c', 'b', 'a'], 1)).toBe(-1) // 並べ替えた: 先頭のまま
    expect(l.pick('c', ['b', 'a', 'c'], 1)).toBe(-1) // 取得で並びが変わった: まだ先頭のまま
    expect(l.pick('c', ['b', 'a', 'c'], 2)).toBe(2) // 同じ c へ銘柄ジャンプ（リンクの回数が進んだ）
    expect(l.pick('c', ['c', 'b', 'a'], 2)).toBe(0) // また追う
  })
})

describe('FR-KB2 FR-L11 一覧のペインの操作の対象（★・アラートの作成）は光っている行', () => {
  it('リンク先が一覧にあれば、選んでいる行（並べ替えで先頭に戻したあと、リンク先がまだ X でも先頭の行）', () => {
    expect(listCurrent('x', ['a', 'b', 'x'], 0)).toBe('a')
    expect(listCurrent('x', ['a', 'b', 'x'], 2)).toBe('x')
  })
  it('リンク先が一覧に無ければリンク先（一覧に無い銘柄へ銘柄ジャンプした）。リンクが無ければ選んでいる行', () => {
    expect(listCurrent('z', ['a', 'b'], 1)).toBe('z')
    expect(listCurrent(null, ['a', 'b'], 1)).toBe('b')
    expect(listCurrent(undefined, ['a', 'b'], 0)).toBe('a')
    expect(listCurrent(null, [], 0)).toBeUndefined()
  })
})
