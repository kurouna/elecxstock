<script lang="ts">
// 初回起動（§6.13 FR-FR1〜FR4）: 免責の同意 → 取得の確認（対象・保存期間・リクエスト数と時間の見積もり）→ 取得の開始。
import { onMount } from 'svelte'
import { app, rpc, saveSettings, t, toast } from '../../stores/app.svelte'

let step = $state<1 | 2>(1)
let years = $state(5)
let first = $state<HTMLButtonElement>()
onMount(() => {
  if (app.settings.disclaimerAccepted) step = 2
  years = app.settings.retentionYears
  queueMicrotask(() => first?.focus())
})
function agree() {
  saveSettings({ disclaimerAccepted: true })
  step = 2
  queueMicrotask(() => first?.focus())
}
async function start() {
  saveSettings({ retentionYears: years, firstRunDone: true })
  app.overlay = null
  await rpc('jobs.start', { kind: 'initial' })
}
function later() {
  saveSettings({ firstRunDone: true })
  app.overlay = null
}
async function importJpx() {
  const bytes = await window.elecxstock.openFile('xlsx')
  if (!(bytes instanceof Uint8Array)) return
  saveSettings({ retentionYears: years, firstRunDone: true })
  app.overlay = null
  const n = await rpc('data.importJpx', { bytes: new Uint8Array(bytes) })
  toast(`JPX: ${n.toLocaleString()}`)
}
</script>

<div class="dialog first" role="dialog" aria-label={t('first.title')}>
  <div class="logo" aria-hidden="true">E</div>
  <h2>{t('first.title')}</h2>
  {#if step === 1}
    <p>{t('first.disclaimer')}</p>
    <div class="actions">
      <button type="button" class="btn primary" bind:this={first} onclick={agree}>{t('first.agree')}</button>
    </div>
  {:else}
    <h3>{t('first.fetchTitle')}</h3>
    <p>{t('first.fetchBody')}</p>
    <div class="field">
      <span>{t('first.retention')}</span>
      <span class="seg">
        {#each [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as y (y)}
          <button type="button" aria-pressed={years === y} onclick={() => (years = y)}>{y}</button>
        {/each}
      </span>
    </div>
    <p class="muted small">{t('first.jpxFailed')} <button type="button" class="chip" onclick={importJpx}>{t('set.importJpx')}</button></p>
    <div class="actions">
      <button type="button" class="btn" onclick={later}>{t('first.later')}</button>
      <button type="button" class="btn primary" bind:this={first} onclick={start}>{t('first.start')}</button>
    </div>
  {/if}
</div>

<style>
  .first {
    width: 640px;
    padding: var(--s-4) 28px 22px;
    line-height: 1.75;
    margin-top: 40px;
  }
  .logo {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: #10a5e8;
    color: #fff;
    font-weight: 700;
    font-size: 20px;
    display: grid;
    place-items: center;
    box-shadow: 0 0 0 3px #fff inset;
  }
  h2 {
    margin: var(--s-3) 0 var(--s-2);
    font-size: 18px;
  }
  p {
    color: var(--text-2);
  }
  .field {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    margin: var(--s-2) 0;
  }
  .small {
    font-size: var(--fs-1);
  }
</style>
