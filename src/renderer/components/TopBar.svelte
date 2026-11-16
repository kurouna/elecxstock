<script lang="ts">
import { isMarketOpen, isTradingDay, jstNow } from '@shared/calendar'
import { onMount } from 'svelte'
import { doResetSizes, keyOf, runAction } from '../lib/commands'
import type { Key } from '../lib/i18n'
import { currentPageName, openPageMenu } from '../lib/pages'
import { captionInset } from '../lib/titleBar'
import { freeNo, IS_FREE, SLOT } from '../lib/windowSlot'
import { app, t } from '../stores/app.svelte'
import { layout, PRESET_IDS, setPreset, sizesAtDefault } from '../stores/layout.svelte'
import Icon from './Icon.svelte'

const pageLabel = $derived(currentPageName())

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

// 右端に空ける幅（最小化・最大化・閉じるボタンの分。FR-L13）。窓から読み、文字の大きさ（ルートの zoom）が変わったら読み直す
let caption = $state<number | null>(null)
onMount(() => {
  type Wco = EventTarget & { visible: boolean; getTitlebarAreaRect(): DOMRect }
  const wco = (navigator as Navigator & { windowControlsOverlay?: Wco }).windowControlsOverlay
  const root = document.documentElement
  const update = () => {
    caption = captionInset(window.innerWidth, wco?.visible ? wco.getTitlebarAreaRect() : null, Number(root.style.zoom) || 1)
  }
  update()
  wco?.addEventListener('geometrychange', update)
  window.addEventListener('resize', update)
  const mo = new MutationObserver(update)
  mo.observe(root, { attributes: true, attributeFilter: ['style'] })
  return () => {
    wco?.removeEventListener('geometrychange', update)
    window.removeEventListener('resize', update)
    mo.disconnect()
  }
})
</script>

<header class="top" class:free={IS_FREE} class:haspg={!IS_FREE && layout.doc.active === 'free' && !!pageLabel} style:--caption-w={caption == null ? null : `${caption}px`}>
  <div class="brand">
    <span class="logo" aria-hidden="true">E</span><span class="name">elecxstock</span>
  </div>
  {#if IS_FREE}
    <span class="wname" title={t('win.freeHint')}>{t('win.freeTitle', { n: freeNo(SLOT) })}</span>
  {:else}
  <nav class="presets" aria-label={t('a11y.layouts')}>
    {#each PRESET_IDS as p, i (p)}
      <!-- マイレイアウト（FR-L14）: 表示中のときだけページの名前を出す（長い名前は CSS で切り、全体はツールチップ）。右の ▾ でページのメニュー -->
      {@const pg = p === 'free' && layout.doc.active === 'free' ? pageLabel : ''}
      <button type="button" data-preset={p} aria-current={layout.doc.active === p} onclick={() => setPreset(p)} title={`${t(`preset.${p}` as Key)}${pg ? ` · ${pg}` : ''} (Ctrl+Shift+${i + 1})`}>
        <span class="lbl">{t(`preset.${p}` as Key)}{#if pg}<span class="pg"> · {pg}</span>{/if}</span><kbd class="keycap">{i + 1}</kbd>
      </button>
      {#if p === 'free'}
        <button type="button" class="page-menu-btn" data-page-menu aria-haspopup="menu" aria-label={t('lay.menu')} title={`${t('lay.menu')} (${keyOf('layouts')})`} onclick={openPageMenu}>▾</button>
      {/if}
    {/each}
  </nav>
  {/if}
  <!-- 検索欄の左右は窓のドラッグに使う（縮まない。FR-L13） -->
  <div class="drag-gap" aria-hidden="true"></div>
  <button type="button" class="cmd" onclick={() => (app.overlay = { kind: 'palette' })}>
    <span class="ic">›</span><span class="ph">{t('top.search')}</span><kbd>Ctrl+K</kbd>
  </button>
  <div class="drag-gap" aria-hidden="true"></div>
  <div class="right">
    {#if !IS_FREE}
    <!-- アラート（Ctrl+Alt+L と同じ。未読があれば数の札。FR-AL8） -->
    <button type="button" class="ibtn bell" onclick={() => runAction('alerts')} aria-label={t('act.alerts')} title={t('al.bellTip', { key: keyOf('alerts') })}><Icon name="bell" />{#if app.alertsUnread}<span class="unread num">{app.alertsUnread > 99 ? '99+' : app.alertsUnread}</span>{/if}</button>
    {/if}
    <!-- 2 枚目以降のモニタ用のフリーのウィンドウを開く（Ctrl+Alt+N と同じ。初期の形を選ぶ） -->
    <button type="button" class="ibtn opt" onclick={() => runAction('newWindow')} aria-label={t('act.newWindow')} title={`${t('act.newWindow')} (${keyOf('newWindow')})`}><Icon name="newWindow" /></button>
    <!-- 押しても変わらないとき（既定のまま・最大化中）は押せない -->
    <button type="button" class="ibtn opt" onclick={doResetSizes} disabled={!!app.maximized || sizesAtDefault()} aria-label={t('top.resetSizes')} title={`${t('top.resetSizes')}${app.maximized ? ` — ${t('top.resetSizesMax')}` : sizesAtDefault() ? ` — ${t('top.resetSizesNone')}` : ` (${keyOf('resetSizes')})`}`}><Icon name="resetSize" /></button>
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
  .bell {
    position: relative;
  }
  .bell .unread {
    position: absolute;
    top: 0;
    right: -2px;
    min-width: 14px;
    padding: 0 3px;
    border-radius: 7px;
    background: var(--warn);
    color: var(--bg);
    font-size: 10px;
    line-height: 14px;
    text-align: center;
  }
  .wname {
    flex: none;
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
    /* 最小化・最大化・閉じるボタン（titleBarOverlay。幅は窓から読む）と、その左の常にドラッグできる場所（FR-L13） */
    padding-right: calc(var(--caption-w, 138px) + 40px);
    background: var(--panel);
    border-bottom: 1px solid var(--line);
    -webkit-app-region: drag;
    min-width: 0;
    /* 狭いときに省くものは、窓ではなくトップバーの中身の幅で決める（文字の大きさ・閉じるボタンの幅によらない） */
    container: top / inline-size;
  }
  /* 押せるものだけをドラッグから外す。取引時間の表示・時計・ロゴ・窓の名前・空きはドラッグできる（FR-L13） */
  .top button {
    -webkit-app-region: no-drag;
  }
  /* 検索欄の左右。gap と合わせて 48px より狭くならない */
  .drag-gap {
    flex: 1 0 24px;
    align-self: stretch;
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
  .presets button[aria-current='true'],
  .presets button[aria-current='true'] + .page-menu-btn {
    color: var(--text);
    border-bottom-color: var(--focus);
    background: var(--panel-2);
  }
  /* ページの名前（マイレイアウトを表示中のとき）。長い名前は省略記号で切る */
  .presets .pg {
    display: inline-block;
    max-width: 7em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    vertical-align: bottom;
  }
  /* ページのメニューを開く ▾（タブとは別のボタン。押せるのでドラッグから外れる） */
  .presets button.page-menu-btn {
    padding: 0 6px 0 2px;
    color: var(--text-3);
    font-size: var(--fs-1);
  }
  .presets button.page-menu-btn:hover {
    color: var(--text);
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
    flex: 0 1 520px; /* 空きは左右のドラッグの場所に回し、足りないときはまず検索欄が縮む */
    min-width: 28px; /* 狭い窓では「›」だけ残して縮む（窓の名前・ボタンを押し出さない） */
    container: cmd / inline-size;
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
  /* 狭いとき（FR-L13）: 検索欄が縮み、それでも足りなければ 時計 → マイレイアウトのページの名前 → タブの名前（キーの数字・▾・ツールチップは残す）
     → ロゴの文字・取引時間の表示 → 新しいウィンドウ・サイズを戻すのボタン（キーとコマンドバーで使える）の順に省く。窓の名前とタブは省かない。
     境目はトップバーの中身の幅。ページの名前（最大 7em）を出しているときは、時計を早めに省く（FR-L14） */
  @container cmd (max-width: 199px) {
    kbd {
      display: none;
    }
  }
  @container top (max-width: 1659px) {
    .top.haspg .clock {
      display: none;
    }
  }
  @container top (max-width: 1549px) {
    .top:not(.free) .clock {
      display: none;
    }
  }
  @container top (max-width: 1499px) {
    .presets .pg {
      display: none;
    }
  }
  @container top (max-width: 1389px) {
    .presets button {
      padding: 0 8px;
    }
    .presets .lbl {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }
  @container top (max-width: 759px) {
    .top:not(.free) .name,
    .top:not(.free) .pill {
      display: none;
    }
  }
  @container top (max-width: 599px) {
    .top:not(.free) .opt {
      display: none;
    }
  }
  /* フリー N（タブなし）: 窓の名前とボタンを残し、時計 → ロゴの文字・取引時間の表示 → ボタンの順に省く */
  @container top (max-width: 659px) {
    .top.free .clock {
      display: none;
    }
  }
  @container top (max-width: 479px) {
    .top.free .name,
    .top.free .pill {
      display: none;
    }
  }
  @container top (max-width: 299px) {
    .top.free .opt {
      display: none;
    }
  }
</style>
