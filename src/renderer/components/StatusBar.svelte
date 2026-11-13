<script lang="ts">
import { keyOf, runAction } from '../lib/commands'
import { dateTime } from '../lib/format'
import type { Key } from '../lib/i18n'
import { app, rpc, t } from '../stores/app.svelte'

const ACTIVE = ['running', 'waiting-offline', 'provider-paused', 'paused', 'queued']
// 実行中を先に、次に待っているもの（新しい順に並んでいるので、そのまま find すると後から積んだ待ちが先に出る）
const active = $derived(ACTIVE.map((s) => app.jobs.find((j) => j.status === s)).find(Boolean))
// 何も動いていないときは、直前のジョブが失敗・一部失敗だったかを出す
const last = $derived(active ? null : app.jobs[0])
const lastBad = $derived(!!last && (last.status === 'failed' || last.failed > 0))
const offline = $derived(app.provider.offline || app.provider.paused)
</script>

<footer class="sb">
  <span title={offline ? t('status.connOff') : t('status.connOk')}>
    <span class="dot" class:off={offline} aria-hidden="true"></span>{t('status.lastUpdate')}
    <span class="num">{app.status?.lastUpdate ? dateTime(app.status.lastUpdate) : t('status.never')}</span>
  </span>
  <button type="button" class="seg job" title={t('act.jobs')} onclick={() => runAction('jobs')}>
    {#if active}
      {t(`jobs.kind.${active.kind}` as Key)}: {t(`jobs.${active.status}` as Key)}
      <span class="num">{active.done.toLocaleString()} / {active.total.toLocaleString()}</span>
      <span class="progress"><i style:width={`${active.total ? (active.done / active.total) * 100 : 0}%`}></i></span>
      {#if active.etaSec}<span>{t('jobs.eta', { m: Math.max(1, Math.round(active.etaSec / 60)) })}</span>{/if}
    {:else if lastBad && last}
      <span class="warn">{last.status === 'failed' ? t('status.lastFailed') : t('status.lastPartial', { n: last.failed.toLocaleString() })}</span>
    {:else}
      {t('jobs.idle')}
    {/if}
  </button>
  {#if !active || active.status === 'paused'}
    <!-- 押すと何が起きるかを言葉で出す（「待機 F5」が「F5 で待機」と読めないように） -->
    <button type="button" class="seg" onclick={() => (active?.status === 'paused' ? void rpc('jobs.resume', { id: active.id }) : runAction('update'))}>
      {active ? t('status.resume') : t('act.update')} <kbd>{keyOf('update')}</kbd>
    </button>
  {/if}
  {#if app.provider.offline}<span class="warn">{t('status.offline')}</span>{/if}
  {#if app.provider.paused}<span class="warn">{t('status.providerPaused')}</span>{/if}
  {#if app.readOnly}<span class="warn">{t('status.readOnly')}</span>{/if}
  <span class="src">{app.info?.provider === 'stub' ? t('status.sourceStub') : t('status.source')}</span>
  <span class="grow"></span>
  <span>{t('status.notAdvice')}</span>
  <button type="button" class="seg" onclick={() => runAction('help')}>{t('status.help')} <kbd>{keyOf('help')}</kbd></button>
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
  .sb > span,
  .sb > .seg {
    padding: 0 10px;
    border-right: 1px solid var(--line);
    height: 100%;
    display: flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }
  .seg {
    background: none;
    border: 0;
    border-right: 1px solid var(--line);
    border-radius: 0;
    font: inherit;
    color: inherit;
    cursor: pointer;
  }
  .seg:hover {
    background: var(--hover);
    color: var(--text-2);
  }
  .sb .grow {
    flex: 1;
    border-right: 0;
  }
  /* 狭いときはデータ源の表記から省く */
  .src {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
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
