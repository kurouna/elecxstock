<script lang="ts">
// チャートの本体（§7, FR-C1〜C9, FR-K3, K4）。chart と mtf-chart（1 ペインに日・週・月）が使う。
// 指標・種類・調整などの表示はペインの状態（pane.state）に持ち、時間軸だけを呼ぶ側が渡す。
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
import { cls, px, sgn } from '../../lib/format'
import { bollinger, ichimoku, macd, rsiSeries, type Series, sma, stochastic } from '../../lib/indicators'
import { barsForPeriod } from '../../lib/periods'
import { app, ensureMetrics, metric, nameOf, t, touched } from '../../stores/app.svelte'
import type { PaneNode } from '../../stores/layout.svelte'
import { type ChartHandle, charts } from './chartSync'

export type Indicator = 'ma' | 'vol' | 'volma' | 'bb' | 'ichimoku' | 'rsi' | 'macd' | 'stoch' | 'divs'
export const INDICATORS: Indicator[] = ['ma', 'vol', 'volma', 'bb', 'ichimoku', 'rsi', 'macd', 'stoch', 'divs']
export type ChartType = 'candle' | 'bar' | 'line'
export interface ChartViewApi {
  key: (e: KeyboardEvent) => boolean
}

let {
  pane,
  id,
  tf,
  active = true,
  onApi,
}: { pane: PaneNode; id: InstrumentId; tf: Timeframe; active?: boolean; onApi?: (api: ChartViewApi) => void } = $props()

const S = $derived(pane.state as Record<string, unknown>)
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
/** 凡例に出す値（指標の名前・色・値の配列） */
let lines = $state<{ label: string; color: string; values: Series }[]>([])
let token = 0
const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim()

async function load() {
  const my = ++token
  try {
    loading = true
    const b = await getBars(id, tf, adj)
    const others: Record<string, Bars> = {}
    for (const c of cmp) others[c] = await getBars(c, tf, adj)
    if (my !== token) return // 古い要求の結果は捨てる（NFR-A8）
    bars = b
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
const targets = $derived<YieldLine[]>(
  cmp.length ? [] : yieldLines(metric(id), { yieldLine: app.settings.yieldLine, yieldTargets: app.settings.yieldTargets }),
)
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
      panes: { separatorColor: css('--line'), separatorHoverColor: css('--line-strong') },
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
  const ls: typeof lines = []
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
    main.applyOptions({ priceFormat: { type: 'price', precision: base < 1000 ? 1 : 0, minMove: base < 1000 ? 0.1 : 1 } })
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
      label: string,
      opt: { width?: LineWidth; dashed?: boolean; pane?: number; time?: string[] } = {},
    ) => {
      const s = chart!.addSeries(
        LineSeries,
        {
          color,
          lineWidth: opt.width ?? 1,
          lineStyle: opt.dashed ? 2 : 0,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        },
        opt.pane ?? 0,
      )
      s.setData(ld(opt.time ?? b.time, values))
      if (label) ls.push({ label, color, values })
      return s
    }
    if (ind.has('ma')) periods.forEach((n, k) => line(sma(b.close, n), css(MA_COLORS[k]!), `MA${n}`))
    if (ind.has('bb')) {
      const bb = bollinger(b.close)
      line(bb.mid, css('--ind1'), 'BB20', { dashed: true })
      line(bb.up, css('--ind1'), '+2σ')
      line(bb.lo, css('--ind1'), '−2σ')
    }
    if (ind.has('ichimoku')) {
      const ic = ichimoku(b.high, b.low, b.close)
      const ext = extendTime(b.time, 26)
      line(ic.tenkan, css('--ind2'), t('ind.tenkan'))
      line(ic.kijun, css('--ind1'), t('ind.kijun'))
      line(ic.spanA, css('--ok'), t('ind.spanA'), { time: ext })
      line(ic.spanB, css('--danger'), t('ind.spanB'), { time: ext })
      line(ic.chikou, css('--ind3'), '', { dashed: true })
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
        { width: 2 },
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
    let paneNo = 0
    if (ind.has('rsi')) {
      paneNo++
      const r = line(rsiSeries(b.close), css('--ind4'), 'RSI14', { pane: paneNo })
      r.createPriceLine({ price: 70, color: css('--line-strong'), lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: '' })
      r.createPriceLine({ price: 30, color: css('--line-strong'), lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: '' })
    }
    if (ind.has('macd')) {
      paneNo++
      const m = macd(b.close)
      const h = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, paneNo)
      h.setData(
        m.hist.flatMap((v, i) => (v == null ? [] : [{ time: tm[i]!, value: v, color: v >= 0 ? css('--vol-up') : css('--vol-down') }])),
      )
      line(m.macd, css('--ind1'), 'MACD', { pane: paneNo })
      line(m.signal, css('--ind2'), 'Signal', { pane: paneNo })
    }
    if (ind.has('stoch')) {
      paneNo++
      const st = stochastic(b.high, b.low, b.close)
      line(st.k, css('--ind1'), '%K', { pane: paneNo })
      line(st.d, css('--ind2'), '%D', { pane: paneNo })
    }
    for (let i = 1; i <= paneNo; i++) chart.panes()[i]?.setHeight(Math.max(60, (host.clientHeight || 400) * 0.18))
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
    const n = b.time.length
    const show = showCount(n)
    requestAnimationFrame(() => chart?.timeScale().setVisibleLogicalRange(keep ?? { from: Math.max(0, n - show), to: n + 3 }))
  }
  lines = ls
  legendIdx = null
  wire()
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
    vals: lines.map((x) => ({ label: x.label, color: x.color, v: x.values[i] ?? null })),
  }
})

function moveKb(d: number) {
  if (!bars || !chart || !main) return
  kbIndex = Math.max(0, Math.min(bars.time.length - 1, (kbIndex ?? bars.time.length - 1) + d))
  chart.setCrosshairPosition(bars.close[kbIndex]!, bars.time[kbIndex] as Time, main)
  legendIdx = kbIndex
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
  sync: false,
  tf: () => tf,
  bars: () => bars,
  show(time) {
    if (!chart || !main || !bars) return
    handle.sync = true
    if (time == null) {
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
    handle.sync = false
  },
  range(from, to) {
    if (!chart || !syncRange) return
    handle.sync = true
    try {
      chart.timeScale().setVisibleRange({ from: from as Time, to: to as Time })
    } catch {
      /* 範囲の外 */
    }
    handle.sync = false
  },
}
/** 十字線・表示期間の同期をつなぐ（作り直すたびに呼ぶ） */
function wire() {
  if (!chart) return
  chart.subscribeCrosshairMove((param) => {
    if (handle.sync || !bars) return
    const time = (param.time as string | undefined) ?? null
    legendIdx = time ? bars.time.indexOf(time) : null
    for (const o of charts) if (o !== handle && o.pane.link && o.pane.link === pane.link) o.show(time)
  })
  // 同じリンク色・同じ時間軸で「表示期間をそろえる」にしたチャートどうしは、表示期間も合わせる（FR-K4）
  chart.timeScale().subscribeVisibleTimeRangeChange((r) => {
    if (handle.sync || !r || !syncRange) return
    for (const o of charts)
      if (o !== handle && o.pane !== pane && o.pane.link && o.pane.link === pane.link && o.tf() === tf)
        o.range(String(r.from), String(r.to))
  })
}

onMount(() => {
  charts.add(handle)
  build()
  onApi?.({
    key(e) {
      if (e.ctrlKey || e.altKey || e.metaKey) return false
      const c = e.code
      if (c === 'KeyX') {
        if (kbIndex == null) moveKb(0)
        else {
          kbIndex = null
          chart?.clearCrosshairPosition()
          legendIdx = null
        }
        return true
      }
      if (e.key === 'Escape' && kbIndex != null) {
        kbIndex = null
        chart?.clearCrosshairPosition()
        legendIdx = null
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
    charts.delete(handle)
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
        <span>O <b>{px(legend.o)}</b></span><span>H <b>{px(legend.h)}</b></span><span>L <b>{px(legend.l)}</b></span><span>C <b>{px(legend.c)}</b></span>
        <span class={cls(legend.chg)}>{sgn(legend.chg, 2, '%')}</span>
        <span class="vol">V <b>{Math.round(legend.v).toLocaleString()}</b></span>
        {#if legend.prov}<span class="badge">{t('chart.provisional')}</span>{/if}
        {#if legend.forming}<span class="badge">{t('chart.forming')}</span>{/if}
        {#if legend.monthly}<span class="badge">{t('chart.monthlySeries')}</span>{/if}
      </div>
      <div class="mas">
        {#each legend.vals as x, k (k)}
          <span style:color={x.color}><b>{x.label}</b> {x.v != null ? (Math.abs(x.v) < 200 && !x.label.startsWith('MA') && !x.label.startsWith('BB') ? x.v.toFixed(2) : px(x.v)) : '—'}</span>
        {/each}
        {#each targets as y (y.pct)}
          <span class="yl"><b>{t('chart.yieldTarget', { p: y.label })}</b> {px(y.price)}{#if y.gap != null} <span class="dim">({sgn(y.gap, 1, '%')})</span>{/if}</span>
        {/each}
        {#if log && !cmp.length}<span class="badge">{t('chart.log')}</span>{/if}
        {#if cmp.length}<span class="badge">{t('chart.compare')}</span>{/if}
        {#if adj !== 'split'}<span class="badge">{t(adj === 'unadjusted' ? 'chart.unadjusted' : 'chart.total')}</span>{/if}
      </div>
    </div>
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
  .inactive .tfb {
    color: var(--text-3);
  }
  @container (max-width: 560px) {
    .vol {
      display: none;
    }
  }
</style>
