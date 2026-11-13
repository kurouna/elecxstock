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
let okBtn = $state<HTMLButtonElement>()
/** 確認ダイアログで選んでいるボタン（0: 取り消し、1: 実行）。危険な操作は取り消しから始める */
let csel = $state(0)

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
  } else if (overlay.kind === 'checklist') queueMicrotask(() => box?.focus())
  else if (overlay.kind === 'confirm') {
    csel = overlay.danger ? 0 : 1
    ;(csel ? okBtn : first)?.focus()
  } else first?.focus()
})
let box = $state<HTMLDivElement>()
const intoView = () => queueMicrotask(() => box?.querySelector('.it.sel')?.scrollIntoView({ block: 'nearest' }))
function choiceKey(e: KeyboardEvent) {
  if (overlay.kind !== 'choice') return
  const n = overlay.choices.length
  if (e.key === 'ArrowDown') sel = Math.min(n - 1, sel + 1)
  else if (e.key === 'ArrowUp') sel = Math.max(0, sel - 1)
  else if (e.key === 'PageDown') sel = Math.min(n - 1, sel + 10)
  else if (e.key === 'PageUp') sel = Math.max(0, sel - 10)
  else if (e.key === 'Home') sel = 0
  else if (e.key === 'End') sel = n - 1
  else if (e.key === 'Enter') {
    e.preventDefault()
    done(overlay.resolve, overlay.choices[sel]?.id ?? null)
    return
  } else return
  intoView()
  e.preventDefault()
}
/** 確認: ← → ↑ ↓ で取り消し / 実行を選び、Enter で決める（Esc は取り消し） */
function confirmKey(e: KeyboardEvent) {
  if (overlay.kind !== 'confirm' || e.isComposing) return
  if ((e.target as HTMLElement).tagName === 'INPUT') return // チェックボックスの上では Space / 矢印をそのまま
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') csel = 0
  else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') csel = 1
  else if (e.key === 'Enter') {
    e.preventDefault()
    done(overlay.resolve, { ok: csel === 1, checked })
    return
  } else return
  e.preventDefault()
  ;(csel ? okBtn : first)?.focus()
}
function checkKey(e: KeyboardEvent) {
  if (overlay.kind !== 'checklist') return
  const it = overlay.items
  const n = it.length
  if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && e.altKey && overlay.reorder) {
    const j = sel + (e.key === 'ArrowUp' ? -1 : 1)
    if (j >= 0 && j < n) {
      ;[it[sel], it[j]] = [it[j]!, it[sel]!]
      sel = j
    }
  } else if (e.key === 'ArrowDown') sel = Math.min(n - 1, sel + 1)
  else if (e.key === 'ArrowUp') sel = Math.max(0, sel - 1)
  else if (e.key === 'Home') sel = 0
  else if (e.key === 'End') sel = n - 1
  else if (e.code === 'Space') it[sel]!.on = !it[sel]!.on
  else if (e.key === 'Enter') {
    e.preventDefault()
    done(overlay.resolve, $state.snapshot(it))
    return
  } else return
  intoView()
  e.preventDefault()
}
</script>

{#if overlay.kind === 'confirm'}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="dialog box" role="alertdialog" tabindex="-1" onkeydown={confirmKey}>
    <h3>{overlay.title}</h3>
    {#if overlay.body}<p class="dim">{overlay.body}</p>{/if}
    {#if overlay.items}<ul>{#each overlay.items as x (x)}<li>{x}</li>{/each}</ul>{/if}
    {#if overlay.check}<label class="chk"><input type="checkbox" bind:checked /> {overlay.check}</label>{/if}
    <div class="actions">
      <button type="button" class="btn" class:sel={csel === 0} bind:this={first} onfocus={() => (csel = 0)} onclick={() => done(overlay.resolve, { ok: false, checked })}>{t('common.cancel')}</button>
      <button type="button" class="btn" class:sel={csel === 1} class:danger={overlay.danger} class:primary={!overlay.danger} bind:this={okBtn} onfocus={() => (csel = 1)} onclick={() => done(overlay.resolve, { ok: true, checked })}>{overlay.ok}</button>
    </div>
    <div class="keys muted">{t('dlg.confirmKeys')}</div>
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
  <div class="dialog box wide" role="dialog" tabindex="-1" onkeydown={choiceKey} bind:this={box}>
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
{:else if overlay.kind === 'checklist'}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="dialog box wide" role="dialog" tabindex="-1" onkeydown={checkKey} bind:this={box}>
    <h3>{overlay.title}</h3>
    <div class="list">
      {#each overlay.items as c, i (c.id)}
        <button
          type="button"
          class="it"
          class:sel={i === sel}
          onclick={() => { sel = i; c.on = !c.on }}
          onmousemove={() => (sel = i)}
        >
          <span class="box2" class:on={c.on}>{c.on ? '✓' : ''}</span>
          <span class="n">{c.label}</span>{#if c.hint}<span class="s">{c.hint}</span>{/if}
        </button>
      {/each}
    </div>
    <div class="foot">
      <span><kbd>Space</kbd> {t('dlg.toggle')}</span>
      {#if overlay.reorder}<span><kbd>Alt+↑↓</kbd> {t('dlg.reorder')}</span>{/if}
      <span><kbd>Enter</kbd> {t('common.ok')}</span>
      <span><kbd>Esc</kbd> {t('common.cancel')}</span>
      {#if overlay.hint}<span>{overlay.hint}</span>{/if}
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
  .box2 {
    width: 14px;
    height: 14px;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    flex: none;
    color: var(--bg);
  }
  .box2.on {
    background: var(--focus);
    border-color: var(--focus);
  }
  /* 選んでいるボタン: マウスで操作しているときもフォーカスの枠と同じ縁取りを出す */
  .actions .btn.sel {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
  .keys {
    margin-top: var(--s-2);
    font-size: var(--fs-1);
    text-align: right;
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
