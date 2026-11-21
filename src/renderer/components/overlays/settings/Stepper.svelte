<script lang="ts">
// 設定のステッパー（docs/design-dialogs.md §6）: − 値 ＋。← → は仮の値（点線の枠）、Enter で 1 回だけ決める。
// 「決める」のボタンは場所を取ったまま出し入れする（押している間に − ＋ の位置が動かないように。CLAUDE.md）
import Keys from '../Keys.svelte'

let {
  text,
  label,
  canDown,
  canUp,
  pending,
  commitText,
  downLabel,
  upLabel,
  danger = false,
  onstep,
  oncommit,
}: {
  text: string
  label: string
  canDown: boolean
  canUp: boolean
  pending: boolean
  commitText: string
  downLabel: string
  upLabel: string
  danger?: boolean
  onstep: (d: 1 | -1) => void
  oncommit: () => void
} = $props()
let commitEl = $state<HTMLButtonElement>()
let valueEl = $state<HTMLButtonElement>()
// 「決める」が隠れるとき（決めた・やめた）にフォーカスを持っていたら、値のボタンへ戻す（body へ落とさない）
$effect.pre(() => {
  if (!pending && commitEl && document.activeElement === commitEl) queueMicrotask(() => valueEl?.focus())
})
function key(e: KeyboardEvent) {
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') onstep(e.key === 'ArrowRight' ? 1 : -1)
  // Enter は仮の値があるときだけ（無ければ − ＋ のボタンの Enter のまま）
  else if (e.key === 'Enter' && pending) oncommit()
  else return
  e.preventDefault()
  e.stopPropagation()
}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<span class="stepper" onkeydown={key}>
  <span class="stp" class:pend={pending}>
    <button type="button" class="b" aria-label={downLabel} aria-disabled={!canDown || undefined} onclick={() => canDown && onstep(-1)}>−</button>
    <button type="button" class="v" bind:this={valueEl} data-primary aria-label="{label} {text}">{text}</button>
    <button type="button" class="b" aria-label={upLabel} aria-disabled={!canUp || undefined} onclick={() => canUp && onstep(1)}>＋</button>
  </span>
  <button type="button" class="btn commit" bind:this={commitEl} class:dng={danger} class:hid={!pending} tabindex={pending ? 0 : -1} aria-hidden={!pending || undefined} onclick={oncommit}>
    {commitText} <Keys keys="Enter" />
  </button>
</span>

<style>
  .stepper {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .stp {
    display: inline-flex;
    align-items: center;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-ctl);
    background: var(--panel-2);
  }
  .stp.pend {
    border-color: var(--focus);
    border-style: dashed;
  }
  .stp button {
    height: 26px;
    background: none;
    border: 0;
    cursor: pointer;
    color: var(--text-2);
  }
  .stp .b {
    width: 26px;
  }
  /* 端で押せないとき: 不透明度ではなく色で薄くする（§2.1） */
  .stp .b[aria-disabled='true'] {
    color: var(--line-strong);
    cursor: default;
  }
  .stp .v {
    min-width: 64px;
    font-family: var(--mono);
    color: var(--text);
  }
  .commit {
    border-color: var(--focus);
  }
  .commit.dng {
    color: var(--danger);
    border-color: var(--danger-line);
    background: var(--danger-bg);
  }
  .commit.hid {
    visibility: hidden;
  }
</style>
