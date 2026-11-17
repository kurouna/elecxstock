<script lang="ts">
import { setFocus } from '../lib/commands'
import { playIn } from '../lib/paneMax'
import { slideDir } from '../lib/paneMotion'
import { app, t } from '../stores/app.svelte'
import { allPanes, findPane, layout, moveToEdge, PRESET_FOCUS, PRESET_IDS, toggleDockOpen, viewKey } from '../stores/layout.svelte'
import Dock from './Dock.svelte'
import { DRAG_MIME } from './dragPane'
import Node from './Node.svelte'

// レイアウトを開いたとき、フォーカスが無ければそのタブの主役のペイン（PRESET_FOCUS）か最初のペインに置く
// （キーボードだけで始められるように）。マイレイアウトでページを替えたときも同じ（FR-L14）
const view = $derived(viewKey())
$effect(() => {
  void view
  if (!findPane(app.focus)) {
    const panes = allPanes(layout.entry, false)
    const want = PRESET_FOCUS[layout.doc.active]
    const first = (want && panes.find((p) => p.widget === want)) || panes[0]
    if (first) setFocus(first.id)
  }
})

// タブ・ページを替えたら、新しい中身を少し滑らせて入れる（FR-V9。docs/design-motion.md）。起動したときは動かさない
let mainEl = $state<HTMLElement>()
let lastView: string | null = null
$effect(() => {
  const v = view
  if (lastView !== null && lastView !== v) playIn(mainEl, slideDir(lastView, v, PRESET_IDS))
  lastView = v
})

// 画面の外側の端（ドラッグ中だけ出る細い帯）: 落とすと、いちばん外に新しい列・行を足す（FR-L2）
type Edge = 'left' | 'right' | 'top' | 'bottom'
const EDGES: Edge[] = ['left', 'right', 'top', 'bottom']
let edgeOn = $state<Edge | null>(null)
function edgeOver(e: DragEvent, side: Edge) {
  if (!e.dataTransfer?.types.includes(DRAG_MIME)) return
  e.preventDefault()
  edgeOn = side
}
// ペインを動かすと元の見出しが作り直され、dragend が届かないことがある。どこで終わっても帯を隠す
$effect(() => {
  const clear = () => {
    document.body.classList.remove('dragging-pane')
    edgeOn = null
  }
  window.addEventListener('dragend', clear, true)
  window.addEventListener('drop', clear, true)
  return () => {
    window.removeEventListener('dragend', clear, true)
    window.removeEventListener('drop', clear, true)
  }
})
function edgeDrop(e: DragEvent, side: Edge) {
  const src = e.dataTransfer?.getData(DRAG_MIME)
  edgeOn = null
  if (!src) return
  e.preventDefault()
  if (moveToEdge(src, side)) {
    layout.dockOpen = null
    setFocus(src)
  }
}
</script>

<div class="wsp">
  {#if layout.entry.docks.left}
    <Dock dock={layout.entry.docks.left} side="left" />
  {/if}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="main" bind:this={mainEl} onmousedown={() => toggleDockOpen(false)}>
    {#key view}
      <Node node={layout.entry.root} />
    {/key}
    {#each EDGES as side (side)}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class={`edge ${side}`}
        data-edge={side}
        ondragover={(e) => edgeOver(e, side)}
        ondragleave={() => (edgeOn = edgeOn === side ? null : edgeOn)}
        ondrop={(e) => edgeDrop(e, side)}
      ></div>
    {/each}
    {#if edgeOn}
      <div class={`edge-preview ${edgeOn}`}><span>{t(edgeOn === 'left' || edgeOn === 'right' ? 'layout.newColumn' : 'layout.newRow')}</span></div>
    {/if}
  </div>
  {#if layout.entry.docks.right}
    <Dock dock={layout.entry.docks.right} side="right" />
  {/if}
</div>

<style>
  .wsp {
    display: flex;
    height: 100%;
    gap: 1px;
  }
  .main {
    position: relative;
    flex: 1;
    min-width: 0;
    height: 100%;
  }
  /* 外側の端の帯: ペインをドラッグしている間だけ、ペインより手前に出す */
  .edge {
    position: absolute;
    z-index: 60;
    display: none;
  }
  :global(body.dragging-pane) .edge {
    display: block;
  }
  .edge.left,
  .edge.right {
    top: 0;
    bottom: 0;
    width: 14px;
  }
  .edge.left {
    left: 0;
  }
  .edge.right {
    right: 0;
  }
  .edge.top,
  .edge.bottom {
    left: 14px;
    right: 14px;
    height: 14px;
  }
  .edge.top {
    top: 0;
  }
  .edge.bottom {
    bottom: 0;
  }
  .edge-preview {
    position: absolute;
    z-index: 55;
    pointer-events: none;
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--focus) 22%, transparent);
    border: 2px solid var(--focus);
    color: var(--text);
    font-size: var(--fs-2);
  }
  .edge-preview.left {
    inset: 0 auto 0 0;
    width: 22%;
  }
  .edge-preview.right {
    inset: 0 0 0 auto;
    width: 22%;
  }
  .edge-preview.top {
    inset: 0 0 auto 0;
    height: 22%;
  }
  .edge-preview.bottom {
    inset: auto 0 0 0;
    height: 22%;
  }
  .edge-preview span {
    padding: 2px 8px;
    border-radius: var(--radius);
    background: var(--panel-3);
  }
</style>
