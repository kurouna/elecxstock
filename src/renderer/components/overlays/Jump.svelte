<script lang="ts">
// 銘柄ジャンプ（FR-O1）: 1〜9 で始まるコードを 5 桁まで打ち、Enter でリンクグループに送る。
// Ctrl+D（☆）でお気に入りに入れる・外す（閉じない）。ウォッチリストにフォーカスがあれば Ctrl+Enter（＋）でそのリストに足す。

import type { Instrument } from '@shared/types'
import { onMount } from 'svelte'
import { focusedWatchlist, sendSymbol } from '../../lib/commands'
import type { Key } from '../../lib/i18n'
import { addToList, app, bridge, closeOverlay, isFav, listName, t, toggleFav } from '../../stores/app.svelte'

let { first }: { first: string } = $props()
let buf = $state('')
let sel = $state(0)
let cand = $state<Instrument[]>([])
let token = 0
// 開いたときのフォーカス先（ジャンプ中もフォーカスは動かない）
const target = focusedWatchlist()
function show(i = sel) {
  const x = cand[i]
  app.overlay = null
  if (x) sendSymbol(x.id)
}
function add(i = sel) {
  const x = cand[i]
  if (!x || !target) return
  app.overlay = null
  addToList(target.id, [x.id])
  sendSymbol(x.id)
}
function fav(i = sel) {
  const x = cand[i]
  if (x) toggleFav(x.id)
}
$effect(() => {
  const q = buf
  const my = ++token
  bridge.call('instruments.search', { q, limit: 6 }).then((r) => {
    if (my !== token) return
    cand = r.filter((i) => i.code.startsWith(q))
    sel = 0
  })
})
function onKey(e: KeyboardEvent) {
  if (e.isComposing) return
  e.preventDefault()
  e.stopPropagation()
  const c = e.code
  const ch = c.startsWith('Digit') || c.startsWith('Numpad') ? c.slice(-1) : c.startsWith('Key') ? c.slice(3) : ''
  if (/^[0-9A-Z]$/.test(ch) && !e.ctrlKey && !e.altKey && buf.length < 5) buf += ch
  else if (e.key === 'Backspace') {
    buf = buf.slice(0, -1)
    if (!buf) closeOverlay()
  } else if (e.key === 'ArrowDown') sel = Math.min(cand.length - 1, sel + 1)
  else if (e.key === 'ArrowUp') sel = Math.max(0, sel - 1)
  else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) add()
  else if (e.key === 'Enter') show()
  else if (c === 'KeyD' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) fav()
  else if (e.key === 'Escape') closeOverlay()
}
onMount(() => {
  buf = first
  window.addEventListener('keydown', onKey, true)
  return () => window.removeEventListener('keydown', onKey, true)
})
</script>

<div class="dialog jump" role="dialog" aria-label={t('jump.title')}>
  <div class="big num">{buf.length < 4 ? buf.padEnd(4, '_') : buf}</div>
  <div class="list">
    {#each cand as x, i (x.id)}
      {@const on = isFav(x.id)}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div class="it" class:sel={i === sel} onclick={() => show(i)} onmousemove={() => (sel = i)}>
        <span class="c">{x.code}</span><span class="n">{app.settings.lang === 'en' && x.nameEn ? x.nameEn : x.nameJa}</span><span class="s">{t(`mkt.${x.market}` as Key)}</span>
        {#if target && target.id !== 'favorites'}
          <button type="button" class="side" title={`${t('cmd.addToList', { list: listName(target) })} (Ctrl+Enter)`} onclick={(e) => { e.stopPropagation(); add(i) }}>＋ {listName(target)}</button>
        {/if}
        <button type="button" class="side star" class:fav={on} aria-pressed={on} title={`${t(on ? 'cmd.favOff' : 'cmd.favOn')} (Ctrl+D)`} aria-label={t(on ? 'cmd.favOff' : 'cmd.favOn')} onclick={(e) => { e.stopPropagation(); fav(i) }}>{on ? '★' : '☆'}</button>
      </div>
    {:else}
      <div class="it muted">{t('jump.none')}</div>
    {/each}
  </div>
  <div class="foot"><span>{t('jump.hint')}</span><span>{t('cmd.hint.fav')}</span>{#if target && target.id !== 'favorites'}<span>{t('cmd.hint.addTo', { list: listName(target) })}</span>{/if}</div>
</div>

<style>
  .jump {
    position: fixed;
    left: 50%;
    top: 28%;
    transform: translateX(-50%);
    width: 460px;
    z-index: 60;
  }
  .side {
    flex: none;
    background: none;
    border: 0;
    padding: 0 6px;
    color: var(--text-3);
    cursor: pointer;
    font-size: var(--fs-1);
    white-space: nowrap;
  }
  .side:hover {
    color: var(--text);
  }
  .star {
    font-size: var(--fs-3);
  }
  .star.fav {
    color: var(--gold);
  }
  .big {
    font-size: 28px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--line-strong);
    letter-spacing: 0.1em;
  }
</style>
