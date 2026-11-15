// 幅の狭い一覧の列（FR-V12・FR-SC3）: ★・コード・銘柄名は残し、銘柄名の幅を取ってから、右の列から順に外す
import { describe, expect, it } from 'vitest'
import { stubWindow } from '../../support/window'

stubWindow()
const { DEFAULT_COLUMNS, fitColumns, NAME_MIN, resolveColumns } = await import('../../../src/renderer/lib/columns')

const all = resolveColumns(DEFAULT_COLUMNS.screener, [])
const ids = (w: number) => fitColumns(all, w).map((c) => c.id)
const total = all.reduce((s, c) => s + (c.w ?? NAME_MIN), 0)

describe('幅に収まる列（FR-V12, FR-SC3）', () => {
  it('広ければすべての列を出す', () => {
    expect(ids(total + 40)).toEqual(all.map((c) => c.id))
  })
  it('狭いと右の列から外し、★・コード・銘柄名は必ず残す。銘柄名の幅を取る', () => {
    const w = 420
    const fit = fitColumns(all, w)
    expect(fit.slice(0, 3).map((c) => c.id)).toEqual(['star', 'code', 'name'])
    expect(fit.reduce((s, c) => s + (c.w ?? NAME_MIN), 0)).toBeLessThanOrEqual(w)
    // 外したのは右の列（左の列ほど残る）
    expect(all.map((c) => c.id).slice(0, fit.length)).toEqual(fit.map((c) => c.id))
    expect(fit.length).toBeLessThan(all.length)
  })
  it('とても狭くても、★・コード・銘柄名の 3 列は残す', () => {
    expect(ids(80)).toEqual(['star', 'code', 'name'])
  })
})
