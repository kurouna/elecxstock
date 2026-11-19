<script lang="ts">
// マーケット一覧（§6.16, FR-MB1〜MB5。設計: docs/design-market-board.md）。日本・海外の指数・為替・金利・商品・暗号資産の値。
// 見た目と操作はウォッチリストに揃える: 区分のタブ（Ctrl+PageDown/PageUp、G/Shift+G）、件数と列の選択の段、一覧の表（RowCells）、
// ↑↓ でめくると同じリンク色のチャートが追従する（FR-K2）。← → と S で並べ替え、Ctrl+Shift+C で列の選択。
// 行は登録表（src/shared/markets.ts）で決まり、利用者は足し引きしない。CSV の書き出しは持たない（columns() を返さない）

import { BOARD_GROUPS, type BoardGroup, refsIn } from '@shared/markets'
import type { InstrumentId } from '@shared/types'
import { onMount, untrack } from 'svelte'
import { prefetch } from '../../lib/barsCache'
import { COLUMN_BY_ID, chooseColumns, DEFAULT_COLUMNS, fitColumns, resolveColumns, sortIds } from '../../lib/columns'
import type { Key } from '../../lib/i18n'
import { registerPane } from '../../lib/panes'
import { LinkFollow, SelectionFollow } from '../../lib/selection'
import { endSymbolDrag, startSymbolDrag } from '../../lib/symbolDrag'
import { app, bridge, ensureMetrics, t } from '../../stores/app.svelte'
import { linkSymbol, type PaneNode, patchState, setLinkSymbol } from '../../stores/layout.svelte'
import Icon from '../Icon.svelte'
import PaneHeader from '../PaneHeader.svelte'
import RowCells from './RowCells.svelte'

let { pane }: { pane: PaneNode } = $props()

/** タブ: 全て（null）と区分 */
const TABS: (BoardGroup | null)[] = [null, ...BOARD_GROUPS]
const group = $derived((pane.state.group as BoardGroup | undefined) ?? null)
const tabLabel = (g: BoardGroup | null) => (g ? t(`board.g.${g}` as Key) : t('board.all'))
const sort = $derived(pane.state.sort as { k: string; dir: 1 | -1 } | undefined)
let sel = $state(0)
let col = $state(2)
let scroller = $state<HTMLDivElement>()
let width = $state(600)
// ★の列は出さない（★の対象ではない）。列の選択で外せない固定の列なので、ここで外す
// 終値は 5 桁 + 小数 2 桁（日経平均・NYダウ）が入る幅にする（FR-MB2）
const allCols = $derived(
  resolveColumns(pane.state.cols as string[] | undefined, DEFAULT_COLUMNS.board)
    .filter((c) => c.id !== 'star')
    .map((c) => (c.id === 'price.close' ? { ...c, w: 92 } : c)),
)
// 幅の狭いペインでは右の列から隠す（FR-V12。ウォッチリストと同じ）
const cols = $derived(fitColumns(allCols, width))
$effect(() => {
  if (col > cols.length - 1) col = Math.max(1, cols.length - 1)
})

const rows = $derived.by(() => {
  void app.metrics.size
  const items = refsIn(group).map((r) => r.id)
  return sort ? sortIds(items, COLUMN_BY_ID.get(sort.k), sort.dir) : items
})
$effect(() => {
  ensureMetrics(rows)
  bridge.prioritize(rows.slice(0, 60))
})
// 取得で値が変わって並びが入れ替わっても、選んだ行から動かない（CLAUDE.md「一覧の選択は中身で持つ」）
const follow = new SelectionFollow<InstrumentId>()
$effect(() => {
  const r = follow.sync(rows, sel)
  if (r.sel === sel) return
  sel = r.sel
  scrollSel()
})
// 並べ替えのあとは、リンク先が変わるまでリンク先の行へ戻さない（先頭から。lib/selection.ts の LinkFollow）
const linkFollow = new LinkFollow<InstrumentId>()

function send(i = sel) {
  const id = rows[i]
  if (id) setLinkSymbol(pane.link, id)
  prefetch([rows[i + 1], rows[i - 1]])
}
function scrollSel() {
  queueMicrotask(() => scroller?.querySelector('tr.sel')?.scrollIntoView({ block: 'nearest' }))
}
function setGroup(g: BoardGroup | null) {
  patchState(pane, { group: g ?? undefined })
  sel = 0
  follow.reset()
  queueMicrotask(() => send(0))
}
function stepGroup(d: number) {
  const i = TABS.indexOf(group)
  setGroup(TABS[(i + d + TABS.length) % TABS.length]!)
}
function sortBy(k: string) {
  const c = COLUMN_BY_ID.get(k)
  patchState(pane, { sort: !c?.sort || k === 'code' ? undefined : { k, dir: sort?.k === k ? -sort.dir : -1 } })
  sel = 0
  follow.reset()
  linkFollow.hold()
}
async function pickColumns() {
  const ids = await chooseColumns(allCols)
  if (ids) patchState(pane, { cols: ids })
}

onMount(() => {
  const ro = new ResizeObserver(() => (width = scroller?.clientWidth ?? 600))
  if (scroller) ro.observe(scroller)
  const off = registerPane(pane.id, {
    current: () => (pane.link ? linkSymbol(pane.link) : null) ?? rows[sel],
    selected: () => (rows[sel] ? [rows[sel]!] : []),
    key(e) {
      const k = e.key
      const ctrl = e.ctrlKey || e.metaKey
      const n = rows.length
      const page = Math.max(1, Math.floor((scroller?.clientHeight ?? 400) / 24) - 1)
      const mv = ({ ArrowDown: 1, ArrowUp: -1, PageDown: page, PageUp: -page } as Record<string, number>)[k]
      if (mv && !ctrl && !e.altKey && !e.shiftKey) {
        sel = Math.max(0, Math.min(n - 1, sel + mv))
        send()
        scrollSel()
        return true
      }
      if ((k === 'Home' || k === 'End') && !ctrl) {
        sel = k === 'Home' ? 0 : Math.max(0, n - 1)
        send()
        scrollSel()
        return true
      }
      if ((k === 'PageDown' || k === 'PageUp') && ctrl && !e.shiftKey) {
        stepGroup(k === 'PageDown' ? 1 : -1)
        return true
      }
      if (ctrl && e.shiftKey && !e.altKey && e.code === 'KeyC') {
        void pickColumns()
        return true
      }
      if (ctrl || e.altKey) return false
      if (e.code === 'KeyG') {
        stepGroup(e.shiftKey ? -1 : 1)
        return true
      }
      if (k === 'ArrowLeft' || k === 'ArrowRight') {
        col = Math.max(1, Math.min(cols.length - 1, col + (k === 'ArrowLeft' ? -1 : 1)))
        return true
      }
      if (e.code === 'KeyS' && !e.shiftKey) {
        sortBy(cols[Math.min(col, cols.length - 1)]!.id)
        return true
      }
      if (k === 'Enter') {
        send()
        return true
      }
      return false
    },
    run(action) {
      if (action !== 'columns') return false
      void pickColumns()
      return true
    },
  })
  return () => {
    ro.disconnect()
    off()
  }
})
// 銘柄ジャンプなどでリンク先の銘柄が変わったら、一覧にあればその行を選ぶ（ウォッチリストと同じ）
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
  <span class="dim">{tabLabel(group)}</span>
</PaneHeader>
<div class="tabs" role="tablist">
  {#each TABS as g (g ?? 'all')}
    <button type="button" role="tab" aria-selected={g === group} title={`${tabLabel(g)} (G / Ctrl+PageDown)`} onclick={() => setGroup(g)}>
      {tabLabel(g)}<span class="count num">{refsIn(g).length}</span>
    </button>
  {/each}
</div>
<div class="filter">
  <span class="note">{t('board.note')}</span>
  <span class="grow"></span>
  <span class="num">{t('board.items', { n: rows.length })}</span>
  <button type="button" class="ibtn" aria-label={t('cols.choose')} title={`${t('cols.choose')} (Ctrl+Shift+C)`} onclick={pickColumns}><Icon name="columns" /></button>
</div>
<div class="scroll body" bind:this={scroller}>
  {#if rows.every((id) => app.metrics.get(id)?.close == null)}
    <div class="state">{t('board.empty')}</div>
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
          <tr draggable="true" ondragstart={(e) => startSymbolDrag(e, id)} ondragend={endSymbolDrag} class:sel={i === sel} class:stale={app.metrics.get(id)?.stale} data-id={id} onclick={() => { sel = i; send() }}>
            <RowCells {id} {cols} refName />
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  /* タブと段はウォッチリスト（Watchlist.svelte）と同じ寸法・色 */
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
  .note {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
