<script lang="ts">
// 設定（Ctrl+,）: 一般・表示・チャート（FR-C12）・データ（FR-S5〜S9, FR-D6）・キー・このアプリについて。↑↓ で項目、Tab で中へ。
import { LWC_NOTICE, TRADINGVIEW_URL } from '@shared/attribution'
import { type LoginState, loginView } from '@shared/background'
import { CODE_RE } from '@shared/code'
import { targetsFromInputs, targetTexts, YIELD_TARGETS_UI } from '@shared/yieldLines'
import { onMount } from 'svelte'
import { ACTIONS, checkUpdate, doResetAllLayouts, exportUser, importUser } from '../../lib/commands'
import { dateTime } from '../../lib/format'
import type { Key } from '../../lib/i18n'
import { app, bridge, confirmDialog, loadInstruments, nameOf, promptDialog, rpc, saveSettings, t, toast } from '../../stores/app.svelte'
import KeysSettings from './KeysSettings.svelte'

let { tab = 'general' }: { tab?: string } = $props()
const TABS = ['general', 'display', 'chart', 'data', 'keys', 'about'] as const
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
// サインイン時の起動（FR-BG6・BG7）: 正は Windows の登録なので、開くたびに main に聞く
let login = $state<LoginState | null>(null)
const bgView = $derived(loginView(login, { readOnly: app.readOnly }))
void window.elecxstock
  .loginItem()
  .then((s) => {
    if (s) login = s
  })
  .catch(() => {})
function setLogin(on: boolean, hidden: boolean) {
  void window.elecxstock
    .setLoginItem(on, hidden)
    .then((s) => {
      if (s) login = s
    })
    .catch(() => {})
}
// 目標利回り（FR-C12）: 欄は打った順のまま。Enter か Tab（欄を離れたとき）で保存し、読めない欄は空に戻して知らせる
let yt = $state(targetTexts(app.settings.yieldTargets))
function commitYield() {
  const r = targetsFromInputs(yt)
  yt = r.texts
  if (r.bad) toast(t('set.yieldTargetBad'))
  saveSettings({ yieldTargets: r.targets })
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
async function addUser() {
  const code = (await promptDialog(t('set.addInstrument'), ''))?.trim().toUpperCase()
  app.overlay = { kind: 'settings', tab: 'general' }
  if (!code || !CODE_RE.test(code)) return
  const ins = await rpc('instruments.addUser', { code })
  if (ins) app.instruments.set(ins.id, ins)
  app.settings = (await rpc('user.load', {})).settings
  toast(t('cmd.addUser', { code }))
}
async function removeUser(code: string) {
  await rpc('instruments.removeUser', { code })
  app.settings = { ...app.settings, userInstruments: app.settings.userInstruments.filter((c) => c !== code) }
  await loadInstruments()
}
async function importJpx() {
  const bytes = await window.elecxstock.openFile('xlsx')
  if (!(bytes instanceof Uint8Array)) return
  const n = await rpc('data.importJpx', { bytes: new Uint8Array(bytes) })
  toast(t('jpx.imported', { n: n.toLocaleString() }))
}
</script>

<div class="dialog settings" role="dialog" aria-label={t('set.title')}>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <nav bind:this={nav} onkeydown={navKey}>
    <h3>{t('set.title')}</h3>
    {#each TABS as x (x)}
      <button type="button" role="tab" aria-selected={cur === x} tabindex={cur === x ? 0 : -1} onclick={() => (cur = x)}>{t(`set.${x}` as Key)}</button>
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
        <span>{t('set.autoUpdate')}</span>
        <span class="row"><button type="button" class="toggle" class:on={app.settings.autoUpdate} aria-label={t('set.autoUpdate')} onclick={() => saveSettings({ autoUpdate: !app.settings.autoUpdate })}><span class="box"></span></button><span class="muted small">{t('set.autoUpdateHint')}</span></span>
      </div>
      <div class="field">
        <span>{t('set.alertNotify')}</span>
        <span class="row"><button type="button" class="toggle" class:on={app.settings.alertNotify} aria-label={t('set.alertNotify')} onclick={() => saveSettings({ alertNotify: !app.settings.alertNotify })}><span class="box"></span></button></span>
      </div>
      <!-- 常駐と自動起動（FR-BG1・BG6・BG7）。押せるか・注意は loginView が決める -->
      <div class="field">
        <span>{t('set.closeToTray')}</span>
        <span class="row"><button type="button" class="toggle" class:on={app.settings.closeToTray} aria-pressed={app.settings.closeToTray} aria-label={t('set.closeToTray')} disabled={bgView.closeToTray.disabled} onclick={() => saveSettings({ closeToTray: !app.settings.closeToTray })}><span class="box"></span></button><span class="muted small">{t('set.closeToTrayHint')}</span></span>
      </div>
      <div class="field">
        <span>{t('set.loginStart')}</span>
        <span class="row"><button type="button" class="toggle" class:on={bgView.login.on} aria-pressed={bgView.login.on} aria-label={t('set.loginStart')} disabled={bgView.login.disabled} onclick={() => setLogin(!bgView.login.on, !!login?.hidden)}><span class="box"></span></button>{#if bgView.login.note}<span class="muted small">{t(bgView.login.note === 'dev' ? 'set.loginStartDev' : 'set.loginStartDisabled')}</span>{/if}</span>
      </div>
      <div class="field">
        <span>{t('set.startHidden')}</span>
        <span class="row"><button type="button" class="toggle" class:on={bgView.hidden.on} aria-pressed={bgView.hidden.on} aria-label={t('set.startHidden')} disabled={bgView.hidden.disabled} onclick={() => setLogin(true, !bgView.hidden.on)}><span class="box"></span></button><span class="muted small">{t('set.startHiddenHint')}</span></span>
      </div>
      <div class="field">
        <span>{t('set.checkUpdates')}</span>
        <span class="row">
          <button type="button" class="toggle" class:on={app.settings.checkUpdates} aria-label={t('set.checkUpdates')} onclick={() => saveSettings({ checkUpdates: !app.settings.checkUpdates })}><span class="box"></span></button>
          <button type="button" class="chip" onclick={() => checkUpdate(true)}>{t('act.checkUpdate')}</button>
          {#if app.update}<button type="button" class="link-btn" onclick={() => window.elecxstock.openExternal(app.update!.url)}>{t('update.available', { v: app.update.version })}</button>{/if}
        </span>
      </div>
      <!-- 取得対象に足した銘柄の管理（FR-U3 の専用の画面）。説明と 1 つのまとまり -->
      <div class="grp">
      <div class="field top">
        <span>{t('set.userInstruments')}</span>
        <span class="chips">
          {#each app.settings.userInstruments as c (c)}
            <span class="chip">{c} {nameOf(`JP:${c}`)}<button type="button" class="x" aria-label={t('common.remove')} onclick={() => removeUser(c)}>✕</button></span>
          {/each}
          <button type="button" class="chip" onclick={addUser}>＋ {t('set.addInstrument')}</button>
        </span>
      </div>
      <p class="muted small">{t('set.userInstrumentsHint')}</p>
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
        <span>{t('set.theme')}</span>
        <span class="seg">
          <button type="button" aria-pressed={app.settings.theme === 'dark'} onclick={() => saveSettings({ theme: 'dark' })}>{t('set.dark')}</button>
          <button type="button" aria-pressed={app.settings.theme === 'light'} onclick={() => saveSettings({ theme: 'light' })}>{t('set.light')}</button>
        </span>
      </div>
      <div class="field">
        <span>{t('set.motion')}</span>
        <button type="button" class="toggle" class:on={app.settings.reduceMotion} aria-label={t('set.motion')} onclick={() => saveSettings({ reduceMotion: !app.settings.reduceMotion })}><span class="box"></span></button>
      </div>
      <div class="field">
        <span title={t('set.focusAlwaysHint')}>{t('set.focusAlways')}</span>
        <button type="button" class="toggle" class:on={app.settings.focusAlways} aria-label={t('set.focusAlways')} onclick={() => saveSettings({ focusAlways: !app.settings.focusAlways })}><span class="box"></span></button>
      </div>
      <div class="field">
        <span>{t('set.layout')}</span>
        <!-- コマンドパレットの「すべてのタブのレイアウトを初期状態に戻す…」と同じ（確認してから。FR-L10） -->
        <span class="row"><button type="button" class="btn" onclick={() => void doResetAllLayouts()}>{t('set.resetAllLayouts')}</button></span>
      </div>
    {:else if cur === 'chart'}
      <!-- 目標利回りの線（ON/OFF・説明・目標・説明）で 1 つのまとまり -->
      <div class="grp">
      <div class="field">
        <span>{t('set.yieldLine')}</span>
        <span class="row"><button type="button" class="toggle" class:on={app.settings.yieldLine} aria-pressed={app.settings.yieldLine} aria-label={t('set.yieldLine')} onclick={() => saveSettings({ yieldLine: !app.settings.yieldLine })}><span class="box"></span></button></span>
      </div>
      <p class="muted small">{t('set.yieldLineHint')}</p>
      <div class="field top">
        <span>{t('set.yieldTargets')}</span>
        <span class="yts">
          {#each yt as _, i (i)}
            <span class="row"><input class="yt num" type="text" inputmode="decimal" placeholder="—" aria-label={t('set.yieldTarget', { n: i + 1 })} disabled={!app.settings.yieldLine} bind:value={yt[i]} onchange={commitYield} /><span class="muted">%</span></span>
          {/each}
        </span>
      </div>
      <p class="muted small">{t('set.yieldTargetsHint', { n: YIELD_TARGETS_UI })}</p>
      </div>
      <div class="grp">
      <div class="field">
        <span>{t('set.chartSave')}</span>
        <span class="row"><button type="button" class="toggle" class:on={app.settings.chartSave} aria-pressed={app.settings.chartSave} aria-label={t('set.chartSave')} onclick={() => saveSettings({ chartSave: !app.settings.chartSave })}><span class="box"></span></button></span>
      </div>
      <p class="muted small">{t('set.chartSaveHint')}</p>
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
      <div class="grp">
      <div class="actions left">
        <button type="button" class="btn danger" onclick={reset}>{t('set.reset')}</button>
        <button type="button" class="btn" onclick={importJpx}>{t('set.importJpx')}</button>
      </div>
      <p class="muted small">{t('set.dataNote')}</p>
      <div class="actions left">
        <button type="button" class="btn" onclick={() => ACTIONS.find((a) => a.id === 'backupDb')?.run()}>{t('act.backupDb')}</button>
        <button type="button" class="btn" onclick={() => window.elecxstock.openLogs()}>{t('act.openLogs')}</button>
      </div>
      <div class="actions left">
        <button type="button" class="btn" onclick={exportUser}>{t('set.exportUser')}</button>
        <button type="button" class="btn" onclick={importUser}>{t('set.importUser')}</button>
      </div>
      </div>
    {:else if cur === 'keys'}
      <KeysSettings />
    {:else}
      <div class="field"><span>{t('set.version')}</span><span class="num">{app.info?.version ?? __APP_VERSION__}</span></div>
      <div class="field"><span>{t('set.licenseLabel')}</span><span>{t('set.license')}</span></div>
      <div class="field"><span>{t('set.dataLabel')}</span><span>{app.info?.provider === 'stub' ? t('set.dataSourceStub') : t('set.dataSource')}</span></div>
      <div class="field">
        <span>{t('set.chartsLabel')}</span>
        <span class="notice">
          <button type="button" class="link-btn" onclick={() => window.elecxstock.openExternal(TRADINGVIEW_URL)}>{LWC_NOTICE[0]}</button>
          <span class="dim">{LWC_NOTICE[1]}</span>
        </span>
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
      <div class="grp"><p class="dim">{t('set.disclaimer')}</p></div>
    {/if}
  </div>
</div>

<style>
  .yts {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
  }
  .yt {
    width: 64px;
    text-align: right;
  }
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
    gap: var(--s-3);
  }
  /* 区切りの線: 項目（.field）・まとまり（.grp。項目とその説明）の間にだけ引く。説明の上や、最後の項目の下には引かない */
  .body > :is(.field, .grp) + :is(.field, .grp) {
    border-top: 1px solid var(--line);
  }
  .grp > p {
    margin: 0 0 var(--s-2);
  }
  /* ボタンの段の説明（データの「全データを削除して取り直す」）はボタンのすぐ下に、詰めすぎずに置く */
  .grp > .actions + p {
    margin-top: var(--s-2);
    margin-bottom: var(--s-3);
  }
  /* まとまりが説明から始まるとき（このアプリについての注意書き）は線から離す */
  .grp > p:first-child {
    margin-top: var(--s-3);
  }
  .field > span:first-child {
    color: var(--text-2);
  }
  .field > :global(.seg),
  .field > .toggle {
    justify-self: start;
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
  .field.top {
    align-items: start;
    padding: 8px 0;
  }
  .row {
    display: flex;
    gap: var(--s-2);
    align-items: center;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .chips .x {
    background: none;
    border: 0;
    color: var(--text-3);
    cursor: pointer;
    margin-left: 4px;
  }
  .actions.left {
    justify-content: flex-start;
  }
  .small {
    font-size: var(--fs-1);
  }
  .notice {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
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
