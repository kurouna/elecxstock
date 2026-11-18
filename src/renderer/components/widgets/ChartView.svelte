<script lang="ts">
// チャートの本体（§7, FR-C1〜C9, FR-K3, K4）。chart と mtf-chart（1 ペインに日・週・月）が使う。
// 指標・種類・調整などの表示はペインの状態（pane.state）に持ち、時間軸だけを呼ぶ側が渡す。

import { priceDigits } from '@shared/markets'
import type { Adjustment, Bars, InstrumentId, Timeframe } from '@shared/types'
import { type YieldLine, yieldLines } from '@shared/yieldLines'
import {
  BarSeries,
  CandlestickSeries,
  CrosshairMode,
  createChart,
  createSeriesMarkers,
  HistogramSeries,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  LineSeries,
  LineStyle,
  type LineWidth,
  PriceScaleMode,
  type SeriesMarker,
  type SeriesType,
  type Time,
} from 'lightweight-charts'
import { onMount, untrack } from 'svelte'
import { getBars } from '../../lib/barsCache'
import { type ChartSnapshot, visibleSpan } from '../../lib/chartImage'
import { DrawController } from '../../lib/drawings/controller.svelte'
import { drawingsState } from '../../lib/drawings/store.svelte'
import { cls, px, sgn } from '../../lib/format'
import {
  type DigitsKind,
  histTone,
  indicatorDigits,
  type LegendLine,
  legendByPane,
  paneTops,
  priceFormat,
  stretchFactors,
  withAlpha,
} from '../../lib/indicatorPanes'
import { bollinger, ichimoku, macd, rsiSeries, type Series, sma, stochastic } from '../../lib/indicators'
import { barsForPeriod } from '../../lib/periods'
import { app, ensureMetrics, metric, nameOf, t, touched } from '../../stores/app.svelte'
import type { PaneNode } from '../../stores/layout.svelte'
import { type ChartHandle, charts, RangeEcho, sendCrosshair } from './chartSync'

export type Indicator = 'ma' | 'vol' | 'volma' | 'bb' | 'ichimoku' | 'rsi' | 'macd' | 'stoch' | 'divs'
export const INDICATORS: Indicator[] = ['ma', 'vol', 'volma', 'bb', 'ichimoku', 'rsi', 'macd', 'stoch', 'divs']
export type ChartType = 'candle' | 'bar' | 'line'
export interface ChartViewApi {
  key: (e: KeyboardEvent) => boolean
  /** 画像の保存（FR-C11）: 今の表示を描いたキャンバス（十字線は入れない）・見えている期間・描いている足の時間軸・倍率 */
  snapshot: () => ChartSnapshot | null
  /** 描画の取り消し・やり直し（Ctrl+Z / Ctrl+Y。戻すものが無ければ false） */
  undo: (redo: boolean) => boolean
}

let {
  pane,
  id,
  tf,
  active = true,
  onApi,
}: { pane: PaneNode; id: InstrumentId; tf: Timeframe; active?: boolean; onApi?: (api: ChartViewApi) => void } = $props()

const S = $derived(pane.state as Record<string, unknown>)
/** 凡例の価格の桁（マーケット一覧の行だけ。FR-MB2） */
const pdg = $derived(priceDigits(id))
const log = $derived(!!S.log)
const adj = $derived(((S.adj as Adjustment) ?? 'split') as Adjustment)
const ctype = $derived(((S.ctype as ChartType) ?? 'candle') as ChartType)
const ind = $derived(new Set((S.ind as Indicator[] | undefined) ?? ['ma', 'vol', 'divs']))
const cmp = $derived(((S.cmp as InstrumentId[] | undefined) ?? []).filter((x) => x !== id).slice(0, 5))
// 作り直し・読み直しは中身で見る（pane.state が置き換わるたびに Set・配列は新しくなるので、そのまま読むと関係のない変更でも走る）
const indKey = $derived([...ind].join())
const cmpKey = $derived(cmp.join())
const syncRange = $derived(!!S.syncRange)
const periods = $derived(app.settings.maPeriods[tf])
const MA_COLORS = ['--ma1', '--ma2', '--ma3']
const CMP_COLORS = ['--ind1', '--ind2', '--ind3', '--ind4', '--l5']

let host = $state<HTMLDivElement>()
let bars = $state<(Bars & { dividends: { date: string; amount: number }[]; splits: { date: string; ratio: number }[] }) | null>(null)
let cmpBars = $state<Record<string, Bars>>({})
let loading = $state(true)
let legendIdx = $state<number | null>(null)
let kbIndex: number | null = null
let chart: IChartApi | null = null
let main: ISeriesApi<SeriesType> | null = null
let markers: ISeriesMarkersPluginApi<Time> | null = null
/** アラートの点線（FR-AL9） */
let alertLines: IPriceLine[] = []
/** 目標利回りの点線（FR-C12） */
let targetLines: IPriceLine[] = []
/** 凡例に出す線（indicatorPanes.ts の LegendLine） */
let lines = $state<LegendLine[]>([])
/** 下の段の名前（段の番号 → 名前。1 から） */
let paneTitles = $state<Record<number, string>>({})
/** 段ごとの上端（px。下の段の凡例を置く） */
let tops = $state<number[]>([])
let paneObs: ResizeObserver | null = null
let token = 0
const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim()

/** チャートの描画（トレンドライン。docs/design-drawings.md）。ChartView との接点はこの文脈だけ */
const draw = new DrawController({
  id: () => id,
  tf: () => shownTf,
  adj: () => shownAdj,
  ctype: () => ctype,
  log: () => log,
  compare: () => cmp.length > 0,
  bars: () => bars,
  chart: () => chart,
  series: () => main,
  scope: () => `${pane.id}|${id}`,
  kbIndex: () => kbIndex,
  showBar(i, price) {
    if (!chart || !main || !bars?.time.length) return
    if (i == null) {
      if (kbIndex != null) return moveKb(0)
      clearKb()
      return
    }
    const j = Math.max(0, Math.min(bars.time.length - 1, i))
    chart.setCrosshairPosition(price ?? bars.close[j]!, bars.time[j] as Time, main)
    legendIdx = j
    linked((o) => o.show(bars!.time[j]!))
  },
  css,
  fmt: (p) => main?.priceFormatter().format(p) ?? String(p),
  host: () => host,
  focus: () => {
    app.focus = pane.id
  },
})
// 銘柄が変わった・ほかの段へ・フォーカスが外れた・描けない表示になった・ストアが変わった
$effect(() => {
  void id
  untrack(() => draw.symbol())
})
$effect(() => {
  const on = active && app.focus === pane.id
  untrack(() => {
    draw.register(pane.id, active)
    if (!on) draw.blur()
  })
})
const drawHidden = $derived(cmp.length > 0 || adj === 'total')
$effect(() => {
  void drawHidden
  untrack(() => draw.hiddenChanged())
})
$effect(() => {
  void drawingsState.rev
  untrack(() => draw.refresh())
})

/** 描いている足の時間軸（D/W/M を押してから読み終わるまでは前の足を出しているので、tf とずれる。画像の名前に使う） */
let shownTf: Timeframe = untrack(() => tf)
/** 描いている足の価格の調整（A を押してから読み終わるまでは前の足。描画の換算に使う） */
let shownAdj: Adjustment = untrack(() => adj)

async function load() {
  const my = ++token
  const reqTf = tf
  const reqAdj = adj
  try {
    loading = true
    const b = await getBars(id, reqTf, adj)
    const others: Record<string, Bars> = {}
    for (const c of cmp) others[c] = await getBars(c, tf, adj)
    if (my !== token) return // 古い要求の結果は捨てる（NFR-A8）
    bars = b
    shownTf = reqTf
    shownAdj = reqAdj
    cmpBars = others
    loading = false
    build()
  } catch {
    if (my === token) bars = null
  }
}
$effect(() => {
  void id
  void tf
  void adj
  void cmpKey
  void load()
})
// データの更新: 表示中（比較を含む）の銘柄が変わったときだけ読み直す（ほかの銘柄の取得では作り直さない）
let seen = 0
$effect(() => {
  const v = app.dataVersion
  if (v === seen) return
  seen = v
  if (untrack(() => touched(id) || cmp.some((c) => touched(c)))) void load()
})
// 表示の設定が変わったら作り直す（指標の段の数が変わるため）
$effect(() => {
  void ctype
  void indKey
  void periods.join()
  void app.settings.theme
  void app.settings.candleStyle
  void app.settings.lang
  if (chart) queueMicrotask(build)
})
$effect(() => {
  chart?.priceScale('right').applyOptions({
    mode: cmp.length ? PriceScaleMode.Percentage : log ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
  })
})

/**
 * アラートの点線（FR-AL9）: この銘柄の、終値の条件（相対条件の無いもの）のしきい値に水平の点線を引く。分割で換算した値で、
 * 停止中は薄く。比較の表示（% 目盛り）では引かない
 */
function drawAlertLines() {
  if (!main) return
  for (const l of alertLines) main.removePriceLine(l)
  alertLines = []
  if (cmp.length) return
  for (const a of app.alerts) {
    if (a.target.kind !== 'symbol' || a.target.id !== id) continue
    for (const c of a.adjusted ?? a.conditions) {
      if (c.field !== 'price.close' || c.ref) continue
      alertLines.push(
        main.createPriceLine({
          price: Number(c.value),
          color: a.enabled ? css('--warn') : css('--text-3'),
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: '🔔',
        }),
      )
    }
  }
}
$effect(() => {
  void app.alerts
  void id
  untrack(drawAlertLines)
})

/**
 * 目標利回りの線（FR-C12）: 配当利回りが目標の % になる株価に水平の点線を引く。目標の数だけ引く（設定の画面の上限に関係なく）。
 * 目盛りは広げない（遠い目標で値動きが潰れないように）。範囲の外の線は凡例の値で分かる。比較の表示（% 目盛り）では引かない
 */
$effect(() => ensureMetrics([id]))
const targets = $derived<YieldLine[]>(cmp.length ? [] : yieldLines(metric(id), app.settings))
const targetsKey = $derived(targets.map((l) => `${l.label}:${l.price}`).join())
function drawTargetLines() {
  if (!main) return
  for (const l of targetLines) main.removePriceLine(l)
  targetLines = targets.map((l) =>
    main!.createPriceLine({
      price: l.price,
      color: css('--yield-line'),
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: l.label,
    }),
  )
}
$effect(() => {
  void targetsKey
  untrack(drawTargetLines)
})

const ld = (time: string[], v: Series) => v.flatMap((x, i) => (x == null || time[i] == null ? [] : [{ time: time[i] as Time, value: x }]))

/** 一目の先行スパンは 26 本先まで描くので、足の間隔で先の日付を作る */
function extendTime(time: string[], n: number): string[] {
  if (time.length < 2) return time
  const step = Date.parse(`${time.at(-1)}T00:00:00Z`) - Date.parse(`${time.at(-2)}T00:00:00Z`) || 86400_000
  const out = [...time]
  let last = Date.parse(`${time.at(-1)}T00:00:00Z`)
  for (let i = 0; i < n; i++) {
    last += step
    out.push(new Date(last).toISOString().slice(0, 10))
  }
  return out
}

function build() {
  if (!host) return
  const keep = chart?.timeScale().getVisibleLogicalRange()
  chart?.remove()
  alertLines = []
  targetLines = []
  const up = css('--up')
  const down = css('--down')
  chart = createChart(host, {
    autoSize: true,
    layout: {
      background: { color: css('--panel') },
      textColor: css('--text-3'),
      fontFamily: css('--mono'),
      fontSize: 11,
      // ロゴは出さない（グリッドのタイルとそろえる）。帰属の表示とリンクは初回の確認と設定 > このアプリについて に置く（Lightweight Charts の NOTICE）
      attributionLogo: false,
      // 段の区切りは濃い線（下の段が本体と別の段だと分かるように）
      panes: { separatorColor: css('--line-strong'), separatorHoverColor: css('--chart-cross') },
    },
    localization: {
      locale: app.settings.lang === 'ja' ? 'ja-JP' : 'en-US',
      dateFormat: app.settings.lang === 'ja' ? 'yyyy/MM/dd' : 'MMM dd, yyyy',
    },
    grid: { vertLines: { color: css('--chart-grid') }, horzLines: { color: css('--chart-grid') } },
    rightPriceScale: { borderColor: css('--line'), scaleMargins: { top: 0.12, bottom: ind.has('vol') ? 0.22 : 0.06 } },
    timeScale: { borderColor: css('--line'), rightOffset: 4, barSpacing: 6 },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: { color: css('--chart-cross'), labelBackgroundColor: css('--chart-label') },
      horzLine: { color: css('--chart-cross'), labelBackgroundColor: css('--chart-label') },
    },
  })
  const b = bars
  const ls: LegendLine[] = []
  const titles: Record<number, string> = {}
  const mode = cmp.length ? PriceScaleMode.Percentage : log ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal
  chart.priceScale('right').applyOptions({ mode })
  // 本体（FR-C1）: ローソク足 / バー / 終値ライン
  if (ctype === 'line') main = chart.addSeries(LineSeries, { color: css('--text-2'), lineWidth: 2, priceLineColor: css('--chart-cross') })
  else if (ctype === 'bar')
    main = chart.addSeries(BarSeries, { upColor: up, downColor: down, thinBars: false, priceLineColor: css('--chart-cross') })
  else
    main = chart.addSeries(CandlestickSeries, {
      upColor: up,
      downColor: down,
      wickUpColor: up,
      wickDownColor: down,
      borderVisible: false,
      priceLineColor: css('--chart-cross'),
      priceLineStyle: 2,
    })
  if (b) {
    const base = b.close.at(-1) ?? 1000
    // マーケット一覧の行（ドル/円・米10年など）は登録表の桁（FR-MB2）
    const pd = priceDigits(id) ?? (base < 1000 ? 1 : 0)
    main.applyOptions({ priceFormat: priceFormat(pd) })
    drawAlertLines()
    drawTargetLines()
    const tm = b.time as Time[]
    if (ctype === 'line') (main as ISeriesApi<'Line'>).setData(tm.map((time, i) => ({ time, value: b.close[i]! })))
    else
      (main as ISeriesApi<'Candlestick'>).setData(
        tm.map((time, i) => ({ time, open: b.open[i]!, high: b.high[i]!, low: b.low[i]!, close: b.close[i]! })),
      )
    const line = (
      values: Series,
      color: string,
      label: string | null,
      opt: { width?: LineWidth; dashed?: boolean; pane?: number; time?: string[]; kind?: DigitsKind; digits?: number } = {},
    ) => {
      // label が null の線は凡例に出さない（'' は名前なしで値だけ）。
      // 桁: 下の段は指標の種類で決め、目盛りも同じ桁にする。本体の段は OHLC と同じ（登録表の桁、無ければ値の大きさ）
      const digits = opt.kind ? indicatorDigits(opt.kind, pd) : opt.digits
      const s = chart!.addSeries(
        LineSeries,
        {
          color,
          lineWidth: opt.width ?? 1,
          lineStyle: opt.dashed ? 2 : 0,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
          ...(opt.kind ? { priceFormat: priceFormat(digits!) } : {}),
        },
        opt.pane ?? 0,
      )
      s.setData(ld(opt.time ?? b.time, values))
      if (label != null) ls.push({ label, color, values, pane: opt.pane ?? 0, digits })
      return s
    }
    if (ind.has('ma')) periods.forEach((n, k) => line(sma(b.close, n), css(MA_COLORS[k]!), `MA${n}`, { digits: pdg }))
    if (ind.has('bb')) {
      const bb = bollinger(b.close)
      line(bb.mid, css('--ind1'), 'BB20', { dashed: true, digits: pdg })
      line(bb.up, css('--ind1'), '+2σ', { digits: pdg })
      line(bb.lo, css('--ind1'), '−2σ', { digits: pdg })
    }
    if (ind.has('ichimoku')) {
      const ic = ichimoku(b.high, b.low, b.close)
      const ext = extendTime(b.time, 26)
      line(ic.tenkan, css('--ind2'), t('ind.tenkan'), { digits: pdg })
      line(ic.kijun, css('--ind1'), t('ind.kijun'), { digits: pdg })
      line(ic.spanA, css('--ok'), t('ind.spanA'), { time: ext, digits: pdg })
      line(ic.spanB, css('--danger'), t('ind.spanB'), { time: ext, digits: pdg })
      line(ic.chikou, css('--ind3'), null, { dashed: true })
    }
    // 比較表示（FR-C7）: 他銘柄を % で重ねる（右の目盛りは表示の始点を 0% にした騰落率）
    cmp.forEach((c, k) => {
      const ob = cmpBars[c]
      if (!ob) return
      const map = new Map(ob.time.map((x, i) => [x, ob.close[i]!]))
      line(
        b.time.map((x) => map.get(x) ?? null),
        css(CMP_COLORS[k]!),
        nameOf(c),
        { width: 2, digits: priceDigits(c) },
      )
    })
    if (ind.has('vol')) {
      const vol = chart.addSeries(HistogramSeries, {
        priceScaleId: 'vol',
        priceFormat: { type: 'volume' },
        lastValueVisible: false,
        priceLineVisible: false,
      })
      chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }, visible: false })
      const vu = css('--vol-up')
      const vd = css('--vol-down')
      vol.setData(tm.map((time, i) => ({ time, value: b.volume[i]!, color: i && b.close[i]! < b.close[i - 1]! ? vd : vu })))
      if (ind.has('volma')) {
        const s = chart.addSeries(LineSeries, {
          priceScaleId: 'vol',
          color: css('--ind3'),
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        })
        s.setData(ld(b.time, sma(b.volume, 20)))
      }
    }
    // 下の段（RSI・MACD・ストキャスティクス）
    // 段ごとに左上へ名前と値の凡例を出す（FR-C3）
    let paneNo = 0
    if (ind.has('rsi')) {
      paneNo++
      titles[paneNo] = t('ind.rsi')
      // 線が 1 本なので、凡例は段の名前のあとに値だけ
      const r = line(rsiSeries(b.close), css('--ind4'), '', { pane: paneNo, kind: 'osc' })
      r.createPriceLine({ price: 70, color: css('--line-strong'), lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: '' })
      r.createPriceLine({ price: 30, color: css('--line-strong'), lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: '' })
    }
    if (ind.has('macd')) {
      paneNo++
      titles[paneNo] = t('ind.macd')
      const m = macd(b.close)
      const dg = indicatorDigits('diff', pd)
      // ヒストグラムは出来高と分けて陽線・陰線の色で、0 から離れていく足を濃く、近づいていく足を薄く
      const tone = { up: withAlpha(up, 0.75), upWeak: withAlpha(up, 0.3), down: withAlpha(down, 0.75), downWeak: withAlpha(down, 0.3) }
      const h = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false, priceFormat: priceFormat(dg) }, paneNo)
      h.setData(m.hist.flatMap((v, i) => (v == null ? [] : [{ time: tm[i]!, value: v, color: tone[histTone(v, m.hist[i - 1])] }])))
      // 0 の線（MACD は 0 の上か下かが読みどころ）
      h.createPriceLine({ price: 0, color: css('--chart-cross'), lineWidth: 1, lineStyle: 0, axisLabelVisible: false, title: '' })
      line(m.macd, css('--ind1'), 'MACD', { pane: paneNo, kind: 'diff' })
      line(m.signal, css('--ind2'), 'Signal', { pane: paneNo, kind: 'diff' })
      ls.push({ label: 'Hist', color: '', values: m.hist, pane: paneNo, digits: dg, signColor: true })
    }
    if (ind.has('stoch')) {
      paneNo++
      titles[paneNo] = t('ind.stoch')
      const st = stochastic(b.high, b.low, b.close)
      line(st.k, css('--ind1'), '%K', { pane: paneNo, kind: 'osc' })
      line(st.d, css('--ind2'), '%D', { pane: paneNo, kind: 'osc' })
    }
    // 下の段の高さ（1 つなら 25%、増えたら合計 50%）
    const ps = chart.panes()
    if (paneNo) stretchFactors(paneNo).forEach((f, i) => ps[i]?.setStretchFactor(f))
    // 配当落ち日・分割の印（FR-C5）。週足・月足は、その日を含む足に付ける
    markers = createSeriesMarkers(main, [])
    if (ind.has('divs')) {
      const at = (d: string) => {
        let j = -1
        for (let k = 0; k < b.time.length; k++) if (b.time[k]! <= d) j = k
        return j >= 0 ? (b.time[j] as Time) : null
      }
      const ms: SeriesMarker<Time>[] = []
      for (const d of b.dividends) {
        const time = at(d.date)
        if (time && d.date >= b.time[0]!)
          ms.push({ time, position: 'belowBar', color: css('--gold'), shape: 'circle', size: 0.6, text: tf === 'D' ? 'D' : '' })
      }
      for (const s of b.splits) {
        const time = at(s.date)
        if (time && s.date >= b.time[0]!)
          ms.push({ time, position: 'aboveBar', color: css('--warn'), shape: 'arrowDown', text: `${s.ratio}:1` })
      }
      ms.sort((x, y) => (String(x.time) < String(y.time) ? -1 : 1))
      markers.setMarkers(ms)
    }
    draw.attach()
    const n = b.time.length
    const show = showCount(n)
    requestAnimationFrame(() => chart?.timeScale().setVisibleLogicalRange(keep ?? { from: Math.max(0, n - show), to: n + 3 }))
  }
  lines = ls
  paneTitles = titles
  legendIdx = null
  wire()
  watchPanes()
}

/** 段の上端を測り直す（段の凡例の位置）。段の高さは区切りを動かす・ペインの大きさが変わると変わる */
function placePanes() {
  tops = chart ? paneTops(chart.panes().map((p) => p.getHeight())) : []
}
function watchPanes() {
  paneObs?.disconnect()
  paneObs = null
  tops = []
  if (!chart || !Object.keys(paneTitles).length) return
  paneObs = new ResizeObserver(placePanes)
  for (const p of chart.panes()) {
    const el = p.getHTMLElement()
    if (el) paneObs.observe(el)
  }
  requestAnimationFrame(placePanes)
}

const legend = $derived.by(() => {
  if (!bars?.time.length) return null
  const i = legendIdx ?? bars.time.length - 1
  const p = i > 0 ? bars.close[i - 1]! : null
  const c = bars.close[i]!
  return {
    date: bars.time[i]!,
    o: bars.open[i]!,
    h: bars.high[i]!,
    l: bars.low[i]!,
    c,
    v: bars.volume[i]!,
    chg: p ? (c / p - 1) * 100 : null,
    prov: bars.provisional.includes(i),
    forming: bars.forming.includes(i),
    monthly: bars.monthlyUntil != null && i < bars.monthlyUntil,
    ...legendByPane(lines, paneTitles, i),
  }
})

function moveKb(d: number) {
  if (!bars || !chart || !main) return
  kbIndex = Math.max(0, Math.min(bars.time.length - 1, (kbIndex ?? bars.time.length - 1) + d))
  chart.setCrosshairPosition(bars.close[kbIndex]!, bars.time[kbIndex] as Time, main)
  legendIdx = kbIndex
  // 同じリンク色のチャートへ直接知らせる（FR-K3。プログラムで置いた十字線の知らせは送らないので）
  const t = bars.time[kbIndex]!
  linked((o) => o.show(t))
}
/** 同じリンク色のほかのチャート */
function linked(f: (o: ChartHandle) => void) {
  for (const o of charts) if (o !== handle && o.pane.link && o.pane.link === pane.link) f(o)
}
/** 十字線を消す（リンクしたチャートも。プログラムで消すと知らせが出ないので、直接消す） */
function clearKb() {
  chart?.clearCrosshairPosition()
  legendIdx = null
  linked((o) => o.show(null))
}
/** 表示する足の本数: 期間（Alt+1〜6・見出しの選択）があればそれ、無ければ時間軸ごとの既定 */
function showCount(n: number): number {
  const p = pane.state.period as number | undefined
  if (p != null) return barsForPeriod(p, tf, n)
  return tf === 'D' ? 140 : tf === 'W' ? 110 : 160
}
function resetView() {
  if (!bars || !chart) return
  const n = bars.time.length
  chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - showCount(n)), to: n + 3 })
}
// 期間を変えたら、その期間が収まるように表示し直す。期間の値だけを見る（patchState は pane.state を丸ごと置き換えるので、
// pane.state.period を直に読むと、対数目盛り・調整・指標を変えただけでも走って、ずらした表示が戻ってしまう）
const period = $derived(pane.state.period)
$effect(() => {
  void period
  untrack(() => resetView())
})

const handle: ChartHandle = {
  get pane() {
    return pane
  },
  tf: () => tf,
  bars: () => bars,
  show(time) {
    if (!chart || !main || !bars) return
    if (time == null) {
      // 自分のキーボード十字線が出ていれば、それに戻す（ほかのチャートが十字線を消しても、自分の X の位置は残す。送り返さない）
      if (kbIndex != null) {
        chart.setCrosshairPosition(bars.close[kbIndex]!, bars.time[kbIndex] as Time, main)
        legendIdx = kbIndex
        return
      }
      chart.clearCrosshairPosition()
      legendIdx = null
    } else {
      // 時間軸が違うときは、その日付を含む足（日→週→月）に合わせる（FR-K3）
      let j = -1
      for (let k = 0; k < bars.time.length; k++) {
        if (bars.time[k]! <= time) j = k
        else break
      }
      if (j >= 0) {
        chart.setCrosshairPosition(bars.close[j]!, bars.time[j] as Time, main)
        legendIdx = j
      }
    }
  },
  range(from, to) {
    if (!chart || !syncRange) return
    rangeEcho.received(from, to)
    chart.timeScale().setVisibleLogicalRange({ from, to })
  },
}
/** 受けた表示期間（送り返さない。FR-K4） */
const rangeEcho = new RangeEcho()
/** 十字線・表示期間の同期をつなぐ（作り直すたびに呼ぶ） */
function wire() {
  if (!chart) return
  chart.subscribeCrosshairMove((param) => {
    if (!bars) return
    const time = (param.time as string | undefined) ?? null
    legendIdx = time ? bars.time.indexOf(time) : null
    // 知らせは描き直しのときに非同期に届くので、プログラムで置いた十字線の知らせを送ると、リンクしたチャートの間で行き来して
    // 足の始まりの日付へずれていく。マウスで動かした・マウスが出たときだけ送る（chartSync.ts の sendCrosshair）
    if (!sendCrosshair(param)) return
    linked((o) => o.show(time))
  })
  // 同じリンク色・同じ時間軸で「表示期間をそろえる」にしたチャートどうしは、表示期間も合わせる（FR-K4）。同じ銘柄・同じ時間軸なので
  // 足の論理番号で合わせる（右の余白・端数も保つ）。受けた範囲の知らせは送り返さない。data-range は E2E が読む（キャンバスは読めない）
  chart.timeScale().subscribeVisibleLogicalRangeChange((r) => {
    if (!r) return
    if (host) host.dataset.range = JSON.stringify({ from: r.from, to: r.to })
    if (!syncRange || !rangeEcho.shouldSend(r.from, r.to)) return
    linked((o) => {
      if (o.pane !== pane && o.tf() === tf) o.range(r.from, r.to)
    })
  })
}

onMount(() => {
  charts.add(handle)
  const unbind = host ? draw.bindPointer(host) : () => {}
  build()
  onApi?.({
    snapshot() {
      if (!chart || !bars?.time.length) return null
      const r = chart.timeScale().getVisibleRange()
      const c = chart
      const canvas = draw.bareShot(() => c.takeScreenshot(true, false))
      // 倍率はキャンバスとペインの幅の比（devicePixelRatio に、設定の文字の大きさ・窓の倍率の CSS zoom を掛けたもの）
      const scale = host && host.clientWidth > 0 ? canvas.width / host.clientWidth : window.devicePixelRatio || 1
      return { canvas, tf: shownTf, scale, ...visibleSpan(r?.from as string | undefined, r?.to as string | undefined, bars.time) }
    },
    undo: (redo) => draw.undo(redo),
    key(e) {
      if (draw.key(e)) return true
      if (e.ctrlKey || e.altKey || e.metaKey) return false
      const c = e.code
      if (c === 'KeyX') {
        if (kbIndex == null) moveKb(0)
        else {
          kbIndex = null
          clearKb()
        }
        return true
      }
      if (e.key === 'Escape' && kbIndex != null) {
        kbIndex = null
        clearKb()
        return true
      }
      const ts = chart?.timeScale()
      const r = ts?.getVisibleLogicalRange()
      if (!ts || !r) return false
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && kbIndex != null) {
        moveKb(e.key === 'ArrowLeft' ? -1 : 1)
        return true
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const step = (e.shiftKey ? r.to - r.from : 10) * (e.key === 'ArrowLeft' ? -1 : 1)
        ts.setVisibleLogicalRange({ from: r.from + step, to: r.to + step })
        return true
      }
      if (e.key === '+' || e.key === ';' || c === 'NumpadAdd' || e.key === '-' || c === 'NumpadSubtract') {
        const f = e.key === '-' || c === 'NumpadSubtract' ? 1.25 : 0.8
        ts.setVisibleLogicalRange({ from: r.to - (r.to - r.from) * f, to: r.to })
        return true
      }
      if (c === 'Digit0' || c === 'Numpad0') {
        resetView()
        return true
      }
      return false
    },
  })
  return () => {
    unbind()
    draw.blur()
    draw.register(pane.id, false)
    charts.delete(handle)
    paneObs?.disconnect()
    chart?.remove()
    chart = null
  }
})
</script>

<div class="body" class:inactive={!active}>
  <div class="host" bind:this={host}></div>
  {#if legend}
    <div class="legend">
      <div class="ohlc">
        <span class="tfb">{tf}</span>
        <span>{legend.date.replaceAll('-', '/')}</span>
        <span>O <b>{px(legend.o, pdg)}</b></span><span>H <b>{px(legend.h, pdg)}</b></span><span>L <b>{px(legend.l, pdg)}</b></span><span>C <b>{px(legend.c, pdg)}</b></span>
        <span class={cls(legend.chg)}>{sgn(legend.chg, 2, '%')}</span>
        <span class="vol">V <b>{Math.round(legend.v).toLocaleString()}</b></span>
        {#if legend.prov}<span class="badge">{t('chart.provisional')}</span>{/if}
        {#if legend.forming}<span class="badge">{t('chart.forming')}</span>{/if}
        {#if legend.monthly}<span class="badge">{t('chart.monthlySeries')}</span>{/if}
      </div>
      <div class="mas">
        {#each legend.main as x, k (k)}
          <span style:color={x.color}><b>{x.label}</b> {x.text}</span>
        {/each}
        {#each targets as y (y.pct)}
          <span class="yl"><b>{t('chart.yieldTarget', { p: y.label })}</b> {px(y.price)}{#if y.gap != null} <span class="dim">({sgn(y.gap, 1, '%')})</span>{/if}</span>
        {/each}
        {#if log && !cmp.length}<span class="badge">{t('chart.log')}</span>{/if}
        {#if cmp.length}<span class="badge">{t('chart.compare')}</span>{/if}
        {#if adj !== 'split'}<span class="badge">{t(adj === 'unadjusted' ? 'chart.unadjusted' : 'chart.total')}</span>{/if}
      </div>
    </div>
    {#each legend.subs as s (s.pane)}
      {#if tops[s.pane] != null}
        <div class="legend sub" data-pane={s.pane} style:top="{tops[s.pane]! + 3}px">
          <div class="mas">
            <span class="ttl">{s.title}</span>
            {#each s.vals as x, k (k)}
              <span class={x.cls} style:color={x.color}>{#if x.label}<b>{x.label}</b>{' '}{/if}{x.text}</span>
            {/each}
          </div>
        </div>
      {/if}
    {/each}
    <div class="draw-guide" style:visibility={draw.guide ? 'visible' : 'hidden'} data-draw-guide={draw.mode.m}>{draw.guide ?? ' '}</div>
  {:else if loading && !bars}
    <div class="state">{t('common.loading')}</div>
  {:else if bars && !bars.time.length}
    <div class="state">{t('chart.noData')}</div>
  {/if}
</div>

<style>
  .body {
    position: relative;
    flex: 1;
    min-height: 0;
    min-width: 0;
  }
  .host {
    position: absolute;
    inset: 0;
  }
  .legend {
    position: absolute;
    left: 8px;
    top: 6px;
    z-index: 3;
    pointer-events: none;
    font-size: var(--fs-1);
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-width: calc(100% - 80px);
  }
  .ohlc,
  .mas {
    display: flex;
    flex-wrap: wrap;
    column-gap: 10px;
    font-family: var(--mono);
    color: var(--text-2);
  }
  .ohlc span,
  .mas span {
    white-space: nowrap;
  }
  .tfb {
    color: var(--text);
    font-weight: 700;
  }
  b {
    color: var(--text);
    font-weight: 500;
  }
  .mas b {
    color: inherit;
    font-weight: 600;
  }
  /* 下の段は低く線が凡例の下を通りやすいので、文字の下を薄く塗る */
  .legend.sub {
    padding: 0 4px;
    margin-left: -4px;
    border-radius: 3px;
    background: color-mix(in srgb, var(--panel) 80%, transparent);
  }
  /* 1 行に収め、はみ出す値は隠す（狭いペインで段を覆わない） */
  .legend.sub .mas {
    flex-wrap: nowrap;
    overflow: hidden;
  }
  .ttl {
    color: var(--text);
    font-weight: 600;
  }
  .yl {
    color: var(--yield-line);
  }
  .yl .dim {
    color: var(--text-3);
  }
  .badge {
    font-family: var(--font);
    color: var(--warn);
  }
  /* 描画の案内（出し入れせず、場所を取ったまま見えなくする） */
  .draw-guide {
    position: absolute;
    left: 8px;
    bottom: 30px;
    z-index: 3;
    pointer-events: none;
    max-width: calc(100% - 90px);
    padding: 1px 6px;
    border-radius: 3px;
    font-size: var(--fs-1);
    color: var(--text-2);
    background: color-mix(in srgb, var(--panel) 85%, transparent);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .inactive .tfb {
    color: var(--text-3);
  }
  /* 幅の狭いペインでは、出来高と目標利回りの今の株価からの差を省く（凡例の折り返しを減らす） */
  @container (max-width: 560px) {
    .vol,
    .yl .dim {
      display: none;
    }
  }
</style>
