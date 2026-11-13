<script lang="ts">
// 銘柄情報（FR-I1, H3, V12）: 指標と配当・分配金の履歴。利回りには「実績」と基準日・出所を必ず添える。

import type { Dividend } from '@shared/types'
import { onMount } from 'svelte'
import { cls, date, fmt, money, px, sgn } from '../../lib/format'
import type { Key } from '../../lib/i18n'
import { registerPane } from '../../lib/panes'
import { app, bridge, codeOf, ensureMetrics, inst, isFav, metric, nameOf, rpc, t, toast, toggleFav } from '../../stores/app.svelte'
import { linkSymbol, type PaneNode } from '../../stores/layout.svelte'
import PaneHeader from '../PaneHeader.svelte'

let { pane }: { pane: PaneNode } = $props()
const id = $derived(linkSymbol(pane.link) ?? 'JP:7203')
const m = $derived(metric(id))
const ins = $derived(inst(id))
let divs = $state<Dividend[]>([])
let barsW = $state(0)
let hover = $state(-1)
let token = 0

$effect(() => {
  void app.dataVersion
  const my = ++token
  ensureMetrics([id])
  bridge.call('dividends.get', { id }).then((d) => {
    if (my === token) divs = d
  })
})
// 配当・分配金の履歴の棒（直近 14 回）。棒の上に金額を出し（狭いときは直近と最大だけ）、ポインタを載せると詳細を出す
const recent = $derived(divs.slice(-14))
const maxAmt = $derived(Math.max(0, ...recent.map((d) => d.amount)))
const showAll = $derived(recent.length > 0 && barsW / recent.length >= 36)
const maxAt = $derived(recent.findIndex((d) => d.amount === maxAmt))
/** 1 年前の同じ時期（± 45 日）の回と比べる */
function yoy(i: number): number | null {
  const d = recent[i]
  if (!d) return null
  const t0 = Date.parse(d.date) - 365 * 86400_000
  const prev = divs.find((x) => Math.abs(Date.parse(x.date) - t0) <= 45 * 86400_000)
  return prev?.amount ? (d.amount / prev.amount - 1) * 100 : null
}
onMount(() => registerPane(pane.id, { current: () => id }))
const reit = $derived(ins?.kind === 'reit')
const mc = $derived(money(m?.marketCap))
const tv = $derived(money(m?.turnover20))
</script>

<PaneHeader {pane}>
  <button type="button" class="star" class:on={isFav(id)} title="Ctrl+D" onclick={() => toggleFav(id)}>★</button>
  <span class="sym"><span class="code">{codeOf(id)}</span>{nameOf(id)}</span>
  <span class="num">{px(m?.close)}</span>
  <span class={`num ${cls(m?.chgPct)}`}>{sgn(m?.chgPct, 2, '%')}</span>
  <button type="button" class="chip" title="Shift+F5" onclick={() => rpc('jobs.refetch', { ids: [id] }).then(() => toast(t('refetch.started', { n: 1 })))}>⟳ {t('info.refetch')}</button>
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
    {#if m?.anomaly}<div class="note warn">{t('list.anomalyHint')}</div>{/if}
    {#if ins?.status === 'delisted'}<div class="note warn">{t('list.delistedHint')}</div>{/if}
    <div class="kv"><span>{t('info.trailingYield')}</span><span>{m?.yieldTrailing != null ? `${fmt(m.yieldTrailing)}%` : m?.asOf ? t('info.shortHistory') : '—'}</span></div>
    <div class="kv"><span>{t('info.mcap')}</span><span>{mc.n}<span class="unit">{mc.u}</span></span></div>
    <div class="kv"><span>{reit ? t('info.pbrBook') : t('col.pbr')}</span><span>{m?.pbr != null ? `${fmt(m.pbr)}×` : '—'}</span></div>
    <div class="kv"><span>{t('col.per')}</span><span>{m?.per != null ? `${fmt(m.per, 1)}×` : '—'}</span></div>
    <div class="kv" title={t('info.turnoverNote')}><span>{t('info.turnover20')}</span><span>{tv.n}<span class="unit">{tv.u}</span></span></div>
    <div class="kv"><span>{t('col.ret1y')}</span><span class={cls(m?.ret1y)}>{sgn(m?.ret1y, 1, '%')}</span></div>
    <div class="kv"><span>{t('info.payout')}</span><span>{m?.payout != null ? `${fmt(m.payout, 0)}%` : '—'}</span></div>
    <div class="kv" title={t('info.streakNote')}><span>{t('info.streak')}</span><span>{m?.divUpYears != null ? t('info.years', { up: m.divUpYears, nocut: m.divNoCutYears ?? 0 }) : '—'}</span></div>
    {#if reit}<div class="kv" title={t('info.yield2pNote')}><span>{t('info.yield2p')}</span><span>{m?.yield2p != null ? `${fmt(m.yield2p)}%` : '—'}</span></div>{/if}
    <div class="kv"><span>{t('info.hi52')}</span><span>{px(m?.hi52)}</span></div>
    <div class="kv"><span>{t('info.lo52')}</span><span>{px(m?.lo52)}</span></div>
    <div class="kv"><span>{t('info.fromHi')}</span><span>{sgn(m?.fromHi52, 1, '%')}</span></div>
    <div class="kv"><span>{t('info.maDev75')}</span><span class={cls(m?.maDev75)}>{sgn(m?.maDev75, 1, '%')}</span></div>
    <div class="kv"><span>{t('info.rsi')}</span><span>{fmt(m?.rsi14, 1)}</span></div>
    <div class="kv"><span>{t('info.recordMonths')}</span><span>{m?.recordMonths.length ? m.recordMonths.map((x) => (app.settings.lang === 'ja' ? `${x}月` : new Date(2026, x - 1, 1).toLocaleString('en', { month: 'short' }))).join(' · ') : '—'}</span></div>
    <h4><span>{t('info.divHistory')}</span><span class="muted">{reit ? t('info.perUnit') : t('info.perShare')}</span></h4>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="bars" bind:clientWidth={barsW} onmouseleave={() => (hover = -1)}>
      {#each recent as d, i (d.date)}
        {@const h = maxAmt ? (d.amount / maxAmt) * 100 : 0}
        <div class="b" class:on={hover === i} onmouseenter={() => (hover = i)}>
          <div class="col">
            <i class:recent={i >= recent.length - 2} style:height={`${h}%`}></i>
            <span class="v num" class:show={showAll || i === recent.length - 1 || i === maxAt || hover === i} style:bottom={`calc(${h}% + 1px)`}>{px(d.amount)}</span>
          </div>
          <span class="y num">{i === 0 || d.date.slice(0, 4) !== recent[i - 1]!.date.slice(0, 4) ? d.date.slice(2, 4) : ''}</span>
        </div>
      {/each}
      {#if hover >= 0 && recent[hover]}
        {@const d = recent[hover]!}
        {@const y = yoy(hover)}
        <div class="tip" style:left={`${((hover + 0.5) / recent.length) * 100}%`} class:right={hover > recent.length / 2}>
          <div>{t('info.exDate')} <b class="num">{date(d.date)}</b></div>
          <div>{reit ? t('info.perUnit') : t('info.perShare')} <b class="num">{px(d.amount)}</b></div>
          {#if y != null}<div>{t('info.yoy')} <b class={`num ${cls(y)}`}>{sgn(y, 1, '%')}</b></div>{/if}
        </div>
      {/if}
    </div>
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
    height: 104px;
    padding-top: 16px;
    position: relative;
    display: flex;
    gap: 2px;
    align-items: stretch;
  }
  .b {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .col {
    flex: 1;
    position: relative;
  }
  .b i {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    min-height: 1px;
    background: var(--line-strong);
    border-radius: 2px 2px 0 0;
  }
  .b i.recent {
    background: var(--focus);
  }
  .b.on i {
    background: var(--text-2);
  }
  .v {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    font-size: 10px;
    color: var(--text-2);
    text-align: center;
    white-space: nowrap;
    overflow: visible;
    line-height: 14px;
    visibility: hidden;
  }
  .v.show {
    visibility: visible;
  }
  .y {
    height: 14px;
    font-size: 10px;
    color: var(--text-3);
    line-height: 14px;
  }
  .tip {
    position: absolute;
    bottom: 100%;
    transform: translateX(-50%);
    z-index: 5;
    background: var(--panel-3);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: 6px 8px;
    font-size: var(--fs-1);
    color: var(--text-2);
    white-space: nowrap;
    pointer-events: none;
    display: grid;
    gap: 2px;
  }
  .tip.right {
    transform: translateX(-100%);
  }
  .tip b {
    color: var(--text);
    font-weight: 600;
    margin-left: 6px;
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
