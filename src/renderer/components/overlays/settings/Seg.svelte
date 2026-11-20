<script lang="ts" generics="T extends string">
// 設定のセグメント（docs/design-dialogs.md §6）: 選択肢のボタンを並べ、← → で選ぶ（フォーカスは選んだボタンへ。roving tabindex）。
// item を渡すと選択肢の中身（テーマ・ローソク足の見本）を描く。variant は見た目（文字だけ・見本つき）
import type { Snippet } from 'svelte'
import { segStep } from '../../../lib/settingsSpec'

let {
  options,
  value,
  label,
  variant = 'text',
  onchange,
  item,
}: {
  options: readonly { v: T; label: string }[]
  value: T
  label: string
  variant?: 'text' | 'card' | 'stack'
  onchange: (v: T) => void
  item?: Snippet<[{ v: T; label: string }]>
} = $props()
let el = $state<HTMLElement>()
function key(e: KeyboardEvent) {
  const v = segStep(
    options.map((o) => o.v),
    value,
    e.key,
  )
  if (v == null) return
  e.preventDefault()
  e.stopPropagation()
  if (v !== value) onchange(v)
  queueMicrotask(() => el?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus())
}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<span class="seg-{variant === 'stack' ? 'card stack' : variant}" role="group" aria-label={label} bind:this={el} onkeydown={key}>
  {#each options as o (o.v)}
    {@const on = o.v === value}
    <button type="button" class:on aria-pressed={on} tabindex={on ? 0 : -1} data-primary={on ? '' : undefined} onclick={() => onchange(o.v)}>
      {#if item}{@render item(o)}{:else}{o.label}{/if}
    </button>
  {/each}
</span>

<style>
  .seg-text {
    display: inline-flex;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-ctl);
    overflow: hidden;
    background: var(--panel-2);
  }
  .seg-text button {
    height: 26px;
    padding: 0 12px;
    background: none;
    border: 0;
    cursor: pointer;
    color: var(--text-2);
    font-size: var(--fs-2);
    white-space: nowrap;
  }
  .seg-text button + button {
    border-left: 1px solid var(--line-strong);
  }
  .seg-text button.on {
    background: var(--select-strong);
    color: var(--text);
    box-shadow: inset 0 -2px 0 var(--focus);
  }
  .seg-card {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .seg-card button {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px 4px 6px;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-dlg);
    background: var(--panel-2);
    cursor: pointer;
    color: var(--text-2);
    font-size: var(--fs-1);
  }
  .stack button {
    flex-direction: column;
    padding: 4px;
  }
  .seg-card button.on {
    border-color: var(--focus);
    box-shadow: 0 0 0 1px var(--focus);
    color: var(--text);
  }
</style>
