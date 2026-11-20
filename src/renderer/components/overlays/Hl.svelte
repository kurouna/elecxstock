<script lang="ts">
// 当たった文字の強調（docs/design-dialogs.md §2）。{@html} を使わず、区切った文字列を描く
import { segments } from '@shared/match'

let { text, ranges = [] }: { text: string; ranges?: readonly [number, number][] } = $props()
const parts = $derived(segments(text, ranges))
</script>

{#each parts as p, i (i)}{#if p.hit}<mark>{p.text}</mark>{:else}{p.text}{/if}{/each}
