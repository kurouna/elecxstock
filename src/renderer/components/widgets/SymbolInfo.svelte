<script lang="ts">
// 銘柄情報（FR-I1, H3, V12）: 指標と配当・分配金の推移。利回りには「実績」と基準日・出所を必ず添える。
// 幅が広いときは左に指標（幅を抑えてラベルと値を離さない）、右に配当のグラフ。狭いときは上下に重ねる。
// グラフは既定で暦年ごとの合計（中間・期末のぎざぎざを消して傾向を見る）。Y で回ごとに切り替え、← → で棒を選ぶ。

import type { Dividend } from '@shared/types'
import { onMount } from 'svelte'
import { annualDividends, eventYoy, yearsThatFit } from '../../lib/dividends'
import { cls, date, fmt, money, px, sgn } from '../../lib/format'
import type { Key } from '../../lib/i18n'
import { registerPane } from '../../lib/panes'
import { accountName, valuation } from '../../lib/portfolio'
import { app, bridge, codeOf, ensureMetrics, inst, isFav, metric, nameOf, rpc, t, toast, toggleFav } from '../../stores/app.svelte'
import { type PaneNode, paneSymbol, patchState } from '../../stores/layout.svelte'
import Icon from '../Icon.svelte'
import PaneHeader from '../PaneHeader.svelte'

let { pane }: { pane: PaneNode } = $props()
const id = $derived(paneSymbol(pane) ?? 'JP:7203')
const m = $derived(metric(id))
const ins = $derived(inst(id))
let divs = $state<Dividend[]>([])
let plotW = $state(0)
/** 選んでいる棒（-1 は無し）。ポインタとキーで同じものを使う */
let sel = $state(-1)
let token = 0

// 銘柄が変わったら、選んでいた棒をはずす（別の銘柄の同じ位置の棒を指さないように）
$effect(() => {
  void id
  sel = -1
})
$effect(() => {
  void app.dataVersion
  const my = ++token
  ensureMetrics([id])
  bridge.call('dividends.get', { id }).then((d) => {
    if (my === token) divs = d
  })
})

const mode = $derived((pane.state.divMode as 'year' | 'event' | undefined) ?? 'year')
const asOf = $derived(m?.asOf ?? new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10))
const fit = $derived(yearsThatFit(plotW))
const years = $derived(annualDividends(divs, asOf).slice(-fit))
const events = $derived(divs.slice(-fit))
/** 描く棒（年でも回でも同じ形にそろえる） */
type Bar = { key: string; v: number; label: string; partial: boolean; cut: boolean; latest: boolean }
const bars = $derived.by((): Bar[] => {
  if (mode === 'year') {
    const lastFull = years.findLastIndex((y) => !y.partial)
    return years.map((y, i) => ({
      key: String(y.year),
      v: y.total,
      label: `'${String(y.year).slice(2)}`,
      partial: y.partial,
      cut: y.cut,
      latest: i === lastFull,
    }))
  }
  return events.map((d, i) => ({
    key: d.date,
    v: d.amount,
    label: i === 0 || d.date.slice(0, 4) !== events[i - 1]!.date.slice(0, 4) ? `'${d.date.slice(2, 4)}` : '',
    partial: false,
    cut: false,
    latest: i === events.length - 1,
  }))
})
const maxV = $derived(Math.max(0, ...bars.map((b) => b.v)))
const maxAt = $derived(bars.findIndex((b) => b.v === maxV))
// 棒の上の金額: 1 本 40px 以上あれば全部、狭ければ最新・最大・選んだ棒だけ
const showAll = $derived(bars.length > 0 && plotW / bars.length >= 40)
$effect(() => {
  if (sel >= bars.length) sel = bars.length - 1
})
function setMode(next: 'year' | 'event') {
  patchState(pane, { divMode: next })
  sel = -1
}
const unitLabel = $derived(ins?.kind === 'reit' ? t('info.perUnit') : t('info.perShare'))
const summary = $derived.by(() => {
  const a = years.filter((y) => !y.partial)
  const last = a.at(-1)
  if (!last) return t('info.divNone')
  return t('info.divSummary', { from: a[0]!.year, to: last.year, v: px(last.total), yoy: last.yoy != null ? sgn(last.yoy, 1, '%') : '—' })
})

onMount(() =>
  registerPane(pane.id, {
    current: () => id,
    key(e) {
      if (e.ctrlKey || e.altKey || e.metaKey) return false
      const n = bars.length
      if (!n) return false
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        sel = sel < 0 ? n - 1 : Math.max(0, Math.min(n - 1, sel + (e.key === 'ArrowRight' ? 1 : -1)))
        return true
      }
      if (e.key === 'Home' || e.key === 'End') {
        sel = e.key === 'Home' ? 0 : n - 1
        return true
      }
      if (e.key === 'Escape' && sel >= 0) {
        sel = -1
        return true
      }
      if (e.code === 'KeyY' && !e.shiftKey) {
        setMode(mode === 'year' ? 'event' : 'year')
        return true
      }
      return false
    },
  }),
)
const reit = $derived(ins?.kind === 'reit')
/** 計算で求める指標: 益利回り（1 ÷ PER）、ROE（EPS ÷ BPS）、200 日線乖離 */
const calc = $derived({
  ey: m?.per && m.per > 0 ? 100 / m.per : null,
  roe: m?.eps != null && m?.bps && m.bps > 0 ? (m.eps / m.bps) * 100 : null,
  dev200: m?.close != null && m?.ma200 ? (m.close / m.ma200 - 1) * 100 : null,
})
const crossText = $derived(
  m?.gcDays != null && (m.dcDays == null || m.gcDays <= m.dcDays)
    ? t('info.gcAgo', { n: m.gcDays })
    : m?.dcDays != null
      ? t('info.dcAgo', { n: m.dcDays })
      : '—',
)
/** この銘柄の保有（口座区分をまたいで合計。評価は最新の終値） */
const held = $derived.by(() => {
  const code = id.replace(/^\w+:/, '')
  const hs = app.holdings.filter((h) => h.code === code && h.quantity > 0)
  if (!hs.length) return null
  let qty = 0
  let cost = 0
  let value = 0
  for (const h of hs) {
    const v = valuation(h)
    qty += h.quantity
    cost += v.cost
    value += v.value ?? v.cost
  }
  const avg = qty ? cost / qty : 0
  return {
    qty,
    avg,
    value,
    pnl: value - cost,
    pnlPct: cost > 0 ? (value / cost - 1) * 100 : null,
    yoc: m?.div12 != null && avg > 0 ? (m.div12 / avg) * 100 : null,
    accounts: hs.map((h) => accountName(h.account)).join(' · '),
  }
})
const mc = $derived(money(m?.marketCap))
const tv = $derived(money(m?.turnover20))
const months = $derived(
  m?.recordMonths.length
    ? m.recordMonths
        .map((x) => (app.settings.lang === 'ja' ? `${x}月` : new Date(2026, x - 1, 1).toLocaleString('en', { month: 'short' })))
        .join(' · ')
    : '—',
)
</script>

<PaneHeader {pane}>
  <button type="button" class="star" class:on={isFav(id)} title="Ctrl+D" onclick={() => toggleFav(id)}>★</button>
  <span class="sym"><span class="code">{codeOf(id)}</span>{nameOf(id)}</span>
  <span class="num">{px(m?.close)}</span>
  <span class={`num ${cls(m?.chgPct)}`}>{sgn(m?.chg, (m?.close ?? 0) < 1000 ? 1 : 0)} ({sgn(m?.chgPct, 2, '%')})</span>
  <button
    type="button"
    class="ibtn"
    aria-label={t('info.refetch')}
    title={`${t('info.refetchHint')} (Shift+F5)`}
    onclick={() => rpc('jobs.refetch', { ids: [id] }).then(() => toast(t('refetch.started', { n: 1 })))}><Icon name="refresh" /></button>
  <button type="button" class="ibtn" aria-label={t('common.about')} title={`${t('info.trailingNote', { date: date(m?.asOf) })}\n${t('info.calcNote')}`}><Icon name="info" /></button>
</PaneHeader>
<div class="scroll">
  <div class="info">
    <div class="head">
      <span class="muted">{ins ? t(`mkt.${ins.market}` as Key) : ''}{ins?.sectorJa ? ` · ${app.settings.lang === 'en' && ins.sectorEn ? ins.sectorEn : ins.sectorJa}` : ''}</span>
      <span class="grow"></span>
      {#if m?.stale && m.asOf}<span class="warn">{t('info.stale', { date: date(m.asOf) })}</span>{:else if m?.asOf}<span class="muted">{t('info.asOf', { date: date(m.asOf) })}{m.provisional ? ` · ${t('chart.provisional')}` : ''}</span>{/if}
    </div>
    {#if m?.gapSuspect || m?.anomaly || ins?.status === 'delisted'}
      <div class="notes">
        {#if m?.gapSuspect}<div class="warn">{t('info.gap')}</div>{/if}
        {#if m?.anomaly}<div class="warn">{t('list.anomalyHint')}</div>{/if}
        {#if ins?.status === 'delisted'}<div class="warn">{t('list.delistedHint')}</div>{/if}
      </div>
    {/if}

    <div class="metrics">
      <section>
        <h5>{t('info.gIncome')}</h5>
        <div class="kv lead"><span>{t('info.trailingYield')}</span><span>{m?.yieldTrailing != null ? `${fmt(m.yieldTrailing)}%` : m?.asOf ? t('info.shortHistory') : '—'}</span></div>
        {#if reit}<div class="kv" title={t('info.yield2pNote')}><span>{t('info.yield2p')}</span><span>{m?.yield2p != null ? `${fmt(m.yield2p)}%` : '—'}</span></div>{/if}
        <div class="kv"><span>{reit ? t('info.div12Unit') : t('info.div12')}</span><span>{px(m?.div12)}</span></div>
        <div class="kv" title={t('info.streakNote')}><span>{t('info.streak')}</span><span>{m?.divUpYears != null ? t('info.years', { up: m.divUpYears, nocut: m.divNoCutYears ?? 0 }) : '—'}</span></div>
        <div class="kv"><span>{t('info.payout')}</span><span>{m?.payout != null ? `${fmt(m.payout, 0)}%` : '—'}</span></div>
        <div class="kv"><span>{t('info.recordMonths')}</span><span>{months}</span></div>
      </section>
      <section>
        <h5>{t('info.gValue')}</h5>
        <div class="kv"><span>{reit ? t('info.pbrBook') : t('col.pbr')}</span><span>{m?.pbr != null ? `${fmt(m.pbr)}×` : '—'}</span></div>
        <div class="kv"><span>{t('col.per')}</span><span>{m?.per != null ? `${fmt(m.per, 1)}×` : '—'}</span></div>
        <div class="kv" title={t('info.earningsYieldNote')}><span>{t('info.earningsYield')}</span><span>{calc.ey != null ? `${fmt(calc.ey)}%` : '—'}</span></div>
        <div class="kv" title={t('info.roeNote')}><span>ROE</span><span>{calc.roe != null ? `${fmt(calc.roe, 1)}%` : '—'}</span></div>
        <div class="kv"><span>EPS / BPS</span><span>{px(m?.eps)} / {px(m?.bps)}</span></div>
        <div class="kv"><span>{t('info.mcap')}</span><span>{mc.n}<span class="unit">{mc.u}</span></span></div>
        <div class="kv" title={t('info.turnoverNote')}><span>{t('info.turnover20')}</span><span>{tv.n}<span class="unit">{tv.u}</span></span></div>
      </section>
      <section>
        <h5>{t('info.gPrice')}</h5>
        <div class="kv"><span>{t('info.range52')}</span><span>{px(m?.lo52)} – {px(m?.hi52)}</span></div>
        <div class="kv"><span>{t('info.fromHi')}</span><span>{sgn(m?.fromHi52, 1, '%')}</span></div>
        <div class="kv"><span>{t('info.ret13')}</span><span><span class={cls(m?.ret1m)}>{sgn(m?.ret1m, 1, '%')}</span> / <span class={cls(m?.ret3m)}>{sgn(m?.ret3m, 1, '%')}</span></span></div>
        <div class="kv"><span>{t('info.ret13y')}</span><span><span class={cls(m?.ret1y)}>{sgn(m?.ret1y, 1, '%')}</span> / <span class={cls(m?.ret3y)}>{sgn(m?.ret3y, 1, '%')}</span></span></div>
        <div class="kv"><span>{t('info.maDev2575')}</span><span><span class={cls(m?.maDev25)}>{sgn(m?.maDev25, 1, '%')}</span> / <span class={cls(m?.maDev75)}>{sgn(m?.maDev75, 1, '%')}</span></span></div>
        <div class="kv"><span>{t('info.maDev200')}</span><span class={cls(calc.dev200)}>{sgn(calc.dev200, 1, '%')}</span></div>
        <div class="kv" title={t('info.crossNote')}><span>{t('info.cross')}</span><span>{crossText}</span></div>
        <div class="kv"><span>{t('info.rsi')}</span><span>{fmt(m?.rsi14, 1)}</span></div>
        <div class="kv" title={t('info.volRatioNote')}><span>{t('info.volRatio')}</span><span>{m?.volRatio != null ? `${fmt(m.volRatio, 2)}×` : '—'}</span></div>
      </section>
      {#if held}
        <section class="held">
          <h5>{t('info.gHeld')}</h5>
          <div class="kv"><span>{t('hold.qty')}</span><span>{fmt(held.qty, 0)}</span></div>
          <div class="kv"><span>{t('hold.avgShort')}</span><span>{px(held.avg)}</span></div>
          <div class="kv"><span>{t('hold.value')}</span><span>{fmt(held.value, 0)}</span></div>
          <div class="kv"><span>{t('hold.pnl')}</span><span class={cls(held.pnl)}>{sgn(held.pnl, 0)} ({sgn(held.pnlPct, 1, '%')})</span></div>
          <div class="kv"><span>{t('hold.yoc')}</span><span>{held.yoc != null ? `${fmt(held.yoc)}%` : '—'}</span></div>
          <div class="kv"><span>{t('info.accounts')}</span><span class="accts">{held.accounts}</span></div>
        </section>
      {/if}
    </div>

    <div class="dchart">
      <h4>
        <span>{t('info.divHistory')}</span>
        <span class="muted">{unitLabel}</span>
        <span class="grow"></span>
        <span class="seg" role="group" aria-label={t('info.divMode')} title={`${t('info.divMode')} (Y)`}>
          <button type="button" aria-pressed={mode === 'year'} onclick={() => setMode('year')}>{t('info.byYear')}</button>
          <button type="button" aria-pressed={mode === 'event'} onclick={() => setMode('event')}>{t('info.byEvent')}</button>
        </span>
      </h4>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="plot" role="img" aria-label={summary} bind:clientWidth={plotW} onmouseleave={() => (sel = -1)}>
        {#if maxV > 0}
          <div class="grid50"></div>
          <div class="grid100"><span class="num">{px(maxV)}</span></div>
        {/if}
        <div class="row">
          {#each bars as b, i (b.key)}
            {@const h = maxV ? (b.v / maxV) * 100 : 0}
            <div class="b" class:on={sel === i} onmouseenter={() => (sel = i)}>
              <div class="col">
                <i class:latest={b.latest} class:partial={b.partial} class:cut={b.cut} style:height={`${h}%`}></i>
                <span class="v num" class:show={showAll || b.latest || i === maxAt || sel === i} style:bottom={`calc(${h}% + 1px)`}>{px(b.v)}</span>
                {#if sel === i}
                <div class="tip" aria-live="polite" class:right={i > bars.length / 2}>
                  {#if mode === 'year'}
                    {@const y = years[i]!}
                    <div>{t('info.yearOf', { y: y.year })}{y.partial ? ` · ${t('info.partialYear', { n: y.count })}` : ` · ${t('info.times', { n: y.count })}`}</div>
                    <div>{unitLabel} <b class="num">{px(y.total)}</b></div>
                    {#if y.yoy != null}<div>{t('info.yoyYear')} <b class={y.cut ? 'num cutc' : 'num'}>{sgn(y.yoy, 1, '%')}</b></div>{/if}
                  {:else}
                    {@const d = events[i]!}
                    {@const yy = eventYoy(divs, divs.length - events.length + i)}
                    <div>{t('info.exDate')} <b class="num">{date(d.date)}</b></div>
                    <div>{unitLabel} <b class="num">{px(b.v)}</b></div>
                    {#if yy != null}<div>{t('info.yoy')} <b class="num">{sgn(yy, 1, '%')}</b></div>{/if}
                  {/if}
                </div>
                {/if}
              </div>
              <span class="y num">{b.label}{#if b.cut}<span class="cutmark">▼</span>{/if}</span>
            </div>
          {/each}
        </div>
      </div>
      <div class="recent num">
        {#if divs.length}{t('info.recentDivs')} {divs.slice(-4).reverse().map((d) => `${date(d.date)} ${px(d.amount)}`).join(' · ')}{:else}—{/if}
      </div>
    </div>
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
  .scroll {
    container-type: inline-size;
  }
  /* 狭いとき: 上から見出し・指標・グラフ */
  .info {
    padding: var(--s-2) var(--s-3);
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto auto auto 1fr;
    grid-template-areas: 'head' 'notes' 'metrics' 'chart';
    gap: var(--s-2) var(--s-4);
    align-content: start;
    min-height: 100%;
  }
  .head {
    grid-area: head;
    display: flex;
    align-items: baseline;
    gap: var(--s-3);
    font-size: var(--fs-1);
    flex-wrap: wrap;
  }
  .notes {
    grid-area: notes;
    font-size: var(--fs-1);
  }
  .grow {
    flex: 1;
  }
  .metrics {
    grid-area: metrics;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: var(--s-2) var(--s-4);
    align-content: start;
  }
  .dchart {
    grid-area: chart;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  /* 広いとき（720px〜）: 左に指標（幅を抑える）、右にグラフ。グラフは余った幅と高さを使う */
  @container (min-width: 720px) {
    .info {
      grid-template-columns: minmax(0, 420px) minmax(0, 1fr);
      grid-template-rows: auto auto 1fr;
      grid-template-areas: 'head head' 'notes notes' 'metrics chart';
    }
    .dchart {
      border-left: 1px solid var(--line);
      padding-left: var(--s-4);
    }
  }
  @container (min-width: 1100px) {
    .info {
      grid-template-columns: minmax(0, 620px) minmax(0, 1fr);
    }
  }
  section {
    min-width: 0;
  }
  h5 {
    margin: 0 0 2px;
    font-size: var(--fs-1);
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--text-3);
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
  .kv > span:last-child {
    font-family: var(--mono);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .accts {
    font-family: var(--font) !important;
    font-size: var(--fs-1);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .kv.lead > span:last-child {
    font-size: var(--fs-3);
    color: var(--text);
    font-weight: 600;
  }
  h4 {
    margin: 0 0 4px;
    font-size: var(--fs-1);
    color: var(--text-2);
    letter-spacing: 0.08em;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: var(--s-2);
  }
  .seg {
    display: inline-flex;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .seg button {
    background: none;
    border: 0;
    padding: 0 8px;
    height: 18px;
    font-size: var(--fs-1);
    color: var(--text-3);
    cursor: pointer;
  }
  .seg button[aria-pressed='true'] {
    background: var(--select-strong);
    color: var(--text);
  }
  .plot {
    position: relative;
    flex: 1;
    min-height: 120px;
    padding-top: 16px;
  }
  .grid50,
  .grid100 {
    position: absolute;
    left: 0;
    right: 0;
    border-top: 1px dashed var(--line-soft);
    pointer-events: none;
  }
  .grid100 {
    top: 16px;
  }
  .grid50 {
    top: calc(16px + (100% - 30px) / 2);
  }
  .grid100 span {
    position: absolute;
    left: 0;
    top: -12px;
    font-size: 10px;
    color: var(--text-3);
  }
  /* 棒は 28px まで、間は 6px。右（最新）に寄せる */
  .row {
    position: absolute;
    inset: 16px 0 0;
    display: flex;
    justify-content: flex-end;
    gap: 6px;
  }
  .b {
    flex: 1 1 0;
    max-width: 28px;
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
  .b i.latest {
    background: var(--focus);
  }
  /* 年途中: 枠だけ（まだ増える） */
  .b i.partial {
    background: transparent;
    border: 1px dashed var(--focus);
    border-bottom: 0;
  }
  .b i.cut {
    background: color-mix(in srgb, var(--warn) 55%, var(--line-strong));
  }
  .b.on i {
    outline: 1px solid var(--focus);
    outline-offset: 1px;
  }
  .v {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    font-size: 10px;
    color: var(--text-2);
    white-space: nowrap;
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
    text-align: center;
    white-space: nowrap;
  }
  .cutmark {
    color: var(--warn);
    margin-left: 1px;
  }
  /* 選んだ棒の上に出す（棒の位置に合わせる。端の棒では内側へ寄せる） */
  .tip {
    position: absolute;
    bottom: calc(100% + 4px);
    left: 50%;
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
    left: auto;
    right: 0;
    transform: none;
  }
  .b:first-child .tip:not(.right) {
    left: 0;
    transform: none;
  }
  .tip b {
    color: var(--text);
    font-weight: 600;
    margin-left: 6px;
  }
  .tip .cutc {
    color: var(--warn);
  }
  .recent {
    margin-top: 4px;
    font-size: var(--fs-1);
    color: var(--text-3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .warn {
    color: var(--warn);
    font-size: var(--fs-1);
  }
</style>
