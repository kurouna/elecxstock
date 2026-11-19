<script lang="ts">
// ニュースのペイン（docs/design-news.md §7。FR-NW1〜NW9）。見出しを時刻順に出すだけ。翻訳はしない。
// キー: ↑↓ PgUp PgDn Home End・Enter（開く）・G / Shift+G・Ctrl+PgDn / PgUp（タブ）・/（絞り込み）・Ctrl+C・Ctrl+Alt+C（コピー）・P・R・N
import { copyList, copyOne } from '@shared/news/copy'
import type { NewsItem } from '@shared/news/schema'
import { onMount } from 'svelte'
import PaneHeader from '../components/PaneHeader.svelte'
import { setFocus } from '../lib/commands'
import type { Key } from '../lib/i18n'
import { registerPane } from '../lib/panes'
import { SelectionFollow } from '../lib/selection'
import { app, bridge, t, toast } from '../stores/app.svelte'
import { type PaneNode, patchState } from '../stores/layout.svelte'
import { feedOf, initNews, langChanged, news, setNews, setPaneVisible } from './store.svelte'
import {
  arrivals,
  buttonKey,
  dayLabel,
  failedCount,
  hostOf,
  jstDay,
  NEWS_TABS,
  type NewsTab,
  pageStep,
  previewSummary,
  rowsOf,
  rowTime,
  statusText,
  type Tr,
  tabCounts,
  tagsOf,
  visibleItems,
} from './view'

let { pane }: { pane: PaneNode } = $props()
const tab = $derived(((pane.state.tab as NewsTab) ?? 'all') as NewsTab)
const preview = $derived(pane.state.preview !== false)
const lang = $derived(app.settings.lang === 'en' ? 'en' : 'ja')
let q = $state('')
let filterOn = $state(false)
let sel = $state(0)
let root = $state<HTMLElement>()
let scroller = $state<HTMLDivElement>()
let input = $state<HTMLInputElement>()
let bodyH = $state(0)
let bodyW = $state(0)

const list = $derived(news.list)
const nstate = $derived(list?.state ?? null)
const all = $derived(list?.items ?? [])
const counts = $derived(tabCounts(all, feedOf))
const items = $derived(visibleItems(all, feedOf, tab, q, lang))
const rows = $derived(rowsOf(items, list?.seenAt ?? 0))
const read = $derived(new Set(list?.read ?? []))
const cur = $derived<NewsItem | undefined>(items[sel])
const curFeed = $derived(cur ? feedOf(cur.feed) : undefined)
const failed = $derived(failedCount(list?.feeds ?? []))
const onCount = $derived((list?.feeds ?? []).filter((f) => f.on).length)
// 一覧が届くたびに今日を取り直す（日をまたいで開いたままでも「今日」がずれない）
const today = $derived.by(() => {
  void list
  return jstDay(Date.now())
})
const showPreview = $derived(preview && bodyH >= 300)
const side = $derived(showPreview && bodyW >= 900)

// 選んでいる見出しは中身（キー）で追う。新しい見出しが上に届いても動かない（FR-NW1）
const follow = new SelectionFollow<NewsItem>((x) => x.key)
$effect(() => {
  const s = follow.sync(items, sel).sel
  if (s !== sel) sel = s
})
/** 最後に一番上を見たときにあった見出し（新しい見出しの帯） */
let known = $state<Set<string> | null>(null)
$effect(() => {
  if (known == null && all.length) known = new Set(all.map((x) => x.key))
})
const newer = $derived(known ? arrivals(items, known) : 0)
function seeTop() {
  known = new Set(all.map((x) => x.key))
}

onMount(() => {
  initNews()
  // 見えているか: 少しでも重なり（端に接しているだけは数えない）、visibility: hidden（しまったドロワー）でない
  const seen = (e: IntersectionObserverEntry) => e.intersectionRatio > 0 && (root?.checkVisibility({ visibilityProperty: true }) ?? false)
  const io = new IntersectionObserver((es) => setPaneVisible(pane.id, es.some(seen)), { threshold: [0, 0.01] })
  if (root) io.observe(root)
  const off = registerPane(pane.id, { key: onKey })
  return () => {
    io.disconnect()
    setPaneVisible(pane.id, false)
    off()
  }
})
$effect(() => {
  void lang
  langChanged()
})

function scrollToSel() {
  queueMicrotask(() => scroller?.querySelector('.row.sel')?.scrollIntoView({ block: 'nearest' }))
}
function move(to: number) {
  sel = Math.max(0, Math.min(items.length - 1, to))
  if (sel === 0) seeTop()
  scrollToSel()
}
function setTab(d: number) {
  const shown = NEWS_TABS.filter((x) => x === 'all' || counts[x] > 0)
  const i = Math.max(0, shown.indexOf(tab))
  patchState(pane, { tab: shown[(i + d + shown.length) % shown.length] })
  sel = 0
  follow.reset()
}
function open(it: NewsItem | undefined) {
  if (!it) return
  if (it.link) void window.elecxstock.openExternal(it.link).catch(() => {})
  void bridge.call('news.markRead', { key: it.key }).catch(() => {})
}
async function copy(text: string, msg: string) {
  if (await window.elecxstock.copyText(text)) toast(msg)
}
function copyCurrent() {
  if (cur) void copy(copyOne(cur, curFeed, lang), t('news.copied', { n: 1 }))
}
function copyShown() {
  const r = copyList(items, feedOf, lang)
  if (r.count) void copy(r.text, r.capped ? t('news.copiedCap', { n: r.count }) : t('news.copied', { n: r.count }))
}
/** ペインの中で文字を選んでいるか（そのときの Ctrl+C は Chromium の既定のコピーに任せる） */
function textSelectedHere(): boolean {
  const s = window.getSelection()
  return !!s && !s.isCollapsed && s.toString() !== '' && !!root?.contains(s.anchorNode)
}
function openSettings() {
  if (list?.notice.length) void bridge.call('news.noticed', {})
  app.overlay = { kind: 'settings', tab: 'news' }
}
function startFilter() {
  filterOn = true
  queueMicrotask(() => input?.focus())
}
function endFilter() {
  q = ''
  filterOn = false
  setFocus(pane.id)
}

function onKey(e: KeyboardEvent): boolean {
  const ctrl = e.ctrlKey || e.metaKey
  const c = e.code
  // 本文の中のボタン（取る・取らない・設定を開く・新しい見出しの帯）に Tab で来て押した Enter・Space は、ボタンに任せる
  if (buttonKey(e, root)) return false
  if (ctrl && !e.shiftKey && c === 'KeyC') {
    if (e.altKey) {
      copyShown()
      return true
    }
    if (textSelectedHere()) return false
    copyCurrent()
    return true
  }
  if (ctrl && !e.shiftKey && !e.altKey && (c === 'PageDown' || c === 'PageUp')) {
    setTab(c === 'PageDown' ? 1 : -1)
    return true
  }
  if (ctrl || e.altKey) return false
  if (c === 'KeyN' && !e.shiftKey) {
    openSettings()
    return true
  }
  if (nstate !== 'on') {
    if (nstate === 'unanswered' && e.key === 'Enter') {
      void setNews({ enabled: true })
      return true
    }
    return false
  }
  const k = e.key
  if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'PageDown' || k === 'PageUp') {
    const page = pageStep(scroller?.clientHeight)
    move(sel + ({ ArrowDown: 1, ArrowUp: -1, PageDown: page, PageUp: -page }[k] ?? 0))
    return true
  }
  if (k === 'Home' || k === 'End') {
    move(k === 'Home' ? 0 : items.length - 1)
    if (k === 'Home') scroller?.scrollTo({ top: 0 })
    return true
  }
  if (k === 'Enter') {
    open(cur)
    return true
  }
  if (c === 'KeyG') {
    setTab(e.shiftKey ? -1 : 1)
    return true
  }
  if (k === '/') {
    startFilter()
    return true
  }
  if (c === 'KeyP' && !e.shiftKey) {
    patchState(pane, { preview: !preview })
    return true
  }
  if (c === 'KeyR' && !e.shiftKey) {
    void bridge.call('news.refresh', {})
    return true
  }
  // 絞り込みの欄が開いていれば、空でも閉じる（一覧にフォーカスがあるとき。欄の中の Esc は filterKey）
  if (k === 'Escape' && (q || filterOn)) {
    endFilter()
    return true
  }
  return false
}
function filterKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    endFilter()
  } else if (e.key === 'Enter' || e.key === 'ArrowDown') {
    e.preventDefault()
    setFocus(pane.id)
  }
}
const status = $derived(statusText(list?.round, news.view?.settings.interval, t as Tr))
</script>

<PaneHeader {pane} collapse={600}>
  {#if nstate === 'on'}
    <span class="tabs" role="tablist" aria-label={t('widget.news')}>
      {#each NEWS_TABS.filter((x) => x === 'all' || counts[x] > 0) as x (x)}
        <button type="button" role="tab" aria-selected={tab === x} title="G / Shift+G" onclick={() => { patchState(pane, { tab: x }); sel = 0; follow.reset() }}>
          {t(`news.tab.${x}` as Key)}<span class="n">{counts[x]}</span>
        </button>
      {/each}
    </span>
    <span class="grow"></span>
    {#if failed}<span class="err" title={t('news.failedN', { n: failed })}>⚠ {failed}</span>{/if}
    <span class="meta" class:off={list?.round.offline}>{status}</span>
    <button type="button" class="chip" aria-pressed={filterOn} title={`${t('news.filter')} (/)`} aria-label={t('news.filter')} onclick={() => (filterOn ? endFilter() : startFilter())}>⌕</button>
  {/if}
</PaneHeader>
<div class="news" bind:this={root}>
  {#if filterOn && nstate === 'on'}
    <div class="filter">
      <input bind:this={input} bind:value={q} placeholder={t('news.filterPh')} aria-label={t('news.filter')} onkeydown={filterKey} oninput={() => { sel = 0; follow.reset() }} />
    </div>
  {/if}
  {#if !list}
    <div class="state"></div>
  {:else if nstate === 'unanswered'}
    <div class="quiet">
      <div class="box">
        <div class="ttl">{t('news.ask.title')}</div>
        <div class="sub">{t('news.ask.body')}</div>
        <div class="keys">
          <button type="button" class="btn primary" onclick={() => setNews({ enabled: true })}><kbd>Enter</kbd> {t('news.ask.yes')}</button>
          <button type="button" class="btn" onclick={() => setNews({ enabled: false })}>{t('news.ask.no')}</button>
          <button type="button" class="btn" onclick={openSettings}><kbd>N</kbd> {t('news.settingsKey')}</button>
        </div>
      </div>
    </div>
  {:else if nstate === 'off' || nstate === 'policy-off' || nstate === 'unavailable'}
    <div class="quiet">
      <div class="box">
        <div class="ttl">{nstate === 'off' ? t('news.off.title') : nstate === 'policy-off' ? t('news.policy.title') : t('news.unavailable')}</div>
        {#if nstate !== 'unavailable'}<div class="sub">{nstate === 'off' ? t('news.off.body') : t('news.policy.body')}</div>{/if}
        {#if nstate === 'off'}<div class="keys"><button type="button" class="btn" onclick={openSettings}><kbd>N</kbd> {t('news.settingsKey')}</button></div>{/if}
      </div>
    </div>
  {:else}
    <div class="nbody" class:side class:prev={showPreview} bind:clientHeight={bodyH} bind:clientWidth={bodyW}>
      <div class="list scroll" bind:this={scroller} role="listbox" aria-label={t('widget.news')} tabindex="-1">
        {#if newer > 0}
          <button type="button" class="newer" onclick={() => { move(0); scroller?.scrollTo({ top: 0 }) }}>{t('news.newer', { n: newer })}</button>
        {/if}
        {#if list.notice.length}
          <button type="button" class="notice" onclick={openSettings}>{t('news.notice')}</button>
        {/if}
        {#if !onCount}
          <div class="state"><div>{t('news.noFeed')} <button type="button" class="btn" onclick={openSettings}><kbd>N</kbd> {t('news.settingsKey')}</button></div></div>
        {:else if !all.length && list.round.running}
          {#each Array.from({ length: 6 }) as _, i (i)}<div class="skel"><i></i><i></i><i style:width={`${60 + ((i * 17) % 35)}%`}></i></div>{/each}
          <div class="sub loading">{t('news.loading')}</div>
        {:else if !items.length}
          <div class="state">{t('news.none')}</div>
        {:else}
          {#each rows as r, i (r.kind === 'item' ? r.item.key : `${r.kind}:${i}`)}
            {#if r.kind === 'day'}
              <div class="day">{dayLabel(r.day, today, lang, { today: t('news.today'), yesterday: t('news.yesterday') })}</div>
            {:else if r.kind === 'seen'}
              <div class="seen">{t('news.seen')}</div>
            {:else}
              {@const f = feedOf(r.item.feed)}
              <!-- 行にはフォーカスを置かない（キーはペインで受ける。クリックで行が枠を持たないように） -->
              <!-- svelte-ignore a11y_click_events_have_key_events, a11y_interactive_supports_focus -->
              <div
                class="row"
                class:sel={r.index === sel}
                class:read={read.has(r.item.key)}
                role="option"
                aria-selected={r.index === sel}
                onclick={() => { move(r.index); setFocus(pane.id) }}
                ondblclick={() => open(r.item)}
              >
                <span class="t">{rowTime(r.item)}</span>
                <span class="src" title={f?.name[lang]}>{f?.short ?? ''}</span>
                <span class="h" lang={f && f.lang !== lang ? f.lang : undefined}>{r.item.title}</span>
                <span class="tags">{#each tagsOf(r.item, f, lang, !!r.late, t as Tr) as g (g)}<span class="tag">{g}</span>{/each}</span>
              </div>
            {/if}
          {/each}
        {/if}
      </div>
      <div class="detail">
        {#if cur && curFeed}
          <span class="nm">{curFeed.name[lang]}</span>{#if cur.link} · <span class="host">{hostOf(cur.link)}</span>{/if}{#if curFeed.copyright} · {curFeed.copyright}{/if}
          <span class="grow"></span><span class="hint">{t('news.copyHint')}</span>
        {/if}
      </div>
      {#if showPreview}
        <div class="pv" class:blank={!cur}>
          {#if cur && curFeed}
            <div class="pm"><span class="nm">{curFeed.name[lang]}</span><span>{rowTime(cur)}</span>{#if cur.link}<span class="host">{hostOf(cur.link)}</span>{/if}</div>
            <div class="pt" lang={curFeed.lang !== lang ? curFeed.lang : undefined}>{cur.title}</div>
            <div class="ps">{previewSummary(cur, curFeed, t as Tr)}</div>
            <div class="pk">
              {#if cur.link}<span><kbd>Enter</kbd> {t('news.open')}</span>{/if}
              <span><kbd>Ctrl+C</kbd></span>
              <span><kbd>P</kbd> {t('news.preview')}</span>
              {#if curFeed.copyright}<span class="grow"></span><span>{curFeed.copyright}</span>{/if}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .news {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    position: relative;
    container-type: inline-size;
  }
  .tabs {
    display: flex;
    align-items: stretch;
    height: 26px;
    margin-left: var(--s-1);
    flex: none;
  }
  .tabs button {
    background: none;
    border: 0;
    border-bottom: 2px solid transparent;
    padding: 0 6px;
    color: var(--text-2);
    font-size: var(--fs-1);
    display: flex;
    gap: 4px;
    align-items: center;
    cursor: pointer;
  }
  .tabs button[aria-selected='true'] {
    color: var(--text);
    border-bottom-color: var(--text);
    font-weight: 600;
  }
  .tabs .n {
    color: var(--text-3);
    font: var(--fs-1) var(--mono);
  }
  .grow {
    flex: 1;
  }
  .meta {
    color: var(--text-3);
    font-size: var(--fs-1);
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  .meta.off,
  .err {
    color: var(--warn);
  }
  .err {
    font-size: var(--fs-1);
    border: 1px solid color-mix(in srgb, var(--warn) 45%, transparent);
    border-radius: var(--radius);
    padding: 0 4px;
    line-height: 15px;
    flex: none;
  }
  .filter {
    display: flex;
    height: 26px;
    align-items: center;
    padding: 0 var(--s-2);
    border-bottom: 1px solid var(--line);
    flex: none;
  }
  .filter input {
    flex: 1;
    height: 20px;
    background: var(--bg);
    border: 1px solid var(--focus);
    border-radius: var(--radius);
    color: var(--text);
    padding: 0 6px;
    outline: none;
  }
  .nbody {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
  }
  .nbody.prev {
    grid-template-rows: minmax(0, 1fr) auto auto;
  }
  .nbody.side {
    grid-template-rows: minmax(0, 1fr) auto;
    grid-template-columns: minmax(0, 1fr) minmax(280px, 38%);
  }
  .nbody.side .detail {
    grid-column: 1;
  }
  .nbody.side .pv {
    grid-column: 2;
    grid-row: 1 / span 2;
    border-top: 0;
    border-left: 1px solid var(--line);
    height: auto;
    padding: 12px 14px;
  }
  .list {
    overflow: auto;
    min-height: 0;
    position: relative;
    outline: none;
  }
  .newer,
  .notice {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    width: 100%;
    justify-content: center;
    height: 22px;
    align-items: center;
    background: var(--panel-2);
    border: 0;
    border-bottom: 1px solid var(--line);
    color: var(--focus);
    font-size: var(--fs-1);
    cursor: pointer;
  }
  .notice {
    position: static;
    color: var(--text-2);
  }
  .day {
    position: sticky;
    top: 0;
    z-index: 1;
    height: 20px;
    line-height: 20px;
    padding: 0 var(--s-2);
    font-size: var(--fs-1);
    color: var(--text-3);
    background: var(--panel);
    border-bottom: 1px solid var(--line-soft);
  }
  .row {
    display: grid;
    grid-template-columns: 42px 48px minmax(0, 1fr) auto;
    grid-template-areas: 't s h g';
    align-items: center;
    gap: 0 var(--s-2);
    height: var(--row);
    padding: 0 10px;
    cursor: default;
  }
  .row:hover {
    background: var(--hover);
  }
  .row.sel {
    background: var(--select);
    box-shadow: inset 2px 0 0 var(--focus);
  }
  .t {
    grid-area: t;
    font: var(--fs-1) var(--mono);
    color: var(--text-3);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .src {
    grid-area: s;
    font-size: var(--fs-1);
    color: var(--text-2);
    white-space: nowrap;
    overflow: hidden;
  }
  .h {
    grid-area: h;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--text);
  }
  .row.read .h {
    color: var(--text-3);
  }
  .tags {
    grid-area: g;
    display: flex;
    gap: 4px;
  }
  .tag {
    font-size: var(--fs-0);
    color: var(--text-3);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    padding: 0 4px;
    line-height: 14px;
    white-space: nowrap;
  }
  .seen {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    height: 16px;
    padding: 0 10px;
    color: var(--text-3);
    font-size: var(--fs-0);
  }
  .seen::before,
  .seen::after {
    content: '';
    flex: 1;
    border-top: 1px solid var(--line-strong);
  }
  /* 狭いペイン（480px 未満）: 2 行の行（1 行目に時刻と出所と印、2 行目に見出し） */
  @container (max-width: 480px) {
    .row {
      grid-template-columns: auto 1fr auto;
      grid-template-areas: 't s g' 'h h h';
      height: auto;
      padding: 4px 10px;
      row-gap: 1px;
    }
    .h {
      white-space: normal;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      -webkit-box-orient: vertical;
      line-height: 1.45;
    }
  }
  .detail,
  .pv {
    user-select: text;
  }
  .detail {
    display: flex;
    gap: 4px;
    height: 20px;
    line-height: 20px;
    padding: 0 10px;
    border-top: 1px solid var(--line);
    font-size: var(--fs-1);
    color: var(--text-3);
    white-space: nowrap;
    overflow: hidden;
  }
  .detail .nm,
  .pm .nm {
    color: var(--text-2);
  }
  .host {
    font-family: var(--mono);
  }
  .hint {
    flex: none;
  }
  .pv {
    border-top: 1px solid var(--line);
    padding: 8px 10px 6px;
    display: grid;
    gap: 4px;
    align-content: start;
    height: 112px;
    overflow: hidden;
  }
  .pv.blank {
    visibility: hidden;
  }
  .pm,
  .pk {
    display: flex;
    gap: var(--s-2);
    align-items: center;
    color: var(--text-3);
    font-size: var(--fs-1);
    white-space: nowrap;
    overflow: hidden;
  }
  .pm .nm {
    font-weight: 600;
  }
  .pt {
    font-weight: 600;
    font-size: var(--fs-3);
    line-height: 1.45;
    color: var(--text);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .ps {
    color: var(--text-2);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .nbody.side .ps {
    -webkit-line-clamp: 6;
    line-clamp: 6;
  }
  .pk {
    margin-top: auto;
  }
  .quiet {
    display: grid;
    place-items: center;
    flex: 1;
    padding: var(--s-4);
  }
  .quiet .box {
    max-width: 420px;
    display: grid;
    gap: var(--s-2);
  }
  .quiet .ttl {
    color: var(--text);
    font-weight: 600;
  }
  .quiet .sub,
  .loading {
    color: var(--text-3);
    font-size: var(--fs-1);
    line-height: 1.6;
  }
  .loading {
    padding: var(--s-2) 10px;
  }
  .quiet .keys {
    display: flex;
    gap: var(--s-3);
    color: var(--text-2);
    font-size: var(--fs-1);
    margin-top: 4px;
  }
  .skel {
    height: var(--row);
    display: grid;
    grid-template-columns: 42px 48px 1fr;
    gap: var(--s-2);
    align-items: center;
    padding: 0 10px;
  }
  .skel i {
    height: 8px;
    border-radius: 1px;
    background: var(--panel-3);
  }
</style>
