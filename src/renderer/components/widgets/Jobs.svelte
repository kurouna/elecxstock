<script lang="ts">
// ジョブとログ（FR-F4, F7）: 取得の進捗・取り消し・失敗した銘柄と理由。

import type { FetchFailure } from '@shared/types'
import { onMount } from 'svelte'
import { startUpdate } from '../../lib/commands'
import { dateTime } from '../../lib/format'
import type { Key } from '../../lib/i18n'
import { registerPane } from '../../lib/panes'
import { app, bridge, codeOf, nameOf, rpc, t } from '../../stores/app.svelte'
import { type PaneNode, setLinkSymbol } from '../../stores/layout.svelte'
import PaneHeader from '../PaneHeader.svelte'

let { pane }: { pane: PaneNode } = $props()
let fails = $state<FetchFailure[]>([])
let sel = $state(0)
$effect(() => {
  void app.dataVersion
  void app.jobs
  bridge.call('data.failures', {}).then((f) => (fails = f))
})
onMount(() =>
  registerPane(pane.id, {
    current: () => fails[sel]?.id,
    key(e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        sel = Math.max(0, Math.min(fails.length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1)))
        if (fails[sel]) setLinkSymbol(pane.link || 1, fails[sel]!.id)
        return true
      }
      return false
    },
  }),
)
const running = (s: string) => s === 'running' || s === 'queued' || s === 'waiting-offline' || s === 'provider-paused'
</script>

<PaneHeader {pane}>
  <button type="button" class="chip" onclick={startUpdate}>{t('jobs.update')} <kbd>F5</kbd></button>
</PaneHeader>
<div class="scroll">
  <table class="grid">
    <colgroup><col style="width:140px" /><col style="width:110px" /><col /><col style="width:90px" /></colgroup>
    <thead><tr><th class="l">{t('widget.jobs')}</th><th class="l">{t('jobs.status')}</th><th>{t('jobs.progress')}</th><th></th></tr></thead>
    <tbody>
      {#each app.jobs as j (j.id)}
        <tr>
          <td class="l name">{t(`jobs.kind.${j.kind}` as Key)}</td>
          <td class="l name">{t(`jobs.${j.status}` as Key)}</td>
          <td>{j.done.toLocaleString()} / {j.total.toLocaleString()}{j.failed ? ` · ✕${j.failed}` : ''}{j.message ? ` · ${j.message}` : ''}</td>
          <td>
            {#if running(j.status)}<button type="button" class="chip" onclick={() => rpc('jobs.pause', { id: j.id })}>{t('jobs.pause')}</button>{/if}
            {#if j.status === 'paused'}<button type="button" class="chip" onclick={() => rpc('jobs.resume', { id: j.id })}>{t('jobs.resume')}</button>{/if}
            {#if running(j.status) || j.status === 'paused'}<button type="button" class="chip" onclick={() => rpc('jobs.cancel', { id: j.id })}>{t('jobs.cancel')}</button>{/if}
          </td>
        </tr>
      {:else}
        <tr><td colspan="4" class="l muted name">{t('jobs.none')}</td></tr>
      {/each}
    </tbody>
  </table>
  <h4>{t('jobs.failures')} <span class="num muted">{fails.length}</span></h4>
  <table class="grid">
    <colgroup><col style="width:60px" /><col style="width:180px" /><col style="width:150px" /><col /></colgroup>
    <tbody>
      {#each fails as f, i (f.id)}
        <tr class:sel={i === sel} onclick={() => { sel = i; setLinkSymbol(pane.link || 1, f.id) }}>
          <td class="l code">{codeOf(f.id)}</td>
          <td class="l name">{nameOf(f.id)}</td>
          <td class="l">{dateTime(f.at)}</td>
          <td class="l name dim">{f.reason}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  h4 {
    margin: var(--s-3) var(--s-2) 4px;
    font-size: var(--fs-1);
    color: var(--text-2);
    letter-spacing: 0.08em;
  }
</style>
