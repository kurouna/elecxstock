<script lang="ts">
// ドロワー（§6.12）: 閉じているときは細い帯だけ。ポインタを 200ms 載せるか Ctrl+B で本体の上にスライドインし、
// フォーカスとポインタが外れたら閉じる。ピン留めすると本体の幅を詰めて並ぶ。帯にフォーカスがあれば ↑↓ が中の一覧に届く（FR-DR4）。
import { setFocus } from '../lib/commands'
import type { Key } from '../lib/i18n'
import { paneApi } from '../lib/panes'
import { t } from '../stores/app.svelte'
import { type Dock, layout, saveLayout, toggleDockOpen } from '../stores/layout.svelte'
import Pane from './Pane.svelte'

let { dock }: { dock: Dock } = $props()
let wrap = $state<HTMLDivElement>()
let timer: ReturnType<typeof setTimeout> | null = null
const open = $derived(layout.dockOpen || dock.pinned)

function choose(i: number, focus = true) {
  dock.active = i
  saveLayout()
  toggleDockOpen(true)
  if (focus) setFocus(dock.panes[i]!.id)
}
function enterRail() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => toggleDockOpen(true), 200)
}
function leavePanel() {
  if (dock.pinned) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    if (!wrap?.contains(document.activeElement)) toggleDockOpen(false)
  }, 300)
}
function railKey(e: KeyboardEvent) {
  const api = paneApi(dock.panes[dock.active]!.id)
  if (api?.key?.(e)) {
    e.preventDefault()
    e.stopPropagation()
  }
}
function pin() {
  dock.pinned = !dock.pinned
  layout.dockOpen = dock.pinned
  saveLayout()
}
function resize(e: MouseEvent) {
  e.preventDefault()
  const x0 = e.clientX
  const w0 = dock.width
  const move = (ev: MouseEvent) => (dock.width = Math.min(1200, Math.max(320, w0 + ev.clientX - x0)))
  const up = () => {
    removeEventListener('mousemove', move)
    removeEventListener('mouseup', up)
    saveLayout()
  }
  addEventListener('mousemove', move)
  addEventListener('mouseup', up)
}
</script>

<div class="dock" class:open class:pinned={dock.pinned} bind:this={wrap}>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div class="rail" data-dock-rail tabindex="0" title={t('drawer.hint')} onmouseenter={enterRail} onmouseleave={() => timer && clearTimeout(timer)} onkeydown={railKey} role="toolbar" aria-label="drawer">
    {#each dock.panes as p, i (p.id)}
      <button type="button" class:on={i === dock.active} onclick={() => choose(i)}><span>{t(`widget.${p.widget}` as Key)}</span></button>
    {/each}
    <span class="key">Ctrl+B</span>
  </div>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="panel" style:width={`${dock.width}px`} onmouseleave={leavePanel} onmouseenter={() => timer && clearTimeout(timer)}>
    <div class="tabs">
      {#each dock.panes as p, i (p.id)}
        <button type="button" role="tab" aria-selected={i === dock.active} onclick={() => choose(i)}>{t(`widget.${p.widget}` as Key)}</button>
      {/each}
      <span class="spacer"></span>
      <button type="button" class="pin" class:on={dock.pinned} title="Ctrl+Alt+B" onclick={pin}>⊿ {t('drawer.pin')}</button>
    </div>
    <div class="body">
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
    font-size: 10px;
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
      transform var(--motion) cubic-bezier(0.2, 0.8, 0.2, 1),
      box-shadow var(--motion) ease-out,
      visibility 0s linear var(--motion);
  }
  .dock.open .panel {
    transform: none;
    visibility: visible;
    box-shadow: 12px 0 32px rgba(0, 0, 0, 0.45);
    transition:
      transform var(--motion) cubic-bezier(0.2, 0.8, 0.2, 1),
      box-shadow var(--motion) ease-out,
      visibility 0s;
  }
  .dock.pinned .panel {
    position: static;
    box-shadow: none;
    transition: none;
  }
  .tabs {
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
    border-bottom-color: var(--focus);
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
  .edge {
    position: absolute;
    right: -3px;
    top: 0;
    bottom: 0;
    width: 6px;
    cursor: col-resize;
  }
</style>
