<script lang="ts">
import { isMarketOpen, isTradingDay, jstNow } from '@shared/calendar'
import { onMount } from 'svelte'
import { doResetSizes, keyOf, runAction } from '../lib/commands'
import type { Key } from '../lib/i18n'
import { freeNo, IS_FREE, SLOT } from '../lib/windowSlot'
import { app, t } from '../stores/app.svelte'
import { layout, PRESET_IDS, setPreset, sizesAtDefault } from '../stores/layout.svelte'
import Icon from './Icon.svelte'

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
  {#if IS_FREE}
    <span class="wname" title={t('win.freeHint')}>{t('win.freeTitle', { n: freeNo(SLOT) })}</span>
  {:else}
  <nav class="presets" aria-label={t('a11y.layouts')}>
    {#each PRESET_IDS as p, i (p)}
      <button type="button" aria-current={layout.doc.active === p} onclick={() => setPreset(p)} title={`Ctrl+Shift+${i + 1}`}>
        <span>{t(`preset.${p}` as Key)}</span><kbd class="keycap">{i + 1}</kbd>
      </button>
    {/each}
  </nav>
  {/if}
  <button type="button" class="cmd" onclick={() => (app.overlay = { kind: 'palette' })}>
    <span class="ic">›</span><span class="ph">{t('top.search')}</span><kbd>Ctrl+K</kbd>
  </button>
  <div class="right">
    <!-- 2 枚目以降のモニタ用のフリーのウィンドウを開く（Ctrl+Alt+N と同じ。初期の形を選ぶ） -->
    <button type="button" class="ibtn" onclick={() => runAction('newWindow')} aria-label={t('act.newWindow')} title={`${t('act.newWindow')} (${keyOf('newWindow')})`}><Icon name="newWindow" /></button>
    <!-- 押しても変わらないとき（既定のまま・最大化中）は押せない -->
    <button type="button" class="ibtn" onclick={doResetSizes} disabled={!!app.maximized || sizesAtDefault()} aria-label={t('top.resetSizes')} title={`${t('top.resetSizes')}${app.maximized ? ` — ${t('top.resetSizesMax')}` : sizesAtDefault() ? ` — ${t('top.resetSizesNone')}` : ` (${keyOf('resetSizes')})`}`}><Icon name="resetSize" /></button>
    <span class="pill" class:open={market === 'open'}>{t(market === 'open' ? 'market.open' : market === 'holiday' ? 'market.holiday' : 'market.closed')}</span>
    <span class="clock num">{clock} JST</span>
    {#if !IS_FREE}
    <button type="button" class="gear" title={`${t('act.settings')} (${keyOf('settings')})`} aria-label={t('act.settings')} onclick={() => runAction('settings')}>
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M19.14 12.94a7.07 7.07 0 0 0 .06-.94 7.07 7.07 0 0 0-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54a7.03 7.03 0 0 0-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.07 7.07 0 0 0-.06.94c0 .32.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.3.6.22l2.39-.96c.5.38 1.05.7 1.63.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54a7.03 7.03 0 0 0 1.63-.94l2.39.96c.22.08.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z"/></svg>
    </button>
    {/if}
  </div>
</header>

<style>
  .wname {
    font-weight: 700;
    font-size: var(--fs-3);
    padding: 0 var(--s-3);
    color: var(--text);
  }
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
    background: var(--brand);
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
  /* ショートカットの数字はキーの形（Ctrl+Shift+数字） */
  .presets kbd.keycap {
    display: inline-grid;
    place-items: center;
    min-width: 15px;
    height: 15px;
    padding: 0 3px;
    border: 1px solid var(--line-strong);
    border-bottom-width: 2px;
    border-radius: 3px;
    background: var(--panel-3);
    color: var(--text-3);
    font-size: var(--fs-0);
    line-height: 1;
  }
  .presets button[aria-current='true'] kbd.keycap {
    color: var(--text-2);
    border-color: var(--text-3);
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
  .gear {
    width: 28px;
    height: 24px;
    display: grid;
    place-items: center;
    background: none;
    border: 0;
    border-radius: var(--radius);
    color: var(--text-3);
    cursor: pointer;
  }
  .gear:hover {
    background: var(--hover);
    color: var(--text);
  }
</style>
