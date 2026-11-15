<script lang="ts">
// カードの見出しの切り替え（期間・分類・色など）。キー（Alt+1〜6・G・H・T・P）と同じ切り替えを、押しても選べる
let { items, on, label, onpick }: { items: string[]; on: number; label: string; onpick: (i: number) => void } = $props()
</script>

<span class="seg" role="radiogroup" aria-label={label}>
  {#each items as x, i (i)}
    <button type="button" role="radio" aria-checked={i === on} class:on={i === on} tabindex="-1" onclick={() => onpick(i)}>{x}</button>
  {/each}
</span>

<style>
.seg {
  display: inline-flex;
  gap: 1px;
}
button {
  padding: 0 6px;
  font: inherit;
  font-size: var(--fs-1);
  color: var(--text-3);
  line-height: 18px;
  border-radius: var(--radius);
  white-space: nowrap;
  background: none;
  border: 0;
  cursor: pointer;
}
button:hover {
  color: var(--text-2);
  background: var(--hover);
}
button.on {
  background: var(--panel-3);
  color: var(--text);
}
</style>
