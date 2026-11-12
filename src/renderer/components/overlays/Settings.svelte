<script lang="ts">
// 設定（Ctrl+,）: 一般・表示・データ（FR-S5〜S9, FR-D6）・キー・このアプリについて。↑↓ で項目、Tab で中へ。
import { onMount } from 'svelte'
import { exportUser, importUser } from '../../lib/commands'
import { dateTime } from '../../lib/format'
import type { Key } from '../../lib/i18n'
import { app, bridge, confirmDialog, rpc, saveSettings, t, toast } from '../../stores/app.svelte'

let { tab = 'general' }: { tab?: string } = $props()
const TABS = ['general', 'display', 'data', 'keys', 'about'] as const
let cur = $state<string>('general')
let notices = $state('')
let nav = $state<HTMLElement>()
onMount(() => {
  cur = tab
  queueMicrotask(() => nav?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus())
  void bridge.call('data.status', {}).then((s) => (app.status = s))
})
function navKey(e: KeyboardEvent) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
  e.preventDefault()
  const i = TABS.indexOf(cur as (typeof TABS)[number])
  cur = TABS[(i + (e.key === 'ArrowDown' ? 1 : -1) + TABS.length) % TABS.length]!
  queueMicrotask(() => nav?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus())
}
async function setRetention(years: number) {
  const s = app.settings.retentionYears
  if (years === s) return
  if (years < s) {
    // 縮めるときは、消える期間・件数・容量を示して確認する（FR-D6）
    const plan = await rpc('jobs.planRetention', { years })
    const r = await confirmDialog({
      title: t('ret.title', { n: years }),
      body: t('ret.body', { date: plan.deleteBefore ?? '', rows: plan.rows.toLocaleString(), mb: Math.round(plan.approxBytes / 1048576) }),
      ok: t('ret.apply'),
      danger: true,
    })
    app.overlay = { kind: 'settings', tab: 'data' }
    if (!r.ok) return
  }
  await rpc('jobs.applyRetention', { years })
  app.settings = { ...app.settings, retentionYears: years }
  if (years > s) toast(t('ret.extended', { n: years }))
  app.status = await rpc('data.status', {})
}
async function reset() {
  const st = app.status
  const r = await confirmDialog({
    title: t('reset.title'),
    items: t('reset.items', { mb: Math.round((st?.dbBytes ?? 0) / 1048576), n: (st?.instruments ?? 0).toLocaleString() }).split('|'),
    body: t('set.dataNote'),
    check: t('reset.keepDelisted'),
    ok: t('reset.do'),
    danger: true,
  })
  if (!r.ok) {
    app.overlay = { kind: 'settings', tab: 'data' }
    return
  }
  await rpc('jobs.reset', { keepDelisted: r.checked })
  toast(t('reset.started'))
}
async function importJpx() {
  const bytes = await window.elecxstock.openFile('xlsx')
  if (!(bytes instanceof Uint8Array)) return
  const n = await rpc('data.importJpx', { bytes: new Uint8Array(bytes) })
  toast(`JPX: ${n.toLocaleString()}`)
}
</script>

<div class="dialog settings" role="dialog" aria-label={t('set.title')}>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <nav bind:this={nav} onkeydown={navKey}>
    <h3>{t('set.title')}</h3>
    {#each TABS as x (x)}
      <button type="button" role="tab" aria-selected={cur === x} onclick={() => (cur = x)}>{t(`set.${x}` as Key)}</button>
    {/each}
  </nav>
  <div class="body">
    {#if cur === 'general'}
      <div class="field">
        <span>{t('set.lang')}</span>
        <span class="seg">
          <button type="button" aria-pressed={app.settings.lang === 'ja'} onclick={() => saveSettings({ lang: 'ja' })}>日本語</button>
          <button type="button" aria-pressed={app.settings.lang === 'en'} onclick={() => saveSettings({ lang: 'en' })}>English</button>
        </span>
      </div>
      <div class="field">
        <span>{t('set.density')}</span>
        <span class="seg">
          <button type="button" aria-pressed={app.settings.density === 'normal'} onclick={() => saveSettings({ density: 'normal' })}>{t('set.normal')}</button>
          <button type="button" aria-pressed={app.settings.density === 'compact'} onclick={() => saveSettings({ density: 'compact' })}>{t('set.compact')}</button>
        </span>
      </div>
      <div class="field">
        <span>{t('set.scale')}</span>
        <span class="seg">
          {#each [0.8, 0.9, 1, 1.1, 1.25, 1.5] as z (z)}
            <button type="button" aria-pressed={app.settings.uiScale === z} onclick={() => saveSettings({ uiScale: z })}>{Math.round(z * 100)}%</button>
          {/each}
        </span>
      </div>
      <div class="field">
        <span>{t('set.userInstruments')}</span>
        <span class="num dim">{app.settings.userInstruments.join(', ') || '—'}</span>
      </div>
    {:else if cur === 'display'}
      <div class="field">
        <span>{t('set.candle')}</span>
        <span class="seg">
          <button type="button" aria-pressed={app.settings.candleStyle === 'jp'} onclick={() => saveSettings({ candleStyle: 'jp' })}>{t('set.jp')}</button>
          <button type="button" aria-pressed={app.settings.candleStyle === 'us'} onclick={() => saveSettings({ candleStyle: 'us' })}>{t('set.us')}</button>
        </span>
      </div>
      <div class="field">
        <span>{t('set.motion')}</span>
        <button type="button" class="toggle" class:on={app.settings.reduceMotion} aria-label={t('set.motion')} onclick={() => saveSettings({ reduceMotion: !app.settings.reduceMotion })}><span class="box"></span></button>
      </div>
    {:else if cur === 'data'}
      <div class="stat">
        <div><b class="num">{Math.round((app.status?.dbBytes ?? 0) / 1048576).toLocaleString()} MB</b><span>{t('set.dbSize')}</span></div>
        <div><b class="num">{(app.status?.withBars ?? 0).toLocaleString()} / {(app.status?.instruments ?? 0).toLocaleString()}</b><span>{t('set.symbols')}</span></div>
        <div><b class="num">{(app.status?.failures ?? 0).toLocaleString()}</b><span>{t('set.failures')}</span></div>
      </div>
      <div class="field"><span>{t('status.lastUpdate')}</span><span class="num dim">{dateTime(app.status?.lastUpdate)}</span></div>
      <div class="field"><span>{t('set.range')}</span><span class="num dim">{app.status?.oldestBar ?? '—'} – {app.status?.newestBar ?? '—'} · {t('set.monthlyNote')}</span></div>
      <div class="field">
        <span>{t('set.retention')}</span>
        <span class="seg">
          {#each [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as y (y)}
            <button type="button" aria-pressed={app.settings.retentionYears === y} onclick={() => setRetention(y)}>{y}</button>
          {/each}
        </span>
      </div>
      <div class="field"><span>{t('set.universe')}</span><span class="num dim">{dateTime(app.status?.universeUpdated)} <button type="button" class="chip" onclick={() => rpc('jobs.start', { kind: 'universe' })}>{t('act.universe')}</button></span></div>
      <div class="actions left">
        <button type="button" class="btn danger" onclick={reset}>{t('set.reset')}</button>
        <button type="button" class="btn" onclick={importJpx}>{t('set.importJpx')}</button>
      </div>
      <div class="actions left">
        <button type="button" class="btn" onclick={exportUser}>{t('set.exportUser')}</button>
        <button type="button" class="btn" onclick={importUser}>{t('set.importUser')}</button>
      </div>
      <p class="muted small">{t('set.dataNote')}</p>
    {:else if cur === 'keys'}
      <p class="dim">{t('set.keysNote')}</p>
      <button type="button" class="btn" onclick={() => (app.overlay = { kind: 'help' })}>{t('act.help')} <kbd>F1</kbd></button>
    {:else}
      <div class="field"><span>{t('set.version')}</span><span class="num">{app.info?.version ?? __APP_VERSION__}</span></div>
      <div class="field"><span>License</span><span>{t('set.license')}</span></div>
      <div class="field">
        <span>Charts</span>
        <button type="button" class="link-btn" onclick={() => window.elecxstock.openExternal('https://www.tradingview.com/')}>{t('set.attribution')}</button>
      </div>
      <div class="field">
        <span>GitHub</span>
        <button type="button" class="link-btn" onclick={() => window.elecxstock.openExternal('https://github.com/kurouna/elecxstock')}>github.com/kurouna/elecxstock</button>
      </div>
      <div class="field">
        <span>{t('set.notices')}</span>
        <button type="button" class="link-btn" onclick={async () => (notices = notices ? '' : (await window.elecxstock.notices()) || '—')}>{notices ? t('common.close') : t('set.showNotices')}</button>
      </div>
      {#if notices}<pre class="notices" tabindex="-1">{notices}</pre>{/if}
      <p class="dim">{t('set.disclaimer')}</p>
    {/if}
  </div>
</div>

<style>
  .notices {
    max-height: 240px;
    overflow: auto;
    font-family: var(--mono);
    font-size: var(--fs-1);
    white-space: pre-wrap;
    background: var(--bg);
    border: 1px solid var(--line);
    padding: var(--s-2);
    margin: var(--s-2) 0;
  }
  .settings {
    width: 820px;
    display: grid;
    grid-template-columns: 170px 1fr;
    min-height: 460px;
  }
  nav {
    border-right: 1px solid var(--line-strong);
    padding: var(--s-2) 0;
  }
  nav h3 {
    padding: 4px 16px 8px;
  }
  nav button {
    display: block;
    width: 100%;
    text-align: left;
    background: none;
    border: 0;
    padding: 0 16px;
    height: 30px;
    color: var(--text-2);
    cursor: pointer;
  }
  nav button[aria-selected='true'] {
    background: var(--select-strong);
    color: var(--text);
    box-shadow: inset 2px 0 0 var(--focus);
  }
  .body {
    padding: var(--s-3) var(--s-4);
  }
  .field {
    display: grid;
    grid-template-columns: 190px 1fr;
    align-items: center;
    min-height: 36px;
    border-bottom: 1px solid var(--line);
    gap: var(--s-3);
  }
  .field > span:first-child {
    color: var(--text-2);
  }
  .stat {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1px;
    background: var(--line);
    border: 1px solid var(--line);
    margin-bottom: var(--s-3);
  }
  .stat div {
    background: var(--panel);
    padding: 8px 10px;
  }
  .stat b {
    display: block;
    font-size: var(--fs-4);
    font-weight: 500;
  }
  .stat span {
    color: var(--text-3);
    font-size: var(--fs-1);
  }
  .actions.left {
    justify-content: flex-start;
  }
  .small {
    font-size: var(--fs-1);
  }
  .link-btn {
    background: none;
    border: 0;
    color: var(--focus);
    cursor: pointer;
    padding: 0;
    text-align: left;
  }
</style>
