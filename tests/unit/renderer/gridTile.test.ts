// チャートグリッドのタイル（FR-G3・FR-V10）: 描く位置とポインタで選ぶ足は同じ単位（canvas の getBoundingClientRect の px）で計算する。
// 描画は canvas の大きさを getBoundingClientRect（表示倍率が掛かった px）で取り、右の目盛りの幅 48 もその px で描くので、
// ポインタの側も同じ px のまま割る（CSS の px に直すと、倍率 100% 以外で右の目盛りの幅の分だけずれる）
import { describe, expect, it } from 'vitest'
import { cssPx, TILE_PAD_R, tileIndexAt, tileSize, tileX } from '../../../src/renderer/components/widgets/gridDraw'

describe('グリッドのタイルの足の位置とポインタ（FR-G3・FR-V10）', () => {
  it('描いた足の真ん中にポインタを置くと、その足を選ぶ（表示倍率で幅が変わっても）', () => {
    for (const rectW of [300 * 0.8, 300, 300 * 1.5]) {
      for (const n of [20, 60, 250]) {
        for (const i of [0, 1, Math.floor(n / 2), n - 1]) expect(tileIndexAt(tileX(i, rectW, n), rectW, n)).toBe(i)
      }
    }
  })
  it('右の目盛り（48px）と左の外は端の足に寄せる', () => {
    expect(TILE_PAD_R).toBe(48)
    expect(tileIndexAt(-5, 300, 50)).toBe(0)
    expect(tileIndexAt(300 - 10, 300, 50)).toBe(49)
    expect(tileIndexAt(10, 300, 0)).toBe(0)
  })
})

describe('グリッドのタイルの大きさ（FR-G3・FR-V10・FR-L3）', () => {
  it('transform の掛からない CSS の px に倍率を掛ける（最大化の動きの途中でも縮んだ矩形で描かない）', () => {
    expect(tileSize(300, 120, 1)).toEqual({ width: 300, height: 120 })
    expect(tileSize(300, 120, 1.25)).toEqual({ width: 375, height: 150 })
  })
})

describe('CSS の幅の読み取り（FR-V10）', () => {
  it('小数のまま読み、読めなければ代わりの値', () => {
    expect(cssPx('123.5px', 123)).toBe(123.5)
    expect(cssPx('auto', 120)).toBe(120)
    expect(cssPx('0px', 120)).toBe(120)
  })
})
