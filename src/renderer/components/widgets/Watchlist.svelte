<script lang="ts">
// ウォッチリスト（§6.10, FR-FV2, §6.5.3）。↑↓ でめくると同じリンク色のチャートが追従する（FR-K2）。
// 列は Ctrl+Shift+C で選ぶ（lib/columns.ts）。リストの作成・名前の変更・複製・削除・並べ替え（FR-W1）。

import type { InstrumentId, Watchlist } from '@shared/types'
import { onMount, untrack } from 'svelte'
import { prefetch } from '../../lib/barsCache'
import { COLUMN_BY_ID, chooseColumns, DEFAULT_COLUMNS, fitColumns, resolveColumns, sortIds } from '../../lib/columns'
import { registerPane } from '../../lib/panes'
import { LinkFollow, SelectionFollow } from '../../lib/selection'
import { endSymbolDrag, startSymbolDrag } from '../../lib/symbolDrag'
import {
  app,
  bridge,
  confirmDialog,
  ensureMetrics,
  isFav,
  listName,
  nameOf,
  promptDialog,
  saveWatchlists,
  screenInputs,
  t,
  toast,
  toggleFav,
} from '../../stores/app.svelte'
import { linkSymbol, type PaneNode, patchState, setLinkSymbol } from '../../stores/layout.svelte'
import Icon from '../Icon.svelte'
import PaneHeader from '../PaneHeader.svelte'
import RowCells from './RowCells.svelte'

let { pane }: { pane: PaneNode } = $props()

const listId = $derived((pane.state.list as string) ?? 'favorites')
/**
 * 「保有」のタブ（FR-W10）: 保有の記録（証券会社の CSV・JSON から取り込んだもの）の銘柄を出す。ウォッチリストとしては
 * 保存せず、保有から毎回作る（銘柄の追加・外す・並べ替え・名前の変更・削除はできない。複製は普通のリストとしてできる）
 */
const HOLDINGS = 'holdings'
const holdingsList = $derived<Watchlist>({
  id: HOLDINGS,
  name: { ja: t('list.holdings'), en: t('list.holdings') },
  items: [...new Set(app.holdings.filter((h) => h.quantity > 0).map((h) => `JP:${h.code}`))].sort(),
})
/** タブの並び: 組み込みのリスト（★・◆）、保有、利用者のリスト */
const tabs = $derived.by(() => {
  const b = app.watchlists.filter((w) => w.builtin)
  return [...b, holdingsList, ...app.watchlists.filter((w) => !w.builtin)]
})
const isHoldings = $derived(listId === HOLDINGS)
const list = $derived(isHoldings ? holdingsList : (app.watchlists.find((w) => w.id === listId) ?? app.watchlists[0]))
/** 保有のタブでは中身を変えられないことを知らせる */
function holdingsLocked(): boolean {
  if (!isHoldings) return false
  toast(t('list.holdingsLocked'))
  return true
}
const starOnly = $derived(!!pane.state.starOnly)
const sort = $derived(pane.state.sort as { k: string; dir: 1 | -1 } | undefined)
let sel = $state(0)
/** 複数選択の起点（-1 は 1 行だけ）。Shift+↑↓ で広げ、Ctrl+A で全部（§6.5） */
let anchor = $state(-1)
const lo = $derived(anchor < 0 ? sel : Math.min(anchor, sel))
const hi = $derived(anchor < 0 ? sel : Math.max(anchor, sel))
const picked = () => rows.slice(lo, hi + 1)
let col = $state(3)
let scroller = $state<HTMLDivElement>()
let width = $state(600)
const allCols = $derived(resolveColumns(pane.state.cols as string[] | undefined, DEFAULT_COLUMNS.watchlist))
// 幅の狭いペインでは右の列から隠し、コードと銘柄名を残す（FR-V12。スクリーナーと同じ）
const cols = $derived(fitColumns(allCols, width))
// 狭くて列を隠したら、選んでいる列を見えている列に寄せる（見出しの枠と ← → の起点がずれないように）
$effect(() => {
  if (col > cols.length - 1) col = Math.max(1, cols.length - 1)
})

const rows = $derived.by(() => {
  void screenInputs() // 指標・保有の列で並べ替えているとき
  let items = list?.items ?? []
  if (starOnly) items = items.filter((id) => isFav(id))
  if (sort) items = sortIds(items, COLUMN_BY_ID.get(sort.k), sort.dir)
  return items
})
$effect(() => {
  ensureMetrics(rows)
  bridge.prioritize(rows.slice(0, 60))
})
// 一覧が変わったら、選んでいた銘柄の行に移る（指標の並べ替えで並びが入れ替わっても動かない）。消えたら同じ位置（短くなれば最後）
const follow = new SelectionFollow<InstrumentId>()
$effect(() => {
  const r = follow.sync(rows, sel, anchor)
  if (r.anchor !== anchor) anchor = r.anchor
  if (r.sel === sel) return
  sel = r.sel
  scrollSel()
})
const linkFollow = new LinkFollow<InstrumentId>()
/** 先頭の行から選び直す（並べ替え・並べ替えの解除・別の一覧・★のみ表示）。リンク先の行へも戻さない（リンク先が変わるまで） */
function restart() {
  sel = 0
  anchor = -1
  follow.reset()
  linkFollow.hold()
}
function toggleStarOnly() {
  patchState(pane, { starOnly: !starOnly })
  restart()
}

function send(i = sel) {
  const id = rows[i]
  if (id) setLinkSymbol(pane.link, id)
  prefetch([rows[i + 1], rows[i - 1]])
}
function scrollSel() {
  queueMicrotask(() => scroller?.querySelector('tr.sel')?.scrollIntoView({ block: 'nearest' }))
}
function setList(id: string) {
  patchState(pane, { list: id })
  restart()
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
  if (holdingsLocked()) return
  if (!list || list.builtin) {
    toast(t('list.builtinLocked'))
    return
  }
  const name = await promptDialog(t('list.rename'), listName(list))
  if (!name) return
  list.name = { ja: name, en: name }
  saveWatchlists()
}
async function deleteList() {
  if (holdingsLocked()) return
  if (!list || list.builtin) {
    toast(t('list.builtinLocked'))
    return
  }
  const r = await confirmDialog({ title: t('list.deleteConfirm', { name: listName(list) }), ok: t('act.deleteList'), danger: true })
  if (!r.ok) return
  app.watchlists = app.watchlists.filter((w) => w !== list)
  saveWatchlists()
  setList('favorites')
}
/** リストの複製（FR-W1）。組み込みのリストも複製はできる */
async function duplicateList() {
  if (!list) return
  const name = await promptDialog(t('list.duplicate'), t('scr.copyOf', { name: listName(list) }))
  if (!name) return
  const id = `u${Date.now().toString(36)}`
  app.watchlists.push({ id, name: { ja: name, en: name }, items: [...list.items] })
  saveWatchlists()
  setList(id)
}
/** リストの並べ替え（FR-W1）。組み込みのリストは先頭から動かさない */
function moveList(d: number) {
  if (holdingsLocked()) return
  if (!list || list.builtin) {
    toast(t('list.builtinLocked'))
    return
  }
  const ws = [...app.watchlists]
  const i = ws.indexOf(list)
  const j = i + d
  if (j < 0 || j >= ws.length || ws[j]!.builtin) return
  ;[ws[i], ws[j]] = [ws[j]!, ws[i]!]
  app.watchlists = ws
  saveWatchlists()
}
function removeSel() {
  if (holdingsLocked()) return
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
  if (holdingsLocked()) return
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
function sortBy(k: string) {
  const c = COLUMN_BY_ID.get(k)
  // コードの列（と並べ替えられない列）は並べ替えの解除（一覧の並びに戻す）。解除も先頭から
  patchState(pane, { sort: !c?.sort || k === 'code' ? undefined : { k, dir: sort?.k === k ? -sort.dir : -1 } })
  restart()
}
async function pickColumns() {
  const ids = await chooseColumns(allCols)
  if (ids) patchState(pane, { cols: ids })
}

onMount(() => {
  const ro = new ResizeObserver(() => (width = scroller?.clientWidth ?? 600))
  if (scroller) ro.observe(scroller)
  const off = registerPane(pane.id, {
    // 「いまの銘柄」はリンク先のチャートが表示している銘柄（銘柄ジャンプのあとに Ctrl+D が前の行に効かないように）
    current: () => (pane.link ? linkSymbol(pane.link) : null) ?? rows[sel],
    selected: () => picked(),
    columns: () => ({ ids: rows, cols: allCols, name: list ? listName(list) : 'watchlist' }),
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
      if (ctrl && e.shiftKey && !e.altKey && e.code === 'KeyC') {
        void pickColumns()
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
      if ((k === 'PageDown' || k === 'PageUp') && ctrl && e.shiftKey) {
        moveList(k === 'PageDown' ? 1 : -1)
        return true
      }
      if ((k === 'PageDown' || k === 'PageUp') && ctrl) {
        const i = tabs.findIndex((w) => w.id === listId)
        const next = tabs[(i + (k === 'PageDown' ? 1 : -1) + tabs.length) % tabs.length]!
        setList(next.id)
        return true
      }
      if ((k === 'ArrowUp' || k === 'ArrowDown') && e.altKey && !e.shiftKey && !ctrl) {
        moveRow(k === 'ArrowUp' ? -1 : 1)
        return true
      }
      if ((k === 'ArrowLeft' || k === 'ArrowRight') && !e.altKey && !ctrl) {
        col = Math.max(1, Math.min(cols.length - 1, col + (k === 'ArrowLeft' ? -1 : 1)))
        return true
      }
      if (e.code === 'KeyS' && !ctrl && !e.altKey) {
        sortBy(cols[Math.min(col, cols.length - 1)]!.id) // 狭くて列を隠したあとも、見えている列で並べ替える
        return true
      }
      if (e.code === 'KeyF' && ctrl && e.shiftKey) {
        toggleStarOnly()
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
    run(action) {
      if (action === 'duplicate') void duplicateList()
      else if (action === 'columns') void pickColumns()
      else return false
      return true
    },
  })
  return () => {
    ro.disconnect()
    off()
  }
})
// 銘柄ジャンプなどでリンク先の銘柄が変わったら、一覧にあればその行を選ぶ（並べ替え・別の一覧のあとは、リンク先が変わるまで先頭のまま）
$effect(() => {
  const id = pane.link ? linkSymbol(pane.link) : null
  const i = linkFollow.pick(id, rows)
  if (i >= 0)
    untrack(() => {
      if (sel !== i) sel = i
    })
})
</script>

<PaneHeader {pane}>
  <span class="dim">{list ? listName(list) : ''}</span>
</PaneHeader>
<div class="tabs" role="tablist">
  {#each tabs as w (w.id)}
    <button type="button" role="tab" class:hold={w.id === HOLDINGS} aria-selected={w.id === listId} onclick={() => setList(w.id)}>
      {listName(w)}<span class="count num">{w.items.length}</span>
    </button>
  {/each}
  <button type="button" class="add" title={t('list.new')} onclick={newList}>＋</button>
</div>
<div class="filter">
  <button type="button" class="toggle" class:on={starOnly} aria-label={t('list.starOnlyLabel')} title={`${t('list.starOnlyLabel')} (Ctrl+Shift+F)`} onclick={toggleStarOnly}><span class="box"></span>★</button>
  <span class="grow"></span>
  {#if anchor >= 0}<span class="num">{t('list.selectedN', { n: hi - lo + 1 })}</span>{/if}
  <span class="num">{t('list.items', { n: rows.length })}</span>
  <button type="button" class="ibtn" aria-label={t('cols.choose')} title={`${t('cols.choose')} (Ctrl+Shift+C)`} onclick={pickColumns}><Icon name="columns" /></button>
</div>
<div class="scroll body" bind:this={scroller}>
  {#if !rows.length}
    <div class="state">{list?.builtin === 'favorites' ? t('empty.favorites') : isHoldings ? t('list.holdingsEmpty') : t('list.empty')}</div>
  {:else}
    <table class="grid">
      <colgroup>
        {#each cols as c (c.id)}<col style:width={c.w ? `${c.w}px` : undefined} />{/each}
      </colgroup>
      <thead>
        <tr>
          {#each cols as c, i (c.id)}
            <th class:l={c.l} class:cur={i === col && app.focus === pane.id} onclick={() => sortBy(c.id)}>
              {c.label()}{sort?.k === c.id ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each rows as id, i (id)}
          <tr draggable="true" ondragstart={(e) => startSymbolDrag(e, id)} ondragend={endSymbolDrag} class:sel={i === sel} class:multi={anchor >= 0 && i >= lo && i <= hi} class:stale={app.metrics.get(id)?.stale} onclick={(e) => { if (e.shiftKey) { if (anchor < 0) anchor = sel } else anchor = -1; sel = i; send() }}>
            <RowCells {id} {cols} />
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
