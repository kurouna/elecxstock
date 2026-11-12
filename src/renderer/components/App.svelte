<script lang="ts">
import { onMount } from 'svelte'
import { handleKey } from '../lib/commands'
import { app, applySettingsToDom, bridge, loadInstruments, rpc } from '../stores/app.svelte'
import { layout, normalizeDoc } from '../stores/layout.svelte'
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

onMount(() => {
  const offs = [
    bridge.on('jobs.progress', (p) => {
      const rest = app.jobs.filter((j) => j.id !== p.id)
      app.jobs = [p, ...rest].sort((a, b) => b.id - a.id).slice(0, 20)
      if (p.status === 'done' || p.status === 'cancelled') {
        void refreshStatus()
        void loadInstruments()
      }
    }),
    bridge.on('data.updated', (d) => {
      if (d.ids.includes('*')) app.metrics.clear()
      else for (const id of d.ids) app.metrics.delete(id)
      app.dataVersion++
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
  const timer = setInterval(refreshStatus, 10_000)
  ;(async () => {
    app.info = await rpc('app.info', {})
    const u = await rpc('user.load', {})
    app.settings = u.settings
    app.watchlists = u.watchlists
    app.screens = u.screens
    app.readOnly = u.readOnly
    if (u.error) app.userError = u.error
    layout.doc = normalizeDoc(u.layout)
    applySettingsToDom()
    await loadInstruments()
    await refreshStatus()
    app.jobs = await rpc('jobs.list', {})
    app.ready = true
    if (!app.settings.disclaimerAccepted || !app.settings.firstRunDone) app.overlay = { kind: 'firstrun' }
  })()
  return () => {
    for (const f of offs) f()
    window.removeEventListener('keydown', onKey, true)
    clearInterval(timer)
  }
})
</script>

<div class="app">
  <TopBar />
  <main class="ws">
    {#if app.ready}
      <Workspace />
    {/if}
  </main>
  <StatusBar />
</div>
<Overlays />
<Toasts />

<style>
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
