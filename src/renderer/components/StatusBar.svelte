<script lang="ts">
import { dateTime } from '../lib/format'
import type { Key } from '../lib/i18n'
import { app, t } from '../stores/app.svelte'

const active = $derived(
  app.jobs.find((j) => j.status === 'running' || j.status === 'waiting-offline' || j.status === 'provider-paused' || j.status === 'queued'),
)
</script>

<footer class="sb">
  <span>
    <span class="dot" class:off={app.provider.offline || app.provider.paused}></span>{t('status.lastUpdate')}
    <span class="num">{app.status?.lastUpdate ? dateTime(app.status.lastUpdate) : t('status.never')}</span>
  </span>
  <span class="job">
    {#if active}
      {t(`jobs.kind.${active.kind}` as Key)}: {t(`jobs.${active.status}` as Key)}
      <span class="num">{active.done.toLocaleString()} / {active.total.toLocaleString()}</span>
      <span class="progress"><i style:width={`${active.total ? (active.done / active.total) * 100 : 0}%`}></i></span>
      {#if active.etaSec}<span class="muted">{t('jobs.eta', { m: Math.max(1, Math.round(active.etaSec / 60)) })}</span>{/if}
    {:else}
      {t('jobs.idle')}
    {/if}
    <kbd>F5</kbd>
  </span>
  {#if app.provider.offline}<span class="warn">{t('status.offline')}</span>{/if}
  {#if app.provider.paused}<span class="warn">{t('status.providerPaused')}</span>{/if}
  {#if app.readOnly}<span class="warn">{t('status.readOnly')}</span>{/if}
  <span>{app.info?.provider === 'stub' ? t('status.sourceStub') : t('status.source')}</span>
  <span class="grow"></span>
  <span>{t('status.notAdvice')}</span>
  <span>{app.settings.lang === 'ja' ? '日本語' : 'English'}</span>
  <span>{t('status.help')} <kbd>F1</kbd></span>
</footer>

<style>
  .sb {
    display: flex;
    align-items: center;
    background: var(--panel);
    border-top: 1px solid var(--line);
    font-size: var(--fs-1);
    color: var(--text-3);
    min-width: 0;
    overflow: hidden;
  }
  .sb > span {
    padding: 0 10px;
    border-right: 1px solid var(--line);
    height: 100%;
    display: flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }
  .sb .grow {
    flex: 1;
    border-right: 0;
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--ok);
  }
  .dot.off {
    background: var(--warn);
  }
  .warn {
    color: var(--warn);
  }
  .progress {
    width: 80px;
    height: 4px;
    background: var(--line-strong);
    display: inline-block;
  }
  .progress i {
    display: block;
    height: 100%;
    background: var(--focus);
    transition: width var(--motion);
  }
</style>
