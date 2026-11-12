<script lang="ts">
// ウォッチリスト（§6.10, FR-FV2, §6.5.3）。↑↓ でめくると同じリンク色のチャートが追従する（FR-K2）。

import type { MetricsRow } from '@shared/types'
import { onMount } from 'svelte'
import { prefetch } from '../../lib/barsCache'
import { cls, fmt, money, px, sgn } from '../../lib/format'
import type { Key } from '../../lib/i18n'
import { registerPane } from '../../lib/panes'
import {
  app,
  bridge,
  codeOf,
  confirmDialog,
  ensureMetrics,
  inst,
  isFav,
  listName,
  metric,
  nameOf,
  promptDialog,
  saveWatchlists,
  t,
  toast,
  toggleFav,
} from '../../stores/app.svelte'
import { linkSymbol, type PaneNode, patchState, setLinkSymbol } from '../../stores/layout.svelte'
import PaneHeader from '../PaneHeader.svelte'

let { pane }: { pane: PaneNode } = $props()
type ColKey = 'star' | 'code' | 'name' | 'close' | 'chgPct' | 'yieldTrailing' | 'turnover20'
const COLS: { k: ColKey; label: () => string; w?: number; l?: boolean }[] = [
  { k: 'star', label: () => '', w: 24, l: true },
  { k: 'code', label: () => t('col.code'), w: 52, l: true },
  { k: 'name', label: () => t('col.name'), l: true },
  { k: 'close', label: () => t('col.close'), w: 78 },
  { k: 'chgPct', label: () => t('col.chg'), w: 66 },
  { k: 'yieldTrailing', label: () => t('col.yield'), w: 60 },
  { k: 'turnover20', label: () => t('col.turnover'), w: 72 },
]

const listId = $derived((pane.state.list as string) ?? 'favorites')
const list = $derived(app.watchlists.find((w) => w.id === listId) ?? app.watchlists[0])
const starOnly = $derived(!!pane.state.starOnly)
const sort = $derived(pane.state.sort as { k: ColKey; dir: 1 | -1 } | undefined)
let sel = $state(0)
/** 複数選択の起点（-1 は 1 行だけ）。Shift+↑↓ で広げ、Ctrl+A で全部（§6.5） */
let anchor = $state(-1)
const lo = $derived(anchor < 0 ? sel : Math.min(anchor, sel))
const hi = $derived(anchor < 0 ? sel : Math.max(anchor, sel))
const picked = () => rows.slice(lo, hi + 1)
let col = $state(3)
let scroller = $state<HTMLDivElement>()
let width = $state(600)
// 幅の狭いペインでは売買代金の列を隠す（FR-V12）
const cols = $derived(width < 470 ? COLS.filter((c) => c.k !== 'turnover20') : COLS)

const rows = $derived.by(() => {
  void app.dataVersion
  let items = list?.items ?? []
  if (starOnly) items = items.filter((id) => isFav(id))
  if (sort && sort.k !== 'star' && sort.k !== 'name' && sort.k !== 'code') {
    const k = sort.k as keyof MetricsRow
    items = [...items].sort((a, b) => (((metric(a)?.[k] as number) ?? -1e18) - ((metric(b)?.[k] as number) ?? -1e18)) * sort.dir)
  }
  return items
})
$effect(() => {
  ensureMetrics(rows)
  bridge.prioritize(rows.slice(0, 60))
})
$effect(() => {
  if (sel >= rows.length) sel = Math.max(0, rows.length - 1)
})

function send(i = sel) {
  const id = rows[i]
  if (id) setLinkSymbol(pane.link || 1, id)
  prefetch([rows[i + 1], rows[i - 1]])
}
function scrollSel() {
  queueMicrotask(() => scroller?.querySelector('tr.sel')?.scrollIntoView({ block: 'nearest' }))
}
function setList(id: string) {
  patchState(pane, { list: id })
  sel = 0
  send(0)
}
async function newList() {
  const name = await promptDialog(t('list.newName'), '')
  if (!name) return
  const id = `u${Date.now().toString(36)}`
  app.watchlists.push({ id, name: { ja: name, en: name }, items: [] })
  saveWatchlists()
  setList(id)
}
async function renameList() {
  if (!list || list.builtin) return toast(t('list.builtinLocked'))
  const name = await promptDialog(t('list.rename'), listName(list))
  if (!name) return
  list.name = { ja: name, en: name }
  saveWatchlists()
}
async function deleteList() {
  if (!list || list.builtin) return toast(t('list.builtinLocked'))
  const r = await confirmDialog({ title: t('list.deleteConfirm', { name: listName(list) }), ok: t('act.deleteList'), danger: true })
  if (!r.ok) return
  app.watchlists = app.watchlists.filter((w) => w !== list)
  saveWatchlists()
  setList('favorites')
}
function removeSel() {
  const ids = picked()
  if (!ids.length || !list) return
  if (list.builtin === 'favorites' && ids.length === 1) return toggleFav(ids[0]!)
  const drop = new Set(ids)
  list.items = list.items.filter((x) => !drop.has(x))
  saveWatchlists()
  anchor = -1
  toast(ids.length === 1 ? t('list.removed', { name: nameOf(ids[0]!) }) : t('list.removedN', { n: ids.length }))
}
function moveRow(d: number) {
  if (!list || sort || starOnly) return
  const i = sel
  const j = i + d
  if (j < 0 || j >= list.items.length) return
  const items = [...list.items]
  ;[items[i], items[j]] = [items[j]!, items[i]!]
  list.items = items
  sel = j
  saveWatchlists()
  scrollSel()
}
function sortBy(k: ColKey) {
  if (k === 'star' || k === 'code' || k === 'name') return patchState(pane, { sort: undefined })
  patchState(pane, { sort: { k, dir: sort?.k === k ? -sort.dir : -1 } })
  sel = 0
}

onMount(() => {
  const ro = new ResizeObserver(() => (width = scroller?.clientWidth ?? 600))
  if (scroller) ro.observe(scroller)
  const off = registerPane(pane.id, {
    current: () => rows[sel] ?? linkSymbol(pane.link),
    selected: () => picked(),
    key(e) {
      const k = e.key
      const ctrl = e.ctrlKey || e.metaKey
      const n = rows.length
      const page = Math.max(1, Math.floor((scroller?.clientHeight ?? 400) / 24) - 1)
      const mv = ({ ArrowDown: 1, ArrowUp: -1, PageDown: page, PageUp: -page } as Record<string, number>)[k]
      if (mv && !ctrl && !e.altKey) {
        if (e.shiftKey) {
          if (anchor < 0) anchor = sel
        } else anchor = -1
        sel = Math.max(0, Math.min(n - 1, sel + mv))
        send()
        scrollSel()
        return true
      }
      if (ctrl && !e.shiftKey && !e.altKey && e.code === 'KeyA') {
        anchor = 0
        sel = Math.max(0, n - 1)
        return true
      }
      if (k === 'Escape' && anchor >= 0) {
        anchor = -1
        return true
      }
      if ((k === 'Home' || k === 'End') && !ctrl) {
        anchor = -1
        sel = k === 'Home' ? 0 : Math.max(0, n - 1)
        send()
        scrollSel()
        return true
      }
      if ((k === 'PageDown' || k === 'PageUp') && ctrl) {
        const i = app.watchlists.findIndex((w) => w.id === listId)
        const next = app.watchlists[(i + (k === 'PageDown' ? 1 : -1) + app.watchlists.length) % app.watchlists.length]!
        setList(next.id)
        return true
      }
      if ((k === 'ArrowUp' || k === 'ArrowDown') && e.altKey && !e.shiftKey && !ctrl) {
        moveRow(k === 'ArrowUp' ? -1 : 1)
        return true
      }
      if ((k === 'ArrowLeft' || k === 'ArrowRight') && !e.altKey && !ctrl) {
        col = Math.max(1, Math.min(COLS.length - 1, col + (k === 'ArrowLeft' ? -1 : 1)))
        return true
      }
      if (e.code === 'KeyS' && !ctrl && !e.altKey) {
        sortBy(COLS[col]!.k)
        return true
      }
      if (e.code === 'KeyF' && ctrl && e.shiftKey) {
        patchState(pane, { starOnly: !starOnly })
        sel = 0
        return true
      }
      if (k === 'Enter') {
        send()
        return true
      }
      if (k === 'Delete' && e.shiftKey) {
        void deleteList()
        return true
      }
      if (k === 'Delete') {
        removeSel()
        return true
      }
      if (k === 'F2') {
        void renameList()
        return true
      }
      return false
    },
  })
  return () => {
    ro.disconnect()
    off()
  }
})
</script>

<PaneHeader {pane}>
  <span class="dim">{list ? listName(list) : ''}</span>
</PaneHeader>
<div class="tabs" role="tablist">
  {#each app.watchlists as w (w.id)}
    <button type="button" role="tab" aria-selected={w.id === listId} onclick={() => setList(w.id)}>
      {listName(w)}<span class="count num">{w.items.length}</span>
    </button>
  {/each}
  <button type="button" class="add" title={t('list.new')} onclick={newList}>＋</button>
</div>
<div class="filter">
  <button type="button" class="toggle" class:on={starOnly} onclick={() => patchState(pane, { starOnly: !starOnly })}><span class="box"></span>{t('list.starOnly')}</button>
  <kbd>Ctrl+Shift+F</kbd>
  <span class="grow"></span>
  {#if anchor >= 0}<span class="num">{t('list.selectedN', { n: hi - lo + 1 })}</span>{/if}
  <span class="num">{t('list.items', { n: rows.length })}</span>
</div>
<div class="scroll body" bind:this={scroller}>
  {#if !rows.length}
    <div class="state">{list?.builtin === 'favorites' ? t('empty.favorites') : t('list.empty')}</div>
  {:else}
    <table class="grid">
      <colgroup>
        {#each cols as c (c.k)}<col style:width={c.w ? `${c.w}px` : undefined} />{/each}
      </colgroup>
      <thead>
        <tr>
          {#each cols as c, i (c.k)}
            <th class:l={c.l} class:cur={i === col && app.focus === pane.id} onclick={() => sortBy(c.k)}>
              {c.label()}{sort?.k === c.k ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each rows as id, i (id)}
          {@const m = metric(id)}
          {@const ins = inst(id)}
          {@const tv = money(m?.turnover20)}
          <tr class:sel={i === sel} class:multi={anchor >= 0 && i >= lo && i <= hi} class:stale={m?.stale} onclick={(e) => { if (e.shiftKey) { if (anchor < 0) anchor = sel } else anchor = -1; sel = i; send() }}>
            <td class="l"><button type="button" class="star" class:on={isFav(id)} onclick={(e) => { e.stopPropagation(); toggleFav(id) }} aria-label="favorite">★</button></td>
            <td class="l code">{codeOf(id)}</td>
            <td class="l name">{nameOf(id)}{#if ins && ins.kind !== 'stock'}<span class="tag">{t(`mkt.${ins.market}` as Key)}</span>{/if}</td>
            <td>{px(m?.close)}</td>
            <td class={cls(m?.chgPct)}>{sgn(m?.chgPct, 2, '%')}</td>
            <td>{m?.yieldTrailing != null ? fmt(m.yieldTrailing) : '—'}<span class="unit">%</span></td>
            {#if cols.length === COLS.length}<td>{tv.n}<span class="unit">{tv.u}</span></td>{/if}
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .tabs {
    display: flex;
    border-bottom: 1px solid var(--line);
    padding: 0 4px;
    flex: none;
    overflow-x: auto;
    overflow-y: hidden;
  }
  .tabs::-webkit-scrollbar {
    height: 0;
  }
  .tabs button {
    background: none;
    border: 0;
    border-bottom: 2px solid transparent;
    padding: 0 10px;
    height: 26px;
    color: var(--text-3);
    cursor: pointer;
    white-space: nowrap;
  }
  .tabs button[aria-selected='true'] {
    color: var(--text);
    border-bottom-color: var(--text-2);
  }
  .count {
    color: var(--text-3);
    margin-left: 4px;
    font-size: var(--fs-1);
  }
  .add {
    margin-left: auto;
  }
  .filter {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    height: 26px;
    padding: 0 var(--s-2);
    border-bottom: 1px solid var(--line);
    font-size: var(--fs-1);
    color: var(--text-3);
    flex: none;
  }
  .grow {
    flex: 1;
  }
  .body {
    flex: 1;
    position: relative;
  }
  th {
    cursor: pointer;
  }
</style>
