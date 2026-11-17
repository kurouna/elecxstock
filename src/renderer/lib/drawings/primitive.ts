// チャートの描画を描く Lightweight Charts の Series Primitive（docs/design-drawings.md §6.4）。1 つのプリミティブがその銘柄の
// 図形をすべて描く（線・取っ手・引いている途中の線・カーソル・価格ラベル）。中身は model() が足の番号と表示の価格で渡し、
// ここは座標にして描くだけ（判断は controller・計算は shared/drawings.ts）。目盛りは広げない（autoscaleInfo を持たない）
import { covers, type DrawTarget, distToSegment, type Extend, type Px, segment, yAtX } from '@shared/drawings'
import type {
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  ISeriesPrimitiveAxisView,
  Logical,
  PrimitiveHoveredItem,
  SeriesAttachedParameter,
  SeriesType,
  Time,
} from 'lightweight-charts'

export interface DrawLine {
  id: string
  /** 足の論理番号（範囲の外は外挿した番号）と表示の価格 */
  ai: number
  ap: number
  bi: number
  bp: number
  extend: Extend
  color: string
  width: number
  dash: 'solid' | 'dashed' | 'dotted'
  label: boolean
  /** 選んでいれば動かす対象（none は見るだけ） */
  sel: DrawTarget | null
}
export interface DrawModel {
  lines: DrawLine[]
  /** 引いている途中の線（始点 → カーソル） */
  ghost: { ai: number; ap: number; bi: number; bp: number; color: string } | null
  /** 引いている間のカーソル */
  cursor: { i: number; p: number } | null
  /** 価格ラベルを出す足（表示中の最後の足） */
  labelIdx: number
  /** 取っ手を描かない（画像の保存） */
  bare: boolean
  handle: string
}
/** hitTest の結果の ID（線の ID と、取っ手なら :a / :b） */
export type DrawHit = { id: string; part: 'a' | 'b' | 'line' }
export const parseHit = (s: string): DrawHit | null => {
  const m = /^draw:(.+?)(?::(a|b))?$/.exec(s)
  return m ? { id: m[1]!, part: (m[2] as 'a' | 'b') ?? 'line' } : null
}

interface Seg {
  id: string
  s0: Px
  s1: Px
  a: Px
  b: Px
  line: DrawLine
}
const HIT = 6
const DASH: Record<DrawLine['dash'], number[]> = { solid: [], dashed: [6, 4], dotted: [2, 3] }

export class DrawingPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null
  private series: ISeriesApi<SeriesType> | null = null
  private request: (() => void) | null = null
  private segs: Seg[] = []
  private ghost: [Px, Px] | null = null
  private cursor: Px | null = null
  private labels: { y: number; text: string; color: string }[] = []
  private m: DrawModel | null = null
  constructor(
    private model: () => DrawModel,
    private fmt: (p: number) => string,
    private textColor: () => string,
  ) {}

  attached(p: SeriesAttachedParameter<Time>): void {
    this.chart = p.chart as IChartApi
    this.series = p.series as ISeriesApi<SeriesType>
    this.request = p.requestUpdate
  }
  detached(): void {
    this.chart = null
    this.series = null
    this.request = null
  }
  /** 中身が変わったら描き直す */
  update(): void {
    this.request?.()
  }
  private x(i: number): number | null {
    return this.chart?.timeScale().logicalToCoordinate(i as Logical) ?? null
  }
  private y(p: number): number | null {
    return this.series?.priceToCoordinate(p) ?? null
  }
  private px(i: number, p: number): Px | null {
    const x = this.x(i)
    const y = this.y(p)
    return x == null || y == null ? null : { x, y }
  }
  updateAllViews(): void {
    this.segs = []
    this.ghost = null
    this.cursor = null
    this.labels = []
    const ts = this.chart?.timeScale()
    if (!ts || !this.series) return
    const m = this.model()
    this.m = m
    const w = ts.width()
    const lx = this.x(m.labelIdx)
    for (const l of m.lines) {
      const a = this.px(l.ai, l.ap)
      const b = this.px(l.bi, l.bp)
      if (!a || !b) continue
      const [s0, s1] = segment(a, b, l.extend, w)
      this.segs.push({ id: l.id, s0, s1, a, b, line: l })
      if (l.label && lx != null && covers(m.labelIdx, l.ai, l.bi, l.extend)) {
        const y = yAtX(a, b, lx)
        const price = y == null ? null : this.series.coordinateToPrice(y)
        if (y != null && price != null) this.labels.push({ y, text: this.fmt(price), color: l.color })
      }
    }
    if (m.ghost) {
      const a = this.px(m.ghost.ai, m.ghost.ap)
      const b = this.px(m.ghost.bi, m.ghost.bp)
      if (a && b) this.ghost = [a, b]
    }
    if (m.cursor) this.cursor = this.px(m.cursor.i, m.cursor.p)
  }
  paneViews(): readonly IPrimitivePaneView[] {
    const renderer: IPrimitivePaneRenderer = {
      draw: (target) =>
        target.useMediaCoordinateSpace(({ context: ctx }) => {
          const m = this.m
          if (!m) return
          ctx.save()
          ctx.lineCap = 'round'
          for (const s of this.segs) {
            ctx.strokeStyle = s.line.color
            ctx.lineWidth = s.line.width + (s.line.sel ? 0.5 : 0)
            ctx.setLineDash(DASH[s.line.dash])
            ctx.beginPath()
            ctx.moveTo(s.s0.x, s.s0.y)
            ctx.lineTo(s.s1.x, s.s1.y)
            ctx.stroke()
            if (s.line.sel && !m.bare) {
              ctx.setLineDash([])
              for (const [p, k] of [
                [s.a, 'a'],
                [s.b, 'b'],
              ] as const) {
                const on = s.line.sel === 'all' || s.line.sel === k
                ctx.beginPath()
                ctx.arc(p.x, p.y, on ? 5 : 4, 0, Math.PI * 2)
                ctx.fillStyle = on ? s.line.color : m.handle
                ctx.fill()
                ctx.lineWidth = 1.5
                ctx.strokeStyle = s.line.color
                ctx.stroke()
              }
            }
          }
          if (this.ghost && !m.bare) {
            ctx.setLineDash([5, 4])
            ctx.lineWidth = 1.5
            ctx.strokeStyle = m.ghost!.color
            ctx.beginPath()
            ctx.moveTo(this.ghost[0].x, this.ghost[0].y)
            ctx.lineTo(this.ghost[1].x, this.ghost[1].y)
            ctx.stroke()
          }
          if (this.cursor && !m.bare) {
            ctx.setLineDash([])
            ctx.beginPath()
            ctx.arc(this.cursor.x, this.cursor.y, 4, 0, Math.PI * 2)
            ctx.lineWidth = 1.5
            ctx.strokeStyle = m.ghost?.color ?? m.handle
            ctx.stroke()
          }
          ctx.restore()
        }),
    }
    return [{ zOrder: () => 'top', renderer: () => renderer }]
  }
  priceAxisViews(): readonly ISeriesPrimitiveAxisView[] {
    const fg = this.textColor()
    return this.labels.map((l) => ({
      coordinate: () => l.y,
      text: () => l.text,
      textColor: () => fg,
      backColor: () => l.color,
    }))
  }
  hitTest(x: number, y: number): PrimitiveHoveredItem | null {
    const p = { x, y }
    for (const s of [...this.segs].reverse()) {
      if (s.line.sel) {
        for (const k of ['a', 'b'] as const)
          if (Math.hypot(s[k].x - x, s[k].y - y) <= HIT) return { externalId: `draw:${s.id}:${k}`, zOrder: 'top', cursorStyle: 'move' }
      }
      if (distToSegment(p, s.s0, s.s1) <= HIT) return { externalId: `draw:${s.id}`, zOrder: 'top', cursorStyle: 'pointer' }
    }
    return null
  }
  /** 座標で当たる図形（マウスの操作。hitTest と同じ判定） */
  hit(x: number, y: number): DrawHit | null {
    const h = this.hitTest(x, y)
    return h ? parseHit(h.externalId) : null
  }
}
