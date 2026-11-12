<script lang="ts">
import { addDays, isTradingDay, jstNow } from '@shared/calendar'
import { onMount } from 'svelte'
import { clearBars } from '../lib/barsCache'
import { checkUpdate, handleKey, startUpdate } from '../lib/commands'
import { loadHoldings } from '../lib/portfolio'
import { app, applySettingsToDom, bridge, flushListSaves, loadInstruments, rpc, t, toast } from '../stores/app.svelte'
import { flushLayoutSave, layout, normalizeDoc } from '../stores/layout.svelte'
import Overlays from './overlays/Overlays.svelte'
import StatusBar from './StatusBar.svelte'
import Toasts from './Toasts.svelte'
import TopBar from './TopBar.svelte'
import Workspace from './Workspace.svelte'

async function refreshStatus() {
  try {
    app.status = await bridge.call('data.status', {})
  } catch {
    /* core restarting */
  }
}

/**
 * 自動更新（FR-F6）: 最後の更新が直近の大引け（15:30）より前なら、大引けの 30 分後から起動時と起動中に更新する。
 * 取得中・初回の設定前・設定で切っているときはしない
 */
function autoUpdate() {
  if (!app.ready || !app.settings.autoUpdate || !app.settings.firstRunDone || !app.status?.withBars) return
  if (app.jobs.some((j) => j.status === 'running' || j.status === 'queued')) return
  const now = jstNow()
  let d = now.date
  const after = now.minutes >= 16 * 60
  if (!(isTradingDay(d) && after)) {
    // 今日の大引け後でなければ、前の営業日の大引けを基準にする
    do d = addDays(d, -1)
    while (!isTradingDay(d))
  }
  const last = app.status.lastUpdate ? jstNow(Date.parse(app.status.lastUpdate)) : null
  if (last && (last.date > d || (last.date === d && last.minutes >= 15 * 60 + 30))) return
  void startUpdate()
}

let pending: Set<string> | '*' = new Set()
let flushTimer: ReturnType<typeof setTimeout> | null = null
function flushData() {
  flushTimer = null
  const ids = pending
  pending = new Set()
  if (ids === '*') app.metrics.clear()
  else for (const id of ids) app.metrics.delete(id)
  app.updatedIds = ids
  app.dataVersion++
}

onMount(() => {
  const offs = [
    bridge.on('jobs.progress', (p) => {
      const rest = app.jobs.filter((j) => j.id !== p.id)
      app.jobs = [p, ...rest].sort((a, b) => b.id - a.id).slice(0, 20)
      if (p.status === 'done' || p.status === 'cancelled' || p.status === 'failed') {
        void refreshStatus()
        void loadInstruments()
        // JPX の一覧が取れなかった（FR-FR3）: 手で落とした data_j.xlsx を取り込めるように案内する
        if (
          (p.kind === 'initial' || p.kind === 'reset' || p.kind === 'universe') &&
          (p.status === 'failed' || (p.total <= 1 && p.failed >= 1))
        )
          toast(t('first.jpxFailed'), { label: t('set.importJpx'), run: () => (app.overlay = { kind: 'settings', tab: 'data' }) }, 20_000)
      }
    }),
    // 取得中は 1 秒ごとに届くので、2 秒にまとめて画面に知らせる（全ペインが毎秒問い合わせ直さないように）
    bridge.on('data.updated', (d) => {
      clearBars(d.ids)
      if (d.ids.includes('*')) pending = '*'
      else if (pending !== '*') for (const id of d.ids) pending.add(id)
      if (!flushTimer) flushTimer = setTimeout(flushData, 2000)
    }),
    bridge.on('provider.state', (s) => (app.provider = s)),
    bridge.on('user.error', (e) => (app.userError = e.message)),
  ]
  const onKey = (e: KeyboardEvent) => {
    if (handleKey(e)) {
      e.preventDefault()
      e.stopPropagation()
    }
  }
  window.addEventListener('keydown', onKey, true)
  const onUnload = () => {
    flushListSaves()
    flushLayoutSave()
  }
  window.addEventListener('beforeunload', onUnload)
  const timer = setInterval(refreshStatus, 10_000)
  const autoTimer = setInterval(autoUpdate, 5 * 60_000)
  void boot()
  // Core が立ち上げ直されたら、状態を取り直す（NFR-Q11）
  offs.push(
    bridge.on('core.ready', () => {
      if (app.ready) void refreshStatus().then(async () => (app.jobs = await rpc('jobs.list', {}).catch(() => app.jobs)))
      else if (bootError) void boot()
    }),
  )
  return () => {
    for (const f of offs) f()
    window.removeEventListener('keydown', onKey, true)
    window.removeEventListener('beforeunload', onUnload)
    clearInterval(timer)
    clearInterval(autoTimer)
  }
})

/** 起動（失敗したら理由と、再試行・ログを開くを出す。空白の画面にしない） */
let bootError = $state<string | null>(null)
async function boot() {
  bootError = null
  try {
    app.info = await rpc('app.info', {})
    const u = await rpc('user.load', {})
    app.settings = u.settings
    app.watchlists = u.watchlists
    app.screens = u.screens
    app.layouts = u.layouts
    app.readOnly = u.readOnly
    if (u.error) app.userError = u.error
    layout.doc = normalizeDoc(u.layout)
    applySettingsToDom()
    await loadInstruments()
    await refreshStatus()
    app.jobs = await rpc('jobs.list', {})
    app.ready = true
    if (!app.settings.disclaimerAccepted || !app.settings.firstRunDone) app.overlay = { kind: 'firstrun' }
    else {
      void loadHoldings()
      if (app.settings.checkUpdates) setTimeout(() => void checkUpdate(), 5000)
      autoUpdate()
    }
  } catch (e) {
    bootError = String((e as { message?: string; code?: string })?.message || (e as { code?: string })?.code || e)
  }
}
</script>

<div class="app">
  <TopBar />
  <main class="ws">
    {#if app.ready}
      <Workspace />
    {:else if bootError}
      <div class="boot">
        <div>
          <h3>{t('boot.failed')}</h3>
          <p class="dim">{bootError}</p>
          <div class="actions">
            <button type="button" class="btn primary" onclick={boot}>{t('boot.retry')}</button>
            <button type="button" class="btn" onclick={() => window.elecxstock.openLogs()}>{t('act.openLogs')}</button>
          </div>
        </div>
      </div>
    {:else}
      <div class="boot"><span class="dim">{t('boot.starting')}</span></div>
    {/if}
  </main>
  <StatusBar />
</div>
<Overlays />
<Toasts />

<style>
  .boot {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: var(--bg);
    text-align: center;
  }
  .boot .actions {
    display: flex;
    gap: var(--s-2);
    justify-content: center;
  }
  .app {
    display: grid;
    grid-template-rows: 36px 1fr 24px;
    height: 100vh;
  }
  .ws {
    position: relative;
    overflow: hidden;
    background: var(--line);
    min-height: 0;
  }
</style>
