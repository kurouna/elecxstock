<script lang="ts">
// 配当カレンダー（P2 の先取り）: 権利確定月ごとに、すべてのウォッチリストの銘柄を並べる。選んだ銘柄はリンクグループへ送る。

import type { InstrumentId } from '@shared/types'
import { onMount } from 'svelte'
import { fmt } from '../../lib/format'
import { registerPane } from '../../lib/panes'
import { app, ensureMetrics, isFav, metric, nameOf, t } from '../../stores/app.svelte'
import { type PaneNode, setLinkSymbol } from '../../stores/layout.svelte'
import PaneHeader from '../PaneHeader.svelte'

let { pane }: { pane: PaneNode } = $props()
let mi = $state(new Date().getMonth())
let ri = $state(0)
let host = $state<HTMLElement>()
// 選んだ行が月の枠の外に出たら見える位置まで動かす（月の銘柄は全部並べ、枠の中でスクロールする）
$effect(() => {
  void mi
  void ri
  host?.querySelector('.row.sel')?.scrollIntoView({ block: 'nearest' })
})
const ids = $derived([...new Set(app.watchlists.flatMap((w) => w.items))])
$effect(() => ensureMetrics(ids))
const months = $derived(
  Array.from({ length: 12 }, (_, i) =>
    ids
      .filter((id) => metric(id)?.recordMonths.includes(i + 1))
      .sort((a, b) => (metric(b)?.yieldTrailing ?? 0) - (metric(a)?.yieldTrailing ?? 0)),
  ),
)
const label = (m: number) => (app.settings.lang === 'ja' ? `${m}月` : new Date(2026, m - 1, 1).toLocaleString('en', { month: 'short' }))
function send(id: InstrumentId | undefined) {
  if (id) setLinkSymbol(pane.link, id)
}
onMount(() =>
  registerPane(pane.id, {
    current: () => months[mi]?.[ri],
    key(e) {
      if (e.ctrlKey || e.altKey) return false
      const k = e.key
      if (k === 'ArrowLeft' || k === 'ArrowRight') {
        let m = mi
        for (let n = 0; n < 12; n++) {
          m = (m + (k === 'ArrowRight' ? 1 : -1) + 12) % 12
          if (months[m]!.length) break
        }
        mi = m
        ri = 0
        send(months[mi]![0])
        return true
      }
      if (k === 'ArrowUp' || k === 'ArrowDown') {
        const n = months[mi]!.length
        if (n) ri = (ri + (k === 'ArrowDown' ? 1 : -1) + n) % n
        send(months[mi]![ri])
        return true
      }
      if (k === 'Enter') {
        send(months[mi]![ri])
        return true
      }
      return false
    },
  }),
)
</script>

<PaneHeader {pane}>
  <span class="dim">{t('divcal.subtitle')}</span>
</PaneHeader>
<div class="cal" bind:this={host}>
  {#each months as list, i (i)}
    <div class="m" class:cur={i === mi}>
      <h5><span>{label(i + 1)}</span><span class="num muted">{list.length}</span></h5>
      {#each list as id, r (id)}
        <button type="button" class="row" class:sel={i === mi && r === ri} onclick={() => { mi = i; ri = r; send(id) }}>
          <span class="nm">{#if isFav(id)}<span class="star on">★</span> {/if}{nameOf(id)}</span><span class="num">{metric(id)?.yieldTrailing != null ? `${fmt(metric(id)?.yieldTrailing)}%` : '—'}</span>
        </button>
      {/each}
    </div>
  {/each}
</div>

<style>
  .cal {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    grid-auto-rows: 1fr;
    gap: 1px;
    background: var(--line);
    min-height: 0;
  }
  .m {
    background: var(--panel);
    padding: 6px 8px;
    overflow-y: auto;
    min-height: 0;
  }
  .m.cur h5 {
    color: var(--text);
  }
  h5 {
    margin: 0 0 4px;
    font-size: var(--fs-1);
    color: var(--text-2);
    display: flex;
    justify-content: space-between;
    font-weight: 500;
  }
  .row {
    display: flex;
    justify-content: space-between;
    width: 100%;
    height: 18px;
    font-size: var(--fs-1);
    background: none;
    border: 0;
    padding: 0 2px;
    cursor: pointer;
    text-align: left;
    gap: 4px;
  }
  .row:hover {
    background: var(--hover);
  }
  .row.sel {
    background: var(--select);
  }
  :global(.focused) .row.sel {
    background: var(--select-strong);
    box-shadow: inset 2px 0 0 var(--focus);
  }
  .nm {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .num {
    color: var(--text-2);
  }
</style>
