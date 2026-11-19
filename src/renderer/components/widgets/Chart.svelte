<script lang="ts">
// チャート（§7）。1 銘柄・1 時間軸。本体は ChartView、表示の操作は lib/chartMenu.ts。
import { jstNow } from '@shared/calendar'
import type { Timeframe } from '@shared/types'
import { onMount } from 'svelte'
import { isSaveKey, SAVE_TOAST, saveChartImage } from '../../lib/chartImage'
import { cancelCompare, changeSymbol, chartKey, chartMenu, chartMore, takeCompare } from '../../lib/chartMenu'
import { keyOf } from '../../lib/commands'
import { cls, px, sgn } from '../../lib/format'
import type { Key } from '../../lib/i18n'
import { registerPane } from '../../lib/panes'
import { app, codeOf, ensureMetrics, isFav, metric, nameOf, t, toast, toggleFav } from '../../stores/app.svelte'
import { type PaneNode, paneSymbol, patchState } from '../../stores/layout.svelte'
import Icon from '../Icon.svelte'
import PaneHeader from '../PaneHeader.svelte'
import PeriodPicker from '../PeriodPicker.svelte'
import ChartView, { type ChartViewApi } from './ChartView.svelte'

let { pane }: { pane: PaneNode } = $props()
const tf = $derived(((pane.state.tf as Timeframe) ?? 'D') as Timeframe)
const id = $derived(paneSymbol(pane) ?? 'JP:7203')
const m = $derived(metric(id))
let view: ChartViewApi | null = null
/** 見出しの時間軸のチップ（狭いとき）を押したときの次 */
const NEXT_TF: Record<Timeframe, Timeframe> = { D: 'W', W: 'M', M: 'D' }
$effect(() => ensureMetrics([id]))
$effect(() => {
  if (!app.overlay) cancelCompare()
})

onMount(() =>
  registerPane(pane.id, {
    current: () => id,
    receive: (x) => takeCompare(pane, x),
    undo: (redo) => !!view?.undo(redo),
    key(e) {
      if (!e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey && (e.code === 'KeyD' || e.code === 'KeyW' || e.code === 'KeyM')) {
        patchState(pane, { tf: e.code.slice(3) })
        return true
      }
      if (isSaveKey(e, app.settings.chartSave)) {
        void saveImage()
        return true
      }
      return chartKey(pane, e) || !!view?.key(e)
    },
  }),
)

/** 画像の保存（FR-C11。設定で ON のときだけ。ボタン・S キー・「⋯」） */
async function saveImage() {
  if (!app.settings.chartSave) return
  const r = await saveChartImage(view?.snapshot() ?? null, {
    code: codeOf(id),
    name: nameOf(id),
    tfLabel: (x) => t(`tf.${x}` as Key),
    date: jstNow().date,
  })
  const msg = SAVE_TOAST[r]
  if (msg) toast(t(msg), undefined, r === 'failed' ? 6000 : 2200, r === 'failed' ? 'error' : 'info')
}
</script>

<!-- 狭いときは優先度の低い順に隠す: 表示期間 → 指標 → D/W/M（1 つのチップに） → 前日比 → 終値。銘柄は最後まで残す -->
<PaneHeader {pane} collapse={820} more={() => chartMore(pane, () => void saveImage())}>
  <button type="button" class="star" class:on={isFav(id)} title={`${t('act.fav')} (${keyOf('fav')})`} onclick={() => toggleFav(id)}>★</button>
  <button type="button" class="sym" title={`${codeOf(id)} ${nameOf(id)} — ${t('chart.change')} (C)`} onclick={() => changeSymbol(pane)}><span class="code">{codeOf(id)}</span>{nameOf(id)}</button>
  <span class="num px">{px(m?.close)}</span>
  <span class={`num chg ${cls(m?.chgPct, 2)}`}>{sgn(m?.chgPct, 2, '%')}</span>
  <button type="button" class="chip tfc" title={`${t(`tf.${tf}` as Key)} → ${t(`tf.${NEXT_TF[tf]}` as Key)} (D / W / M)`} onclick={() => patchState(pane, { tf: NEXT_TF[tf] })}>{tf}</button>
  <span class="seg">
    {#each ['D', 'W', 'M'] as x (x)}
      <button type="button" aria-pressed={tf === x} title={`${t(`tf.${x}` as Key)} (${x})`} onclick={() => patchState(pane, { tf: x })}>{x}</button>
    {/each}
  </span>
  <span class="per"><PeriodPicker allowDefault value={pane.state.period as number | undefined} onchange={(v) => patchState(pane, { period: v })} /></span>
  <button type="button" class="chip ind" title={`${t('chart.indTip')} (I)`} onclick={() => chartMenu(pane)}>{t('chart.indShort')}</button>
  {#if app.settings.chartSave}
    <button type="button" class="chip img" aria-label={t('chart.saveImage')} title={`${t('chart.saveImage')} (S)`} onclick={saveImage}><Icon name="image" size={13} /></button>
  {/if}
</PaneHeader>
{#key id}
  <ChartView {pane} {id} {tf} onApi={(a) => (view = a)} />
{/key}

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
  .img {
    display: inline-flex;
    align-items: center;
  }
  /* 画像の保存は表示期間より先に隠す（「⋯」に残る） */
  @container (max-width: 759px) {
    .img {
      display: none;
    }
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
</style>
