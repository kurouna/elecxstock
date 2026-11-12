<script lang="ts">
// portfolio（§6.3, FR-H7）: 保有の一覧を口座区分ごと・合計で出し、評価額と評価損益を見る。
// Insert で足す（取引 / 数量と単価）、E で直す、Delete で外す、Enter でリンクグループに送る。
import { ACCOUNT_TYPES } from '@shared/api'
import type { Holding } from '@shared/types'
import { onMount } from 'svelte'
import { focusedSymbol } from '../../lib/commands'
import { cls, fmt, money, px, sgn } from '../../lib/format'
import { registerPane } from '../../lib/panes'
import { accountName, editHolding, exportHoldings, importHoldings, loadHoldings, removeHolding, valuation } from '../../lib/portfolio'
import { app, codeOf, ensureMetrics, nameOf, t } from '../../stores/app.svelte'
import { type PaneNode, setLinkSymbol } from '../../stores/layout.svelte'
import PaneHeader from '../PaneHeader.svelte'

let { pane }: { pane: PaneNode } = $props()
let sel = $state(0)
let scroller = $state<HTMLDivElement>()

type Row = { kind: 'h'; h: Holding } | { kind: 'sub'; account: string; value: number; cost: number; pnl: number }
const ids = $derived([...new Set(app.holdings.map((h) => `JP:${h.code}`))])
$effect(() => ensureMetrics(ids))
onMount(() => void loadHoldings())

const rows = $derived.by((): Row[] => {
  void app.dataVersion
  void app.metrics.size
  const out: Row[] = []
  for (const a of ACCOUNT_TYPES) {
    const hs = app.holdings.filter((h) => h.account === a && h.quantity > 0).sort((x, y) => x.code.localeCompare(y.code))
    if (!hs.length) continue
    let value = 0
    let cost = 0
    for (const h of hs) {
      out.push({ kind: 'h', h })
      value += valuation(h).value ?? h.avgCost * h.quantity
      cost += h.avgCost * h.quantity
    }
    out.push({ kind: 'sub', account: accountName(a), value, cost, pnl: value - cost })
  }
  return out
})
const items = $derived(rows.filter((r): r is { kind: 'h'; h: Holding } => r.kind === 'h'))
const total = $derived.by(() => {
  let value = 0
  let cost = 0
  for (const r of rows)
    if (r.kind === 'sub') {
      value += r.value
      cost += r.cost
    }
  return { value, cost, pnl: value - cost, pct: cost > 0 ? ((value - cost) / cost) * 100 : null }
})
$effect(() => {
  if (sel >= items.length) sel = Math.max(0, items.length - 1)
})
const cur = $derived(items[sel]?.h)
function send() {
  if (cur) setLinkSymbol(pane.link || 1, `JP:${cur.code}`)
}
function scrollSel() {
  queueMicrotask(() => scroller?.querySelector('tr.sel')?.scrollIntoView({ block: 'nearest' }))
}

onMount(() =>
  registerPane(pane.id, {
    current: () => (cur ? `JP:${cur.code}` : null),
    selected: () => (cur ? [`JP:${cur.code}`] : []),
    key(e) {
      const k = e.key
      if (e.ctrlKey || e.altKey || e.metaKey) return false
      if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Home' || k === 'End') {
        sel =
          k === 'Home' ? 0 : k === 'End' ? items.length - 1 : Math.max(0, Math.min(items.length - 1, sel + (k === 'ArrowDown' ? 1 : -1)))
        send()
        scrollSel()
        return true
      }
      if (k === 'Enter') {
        send()
        return true
      }
      if (k === 'Insert') {
        void editHolding(focusedSymbol())
        return true
      }
      if (e.code === 'KeyE' && cur) {
        void editHolding(`JP:${cur.code}`, cur)
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
  <span class="num dim">{t('hold.total')} <b>{money(total.value).n}{money(total.value).u}</b></span>
  <span class={`num ${cls(total.pnl)}`}>{total.pnl >= 0 ? '+' : ''}{money(total.pnl).n}{money(total.pnl).u} ({sgn(total.pct, 2, '%')})</span>
</PaneHeader>
<div class="bar">
  <button type="button" class="chip" title="Insert" onclick={() => editHolding(focusedSymbol())}>＋ {t('hold.add')}</button>
  <button type="button" class="chip" onclick={importHoldings}>{t('hold.import')}</button>
  <button type="button" class="chip" onclick={exportHoldings}>{t('hold.export')}</button>
  <span class="grow"></span>
  <span class="muted">{t('hold.keys')}</span>
</div>
<div class="scroll body" bind:this={scroller}>
  {#if !items.length}
    <div class="state">{t('hold.empty')}</div>
  {:else}
    <table class="grid">
      <colgroup><col style:width="46px" /><col style:min-width="96px" /><col style:width="60px" /><col style:width="68px" /><col style:width="66px" /><col style:width="72px" /><col style:width="72px" /><col style:width="58px" /><col style:width="54px" /></colgroup>
      <thead>
        <tr>
          <th class="l">{t('col.code')}</th><th class="l">{t('col.name')}</th><th>{t('hold.qty')}</th><th>{t('hold.avgShort')}</th><th>{t('col.close')}</th>
          <th>{t('hold.value')}</th><th>{t('hold.pnl')}</th><th>{t('hold.pnlPct')}</th><th>{t('hold.yoc')}</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as r, i (i)}
          {#if r.kind === 'h'}
            {@const v = valuation(r.h)}
            {@const k = items.indexOf(r)}
            <tr class:sel={k === sel} onclick={() => { sel = k; send() }} ondblclick={() => editHolding(`JP:${r.h.code}`, r.h)}>
              <td class="l code">{codeOf(`JP:${r.h.code}`)}</td>
              <td class="l name">{nameOf(`JP:${r.h.code}`)}{#if r.h.lots?.length}<span class="tag" title={t('hold.lotsHint')}>{r.h.lots.length}</span>{/if}</td>
              <td>{fmt(r.h.quantity, 0)}</td>
              <td>{px(r.h.avgCost)}</td>
              <td>{px(app.metrics.get(`JP:${r.h.code}`)?.close)}</td>
              <td>{money(v.value).n}<span class="unit">{money(v.value).u}</span></td>
              <td class={cls(v.pnl)}>{money(v.pnl).n}<span class="unit">{money(v.pnl).u}</span></td>
              <td class={cls(v.pnlPct)}>{sgn(v.pnlPct, 1, '%')}</td>
              <td>{fmt(v.yoc, 2)}<span class="unit">%</span></td>
            </tr>
          {:else}
            <tr class="sub">
              <td class="l" colspan="5">{r.account}</td>
              <td>{money(r.value).n}<span class="unit">{money(r.value).u}</span></td>
              <td class={cls(r.pnl)}>{money(r.pnl).n}<span class="unit">{money(r.pnl).u}</span></td>
              <td class={cls(r.pnl)}>{sgn(r.cost > 0 ? (r.pnl / r.cost) * 100 : null, 1, '%')}</td>
              <td></td>
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>
  {/if}
</div>
<div class="note muted">{t('hold.note')}</div>

<style>
  .bar {
    display: flex;
    gap: var(--s-2);
    align-items: center;
    height: 28px;
    padding: 0 var(--s-2);
    border-bottom: 1px solid var(--line);
    flex: none;
    font-size: var(--fs-1);
  }
  .grow {
    flex: 1;
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
  .note {
    flex: none;
    font-size: var(--fs-1);
    padding: 4px var(--s-2);
    border-top: 1px solid var(--line);
  }
  b {
    color: var(--text);
    font-weight: 600;
  }
</style>
