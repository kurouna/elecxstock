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

// 80 本の日足（終値 1000 前後。7 本ごとに山（i % 7 = 6）と谷（i % 7 = 0））
const time: string[] = []
for (let d = '2026-06-01'; time.length < 80; d = addDays(d, 1)) if (isTradingDay(d)) time.push(d)
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
function makeWorld(id: string, o: { log?: boolean } = {}) {
  let range = { from: 0, to: 79 }
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
    width: () => 800,
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
    // 対数目盛り: 500〜2000 円を 400〜0 px に（価格の比が同じなら px の差が同じ）
    priceToCoordinate: (p: number) => (o.log ? 400 - (Math.log(p / 500) / Math.log(4)) * 400 : (2000 - p) / 5),
    coordinateToPrice: (y: number) => (o.log ? 500 * 4 ** ((400 - y) / 400) : 2000 - y * 5),
  }
  const host = {
    dataset: {} as Record<string, string>,
    clientWidth: 800,
    clientHeight: 400,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 400 }),
    addEventListener: (n: string, f: Listener) => listeners.set(n, f),
    removeEventListener: (n: string) => listeners.delete(n),
    setPointerCapture: (p: number) => captured.add(p),
    hasPointerCapture: (p: number) => captured.has(p),
    // 取っていない（もう有効でない）ポインタを放すと、ブラウザは NotFoundError を投げる
    releasePointerCapture: (p: number) => {
      if (!captured.delete(p)) throw new DOMException('not captured', 'NotFoundError')
    },
  }
  const ctl = new DrawController({
    id: () => id,
    tf: () => 'D',
    adj: () => 'split',
    ctype: () => 'candle',
    log: () => !!o.log,
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
      ArrowUp: 'ArrowUp',
      ArrowDown: 'ArrowDown',
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
  return {
    id,
    prim: () => prim,
    range: () => range,
    setRange: (r: typeof range) => timeScale.setVisibleLogicalRange(r),
    ctl,
    opts,
    shown,
    captured,
    key,
    ptr,
    fire: (type: string) => listeners.get(type)?.({ pointerId: 1 }),
    host,
    series,
    mid,
    drawOne,
  }
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

describe('レビュー（端点の付け替え・選ぶ順・FR-C14）', () => {
  it('始点を Ctrl+→ で送ると、終点の山・谷を飛び越えて先の山・谷へ（終点の所で止まらない）', async () => {
    w.key('KeyT', { alt: true })
    // 右から 5 つ目の山・谷を始点、3 つ目を終点に（終点の先にも山・谷がある）
    for (let i = 0; i < 5; i++) w.key('ArrowLeft', { ctrl: true })
    w.key('Enter')
    w.key('ArrowRight', { ctrl: true })
    w.key('ArrowRight', { ctrl: true })
    w.key('Enter')
    await vi.waitFor(() => expect(drawingsOf(w.id)[0]?.updated).toBeTruthy())
    const d0 = drawingsOf(w.id)[0]!
    // 始点と終点の間にある山・谷は 1 つ（始点 → 間の山・谷 → 終点の順）
    w.key('Space')
    w.key('Space') // 始点
    w.key('ArrowRight', { ctrl: true }) // 間の山・谷
    w.key('ArrowRight', { ctrl: true }) // 次は終点の足なので、飛ばして先の山・谷へ
    const d = drawingsOf(w.id)[0]!
    expect(d.a.date).toBe(d0.b.date) // 入れ替わって、元の終点が始点に
    expect(d.b.date > d0.b.date).toBe(true)
  })
  it('G を続けて押すと、表示が動いても全部の線を順に回る', async () => {
    const mk = (id: string, a: number, b: number) =>
      drawingEdits.create(`p1|${w.id}`, w.id, {
        id,
        kind: 'trend',
        a: { date: time[a]!, raw: 1000 },
        b: { date: time[b]!, raw: 1010 },
        extend: 'none',
        priceLabel: true,
        log: false,
        created: '',
        updated: '',
      })
    await mk('A', 65, 70)
    await mk('B', 2, 8)
    await mk('C', 30, 36)
    w.ctl.refresh()
    // 表示は右の 20 本だけ（範囲の外の線を選ぶと表示が動く）
    w.setRange({ from: 60, to: 79 })
    const seen: string[] = []
    for (let i = 0; i < 3; i++) {
      w.key('KeyG')
      seen.push((w.ctl.mode as { id: string }).id)
    }
    expect(seen.sort()).toEqual(['A', 'B', 'C'])
  })
})

describe('十字線とドラッグの後始末（レビューの指摘。FR-C14・C15）', () => {
  it('動かす対象を選んで十字線を出したまま Delete で消すと、十字線・凡例を戻す', async () => {
    await w.drawOne()
    w.key('Space') // 全体（始点に十字線）
    expect(w.shown.at(-1)).not.toBeNull()
    w.key('Delete')
    expect(w.ctl.mode.m).toBe('idle')
    expect(w.shown.at(-1)).toBeNull()
  })
  it('動かす対象を選んだままフォーカスが外れると、十字線・凡例を戻す', async () => {
    await w.drawOne()
    w.key('Space')
    w.ctl.blur()
    expect(w.ctl.mode.m).toBe('idle')
    expect(w.shown.at(-1)).toBeNull()
  })
  it('線をドラッグしている間に Alt+T で引き始めると、ドラッグを終えてスクロールを戻す（離すまで線を動かさない）', async () => {
    await w.drawOne()
    const m = w.mid()
    w.ptr('pointerdown', m.x, m.y)
    expect(w.opts.handleScroll).toBe(false)
    w.key('KeyT', { alt: true })
    expect(w.ctl.mode.m).toBe('start')
    expect(w.opts.handleScroll).toBe(true)
    expect(w.captured.size).toBe(0)
    const before = JSON.stringify(drawingsOf(w.id))
    w.ptr('pointermove', m.x + 80, m.y + 40)
    expect(JSON.stringify(drawingsOf(w.id))).toBe(before)
  })
  it('線をドラッグしている間に G で別の線を選ぶと、ドラッグを終える（選んだ線と違う線を動かし続けない）', async () => {
    await w.drawOne()
    const first = drawingsOf(w.id)[0]!
    await drawingEdits.create(`p1|${w.id}`, w.id, { ...first, id: 'other', a: { ...first.a, raw: 900 }, b: { ...first.b, raw: 920 } })
    w.ctl.refresh()
    const m = w.mid()
    w.ptr('pointerdown', m.x, m.y)
    expect((w.ctl.mode as { id: string }).id).toBe(first.id)
    w.key('KeyG')
    expect((w.ctl.mode as { id: string }).id).not.toBe(first.id)
    expect(w.opts.handleScroll).toBe(true)
    const before = JSON.stringify(drawingsOf(w.id))
    w.ptr('pointermove', m.x + 80, m.y + 40)
    expect(JSON.stringify(drawingsOf(w.id))).toBe(before)
  })
})

describe('対数目盛りでのキーの移動（レビューの指摘。FR-C14）', () => {
  it('全体を ↑ ↓ で動かしても、線の傾き（画面の上の 2 点の高さの差）は変わらない', async () => {
    const lw = makeWorld(`JP:${1301 + n++}`, { log: true })
    await lw.drawOne()
    lw.key('Space') // 全体
    const d0 = drawingsOf(lw.id)[0]!
    const y = (p: number) => 400 - (Math.log(p / 500) / Math.log(4)) * 400
    const gap0 = y(d0.b.raw) - y(d0.a.raw)
    lw.ctl.key({ code: 'ArrowUp', key: 'ArrowUp', shiftKey: true, ctrlKey: false, altKey: false, metaKey: false } as KeyboardEvent)
    const d1 = drawingsOf(lw.id)[0]!
    expect(d1.a.raw).toBeGreaterThan(d0.a.raw)
    expect(y(d1.b.raw) - y(d1.a.raw)).toBeCloseTo(gap0, 6)
  })
})

describe('レビュー 3 回目（FR-C14・C15）', () => {
  const two = async () => {
    await w.drawOne()
    const first = drawingsOf(w.id)[0]!
    await drawingEdits.create(`p1|${w.id}`, w.id, { ...first, id: 'other', a: { ...first.a, raw: 900 }, b: { ...first.b, raw: 920 } })
    w.ctl.refresh()
    return first
  }
  it('動かす対象を選んで十字線を出したまま G で別の線を選ぶと、十字線・凡例を戻す', async () => {
    const first = await two()
    w.key('Space') // 全体（始点に十字線）
    expect(w.shown.at(-1)).not.toBeNull()
    w.key('KeyG')
    expect(w.ctl.mode).toMatchObject({ m: 'sel', target: 'none' })
    expect((w.ctl.mode as { id: string }).id).not.toBe(first.id)
    expect(w.shown.at(-1)).toBeNull()
  })
  it('動かす対象を選んで十字線を出したまま別の線をクリックすると、十字線・凡例を戻す', async () => {
    const first = await two()
    w.key('Space')
    expect(w.shown.at(-1)).not.toBeNull()
    // other の線の真ん中（a: 900, b: 920）
    const ai = time.indexOf(first.a.date)
    const bi = time.indexOf(first.b.date)
    const x = ((ai + bi) / 2) * 10
    const y = (w.series.priceToCoordinate(900) + w.series.priceToCoordinate(920)) / 2
    w.prim()?.updateAllViews()
    w.ptr('pointerdown', x, y)
    w.ptr('pointerup', x, y)
    expect((w.ctl.mode as { id: string }).id).toBe('other')
    expect(w.shown.at(-1)).toBeNull()
  })
  it('ポインタを取り損なった（lostpointercapture）ときは放さずに終え、ドラッグで動かした分は書く', async () => {
    await w.drawOne()
    const m = w.mid()
    w.ptr('pointerdown', m.x, m.y)
    w.ptr('pointermove', m.x + 50, m.y)
    w.captured.clear() // ブラウザがもう放している
    expect(() => w.fire('lostpointercapture')).not.toThrow()
    expect(w.opts.handleScroll).toBe(true)
    expect(drawingEdits.editing(drawingsOf(w.id)[0]!.id)).toBe(false)
  })
  it('対数目盛りで吸着を外した Shift+↑ は、表示の高さの 1/100（価格の幅の 1/100 ではない）', () => {
    const lw = makeWorld(`JP:${1301 + n++}`, { log: true })
    lw.key('KeyT', { alt: true })
    const st = () => JSON.parse(lw.host.dataset.drawState!) as { price: number }
    lw.key('ArrowUp', { shift: true }) // 吸着を外す（1 段）
    const p0 = st().price
    lw.key('ArrowUp', { shift: true })
    const p1 = st().price
    // 段の高さ 400 px の 1/100 = 4 px
    expect(lw.series.priceToCoordinate(p0) - lw.series.priceToCoordinate(p1)).toBeCloseTo(4, 6)
  })
  it('座標から価格に直した値が有限でない（極端な対数目盛り）ときは、価格の 1 段で動かす（カーソル・端点に Infinity を置かない）', () => {
    const lw = makeWorld(`JP:${1301 + n++}`, { log: true })
    lw.key('KeyT', { alt: true })
    const st = () => JSON.parse(lw.host.dataset.drawState!) as { price: number | null }
    lw.key('ArrowUp', { shift: true })
    const p0 = st().price!
    lw.series.coordinateToPrice = () => Number.POSITIVE_INFINITY
    lw.key('ArrowUp', { shift: true })
    const p1 = st().price
    expect(Number.isFinite(p1)).toBe(true)
    expect(p1!).toBeGreaterThan(p0)
  })
})
