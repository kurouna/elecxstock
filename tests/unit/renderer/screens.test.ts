// スクリーンの一覧とグリッドの「今のスクリーン」（FR-SC4, SC6, SC13, FR-G1）
import type { SavedScreen } from '@shared/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { stubWindow } from '../../support/window'

stubWindow()
const { app } = await import('../../../src/renderer/stores/app.svelte')
const L = await import('../../../src/renderer/stores/layout.svelte')
const S = await import('../../../src/renderer/lib/screens')
const { openInGrid } = await import('../../../src/renderer/lib/commands')

const scr = (id: string, value: number): SavedScreen =>
  ({ id, name: { ja: id, en: id }, conditions: [{ field: 'income.yield', op: '>=', value }], created: 1, updated: 1 }) as SavedScreen
const screenerPane = () => L.allPanes(L.layout.entry, false).find((p) => p.widget === 'screener')!

describe('スクリーンを消す（FR-SC4）', () => {
  it('開いているスクリーンを消したら、そのペインは残った最初のスクリーンを開く（「無題」にしない）', () => {
    app.screens = [scr('a', 3), scr('b', 4)]
    L.layout.doc = L.defaultDoc()
    L.setPreset('screener')
    const p = screenerPane()
    L.patchState(p, { screenId: 'a', conds: [{ field: 'income.yield', op: '>=', value: 3.3 }] })
    S.removeScreen('a')
    expect(app.screens.map((x) => x.id)).toEqual(['b'])
    expect(p.state.screenId).toBe('b')
    expect(S.condsOf(p)).toEqual([{ field: 'income.yield', op: '>=', value: 4 }])
    expect(S.isDirty(p)).toBe(false)
  })
})

describe('グリッドの「今のスクリーン」（FR-SC6, FR-G1）', () => {
  it('スクリーナーで条件をすべて消したら、グリッドも条件なし（全銘柄）。まだ触っていなければ最初のスクリーン', () => {
    app.screens = [scr('a', 3)]
    app.liveConds = null
    expect(S.liveConditions()).toEqual([{ field: 'income.yield', op: '>=', value: 3 }])
    app.liveConds = []
    expect(S.liveConditions()).toEqual([])
  })
  it('グリッドで開くと、条件をまだ変えていないスクリーンでも、その条件をグリッドに渡す', () => {
    app.screens = [scr('a', 3), scr('b', 4)]
    app.liveConds = null
    L.layout.doc = L.defaultDoc()
    L.setPreset('screener')
    const p = screenerPane()
    L.patchState(p, { screenId: 'b', conds: undefined })
    app.focus = p.id
    openInGrid()
    expect(app.liveConds).toEqual([{ field: 'income.yield', op: '>=', value: 4 }])
    expect(app.liveScreenId).toBe('b') // スクリーンを消したとき、表示中のものかを見分ける
  })
})

describe('既定のスクリーンを戻す（FR-SC15）', () => {
  const defs = [scr('d1', 3), scr('d2', 4), scr('d3', 5)]
  it('消したものだけを既定の並びで返す', () => {
    expect(S.missingDefaults(defs, [scr('d2', 4), scr('mine', 1)]).map((s) => s.id)).toEqual(['d1', 'd3'])
  })
  it('すべてあれば空（案内を出さない）。編集したもの（同じ ID）は「ある」とみなす', () => {
    expect(S.missingDefaults(defs, [scr('d3', 9), scr('d1', 9), scr('d2', 9)])).toEqual([])
  })
  it('既定がまだ届いていなければ空', () => {
    expect(S.missingDefaults([], [])).toEqual([])
  })
})

describe('スクリーンを消したあとのグリッドの条件（FR-SC4, FR-G1）', () => {
  beforeEach(() => {
    app.liveConds = null
    app.liveScreenId = null
  })
  it('スクリーナーで開いていたスクリーンを消したら、グリッドの「今のスクリーン」も残った最初のスクリーンに替わる', () => {
    app.screens = [scr('a', 3), scr('b', 4)]
    L.layout.doc = L.defaultDoc()
    L.setPreset('screener')
    const p = screenerPane()
    L.patchState(p, { screenId: 'a', conds: [{ field: 'income.yield', op: '>=', value: 3 }] })
    app.liveConds = [{ field: 'income.yield', op: '>=', value: 3 }]
    S.removeScreen('a')
    expect(S.liveConditions()).toEqual([{ field: 'income.yield', op: '>=', value: 4 }])
  })
  it('開いていないスクリーンを消しても、グリッドの条件は変えない', () => {
    app.screens = [scr('a', 3), scr('b', 4)]
    L.layout.doc = L.defaultDoc()
    L.setPreset('screener')
    L.patchState(screenerPane(), { screenId: 'a', conds: [{ field: 'income.yield', op: '>=', value: 3.5 }] })
    app.liveConds = [{ field: 'income.yield', op: '>=', value: 3.5 }]
    app.liveScreenId = 'a'
    S.removeScreen('b')
    expect(S.liveConditions()).toEqual([{ field: 'income.yield', op: '>=', value: 3.5 }])
  })
  /** スクリーナーのタブで a を直している最中に、グリッドのドロワーのスクリーナーが開いている b を消す */
  function editingAWhileOtherOpensB(liveScreenId: string | null) {
    app.screens = [scr('a', 3), scr('b', 4), scr('c', 5)]
    L.layout.doc = L.defaultDoc()
    L.setPreset('screener')
    const editing = [{ field: 'income.yield', op: '>=', value: 3.7 }] as const
    S.setConds(screenerPane(), [{ ...editing[0] }])
    L.patchState(screenerPane(), { screenId: 'a' })
    app.liveScreenId = liveScreenId
    const other = L.layout.doc.entries.grid.docks.left!.panes.find((p) => p.widget === 'screener')!
    L.patchState(other, { screenId: 'b', conds: [{ field: 'income.yield', op: '>=', value: 4 }] })
    S.removeScreen('b')
    return { other, editing }
  }
  it('別の場所のスクリーナーが開いていたスクリーンを消しても、表示中のスクリーンの直しかけの条件は残す', () => {
    const { other, editing } = editingAWhileOtherOpensB('a')
    expect(S.liveConditions()).toEqual(editing)
    expect(app.liveScreenId).toBe('a')
    expect(other.state.screenId).toBe('a') // 消したスクリーンを開いていたペインは、残った最初のスクリーンを開く
  })
  it('まだスクリーンを開き直していない（liveScreenId が無い）ときも、今のタブのペインが開いていなければ残す', () => {
    const { editing } = editingAWhileOtherOpensB(null)
    expect(S.liveConditions()).toEqual(editing)
    expect(app.liveScreenId).toBeNull()
  })
  it('別のペインで b を開いたあと、スクリーナーで a の条件を直したら、b を消してもその直しかけを残す', async () => {
    app.screens = [scr('a', 3), scr('b', 4)]
    L.layout.doc = L.defaultDoc()
    L.setPreset('grid')
    const other = L.layout.entry.docks.left!.panes.find((p) => p.widget === 'screener')!
    await S.openScreen(other, 'b')
    expect(app.liveScreenId).toBe('b')
    L.setPreset('screener')
    L.patchState(screenerPane(), { screenId: 'a' })
    S.setConds(screenerPane(), [{ field: 'income.yield', op: '>=', value: 3.9 }])
    S.removeScreen('b')
    expect(S.liveConditions()).toEqual([{ field: 'income.yield', op: '>=', value: 3.9 }])
    expect(app.liveScreenId).toBe('a')
  })
  it('liveScreenId が無く、今のタブのスクリーナーが消したスクリーンを開いていたら、残った最初のスクリーンに替える', () => {
    app.screens = [scr('a', 3), scr('b', 4)]
    L.layout.doc = L.defaultDoc()
    L.setPreset('screener')
    L.patchState(screenerPane(), { screenId: 'b' })
    S.setConds(screenerPane(), [{ field: 'income.yield', op: '>=', value: 4.2 }])
    app.liveScreenId = null
    S.removeScreen('b')
    expect(S.liveConditions()).toEqual([{ field: 'income.yield', op: '>=', value: 3 }])
    expect(app.liveScreenId).toBe('a')
  })
})

describe('スクリーンの ID（FR-SC4, SC12）', () => {
  it('同じミリ秒に続けて作っても重ならない', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000)
    app.screens = []
    const a = S.newScreenId()
    app.screens = [{ ...scr('x', 1), id: a }]
    const b = S.newScreenId()
    now.mockRestore()
    expect(a).not.toBe(b)
  })
})

describe('スクリーニング条件の一覧の絞り込み（FR-SC12）', () => {
  it('名前に当たれば印の位置を返し、並びは保存の順のまま。条件の指標の名前でも当たる', () => {
    const ss = [scr('配当', 3), { ...scr('成長', 4), conditions: [{ field: 'price.chgPct', op: '>=', value: 1 }] } as SavedScreen]
    const all = S.screenRows(ss, '')
    expect(all.map((r) => r.s.id)).toEqual(['配当', '成長'])
    const hit = S.screenRows(ss, '配当')
    expect(hit.map((r) => [r.s.id, r.ranges])).toEqual([['配当', [[0, 2]]]])
    // 指標の名前（実績利回り）でも当たる。名前には印を付けない
    expect(S.screenRows(ss, '利回り').map((r) => [r.s.id, r.ranges])).toEqual([['配当', []]])
    expect(S.screenRows(ss, 'zzz')).toEqual([])
  })
})
