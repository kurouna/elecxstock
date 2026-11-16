// タイトルバーの右端に空ける幅（FR-L13）: 閉じるボタンなどの幅を窓から読み、文字の大きさ（CSS zoom）で割る
import { describe, expect, it } from 'vitest'
import { CAPTION_FALLBACK, captionInset } from '../../../src/renderer/lib/titleBar'

describe('閉じるボタンなどの幅（FR-L13）', () => {
  it('窓の幅からタイトルバーの領域の右端を引いた幅', () => {
    expect(captionInset(1600, { x: 0, width: 1463 }, 1)).toBe(137)
  })

  it('文字の大きさで割る（OS のボタンは倍率で変わらない）。端数は切り上げて重ならないようにする', () => {
    expect(captionInset(1600, { x: 0, width: 1463 }, 1.5)).toBe(92)
    expect(captionInset(1600, { x: 0, width: 1463 }, 0.8)).toBe(172)
  })

  it('読めないとき・おかしい値のときは既定の幅', () => {
    expect(captionInset(1600, null, 1)).toBe(CAPTION_FALLBACK)
    expect(captionInset(1100, { x: 0, width: 1463 }, 1)).toBe(CAPTION_FALLBACK) // 表示域だけ縮めた（窓と食い違う）
    expect(captionInset(1600, { x: 0, width: 100 }, 1)).toBe(CAPTION_FALLBACK)
    expect(captionInset(1600, null, 2)).toBe(Math.ceil(CAPTION_FALLBACK / 2))
  })

  it('倍率が読めないときは 1', () => {
    expect(captionInset(1600, { x: 0, width: 1463 }, Number.NaN)).toBe(137)
    expect(captionInset(1600, { x: 0, width: 1463 }, 0)).toBe(137)
  })
})
