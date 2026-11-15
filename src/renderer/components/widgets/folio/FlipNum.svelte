<script lang="ts">
// めくり表示（FR-PF8）: 更新で変わった数字の桁だけを短く縦にめくる。途中の値は出さない（カウントアップとは違う）。
// 動きを止める設定（data-reduce-motion）では CSS で止まる
import { flipMask } from '@shared/folio'
import { untrack } from 'svelte'

let { text, cls = '' }: { text: string; cls?: string } = $props()
let prev = ''
let gen = $state(0)
const chars = $derived.by(() => {
  const mask = prev && prev !== text ? flipMask(prev, text) : [...text].map(() => false)
  const out = [...text].map((ch, i) => ({ ch, flip: mask[i] ?? false }))
  return out
})
$effect(() => {
  // 文字が変わるたびに作り直してめくる（gen は読むと自分を呼び直すので untrack）
  const t = text
  untrack(() => gen++)
  queueMicrotask(() => (prev = t))
})
</script>

<span class={`num ${cls}`} aria-label={text}>
  {#key gen}{#each chars as c, i (i)}{#if c.flip}<span class="flip" aria-hidden="true">{c.ch}</span>{:else}<span aria-hidden="true">{c.ch}</span>{/if}{/each}{/key}
</span>

<style>
.flip {
  display: inline-block;
  animation: flip var(--motion) ease-out;
}
@keyframes flip {
  from {
    transform: translateY(-55%);
    opacity: 0;
  }
  to {
    transform: none;
    opacity: 1;
  }
}
:global(:root[data-reduce-motion='true']) .flip {
  animation: none;
}
</style>
