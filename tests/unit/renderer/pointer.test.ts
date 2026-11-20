// ポインタと位置の換算（FR-V10 の表示倍率）。getBoundingClientRect の px（倍率が掛かる）と CSS の px（掛からない）をそろえる
import { describe, expect, it } from 'vitest'
import { histIndexAt } from '../../../src/renderer/lib/folio'
import { trendIndexAt } from '../../../src/renderer/lib/folioTips'
import { gutterRatio, localX, tipBeside } from '../../../src/renderer/lib/pointer'

describe('表示倍率とポインタ（FR-V10）', () => {
  it('ポインタの x を要素の中の CSS の px に直す（倍率 150% なら 1.5 で割る）', () => {
    // 幅 400px（CSS）の要素が、倍率 150% で 600px に描かれている
    expect(localX(100 + 300, { left: 100, width: 600 }, 400)).toBe(200)
    expect(localX(100, { left: 100, width: 600 }, 400)).toBe(0)
    expect(localX(50, { left: 100, width: 0 }, 400)).toBe(0)
    // 100% なら引くだけ
    expect(localX(130, { left: 100, width: 400 }, 400)).toBe(30)
  })
  it('倍率によらず、同じ見た目の位置は同じ点を選ぶ（資産推移・年間配当の推移）', () => {
    const w = 600
    for (const z of [0.8, 1, 1.5]) {
      const rect = { left: 10 * z, width: w * z }
      const at = (f: number) => localX(rect.left + rect.width * f, rect, w)
      expect(histIndexAt(at(0.8), w, 101)).toBe(histIndexAt(0.8 * w, w, 101))
      expect(trendIndexAt(at(0.4), w, 51)).toBe(trendIndexAt(0.4 * w, w, 51))
    }
  })
  it('資産推移: 左右の余白（左 2・右 56）を除いた幅で選び、端は寄せる', () => {
    expect(histIndexAt(2, 600, 11)).toBe(0)
    expect(histIndexAt(2 + 542 / 2, 600, 11)).toBe(5)
    expect(histIndexAt(590, 600, 11)).toBe(10)
    expect(histIndexAt(-20, 600, 11)).toBe(0)
    expect(histIndexAt(100, 600, 1)).toBe(0)
  })
  it('説明は要素の右に出す。倍率を割り戻し、窓の右からはみ出さない', () => {
    expect(tipBeside({ right: 300, top: 150 }, 320, 1500, 1.5)).toEqual({ x: 208, y: 96 })
    expect(tipBeside({ right: 300, top: 150 }, 320, 1500, 1)).toEqual({ x: 308, y: 146 })
    // 右が足りなければ詰める（窓の幅も CSS の px に直す）
    expect(tipBeside({ right: 1400, top: 0 }, 320, 1500, 1.5).x).toBe(1000 - 320)
    expect(tipBeside({ right: 300, top: 150 }, 320, 1500, 0).x).toBe(308)
  })
  it('高さを渡すと、窓の下からはみ出さないよう上に寄せる（渡さなければ今までどおり）', () => {
    expect(tipBeside({ right: 300, top: 900 }, 320, 1500, 1, { height: 180, viewportHeight: 1000 }).y).toBe(1000 - 180)
    expect(tipBeside({ right: 300, top: 900 }, 320, 1500, 2, { height: 180, viewportHeight: 1000 }).y).toBe(500 - 180)
    expect(tipBeside({ right: 300, top: 100 }, 320, 1500, 1, { height: 180, viewportHeight: 1000 }).y).toBe(96)
    expect(tipBeside({ right: 300, top: 10 }, 320, 1500, 1, { height: 2000, viewportHeight: 1000 }).y).toBe(0)
    expect(tipBeside({ right: 300, top: 900 }, 320, 1500, 1).y).toBe(896)
  })
})

describe('区切り線のドラッグ（FR-L1）', () => {
  it('両隣の幅に対する位置を 8%〜92% に収める', () => {
    expect(gutterRatio(150, 100, 200)).toBeCloseTo(0.25)
    expect(gutterRatio(0, 100, 200)).toBe(0.08)
    expect(gutterRatio(900, 100, 200)).toBe(0.92)
  })
  it('両隣の幅が 0（隠れている・縮みきった）なら比を出さない（NaN でサイズを壊さない）', () => {
    expect(gutterRatio(120, 100, 0)).toBeNull()
    expect(gutterRatio(120, 100, -5)).toBeNull()
  })
})
