<script lang="ts">
// 確認・名前の入力・選択・保存の確認（FR-SC13）。すべてキーボードで操作できる（FR-KB2）。

import { onMount } from 'svelte'
import { composing } from '../../lib/keys'
import { clampSel } from '../../lib/selection'
import { SHAPE_FIG } from '../../lib/shapeFigs'
import { app, type Overlay, t } from '../../stores/app.svelte'
import Keys from './Keys.svelte'

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
  } else if (overlay.kind === 'checklist' || overlay.kind === 'choice') queueMicrotask(() => box?.focus())
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
  if (e.key === 'ArrowDown') sel = clampSel(sel + 1, n)
  else if (e.key === 'ArrowUp') sel = Math.max(0, sel - 1)
  else if (e.key === 'PageDown') sel = clampSel(sel + 10, n)
  else if (e.key === 'PageUp') sel = Math.max(0, sel - 10)
  else if (e.key === 'Home') sel = 0
  else if (e.key === 'End')
    sel = clampSel(n - 1, n) // 空の一覧で -1 にしない
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
  if (overlay.kind !== 'confirm' || composing(e)) return
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
/** 3 択（取り消し / 破棄 / 保存）: ← → ↑ ↓ でボタンを移る（確認と同じ。Enter は選んだボタン、Esc は取り消し） */
function ask3Key(e: KeyboardEvent) {
  if (overlay.kind !== 'ask3' || composing(e)) return
  const d = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : 0
  if (!d) return
  const bs = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('.actions button')]
  const i = bs.indexOf(document.activeElement as HTMLButtonElement)
  bs[Math.max(0, Math.min(bs.length - 1, (i < 0 ? bs.length - 1 : i) + d))]?.focus()
  e.preventDefault()
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
  } else if (e.key === 'ArrowDown') sel = clampSel(sel + 1, n)
  else if (e.key === 'ArrowUp') sel = Math.max(0, sel - 1)
  else if (e.key === 'Home') sel = 0
  else if (e.key === 'End')
    sel = clampSel(n - 1, n) // 空の一覧で -1 にしない
  else if (e.code === 'Space') {
    const x = it[sel]
    if (x) x.on = !x.on
  } else if (e.key === 'Enter') {
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
        if (e.key === 'Enter' && !composing(e)) {
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
  <!-- 探して選ぶダイアログと同じ骨格（lx。docs/design-dialogs.md §2）: 見出し・一覧・下の段のキー。形の図があれば、説明を名前の下に -->
  <div class="dialog lx pick" class:figs={overlay.choices.some((c) => c.fig)} role="dialog" aria-label={overlay.title} tabindex="-1" onkeydown={choiceKey} bind:this={box}>
    <div class="lx-head"><h3>{overlay.title}</h3></div>
    <div class="lx-res list" role="listbox" aria-label={overlay.title}>
      {#each overlay.choices as c, i (c.id)}
        <button type="button" class="it" class:sel={i === sel} role="option" aria-selected={i === sel} tabindex="-1" onclick={() => done(overlay.resolve, c.id)} onmousemove={() => (sel = i)}>
          {#if c.fig}<svg class="lx-fig" viewBox="0 0 56 36" aria-hidden="true">{#each SHAPE_FIG[c.fig] as [d, cls], j (j)}<path {d} class={cls ?? ''} />{/each}</svg>{/if}
          <span class="n">{c.label}</span>{#if c.hint}<span class="s">{c.hint}</span>{/if}
        </button>
      {/each}
    </div>
    <div class="lx-foot">
      <span><Keys keys="↑ ↓" /> {t('dlg.select')}</span>
      <span><Keys keys="Enter" /> {t('dlg.decide')}</span>
      <span><Keys keys="Esc" /> {t('common.cancel')}</span>
    </div>
  </div>
{:else if overlay.kind === 'checklist'}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="dialog lx pick" role="dialog" aria-label={overlay.title} tabindex="-1" onkeydown={checkKey} bind:this={box}>
    <div class="lx-head"><h3>{overlay.title}</h3></div>
    <div class="lx-res list" role="listbox" aria-label={overlay.title} aria-multiselectable="true">
      {#each overlay.items as c, i (c.id)}
        <button
          type="button"
          class="it"
          class:sel={i === sel}
          role="option"
          aria-selected={c.on}
          tabindex="-1"
          onclick={() => { sel = i; c.on = !c.on }}
          onmousemove={() => (sel = i)}
        >
          <span class="box2" class:on={c.on}>{c.on ? '✓' : ''}</span>
          <span class="n">{c.label}</span>{#if c.hint}<span class="s">{c.hint}</span>{/if}
        </button>
      {/each}
    </div>
    <div class="lx-foot">
      <span><Keys keys="↑ ↓" /> {t('dlg.select')}</span>
      <span><Keys keys="Space" /> {t('dlg.toggle')}</span>
      {#if overlay.reorder}<span><Keys keys="Alt+↑ / Alt+↓" /> {t('dlg.reorder')}</span>{/if}
      <span><Keys keys="Enter" /> {t('common.ok')}</span>
      <span><Keys keys="Esc" /> {t('common.cancel')}</span>
      {#if overlay.hint}<span class="r">{overlay.hint}</span>{/if}
    </div>
  </div>
{:else if overlay.kind === 'ask3'}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="dialog box" role="alertdialog" tabindex="-1" onkeydown={ask3Key}>
    <h3>{overlay.title}</h3>
    <p class="dim">{overlay.body}</p>
    <div class="actions">
      <button type="button" class="btn" onclick={() => done(overlay.resolve, 'cancel')}>{t('common.cancel')}</button>
      <button type="button" class="btn" onclick={() => done(overlay.resolve, 'discard')}>{t('scr.discard')}</button>
      <button type="button" class="btn primary" bind:this={first} onclick={() => done(overlay.resolve, 'save')}>{t('common.save')}</button>
    </div>
    <div class="keys muted">{t('dlg.confirmKeys')}</div>
  </div>
{/if}

<style>
  .box {
    width: 520px;
    padding: var(--s-4);
  }
  /* 選ぶ・チェックの一覧（lx の骨格） */
  .pick {
    width: 600px;
    outline: none;
  }
  .pick .lx-head {
    border-bottom: 1px solid var(--line);
  }
  .pick .it .s {
    min-width: 0;
    max-width: 60%;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* 形の図つき: 図・名前・その下に説明（説明を切らない） */
  .pick.figs .it {
    display: grid;
    grid-template-columns: 56px minmax(0, 1fr);
    gap: 1px 12px;
    height: auto;
    padding: 6px 12px;
  }
  .pick.figs .lx-fig {
    grid-row: 1 / 3;
  }
  .pick.figs .it .n {
    font-weight: 500;
  }
  .pick.figs .it .s {
    max-width: none;
    white-space: normal;
    line-height: 1.45;
  }
  .pick .it.sel .lx-fig {
    color: var(--focus);
  }
  /* 細い線（一覧の行・小さな線）は、選んだ行の地でも見えるよう、線の色を薄めて使う */
  .pick .lx-fig :global(.th) {
    stroke: currentColor;
    stroke-opacity: 0.5;
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
    font-size: var(--fs-0);
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
