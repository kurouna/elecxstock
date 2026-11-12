<script lang="ts">
// ペインの入れ物。ウィジェットの例外はそのペインだけを止め、再試行とエラー通知を出す（FR-L8）。
import { app, t, toast } from '../stores/app.svelte'
import type { PaneNode } from '../stores/layout.svelte'
import Chart from './widgets/Chart.svelte'
import ChartGrid from './widgets/ChartGrid.svelte'
import DivCalendar from './widgets/DivCalendar.svelte'
import Jobs from './widgets/Jobs.svelte'
import Screener from './widgets/Screener.svelte'
import SymbolInfo from './widgets/SymbolInfo.svelte'
import Watchlist from './widgets/Watchlist.svelte'

let { pane }: { pane: PaneNode } = $props()
const focused = $derived(app.focus === pane.id)

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
  tabindex="0"
  onmousedown={() => (app.focus = pane.id)}
  onfocusin={() => (app.focus = pane.id)}
  aria-label={pane.widget}
>
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
    {:else if pane.widget === 'jobs'}
      <Jobs {pane} />
    {/if}
    {#snippet failed(error, reset)}
      <div class="state">
        <div>
          <div>{t('err.generic', { msg: String((error as Error)?.message ?? error) })}</div>
          <button type="button" class="btn" onclick={reset}>RETRY</button>
        </div>
      </div>
    {/snippet}
  </svelte:boundary>
</section>

<style>
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
