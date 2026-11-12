<script lang="ts">
import { isMarketOpen, isTradingDay, jstNow } from '@shared/calendar'
import { onMount } from 'svelte'
import { doResetSizes } from '../lib/commands'
import type { Key } from '../lib/i18n'
import { app, t } from '../stores/app.svelte'
import { layout, PRESET_IDS, setPreset } from '../stores/layout.svelte'

let clock = $state('')
let market = $state<'open' | 'closed' | 'holiday'>('closed')
onMount(() => {
  const tick = () => {
    const now = Date.now()
    clock = new Date(now).toLocaleTimeString(app.settings.lang === 'ja' ? 'ja-JP' : 'en-US', { timeZone: 'Asia/Tokyo', hour12: false })
    // 東証の休場日の判定（Core と同じ src/shared/calendar.ts）
    market = isMarketOpen(now) ? 'open' : isTradingDay(jstNow(now).date) ? 'closed' : 'holiday'
  }
  tick()
  const id = setInterval(tick, 1000)
  return () => clearInterval(id)
})
</script>

<header class="top">
  <div class="brand">
    <span class="logo" aria-hidden="true">E</span><span class="name">elecxstock</span>
  </div>
  <nav class="presets" aria-label="layouts">
    {#each PRESET_IDS as p, i (p)}
      <button type="button" aria-current={layout.doc.active === p} onclick={() => setPreset(p)} title={`Ctrl+Shift+${i + 1}`}>
        <span>{t(`preset.${p}` as Key)}</span><kbd>{i + 1}</kbd>
      </button>
    {/each}
  </nav>
  <button type="button" class="cmd" onclick={() => (app.overlay = { kind: 'palette' })}>
    <span class="ic">›</span><span class="ph">{t('top.search')}</span><kbd>Ctrl+K</kbd>
  </button>
  <div class="right">
    <button type="button" class="chip" onclick={doResetSizes} title="Ctrl+Alt+R">⟲ {t('top.resetSizes')}</button>
    <span class="pill" class:open={market === 'open'}>{t(market === 'open' ? 'market.open' : market === 'holiday' ? 'market.holiday' : 'market.closed')}</span>
    <span class="clock num">{clock} JST</span>
  </div>
</header>

<style>
  .top {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    padding: 0 var(--s-2);
    padding-right: 150px; /* ウィンドウの最小化・最大化・閉じるボタン（titleBarOverlay）の分 */
    background: var(--panel);
    border-bottom: 1px solid var(--line);
    -webkit-app-region: drag;
    min-width: 0;
  }
  .top button,
  .top .right {
    -webkit-app-region: no-drag;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    flex: none;
  }
  .logo {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #10a5e8;
    color: #fff;
    font-weight: 700;
    font-size: var(--fs-2);
    display: grid;
    place-items: center;
    box-shadow: 0 0 0 2px #fff inset;
  }
  .name {
    font-weight: 700;
    font-size: var(--fs-3);
    letter-spacing: 0.02em;
  }
  .presets {
    display: flex;
    height: 100%;
    flex: none;
  }
  .presets button {
    background: none;
    border: 0;
    border-bottom: 2px solid transparent;
    padding: 0 10px;
    height: 100%;
    color: var(--text-2);
    cursor: pointer;
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .presets button[aria-current='true'] {
    color: var(--text);
    border-bottom-color: var(--focus);
    background: var(--panel-2);
  }
  .presets kbd {
    border: 0;
    background: none;
    padding: 0;
  }
  .cmd {
    flex: 1;
    min-width: 160px;
    max-width: 520px;
    margin: 0 auto;
    height: 24px;
    display: flex;
    align-items: center;
    gap: var(--s-2);
    padding: 0 var(--s-2);
    background: var(--bg);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    color: var(--text-3);
    cursor: text;
    text-align: left;
  }
  .cmd .ph {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ic {
    color: var(--focus);
    font-family: var(--mono);
  }
  .right {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    flex: none;
  }
  .pill {
    font-size: var(--fs-1);
    padding: 0 8px;
    line-height: 18px;
    border-radius: var(--radius);
    background: var(--panel-3);
    color: var(--text-2);
  }
  .pill.open {
    color: var(--ok);
  }
  .clock {
    color: var(--text-2);
  }
</style>
