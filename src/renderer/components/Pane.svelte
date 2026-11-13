<script lang="ts">
// ペインの入れ物。ウィジェットの例外はそのペインだけを止め、再試行とエラー通知を出す（FR-L8）。

import { setFocus } from '../lib/commands'
import { dropOnChart, symbolDrop } from '../lib/symbolDrag'
import { app, t, toast } from '../stores/app.svelte'
import { inDock, movePane, type PaneNode } from '../stores/layout.svelte'
import { DRAG_MIME, type DropZone, zoneOf } from './dragPane'
import Chart from './widgets/Chart.svelte'
import ChartGrid from './widgets/ChartGrid.svelte'
import DivCalendar from './widgets/DivCalendar.svelte'
import Heatmap from './widgets/Heatmap.svelte'
import Jobs from './widgets/Jobs.svelte'
import MarketOverview from './widgets/MarketOverview.svelte'
import MtfChart from './widgets/MtfChart.svelte'
import Portfolio from './widgets/Portfolio.svelte'
import Ranking from './widgets/Ranking.svelte'
import Screener from './widgets/Screener.svelte'
import SymbolInfo from './widgets/SymbolInfo.svelte'
import Watchlist from './widgets/Watchlist.svelte'

let { pane }: { pane: PaneNode } = $props()
const focused = $derived(app.focus === pane.id)

let zone = $state<DropZone | null>(null)
let el = $state<HTMLElement>()
function over(e: DragEvent) {
  if (!e.dataTransfer?.types.includes(DRAG_MIME) || inDock(pane.id)) return
  e.preventDefault()
  zone = zoneOf(e, el!)
}
function drop(e: DragEvent) {
  const src = e.dataTransfer?.getData(DRAG_MIME)
  const z = zone
  zone = null
  if (!src || !z || src === pane.id) return
  e.preventDefault()
  if (movePane(src, pane.id, z)) setFocus(src)
}
function onerror(e: unknown) {
  toast(t('err.generic', { msg: String((e as Error)?.message ?? e) }), undefined, 5000)
}
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<section
  class="pane"
  class:focused
  class:maxed={app.maximized === pane.id}
  data-pane-id={pane.id}
  data-widget={pane.widget}
  tabindex="0"
  onmousedown={() => (app.focus = pane.id)}
  onfocusin={() => (app.focus = pane.id)}
  aria-label={pane.widget}
  bind:this={el}
  use:symbolDrop={pane.widget === 'chart' || pane.widget === 'mtf' || pane.widget === 'info' ? (id) => dropOnChart(pane, id) : null}
  ondragover={over}
  ondragleave={(e) => {
    if (!el?.contains(e.relatedTarget as Node)) zone = null
  }}
  ondrop={drop}
>
  {#if zone}<div class={`drop ${zone}`}></div>{/if}
  <svelte:boundary {onerror}>
    {#if pane.widget === 'chart'}
      <Chart {pane} />
    {:else if pane.widget === 'watchlist'}
      <Watchlist {pane} />
    {:else if pane.widget === 'screener'}
      <Screener {pane} />
    {:else if pane.widget === 'info'}
      <SymbolInfo {pane} />
    {:else if pane.widget === 'grid'}
      <ChartGrid {pane} />
    {:else if pane.widget === 'divcal'}
      <DivCalendar {pane} />
    {:else if pane.widget === 'mtf'}
      <MtfChart {pane} />
    {:else if pane.widget === 'portfolio'}
      <Portfolio {pane} />
    {:else if pane.widget === 'heatmap'}
      <Heatmap {pane} />
    {:else if pane.widget === 'ranking'}
      <Ranking {pane} />
    {:else if pane.widget === 'market'}
      <MarketOverview {pane} />
    {:else if pane.widget === 'jobs'}
      <Jobs {pane} />
    {/if}
    {#snippet failed(error, reset)}
      <div class="state">
        <div>
          <div>{t('err.generic', { msg: String((error as Error)?.message ?? error) })}</div>
          <button type="button" class="btn" onclick={reset}>{t('boot.retry')}</button>
        </div>
      </div>
    {/snippet}
  </svelte:boundary>
</section>

<style>
  .drop {
    position: absolute;
    z-index: 40;
    pointer-events: none;
    background: color-mix(in srgb, var(--focus) 22%, transparent);
    border: 1px solid var(--focus);
  }
  .drop.center {
    inset: 20%;
  }
  .drop.left {
    inset: 0 50% 0 0;
  }
  .drop.right {
    inset: 0 0 0 50%;
  }
  .drop.top {
    inset: 0 0 50% 0;
  }
  .drop.bottom {
    inset: 50% 0 0 0;
  }
  .pane {
    display: flex;
    flex-direction: column;
    background: var(--panel);
    height: 100%;
    width: 100%;
    outline: none;
    position: relative;
    container-type: inline-size;
    overflow: hidden;
  }
  .pane.maxed {
    position: fixed;
    top: 37px;
    bottom: 25px;
    left: 0;
    right: 0;
    z-index: 30;
  }
</style>
