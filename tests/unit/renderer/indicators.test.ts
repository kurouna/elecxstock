// チャートの指標（FR-C6）: 期間不足は null、既知の値と一致すること
import { describe, expect, it } from 'vitest'
import { bollinger, ema, ichimoku, macd, rebase, rsiSeries, sma, stochastic } from '../../../src/renderer/lib/indicators'

const c = Array.from({ length: 80 }, (_, i) => 100 + i)
describe('指標', () => {
  it('SMA・EMA は期間が足りない所を null にする', () => {
    expect(sma([1, 2, 3, 4], 3)).toEqual([null, null, 2, 3])
    const e = ema([1, 2, 3, 4, 5], 3)
    expect(e.slice(0, 2)).toEqual([null, null])
    expect(e[2]).toBe(2)
    expect(e[3]).toBe(3)
  })
  it('ボリンジャーバンドは一定の値なら幅 0', () => {
    const b = bollinger(new Array(25).fill(10))
    expect(b.up[24]).toBe(10)
    expect(b.lo[24]).toBe(10)
    expect(b.mid[18]).toBeNull()
  })
  it('一目均衡表の先行スパンは 26 本先まで伸びる', () => {
    const r = ichimoku(
      c.map((x) => x + 1),
      c.map((x) => x - 1),
      c,
    )
    expect(r.spanA.length).toBe(c.length + 26)
    expect(r.tenkan[8]).toBe(104) // (109 + 99) / 2
    expect(r.chikou[0]).toBe(c[26])
  })
  it('RSI は上げ続けなら 100、MACD は上昇で正', () => {
    expect(rsiSeries(c).at(-1)).toBe(100)
    expect(macd(c).macd.at(-1)!).toBeGreaterThan(0)
    const s = stochastic(
      c.map((x) => x + 1),
      c.map((x) => x - 1),
      c,
    )
    expect(s.k.at(-1)!).toBeGreaterThan(80)
  })
  it('比較は始点を 0% にする', () => {
    const r = rebase([100, 110, 90], 0)
    expect(r[0]).toBe(0)
    expect(r[1]).toBeCloseTo(10)
    expect(r[2]).toBeCloseTo(-10)
  })
})
