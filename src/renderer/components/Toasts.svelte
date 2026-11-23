<script lang="ts">
import { app, t } from '../stores/app.svelte'

function act(id: number, run: () => void) {
  run()
  app.toasts = app.toasts.filter((y) => y.id !== id)
}
</script>

<div class="toasts" aria-live="polite">
  {#each app.toasts as x (x.id)}
    <div class="toast" class:error={x.kind === 'error'} role={x.kind === 'error' ? 'alert' : 'status'}>
      <span>{x.msg}</span>
      {#if x.action}<button type="button" class="chip" onclick={() => act(x.id, x.action!.run)}>{x.action.label}</button>{/if}
      <button type="button" class="x" aria-label={t('common.close')} onclick={() => (app.toasts = app.toasts.filter((y) => y.id !== x.id))}>✕</button>
    </div>
  {/each}
</div>

<style>
  /* 下の中央に出す（右下の価格軸・ドロワーの内容を隠さない） */
  .toasts {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    bottom: 34px;
    /* ダイアログ（暗転 50）や、その上のポップアップ（60）より上。ダイアログを開いている間の知らせも暗くならない */
    z-index: 70;
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: center;
    pointer-events: none;
  }
  .toast {
    pointer-events: auto;
    background: var(--panel-3);
    border: 1px solid var(--line-strong);
    border-left: 3px solid var(--ok);
    padding: 7px 8px 7px 12px;
    display: flex;
    gap: 12px;
    align-items: center;
    box-shadow: var(--shadow);
    max-width: 460px;
    border-radius: var(--radius);
  }
  .toast.error {
    border-left-color: var(--danger);
  }
  .x {
    background: none;
    border: 0;
    color: var(--text-3);
    cursor: pointer;
    padding: 0 4px;
  }
  .x:hover {
    color: var(--text);
  }
</style>
