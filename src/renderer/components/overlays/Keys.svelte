<script lang="ts">
// キーの表記を kbd で 1 キーずつ描く（docs/design-dialogs.md §2）。' / ' は別の組み合わせ、空白は並び、+ は同時押し。
// hit を渡すと、その組み合わせに当たる組み合わせの kbd だけ印を付ける（ショートカット一覧のキーを押して探す）。changed は既定から変えたキー
import { keyCombos } from '../../lib/keys'

let { keys, hit = '', changed = false }: { keys: string; hit?: string; changed?: boolean } = $props()
const alts = $derived(keyCombos(keys, hit))
</script>

<span class="lx-keys">
  {#each alts as alt, a (a)}
    {#if a}<span class="or">/</span>{/if}
    {#each alt as c, j (j)}
      <span class="combo">
        {#each c.keys as k, i (i)}{#if i}<span class="pl">+</span>{/if}<kbd class:hit={c.hit || changed}>{k}</kbd>{/each}
      </span>
    {/each}
  {/each}
</span>
