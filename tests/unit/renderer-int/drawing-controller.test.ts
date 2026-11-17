// トレンドラインの操作（FR-C14・C15。docs/design-drawings.md §3・§4）: ChartView の代わりに偽のチャート・系列・要素で
// DrawController を動かし、キー・ポインタの操作と、止めたスクロール・十字線の後始末を確かめる。値はすべて架空
import { addDays, isTradingDay } from '@shared/calendar'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { installBridge } from '../../support/bridge'
import { makeCore } from '../../support/core'

const core = makeCore()
installBridge(core)
;(window as unknown as { addEventListener: () => void }).addEventListener = () => {}
afterAll(() => core.dispose())
const { DrawController } = await import('../../../src/renderer/lib/drawings/controller.svelte')
const { drawingEdits, drawingsOf } = await import('../../../src/renderer/lib/drawings/store.svelte')

// 60 本の日足（終値 1000 前後）
const time: string[] = []
for (let d = '2026-08-03'; time.length < 60; d = addDays(d, 1)) if (isTradingDay(d)) time.push(d)
const close = time.map((_, i) => 1000 + (i % 7) * 10)
const bars = {
  id: 'JP:7203',
  tf: 'D',
  time,
  open: close.map((c) => c - 5),
  high: close.map((c) => c + 20),
  low: close.map((c) => c - 20),
  close,
  volume: close.map(() => 1000),
  provisional: [],
  forming: [],
  splits: [],
  dividends: [],
}

type Listener = (e: unknown) => void
function makeWorld(id: string) {
  let range = { from: 0, to: 59 }
  const opts: Record<string, unknown> = {}
  const shown: (number | null)[] = []
  const listeners = new Map<string, Listener>()
  const captured = new Set<number>()
  // x = 番号 × 10、y = (2000 − 価格) ÷ 5（価格 1000 → 200）
  const timeScale = {
    getVisibleLogicalRange: () => range,
    setVisibleLogicalRange: (r: typeof range) => {
      range = r
    },
    width: () => 600,
    logicalToCoordinate: (i: number) => i * 10,
    coordinateToLogical: (x: number) => x / 10,
  }
  const chart = {
    timeScale: () => timeScale,
    applyOptions: (o: Record<string, unknown>) => Object.assign(opts, o),
    panes: () => [{ getHeight: () => 400 }],
  }
  let prim: { updateAllViews: () => void } | null = null
  const series = {
    attachPrimitive(p: { attached: (x: unknown) => void; updateAllViews: () => void }) {
      prim = p
      p.attached({ chart, series, requestUpdate: () => {} })
    },
    priceToCoordinate: (p: number) => (2000 - p) / 5,
    coordinateToPrice: (y: number) => 2000 - y * 5,
  }
  const host = {
    dataset: {} as Record<string, string>,
    clientWidth: 600,
    clientHeight: 400,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 400 }),
    addEventListener: (n: string, f: Listener) => listeners.set(n, f),
    removeEventListener: (n: string) => listeners.delete(n),
    setPointerCapture: (p: number) => captured.add(p),
    releasePointerCapture: (p: number) => captured.delete(p),
  }
  const ctl = new DrawController({
    id: () => id,
    tf: () => 'D',
    adj: () => 'split',
    ctype: () => 'candle',
    log: () => false,
    compare: () => false,
    bars: () => bars as never,
    chart: () => chart as never,
    series: () => series as never,
    scope: () => `p1|${id}`,
    kbIndex: () => null,
    showBar: (i) => void shown.push(i),
    css: () => '#ffffff',
    fmt: String,
    host: () => host as never,
    focus: () => {},
  })
  ctl.bindPointer(host as never)
  ctl.attach()
  const key = (code: string, o: { shift?: boolean; ctrl?: boolean; alt?: boolean } = {}) => {
    const k: Record<string, string> = {
      Escape: 'Escape',
      Enter: 'Enter',
      Delete: 'Delete',
      Space: ' ',
      ArrowLeft: 'ArrowLeft',
      ArrowRight: 'ArrowRight',
    }
    return ctl.key({
      code,
      key: k[code] ?? code.replace(/^Key/, '').toLowerCase(),
      shiftKey: !!o.shift,
      ctrlKey: !!o.ctrl,
      altKey: !!o.alt,
      metaKey: false,
    } as KeyboardEvent)
  }
  const ptr = (type: string, x: number, y: number) =>
    listeners.get(type)?.({ button: 0, pointerId: 1, clientX: x, clientY: y, ctrlKey: false, stopPropagation() {}, preventDefault() {} })
  /** 引いた線の真ん中（px） */
  const mid = () => {
    prim?.updateAllViews()
    const d = drawingsOf(id)[0]!
    const ai = time.indexOf(d.a.date)
    const bi = time.indexOf(d.b.date)
    return { x: ((ai + bi) / 2) * 10, y: (series.priceToCoordinate(d.a.raw) + series.priceToCoordinate(d.b.raw)) / 2 }
  }
  /** キーで 1 本引いて、選ばれた状態にする */
  const drawOne = async () => {
    key('KeyT', { alt: true })
    key('ArrowLeft', { shift: true })
    key('Enter')
    key('ArrowRight', { shift: true })
    key('Enter')
    await vi.waitFor(() => expect(drawingsOf(id)[0]?.updated).toBeTruthy())
    await drawingEdits.flush()
  }
  return { id, ctl, opts, shown, captured, key, ptr, mid, drawOne }
}

let n = 0
let w: ReturnType<typeof makeWorld>
beforeEach(() => {
  w = makeWorld(`JP:${1301 + n++}`)
})

describe('止めたスクロールの後始末（レビューの指摘。FR-C15）', () => {
  it('線をドラッグしている間に Esc で選択を外すと、スクロールを戻し、ドラッグを終える', async () => {
    await w.drawOne()
    const m = w.mid()
    w.ptr('pointerdown', m.x, m.y)
    expect(w.opts.handleScroll).toBe(false)
    expect(w.captured.size).toBe(1)
    w.key('Escape')
    expect(w.ctl.mode.m).toBe('idle')
    expect(w.opts.handleScroll).toBe(true)
    expect(w.opts.handleScale).toBe(true)
    expect(w.captured.size).toBe(0)
    // 離すまでのポインタの動きで線は動かない
    const before = JSON.stringify(drawingsOf(w.id))
    w.ptr('pointermove', m.x + 80, m.y + 40)
    w.ptr('pointerup', m.x + 80, m.y + 40)
    expect(JSON.stringify(drawingsOf(w.id))).toBe(before)
  })
  it('ドラッグの途中でフォーカスが外れても、スクロールを戻す', async () => {
    await w.drawOne()
    const m = w.mid()
    w.ptr('pointerdown', m.x, m.y)
    w.ctl.blur()
    expect(w.opts.handleScroll).toBe(true)
    expect(w.captured.size).toBe(0)
  })
  it('引く間に押したまま Esc で通常に戻ると、スクロールを戻す', () => {
    w.key('KeyT', { alt: true })
    w.ptr('pointerdown', 300, 200)
    expect(w.opts.handleScroll).toBe(false)
    expect(w.ctl.mode.m).toBe('end')
    w.key('Escape') // 終点 → 始点
    w.key('Escape') // 始点 → 通常
    expect(w.ctl.mode.m).toBe('idle')
    expect(w.opts.handleScroll).toBe(true)
    expect(w.captured.size).toBe(0)
  })
})

describe('十字線の後始末（レビューの指摘。FR-C14）', () => {
  it('Space で 見るだけ → 全体 → 始点 → 終点 → 見るだけ に戻ると、十字線・凡例を戻す', async () => {
    await w.drawOne()
    for (let i = 0; i < 4; i++) w.key('Space')
    expect(w.ctl.mode).toMatchObject({ m: 'sel', target: 'none' })
    expect(w.shown.at(-1)).toBeNull()
  })
  it('何もない所をクリックして選択を外すと、十字線・凡例を戻す', async () => {
    await w.drawOne()
    w.key('Space')
    expect(w.shown.at(-1)).not.toBeNull()
    w.ptr('pointerdown', 590, 10)
    w.ptr('pointerup', 590, 10)
    expect(w.ctl.mode.m).toBe('idle')
    expect(w.shown.at(-1)).toBeNull()
  })
})
