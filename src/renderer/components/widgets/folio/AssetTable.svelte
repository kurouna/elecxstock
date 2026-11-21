<script lang="ts">
// 分類ごとの資産（FR-PF9）: 保有のペインの列（数量・取得単価・現在値・前日比・評価額・評価損益・損益率・構成比・取得利回り）を、
// 資産構成と同じ分類でまとめたアコーディオン。閉じた分類の行は、数量・取得単価・現在値の 3 列に中の銘柄の構成（積み上げの棒と上位 3 銘柄）を出す。
// 見出しは固定し、合計の行は下に固定する。本体は縦にスクロールする
import {
  ASSET_SORTS,
  type AssetRow,
  acctOfKey,
  assetScale,
  barPct,
  compOf,
  compShade,
  type DivGroup,
  dayRateOf,
  dimmed,
  pnlBar,
  rateOf,
  shareOf,
  signPct,
  toneOf,
  yenFull,
} from '../../../lib/folio'
import { compText, lotText } from '../../../lib/folioText'
import type { Key } from '../../../lib/i18n'
import { secret } from '../../../lib/privacy.svelte'
import { t } from '../../../stores/app.svelte'
import AcctDots from './AcctDots.svelte'

let {
  rows,
  group,
  sort,
  asc,
  sel,
  focused,
  brushed,
  multi,
  total,
  label,
  ontoggle,
  onpick,
  onsort,
}: {
  rows: AssetRow[]
  group: DivGroup
  sort: number
  asc: boolean
  sel: number
  focused: boolean
  brushed: Set<string> | null
  /** 複数の口座で持つ銘柄（口座の印を出す） */
  multi: Set<string>
  /** 合計の行（評価額は構成比の分母） */
  total: { value: number; cost: number; pnl: number; day: number; yoc: number | null; label: string }
  label: (key: string) => string
  ontoggle: (i: number) => void
  /** 銘柄の行を押した（リンク色に送る） */
  onpick: (i: number) => void
  /** 列名を押した（ASSET_SORTS の位置。今の列ならもう一度で逆順） */
  onsort: (i: number) => void
} = $props()
let box = $state<HTMLDivElement>()
$effect(() => {
  void sel
  if (focused) queueMicrotask(() => box?.querySelector('tr.sel')?.scrollIntoView({ block: 'nearest' }))
})
// 棒の目盛り: 分類で分けたら分類の行、銘柄で分けたら銘柄の行に合わせる（開いた中の銘柄も同じ目盛り）
const scale = $derived(assetScale(rows, group))
const sc = $derived(scale.sc)
const maxValue = $derived(scale.maxValue)
const on = (k: (typeof ASSET_SORTS)[number]) => (ASSET_SORTS[sort] === k ? `on${asc ? ' asc' : ''}` : '')
const sortBy = (k: (typeof ASSET_SORTS)[number]) => onsort(ASSET_SORTS.indexOf(k))
const ariaSort = (k: (typeof ASSET_SORTS)[number]) => (ASSET_SORTS[sort] === k ? (asc ? 'ascending' : 'descending') : 'none')
const dim = (codes: string[]) => dimmed(brushed, codes)
</script>

<div class="pt" bind:this={box}>
  <table>
    <thead>
      <tr>
        <th>{group === 'code' ? t('folio.colCode') : t('folio.colGroup', { g: t(`folio.dg.${group}` as Key) })}</th>
        <th class="c-qty">{t('hold.qty')}</th>
        <th class="c-avg">{t('hold.avgShort')}</th>
        <th class="c-close">{t('folio.pcClose')}</th>
        <th class={`c-day sortable ${on('day')}`} aria-sort={ariaSort('day')} title={t('folio.sortTip')} onclick={() => sortBy('day')}>{t('hold.chgAmt')}</th>
        <th class="c-dayp">{t('hold.chg')}</th>
        <th class={`sortable ${on('value')}`} aria-sort={ariaSort('value')} title={t('folio.sortTip')} onclick={() => sortBy('value')}>{t('hold.value')}</th>
        <th class={`sortable ${on('pnl')}`} aria-sort={ariaSort('pnl')} title={t('folio.sortTip')} onclick={() => sortBy('pnl')}>{t('hold.pnl')}</th>
        <th class={`sortable ${on('rate')}`} aria-sort={ariaSort('rate')} title={t('folio.sortTip')} onclick={() => sortBy('rate')}>{t('hold.pnlPct')}</th>
        <th>{t('hold.weight')}</th>
        <th class={`c-yoc sortable ${on('yoc')}`} aria-sort={ariaSort('yoc')} title={t('folio.sortTip')} onclick={() => sortBy('yoc')}>{t('hold.yoc')}</th>
      </tr>
    </thead>
    <tbody>
      {#each rows as row, i (row.type === 'g' ? `g:${row.g.key}` : `m:${row.r.key}`)}
        {#if row.type === 'g'}
          {@const g = row.g}
          {@const comp = compOf(g)}
          <tr class="g" class:open={row.open} class:sel={focused && i === sel} class:dim={dim(g.rows.map((r) => r.code))} onclick={() => ontoggle(i)}>
            <td><span class="arrow">{row.open ? '▼' : '▶'}</span>{#if acctOfKey(g.key)}<i class="adot" style:background={`var(--acct-${acctOfKey(g.key)})`}></i>{/if}{label(g.key)} <span class="mute n">{lotText(g.rows)}</span></td>
            <td class="c-comp" colspan="3">
              {#if !row.open}
                <span class="comp" title={compText(comp, comp.length)}>
                  <span class="sb">{#each comp as c, k (c.key)}<i style:width={`${c.share * 100}%`} style:opacity={compShade(k)}></i>{/each}</span>
                  <span class="cn">{compText(comp)}</span>
                </span>
              {/if}
            </td>
            {@render cells(g.dayPnl, dayRateOf(g), g.value, g.pnl, rateOf(g), g.yoc, null)}
          </tr>
        {:else}
          {@const r = row.r}
          <tr class:child={row.child} class:sel={focused && i === sel} class:dim={dim([r.code])} class="pick" onclick={() => onpick(i)}>
            <td><span class="mute num">{r.code}</span> <span class="nm">{r.name}</span>{#if group !== 'acct' && multi.has(r.code)}<AcctDots accts={r.accts} />{/if}</td>
            <td class="num c-qty">{secret(r.qty.toLocaleString('ja-JP'))}</td>
            <td class="num c-avg">{Math.round(r.avgCost).toLocaleString('ja-JP')}</td>
            <td class="num c-close">{r.close == null ? '—' : r.close.toLocaleString('ja-JP')}</td>
            {@render cells(r.dayPnl, dayRateOf(r), r.value, r.pnl, rateOf(r), r.yoc, row.parent && row.parent.rows.length > 1 ? row.parent : null)}
          </tr>
        {/if}
      {/each}
    </tbody>
    <tfoot>
      <tr>
        <td>{t('folio.sumRow')} <span class="mute n">{total.label}</span></td>
        <td class="c-comp" colspan="3"></td>
        <td class={`num c-day ${toneOf(total.day)}`}>{yenFull(total.day, true)}</td>
        <td class={`num c-dayp ${toneOf(total.day)}`}>{signPct(dayRateOf({ dayPnl: total.day, value: total.value }), 2)}</td>
        <td class="num">{yenFull(total.value)}</td>
        <td class={`num ${toneOf(total.pnl)}`}>{yenFull(total.pnl, true)}</td>
        <td class={`num ${toneOf(total.pnl)}`}>{signPct(rateOf(total))}</td>
        <td class="num">100.0%</td>
        <td class="num c-yoc">{total.yoc == null ? '—' : `${total.yoc.toFixed(2)}%`}</td>
      </tr>
    </tfoot>
  </table>
</div>

<!-- 前日比・評価額・評価損益（棒は欄の左端、数字は右端）・損益率・構成比（棒）・取得利回り -->
{#snippet cells(day: number, dp: number | null, value: number, pnl: number, rt: number | null, yoc: number | null, parent: { key: string; value: number; rows: unknown[] } | null)}
  {@const b = pnlBar(pnl, sc)}
  {@const sh = shareOf(value, total.value)}
  <td class={`num c-day ${toneOf(day)}`}>{yenFull(day, true)}</td>
  <td class={`num c-dayp ${toneOf(day)}`}>{signPct(dp, 2)}</td>
  <td class="num">{yenFull(value)}</td>
  <td class={`num ${toneOf(pnl)}`}><span class="bv"><span class="ib"><i class={pnl >= 0 ? 'upb' : 'downb'} style:left={`${b.left}%`} style:width={`${b.width}%`}></i><i class="zero" style:left={`${sc.z}%`}></i></span><span>{yenFull(pnl, true)}</span></span></td>
  <td class={`num ${toneOf(rt)}`}>{signPct(rt)}</td>
  <td class="num" title={parent ? t('folio.shareTip', { a: sh.toFixed(1), g: label(parent.key), b: shareOf(value, parent.value).toFixed(0) }) : ''}><span class="bv"><span class="ib"><i class="sbar" style:width={`${barPct(value, maxValue)}%`}></i></span><span>{#if parent && parent.rows.length > 1}<span class="mute c-in">{t('folio.inGroup', { p: shareOf(value, parent.value).toFixed(0) })} · </span>{/if}{sh.toFixed(1)}%</span></span></td>
  <td class="num c-yoc">{yoc == null ? '—' : `${yoc.toFixed(2)}%`}</td>
{/snippet}

<style>
.pt {
  /* 高さは中身で決め、上限でスクロール（L で 12 行ほど。隣の配当見込みのカードの高さで縮めない） */
  flex: none;
  max-height: 400px;
  overflow: auto;
}
@container (min-width: 1180px) {
  .pt {
    max-height: 330px;
  }
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
/* 並べ替えられる列の印（今の列は ▼・逆順は ▲） */
th.sortable:not(.on)::after {
  content: ' ⇅';
  font-size: 9px;
  opacity: 0.35;
}
th.on {
  color: var(--text);
}
th.on::after {
  content: ' ▼';
  font-size: 9px;
}
th.on.asc::after {
  content: ' ▲';
}
td {
  padding: 2px 8px;
  text-align: right;
  white-space: nowrap;
  border-bottom: 1px solid var(--line-soft);
  height: 22px;
  font-family: var(--mono);
  font-variant-numeric: tabular-nums;
}
td:first-child {
  font-family: var(--font);
}
th:first-child,
td:first-child,
td.c-comp {
  text-align: left;
}
tfoot td {
  position: sticky;
  bottom: 0;
  background: var(--panel-2);
  font-weight: 600;
  border-top: 1px solid var(--line);
  border-bottom: 0;
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
.arrow {
  display: inline-block;
  width: 14px;
  font-size: 9px;
  color: var(--text-3);
}
.adot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  display: inline-block;
  margin-right: 6px;
  vertical-align: 1px;
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
/* 閉じた分類の構成: 積み上げの棒と上位 3 銘柄 */
.comp {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  font-weight: 400;
  font-family: var(--font);
}
.comp .sb {
  display: flex;
  height: 8px;
  border-radius: 1px;
  overflow: hidden;
  background: var(--panel-3);
}
.comp .sb i {
  display: block;
  height: 100%;
  background: var(--f-bar);
  border-right: 1px solid var(--panel-2);
}
.comp .cn {
  max-width: 250px;
  font-size: var(--fs-0);
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ib {
  display: inline-block;
  width: 56px;
  height: 7px;
  background: var(--panel-3);
  border-radius: 1px;
  vertical-align: middle;
  position: relative;
  overflow: hidden;
}
.bv {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.bv .ib {
  flex: none;
}
.ib i {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
}
.ib .upb {
  background: var(--up);
}
.ib .downb {
  background: var(--down);
}
.ib .sbar {
  background: var(--f-bar);
}
.ib .zero {
  width: 1px;
  background: var(--line-strong);
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
  .c-dayp,
  .c-yoc,
  .c-in,
  .comp .cn {
    display: none;
  }
  .comp {
    grid-template-columns: 1fr;
  }
}
@container (max-width: 759px) {
  .c-qty,
  .c-avg,
  .c-close,
  .c-day,
  .c-comp {
    display: none;
  }
  .ib {
    width: 28px;
  }
  th,
  td {
    padding-left: 5px;
    padding-right: 5px;
  }
  .nm {
    max-width: 120px;
  }
}
</style>
