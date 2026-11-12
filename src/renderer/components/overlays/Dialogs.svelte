<script lang="ts">
// 確認・名前の入力・選択・保存の確認（FR-SC13）。すべてキーボードで操作できる（FR-KB2）。
import { onMount } from 'svelte'
import { app, type Overlay, t } from '../../stores/app.svelte'

let { overlay }: { overlay: Overlay } = $props()
let checked = $state(true)
let value = $state('')
let sel = $state(0)
let input = $state<HTMLInputElement>()
let first = $state<HTMLButtonElement>()

function done<T>(f: (v: T) => void, v: T) {
  app.overlay = null
  f(v)
}
onMount(() => {
  if (overlay.kind === 'prompt') {
    value = overlay.value
    queueMicrotask(() => {
      input?.focus()
      input?.select()
    })
  } else first?.focus()
})
function choiceKey(e: KeyboardEvent) {
  if (overlay.kind !== 'choice') return
  if (e.key === 'ArrowDown') sel = Math.min(overlay.choices.length - 1, sel + 1)
  else if (e.key === 'ArrowUp') sel = Math.max(0, sel - 1)
  else if (e.key === 'Enter') done(overlay.resolve, overlay.choices[sel]?.id ?? null)
  else return
  e.preventDefault()
}
</script>

{#if overlay.kind === 'confirm'}
  <div class="dialog box" role="alertdialog">
    <h3>{overlay.title}</h3>
    {#if overlay.body}<p class="dim">{overlay.body}</p>{/if}
    {#if overlay.items}<ul>{#each overlay.items as x (x)}<li>{x}</li>{/each}</ul>{/if}
    {#if overlay.check}<label class="chk"><input type="checkbox" bind:checked /> {overlay.check}</label>{/if}
    <div class="actions">
      <button type="button" class="btn" bind:this={first} onclick={() => done(overlay.resolve, { ok: false, checked })}>{t('common.cancel')}</button>
      <button type="button" class="btn" class:danger={overlay.danger} class:primary={!overlay.danger} onclick={() => done(overlay.resolve, { ok: true, checked })}>{overlay.ok}</button>
    </div>
  </div>
{:else if overlay.kind === 'prompt'}
  <div class="dialog box" role="dialog">
    <h3>{overlay.title}</h3>
    <input
      class="name"
      bind:this={input}
      bind:value
      maxlength="60"
      onkeydown={(e) => {
        if (e.key === 'Enter' && !e.isComposing) {
          e.preventDefault()
          done(overlay.resolve, value.trim() || null)
        }
      }}
    />
    <div class="actions">
      <button type="button" class="btn" onclick={() => done(overlay.resolve, null)}>{t('common.cancel')}</button>
      <button type="button" class="btn primary" onclick={() => done(overlay.resolve, value.trim() || null)}>{t('common.ok')}</button>
    </div>
  </div>
{:else if overlay.kind === 'choice'}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="dialog box wide" role="dialog" tabindex="-1" onkeydown={choiceKey}>
    <h3>{overlay.title}</h3>
    <div class="list">
      {#each overlay.choices as c, i (c.id)}
        {#if i === 0}
          <button type="button" class="it" class:sel={i === sel} bind:this={first} onclick={() => done(overlay.resolve, c.id)} onmousemove={() => (sel = i)}>
            <span class="n">{c.label}</span>{#if c.hint}<span class="s">{c.hint}</span>{/if}
          </button>
        {:else}
          <button type="button" class="it" class:sel={i === sel} onclick={() => done(overlay.resolve, c.id)} onmousemove={() => (sel = i)}>
            <span class="n">{c.label}</span>{#if c.hint}<span class="s">{c.hint}</span>{/if}
          </button>
        {/if}
      {/each}
    </div>
  </div>
{:else if overlay.kind === 'ask3'}
  <div class="dialog box" role="alertdialog">
    <h3>{overlay.title}</h3>
    <p class="dim">{overlay.body}</p>
    <div class="actions">
      <button type="button" class="btn" onclick={() => done(overlay.resolve, 'cancel')}>{t('common.cancel')}</button>
      <button type="button" class="btn" onclick={() => done(overlay.resolve, 'discard')}>{t('scr.discard')}</button>
      <button type="button" class="btn primary" bind:this={first} onclick={() => done(overlay.resolve, 'save')}>{t('common.save')}</button>
    </div>
  </div>
{/if}

<style>
  .box {
    width: 520px;
    padding: var(--s-4);
  }
  .wide {
    width: 600px;
    padding: var(--s-3) 0;
  }
  .wide h3 {
    padding: 0 var(--s-3);
  }
  ul {
    margin: var(--s-2) 0;
    padding-left: 18px;
    color: var(--text-2);
  }
  .chk {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-top: var(--s-2);
    color: var(--text-2);
  }
  .name {
    width: 100%;
    height: 30px;
    background: var(--bg);
    border: 1px solid var(--focus);
    color: var(--text);
    font-size: var(--fs-3);
    padding: 0 8px;
    outline: none;
  }
</style>
