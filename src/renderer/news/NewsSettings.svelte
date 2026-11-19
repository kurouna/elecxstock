<script lang="ts">
// 設定の「ニュース」のタブ（docs/design-news.md §8.2）: 取る / 取らない・間隔・フィードの一覧・このアプリの通信先・注意書き。
// フィードの一覧は ↑↓ で選び、Space でオン・オフ、D で既定に戻す。通信先の一覧は Ctrl+C でコピーできる
import type { NewsFeed, NewsLang } from '@shared/news/schema'
import { feedOn, intervalFromInput, listedFor } from '@shared/news/settings'
import { onMount } from 'svelte'
import type { Key } from '../lib/i18n'
import { app, bridge, confirmDialog, t, toast } from '../stores/app.svelte'
import { initNews, langChanged, loadNews, news, setNews } from './store.svelte'
import { errText, hm, type Tr } from './view'

const lang = $derived<NewsLang>(app.settings.lang === 'en' ? 'en' : 'ja')
const view = $derived(news.view)
const s = $derived(view?.settings)
const locked = $derived(view?.state === 'policy-off' || view?.state === 'unavailable')
let ivText = $state('')
let ivNote = $state('')
let ivBad = $state(false)
let fsel = $state(0)
let box = $state<HTMLElement>()
let endpoints = $state<{ app: string[]; news: string[] } | null>(null)

onMount(() => {
  initNews()
  void loadNews().then(() => (ivText = s?.interval ? String(s.interval) : ''))
})
// 表示言語を変えたら Core に伝える（ペインを開いていなくても。Core が知らせ、一覧を読み直す）
$effect(() => {
  void lang
  langChanged()
})
// 通信先（フィードを変えたら変わる）
$effect(() => {
  void view
  void bridge
    .call('app.endpoints', {})
    .then((e) => (endpoints = e))
    .catch(() => {})
})

/** 表示言語の一覧（listFor）を先に、もう一方の言語を後に */
const groups = $derived.by(() => {
  const reg = view?.registry ?? []
  const other: NewsLang = lang === 'ja' ? 'en' : 'ja'
  const mine = reg.filter((f) => listedFor(f, lang))
  return [
    { lang, feeds: mine },
    { lang: other, feeds: reg.filter((f) => !mine.includes(f)) },
  ]
})
const flat = $derived(groups.flatMap((g) => g.feeds))
const statusOf = (id: string) => view?.feeds.find((f) => f.id === id)

function applyInterval() {
  const r = intervalFromInput(ivText)
  ivBad = !r
  ivNote = ''
  if (!r) return
  if (r.clamped) ivNote = t('set.news.intervalClamped', { n: r.value })
  ivText = r.value ? String(r.value) : ''
  if (r.value !== s?.interval) void setNews({ interval: r.value })
}
function toggleFeed(f: NewsFeed) {
  if (!s || locked) return
  void setNews({ feeds: { [f.id]: !feedOn(f, s, lang) } })
}
function feedKey(e: KeyboardEvent) {
  const f = flat[fsel]
  if (e.key === 'ArrowDown') fsel = Math.min(flat.length - 1, fsel + 1)
  else if (e.key === 'ArrowUp') fsel = Math.max(0, fsel - 1)
  else if (e.key === ' ' && f) toggleFeed(f)
  else if (e.code === 'KeyD' && f && !e.ctrlKey && !e.altKey) void setNews({ feeds: { [f.id]: null } })
  else return
  e.preventDefault()
  e.stopPropagation()
  queueMicrotask(() => box?.querySelector('.frow.sel')?.scrollIntoView({ block: 'nearest' }))
}
/** 通信先（www.jpx.co.jp は既存の許可リストとニュースの両方に入るので 1 つにする） */
const hosts = $derived([...new Set([...(endpoints?.app ?? []), ...(endpoints?.news ?? [])])])
function hostsKey(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyC' && !window.getSelection()?.toString()) {
    e.preventDefault()
    e.stopPropagation()
    void window.elecxstock.copyText(hosts.join('\n')).then((ok) => ok && toast(t('set.news.endpointsCopied')))
  }
}
async function clear() {
  const r = await confirmDialog({ title: t('set.news.clear'), ok: t('set.news.clear'), danger: true })
  app.overlay = { kind: 'settings', tab: 'news' }
  if (!r.ok) return
  await bridge.call('news.clearCache', {})
  toast(t('set.news.cleared'))
}
const err = (e?: string) => errText(e, t as Tr)
const groupLabel = (g: NewsFeed['group']) => t(`news.tab.${g}` as Key)
</script>

{#if view && s}
  {#if view.state === 'policy-off'}<p class="muted small">{t('set.news.policy')}</p>{/if}
  <div class="field">
    <span>{t('set.news.enabled')}</span>
    <span class="row">
      <button type="button" class="toggle" class:on={s.enabled === true} aria-pressed={s.enabled === true} aria-label={t('set.news.enabled')} disabled={locked} onclick={() => setNews({ enabled: s.enabled !== true })}><span class="box"></span></button>
      <span class="muted small">{t('set.news.enabledHint')}</span>
    </span>
  </div>
  <div class="field">
    <span>{t('set.news.interval')}</span>
    <span class="row">
      <input class="iv" class:bad={ivBad} bind:value={ivText} inputmode="numeric" aria-label={t('set.news.interval')} disabled={locked} onchange={applyInterval} onkeydown={(e) => e.key === 'Enter' && applyInterval()} />
      {#each [5, 10, 30, 60] as m (m)}<button type="button" class="chip" aria-pressed={s.interval === m} disabled={locked} onclick={() => { ivText = String(m); applyInterval() }}>{m}</button>{/each}
      <span class="muted small" class:warn={ivBad}>{ivBad ? t('set.news.intervalBad') : ivNote || t('set.news.intervalHint')}</span>
    </span>
  </div>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div class="feeds" class:dim={locked || s.enabled !== true} tabindex="0" role="listbox" aria-label={t('set.news.feeds')} bind:this={box} onkeydown={feedKey}>
    {#each groups as g (g.lang)}
      {#if g.feeds.length}
        <div class="sh"><b>{t(`set.news.lang.${g.lang}` as Key)}</b>{#if g === groups[0]}<span>{t('set.news.feedsHint')}</span>{/if}</div>
        {#each g.feeds as f (f.id)}
          {@const st = statusOf(f.id)}
          {@const on = feedOn(f, s, lang)}
          {@const i = flat.indexOf(f)}
          <div class="frow" class:sel={i === fsel} role="option" aria-selected={i === fsel} tabindex="-1" onclick={() => (fsel = i)} onkeydown={() => {}}>
            <button type="button" class="toggle" class:on aria-pressed={on} aria-label={f.name[lang]} disabled={locked} onclick={() => toggleFeed(f)}><span class="box"></span></button>
            <span class="src">{f.short}</span>
            <span class="nm"><span class="nmt">{f.name[lang]}</span>
              {#if f.lang !== lang}<small class="badge">{t(`set.news.badge.${f.lang}` as Key)}</small>{/if}
              {#if f.paywall}<small class="badge">{t('set.news.badge.pay')}</small>{/if}
              {#if !f.summary}<small class="badge">{t('set.news.badge.nosum')}</small>{/if}
              {#if !f.terms}<small class="badge">{t('set.news.badge.unchecked')}</small>{/if}
              {#if s.feeds[f.id] != null}<small class="badge">{t('set.news.badge.changed')}</small>{/if}
            </span>
            <span class="gp">{groupLabel(f.group)}</span>
            <span class="st" class:bad={!!st?.error}>
              {#if st?.error}{err(st.error)}{#if st.retryAt} · {t('news.err.retry', { t: hm(st.retryAt) })}{/if}{:else if st?.okAt}{t('set.news.okAt', { t: hm(st.okAt), n: st.count })}{:else if on}{t('set.news.never')}{/if}
            </span>
          </div>
        {/each}
      {/if}
    {/each}
  </div>
  <div class="grp">
    <div class="sh"><b>{t('set.news.endpoints')}</b><span>{t('set.news.endpointsHint')}</span></div>
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <div class="hosts" tabindex="0" role="list" aria-label={t('set.news.endpoints')} onkeydown={hostsKey}>
      {#each hosts as h (h)}<div role="listitem">{h}</div>{/each}
    </div>
    <p class="muted small">{t('set.news.terms')}</p>
    <button type="button" class="btn" disabled={locked} onclick={clear}>{t('set.news.clear')}</button>
  </div>
{/if}

<style>
  .field {
    display: grid;
    grid-template-columns: 190px 1fr;
    align-items: center;
    min-height: 36px;
    gap: var(--s-3);
    border-bottom: 1px solid var(--line);
  }
  .field > span:first-child {
    color: var(--text-2);
  }
  .row {
    display: flex;
    gap: var(--s-2);
    align-items: center;
    flex-wrap: wrap;
  }
  .small {
    font-size: var(--fs-1);
  }
  .warn {
    color: var(--warn);
  }
  .iv {
    width: 64px;
    height: 24px;
    background: var(--bg);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    color: var(--text);
    text-align: right;
    padding: 0 6px;
    font: var(--fs-2) var(--mono);
  }
  .iv:focus {
    outline: none;
    border-color: var(--focus);
  }
  .iv.bad {
    border-color: var(--warn);
  }
  .sh {
    display: flex;
    align-items: baseline;
    gap: 10px;
    border-bottom: 1px solid var(--line);
    padding: 0 4px 4px;
    margin-top: var(--s-3);
  }
  .sh b {
    font-size: var(--fs-2);
  }
  .sh span {
    color: var(--text-3);
    font-size: var(--fs-1);
  }
  .feeds {
    outline: none;
  }
  .feeds.dim .frow {
    opacity: 0.55;
  }
  .frow {
    display: grid;
    grid-template-columns: 34px 46px minmax(0, 1fr) 70px minmax(140px, 200px);
    align-items: center;
    gap: 10px;
    height: 28px;
    padding: 0 4px;
    border-bottom: 1px solid var(--line-soft);
  }
  .feeds:focus .frow.sel {
    background: var(--select);
    box-shadow: inset 2px 0 0 var(--focus);
  }
  .src {
    font-size: var(--fs-0);
    line-height: 16px;
    padding: 0 4px;
    border-radius: var(--radius);
    background: var(--panel-3);
    color: var(--text-2);
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
  }
  .nm {
    display: flex;
    align-items: center;
    min-width: 0;
    white-space: nowrap;
  }
  .nmt {
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  .badge {
    flex: none;
    color: var(--text-3);
    margin-left: 6px;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    padding: 0 4px;
    font-size: var(--fs-0);
  }
  .gp {
    color: var(--text-3);
    font-size: var(--fs-1);
  }
  .st {
    color: var(--text-3);
    font: var(--fs-1) var(--mono);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .st.bad {
    color: var(--warn);
  }
  .hosts {
    font: var(--fs-1) / 1.8 var(--mono);
    color: var(--text-2);
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 6px 10px;
    margin: var(--s-2) 0;
    columns: 3;
    column-gap: 24px;
    user-select: text;
    outline: none;
  }
  .hosts:focus {
    border-color: var(--focus);
  }
</style>
