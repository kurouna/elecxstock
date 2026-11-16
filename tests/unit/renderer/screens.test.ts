// スクリーンの一覧とグリッドの「今のスクリーン」（FR-SC4, SC6, SC13, FR-G1）
import type { SavedScreen } from '@shared/types'
import { describe, expect, it } from 'vitest'
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
