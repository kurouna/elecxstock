<script lang="ts">
import { refocusPane } from '../../lib/commands'
import { app, closeOverlay } from '../../stores/app.svelte'
import AlertForm from './AlertForm.svelte'
import AlertsPopup from './AlertsPopup.svelte'
import Dialogs from './Dialogs.svelte'
import FieldPicker from './FieldPicker.svelte'
import FirstRun from './FirstRun.svelte'
import Help from './Help.svelte'
import HoldingForm from './HoldingForm.svelte'
import Jump from './Jump.svelte'
import PageMenu from './PageMenu.svelte'
import Palette from './Palette.svelte'
import ScreensList from './ScreensList.svelte'
import Settings from './Settings.svelte'

// 閉じたら、フォーカスしていたペインへ戻す（閉じた要素に残すと Tab・枠の表示が迷子になる。FR-KB2, KB3）。続けて別のダイアログが開くときは戻さない
let shown = false
$effect(() => {
  const on = !!app.overlay
  if (shown && !on) refocusPane()
  shown = on
})
function backdrop(e: MouseEvent) {
  if (e.target === e.currentTarget && app.overlay?.kind !== 'firstrun') closeOverlay()
}
</script>

{#if app.overlay}
  {#if app.overlay.kind === 'jump'}
    <Jump first={app.overlay.first} />
  {:else}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <!-- マイレイアウトのメニューはタブの下に出すので、画面を暗くしない -->
    <div class="scrim" class:menu={app.overlay.kind === 'pageMenu'} onmousedown={backdrop}>
      {#if app.overlay.kind === 'palette'}
        <Palette q={app.overlay.q ?? ''} title={app.overlay.title} />
      {:else if app.overlay.kind === 'help'}
        <Help />
      {:else if app.overlay.kind === 'settings'}
        <Settings tab={app.overlay.tab ?? 'general'} />
      {:else if app.overlay.kind === 'screens'}
        <ScreensList />
      {:else if app.overlay.kind === 'pageMenu'}
        <PageMenu />
      {:else if app.overlay.kind === 'firstrun'}
        <FirstRun />
      {:else if app.overlay.kind === 'holding'}
        <HoldingForm holding={app.overlay.holding} resolve={app.overlay.resolve} />
      {:else if app.overlay.kind === 'alerts'}
        <AlertsPopup tab={app.overlay.tab} />
      {:else if app.overlay.kind === 'fieldPicker'}
        {#key app.overlay}
          <FieldPicker title={app.overlay.title} fields={app.overlay.fields} used={app.overlay.used} onAdd={app.overlay.onAdd} resolve={app.overlay.resolve} />
        {/key}
      {:else if app.overlay.kind === 'alertForm'}
        {#key app.overlay}
          <AlertForm edit={app.overlay.edit} symbol={app.overlay.symbol} screenId={app.overlay.screenId} resolve={app.overlay.resolve} />
        {/key}
      {:else}
        <!-- ダイアログが続けて開いても、選択の位置などを前のものから持ち越さない -->
        {#key app.overlay}
          <Dialogs overlay={app.overlay} />
        {/key}
      {/if}
    </div>
  {/if}
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: var(--scrim);
    z-index: 50;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding-top: 72px;
  }
  .scrim.menu {
    background: transparent;
    -webkit-app-region: no-drag;
  }
  :global(.dialog) {
    background: var(--panel-2);
    border: 1px solid var(--line-strong);
    box-shadow: var(--shadow);
    border-radius: var(--radius);
    color: var(--text);
    max-height: calc(100vh - 120px);
    /* 幅を決めたダイアログも、狭い窓・大きい文字（ルートの zoom）で左右が見切れないよう、背景の幅に収める（% は zoom の掛からない CSS の px） */
    max-width: calc(100% - 32px);
    overflow: auto;
  }
  :global(.dialog h3) {
    margin: 0 0 var(--s-2);
    font-size: var(--fs-3);
  }
  :global(.dialog .actions) {
    display: flex;
    gap: var(--s-2);
    justify-content: flex-end;
    margin-top: var(--s-3);
  }
  :global(.list .grp) {
    padding: 6px 12px 2px;
    font-size: var(--fs-1);
    color: var(--text-3);
    letter-spacing: 0.08em;
  }
  :global(.list .it) {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 28px;
    padding: 0 12px;
    cursor: pointer;
    width: 100%;
    background: none;
    border: 0;
    text-align: left;
  }
  :global(.list .it.sel) {
    background: var(--select-strong);
    box-shadow: inset 2px 0 0 var(--focus);
  }
  :global(.list .it .c) {
    font-family: var(--mono);
    color: var(--text-2);
    width: 48px;
    flex: none;
  }
  :global(.list .it .n) {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  :global(.list .it .s) {
    color: var(--text-3);
    font-size: var(--fs-1);
    white-space: nowrap;
  }
  :global(.foot) {
    display: flex;
    gap: 16px;
    padding: 6px 12px;
    border-top: 1px solid var(--line-strong);
    color: var(--text-3);
    font-size: var(--fs-1);
  }
  :global(.search) {
    width: 100%;
    height: 40px;
    background: var(--bg);
    border: 0;
    border-bottom: 1px solid var(--line-strong);
    color: var(--text);
    font-size: var(--fs-4);
    padding: 0 12px;
    outline: none;
  }
</style>
