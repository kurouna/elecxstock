<script lang="ts">
// ペインの表示の切り替えのボタン（ヒートマップ ⇔ 株価ボード。docs/design-quote-board.md §2.1・FR-QB1）。
// 見出しの中身の先頭に置く（末尾から切れるため）。アイコンだけで、名前はツールチップ（表示中・切り替える）と aria-label で出す。キーは V（lib/paneView.ts の withViewSwitch）
import { VIEWS, type ViewId } from '../lib/paneView'
import { t } from '../stores/app.svelte'

let { view, onpick }: { view: ViewId; onpick: (v: ViewId) => void } = $props()
</script>

<span class="vs" role="group" aria-label={t('qb.views')}>
  {#each VIEWS as v (v)}
    <button
      type="button"
      aria-pressed={view === v}
      aria-label={t(`qb.view.${v}`)}
      title={view === v ? t('qb.current', { name: t(`qb.view.${v}`) }) : `${t('qb.toView', { name: t(`qb.view.${v}`) })} (V)`}
      onclick={() => onpick(v)}
    >
      {#if v === 'map'}
        <svg viewBox="0 0 12 12" aria-hidden="true"><rect x="1" y="1" width="6" height="10" fill="currentColor" /><rect x="8" y="1" width="3" height="5" /><rect x="8" y="7" width="3" height="4" /></svg>
      {:else}
        <svg viewBox="0 0 12 12" aria-hidden="true"><rect x="1" y="1" width="4" height="4" /><rect x="7" y="1" width="4" height="4" /><rect x="1" y="7" width="4" height="4" /><rect x="7" y="7" width="4" height="4" /></svg>
      {/if}
    </button>
  {/each}
</span>

<style>
  .vs {
    display: inline-flex;
    flex: none;
    height: 18px;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    overflow: hidden;
  }
  button {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0 6px;
    background: none;
    border: 0;
    color: var(--text-3);
    font-size: var(--fs-1);
    cursor: pointer;
  }
  button + button {
    border-left: 1px solid var(--line-strong);
  }
  button[aria-pressed='true'] {
    background: var(--select-strong);
    color: var(--text);
  }
  svg {
    width: 11px;
    height: 11px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.4;
  }
</style>
