<script lang="ts">
// 一覧の 1 行のセル（列は lib/columns.ts）。値が変わったセルは一瞬だけ背景を光らせる（FR-V6）。
import { refOf } from '@shared/markets'
import type { InstrumentId } from '@shared/types'
import { kindTag, type ListCol } from '../../lib/columns'
import { anomalyHint } from '../../lib/commands'
import { app, codeOf, inst, isFav, metric, nameOf, t, toggleFav } from '../../stores/app.svelte'

/** refName: マーケット一覧の表示名を出す（連動 ETF は ETF の名前を添える。FR-U6） */
let { id, cols, refName = false }: { id: InstrumentId; cols: ListCol[]; refName?: boolean } = $props()
const ref = $derived(refName ? refOf(id) : undefined)
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
    <td class="l name" title={ref && id.startsWith('JP:') ? `${ref.name[app.settings.lang]} ${nameOf(id)}` : undefined}>
      {#if ref}{ref.name[app.settings.lang]}{#if id.startsWith('JP:')}<span class="sub">{nameOf(id)}</span>{/if}{:else}{nameOf(id)}{#if kind}<span class="tag">{kind}</span>{/if}{/if}
      {#if ins?.status === 'delisted'}<span class="tag warn" title={t('list.delistedHint')}>{t('list.delisted')}</span>{/if}
      {#if m?.anomaly || m?.gapSuspect}<span class="tag warn" title={anomalyHint()}>!</span>{/if}
    </td>
  {:else}
    {@const v = c.cell(id)}
    <td class:l={c.l} class={`${v.c ?? ''} ${c.id === 'price.close' && flash ? `flash-${flash}` : ''}`}>{v.t}{#if v.u}<span class="unit">{v.u}</span>{/if}</td>
  {/if}
{/each}
