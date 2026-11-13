<script lang="ts">
// ペインの見出し（FR-V5）: リンク色の印・種類・主要な値。操作ボタンはポインタを載せたときかフォーカス中に出す。
import type { Snippet } from 'svelte'
import { keyOf, runAction, setFocus } from '../lib/commands'
import type { Key } from '../lib/i18n'
import { confirmCloseScreen } from '../lib/screens'
import { app, t } from '../stores/app.svelte'
import { closePane, inDock, type PaneNode } from '../stores/layout.svelte'
import { DRAG_MIME } from './dragPane'

let { pane, children }: { pane: PaneNode; children?: Snippet } = $props()
const focused = $derived(app.focus === pane.id)
/** このペインにフォーカスを移してからアクションを実行する（見出しのボタン） */
function act(id: string) {
  setFocus(pane.id)
  runAction(id)
}
</script>

<!-- タイトルをドラッグして別のペインの上下左右に落とすと移動、真ん中で入れ替え（FR-L2。キーは Ctrl+Alt+Shift+矢印） -->
<div
  class="ph"
  class:focused
  draggable="true"
  role="toolbar"
  tabindex="-1"
  ondragstart={(e) => {
    e.dataTransfer?.setData(DRAG_MIME, pane.id)
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
    document.body.classList.add('dragging-pane')
  }}
  ondragend={() => document.body.classList.remove('dragging-pane')}
>
  <span class={`link l${pane.link}`} title={`${t('link.set', { n: pane.link || '—' })} (Ctrl+${pane.link})`}>{pane.link || '·'}</span>
  {#if !inDock(pane.id)}<span class="title">{t(`widget.${pane.widget}` as Key)}</span>{/if}
  {#if children}{@render children()}{/if}
  <span class="spacer"></span>
  {#if inDock(pane.id)}
    <span class="tools">
      <button type="button" title={t('act.fromDrawer')} aria-label={t('act.fromDrawer')} onclick={() => act('fromDrawer')}>⇲</button>
    </span>
  {:else}
    <span class="tools">
      <!-- ドロワーへ移すと、帯にポインタを載せたときだけ出る（自動で隠れる・ピン留めできる。FR-DR3） -->
      <button type="button" title={t('act.toDrawer')} aria-label={t('act.toDrawer')} onclick={() => act('toDrawer')}>⇤</button>
      <button type="button" title={`${t('act.max')} (${keyOf('max')})`} aria-label={t('act.max')} onclick={() => act('max')}>⤢</button>
      <button type="button" title={`${t('act.close')} (${keyOf('close')})`} aria-label={t('act.close')} onclick={async () => { if (await confirmCloseScreen(pane)) closePane(pane.id) }}>✕</button>
    </span>
  {/if}
</div>

<style>
  .ph {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    height: 28px;
    padding: 0 var(--s-2);
    border-bottom: 1px solid var(--line);
    border-top: 2px solid transparent;
    background: var(--panel);
    flex: none;
    min-width: 0;
    white-space: nowrap;
  }
  .ph.focused {
    border-top-color: var(--focus);
    background: var(--panel-2);
  }
  .title {
    font-size: var(--fs-2);
    font-weight: 600;
    color: var(--text-3);
    flex: none;
  }
  .ph.focused .title {
    color: var(--text);
  }
  .spacer {
    flex: 1;
  }
  .tools {
    display: flex;
    gap: 4px;
    opacity: 0;
    transition: opacity var(--motion);
  }
  :global(.pane:hover) .tools,
  .ph.focused .tools {
    opacity: 1;
  }
  .tools button {
    background: none;
    border: 1px solid transparent;
    color: var(--text-3);
    height: 18px;
    padding: 0 6px;
    border-radius: var(--radius);
    cursor: pointer;
    font-size: var(--fs-1);
  }
  .tools button:hover {
    border-color: var(--line-strong);
    color: var(--text);
  }
  @container (max-width: 520px) {
    .title {
      display: none;
    }
  }
</style>
