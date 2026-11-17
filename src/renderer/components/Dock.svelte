<script lang="ts">
import { untrack } from 'svelte'
// ドロワー（§6.12）: 閉じているときは細い帯だけ。ポインタを 200ms 載せるか Ctrl+B で本体の上にスライドインし、
// フォーカスとポインタが外れたら閉じる。ピン留めすると本体の幅を詰めて並ぶ。帯にフォーカスがあれば ↑↓ が中の一覧に届く（FR-DR4）。
import { keyOf, setFocus } from '../lib/commands'
import type { Key } from '../lib/i18n'
import { ink } from '../lib/ink'
import { playIn, takeTabHint } from '../lib/paneMax'
import { drawerSlide, identity } from '../lib/paneMotion'
import { paneApi } from '../lib/panes'
import { rootZoom } from '../lib/pointer'
import { t } from '../stores/app.svelte'
import { type Dock, type DockSide, layout, moveToDock, saveLayout, toggleDockOpen } from '../stores/layout.svelte'
import { DRAG_MIME } from './dragPane'
import Pane from './Pane.svelte'

let { dock, side = 'left' }: { dock: Dock; side?: DockSide } = $props()
let wrap = $state<HTMLDivElement>()
let timer: ReturnType<typeof setTimeout> | null = null
const open = $derived(layout.dockOpen === side || dock.pinned)

// タブを替えたときの動き（FR-V9。docs/design-motion.md）。このコンポーネントはレイアウトのタブをまたいで使い回され、
// dock だけが別のタブのドロワーに替わるので、持ち主（dockId）が替わったら初めて出したのと同じに扱う（滑らせない）。
// ドロワーが開いて落ち着いてからだけ動かす（閉じた状態からタブを選ぶと、開く動きと重なるため）
const dockId = $derived(identity(dock))
const activeId = $derived(dock.panes[dock.active]?.id ?? null)
let shown = $state(false)
$effect(() => {
  if (!open) {
    shown = false
    return
  }
  const r = requestAnimationFrame(() => (shown = true))
  return () => cancelAnimationFrame(r)
})
// 下線（lib/ink.ts）: 選んだタブ。ペインの出し入れでも測り直す
let tabsEl = $state<HTMLElement>()
const inkPick = (): HTMLElement[] => [...(tabsEl?.querySelectorAll<HTMLElement>('[role="tab"][aria-selected="true"]') ?? [])]
// 出てきた中身を少し滑らせて入れる。比べるのは番号ではなくペインの ID（前のペインを外して番号が詰まっても動かさない）
let bodyEl = $state<HTMLElement>()
let lastId: string | null = null
let lastDock = -1
$effect(() => {
  const id = activeId
  const d = dockId
  const ids = dock.panes.map((p) => p.id)
  const hint = takeTabHint()
  const dir =
    d === lastDock
      ? drawerSlide(
          lastId,
          id,
          ids,
          hint,
          untrack(() => shown),
        )
      : null
  if (dir !== null) playIn(bodyEl?.children[ids.indexOf(id!)], dir, bodyEl)
  lastId = id
  lastDock = d
})

function choose(i: number, focus = true) {
  dock.active = i
  saveLayout()
  toggleDockOpen(true, side)
  if (focus) setFocus(dock.panes[i]!.id)
}
function enterRail() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => toggleDockOpen(true, side), 200)
}
function leavePanel() {
  if (dock.pinned) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    if (!wrap?.contains(document.activeElement)) toggleDockOpen(false, side)
  }, 300)
}
/** 帯から、開いたドロワーを通らずに離れたときも閉じる（開く前に離れたら開かない） */
function leaveRail(e: MouseEvent) {
  if (timer) clearTimeout(timer)
  if (!wrap?.contains(e.relatedTarget as Node | null)) leavePanel()
}
function railKey(e: KeyboardEvent) {
  const api = paneApi(dock.panes[dock.active]!.id)
  if (api?.key?.(e)) {
    e.preventDefault()
    e.stopPropagation()
  }
}
/** ペインのタイトルをドロワーの帯・タブに落とすと、ドロワーへ移す（FR-DR6） */
function dragOver(e: DragEvent) {
  if (e.dataTransfer?.types.includes(DRAG_MIME)) e.preventDefault()
}
function dropIn(e: DragEvent) {
  const id = e.dataTransfer?.getData(DRAG_MIME)
  if (!id) return
  e.preventDefault()
  if (moveToDock(id, side)) {
    toggleDockOpen(true, side)
    setFocus(id)
  }
}
function pin() {
  dock.pinned = !dock.pinned
  layout.dockOpen = dock.pinned ? side : null
  saveLayout()
}
function resize(e: MouseEvent) {
  e.preventDefault()
  const x0 = e.clientX
  const w0 = dock.width
  // ポインタの動き（表示倍率が掛かった px）を幅（CSS の px）に直す
  const z = rootZoom()
  const move = (ev: MouseEvent) => (dock.width = Math.min(1200, Math.max(320, w0 + ((ev.clientX - x0) / z) * (side === 'left' ? 1 : -1))))
  const up = () => {
    removeEventListener('mousemove', move)
    removeEventListener('mouseup', up)
    saveLayout()
  }
  addEventListener('mousemove', move)
  addEventListener('mouseup', up)
}
</script>

<div class="dock" class:open class:pinned={dock.pinned} class:right={side === 'right'} bind:this={wrap}>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div class="rail" data-dock-rail={side} tabindex="0" title={t('drawer.hint')} onmouseenter={enterRail} onmouseleave={leaveRail} onkeydown={railKey} ondragover={dragOver} ondrop={dropIn} role="toolbar" aria-label="drawer">
    {#each dock.panes as p, i (p.id)}
      <button type="button" class:on={i === dock.active} onclick={() => choose(i)}><span>{t(`widget.${p.widget}` as Key)}</span></button>
    {/each}
    <span class="key">{keyOf(side === 'left' ? 'drawer' : 'drawerRight')}</span>
  </div>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="panel" style:width={`${dock.width}px`} onmouseleave={leavePanel} onmouseenter={() => timer && clearTimeout(timer)}>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="tabs" bind:this={tabsEl} ondragover={dragOver} ondrop={dropIn}>
      {#each dock.panes as p, i (p.id)}
        <button type="button" role="tab" aria-selected={i === dock.active} onclick={() => choose(i)}>{t(`widget.${p.widget}` as Key)}</button>
      {/each}
      <span class="spacer"></span>
      <button type="button" class="pin" class:on={dock.pinned} title={keyOf('drawerPin')} onclick={pin}>⊿ {t('drawer.pin')}</button>
      <span class="ink" aria-hidden="true" use:ink={{ key: activeId ?? '', group: String(dockId), slide: shown, pick: inkPick }}></span>
    </div>
    <div class="body" bind:this={bodyEl}>
      {#each dock.panes as p, i (p.id)}
        <div class="slot" hidden={i !== dock.active}>
          <Pane pane={p} />
        </div>
      {/each}
    </div>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="edge" onmousedown={resize}></div>
  </div>
</div>

<style>
  .dock {
    position: relative;
    flex: none;
    display: flex;
    height: 100%;
    z-index: 20;
  }
  .rail {
    position: relative;
    z-index: 2;
    width: 28px;
    background: var(--panel);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding-top: 6px;
    outline: none;
  }
  .rail:focus-visible {
    box-shadow: inset 0 0 0 1px var(--focus);
  }
  .rail button {
    writing-mode: vertical-rl;
    background: none;
    border: 0;
    border-left: 2px solid transparent;
    color: var(--text-3);
    padding: 10px 4px;
    cursor: pointer;
    font-size: var(--fs-1);
    letter-spacing: 0.08em;
    width: 100%;
  }
  .rail button.on {
    color: var(--text);
    border-left-color: var(--focus);
    background: var(--panel-2);
  }
  .key {
    margin-top: auto;
    margin-bottom: 8px;
    writing-mode: vertical-rl;
    font-family: var(--mono);
    font-size: var(--fs-0);
    color: var(--text-3);
  }
  /* スライドイン（FR-DR5: 150ms 以下）。display は切り替えず transform と visibility で出し入れする */
  .panel {
    position: absolute;
    z-index: 1;
    left: 28px;
    top: 0;
    bottom: 0;
    background: var(--panel);
    border-right: 1px solid var(--line-strong);
    display: flex;
    flex-direction: column;
    transform: translateX(calc(-100% - 28px));
    visibility: hidden;
    transition:
      transform var(--motion) var(--ease-out),
      box-shadow var(--motion) ease-out,
      visibility 0s linear var(--motion);
  }
  .dock.open .panel {
    transform: none;
    visibility: visible;
    box-shadow: 12px 0 32px rgba(0, 0, 0, 0.45);
    transition:
      transform var(--motion) var(--ease-out),
      box-shadow var(--motion) ease-out,
      visibility 0s;
  }
  .dock.pinned .panel {
    position: static;
    box-shadow: none;
    transition: none;
  }
  .tabs {
    position: relative;
    display: flex;
    align-items: center;
    height: 28px;
    border-bottom: 1px solid var(--line);
    padding: 0 4px;
    flex: none;
  }
  .tabs button {
    background: none;
    border: 0;
    border-bottom: 2px solid transparent;
    color: var(--text-3);
    height: 28px;
    padding: 0 10px;
    cursor: pointer;
  }
  .tabs button[aria-selected='true'] {
    color: var(--text);
  }
  .tabs .spacer {
    flex: 1;
  }
  .tabs .pin {
    font-size: var(--fs-1);
  }
  .tabs .pin.on {
    color: var(--focus);
  }
  .body {
    flex: 1;
    min-height: 0;
    position: relative;
  }
  .slot {
    position: absolute;
    inset: 0;
  }
  .slot[hidden] {
    display: none;
  }
  /* 右のドロワー: 帯は右端、パネルは左へ開く */
  .dock.right {
    flex-direction: row-reverse;
  }
  .dock.right .panel {
    left: auto;
    right: 28px;
    border-right: 0;
    border-left: 1px solid var(--line-strong);
    transform: translateX(calc(100% + 28px));
  }
  .dock.right.open .panel {
    transform: none;
    box-shadow: -12px 0 32px rgba(0, 0, 0, 0.45);
  }
  .dock.right.pinned .panel {
    box-shadow: none;
  }
  .dock.right .rail button {
    border-left: 0;
    border-right: 2px solid transparent;
  }
  .dock.right .rail button.on {
    border-right-color: var(--focus);
  }
  .dock.right .edge {
    right: auto;
    left: -3px;
  }
  .edge {
    position: absolute;
    right: -3px;
    top: 0;
    bottom: 0;
    width: 6px;
    cursor: col-resize;
  }
</style>
