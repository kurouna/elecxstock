// ウィンドウの位置（マルチモニタ §5）: ディスプレイの組み合わせごとに覚え、持ち出しても元の記録を壊さない
import { describe, expect, it } from 'vitest'
import { type DisplayLike, parseState, place, remember, topologyOf, type WindowStateV2 } from '../../../src/main/placement'

const d = (x: number, y: number, w: number, h: number, s = 1): DisplayLike => ({
  bounds: { x, y, width: w, height: h },
  workArea: { x, y, width: w, height: h - 40 },
  scaleFactor: s,
})
const laptop = d(0, 0, 1920, 1080, 1.5)
const external = d(1920, 0, 2560, 1440)
const docked = [laptop, external]
const size = { width: 1280, height: 800 }

describe('placement', () => {
  it('組み合わせの印は並び順に依らない', () => {
    expect(topologyOf([laptop, external])).toBe(topologyOf([external, laptop]))
    expect(topologyOf([laptop])).not.toBe(topologyOf(docked))
  })
  it('記録が無ければ、フリー N は主でない画面の中央、主は主ディスプレイの中央', () => {
    const empty: WindowStateV2 = { version: 2, topo: {}, open: [] }
    const f = place(docked, laptop, empty, 'free2', size)
    expect(f.bounds.x).toBeGreaterThanOrEqual(1920)
    const m = place(docked, laptop, empty, 'main', size)
    expect(m.bounds.x).toBeLessThan(1920)
  })
  it('ドッキング時の記録は、持ち出し（画面 1 枚）で使わず、戻ると元の位置に戻る', () => {
    let s: WindowStateV2 = { version: 2, topo: {}, open: [] }
    s = remember(s, docked, 'free2', { bounds: { x: 2200, y: 100, width: 1600, height: 900 }, maximized: false })
    // 持ち出し: 外部の画面が無い → 主（ノート）の上に寄せる
    const away = place([laptop], laptop, s, 'free2', size)
    expect(away.bounds.x).toBeLessThan(1920)
    // 持ち出し先で動かしても、ドッキングの記録は残る
    s = remember(s, [laptop], 'free2', { bounds: away.bounds, maximized: false })
    const back = place(docked, laptop, s, 'free2', size)
    expect(back.bounds.x).toBe(2200)
  })
  it('見えない位置の記録は使わない', () => {
    let s: WindowStateV2 = { version: 2, topo: {}, open: [] }
    s = remember(s, docked, 'free2', { bounds: { x: 9000, y: 9000, width: 800, height: 600 }, maximized: false })
    expect(place(docked, laptop, s, 'free2', size).bounds.x).toBeLessThan(9000)
  })
  it('版 1 の window.json（1 件）は今の組み合わせの主ウィンドウとして読む。おかしな値は空', () => {
    const s = parseState({ x: 10, y: 20, width: 1600, height: 960, maximized: true }, docked)
    expect(place(docked, laptop, s, 'main', size)).toEqual({ bounds: { x: 10, y: 20, width: 1600, height: 960 }, maximized: true })
    expect(parseState('x', docked)).toEqual({ version: 2, topo: {}, open: [] })
    expect(parseState({ version: 2, topo: {}, open: ['free2', 'evil', 'free9'] }, docked).open).toEqual(['free2'])
  })
})
