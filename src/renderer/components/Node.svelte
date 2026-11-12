<script lang="ts">
// レイアウトの木を描く（再帰）。区切り線はドラッグで動かし、ダブルクリックで両隣を等分する（FR-L1）。
import { app } from '../stores/app.svelte'
import { type LNode, type SplitNode, setSizes } from '../stores/layout.svelte'
import Node from './Node.svelte'
import Pane from './Pane.svelte'

let { node }: { node: LNode } = $props()
let el = $state<HTMLDivElement>()

function drag(e: MouseEvent, split: SplitNode, i: number) {
  e.preventDefault()
  const kids = [...el!.children].filter((c) => !(c as HTMLElement).classList.contains('gutter')) as HTMLElement[]
  const a = kids[i]!.getBoundingClientRect()
  const b = kids[i + 1]!.getBoundingClientRect()
  const row = split.dir === 'row'
  const start = row ? a.left : a.top
  const span = row ? b.right - a.left : b.bottom - a.top
  const total = split.sizes[i]! + split.sizes[i + 1]!
  document.body.classList.add(row ? 'resizing-x' : 'resizing-y')
  const move = (ev: MouseEvent) => {
    const r = Math.max(0.08, Math.min(0.92, ((row ? ev.clientX : ev.clientY) - start) / span))
    const s = [...split.sizes]
    s[i] = total * r
    s[i + 1] = total * (1 - r)
    split.sizes = s
  }
  const up = () => {
    removeEventListener('mousemove', move)
    removeEventListener('mouseup', up)
    document.body.classList.remove('resizing-x', 'resizing-y')
    setSizes(split, [...split.sizes])
  }
  addEventListener('mousemove', move)
  addEventListener('mouseup', up)
}
function even(split: SplitNode, i: number) {
  const s = [...split.sizes]
  const total = s[i]! + s[i + 1]!
  s[i] = total / 2
  s[i + 1] = total / 2
  setSizes(split, s)
}
</script>

{#if node.kind === 'pane'}
  <Pane pane={node} />
{:else}
  <div class="split" class:col={node.dir === 'col'} bind:this={el}>
    {#each node.children as child, i (child.id)}
      <div class="cell" style:flex={`${node.sizes[i]} 1 0`}>
        <Node node={child} />
      </div>
      {#if i < node.children.length - 1}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="gutter"
          title={app.settings.lang === 'ja' ? 'ドラッグで大きさを変える・ダブルクリックで等分（キー: Alt+Shift+矢印）' : 'Drag to resize, double-click to even (Alt+Shift+Arrows)'}
          onmousedown={(e) => drag(e, node as SplitNode, i)}
          ondblclick={() => even(node as SplitNode, i)}
        ></div>
      {/if}
    {/each}
  </div>
{/if}

<style>
  .split {
    display: flex;
    width: 100%;
    height: 100%;
  }
  .split.col {
    flex-direction: column;
  }
  .cell {
    min-width: 0;
    min-height: 0;
    position: relative;
  }
  .gutter {
    flex: 0 0 3px;
    background: var(--line);
    position: relative;
    z-index: 5;
    cursor: col-resize;
  }
  .split.col > .gutter {
    cursor: row-resize;
  }
  .gutter::after {
    content: '';
    position: absolute;
    inset: -3px;
  }
  .gutter:hover {
    background: var(--focus);
    transition: background 80ms 120ms;
  }
  :global(body.resizing-x),
  :global(body.resizing-x *) {
    cursor: col-resize !important;
  }
  :global(body.resizing-y),
  :global(body.resizing-y *) {
    cursor: row-resize !important;
  }
</style>
