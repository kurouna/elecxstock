<script lang="ts">
// チャート（§7, FR-C1〜C4, C9, FR-K3）。Lightweight Charts（2D Canvas）で描く。

import type { Adjustment, Bars, Timeframe } from '@shared/types'
import {
  type CandlestickData,
  CandlestickSeries,
  CrosshairMode,
  createChart,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  LineSeries,
  PriceScaleMode,
  type Time,
} from 'lightweight-charts'
import { onMount } from 'svelte'
import { cls, px, sgn } from '../../lib/format'
import { registerPane } from '../../lib/panes'
import { app, bridge, codeOf, ensureMetrics, isFav, metric, nameOf, t, toast, toggleFav } from '../../stores/app.svelte'
import { linkSymbol, type PaneNode, patchState } from '../../stores/layout.svelte'
import PaneHeader from '../PaneHeader.svelte'
import { type ChartHandle, charts } from './chartSync'

let { pane }: { pane: PaneNode } = $props()
const tf = $derived(((pane.state.tf as Timeframe) ?? 'D') as Timeframe)
const log = $derived(!!pane.state.log)
const adj = $derived(((pane.state.adj as Adjustment) ?? 'split') as Adjustment)
const id = $derived(linkSymbol(pane.link) ?? 'JP:7203')
const MA: Record<Timeframe, number[]> = { D: [5, 25, 75], W: [13, 26, 52], M: [12, 24, 60] } // FR-C2
const MA_COLORS = ['--ma1', '--ma2', '--ma3']

let host = $state<HTMLDivElement>()
let bars = $state<Bars | null>(null)
let maData: LineData[][] = []
let legendIdx = $state<number | null>(null)
let kbIndex: number | null = null
let chart: IChartApi | null = null
let candle: ISeriesApi<'Candlestick'> | null = null
let vol: ISeriesApi<'Histogram'> | null = null
let mas: ISeriesApi<'Line'>[] = []
let token = 0
const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim()

function sma(c: number[], n: number, time: string[]): LineData[] {
  const out: LineData[] = []
  let s = 0
  for (let i = 0; i < c.length; i++) {
    s += c[i]!
    if (i >= n) s -= c[i - n]!
    if (i >= n - 1) out.push({ time: time[i] as Time, value: s / n })
  }
  return out
}
function colors() {
  const up = css('--up')
  const down = css('--down')
  candle?.applyOptions({ upColor: up, downColor: down, wickUpColor: up, wickDownColor: down })
  mas.forEach((s, k) => s.applyOptions({ color: css(MA_COLORS[k]!) }))
  return { up, down }
}
function render(b: Bars) {
  if (!chart || !candle || !vol) return
  const n = b.time.length
  const base = b.close.at(-1) ?? 1000
  candle.applyOptions({ priceFormat: { type: 'price', precision: base < 1000 ? 1 : 0, minMove: base < 1000 ? 0.1 : 1 } })
  const data: CandlestickData[] = b.time.map((tm, i) => ({
    time: tm as Time,
    open: b.open[i]!,
    high: b.high[i]!,
    low: b.low[i]!,
    close: b.close[i]!,
  }))
  candle.setData(data)
  vol.setData(
    b.time.map((tm, i) => ({ time: tm as Time, value: b.volume[i]!, color: i && b.close[i]! < b.close[i - 1]! ? '#2a3442' : '#3d4756' })),
  )
  maData = MA[tf].map((p) => sma(b.close, p, b.time))
  mas.forEach((s, k) => s.setData(maData[k] ?? []))
  colors()
  const show = tf === 'D' ? 140 : tf === 'W' ? 110 : 160
  requestAnimationFrame(() => chart?.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - show), to: n + 3 }))
  legendIdx = null
}
async function load() {
  const my = ++token
  const want = { id, tf, adj }
  try {
    const b = await bridge.call('bars.get', { id: want.id, tf: want.tf, adjustment: want.adj })
    if (my !== token) return // 古い要求の結果は捨てる（NFR-A8）
    bars = b
    render(b)
  } catch {
    if (my === token) bars = null
  }
}
$effect(() => {
  void id
  void tf
  void adj
  void app.dataVersion
  ensureMetrics([id])
  void load()
})
$effect(() => {
  void app.settings.candleStyle
  if (chart) queueMicrotask(colors)
})
$effect(() => {
  chart?.priceScale('right').applyOptions({ mode: log ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal })
})
$effect(() => {
  chart?.applyOptions({
    localization: {
      locale: app.settings.lang === 'ja' ? 'ja-JP' : 'en-US',
      dateFormat: app.settings.lang === 'ja' ? 'yyyy/MM/dd' : 'MMM dd, yyyy',
    },
  })
})

const legend = $derived.by(() => {
  if (!bars || !bars.time.length) return null
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
    mas: MA[tf].map((n, k) => ({ n, v: (maData[k] ?? []).find((x) => x.time === bars!.time[i])?.value ?? null, color: MA_COLORS[k]! })),
  }
})

function moveKb(d: number) {
  if (!bars || !chart || !candle) return
  kbIndex = Math.max(0, Math.min(bars.time.length - 1, (kbIndex ?? bars.time.length - 1) + d))
  chart.setCrosshairPosition(bars.close[kbIndex]!, bars.time[kbIndex] as Time, candle)
  legendIdx = kbIndex
}

onMount(() => {
  chart = createChart(host!, {
    autoSize: true,
    layout: {
      background: { color: css('--panel') },
      textColor: css('--text-3'),
      fontFamily: css('--mono'),
      fontSize: 11,
      attributionLogo: true,
    },
    grid: { vertLines: { color: '#161a20' }, horzLines: { color: '#161a20' } },
    rightPriceScale: { borderColor: css('--line'), scaleMargins: { top: 0.12, bottom: 0.22 } },
    timeScale: { borderColor: css('--line'), rightOffset: 4, barSpacing: 6 },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: { color: '#55606d', labelBackgroundColor: '#2d3540' },
      horzLine: { color: '#55606d', labelBackgroundColor: '#2d3540' },
    },
  })
  candle = chart.addSeries(CandlestickSeries, { borderVisible: false, priceLineColor: '#55606d', priceLineStyle: 2 })
  vol = chart.addSeries(HistogramSeries, {
    priceScaleId: 'vol',
    priceFormat: { type: 'volume' },
    lastValueVisible: false,
    priceLineVisible: false,
  })
  chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }, visible: false })
  mas = MA_COLORS.map((c) =>
    chart!.addSeries(LineSeries, {
      color: css(c),
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    }),
  )
  const handle: ChartHandle = {
    pane,
    sync: false,
    bars: () => bars,
    show(time) {
      if (!chart || !candle || !bars) return
      handle.sync = true
      if (time == null) {
        chart.clearCrosshairPosition()
        legendIdx = null
      } else {
        let j = -1
        for (let k = 0; k < bars.time.length; k++) {
          if (bars.time[k]! <= time) j = k
          else break
        }
        if (j >= 0) {
          chart.setCrosshairPosition(bars.close[j]!, bars.time[j] as Time, candle)
          legendIdx = j
        }
      }
      handle.sync = false
    },
  }
  charts.add(handle)
  // 同じリンク色の他の時間軸へ十字線を合わせる（FR-K3）
  chart.subscribeCrosshairMove((param) => {
    if (handle.sync || !bars) return
    const time = (param.time as string | undefined) ?? null
    legendIdx = time ? bars.time.indexOf(time) : null
    for (const o of charts) if (o !== handle && o.pane.link && o.pane.link === pane.link) o.show(time)
  })
  if (bars) render(bars)
  const off = registerPane(pane.id, {
    current: () => id,
    key(e) {
      if (e.ctrlKey || e.altKey || e.metaKey) return false
      const c = e.code
      if (!e.shiftKey && (c === 'KeyD' || c === 'KeyW' || c === 'KeyM')) {
        patchState(pane, { tf: c.slice(3) })
        return true
      }
      if (c === 'KeyL') {
        patchState(pane, { log: !log })
        toast(`${t('chart.log')}: ${!log ? 'ON' : 'OFF'}`)
        return true
      }
      if (c === 'KeyA') {
        const order: Adjustment[] = ['split', 'unadjusted', 'total']
        const next = order[(order.indexOf(adj) + 1) % 3]!
        patchState(pane, { adj: next })
        toast(
          app.settings.lang === 'ja'
            ? `価格の調整: ${{ split: '分割調整済み', unadjusted: '未調整', total: '配当込み' }[next]}`
            : `Adjustment: ${next}`,
        )
        return true
      }
      if (c === 'KeyI') {
        toast(t('common.notInMvp'))
        return true
      }
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
        if (bars) render(bars)
        return true
      }
      return false
    },
  })
  return () => {
    off()
    charts.delete(handle)
    chart?.remove()
    chart = null
  }
})
const m = $derived(metric(id))
</script>

<PaneHeader {pane}>
  <button type="button" class="star" class:on={isFav(id)} title="Ctrl+D" onclick={() => toggleFav(id)}>★</button>
  <span class="sym"><span class="code">{codeOf(id)}</span>{nameOf(id)}</span>
  <span class="num">{px(m?.close)}</span>
  <span class={`num ${cls(m?.chgPct)}`}>{sgn(m?.chgPct, 2, '%')}</span>
  <span class="seg">
    {#each ['D', 'W', 'M'] as x (x)}
      <button type="button" aria-pressed={tf === x} title={x} onclick={() => patchState(pane, { tf: x })}>{x}</button>
    {/each}
  </span>
</PaneHeader>
<div class="body">
  <div class="host" bind:this={host}></div>
  {#if legend}
    <div class="legend">
      <div class="ohlc">
        <span>{legend.date.replaceAll('-', '/')}</span>
        <span>O <b>{px(legend.o)}</b></span><span>H <b>{px(legend.h)}</b></span><span>L <b>{px(legend.l)}</b></span><span>C <b>{px(legend.c)}</b></span>
        <span class={cls(legend.chg)}>{sgn(legend.chg, 2, '%')}</span>
        <span class="vol">V <b>{Math.round(legend.v).toLocaleString()}</b></span>
        {#if legend.prov}<span class="badge">{t('chart.provisional')}</span>{/if}
        {#if legend.forming}<span class="badge">{t('chart.forming')}</span>{/if}
        {#if legend.monthly}<span class="badge">{t('chart.monthlySeries')}</span>{/if}
      </div>
      <div class="mas">
        {#each legend.mas as x (x.n)}
          <span style:color={`var(${x.color})`}><b>MA{x.n}</b> {x.v != null ? px(x.v) : '—'}</span>
        {/each}
        {#if log}<span class="badge">{t('chart.log')}</span>{/if}
      </div>
    </div>
  {:else if bars && !bars.time.length}
    <div class="state">{t('chart.noData')}</div>
  {/if}
</div>

<style>
  .sym {
    font-weight: 700;
    font-size: var(--fs-3);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .code {
    font-family: var(--mono);
    color: var(--text-2);
    margin-right: 6px;
    font-weight: 500;
  }
  .body {
    position: relative;
    flex: 1;
    min-height: 0;
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
  b {
    color: var(--text);
    font-weight: 500;
  }
  .mas b {
    color: var(--text-2);
    font-weight: 400;
  }
  .mas span::before {
    content: '';
    display: inline-block;
    width: 10px;
    height: 2px;
    margin-right: 4px;
    vertical-align: middle;
    background: currentColor;
  }
  .badge {
    font-family: var(--font);
    color: var(--warn);
  }
  .mas .badge::before {
    display: none;
  }
  @container (max-width: 560px) {
    .vol {
      display: none;
    }
  }
</style>
