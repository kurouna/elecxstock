<script lang="ts">
// 分類ごとの配当（FR-PF7）: 分類が銘柄以外ならアコーディオン（→ で開き ← で閉じる）。前年比・要因（増配・減配・新規・買い増し・売却）・
// 1 株配当の 5 年・増配率・連続増配・利回り・取得利回り・配当性向（概算）。見出しは固定し、本体は縦にスクロールする
import { DIV_SORTS, type DivGroup, dimmed, divFactors, lastTone, manYen, signPct, type TableRow, toneOf, yenFull } from '../../../lib/folio'
import type { Key } from '../../../lib/i18n'
import { t } from '../../../stores/app.svelte'

let {
  rows,
  group,
  sort,
  sel,
  focused,
  brushed,
  label,
  ontoggle,
  onpick,
  onsort,
}: {
  rows: TableRow[]
  group: DivGroup
  sort: number
  sel: number
  focused: boolean
  brushed: Set<string> | null
  label: (key: string) => string
  ontoggle: (i: number) => void
  /** 銘柄の行を押した（リンク色に送る） */
  onpick: (i: number) => void
  /** 列名を押した（その列で並べ替える。DIV_SORTS の位置） */
  onsort: (i: number) => void
} = $props()
let box = $state<HTMLDivElement>()
$effect(() => {
  void sel
  if (focused) queueMicrotask(() => box?.querySelector('tr.sel')?.scrollIntoView({ block: 'nearest' }))
})
const maxShare = $derived(Math.max(1, ...rows.map((r) => (r.type === 'g' ? r.g.annual : r.r.annual))))
const maxDelta = $derived(
  Math.max(1, ...rows.map((r) => Math.abs(r.type === 'g' ? r.g.annual - r.g.annualPrev : r.r.annual - r.r.annualPrev))),
)
const on = (k: (typeof DIV_SORTS)[number]) => (DIV_SORTS[sort] === k ? 'on' : '')
const sortBy = (k: (typeof DIV_SORTS)[number]) => onsort(DIV_SORTS.indexOf(k))
const dim = (codes: string[]) => dimmed(brushed, codes)
</script>

<div class="dt" bind:this={box}>
  <table>
    <thead>
      <tr>
        <th class={`sortable asc ${on('code')}`} aria-sort={on('code') ? 'ascending' : 'none'} onclick={() => sortBy('code')}>{group === 'code' ? t('folio.colCode') : t('folio.colGroup', { g: t(`folio.dg.${group}`) })}</th>
        <th class="c-mo">{t('folio.colMonths')}</th>
        <th class={`sortable ${on('annual')}`} aria-sort={on('annual') ? 'descending' : 'none'} onclick={() => sortBy('annual')}>{t('folio.colAnnual')}</th>
        <th class={`sortable ${on('delta')}`} aria-sort={on('delta') ? 'descending' : 'none'} onclick={() => sortBy('delta')}>{t('folio.colDelta')}</th>
        <th class="c-fx l">{t('folio.colFactor')}</th>
        <th>{t('folio.colDps')}</th>
        <th class={`c-cagr sortable ${on('cagr')}`} aria-sort={on('cagr') ? 'descending' : 'none'} onclick={() => sortBy('cagr')}>{t('folio.colCagr')}</th>
        <th class="c-streak" title={t('folio.streakTip')}>{t('folio.colStreak')}</th>
        <th class={`sortable ${on('yield')}`} aria-sort={on('yield') ? 'descending' : 'none'} onclick={() => sortBy('yield')}>{t('folio.colYield')}</th>
        <th class={`c-yoc sortable ${on('yoc')}`} aria-sort={on('yoc') ? 'descending' : 'none'} onclick={() => sortBy('yoc')}>{t('folio.colYoc')}</th>
        <th class="c-po" title={t('folio.payoutTip')}>{t('folio.colPayout')}</th>
      </tr>
    </thead>
    <tbody>
      {#each rows as row, i (row.type === 'g' ? `g:${row.g.key}` : `m:${row.r.code}`)}
        {#if row.type === 'g'}
          {@const g = row.g}
          <tr class="g" class:open={row.open} class:sel={focused && i === sel} class:dim={dim(g.rows.map((r) => r.code))} onclick={() => ontoggle(i)}>
            <td><span class="arrow">{row.open ? '▼' : '▶'}</span>{label(g.key)} <span class="mute n">{t('folio.nStocks', { n: g.rows.length })}</span></td>
            <td class="c-mo"></td>
            <td class="num"><span class="ib"><i style:width={`${(g.annual / maxShare) * 100}%`} class="gold"></i></span>{yenFull(g.annual)}</td>
            <td class={`num ${toneOf(g.annual - g.annualPrev)}`}>{@render delta(g.annual - g.annualPrev)}</td>
            <td class="c-fx l">
              {#if Math.abs(g.raise) >= 1}<span class={`fx ${toneOf(g.raise)}`}>{t(g.raise > 0 ? 'folio.fx.raise' : 'folio.fx.cut')}<b>{manYen(g.raise, true)}</b></span>{/if}
              {#if Math.abs(g.qty) >= 1}<span class={`fx ${toneOf(g.qty)}`}>{t('folio.fx.qty')}<b>{manYen(g.qty, true)}</b></span>{/if}
            </td>
            <td>{@render spark(g.dps)}</td>
            <td class="c-cagr"></td>
            <td class="c-streak"></td>
            <td class="num">{g.yld != null ? `${g.yld.toFixed(2)}%` : '—'}</td>
            <td class="num c-yoc">{g.yoc != null ? `${g.yoc.toFixed(2)}%` : '—'}</td>
            <td class="c-po"></td>
          </tr>
        {:else}
          {@const r = row.r}
          <tr class:child={row.child} class:sel={focused && i === sel} class:dim={dim([r.code])} class:sold={r.sold} class="pick" onclick={() => onpick(i)}>
            <td><span class="mute num">{r.code}</span> <span class="nm">{r.name}</span>{#if r.sold}<span class="tag">{t('folio.fx.sold')}</span>{/if}{#if r.special}<span class="tag warn" title={t('folio.specialTip')}>{t('folio.special')}</span>{/if}</td>
            <td class="c-mo num mute">{r.months.length ? t('folio.months', { m: r.months.join('・') }) : '—'}</td>
            <td class="num"><span class="ib"><i style:width={`${(r.annual / maxShare) * 100}%`} class="gold"></i></span>{yenFull(r.annual)}</td>
            <td class={`num ${toneOf(r.annual - r.annualPrev)}`}>{@render delta(r.annual - r.annualPrev)}</td>
            <td class="c-fx l">{#each divFactors(r) as f (f.k)}<span class={`fx ${f.k === 'flat' ? '' : toneOf(f.v)}`}>{t(`folio.fx.${f.k}` as Key)}{#if f.k !== 'flat'}<b>{manYen(f.v, true)}</b>{/if}</span>{/each}</td>
            <td>{@render spark(r.dps.map((v) => v ?? 0), lastTone(r.dps))} <span class="num mute">{r.dpsNow.toLocaleString('ja-JP', { maximumFractionDigits: 2 })}</span></td>
            <td class={`num c-cagr ${toneOf(r.cagr)}`}>{signPct(r.cagr)}</td>
            <td class="num c-streak">{r.streak ? t('folio.years', { n: `${r.streak}${r.streak >= 4 ? '+' : ''}` }) : r.noCut ? t('folio.noCut') : '—'}</td>
            <td class="num">{r.sold || r.yld == null ? '—' : `${r.yld.toFixed(2)}%`}</td>
            <td class="num c-yoc">{r.sold || r.yoc == null ? '—' : `${r.yoc.toFixed(2)}%`}</td>
            <td class="num c-po">{r.payout == null ? '—' : `${r.payout.toFixed(0)}%`}{#if r.payout != null && r.payout > 100}<span class="tag warn">{t('folio.over100')}</span>{/if}</td>
          </tr>
        {/if}
      {/each}
    </tbody>
  </table>
</div>

{#snippet delta(v: number)}
  <span class="ib mid"><i style:left={`${v >= 0 ? 50 : 50 - Math.min(50, (Math.abs(v) / maxDelta) * 50)}%`} style:width={`${Math.min(50, (Math.abs(v) / maxDelta) * 50)}%`} class={v >= 0 ? 'upb' : 'downb'}></i></span>{Math.abs(v) < 1 ? '±0' : yenFull(v, true)}
{/snippet}
{#snippet spark(d: number[], last = 'gold')}
  {@const mx = Math.max(1e-9, ...d)}
  <svg class="dps" width="56" height="16" aria-hidden="true">
    {#each d as v, i (i)}<rect x={i * 12} y={16 - Math.max(1.5, (v / mx) * 15)} width="9" height={Math.max(1.5, (v / mx) * 15)} rx="1" class={i === d.length - 1 ? last : 'base'} />{/each}
  </svg>
{/snippet}

<style>
.dt {
  flex: 1 1 0;
  min-height: 0;
  overflow: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--fs-1);
}
th {
  position: sticky;
  top: 0;
  background: var(--panel);
  color: var(--text-3);
  font-weight: 400;
  text-align: right;
  padding: 3px 8px;
  border-bottom: 1px solid var(--line);
  white-space: nowrap;
  z-index: 1;
}
th.sortable {
  cursor: pointer;
}
th.sortable:hover {
  color: var(--text-2);
}
th.on {
  color: var(--text);
}
th.on.asc::after {
  content: ' ▲';
  font-size: 9px;
}
th.on::after {
  content: ' ▼';
  font-size: 9px;
}
td {
  padding: 2px 8px;
  text-align: right;
  white-space: nowrap;
  border-bottom: 1px solid var(--line-soft);
  height: 22px;
}
th:first-child,
td:first-child,
.l {
  text-align: left;
}
tr.g td {
  background: var(--panel-2);
  font-weight: 600;
  color: var(--text);
  cursor: pointer;
}
tr.pick {
  cursor: pointer;
}
tr.pick:hover td {
  background: var(--hover);
}
tr.child td:first-child {
  padding-left: 22px;
}
tr.sel td {
  background: var(--panel-3);
}
tr.dim {
  opacity: 0.45;
}
tr.sold td {
  color: var(--text-3);
}
.arrow {
  display: inline-block;
  width: 14px;
  font-size: 9px;
  color: var(--text-3);
}
.n {
  font-weight: 400;
}
.nm {
  display: inline-block;
  max-width: 170px;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: bottom;
}
.mute {
  color: var(--text-3);
}
.fx {
  display: inline-block;
  margin-right: 10px;
  color: var(--text-3);
  font-weight: 400;
}
.fx b {
  font-family: var(--mono);
  font-weight: 400;
  margin-left: 3px;
  color: var(--text-2);
}
.fx.up b {
  color: var(--up);
}
.fx.down b {
  color: var(--down);
}
.tag {
  margin-left: 4px;
  font-size: var(--fs-0);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  padding: 0 3px;
  color: var(--text-3);
  font-weight: 400;
}
.tag.warn {
  color: var(--warn);
  border-color: color-mix(in srgb, var(--warn) 50%, transparent);
}
.ib {
  display: inline-block;
  width: 46px;
  height: 7px;
  background: var(--panel-3);
  border-radius: 1px;
  margin-right: 8px;
  vertical-align: middle;
  position: relative;
  overflow: hidden;
}
.ib i {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
}
.ib .gold {
  background: var(--gold);
}
.ib .upb {
  background: var(--up);
}
.ib .downb {
  background: var(--down);
}
.ib.mid::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--line-strong);
}
.dps {
  vertical-align: middle;
}
.dps .base {
  fill: var(--f-bar);
}
.dps .gold {
  fill: var(--gold);
}
.dps .down {
  fill: var(--down);
}
.dps .flat {
  fill: var(--text-3);
}
.up {
  color: var(--up);
}
.down {
  color: var(--down);
}
.flat {
  color: var(--flat);
}
@container (max-width: 1179px) {
  .c-mo,
  .c-po {
    display: none;
  }
}
@container (max-width: 759px) {
  .c-cagr,
  .c-streak,
  .c-yoc,
  .c-fx {
    display: none;
  }
}
</style>
