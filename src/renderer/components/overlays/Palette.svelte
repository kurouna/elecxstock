<script lang="ts">
// コマンドバー（Ctrl+K）: 銘柄（コード・日本語名・英語名）・スクリーン・アクションを 1 つの入力で探す（FR-KB1, O1）。

import { CODE_RE } from '@shared/code'
import type { Instrument } from '@shared/types'
import { onMount } from 'svelte'
import { ACTIONS, type Action, focusedWatchlist, holdingsTabLocked, keyOf, sendSymbol } from '../../lib/commands'
import type { Key } from '../../lib/i18n'
import { openScreenAnywhere } from '../../lib/screens'
import { addToList, app, bridge, isFav, listName, rpc, screenName, t, toast, toggleFav } from '../../stores/app.svelte'

/** title があるときは銘柄だけを選ぶ（chart-grid のタイルの差し替えなど） */
let { q = '', title }: { q?: string; title?: string } = $props()
let query = $state('')
let sel = $state(0)
let syms = $state<Instrument[]>([])
let input = $state<HTMLInputElement>()
let res = $state<HTMLDivElement>()
let token = 0

type Item =
  | { kind: 'sym'; i: Instrument }
  | { kind: 'scr'; id: string; name: string }
  | { kind: 'act'; a: Action }
  | { kind: 'add'; code: string }
const norm = $derived(query.normalize('NFKC').trim())
const actOnly = $derived(!title && norm.startsWith('>'))
const qq = $derived((actOnly ? norm.slice(1) : norm).trim().toLowerCase())
$effect(() => {
  const s = qq
  const my = ++token
  if (actOnly || !s) {
    syms = []
    return
  }
  bridge.call('instruments.search', { q: s, limit: 10 }).then((r) => {
    if (my === token) syms = r
  })
})
const tracked = (i: Instrument) => i.userAdded || i.market === 'P' || i.market === 'R' || i.market === 'I'
const items = $derived.by((): Item[] => {
  const acts = (title ? [] : ACTIONS)
    .filter((a) => !qq || a.label().toLowerCase().includes(qq) || a.id.toLowerCase().includes(qq))
    .map((a) => ({
      kind: 'act' as const,
      a,
    }))
  const scrs =
    actOnly || title
      ? []
      : app.screens
          .filter((s) => !qq || screenName(s).toLowerCase().includes(qq))
          .slice(0, 6)
          .map((s) => ({ kind: 'scr' as const, id: s.id, name: screenName(s) }))
  const out: Item[] = [...syms.map((i) => ({ kind: 'sym' as const, i })), ...scrs, ...acts]
  // 一覧に無いコードは「追加して取得する」（FR-U3）
  // 一覧にあっても取得の対象外（スタンダード・グロース・ETF など）なら「追加して取得する」を出す
  if (!actOnly && CODE_RE.test(qq.toUpperCase())) {
    const hit = syms.find((s) => s.code.toLowerCase() === qq)
    if (!hit) out.unshift({ kind: 'add', code: qq.toUpperCase() })
    else if (!tracked(hit)) out.splice(syms.indexOf(hit) + 1, 0, { kind: 'add', code: hit.code })
  }
  return out
})
/** フォーカス中のペインがウォッチリストなら、そのリストに直接足せる（Ctrl+Enter） */
const target = $derived(title ? null : focusedWatchlist())
$effect(() => {
  if (sel >= items.length) sel = Math.max(0, items.length - 1)
})
/** 候補の銘柄 ID。まだ一覧に無いコードは、追加して取得を始めてから返す */
async function idOf(x: Item | undefined): Promise<string | null> {
  if (x?.kind === 'sym') return x.i.id
  if (x?.kind !== 'add') return null
  const ins = await rpc('instruments.addUser', { code: x.code })
  if (!ins) return null
  app.instruments.set(ins.id, ins)
  toast(t('cmd.addUser', { code: x.code }))
  return ins.id
}
/** ☆: お気に入りに入れる・外す。コマンドバーは閉じない（続けて探せるように） */
async function fav(i = sel) {
  const x = items[i]
  const id = await idOf(x)
  if (!id) return
  toggleFav(id)
  if (x?.kind === 'add') {
    app.overlay = null
    sendSymbol(id)
  }
}
/** フォーカス中のウォッチリストに足して、その銘柄を表示する */
async function addTo(i = sel) {
  if (!target) return void holdingsTabLocked()
  const list = target.id
  const id = await idOf(items[i])
  if (!id) return
  app.overlay = null
  addToList(list, [id])
  sendSymbol(id)
}
async function go(i = sel) {
  const x = items[i]
  if (!x) return
  app.overlay = null
  if (x.kind === 'sym') sendSymbol(x.i.id)
  else if (x.kind === 'scr') openScreenAnywhere(x.id)
  else if (x.kind === 'act') await x.a.run()
  else {
    const ins = await rpc('instruments.addUser', { code: x.code })
    if (ins) {
      app.instruments.set(ins.id, ins)
      sendSymbol(ins.id)
      toast(t('cmd.addUser', { code: x.code }))
    }
  }
}
function key(e: KeyboardEvent) {
  if (e.isComposing) return
  if (e.key === 'ArrowDown') sel = Math.min(items.length - 1, sel + 1)
  else if (e.key === 'ArrowUp') sel = Math.max(0, sel - 1)
  else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    if (!target) return void holdingsTabLocked()
    void addTo()
  } else if (e.key === 'Enter') void go()
  else if (e.code === 'KeyD' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && !title) void fav()
  else return
  e.preventDefault()
  queueMicrotask(() => res?.querySelector('.sel')?.scrollIntoView({ block: 'nearest' }))
}
onMount(() => {
  query = q
  input?.focus()
})
</script>

<div class="dialog palette" role="dialog" aria-label={t('a11y.commandBar')}>
  {#if title}<div class="ttl">{title}</div>{/if}
  <input class="search" bind:this={input} bind:value={query} placeholder={title ? t('cmd.symbolPh') : t('top.search')} onkeydown={key} oninput={() => (sel = 0)} />
  <div class="list res" bind:this={res}>
    {#each items as x, i (i)}
      {#if i === 0 || items[i - 1]!.kind !== x.kind}
        <div class="grp">{x.kind === 'sym' || x.kind === 'add' ? t('cmd.symbols') : x.kind === 'scr' ? t('cmd.screens') : t('cmd.actions')}</div>
      {/if}
      <div class="row" class:on={i === sel}>
      <button type="button" class="it" class:sel={i === sel} onclick={() => go(i)} onmousemove={() => (sel = i)}>
        {#if x.kind === 'sym'}
          <span class="c">{x.i.code}</span><span class="n">{app.settings.lang === 'en' && x.i.nameEn ? x.i.nameEn : x.i.nameJa}</span><span class="s">{t(`mkt.${x.i.market}` as Key)}{x.i.status === 'delisted' ? ' · delisted' : ''}</span>
        {:else if x.kind === 'add'}
          <span class="c">{x.code}</span><span class="n">{t('cmd.addUser', { code: x.code })}</span>
        {:else if x.kind === 'scr'}
          <span class="c">⌕</span><span class="n">{x.name}</span>
        {:else}
          <span class="n">{x.a.label()}</span>{#if keyOf(x.a)}<kbd>{keyOf(x.a)}</kbd>{/if}
        {/if}
      </button>
      {#if !title && (x.kind === 'sym' || x.kind === 'add')}
        {#if target && target.id !== 'favorites'}
          <button type="button" class="side" title={`${t('cmd.addToList', { list: listName(target) })} (Ctrl+Enter)`} onclick={() => addTo(i)} onmousemove={() => (sel = i)}>＋ {listName(target)}</button>
        {/if}
        {@const on = x.kind === 'sym' && isFav(x.i.id)}
        <button type="button" class="side star" class:fav={on} aria-pressed={on} title={`${t(on ? 'cmd.favOff' : 'cmd.favOn')} (Ctrl+D)`} aria-label={t(on ? 'cmd.favOff' : 'cmd.favOn')} onclick={() => fav(i)} onmousemove={() => (sel = i)}>{on ? '★' : '☆'}</button>
      {/if}
      </div>
    {/each}
  </div>
  <div class="foot"><span>{t('cmd.hint.move')}</span><span>{t('cmd.hint.enter')}</span>{#if !title}<span>{t('cmd.hint.fav')}</span>{/if}{#if target && target.id !== 'favorites'}<span>{t('cmd.hint.addTo', { list: listName(target) })}</span>{/if}<span>{t('cmd.hint.close')}</span><span style="margin-left:auto">{t('cmd.hint.actions')}</span></div>
</div>

<style>
  .ttl {
    padding: 8px 12px 0;
    font-size: var(--fs-1);
    color: var(--text-2);
  }
  .palette {
    width: 640px;
    overflow: hidden;
  }
  .row {
    display: flex;
    align-items: stretch;
  }
  .row.on {
    background: var(--select-strong);
  }
  .side {
    flex: none;
    background: none;
    border: 0;
    padding: 0 10px;
    color: var(--text-3);
    cursor: pointer;
    font-size: var(--fs-1);
    white-space: nowrap;
  }
  .side:hover {
    color: var(--text);
    background: var(--hover);
  }
  .star {
    font-size: var(--fs-3);
  }
  .star.fav {
    color: var(--gold);
  }
  .res {
    max-height: 420px;
    overflow: auto;
    padding: 4px 0;
  }
</style>
