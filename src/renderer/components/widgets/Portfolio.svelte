<script lang="ts">
// portfolio（§6.3, FR-H7, H11）: 証券会社の CSV から取り込んだ保有を、口座区分ごと・合計で見る。
// 上の帯に合計（評価額・評価損益・前日比・配当の見込み）、一覧は口座区分ごとの小計つき。
// Insert で CSV を取り込む（取り込むたびに CSV の内容に置き換わる）、Enter でリンクグループに送る。
import { ACCOUNT_TYPES } from '@shared/api'
import type { AccountType, Holding } from '@shared/types'
import { onMount } from 'svelte'
import { importedAtText } from '../../lib/folio'
import { cls, fmt, moneyCls, ownMoney, ownSignedMoney, px, sgn } from '../../lib/format'
import { registerPane } from '../../lib/panes'
import {
  accountName,
  dayChangePct,
  editHolding,
  exportHoldings,
  importBrokerCsv,
  importHoldings,
  loadHoldings,
  removeHolding,
  valuation,
} from '../../lib/portfolio'
import { secret } from '../../lib/privacy.svelte'
import { moveSel, SelectionFollow } from '../../lib/selection'
import { endSymbolDrag, startSymbolDrag } from '../../lib/symbolDrag'
import { app, choiceDialog, codeOf, ensureMetrics, nameOf, t, toast } from '../../stores/app.svelte'
import { type PaneNode, setLinkSymbol } from '../../stores/layout.svelte'
import Icon from '../Icon.svelte'
import PaneHeader from '../PaneHeader.svelte'

let { pane }: { pane: PaneNode } = $props()
let sel = $state(0)
let scroller = $state<HTMLDivElement>()

type Sum = { value: number; cost: number; pnl: number; dayPnl: number; div: number; divNet: number; n: number }
type HRow = { kind: 'h'; h: Holding; v: ReturnType<typeof valuation> }
type Row = HRow | ({ kind: 'sub'; account: AccountType } & Sum)
const ids = $derived([...new Set(app.holdings.map((h) => `JP:${h.code}`))])
$effect(() => ensureMetrics(ids))
onMount(() => void loadHoldings())

function sum(rs: HRow[]): Sum {
  const s: Sum = { value: 0, cost: 0, pnl: 0, dayPnl: 0, div: 0, divNet: 0, n: rs.length }
  for (const { h, v } of rs) {
    s.value += v.value ?? h.avgCost * h.quantity
    s.cost += v.cost
    s.dayPnl += v.dayPnl ?? 0
    s.div += v.div ?? 0
    s.divNet += v.divNet ?? 0
  }
  s.pnl = s.value - s.cost
  return s
}
const all = $derived.by((): HRow[] => {
  void app.dataVersion
  void app.metrics.size
  return app.holdings.filter((h) => h.quantity > 0).map((h) => ({ kind: 'h', h, v: valuation(h) }))
})
const rows = $derived.by((): Row[] => {
  const out: Row[] = []
  for (const a of ACCOUNT_TYPES) {
    const hs = all.filter((r) => r.h.account === a).sort((x, y) => (y.v.value ?? 0) - (x.v.value ?? 0))
    if (!hs.length) continue
    out.push({ kind: 'sub', account: a, ...sum(hs) })
    out.push(...hs)
  }
  return out
})
const items = $derived(rows.filter((r): r is HRow => r.kind === 'h'))
const total = $derived(sum(all))
const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : null)
const meta = $derived(app.portfolioMeta)
const importedAt = $derived(importedAtText(meta?.importedAt, app.settings.lang))
// 保有を直す・取得で評価額が変わって並びが入れ替わっても、選んでいた保有（口座と銘柄）の行に移る。消えたら同じ位置（短くなれば最後）
const follow = new SelectionFollow<HRow>((r) => `${r.h.account}:${r.h.code}`)
$effect(() => {
  const s = follow.sync(items, sel).sel
  if (s === sel) return
  sel = s
  scrollSel()
})
const cur = $derived(items[sel]?.h)
const idOf = (h: Holding) => `JP:${h.code}`
const nm = (h: Holding) => nameOf(idOf(h)) || h.name || h.code
/** 取り込む: 楽天証券の CSV か、保有の JSON（別の PC・バックアップ）を選ぶ。Insert は CSV へ直行 */
async function importAny() {
  const c = await choiceDialog(t('hold.importLabel'), [
    { id: 'csv', label: t('hold.csvChoice'), hint: t('hold.csvChoiceHint') },
    { id: 'json', label: t('hold.jsonChoice'), hint: t('hold.jsonChoiceHint') },
  ])
  if (c === 'csv') await importBrokerCsv()
  else if (c === 'json') await importHoldings()
}
function send() {
  if (cur) setLinkSymbol(pane.link, idOf(cur))
}
function scrollSel() {
  queueMicrotask(() => scroller?.querySelector('tr.sel')?.scrollIntoView({ block: 'nearest' }))
}

onMount(() =>
  registerPane(pane.id, {
    current: () => (cur ? idOf(cur) : null),
    selected: () => (cur ? [idOf(cur)] : []),
    key(e) {
      const k = e.key
      if (e.ctrlKey || e.altKey || e.metaKey) return false
      const to = moveSel(k, sel, items.length)
      if (to != null) {
        sel = to
        send()
        scrollSel()
        return true
      }
      if (k === 'Enter') {
        send()
        return true
      }
      if (k === 'Insert') {
        void editHolding()
        return true
      }
      if ((e.code === 'KeyE' || k === 'F2') && cur) {
        void editHolding(cur)
        return true
      }
      if (k === 'Delete' && cur) {
        void removeHolding(cur)
        return true
      }
      return false
    },
  }),
)
</script>

<PaneHeader {pane}>
  {#if importedAt}<span class="muted asof">{t('hold.asOf', { at: importedAt })}</span>{/if}
  <button type="button" class="ibtn" aria-label={t('hold.addLabel')} title={`${t('hold.addTitle')} (Insert) · ${t('hold.editKeys')}`} onclick={() => editHolding()}><Icon name="plus" /></button>
  <button type="button" class="ibtn" aria-label={t('hold.importLabel')} title={t('hold.importTip')} onclick={importAny}><Icon name="import" /></button>
  <button type="button" class="ibtn" aria-label={t('hold.exportLabel')} title={t('hold.exportTip')} onclick={exportHoldings}><Icon name="export" /></button>
  <button type="button" class="ibtn" aria-label={t('common.about')} title={t('hold.note')} onclick={() => toast(t('hold.note'), undefined, 8000)}><Icon name="info" /></button>
</PaneHeader>
{#if items.length}
  <div class="summary">
    <div class="stat">
      <div class="k">{t('hold.total')}</div>
      <div class="v num">{ownMoney(total.value).n}<small>{ownMoney(total.value).u}</small></div>
      <div class="s num muted">{t('hold.costTotal')} {ownMoney(total.cost).n}{ownMoney(total.cost).u}</div>
    </div>
    <div class="stat">
      <div class="k">{t('hold.pnl')}</div>
      <div class={`v num ${moneyCls(total.pnl)}`}>{ownSignedMoney(total.pnl).n}<small>{ownSignedMoney(total.pnl).u}</small></div>
      <div class={`s num ${cls(pct(total.pnl, total.cost), 2)}`}>{sgn(pct(total.pnl, total.cost), 2, '%')}</div>
    </div>
    <div class="stat">
      <div class="k">{t('hold.dayPnl')}</div>
      <div class={`v num ${moneyCls(total.dayPnl)}`}>{ownSignedMoney(total.dayPnl).n}<small>{ownSignedMoney(total.dayPnl).u}</small></div>
      <div class={`s num ${cls(dayChangePct(total), 2)}`}>{sgn(dayChangePct(total), 2, '%')}</div>
    </div>
    <div class="stat">
      <div class="k">{t('hold.divNet')}</div>
      <div class="v num">{ownMoney(total.divNet).n}<small>{ownMoney(total.divNet).u}</small></div>
      <div class="s num muted">{t('hold.yieldPair', { v: fmt(pct(total.div, total.value), 2), c: fmt(pct(total.div, total.cost), 2) })}</div>
    </div>
    {#if meta && (meta.realized != null || meta.dividends != null)}
      <div class="stat" title={t('hold.totalsTip')}>
        <div class="k">{t('hold.totals')}</div>
        <div class="s num">{t('hold.realized')} <span class={cls(meta.realized, 0)}>{secret(sgn(meta.realized, 0))}</span></div>
        <div class="s num">{t('hold.received')} {secret(fmt(meta.dividends, 0))}</div>
      </div>
    {/if}
  </div>
  <div class="alloc" aria-hidden="true">
    {#each rows as r, i (i)}
      {#if r.kind === 'sub'}
        <i style:flex={r.value} style:background={`var(--acct-${r.account})`} title={`${accountName(r.account)} ${fmt(pct(r.value, total.value), 1)}%`}></i>
      {/if}
    {/each}
  </div>
{/if}
<div class="scroll body" bind:this={scroller}>
  {#if !items.length}
    <div class="state">{t('hold.empty')}</div>
  {:else}
    <table class="grid">
      <colgroup>
        <col style:width="56px" /><col style:min-width="120px" /><col style:width="68px" /><col style:width="76px" /><col style:width="72px" />
        <col style:width="84px" /><col style:width="66px" /><col style:width="96px" /><col style:width="92px" /><col style:width="70px" /><col style:width="62px" /><col style:width="72px" />
      </colgroup>
      <thead>
        <tr>
          <th class="l">{t('col.code')}</th><th class="l">{t('col.name')}</th><th>{t('hold.qty')}</th><th>{t('hold.avgShort')}</th><th>{t('col.close')}</th>
          <th title={t('hold.chgAmtTip')}>{t('hold.chgAmt')}</th><th>{t('hold.chg')}</th><th>{t('hold.value')}</th><th>{t('hold.pnl')}</th><th>{t('hold.pnlPct')}</th><th>{t('hold.weight')}</th><th>{t('hold.yoc')}</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as r, i (i)}
          {#if r.kind === 'h'}
            {@const k = items.indexOf(r)}
            {@const v = r.v}
            <tr draggable="true" ondragstart={(e) => startSymbolDrag(e, idOf(r.h))} ondragend={endSymbolDrag} class:sel={k === sel} onclick={() => { sel = k; send() }} ondblclick={() => editHolding(r.h)}>
              <td class="l code">{codeOf(idOf(r.h)) || r.h.code}</td>
              <td class="l name">{nm(r.h)}</td>
              <td>{secret(fmt(r.h.quantity, 0))}</td>
              <td>{px(r.h.avgCost)}</td>
              <td>{px(v.close)}</td>
              <td class={cls(v.dayPnl, 0)}>{secret(sgn(v.dayPnl, 0))}</td>
              <td class={cls(v.chgPct, 2)}>{sgn(v.chgPct, 2, '%')}</td>
              <td>{secret(fmt(v.value, 0))}</td>
              <td class={cls(v.pnl, 0)}>{secret(sgn(v.pnl, 0))}</td>
              <td class={cls(v.pnlPct, 1)}>{sgn(v.pnlPct, 1, '%')}</td>
              <td>{fmt(pct(v.value ?? 0, total.value), 1)}<span class="unit">%</span></td>
              <td>{fmt(v.yoc, 2)}<span class="unit">%</span></td>
            </tr>
          {:else}
            <tr class="sub">
              <td class="l" colspan="5"><span class="dot" style:background={`var(--acct-${r.account})`}></span>{accountName(r.account)} <span class="n">{t('hold.count', { n: r.n })}</span></td>
              <td class={cls(r.dayPnl, 0)}>{secret(sgn(r.dayPnl, 0))}</td>
              <td class={cls(dayChangePct(r), 2)}>{sgn(dayChangePct(r), 2, '%')}</td>
              <td>{secret(fmt(r.value, 0))}</td>
              <td class={cls(r.pnl, 0)}>{secret(sgn(r.pnl, 0))}</td>
              <td class={cls(pct(r.pnl, r.cost), 1)}>{sgn(pct(r.pnl, r.cost), 1, '%')}</td>
              <td>{fmt(pct(r.value, total.value), 1)}<span class="unit">%</span></td>
              <td></td>
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .asof {
    font-size: var(--fs-1);
  }
  .summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    flex: none;
    border-bottom: 1px solid var(--line);
  }
  .stat {
    min-width: 0;
    overflow: hidden;
    padding: 6px var(--s-3) 8px;
    border-right: 1px solid var(--line);
  }
  .stat:last-child {
    border-right: 0;
  }
  .k {
    font-size: var(--fs-1);
    color: var(--text-3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .v {
    font-size: var(--fs-5);
    line-height: 1.3;
    white-space: nowrap;
  }
  .v small {
    font-size: var(--fs-2);
    color: var(--text-3);
    margin-left: 2px;
  }
  .s {
    font-size: var(--fs-1);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .alloc {
    display: flex;
    gap: 2px;
    height: 6px;
    margin: 6px var(--s-3);
    flex: none;
  }
  .alloc i {
    display: block;
    min-width: 2px;
    border-radius: var(--radius);
  }
  .body {
    flex: 1;
    min-height: 0;
    position: relative;
  }
  tr.sub td {
    color: var(--text-2);
    background: var(--panel-2);
    font-weight: 600;
    border-bottom: 1px solid var(--line-strong);
  }
  tr.sub .n {
    font-weight: 400;
    color: var(--text-3);
    margin-left: var(--s-1);
  }
  .dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: var(--radius);
    margin-right: 6px;
  }
</style>
