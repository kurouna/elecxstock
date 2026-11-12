<script lang="ts">
import { app } from '../stores/app.svelte'

function act(id: number, run: () => void) {
  run()
  app.toasts = app.toasts.filter((y) => y.id !== id)
}
</script>

<div class="toasts" aria-live="polite">
  {#each app.toasts as x (x.id)}
    <div class="toast">
      <span>{x.msg}</span>
      {#if x.action}<button type="button" class="chip" onclick={() => act(x.id, x.action!.run)}>{x.action.label}</button>{/if}
    </div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    right: 16px;
    bottom: 36px;
    z-index: 70;
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: flex-end;
    pointer-events: none;
  }
  .toast {
    pointer-events: auto;
    background: var(--panel-3);
    border: 1px solid var(--line-strong);
    border-left: 2px solid var(--focus);
    padding: 8px 12px;
    display: flex;
    gap: 12px;
    align-items: center;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    max-width: 520px;
  }
</style>
