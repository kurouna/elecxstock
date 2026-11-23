// 配当と株価の平面の形（docs/design-yield-breakdown.md §3.4。L1）: 両対数で x と y の倍率を同じに・同じ利回りの線・軌跡・十字線の月
import { describe, expect, it } from 'vitest'
import {
  cursorIn,
  cursorIndex,
  cursorStep,
  ISO_YIELDS,
  isoLines,
  labelDy,
  labelPos,
  logTicks,
  planeBox,
  textWidth,
  toXY,
  trail,
} from '../../../src/renderer/lib/yieldPlane'

const pt = (m: string, price: number, div12: number) => ({ m, d: `${m}-28`, price, div12 })
const P = [
  pt('2021-11', 140000, 5600),
  pt('2022-11', 120000, 5650),
  pt('2023-11', 110000, 5700),
  pt('2024-11', 0.0001, 0),
  pt('2025-11', 100000, 5900),
  pt('2026-11', 105000, 5945),
].filter((x) => x.price > 1)
const pad = { l: 64, r: 24, t: 14, b: 34 }

describe('FR-I11 平面の枠', () => {
  it('両対数で 1 px あたりの倍率を x と y で同じにし、すべての点が枠の中', () => {
    const b = planeBox(P, 800, 500, pad)!
    const kx = (b.lx1 - b.lx0) / (800 - pad.l - pad.r)
    const ky = (b.ly1 - b.ly0) / (500 - pad.t - pad.b)
    expect(kx).toBeCloseTo(ky, 10)
    for (const p of P) {
      const [x, y] = toXY(b, p.div12, p.price)
      expect(x).toBeGreaterThanOrEqual(pad.l)
      expect(x).toBeLessThanOrEqual(800 - pad.r)
      expect(y).toBeGreaterThanOrEqual(pad.t)
      expect(y).toBeLessThanOrEqual(500 - pad.b)
    }
  })
  it('配当が 0 の点は使わない。点が無ければ null', () => {
    expect(planeBox([pt('2024-01', 1000, 0)], 800, 500, pad)).toBeNull()
    expect(planeBox([], 800, 500, pad)).toBeNull()
  })
})

describe('FR-I11 同じ利回りの線', () => {
  it('枠の中の線分で、両端の 配当 ÷ 株価 がその利回り（45° の直線）。枠に入らない利回りは出さない', () => {
    const b = planeBox(P, 800, 500, pad)!
    const ls = isoLines(b, [0.01, 0.04, 0.05, 0.3])
    expect(ls.map((l) => l.yield)).not.toContain(0.3)
    expect(ls.map((l) => l.yield)).not.toContain(0.01)
    const l = ls.find((x) => x.yield === 0.05)!
    for (const [x, y] of [
      [l.x1, l.y1],
      [l.x2, l.y2],
    ] as const) {
      expect(x).toBeGreaterThanOrEqual(pad.l - 1e-6)
      expect(x).toBeLessThanOrEqual(800 - pad.r + 1e-6)
      expect(y).toBeGreaterThanOrEqual(pad.t - 1e-6)
      expect(y).toBeLessThanOrEqual(500 - pad.b + 1e-6)
    }
    // 画面の上で 45°（x と y の倍率が同じなので、右へ 1 px で上へ 1 px）
    expect((l.y1 - l.y2) / (l.x2 - l.x1)).toBeCloseTo(1, 6)
  })
})

describe('FR-I11 軌跡と十字線', () => {
  it('配当 0 の月で線を切る。色の割合は古い 0 → 新しい 1', () => {
    const path = [
      pt('2024-01', 1000, 40),
      pt('2024-02', 1010, 40),
      pt('2024-03', 1020, 0),
      pt('2024-04', 1030, 41),
      pt('2024-05', 1040, 41),
    ]
    const b = planeBox(path, 800, 500, pad)!
    const segs = trail(path, b)
    expect(segs).toHaveLength(2)
    expect(segs[0]!.t).toBe(0.25)
    expect(segs.at(-1)!.t).toBe(1)
  })
  it('月で持つ: 無ければ ← で今の月。← → は 1 か月、Shift で 12 か月、端で止まる。Home End', () => {
    const path = Array.from({ length: 30 }, (_, i) => pt(`20${24 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`, 1000, 40))
    expect(cursorStep(path, null, 'ArrowLeft', false)).toBe('2026-06')
    expect(cursorStep(path, '2026-06', 'ArrowLeft', false)).toBe('2026-05')
    expect(cursorStep(path, '2026-06', 'ArrowLeft', true)).toBe('2025-06')
    expect(cursorStep(path, '2024-03', 'ArrowLeft', true)).toBe('2024-01')
    expect(cursorStep(path, '2026-06', 'ArrowRight', false)).toBe('2026-06')
    expect(cursorStep(path, '2025-06', 'Home', false)).toBe('2024-01')
    expect(cursorStep(path, '2025-06', 'End', false)).toBe('2026-06')
    expect(cursorStep(path, '2025-06', 'KeyA', false)).toBeNull()
    // 点が増えても（月次が届いた）、同じ月に留まる
    expect(cursorStep([pt('2023-12', 1000, 40), ...path], '2025-06', 'ArrowLeft', false)).toBe('2025-05')
  })
})

describe('FR-I11 目盛り・札・月の位置', () => {
  it('対数の目盛りは 1・2・5 の 10 のべき（範囲の中だけ）', () => {
    expect(logTicks(3000, 120000)).toEqual([5000, 10000, 20000, 50000, 100000])
    expect(logTicks(40, 60)).toEqual([50])
  })
  it('同じ利回りの線は 1〜12% の 1 pt ごと', () => {
    expect(ISO_YIELDS).toHaveLength(12)
    expect(ISO_YIELDS[0]).toBe(0.01)
    expect(ISO_YIELDS.at(-1)).toBe(0.12)
  })
  it('始まりと今の札が近いと、始まりの札を 1 行下げる', () => {
    const a = { yield: 0.04, x1: 0, y1: 0, x2: 500, y2: 100 }
    expect(labelDy(a, { ...a, x2: 560, y2: 110 })).toBe(16)
    expect(labelDy(a, { ...a, x2: 500, y2: 200 })).toBe(0)
    expect(labelDy(a, undefined)).toBe(0)
  })
  it('十字線の月の位置。無ければ今（最後）。無い月も最後', () => {
    const path = [pt('2024-01', 1, 1), pt('2024-02', 1, 1), pt('2024-03', 1, 1)]
    expect(cursorIndex(path, null)).toBe(2)
    expect(cursorIndex(path, '2024-02')).toBe(1)
    expect(cursorIndex(path, '2019-01')).toBe(2)
  })
})

describe('FR-I11 狭い枠・札の位置・期間の外の月（レビューの反映）', () => {
  it('余白より狭い枠でも点は枠の中（幅・高さが負にならず、左右・上下が入れ替わらない）', () => {
    const b = planeBox(P, 60, 40, pad)!
    for (const p of P) {
      const [x, y] = toXY(b, p.div12, p.price)
      expect(x).toBeGreaterThanOrEqual(pad.l)
      expect(x).toBeLessThanOrEqual(pad.l + 1)
      expect(y).toBeGreaterThanOrEqual(pad.t)
      expect(y).toBeLessThanOrEqual(pad.t + 1)
    }
  })
  it('十字線の月が期間の始まりより前（取得で始まりが動いた）なら選んでいないことにする', () => {
    const path = [pt('2024-01', 1, 1), pt('2024-02', 1, 1), pt('2024-03', 1, 1)]
    expect(cursorIn(path, 1, '2024-01')).toBeNull()
    expect(cursorIn(path, 1, '2024-02')).toBe('2024-02')
    expect(cursorIn(path, 1, '2019-01')).toBeNull()
    expect(cursorIn(path, 1, null)).toBeNull()
  })
  it('文字の幅の見積もり: 半角は 0.6 字・全角は 1 字', () => {
    expect(textWidth('ab', 10)).toBeCloseTo(12)
    expect(textWidth('利回り', 12)).toBeCloseTo(36)
  })
  it('札は枠からはみ出す側を避ける（end は左へ・start は右へ伸びる。はみ出すなら反対側）', () => {
    expect(labelPos(30, 'end', 100, 0, 800)).toEqual({ x: 34, anchor: 'start' })
    expect(labelPos(400, 'end', 100, 0, 800)).toEqual({ x: 396, anchor: 'end' })
    expect(labelPos(760, 'start', 100, 0, 800, 10)).toEqual({ x: 750, anchor: 'end' })
    expect(labelPos(300, 'start', 100, 0, 800, 10)).toEqual({ x: 310, anchor: 'start' })
  })
})
