<script lang="ts">
// 騰落（§6.17, FR-BR1〜BR5。設計: docs/design-breadth.md）。タブで「市場」と「業種別」を切り替える。
// 見た目と操作はウォッチリスト・マーケット一覧に揃える: タブ（Ctrl+PageDown/PageUp、G/Shift+G）、段（基準日・行数・列の選択）、
// 一覧の表、↑↓ で選ぶ、← → と S で並べ替え、Ctrl+Shift+C で列の選択。Enter で市場・業種の中（銘柄の一覧）へ入り、Esc・Backspace で戻る。
// 集計は src/shared/breadth.ts、表の列は lib/breadthColumns.ts。中の銘柄の一覧はウォッチリストと同じ列（lib/columns.ts）と RowCells

import { type BreadthIn, breadth } from '@shared/breadth'
import type { InstrumentId } from '@shared/types'
import { onMount, untrack } from 'svelte'
import { prefetch } from '../../lib/barsCache'
import {
  type BreadthCol,
  type BreadthTab,
  chooseBreadthColumns,
  DEFAULT_BREADTH_SORT,
  resolveBreadthColumns,
  sortBreadth,
} from '../../lib/breadthColumns'
import { COLUMN_BY_ID, chooseColumns, DEFAULT_COLUMNS, fitColumns, type ListCol, resolveColumns, sortIds } from '../../lib/columns'
import { date } from '../../lib/format'
import type { Key } from '../../lib/i18n'
import { latest } from '../../lib/latest'
import { registerPane } from '../../lib/panes'
import { LinkFollow, SelectionFollow } from '../../lib/selection'
import { endSymbolDrag, startSymbolDrag } from '../../lib/symbolDrag'
import { app, bridge, inst, t } from '../../stores/app.svelte'
import { linkSymbol, type PaneNode, patchState, setLinkSymbol } from '../../stores/layout.svelte'
import Icon from '../Icon.svelte'
import PaneHeader from '../PaneHeader.svelte'
import RowCells from './RowCells.svelte'

let { pane }: { pane: PaneNode } = $props()

type Sort = { k: string; dir: 1 | -1 } | undefined
const TABS: BreadthTab[] = ['market', 'sector']
const tab = $derived(((pane.state.tab as BreadthTab | undefined) ?? 'market') as BreadthTab)
/** 中に入っている市場・業種（null は表） */
const drill = $derived((pane.state.drill as string | null | undefined) ?? null)
const S = $derived(pane.state as Record<string, unknown>)
// 並べ替えと列は表ごと（市場・業種別・中の銘柄の一覧）に持つ
const sortKey = $derived(drill ? 'sortList' : tab === 'market' ? 'sortMarket' : 'sortSector')
const sort = $derived((sortKey in S ? S[sortKey] : drill ? undefined : DEFAULT_BREADTH_SORT[tab]) as Sort)
const tableCols = $derived(resolveBreadthColumns(tab, S[tab === 'market' ? 'colsMarket' : 'colsSector'] as string[] | undefined))
const listCols = $derived(resolveColumns(S.colsList as string[] | undefined, DEFAULT_COLUMNS.breadth))

let ids = $state<InstrumentId[]>([])
let sel = $state(0)
let col = $state(1)
let scroller = $state<HTMLDivElement>()
let width = $state(600)

const fresh = latest()
async function run() {
  const ok = fresh()
  const r = await bridge.call('screener.run', {
    conditions: [{ field: 'attr.market', op: 'in', value: ['P', 'R'] }],
    favorites: [],
    watchlists: {},
  })
  if (!ok()) return // 取得が続いて呼び直したとき、古い応答で上書きしない
  for (const row of r.rows) app.metrics.set(row.id, row)
  ids = r.ids
}
$effect(() => {
  void app.dataVersion
  void run()
})

/** 市場（プライムの株式・J-REIT）と業種（プライムの株式の 33 業種）に分ける */
const inputs = $derived.by(() => {
  void app.metrics.size
  const market: BreadthIn[] = []
  const sector: BreadthIn[] = []
  for (const id of ids) {
    const i = inst(id)
    const m = app.metrics.get(id)
    if (!i || !m) continue
    if (i.market === 'P' && i.kind === 'stock') {
      market.push({ id, group: 'P', m })
      if (i.sectorJa) sector.push({ id, group: i.sectorJa, m })
    } else if (i.market === 'R') market.push({ id, group: 'R', m })
  }
  return { market, sector }
})
const marketRows = $derived(breadth(inputs.market).sort((a, b) => (a.key === 'P' ? -1 : b.key === 'P' ? 1 : 0)))
const sectorRows = $derived(breadth(inputs.sector))
const baseRows = $derived(tab === 'market' ? marketRows : sectorRows)
/** 業種名は言語に合わせる（英語名は銘柄の表から） */
const sectorEn = $derived.by(() => {
  const m = new Map<string, string>()
  for (const id of ids) {
    const i = inst(id)
    if (i?.sectorJa && i.sectorEn && !m.has(i.sectorJa)) m.set(i.sectorJa, i.sectorEn)
  }
  return m
})
const name = (key: string) =>
  key === 'P' || key === 'R' ? t(`br.mkt.${key}` as Key) : app.settings.lang === 'en' ? sectorEn.get(key) || key : key

const tableRows = $derived(
  sortBreadth(
    baseRows,
    tableCols.find((c) => c.id === sort?.k),
    sort?.dir ?? 1,
  ),
)
const drillRow = $derived(drill ? baseRows.find((r) => r.key === drill) : undefined)
const listRows = $derived.by(() => {
  void app.metrics.size
  const xs = drillRow?.ids ?? []
  return sort ? sortIds(xs, COLUMN_BY_ID.get(sort.k), sort.dir) : sortIds(xs, COLUMN_BY_ID.get('price.chgPct'), -1)
})
// 幅の狭いペインでは右の列から隠す（FR-V12。ウォッチリストと同じ）
const shownList = $derived(fitColumns(listCols, width))
const shownTable = $derived(fitColumns(tableCols as unknown as ListCol[], width) as unknown as BreadthCol[])
const ncols = $derived(drill ? shownList.length : shownTable.length)
$effect(() => {
  if (col > ncols - 1) col = Math.max(1, ncols - 1)
})
/** 選択は中身（市場の記号・業種名・銘柄）で持つ */
const keys = $derived<string[]>(drill ? listRows : tableRows.map((r) => r.key))
const follow = new SelectionFollow<string>()
$effect(() => {
  const r = follow.sync(keys, sel)
  if (r.sel === sel) return
  sel = r.sel
  scrollSel()
})
// 並べ替えのあとは、リンク先が変わるまでリンク先の行へ戻さない（先頭から。lib/selection.ts の LinkFollow）
const linkFollow = new LinkFollow<InstrumentId>()
$effect(() => {
  if (drill) ensure(listRows)
})
function ensure(xs: InstrumentId[]) {
  bridge.prioritize(xs.slice(0, 60))
}

function scrollSel() {
  queueMicrotask(() => scroller?.querySelector('tr.sel')?.scrollIntoView({ block: 'nearest' }))
}
function send(i = sel) {
  if (!drill) return
  const id = listRows[i]
  if (id) setLinkSymbol(pane.link, id)
  prefetch([listRows[i + 1], listRows[i - 1]])
}
function setTab(x: BreadthTab) {
  patchState(pane, { tab: x, drill: null })
  sel = 0
  follow.reset()
}
function stepTab(d: number) {
  setTab(TABS[(TABS.indexOf(tab) + d + TABS.length) % TABS.length]!)
}
function enter(i = sel) {
  if (drill) return send(i)
  const r = tableRows[i]
  if (!r) return
  patchState(pane, { drill: r.key })
  sel = 0
  follow.reset()
  queueMicrotask(() => send(0))
}
function back(): boolean {
  if (!drill) return false
  const k = drill
  patchState(pane, { drill: null })
  follow.reset()
  // 戻った表（業種の並びは中に入っても変わらない）で、入った行をすぐ選ぶ（一度ずれた位置を経ない）。スクロールは描いたあと
  sel = Math.max(
    0,
    tableRows.findIndex((r) => r.key === k),
  )
  scrollSel()
  return true
}
function sortBy(k: string) {
  const ok = drill ? !!COLUMN_BY_ID.get(k)?.sort && k !== 'code' : k !== 'name'
  patchState(pane, { [sortKey]: ok ? { k, dir: sort?.k === k ? -sort.dir : -1 } : undefined })
  sel = 0
  follow.reset()
  linkFollow.hold()
}
async function pickColumns() {
  if (drill) {
    const r = await chooseColumns(listCols)
    if (r) patchState(pane, { colsList: r })
    return
  }
  const r = await chooseBreadthColumns(tab, tableCols)
  if (r) patchState(pane, { [tab === 'market' ? 'colsMarket' : 'colsSector']: r })
}
const colIds = () => (drill ? shownList.map((c) => c.id) : shownTable.map((c) => c.id))

onMount(() => {
  const ro = new ResizeObserver(() => (width = scroller?.clientWidth ?? 600))
  if (scroller) ro.observe(scroller)
  const off = registerPane(pane.id, {
    current: () => (drill ? ((pane.link ? linkSymbol(pane.link) : null) ?? listRows[sel]) : undefined),
    selected: () => (drill ? (listRows[sel] ? [listRows[sel]!] : []) : (tableRows[sel]?.ids ?? [])),
    // 中の銘柄の一覧のときだけ、一覧の中身を出す（CSV の書き出し・一覧の取り直し）
    columns: () => (drill ? { ids: listRows, cols: listCols, name: `${t('widget.breadth')} ${name(drill)}` } : null),
    key(e) {
      const k = e.key
      const ctrl = e.ctrlKey || e.metaKey
      const n = keys.length
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
        stepTab(k === 'PageDown' ? 1 : -1)
        return true
      }
      if (ctrl && e.shiftKey && !e.altKey && e.code === 'KeyC') {
        void pickColumns()
        return true
      }
      if (ctrl || e.altKey) return false
      if (e.code === 'KeyG') {
        stepTab(e.shiftKey ? -1 : 1)
        return true
      }
      if (k === 'ArrowLeft' || k === 'ArrowRight') {
        col = Math.max(1, Math.min(ncols - 1, col + (k === 'ArrowLeft' ? -1 : 1)))
        return true
      }
      if (e.code === 'KeyS' && !e.shiftKey) {
        const id = colIds()[Math.min(col, ncols - 1)]
        if (id) sortBy(id)
        return true
      }
      if (k === 'Enter') {
        enter()
        return true
      }
      if (k === 'Escape' || k === 'Backspace') return back()
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
// 銘柄ジャンプなどでリンク先の銘柄が変わったら、中の一覧にあればその行を選ぶ（ウォッチリストと同じ）
$effect(() => {
  const id = drill && pane.link ? linkSymbol(pane.link) : null
  const i = linkFollow.pick(id, listRows)
  if (i >= 0)
    untrack(() => {
      if (sel !== i) sel = i
    })
})
const asOf = $derived(drillRow?.asOf ?? baseRows.reduce<string | null>((a, r) => (r.asOf && (!a || r.asOf > a) ? r.asOf : a), null))
const tabCount = (x: BreadthTab) => (x === 'market' ? marketRows.length : sectorRows.length)
const sortMark = (id: string) => (sort?.k === id ? (sort.dir > 0 ? ' ▲' : ' ▼') : '')
</script>

<PaneHeader {pane}>
  <span class="dim">{t(`br.tab.${tab}` as Key)}{drill ? ` › ${name(drill)}` : ''}</span>
</PaneHeader>
<div class="tabs" role="tablist">
  {#each TABS as x (x)}
    <button type="button" role="tab" aria-selected={x === tab} title={`${t(`br.tab.${x}` as Key)} (G / Ctrl+PageDown)`} onclick={() => setTab(x)}>
      {t(`br.tab.${x}` as Key)}<span class="count num">{tabCount(x)}</span>
    </button>
  {/each}
</div>
<div class="filter">
  {#if drill}<button type="button" class="chip" title={t('br.backHint')} onclick={back}>← {name(drill)}</button>{/if}
  {#if asOf}<span class="num">{t('br.asOf', { d: date(asOf) })}</span>{/if}
  <span class="grow"></span>
  <span class="num">{drill ? t('list.items', { n: listRows.length }) : t('br.rows', { n: tableRows.length })}</span>
  <button type="button" class="ibtn" aria-label={t('cols.choose')} title={`${t('cols.choose')} (Ctrl+Shift+C)`} onclick={pickColumns}><Icon name="columns" /></button>
</div>
<div class="scroll body" bind:this={scroller}>
  {#if !keys.length}
    <div class="state">{t('br.empty')}</div>
  {:else if drill}
    <table class="grid">
      <colgroup>{#each shownList as c (c.id)}<col style:width={c.w ? `${c.w}px` : undefined} />{/each}</colgroup>
      <thead>
        <tr>{#each shownList as c, i (c.id)}<th class:l={c.l} class:cur={i === col && app.focus === pane.id} onclick={() => sortBy(c.id)}>{c.label()}{sortMark(c.id)}</th>{/each}</tr>
      </thead>
      <tbody>
        {#each listRows as id, i (id)}
          <tr draggable="true" ondragstart={(e) => startSymbolDrag(e, id)} ondragend={endSymbolDrag} class:sel={i === sel} class:stale={app.metrics.get(id)?.stale} data-id={id} onclick={() => { sel = i; send() }}>
            <RowCells {id} cols={shownList} />
          </tr>
        {/each}
      </tbody>
    </table>
  {:else}
    <table class="grid">
      <colgroup>{#each shownTable as c (c.id)}<col style:width={c.w ? `${c.w}px` : undefined} />{/each}</colgroup>
      <thead>
        <tr>{#each shownTable as c, i (c.id)}<th class:l={c.l} class:cur={i === col && app.focus === pane.id} onclick={() => sortBy(c.id)}>{c.label()}{sortMark(c.id)}</th>{/each}</tr>
      </thead>
      <tbody>
        {#each tableRows as r, i (r.key)}
          <tr class:sel={i === sel} data-key={r.key} ondblclick={() => enter(i)} onclick={() => (sel = i)}>
            {#each shownTable as c (c.id)}
              {@const v = c.cell(r, name)}
              <td class:l={c.l} class={`${c.id === 'name' ? 'name' : ''} ${v.c ?? ''}`}>{v.t}{#if v.u}<span class="unit">{v.u}</span>{/if}</td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  /* タブと段はウォッチリスト（Watchlist.svelte）・マーケット一覧と同じ寸法・色 */
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
