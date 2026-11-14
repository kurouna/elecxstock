<script lang="ts">
// チャート（§7）。1 銘柄・1 時間軸。本体は ChartView、表示の操作は lib/chartMenu.ts。
import type { Timeframe } from '@shared/types'
import { onMount } from 'svelte'
import { cancelCompare, changeSymbol, chartKey, chartMenu, takeCompare } from '../../lib/chartMenu'
import { keyOf } from '../../lib/commands'
import { cls, px, sgn } from '../../lib/format'
import type { Key } from '../../lib/i18n'
import { registerPane } from '../../lib/panes'
import { app, codeOf, ensureMetrics, isFav, metric, nameOf, t, toggleFav } from '../../stores/app.svelte'
import { type PaneNode, paneSymbol, patchState } from '../../stores/layout.svelte'
import PaneHeader from '../PaneHeader.svelte'
import PeriodPicker from '../PeriodPicker.svelte'
import ChartView, { type ChartViewApi } from './ChartView.svelte'

let { pane }: { pane: PaneNode } = $props()
const tf = $derived(((pane.state.tf as Timeframe) ?? 'D') as Timeframe)
const id = $derived(paneSymbol(pane) ?? 'JP:7203')
const m = $derived(metric(id))
let view: ChartViewApi | null = null
$effect(() => ensureMetrics([id]))
$effect(() => {
  if (!app.overlay) cancelCompare()
})

onMount(() =>
  registerPane(pane.id, {
    current: () => id,
    receive: (x) => takeCompare(pane, x),
    key(e) {
      if (!e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey && (e.code === 'KeyD' || e.code === 'KeyW' || e.code === 'KeyM')) {
        patchState(pane, { tf: e.code.slice(3) })
        return true
      }
      return chartKey(pane, e) || !!view?.key(e)
    },
  }),
)
</script>

<PaneHeader {pane}>
  <button type="button" class="star" class:on={isFav(id)} title={`${t('act.fav')} (${keyOf('fav')})`} onclick={() => toggleFav(id)}>★</button>
  <button type="button" class="sym" title={`${t('chart.change')} (C)`} onclick={() => changeSymbol(pane)}><span class="code">{codeOf(id)}</span>{nameOf(id)}</button>
  <span class="num">{px(m?.close)}</span>
  <span class={`num ${cls(m?.chgPct)}`}>{sgn(m?.chgPct, 2, '%')}</span>
  <span class="seg">
    {#each ['D', 'W', 'M'] as x (x)}
      <button type="button" aria-pressed={tf === x} title={`${t(`tf.${x}` as Key)} (${x})`} onclick={() => patchState(pane, { tf: x })}>{x}</button>
    {/each}
  </span>
  <PeriodPicker allowDefault value={pane.state.period as number | undefined} onchange={(v) => patchState(pane, { period: v })} />
  <button type="button" class="chip ind" title={`${t('chart.indTip')} (I)`} onclick={() => chartMenu(pane)}>{t('chart.indShort')}</button>
</PaneHeader>
{#key id}
  <ChartView {pane} {id} {tf} onApi={(a) => (view = a)} />
{/key}

<style>
  .sym {
    background: none;
    border: 0;
    padding: 0;
    color: inherit;
    cursor: pointer;
    text-align: left;
    font-weight: 700;
    font-size: var(--fs-3);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .code {
    font-family: var(--mono);
    color: var(--text-2);
    margin-right: 6px;
    font-weight: 500;
  }
  @container (max-width: 420px) {
    .ind {
      display: none;
    }
  }
</style>
