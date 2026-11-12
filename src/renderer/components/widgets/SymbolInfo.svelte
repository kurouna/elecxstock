<script lang="ts">
const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim()

// 銘柄情報（FR-I1, H3, V12）: 指標と配当・分配金の履歴。利回りには「実績」と基準日・出所を必ず添える。

import type { Dividend } from '@shared/types'
import { onMount } from 'svelte'
import { cls, date, fmt, money, px, sgn } from '../../lib/format'
import type { Key } from '../../lib/i18n'
import { registerPane } from '../../lib/panes'
import { app, bridge, codeOf, ensureMetrics, inst, isFav, metric, nameOf, t, toggleFav } from '../../stores/app.svelte'
import { linkSymbol, type PaneNode } from '../../stores/layout.svelte'
import PaneHeader from '../PaneHeader.svelte'

let { pane }: { pane: PaneNode } = $props()
const id = $derived(linkSymbol(pane.link) ?? 'JP:7203')
const m = $derived(metric(id))
const ins = $derived(inst(id))
let divs = $state<Dividend[]>([])
let cv = $state<HTMLCanvasElement>()
let token = 0

$effect(() => {
  void app.dataVersion
  const my = ++token
  ensureMetrics([id])
  bridge.call('dividends.get', { id }).then((d) => {
    if (my === token) divs = d
  })
})
$effect(() => {
  void divs
  void app.settings.candleStyle
  requestAnimationFrame(draw)
})

function draw() {
  if (!cv) return
  const r = cv.parentElement!.getBoundingClientRect()
  const dpr = devicePixelRatio
  cv.width = r.width * dpr
  cv.height = r.height * dpr
  const g = cv.getContext('2d')!
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  g.clearRect(0, 0, r.width, r.height)
  const recent = divs.slice(-14)
  if (!recent.length) return
  const max = Math.max(...recent.map((d) => d.amount))
  const n = recent.length
  const bw = Math.max(2, (r.width - 4) / n - 2)
  g.font = `10px ${getComputedStyle(document.documentElement).getPropertyValue('--mono')}`
  recent.forEach((d, i) => {
    const hh = (d.amount / max) * (r.height - 16)
    const x = 2 + i * (bw + 2)
    g.fillStyle = i >= n - 2 ? css('--focus') : css('--line-strong')
    g.beginPath()
    g.roundRect(x, r.height - 12 - hh, bw, hh, [2, 2, 0, 0])
    g.fill()
    if (i === 0 || d.date.slice(0, 4) !== recent[i - 1]!.date.slice(0, 4)) {
      g.fillStyle = css('--text-3')
      g.fillText(d.date.slice(2, 4), x, r.height - 1)
    }
  })
}
onMount(() => {
  const ro = new ResizeObserver(() => requestAnimationFrame(draw))
  if (cv?.parentElement) ro.observe(cv.parentElement)
  const off = registerPane(pane.id, { current: () => id })
  return () => {
    ro.disconnect()
    off()
  }
})
const reit = $derived(ins?.kind === 'reit')
const mc = $derived(money(m?.marketCap))
const tv = $derived(money(m?.turnover20))
</script>

<PaneHeader {pane}>
  <button type="button" class="star" class:on={isFav(id)} title="Ctrl+D" onclick={() => toggleFav(id)}>★</button>
  <span class="sym"><span class="code">{codeOf(id)}</span>{nameOf(id)}</span>
  <span class="num">{px(m?.close)}</span>
  <span class={`num ${cls(m?.chgPct)}`}>{sgn(m?.chgPct, 2, '%')}</span>
</PaneHeader>
<div class="scroll">
  <div class="info">
    <div class="head">
      <span class="pxl num">{px(m?.close)}</span>
      <span class={`num ${cls(m?.chg)}`}>{sgn(m?.chg, (m?.close ?? 0) < 1000 ? 1 : 0)} ({sgn(m?.chgPct, 2, '%')})</span>
      <span class="muted">{ins ? t(`mkt.${ins.market}` as Key) : ''}{ins?.sectorJa ? ` · ${app.settings.lang === 'en' && ins.sectorEn ? ins.sectorEn : ins.sectorJa}` : ''}</span>
      <span class="grow"></span>
      {#if m?.stale && m.asOf}<span class="warn">{t('info.stale', { date: date(m.asOf) })}</span>{:else if m?.asOf}<span class="muted">{t('info.asOf', { date: date(m.asOf) })}{m.provisional ? ` · ${t('chart.provisional')}` : ''}</span>{/if}
    </div>
    {#if m?.gapSuspect}<div class="note warn">{t('info.gap')}</div>{/if}
    <div class="kv"><span>{t('info.trailingYield')}</span><span>{m?.yieldTrailing != null ? `${fmt(m.yieldTrailing)}%` : m?.asOf ? t('info.shortHistory') : '—'}</span></div>
    <div class="kv"><span>{t('info.mcap')}</span><span>{mc.n}<span class="unit">{mc.u}</span></span></div>
    <div class="kv"><span>{reit ? t('info.pbrBook') : t('col.pbr')}</span><span>{m?.pbr != null ? `${fmt(m.pbr)}×` : '—'}</span></div>
    <div class="kv"><span>{t('col.per')}</span><span>{m?.per != null ? `${fmt(m.per, 1)}×` : '—'}</span></div>
    <div class="kv" title={t('info.turnoverNote')}><span>{t('info.turnover20')}</span><span>{tv.n}<span class="unit">{tv.u}</span></span></div>
    <div class="kv"><span>{t('col.ret1y')}</span><span class={cls(m?.ret1y)}>{sgn(m?.ret1y, 1, '%')}</span></div>
    <div class="kv"><span>{t('info.hi52')}</span><span>{px(m?.hi52)}</span></div>
    <div class="kv"><span>{t('info.lo52')}</span><span>{px(m?.lo52)}</span></div>
    <div class="kv"><span>{t('info.fromHi')}</span><span>{sgn(m?.fromHi52, 1, '%')}</span></div>
    <div class="kv"><span>{t('info.maDev75')}</span><span class={cls(m?.maDev75)}>{sgn(m?.maDev75, 1, '%')}</span></div>
    <div class="kv"><span>{t('info.rsi')}</span><span>{fmt(m?.rsi14, 1)}</span></div>
    <div class="kv"><span>{t('info.recordMonths')}</span><span>{m?.recordMonths.length ? m.recordMonths.map((x) => (app.settings.lang === 'ja' ? `${x}月` : new Date(2026, x - 1, 1).toLocaleString('en', { month: 'short' }))).join(' · ') : '—'}</span></div>
    <h4><span>{t('info.divHistory')}</span><span class="muted">{reit ? t('info.perUnit') : t('info.perShare')}</span></h4>
    <div class="bars"><canvas bind:this={cv}></canvas></div>
    {#each divs.slice(-6).reverse() as d (d.date)}
      <div class="kv"><span>{t('info.exDate')} {date(d.date)}</span><span>{px(d.amount)}</span></div>
    {:else}
      <div class="note">—</div>
    {/each}
    <div class="note">{t('info.trailingNote', { date: date(m?.asOf) })}</div>
  </div>
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
  .info {
    padding: var(--s-2) var(--s-3);
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0 var(--s-4);
    align-content: start;
  }
  @container (min-width: 640px) {
    .info {
      grid-template-columns: repeat(3, 1fr);
    }
  }
  .kv {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    height: 22px;
    border-bottom: 1px solid var(--line-soft);
    gap: 8px;
  }
  .kv span:first-child {
    color: var(--text-3);
    font-size: var(--fs-1);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .kv span:last-child {
    font-family: var(--mono);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .head {
    grid-column: 1 / -1;
    display: flex;
    align-items: baseline;
    gap: var(--s-3);
    padding: 4px 0 8px;
    border-bottom: 1px solid var(--line);
    flex-wrap: wrap;
  }
  .grow {
    flex: 1;
  }
  .pxl {
    font-size: var(--fs-4);
    font-weight: 500;
  }
  h4 {
    grid-column: 1 / -1;
    margin: var(--s-3) 0 4px;
    font-size: var(--fs-1);
    color: var(--text-2);
    letter-spacing: 0.08em;
    font-weight: 700;
    display: flex;
    justify-content: space-between;
  }
  .bars {
    grid-column: 1 / -1;
    height: 72px;
    position: relative;
  }
  .bars canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .note {
    grid-column: 1 / -1;
    color: var(--text-3);
    font-size: var(--fs-1);
    margin-top: 6px;
  }
  .warn {
    color: var(--warn);
    font-size: var(--fs-1);
  }
</style>
