<script lang="ts">
// 下の段のキーの案内（kbd と働きの組）。確認・名前の入力・アラート・保有のフォームと一覧で同じ書き方にする（docs/design-dialogs.md §2）。
// inline は外枠を作らず並べるだけ（lx-foot の中に置く）。items は [キー, 働き]（キーの書き方は Keys.svelte: ' / ' は別の組み合わせ、空白は続けて押す、+ は同時押し）。lead は先頭に置く前置き
import Keys from './Keys.svelte'

let {
  items,
  lead = '',
  align = 'end',
  inline = false,
}: { items: readonly (readonly [keys: string, label: string])[]; lead?: string; align?: 'start' | 'end'; inline?: boolean } = $props()
</script>

{#snippet list()}
  {#if lead}<span class="lead">{lead}</span>{/if}
  {#each items as [k, l] (`${k} ${l}`)}<span class="kh"><Keys keys={k} /> {l}</span>{/each}
{/snippet}

{#if inline}{@render list()}{:else}<div class="dkeys" class:start={align === 'start'}>{@render list()}</div>{/if}

<style>
  .dkeys {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    align-items: center;
    gap: 4px 14px;
    margin-top: var(--s-3);
    font-size: var(--fs-1);
    color: var(--text-3);
  }
  .dkeys.start {
    justify-content: flex-start;
  }
  .kh {
    white-space: nowrap;
  }
  .lead {
    color: var(--text-2);
  }
</style>
