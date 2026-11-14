<script lang="ts">
// mtf-chart（§6.3）: 1 銘柄の日・週・月を 1 ペインに並べる（横 3 列 / 1+2）。
// Tab / Shift+Tab で段を移り、D/W/M はフォーカス中の段の時間軸を替える。V で並べ方を切り替える。
import type { Timeframe } from '@shared/types'
import { onMount } from 'svelte'
import { cancelCompare, changeSymbol, chartKey, chartMenu, chartMore, takeCompare } from '../../lib/chartMenu'
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
const tfs = $derived(((pane.state.tfs as Timeframe[] | undefined) ?? ['D', 'W', 'M']) as Timeframe[])
const arr = $derived((pane.state.arr as 'cols' | 'one2') ?? 'one2')
const id = $derived(paneSymbol(pane) ?? 'JP:7203')
const m = $derived(metric(id))
let active = $state(0)
const views: (ChartViewApi | null)[] = [null, null, null]
$effect(() => ensureMetrics([id]))
$effect(() => {
  if (!app.overlay) cancelCompare()
})
/** 見出しの時間軸のチップ（狭いとき）を押したときの次 */
const NEXT_TF: Record<Timeframe, Timeframe> = { D: 'W', W: 'M', M: 'D' }
const atf = $derived(tfs[active] ?? 'D')
const toggleArr = () => patchState(pane, { arr: arr === 'cols' ? 'one2' : 'cols' })
function setTf(i: number, tf: Timeframe) {
  const next = [...tfs]
  next[i] = tf
  patchState(pane, { tfs: next })
}

onMount(() =>
  registerPane(pane.id, {
    current: () => id,
    receive: (x) => takeCompare(pane, x),
    key(e) {
      const plain = !e.ctrlKey && !e.altKey && !e.metaKey
      if (plain && e.key === 'Tab') {
        active = (active + (e.shiftKey ? 2 : 1)) % 3
        return true
      }
      if (plain && !e.shiftKey && (e.code === 'KeyD' || e.code === 'KeyW' || e.code === 'KeyM')) {
        setTf(active, e.code.slice(3) as Timeframe)
        return true
      }
      if (plain && !e.shiftKey && e.code === 'KeyV') {
        patchState(pane, { arr: arr === 'cols' ? 'one2' : 'cols' })
        return true
      }
      return chartKey(pane, e) || !!views[active]?.key(e)
    },
  }),
)
</script>

<!-- 狭いときは優先度の低い順に隠す（Chart.svelte と同じ）。並べ方は指標と一緒に隠し、「⋯」から選べる -->
<PaneHeader {pane} collapse={820} more={() => [{ id: 'arr', label: t('mtf.arrange'), hint: 'V', run: toggleArr }, ...chartMore(pane)]}>
  <button type="button" class="star" class:on={isFav(id)} title={`${t('act.fav')} (${keyOf('fav')})`} onclick={() => toggleFav(id)}>★</button>
  <button type="button" class="sym" title={`${codeOf(id)} ${nameOf(id)} — ${t('chart.change')} (C)`} onclick={() => changeSymbol(pane)}><span class="code">{codeOf(id)}</span>{nameOf(id)}</button>
  <span class="num px">{px(m?.close)}</span>
  <span class={`num chg ${cls(m?.chgPct)}`}>{sgn(m?.chgPct, 2, '%')}</span>
  <button type="button" class="chip tfc" title={`${t(`tf.${atf}` as Key)}（${t('mtf.activeRow')}） → ${t(`tf.${NEXT_TF[atf]}` as Key)} (D / W / M)`} onclick={() => setTf(active, NEXT_TF[atf])}>{atf}</button>
  <span class="seg">
    {#each ['D', 'W', 'M'] as x (x)}
      <button type="button" aria-pressed={tfs[active] === x} title={`${t(`tf.${x}` as Key)}（${t('mtf.activeRow')}） (${x})`} onclick={() => setTf(active, x as Timeframe)}>{x}</button>
    {/each}
  </span>
  <button type="button" class="chip ind" title={`${t('mtf.arrange')} (V)`} aria-label={t('mtf.arrange')} onclick={toggleArr}>{arr === 'cols' ? '▥' : '◫'}</button>
  <span class="per"><PeriodPicker allowDefault value={pane.state.period as number | undefined} onchange={(v) => patchState(pane, { period: v })} /></span>
  <button type="button" class="chip ind" title={`${t('chart.indTip')} (I)`} onclick={() => chartMenu(pane)}>{t('chart.indShort')}</button>
</PaneHeader>
<div class="mtf" class:cols={arr === 'cols'}>
  {#key id}
    {#each [0, 1, 2] as i (i)}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div class="cell" class:act={i === active && app.focus === pane.id} class:big={i === 0 && arr === 'one2'} onmousedown={() => (active = i)}>
        <ChartView {pane} {id} tf={tfs[i] ?? 'D'} active={i === active} onApi={(a) => (views[i] = a)} />
      </div>
    {/each}
  {/key}
</div>

<style>
  .sym {
    flex: 0 1 auto;
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
  .star,
  .num,
  .seg,
  .per,
  .chip {
    flex: none;
  }
  .tfc {
    display: none;
    font-family: var(--mono);
  }
  @container (max-width: 699px) {
    .per {
      display: none;
    }
  }
  @container (max-width: 599px) {
    .ind {
      display: none;
    }
  }
  @container (max-width: 479px) {
    .seg {
      display: none;
    }
    .tfc {
      display: block;
    }
  }
  @container (max-width: 359px) {
    .chg {
      display: none;
    }
  }
  @container (max-width: 279px) {
    .px {
      display: none;
    }
  }
  .mtf {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 3fr 2fr;
    gap: 1px;
    background: var(--line);
  }
  .mtf.cols {
    grid-template-columns: 1fr 1fr 1fr;
    grid-template-rows: 1fr;
  }
  .cell {
    position: relative;
    display: flex;
    min-width: 0;
    min-height: 0;
    background: var(--panel);
    box-shadow: inset 0 2px 0 transparent;
  }
  .cell.big {
    grid-column: 1 / span 2;
  }
  .cell.act {
    box-shadow: inset 0 2px 0 var(--focus);
  }
</style>
