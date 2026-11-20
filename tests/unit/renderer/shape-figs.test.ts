// 選ぶダイアログの形の図（新しいページ・新しいウィンドウの初めの形。FR-L14・FR-L7）: 選択肢の ID から図を引く
import { describe, expect, it } from 'vitest'
import { SHAPE_FIG, shapeFigOf } from '../../../src/renderer/lib/shapeFigs'

describe('形の選択肢の図（FR-L14, FR-L7）', () => {
  it('新しいウィンドウの形（前回の配置・ページの写し）も図を引ける', () => {
    expect(shapeFigOf('grid')).toBe('grid')
    expect(shapeFigOf('free:grid')).toBe('grid')
    expect(shapeFigOf('last')).toBe('last')
    expect(shapeFigOf('page:abc-1')).toBe('page')
    expect(shapeFigOf('preset:free')).toBe('free')
  })
  it('形でない ID は図を持たない', () => {
    expect(shapeFigOf('x:save')).toBeUndefined()
    expect(shapeFigOf('free:unknown')).toBeUndefined()
  })
  it('図は枠から始まり、56×36 の中に収まる', () => {
    for (const [k, fig] of Object.entries(SHAPE_FIG)) {
      expect(fig[0]?.[1], k).toBe('fr')
      for (const [d] of fig)
        for (const n of d.match(/-?\d+(\.\d+)?/g) ?? []) expect(Math.abs(Number(n)), `${k}: ${d}`).toBeLessThanOrEqual(56)
    }
  })
})
