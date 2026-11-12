<script lang="ts">
// ペインの見出し（FR-V5）: リンク色の印・種類・主要な値。操作ボタンはポインタを載せたときかフォーカス中に出す。
import type { Snippet } from 'svelte'
import { toggleMax } from '../lib/commands'
import type { Key } from '../lib/i18n'
import { app, t } from '../stores/app.svelte'
import { closePane, inDock, type PaneNode } from '../stores/layout.svelte'

let { pane, children }: { pane: PaneNode; children?: Snippet } = $props()
const focused = $derived(app.focus === pane.id)
</script>

<div class="ph" class:focused>
  <span class={`link l${pane.link}`} title={`${t('link.set', { n: pane.link || '—' })} (Ctrl+${pane.link})`}>{pane.link || '·'}</span>
  <span class="title">{t(`widget.${pane.widget}` as Key)}</span>
  {#if children}{@render children()}{/if}
  <span class="spacer"></span>
  {#if !inDock(pane.id)}
    <span class="tools">
      <button type="button" title="Ctrl+Shift+Enter" onclick={() => { app.focus = pane.id; toggleMax() }}>⤢</button>
      <button type="button" title="Ctrl+Shift+W" onclick={() => closePane(pane.id)}>✕</button>
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
    font-size: var(--fs-1);
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--text-2);
    text-transform: uppercase;
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
