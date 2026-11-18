// 同じリンク色のチャートの同期の判断（FR-K3 十字線・FR-K4 表示期間）。Lightweight Charts の知らせは非同期に届くので、
// 旗ではなく「どこから来た知らせか」「受けた値と同じか」で送るかを決める
import { describe, expect, it } from 'vitest'
import { RangeEcho, sendCrosshair } from '../../../src/renderer/components/widgets/chartSync'

describe('十字線をほかのチャートへ送るか（FR-K3）', () => {
  it('マウスで動かした知らせは送る', () => {
    expect(sendCrosshair({ sourceEvent: {}, time: '2026-11-02' })).toBe(true)
  })
  it('プログラムで置いた十字線の知らせは送らない（受け取った同期が送り返されて行き来しない）', () => {
    expect(sendCrosshair({ time: '2026-11-02' })).toBe(false)
  })
  it('マウスがチャートから出た（時刻の無い）知らせは送る（リンク先の十字線も消す）', () => {
    expect(sendCrosshair({})).toBe(true)
  })
})

describe('表示期間の送り返し（FR-K4）', () => {
  it('受けた範囲と同じ知らせは送らない。利用者が変えた範囲は送る', () => {
    const e = new RangeEcho()
    e.received(10.5, 80.25)
    expect(e.shouldSend(10.5, 80.25)).toBe(false)
    expect(e.shouldSend(12, 82)).toBe(true)
  })
  it('一度送らなかった値は忘れる（同じ範囲へ利用者が戻したときは送る）', () => {
    const e = new RangeEcho()
    e.received(1, 2)
    expect(e.shouldSend(1, 2)).toBe(false)
    expect(e.shouldSend(1, 2)).toBe(true)
  })
})

describe('表示期間の送り返し: 端数の誤差（FR-K4。レビュー 2 回目）', () => {
  it('ライブラリが幅と足の間隔から計算し直して 1ulp ずれた範囲も、受けた範囲として送らない', () => {
    const e = new RangeEcho()
    e.received(10.3, 150.7)
    expect(e.shouldSend(10.300000000000011, 150.7)).toBe(false)
  })
  it('足の数で 1/1000 を超える違いは、利用者が変えた範囲として送る', () => {
    const e = new RangeEcho()
    e.received(10.3, 150.7)
    expect(e.shouldSend(10.31, 150.7)).toBe(true)
  })
})

describe('レビュー 2 回目（Fable）', () => {
  it('受けた範囲は次の知らせで必ず忘れる（受け手が同じ範囲にいて知らせが出なかったとき、あとの正しい知らせを捨てない）', () => {
    const e = new RangeEcho()
    e.received(1, 2)
    expect(e.shouldSend(5, 6)).toBe(true)
    expect(e.shouldSend(1, 2)).toBe(true)
  })
  it('時刻が無くても位置がある知らせ（幅が縮んで余白に当たった）は送らない。マウスが出た（位置も無い）知らせは送る', () => {
    expect(sendCrosshair({ point: { x: 1, y: 1 } })).toBe(false)
    expect(sendCrosshair({})).toBe(true)
  })
})
