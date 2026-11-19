// チャートの描画の操作（docs/design-drawings.md §3〜§5・§8）。ChartView が 1 つ持ち、キー・マウス・メニューを受けて
// 状態（shared/drawings.ts の step）を進め、窓のストア（store.svelte.ts）に書く。ChartView との接点は DrawContext だけ。
import {
  DRAWING_LIMIT,
  type Drawing,
  type DrawingPoint,
  type DrawMode,
  EXTENDS,
  type Extend,
  extendNext,
  indexOfDate,
  nearestSnap,
  nextSelection,
  nextSnap,
  normalizeDrawing,
  type SnapKey,
  selectionOrder,
  snapLevels,
  step,
  swingFrom,
  toRaw,
  toShown,
} from '@shared/drawings'
import type { Adjustment, Bars, Timeframe } from '@shared/types'
import type { IChartApi, ISeriesApi, SeriesType } from 'lightweight-charts'
import { choiceDialog, confirmDialog, nameOf, t, toast } from '../../stores/app.svelte'
import type { Key } from '../i18n'
import { localX } from '../pointer'
import { DrawingPrimitive, type DrawLine, type DrawModel } from './primitive'
import { drawingEdits, drawingsOf, ensureDrawings } from './store.svelte'

export type ChartBars = Bars & { splits: { date: string; ratio: number }[] }
export interface DrawContext {
  id(): string
  tf(): Timeframe
  adj(): Adjustment
  ctype(): 'candle' | 'bar' | 'line'
  log(): boolean
  /** 比較の表示（% 目盛り） */
  compare(): boolean
  bars(): ChartBars | null
  chart(): IChartApi | null
  series(): ISeriesApi<SeriesType> | null
  /** 取り消しの履歴の単位（ペインの ID） */
  scope(): string
  /** キーボード十字線の足 */
  kbIndex(): number | null
  /** 十字線と凡例をその足に（null で戻す） */
  showBar(i: number | null, price?: number): void
  css(name: string): string
  fmt(price: number): string
  host(): HTMLElement | undefined
  /** このペインにフォーカスを移す（線をクリックしたとき。押す操作を止めるのでペインが自分で移さない） */
  focus(): void
}

/** 押している間の吸着の距離（px。表示倍率を割り戻した値） */
const SNAP_PX = 8
const newId = () => `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const bar = (b: ChartBars, i: number) => ({ o: b.open[i]!, h: b.high[i]!, l: b.low[i]!, c: b.close[i]! })

/** ペイン → 操作（I のメニューが使う。MTF は操作しているの段だけ） */
const controllers = new Map<string, DrawController>()
export const drawControllerOf = (paneId: string): DrawController | undefined => controllers.get(paneId)

export class DrawController {
  mode = $state<DrawMode>({ m: 'idle' })
  /** 決められなかった理由（同じ足） */
  note = $state<'sameBar' | null>(null)
  private cur: { i: number; p: number; k: SnapKey | null } | null = null
  /** カーソルの足の日付（データの読み直しで足が増減しても、同じ日に置き直す） */
  private curDate: string | null = null
  private prim: DrawingPrimitive | null = null
  private bare = false
  /** 前に付けたときの時間軸・調整・種類（変わったときだけ、引いている途中をやめる。データの読み直しでは続ける） */
  private built = ''
  private drag: {
    id: string
    part: 'a' | 'b' | 'line'
    x: number
    y: number
    orig: Drawing
    moved: boolean
    pointer: number
  } | null = null
  private down: { x: number; y: number; i: number } | null = null
  /** 引いている間に押しているポインタ（離すまでスクロールを止める） */
  private pressing: number | null = null
  /** G で選ぶ順（選択中は最初の G の順を保つ。表示が動いても全部の線を回る） */
  private order: string[] | null = null
  /** ポインタをつないだ要素（ポインタを放すのに使う） */
  private host: HTMLElement | null = null
  private away: { x: number; y: number } | null = null

  constructor(private c: DrawContext) {
    ensureDrawings()
  }

  /** 描けない表示（比較・配当込み） */
  get hidden(): boolean {
    return this.c.compare() || this.c.adj() === 'total'
  }
  /** 案内の行の文言（通常は null） */
  get guide(): string | null {
    const s = this.mode
    if (s.m === 'start') return t('draw.guideStart')
    if (s.m === 'end') return t(this.note === 'sameBar' ? 'draw.sameBar' : 'draw.guideEnd')
    if (s.m === 'sel')
      return s.target === 'none' ? t('draw.guideSel') : t('draw.guideMove', { target: t(`draw.target.${s.target}` as Key) })
    return null
  }
  /** この銘柄のトレンドラインの本数（I のメニューが「選ぶ」を出すか決める） */
  count(): number {
    return drawingsOf(this.c.id()).length
  }
  register(paneId: string, on: boolean): void {
    if (on) controllers.set(paneId, this)
    else if (controllers.get(paneId) === this) controllers.delete(paneId)
  }

  // ---- ChartView から ----

  /** 作り直した（build）: プリミティブを付け直し、引いている途中ならやめる */
  attach(): void {
    const s = this.c.series()
    this.prim = null
    if (!s) return
    this.prim = new DrawingPrimitive(
      () => this.model(),
      (p) => this.c.fmt(p),
      () => this.c.css('--bg'),
    )
    s.attachPrimitive(this.prim)
    const key = `${this.c.tf()}|${this.c.adj()}|${this.c.ctype()}`
    if (key !== this.built) {
      this.built = key
      this.send({ t: 'rebuild' })
    } else this.remapCursor()
    if (this.hidden) this.send({ t: 'hidden' })
    else this.redraw()
  }
  symbol(): void {
    void drawingEdits.flush()
    this.send({ t: 'symbol' })
  }
  blur(): void {
    if (this.mode.m === 'idle') return
    void drawingEdits.flush()
    this.send({ t: 'blur' })
  }
  hiddenChanged(): void {
    if (this.hidden) this.send({ t: 'hidden' })
    else this.redraw()
  }
  /** ストアが変わった（ほかの窓・取り消し） */
  refresh(): void {
    const s = this.mode
    if (s.m === 'sel' && !this.drawing(s.id)) this.send({ t: 'removed', id: s.id })
    else this.redraw()
  }
  /** 画像の保存: 取っ手・カーソルを描かずに撮る */
  bareShot<T>(f: () => T): T {
    this.bare = true
    this.prim?.updateAllViews()
    try {
      return f()
    } finally {
      this.bare = false
      this.redraw()
    }
  }
  undo(redo: boolean): boolean {
    const scope = this.c.scope()
    if (!(redo ? drawingEdits.canRedo(scope) : drawingEdits.canUndo(scope))) return false
    void (redo ? drawingEdits.redo(scope) : drawingEdits.undo(scope)).then(() => this.refresh())
    return true
  }

  private send(e: Parameters<typeof step>[1]): void {
    const prev = this.mode
    const was = prev.m
    this.mode = step(this.mode, e)
    this.note = null
    const now = this.mode.m
    const drawing = now === 'start' || now === 'end'
    if (!drawing) {
      this.cur = null
      // 引く途中から抜けた、選択（動かす対象で十字線を出していることがある）から通常に戻った（Delete・フォーカスが外れた・
      // ほかの窓で消された・描けない表示になった）、または動かす対象を選んだまま別の線を選んだ（G・クリック。見るだけで選び直す）:
      // 十字線・凡例を戻す。線を選んだだけ（target が none）なら十字線を出していないので触れない（リンクしたチャートの十字線を消さない）
      const reselected = prev.m === 'sel' && this.mode.m === 'sel' && prev.target !== 'none' && this.mode.target === 'none'
      const fromTarget = was === 'sel' && prev.m === 'sel' && prev.target !== 'none'
      if (was === 'start' || was === 'end' || (fromTarget && now === 'idle') || reselected) this.c.showBar(null)
    }
    // 通常に戻った（Esc・Delete・フォーカスが外れた・銘柄が変わった）か、ドラッグしている線の選択が外れた（Alt+T・G）:
    // 押したまま・ドラッグの途中なら、止めたスクロールとポインタを解く
    const s = this.mode
    if (s.m === 'idle' || (this.drag && !(s.m === 'sel' && s.id === this.drag.id))) this.endPointer()
    if (this.mode.m !== 'sel') this.order = null
    this.redraw()
  }
  private redraw(): void {
    this.prim?.update()
    const host = this.c.host()
    if (!host) return
    const list = this.hidden ? [] : drawingsOf(this.c.id())
    const b = this.c.bars()
    const adj = this.c.adj()
    const sp = b?.splits ?? []
    host.dataset.drawings = JSON.stringify(
      list.map((d) => ({
        id: d.id,
        a: { date: d.a.date, raw: d.a.raw, shown: toShown(d.a.raw, d.a.date, adj, sp) },
        b: { date: d.b.date, raw: d.b.raw, shown: toShown(d.b.raw, d.b.date, adj, sp) },
        extend: d.extend,
        priceLabel: d.priceLabel,
      })),
    )
    const s = this.mode
    host.dataset.drawState = JSON.stringify({
      m: s.m,
      ...(s.m === 'sel' ? { id: s.id, target: s.target } : {}),
      ...(this.cur && b ? { date: b.time[this.cur.i], price: this.cur.p, snap: this.cur.k } : {}),
      ...(this.note ? { note: this.note } : {}),
    })
  }
  private drawing(id: string): Drawing | undefined {
    return drawingsOf(this.c.id()).find((d) => d.id === id)
  }
  private shown(p: DrawingPoint): number | null {
    return toShown(p.raw, p.date, this.c.adj(), this.c.bars()?.splits ?? [])
  }
  private raw(price: number, date: string): number | null {
    return toRaw(price, date, this.c.adj(), this.c.bars()?.splits ?? [])
  }
  private idx(date: string): number {
    const b = this.c.bars()
    return b ? indexOfDate(date, b.time, this.c.tf()) : Number.NaN
  }

  private model(): DrawModel {
    const handle = this.c.css('--panel')
    const empty: DrawModel = { lines: [], ghost: null, cursor: null, labelIdx: 0, bare: this.bare, handle }
    const b = this.c.bars()
    if (!b?.time.length || this.hidden) return empty
    const s = this.mode
    const lines: DrawLine[] = []
    for (const d of drawingsOf(this.c.id())) {
      const ap = this.shown(d.a)
      const bp = this.shown(d.b)
      if (ap == null || bp == null) continue
      lines.push({
        id: d.id,
        ai: this.idx(d.a.date),
        ap,
        bi: this.idx(d.b.date),
        bp,
        extend: d.extend,
        color: this.c.css(d.color ?? '--draw-1'),
        width: d.width ?? 1.5,
        dash: d.dash ?? 'solid',
        label: d.priceLabel,
        sel: s.m === 'sel' && s.id === d.id ? s.target : null,
      })
    }
    const r = this.c.chart()?.timeScale().getVisibleLogicalRange()
    const labelIdx = clamp(Math.floor(r?.to ?? b.time.length - 1), 0, b.time.length - 1)
    const color = this.c.css('--draw-1')
    let ghost: DrawModel['ghost'] = null
    if (s.m === 'end' && this.cur) {
      const ap = this.shown(s.a)
      if (ap != null) ghost = { ai: this.idx(s.a.date), ap, bi: this.cur.i, bp: this.cur.p, color }
    }
    const cursor = (s.m === 'start' || s.m === 'end') && this.cur ? { i: this.cur.i, p: this.cur.p } : null
    return { lines, ghost, cursor, labelIdx, bare: this.bare, handle }
  }

  // ---- キー（§3） ----

  key(e: KeyboardEvent): boolean {
    const ctrl = e.ctrlKey || e.metaKey
    if (e.altKey && !ctrl && !e.shiftKey && e.code === 'KeyT') {
      this.begin()
      return true
    }
    if (e.altKey) return false
    const m = this.mode.m
    if (m === 'start' || m === 'end') return this.drawKey(e, ctrl)
    if (m === 'sel' && this.selKey(e, ctrl)) return true
    if (!ctrl && e.code === 'KeyG') {
      this.select(e.shiftKey ? -1 : 1)
      return true
    }
    return false
  }

  /** 引き始める（Alt+T・I のメニュー） */
  begin(): void {
    if (this.hidden) {
      toast(t(this.c.compare() ? 'draw.hiddenCompare' : 'draw.hiddenTotal'))
      return
    }
    const b = this.c.bars()
    if (!b?.time.length) return
    void drawingEdits.flush()
    const r = this.c.chart()?.timeScale().getVisibleLogicalRange()
    const last = clamp(Math.floor(r?.to ?? b.time.length - 1), 0, b.time.length - 1)
    const i = clamp(this.c.kbIndex() ?? last, 0, b.time.length - 1)
    this.send({ t: 'begin' })
    const k: SnapKey = this.c.ctype() === 'line' ? 'c' : 'h'
    this.cur = { i, p: bar(b, i)[k], k }
    this.show()
  }
  private visible(): { from: number; to: number } | null {
    const b = this.c.bars()
    const r = this.c.chart()?.timeScale().getVisibleLogicalRange()
    if (!b || !r) return null
    return { from: clamp(Math.ceil(r.from), 0, b.time.length - 1), to: clamp(Math.floor(r.to), 0, b.time.length - 1) }
  }
  /** 価格の 1 段（表示の高さの 1/100） */
  private priceStep(big: boolean): number {
    const s = this.c.series()
    const h = this.c.chart()?.panes()[0]?.getHeight() ?? 0
    const top = s?.coordinateToPrice(0)
    const bottom = s?.coordinateToPrice(h)
    const span = top != null && bottom != null ? Math.abs(top - bottom) : 0
    return (span / 100) * (big ? 10 : 1)
  }
  /**
   * 価格を画面の上で 1 段（本体の段の高さの 1/100。big は 10 段）上か下へずらした価格。座標に直せなければ価格の 1 段、
   * それも有限でなければ（極端な対数目盛り）価格の 1 %（big は 10 %）。正の有限の値か、直せなければ元の価格を返す
   */
  private shiftPrice(p: number, up: 1 | -1, big: boolean): number {
    const s = this.c.series()
    const h = this.c.chart()?.panes()[0]?.getHeight() ?? 0
    const y = s?.priceToCoordinate(p)
    const moved = y == null || !h ? null : s?.coordinateToPrice(y - up * (h / 100) * (big ? 10 : 1))
    const ok = (v: number | null | undefined): v is number => v != null && Number.isFinite(v) && v > 0
    if (ok(moved)) return moved
    const byStep = p + up * this.priceStep(big)
    if (ok(byStep)) return byStep
    const byPct = p * (1 + up * 0.01 * (big ? 10 : 1))
    return ok(byPct) ? byPct : p
  }
  /** 足 i へ（吸着していれば同じ種類の点、いなければ同じ価格） */
  private moveTo(i: number, k: SnapKey | null, p: number): { i: number; p: number; k: SnapKey | null } {
    const b = this.c.bars()!
    const kk = k && this.c.ctype() === 'line' ? 'c' : k
    return { i, k: kk, p: kk ? bar(b, i)[kk] : p }
  }
  /** ← → ↑ ↓ などで動かした先（扱わないキーは null） */
  private nextCursor(e: KeyboardEvent, ctrl: boolean, from: { i: number; p: number; k: SnapKey | null }) {
    const b = this.c.bars()!
    const n = b.time.length
    const dir = e.key === 'ArrowLeft' || e.key === 'PageUp' ? -1 : 1
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      if (ctrl) {
        const sw = swingFrom(b.high, b.low, from.i, dir)
        return sw ? this.moveTo(sw.i, this.c.ctype() === 'line' ? 'c' : sw.kind, from.p) : from
      }
      return this.moveTo(clamp(from.i + dir * (e.shiftKey ? 10 : 1), 0, n - 1), from.k, from.p)
    }
    if (e.key === 'PageUp' || e.key === 'PageDown') {
      const v = this.visible()
      const span = v ? Math.max(1, v.to - v.from) : 20
      return this.moveTo(clamp(from.i + dir * span, 0, n - 1), from.k, from.p)
    }
    if (e.key === 'Home' || e.key === 'End') {
      const v = this.visible()
      return this.moveTo(v ? (e.key === 'Home' ? v.from : v.to) : e.key === 'Home' ? 0 : n - 1, from.k, from.p)
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const up = e.key === 'ArrowUp' ? 1 : -1
      // 画面の上の 1 段（対数目盛りでも同じ高さ。全体を動かす ↑ ↓ と同じ）
      if (e.shiftKey) return { i: from.i, k: null, p: Math.max(Number.EPSILON, this.shiftPrice(from.p, up, ctrl)) }
      const l = nextSnap(snapLevels(bar(b, from.i), this.c.ctype()), from.p, up)
      return { i: from.i, k: l.k, p: l.v }
    }
    return null
  }
  private drawKey(e: KeyboardEvent, ctrl: boolean): boolean {
    const b = this.c.bars()
    const s = this.mode
    if (!b?.time.length || !this.cur || (s.m !== 'start' && s.m !== 'end')) return false
    if (e.key === 'Escape') {
      const keep = this.cur
      this.send({ t: 'esc' })
      if (this.mode.m === 'start') {
        this.cur = keep
        this.show()
      }
      return true
    }
    if (e.key === 'Enter') {
      this.enter()
      return true
    }
    const next = this.nextCursor(e, ctrl, this.cur)
    if (!next) return false
    this.cur = next
    this.note = null
    this.show()
    return true
  }
  /** 点を決める（Enter・クリック） */
  private enter(): void {
    const b = this.c.bars()
    const s = this.mode
    if (!b || !this.cur) return
    const date = b.time[this.cur.i]!
    const raw = this.raw(this.cur.p, date)
    if (raw == null || !Number.isFinite(raw) || !(raw > 0)) return
    const point = { date, raw }
    if (s.m === 'start') {
      this.send({ t: 'enter', point })
      this.show()
      return
    }
    if (s.m !== 'end') return
    if (this.idx(s.a.date) === this.cur.i || s.a.date === date) {
      this.note = 'sameBar'
      this.redraw()
      return
    }
    const id = this.c.id()
    if (drawingsOf(id).length >= DRAWING_LIMIT) {
      toast(t('draw.limit', { n: DRAWING_LIMIT }))
      return
    }
    const d = normalizeDrawing({
      id: newId(),
      kind: 'trend',
      a: s.a,
      b: point,
      extend: 'none',
      priceLabel: true,
      log: this.c.log(),
      created: '',
      updated: '',
    } satisfies Drawing)
    void drawingEdits.create(this.c.scope(), id, d).then(() => this.refresh())
    this.send({ t: 'created', id: d.id })
  }
  /** データの読み直しのあと、カーソルを同じ日付の足へ（無ければ端へ。吸着していればその足の点） */
  private remapCursor(): void {
    const b = this.c.bars()
    if (!b?.time.length || !this.cur || !this.curDate) return
    const i = clamp(indexOfDate(this.curDate, b.time, this.c.tf()), 0, b.time.length - 1)
    this.cur = this.moveTo(i, this.cur.k, this.cur.p)
    this.curDate = b.time[i]!
  }
  /** カーソルを見えるようにして、十字線・凡例をその足に */
  private show(): void {
    const b = this.c.bars()
    if (!b || !this.cur) {
      this.redraw()
      return
    }
    this.curDate = b.time[this.cur.i] ?? null
    this.reveal(this.cur.i)
    this.c.showBar(this.cur.i, this.cur.p)
    this.redraw()
  }
  private reveal(i: number): void {
    const ts = this.c.chart()?.timeScale()
    const r = ts?.getVisibleLogicalRange()
    if (!ts || !r) return
    const span = r.to - r.from
    if (i < r.from + 1) ts.setVisibleLogicalRange({ from: i - 2, to: i - 2 + span })
    else if (i > r.to - 1) ts.setVisibleLogicalRange({ from: i + 2 - span, to: i + 2 })
  }

  private selKey(e: KeyboardEvent, ctrl: boolean): boolean {
    const s = this.mode
    if (s.m !== 'sel') return false
    const d = this.drawing(s.id)
    if (!d) return false
    const scope = this.c.scope()
    const id = this.c.id()
    if (ctrl) {
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && (s.target === 'a' || s.target === 'b')) return this.nudge(e, true)
      return false
    }
    if (e.code === 'Space') {
      this.send({ t: 'space' })
      const p = s.target === 'none' ? d.a : s.target === 'all' ? d.a : s.target === 'a' ? d.b : null
      if (p) this.c.showBar(this.idx(p.date), this.shown(p) ?? undefined)
      else this.c.showBar(null) // 見るだけに戻った: 十字線・凡例を戻す（Esc と同じ）
      return true
    }
    if (e.key === 'Escape') {
      void drawingEdits.flush()
      this.send({ t: 'esc' })
      this.c.showBar(null)
      return true
    }
    if (e.key === 'Delete') {
      void drawingEdits.remove(scope, id, d.id).then(() => this.refresh())
      this.send({ t: 'removed', id: d.id })
      return true
    }
    if (e.code === 'KeyE' && !e.shiftKey) {
      this.setExtend(d, extendNext(d.extend))
      return true
    }
    if (e.key === 'Enter') {
      void this.menu()
      return true
    }
    if (s.target !== 'none' && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return this.nudge(e, false)
    return false
  }
  private setExtend(d: Drawing, x: Extend): void {
    drawingEdits.edit(this.c.scope(), this.c.id(), { ...d, extend: x })
    toast(`${t('draw.extend')}: ${t(`draw.extend.${x}` as Key)}`)
    this.redraw()
  }
  /** 選んだ線を動かす（全体・始点・終点） */
  private nudge(e: KeyboardEvent, ctrl: boolean): boolean {
    const s = this.mode
    const b = this.c.bars()
    if (s.m !== 'sel' || !b?.time.length) return false
    const d = this.drawing(s.id)
    if (!d) return false
    const n = b.time.length
    const ap = this.shown(d.a)
    const bp = this.shown(d.b)
    if (ap == null || bp == null) return false
    let next: Drawing | null = null
    if (s.target === 'all') {
      const ai = this.idx(d.a.date)
      const bi = this.idx(d.b.date)
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        // 2 点が同じ足（日足で同じ週に引いた線を週足で見る）は横に動かさない（同じ日付になる）
        if (ai === bi) return true
        const dir = e.key === 'ArrowLeft' ? -1 : 1
        // 足の範囲の中だけで動かす（範囲の外の点は日付を作れない）
        let k = e.shiftKey ? 10 : 1
        k = dir < 0 ? Math.min(k, Math.min(ai, bi)) : Math.min(k, n - 1 - Math.max(ai, bi))
        if (k <= 0 || ai < 0 || bi > n - 1) return true
        const na = b.time[ai + dir * k]!
        const nb = b.time[bi + dir * k]!
        const ra = this.raw(ap, na)
        const rb = this.raw(bp, nb)
        if (ra && rb) next = { ...d, a: { date: na, raw: ra }, b: { date: nb, raw: rb } }
      } else {
        // 画面の上で同じ高さだけずらす（対数目盛りで価格に同じ額を足すと、2 点のずれる高さが違って傾きが変わる）
        const up = e.key === 'ArrowUp' ? 1 : -1
        const ra = this.raw(this.shiftPrice(ap, up, e.shiftKey), d.a.date)
        const rb = this.raw(this.shiftPrice(bp, up, e.shiftKey), d.b.date)
        if (ra && rb && Number.isFinite(ra) && Number.isFinite(rb) && ra > 0 && rb > 0)
          next = { ...d, a: { ...d.a, raw: ra }, b: { ...d.b, raw: rb } }
      }
    } else if (s.target === 'a' || s.target === 'b') {
      const me = d[s.target]
      const other = d[s.target === 'a' ? 'b' : 'a']
      const p = me === d.a ? ap : bp
      const i0 = clamp(this.idx(me.date), 0, n - 1)
      const lv = snapLevels(bar(b, i0), this.c.ctype())
      const k = lv.find((x) => x.v === p)?.k ?? null
      let to = this.nextCursor(e, ctrl, { i: i0, p, k })
      if (!to) return false
      // 相手の端点の足に当たったら、同じ向きにもう 1 つ先へ（相手を飛び越える。同じ足には置かない）
      const oi = this.idx(other.date)
      if (to.i === oi) to = this.nextCursor(e, ctrl, to)
      if (!to || to.i === oi) return true
      const date = b.time[to.i]!
      const raw = this.raw(to.p, date)
      if (!raw || !Number.isFinite(raw) || raw <= 0) return true
      const moved = { ...d, [s.target]: { date, raw } } as Drawing
      next = normalizeDrawing(moved)
      // 始点と終点が入れ替わったら、動かしている点の名前もそろえる
      if (next !== moved) this.mode = { ...s, target: s.target === 'a' ? 'b' : 'a' }
      this.c.showBar(to.i, to.p)
      this.reveal(to.i)
    }
    if (next) drawingEdits.edit(this.c.scope(), this.c.id(), next)
    this.redraw()
    return true
  }
  /** G・Shift+G で図形を選ぶ */
  select(dir: 1 | -1): void {
    const b = this.c.bars()
    if (this.hidden) {
      toast(t(this.c.compare() ? 'draw.hiddenCompare' : 'draw.hiddenTotal'))
      return
    }
    if (!b?.time.length) return
    const list = drawingsOf(this.c.id())
    const items = list.map((d) => ({ id: d.id, ai: this.idx(d.a.date), bi: this.idx(d.b.date) }))
    const r = this.c.chart()?.timeScale().getVisibleLogicalRange()
    const from = r?.from ?? 0
    const to = r?.to ?? b.time.length - 1
    const anchor = this.c.kbIndex() ?? Math.floor(to)
    const s = this.mode
    if (s.m !== 'sel' || !this.order) this.order = selectionOrder(items, from, to, anchor)
    const order = this.order.filter((id) => items.some((x) => x.id === id))
    const next = nextSelection(order, s.m === 'sel' ? s.id : null, dir)
    if (!next) {
      toast(t('draw.none'))
      return
    }
    void drawingEdits.flush()
    this.send({ t: 'select', id: next })
    const it = items.find((x) => x.id === next)!
    const lo = Math.min(it.ai, it.bi)
    const hi = Math.max(it.ai, it.bi)
    if (r && (hi < r.from || lo > r.to)) {
      const span = r.to - r.from
      const mid = (lo + hi) / 2
      this.c
        .chart()
        ?.timeScale()
        .setVisibleLogicalRange({ from: mid - span / 2, to: mid + span / 2 })
    }
  }

  // ---- メニュー（§5） ----

  async menu(): Promise<void> {
    const s = this.mode
    if (s.m !== 'sel') return
    const d = this.drawing(s.id)
    if (!d) return
    const c = await choiceDialog(t('draw.menu'), [
      ...EXTENDS.map((x) => ({
        id: `ext:${x}`,
        label: `${t('draw.extend')}: ${t(`draw.extend.${x}` as Key)}`,
        hint: d.extend === x ? '✓' : '',
      })),
      { id: 'label', label: t('draw.priceLabel'), hint: d.priceLabel ? 'ON' : 'OFF' },
      { id: 'delete', label: t('draw.delete'), hint: 'Delete' },
    ])
    const cur = this.drawing(d.id)
    if (!c || !cur) return
    if (c.startsWith('ext:')) this.setExtend(cur, c.slice(4) as Extend)
    else if (c === 'label') {
      drawingEdits.edit(this.c.scope(), this.c.id(), { ...cur, priceLabel: !cur.priceLabel })
      this.redraw()
    } else if (c === 'delete') {
      void drawingEdits.remove(this.c.scope(), this.c.id(), cur.id).then(() => this.refresh())
      this.send({ t: 'removed', id: cur.id })
    }
  }
  /** この銘柄の描画をすべて消す（確かめてから。Ctrl+Z で戻せる） */
  async clearAll(): Promise<void> {
    const id = this.c.id()
    const n = drawingsOf(id).length
    if (!n) {
      toast(t('draw.none'))
      return
    }
    const r = await confirmDialog({
      title: t('draw.clear'),
      body: t('draw.clearConfirm', { name: nameOf(id), n }),
      ok: t('draw.delete'),
      danger: true,
    })
    if (!r.ok) return
    this.send({ t: 'blur' })
    await drawingEdits.clear(this.c.scope(), id)
    toast(t('draw.cleared'))
    this.refresh()
  }

  // ---- マウス（§4） ----

  /** host にポインタの操作をつなぐ（キャプチャ段階。チャートのスクロールより先に受ける）。外す関数を返す */
  bindPointer(host: HTMLElement): () => void {
    this.host = host
    const opts = { capture: true }
    const down = (e: PointerEvent) => this.onDown(e, host)
    const move = (e: PointerEvent) => this.onMove(e, host)
    const up = (e: PointerEvent) => this.onUp(e, host)
    const cancel = () => this.endPointer()
    const ctx = (e: MouseEvent) => this.onContext(e, host)
    // 取り消された・ポインタを取り損なったときも、離したのと同じに終える（スクロールを止めたままにしない）
    const ev: [string, EventListener][] = [
      ['pointerdown', down as EventListener],
      ['pointermove', move as EventListener],
      ['pointerup', up as EventListener],
      ['pointercancel', cancel],
      ['lostpointercapture', cancel],
      ['contextmenu', ctx as EventListener],
    ]
    for (const [n, f] of ev) host.addEventListener(n, f, opts)
    return () => {
      for (const [n, f] of ev) host.removeEventListener(n, f, opts)
      if (this.host === host) this.host = null
    }
  }
  /** ポインタの位置（host の中の CSS の px。表示倍率を割り戻す。lib/pointer.ts） */
  private xy(e: MouseEvent, host: HTMLElement): { x: number; y: number } {
    const r = host.getBoundingClientRect()
    return { x: localX(e.clientX, r, host.clientWidth), y: localX(e.clientY, { left: r.top, width: r.height }, host.clientHeight) }
  }
  /** ポインタの位置（本体の段の中だけ） */
  private local(e: MouseEvent, host: HTMLElement): { x: number; y: number } | null {
    const { x, y } = this.xy(e, host)
    const ch = this.c.chart()
    const w = ch?.timeScale().width() ?? 0
    const h = ch?.panes()[0]?.getHeight() ?? 0
    return x >= 0 && y >= 0 && x <= w && y <= h ? { x, y } : null
  }
  /** ポインタの位置 → カーソル（足に丸め、弱い吸着。Ctrl で外す） */
  private pointAt(p: { x: number; y: number }, free: boolean): { i: number; p: number; k: SnapKey | null } | null {
    const b = this.c.bars()
    const ch = this.c.chart()
    const s = this.c.series()
    if (!b?.time.length || !ch || !s) return null
    const lg = ch.timeScale().coordinateToLogical(p.x)
    const price = s.coordinateToPrice(p.y)
    if (lg == null || price == null) return null
    const i = clamp(Math.round(lg), 0, b.time.length - 1) // 右の余白（未来）は最後の足
    if (!free) {
      const lv = snapLevels(bar(b, i), this.c.ctype()).map((l) => ({ k: l.k, y: s.priceToCoordinate(l.v) ?? Number.NaN }))
      const k = nearestSnap(lv, p.y, SNAP_PX)
      if (k) return { i, k, p: bar(b, i)[k] }
    }
    return price > 0 ? { i, k: null, p: price } : null
  }
  private freeze(on: boolean): void {
    this.c.chart()?.applyOptions({ handleScroll: !on, handleScale: !on })
  }
  private onDown(e: PointerEvent, host: HTMLElement): void {
    if (e.button !== 0 || this.hidden) return
    const p = this.local(e, host)
    if (!p) return
    const m = this.mode.m
    if (m === 'start' || m === 'end') {
      // preventDefault はしない（互換の mousedown で、マルチ時間軸の段・ペインのフォーカスが移る）。スクロールは止める
      e.stopPropagation()
      this.c.focus()
      this.freeze(true)
      this.pressing = e.pointerId
      host.setPointerCapture?.(e.pointerId)
      const cur = this.pointAt(p, e.ctrlKey)
      if (!cur) return
      this.cur = cur
      this.down = { ...p, i: cur.i }
      this.enter()
      return
    }
    const hit = this.prim?.hit(p.x, p.y)
    if (hit) {
      const d = this.drawing(hit.id)
      if (!d) return
      e.stopPropagation()
      this.c.focus()
      void drawingEdits.flush()
      if (!(this.mode.m === 'sel' && this.mode.id === hit.id)) this.send({ t: 'select', id: hit.id })
      this.drag = { id: hit.id, part: hit.part, x: p.x, y: p.y, orig: d, moved: false, pointer: e.pointerId }
      this.freeze(true)
      host.setPointerCapture?.(e.pointerId)
      return
    }
    this.away = m === 'sel' ? p : null
  }
  private onMove(e: PointerEvent, host: HTMLElement): void {
    const m = this.mode.m
    if ((m === 'start' || m === 'end') && !this.drag) {
      const p = this.local(e, host)
      const cur = p && this.pointAt(p, e.ctrlKey)
      if (!cur) return
      this.cur = cur
      this.curDate = this.c.bars()?.time[cur.i] ?? null
      this.note = null
      this.c.showBar(cur.i, cur.p)
      this.redraw()
      return
    }
    const g = this.drag
    if (!g) return
    const p = this.xy(e, host)
    if (!g.moved && Math.hypot(p.x - g.x, p.y - g.y) < 3) return
    g.moved = true
    const next = this.dragged(g, p, e.ctrlKey)
    if (next) {
      drawingEdits.edit(this.c.scope(), this.c.id(), next, { hold: true })
      this.redraw()
    }
  }
  /** ドラッグした先の図形 */
  private dragged(g: NonNullable<DrawController['drag']>, p: { x: number; y: number }, free: boolean): Drawing | null {
    const b = this.c.bars()
    const ch = this.c.chart()
    const s = this.c.series()
    if (!b || !ch || !s) return null
    const d = g.orig
    const n = b.time.length
    if (g.part === 'line') {
      const l0 = ch.timeScale().coordinateToLogical(g.x)
      const l1 = ch.timeScale().coordinateToLogical(p.x)
      if (l0 == null || l1 == null) return null
      const ai = this.idx(d.a.date)
      const bi = this.idx(d.b.date)
      if (ai < 0 || bi > n - 1) return null
      const di = ai === bi ? 0 : clamp(Math.round(l1 - l0), -Math.min(ai, bi), n - 1 - Math.max(ai, bi))
      const dy = p.y - g.y
      const shift = (pt: DrawingPoint, i: number): DrawingPoint | null => {
        const shown = this.shown(pt)
        const y0 = shown == null ? null : s.priceToCoordinate(shown)
        const price = y0 == null ? null : s.coordinateToPrice(y0 + dy)
        const date = b.time[i + di]!
        const raw = price == null ? null : this.raw(price, date)
        return raw && raw > 0 ? { date, raw } : null
      }
      const a = shift(d.a, ai)
      const bb = shift(d.b, bi)
      return a && bb ? { ...d, a, b: bb } : null
    }
    const cur = this.pointAt(p, free)
    if (!cur) return null
    const other = d[g.part === 'a' ? 'b' : 'a']
    if (cur.i === this.idx(other.date)) return null
    const date = b.time[cur.i]!
    const raw = this.raw(cur.p, date)
    if (!raw) return null
    // ドラッグの間は a/b を入れ替えない（離したときにそろえる）
    return { ...d, [g.part]: { date, raw } } as Drawing
  }
  private onUp(e: PointerEvent, host: HTMLElement): void {
    if (this.pressing != null) {
      this.pressing = null
      this.freeze(false)
    }
    const g = this.drag
    if (g) {
      this.drag = null
      this.freeze(false)
      this.release(g.pointer)
      const d = this.drawing(g.id)
      if (g.moved && d) {
        const n = normalizeDrawing(d)
        if (n !== d) drawingEdits.edit(this.c.scope(), this.c.id(), n)
      }
      void drawingEdits.flush(g.id)
      this.redraw()
      return
    }
    // 押したまま動かして離しても引ける（始点で押し、別の足で離す）
    if (this.mode.m === 'end' && this.down) {
      const p = this.local(e, host)
      const cur = p && this.pointAt(p, e.ctrlKey)
      if (cur && cur.i !== this.down.i) {
        this.cur = cur
        this.enter()
      }
    }
    this.down = null
    const a = this.away
    this.away = null
    if (a && this.mode.m === 'sel') {
      const p = this.local(e, host)
      if (p && Math.hypot(p.x - a.x, p.y - a.y) < 3) {
        void drawingEdits.flush()
        this.send({ t: 'esc' })
        this.c.showBar(null)
      }
    }
  }
  /**
   * 押したまま・ドラッグの途中を終える（点は決めない）: 止めたスクロールを戻し、ポインタを放し、ドラッグで動かした分を書く。
   * 取り消された・ポインタを取り損なったとき（pointercancel・lostpointercapture）と、通常に戻ったとき（send）に呼ぶ
   */
  private endPointer(): void {
    const g = this.drag
    const pressed = this.pressing
    this.drag = null
    this.pressing = null
    this.down = null
    this.away = null
    if (!g && pressed == null) return
    this.freeze(false)
    if (g) this.release(g.pointer)
    if (pressed != null) this.release(pressed)
    if (g) void drawingEdits.flush(g.id)
    this.prim?.update()
  }
  /**
   * ポインタを放す。取っていない（ブラウザがもう放した・ポインタがもう有効でない）ポインタを放すと NotFoundError を投げ、
   * そのあとの後始末（書きかけを書く）が止まるので、取っているときだけ
   */
  private release(pointer: number): void {
    const host = this.host
    if (host?.hasPointerCapture?.(pointer)) host.releasePointerCapture(pointer)
  }
  private onContext(e: MouseEvent, host: HTMLElement): void {
    const p = this.local(e, host)
    const hit = p && this.prim?.hit(p.x, p.y)
    if (!hit) return
    e.preventDefault()
    e.stopPropagation()
    this.c.focus()
    if (!(this.mode.m === 'sel' && this.mode.id === hit.id)) this.send({ t: 'select', id: hit.id })
    void this.menu()
  }
}
