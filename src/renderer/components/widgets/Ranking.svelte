<script lang="ts">
// ranking（§6.3）: 値上がり率・売買代金・利回りなどの順位。metrics 表から作る（FR-S10）。
// S で指標、Shift+S で上位・下位、G で市場、Ctrl+Shift+F で★のみ、↑↓ でめくる（同じリンク色のチャートが追従）。
import type { Condition, InstrumentId } from '@shared/types'
import { onMount } from 'svelte'
import { prefetch } from '../../lib/barsCache'
import { COLUMN_BY_ID, type ListCol, resolveColumns, sortIds } from '../../lib/columns'
import type { Key } from '../../lib/i18n'
import { registerPane } from '../../lib/panes'
import { endSymbolDrag, startSymbolDrag } from '../../lib/symbolDrag'
import { app, bridge, isFav, t } from '../../stores/app.svelte'
import { type PaneNode, patchState, setLinkSymbol } from '../../stores/layout.svelte'
import PaneHeader from '../PaneHeader.svelte'
import RowCells from './RowCells.svelte'

let { pane }: { pane: PaneNode } = $props()
const KEYS = ['price.chgPct', 'ret.1m', 'ret.1y', 'liq.turnover20', 'income.yield', 'tech.volRatio', 'tech.fromHi52', 'tech.rsi14'] as const
const MARKETS = [['P', 'R'], ['P'], ['R'], ['P', 'S', 'G'], ['P', 'S', 'G', 'R', 'E']]
const key = $derived(((pane.state.key as string) ?? 'price.chgPct') as (typeof KEYS)[number])
const dir = $derived(((pane.state.dir as 1 | -1) ?? -1) as 1 | -1)
const mk = $derived((pane.state.mk as number) ?? 0)
const starOnly = $derived(!!pane.state.starOnly)
const N = 50
let ids = $state<InstrumentId[]>([])
let sel = $state(0)
let scroller = $state<HTMLDivElement>()

const cols = $derived<ListCol[]>(
  [...resolveColumns([], []), COLUMN_BY_ID.get('price.close'), COLUMN_BY_ID.get(key)].filter(
    (c, i, a): c is ListCol => !!c && a.indexOf(c) === i,
  ),
)
async function run() {
  const conditions: Condition[] = [{ field: 'attr.market', op: 'in', value: MARKETS[mk] ?? ['P', 'R'] }]
  const favs = app.watchlists.find((w) => w.builtin === 'favorites')?.items ?? []
  const r = await bridge.call('screener.run', { conditions, favorites: favs, watchlists: {} })
  for (const row of r.rows) app.metrics.set(row.id, row)
  ids = r.ids
}
$effect(() => {
  void mk
  void app.dataVersion
  void run()
})
const rows = $derived.by(() => {
  void app.metrics.size
  const base = starOnly ? ids.filter((x) => isFav(x)) : ids
  // 売買代金の少ない銘柄の値上がり率は荒れるので、騰落率の順位は売買代金 1 億円以上に絞る
  const liquid =
    key.startsWith('price.chg') || key.startsWith('ret.') ? base.filter((x) => (app.metrics.get(x)?.turnover20 ?? 0) >= 1e8) : base
  return sortIds(liquid, COLUMN_BY_ID.get(key), dir).slice(0, N)
})
$effect(() => {
  if (sel >= rows.length) sel = Math.max(0, rows.length - 1)
})
function send() {
  const id = rows[sel]
  if (id) setLinkSymbol(pane.link || 1, id)
  prefetch([rows[sel + 1], rows[sel - 1]])
}

onMount(() =>
  registerPane(pane.id, {
    current: () => rows[sel],
    selected: () => (rows[sel] ? [rows[sel]!] : []),
    columns: () => ({ ids: rows, cols, name: 'ranking' }),
    key(e) {
      const k = e.key
      const ctrl = e.ctrlKey || e.metaKey
      if (ctrl && e.shiftKey && e.code === 'KeyF') {
        patchState(pane, { starOnly: !starOnly })
        return true
      }
      if (ctrl || e.altKey) return false
      if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Home' || k === 'End' || k === 'PageDown' || k === 'PageUp') {
        const d = { ArrowDown: 1, ArrowUp: -1, PageDown: 10, PageUp: -10 }[k as string] ?? 0
        sel = k === 'Home' ? 0 : k === 'End' ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, sel + d))
        send()
        queueMicrotask(() => scroller?.querySelector('tr.sel')?.scrollIntoView({ block: 'nearest' }))
        return true
      }
      if (e.code === 'KeyS') {
        if (e.shiftKey) patchState(pane, { dir: -dir })
        else patchState(pane, { key: KEYS[(KEYS.indexOf(key) + 1) % KEYS.length] })
        sel = 0
        return true
      }
      if (e.code === 'KeyG') {
        patchState(pane, { mk: (mk + (e.shiftKey ? MARKETS.length - 1 : 1)) % MARKETS.length })
        sel = 0
        return true
      }
      if (k === 'Enter') {
        send()
        return true
      }
      return false
    },
  }),
)
const mkLabel = (i: number) => (MARKETS[i] ?? []).map((m) => t(`mkt.${m}` as Key)).join('+')
</script>

<PaneHeader {pane}>
  <span class="dim">{COLUMN_BY_ID.get(key)?.label()} · {dir < 0 ? t('rank.top') : t('rank.bottom')}</span>
</PaneHeader>
<div class="bar">
  <select title={`${t('rank.metric')} (S)`} aria-label={t('rank.metric')} value={key} onchange={(e) => patchState(pane, { key: (e.currentTarget as HTMLSelectElement).value })}>
    {#each KEYS as k (k)}<option value={k}>{COLUMN_BY_ID.get(k)?.label()}</option>{/each}
  </select>
  <button type="button" class="chip" title={`${t('rank.dir')} (Shift+S)`} onclick={() => patchState(pane, { dir: -dir })}>{dir < 0 ? `▼ ${t('rank.top')}` : `▲ ${t('rank.bottom')}`}</button>
  <button type="button" class="chip" title={`${t('rank.market')} (G / Shift+G)`} onclick={() => patchState(pane, { mk: (mk + 1) % MARKETS.length })}>{mkLabel(mk)}</button>
  <span class="grow"></span>
  <button type="button" class="toggle" class:on={starOnly} aria-label={t('list.starOnlyLabel')} title={`${t('list.starOnlyLabel')} (Ctrl+Shift+F)`} onclick={() => patchState(pane, { starOnly: !starOnly })}><span class="box"></span>★</button>
</div>
<div class="scroll body" bind:this={scroller}>
  {#if !rows.length}
    <div class="state">{t('rank.empty')}</div>
  {:else}
    <table class="grid">
      <colgroup><col style:width="36px" />{#each cols as c (c.id)}<col style:width={c.w ? `${c.w}px` : undefined} />{/each}</colgroup>
      <thead><tr><th>#</th>{#each cols as c (c.id)}<th class:l={c.l}>{c.label()}</th>{/each}</tr></thead>
      <tbody>
        {#each rows as id, i (id)}
          <tr draggable="true" ondragstart={(e) => startSymbolDrag(e, id)} ondragend={endSymbolDrag} class:sel={i === sel} onclick={() => { sel = i; send() }}>
            <td class="dim rk">{i + 1}</td>
            <RowCells {id} cols={cols} />
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

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
  select {
    background: var(--bg);
    border: 1px solid var(--line-strong);
    height: 20px;
    border-radius: var(--radius);
  }
  .rk {
    text-overflow: clip;
  }
  .grow {
    flex: 1;
  }
  .body {
    flex: 1;
    min-height: 0;
    position: relative;
  }
</style>
