// スクリーンの結果と一覧の列を変えうる状態（SCREEN_INPUTS。docs/test-plan.md §8.1）が、指標の材料をすべて含むこと（FR-SC, FR-H）。
// スクリーナー・グリッド・ウォッチリストは screenInputs() を読んで再計算するので、材料を足したらここに入れないと走り直さない
import { FIELDS, usable } from '@shared/fields'
import { describe, expect, it } from 'vitest'
import { stubWindow } from '../../support/window'

stubWindow()
const { SCREEN_INPUTS, screenInputs, app } = await import('../../../src/renderer/stores/app.svelte')

/** 指標の材料 → それを持つ状態 */
function inputsOf(f: (typeof FIELDS)[number]): string[] {
  const out: string[] = []
  if (f.source.kind === 'metrics' || f.source.kind === 'compute') out.push('dataVersion')
  if (f.source.kind === 'user') out.push(f.id === 'user.held' ? 'holdings' : 'watchlists')
  if (f.requires?.includes('holdings')) out.push('holdings')
  return out
}

describe('再計算のきっかけ（FR-SC, FR-H）', () => {
  it('すべての指標の材料が SCREEN_INPUTS に入っている', () => {
    for (const f of FIELDS.filter((x) => usable(x))) for (const k of inputsOf(f)) expect(SCREEN_INPUTS, f.id).toContain(k)
  })
  it('screenInputs() は今の状態を返す（保有・ウォッチリスト・データの版を変えると変わる）', () => {
    const before = screenInputs()
    app.holdings = [{ code: '7203', account: 'tokutei', quantity: 1, avgCost: 1 }]
    app.dataVersion++
    const after = screenInputs()
    expect(after[SCREEN_INPUTS.indexOf('holdings')]).not.toBe(before[SCREEN_INPUTS.indexOf('holdings')])
    expect(after[SCREEN_INPUTS.indexOf('dataVersion')]).not.toBe(before[SCREEN_INPUTS.indexOf('dataVersion')])
  })
  it('★・ウォッチリストの入れ外し（同じ配列の items の書き換え）でも変わる', () => {
    app.watchlists = [{ id: 'favorites', builtin: 'favorites', name: { ja: '★', en: '★' }, items: [] }]
    const w = SCREEN_INPUTS.indexOf('watchlists')
    const before = screenInputs()[w]
    app.watchlists[0]!.items.push('JP:7203')
    expect(screenInputs()[w]).not.toEqual(before)
  })
})
