<script lang="ts">
// ウォーターフォール（期間の内訳・配当の増減要因）。両端は合計（下を切り、波線で示す）、間は増減（上昇・下落の色。入出金は中立）
import { man1, type WfStep, waterfall } from '../../../lib/folio'
import { yen } from '../../../lib/folioTips'

let {
  steps,
  label,
  aside,
  fs = 11,
  bottom = 30,
  maxW = 46,
  cut = 0.6,
  minH = 0,
  detail,
}: {
  steps: WfStep[]
  label: (key: string) => string
  aside?: { text: string; v: number } | null
  fs?: number
  bottom?: number
  maxW?: number
  cut?: number
  minH?: number
  /** 棒のツールチップの詳細（無ければ名前と額） */
  detail?: (b: WfStep) => string
} = $props()
let hov = $state(-1)
const tipOf = (b: WfStep) => (detail ? detail(b) : `${label(b.key)} ${yen(b.v, !b.total)}`)
let w = $state(0)
let h = $state(0)
const top = $derived(fs + 6 + (aside ? fs + 2 : 0))
const bars = $derived(w > 20 && h > 20 ? waterfall(steps, w, h, { top, bottom, cut, maxW }) : [])
const tone = (b: WfStep) => (b.total ? 'tot' : b.flow ? 'flow' : Math.abs(b.v) < 1 ? 'zero' : b.v > 0 ? 'up' : 'down')
</script>

<div class="wf" style:min-height={`${minH}px`} bind:clientWidth={w} bind:clientHeight={h}>
  {#if bars.length}
    <svg viewBox={`0 0 ${w} ${h}`}>
      {#if aside}<text x="0" y={top - fs - 4} font-size={fs} class="aside">{aside.text} <tspan class="gold">{man1(aside.v, true)}</tspan></text>{/if}
      {#each bars as b, i (b.key)}
        <rect x={b.x} y={b.top} width={b.w} height={b.h} rx="1.5" class={`b ${tone(b)}`} class:hov={i === hov} class:fade={hov >= 0 && i !== hov} />
        {#if b.total}<path d={`M${b.x},${h - bottom - 6} l${b.w / 4},-3 l${b.w / 4},3 l${b.w / 4},-3 l${b.w / 4},3`} class="cutmark" />{/if}
        {#if i < bars.length - 1}<line x1={b.x + b.w} x2={bars[i + 1]!.x} y1={b.link} y2={b.link} class="link" />{/if}
        <text x={b.x + b.w / 2} y={b.top - 4} font-size={fs} class={`v ${tone(b)}`}>{b.total ? man1(b.v) : Math.abs(b.v) < 1 ? '±0' : man1(b.v, true)}</text>
        <text x={b.x + b.w / 2} y={h - bottom + fs + 3} font-size={fs} class="k">{label(b.key)}</text>
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <rect x={b.x - 4} y="0" width={b.w + 8} height={h} class="hit" onmouseenter={() => (hov = i)} onmouseleave={() => (hov = -1)}><title>{tipOf(b)}</title></rect>
      {/each}
    </svg>
  {/if}
</div>

<style>
.wf {
  position: relative;
  flex: 1 1 0;
}
svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.b.tot {
  fill: var(--f-bar);
}
.b.up {
  fill: var(--up);
  opacity: 0.88;
}
.b.down {
  fill: var(--down);
  opacity: 0.88;
}
.b.flow,
.b.zero {
  fill: var(--text-3);
}
.b {
  transition:
    opacity var(--motion),
    filter var(--motion);
}
.b.fade {
  opacity: 0.4;
}
.b.hov {
  filter: brightness(1.18);
}
.hit {
  fill: transparent;
}
.cutmark {
  fill: none;
  stroke: var(--panel);
  stroke-width: 2;
}
.link {
  stroke: var(--text-3);
  stroke-dasharray: 2 2;
}
text {
  text-anchor: middle;
}
.v {
  font-family: var(--mono);
}
.v.tot {
  fill: var(--text);
  font-weight: 600;
}
.v.up {
  fill: var(--up);
}
.v.down {
  fill: var(--down);
}
.v.flow,
.v.zero {
  fill: var(--text-2);
}
.k {
  fill: var(--text-2);
}
.aside {
  text-anchor: start;
  fill: var(--text-3);
}
.gold {
  fill: var(--gold);
  font-family: var(--mono);
}
</style>
