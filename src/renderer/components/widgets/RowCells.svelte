<script lang="ts">
// 一覧の 1 行のセル（列は lib/columns.ts）。値が変わったセルは一瞬だけ背景を光らせる（FR-V6）。
import type { InstrumentId } from '@shared/types'
import { kindTag, type ListCol } from '../../lib/columns'
import { app, codeOf, inst, isFav, metric, nameOf, t, toggleFav } from '../../stores/app.svelte'

let { id, cols }: { id: InstrumentId; cols: ListCol[] } = $props()
const ins = $derived(inst(id))
const m = $derived(metric(id))
const kind = $derived(kindTag(ins, cols, app.settings.lang))
let prev: number | null | undefined
let flash = $state<'' | 'up' | 'down'>('')
let timer: ReturnType<typeof setTimeout> | null = null
$effect(() => {
  const c = m?.close
  if (prev != null && c != null && c !== prev) {
    flash = c > prev ? 'up' : 'down'
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => (flash = ''), 900)
  }
  prev = c
})
</script>

{#each cols as c (c.id)}
  {#if c.id === 'star'}
    <td class="l"><button type="button" class="star" class:on={isFav(id)} onclick={(e) => { e.stopPropagation(); toggleFav(id) }} aria-label="favorite">★</button></td>
  {:else if c.id === 'code'}
    <td class="l code">{codeOf(id)}</td>
  {:else if c.id === 'name'}
    <td class="l name">
      {nameOf(id)}{#if kind}<span class="tag">{kind}</span>{/if}
      {#if ins?.status === 'delisted'}<span class="tag warn" title={t('list.delistedHint')}>{t('list.delisted')}</span>{/if}
      {#if m?.anomaly || m?.gapSuspect}<span class="tag warn" title={t('list.anomalyHint')}>!</span>{/if}
    </td>
  {:else}
    {@const v = c.cell(id)}
    <td class:l={c.l} class={`${v.c ?? ''} ${c.id === 'price.close' && flash ? `flash-${flash}` : ''}`}>{v.t}{#if v.u}<span class="unit">{v.u}</span>{/if}</td>
  {/if}
{/each}
