<script lang="ts">
// 銘柄ジャンプ（FR-O1）: 1〜9 で始まるコードを 5 桁まで打ち、Enter でリンクグループに送る。
// Ctrl+D（☆）でお気に入りに入れる・外す。閉じずにコードを空にして、続けて次のコードを打てるようにする。フォーカス中のペインが足す先を持てば（ウォッチリスト・パフォーマンス比較。PaneApi.addTarget）、Ctrl+Enter（＋）でそこに足す。
// Enter・Ctrl+Enter・行のクリックで何をするかは lib/addTarget.ts で決める（足す先の種類でここに分岐を書かない）

import type { Instrument } from '@shared/types'
import { onMount } from 'svelte'
import { addButton, enterAction } from '../../lib/addTarget'
import { focusedAddTarget, sendSymbol } from '../../lib/commands'
import type { Key } from '../../lib/i18n'
import { composing } from '../../lib/keys'
import { clampSel } from '../../lib/selection'
import { app, bridge, closeOverlay, isFav, t, toggleFav } from '../../stores/app.svelte'

let { first }: { first: string } = $props()
let buf = $state('')
let sel = $state(0)
let cand = $state<Instrument[]>([])
let token = 0
let box = $state<HTMLDivElement>()
// 開いたときのフォーカス先の足す先（ジャンプ中もフォーカスは動かない）
const target = focusedAddTarget()
const plus = addButton(target)
/** Enter（ctrl で Ctrl+Enter）と行のクリック */
function enter(i: number, ctrl: boolean) {
  const a = enterAction(target, ctrl)
  if (a === 'add') add(i)
  else if (a === 'show') show(i)
}
function show(i = sel) {
  const x = cand[i]
  app.overlay = null
  if (x) sendSymbol(x.id)
}
/** 足す先に足して閉じる（足せなければ足す先が理由を知らせ、閉じない） */
function add(i = sel) {
  const x = cand[i]
  if (!x || !target) return
  if (target.add(x.id)) app.overlay = null
}
function fav(i = sel) {
  const x = cand[i]
  if (!x) return
  toggleFav(x.id)
  buf = ''
}
$effect(() => {
  const q = buf
  const my = ++token
  if (!q) {
    cand = []
    return
  }
  bridge
    .call('instruments.search', { q, limit: 6 })
    .then((r) => {
      if (my !== token) return
      cand = r.filter((i) => i.code.startsWith(q))
      sel = 0
    })
    .catch(() => {})
})
function onKey(e: KeyboardEvent) {
  if (composing(e)) return
  e.preventDefault()
  e.stopPropagation()
  const c = e.code
  const ch = c.startsWith('Digit') || c.startsWith('Numpad') ? c.slice(-1) : c.startsWith('Key') ? c.slice(3) : ''
  if (/^[0-9A-Z]$/.test(ch) && !e.ctrlKey && !e.altKey && buf.length < 5) buf += ch
  else if (e.key === 'Backspace') {
    buf = buf.slice(0, -1)
    if (!buf) closeOverlay()
  } else if (e.key === 'ArrowDown') sel = clampSel(sel + 1, cand.length)
  else if (e.key === 'ArrowUp') sel = Math.max(0, sel - 1)
  else if (e.key === 'Enter') enter(sel, e.ctrlKey || e.metaKey)
  else if (c === 'KeyD' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) fav()
  else if (e.key === 'Escape') closeOverlay()
}
onMount(() => {
  buf = first
  // 外をクリックしたら閉じる（クリックそのものは邪魔しない）
  const outside = (e: PointerEvent) => {
    if (box && !box.contains(e.target as Node)) closeOverlay()
  }
  window.addEventListener('keydown', onKey, true)
  window.addEventListener('pointerdown', outside, true)
  return () => {
    window.removeEventListener('keydown', onKey, true)
    window.removeEventListener('pointerdown', outside, true)
  }
})
</script>

<div class="dialog jump" bind:this={box} role="dialog" aria-label={t('jump.title')}>
  <div class="big num">{buf.length < 4 ? buf.padEnd(4, '_') : buf}</div>
  <div class="list">
    {#each cand as x, i (x.id)}
      {@const on = isFav(x.id)}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div class="it" class:sel={i === sel} onclick={() => enter(i, false)} onmousemove={() => (sel = i)}>
        <span class="c">{x.code}</span><span class="n">{app.settings.lang === 'en' && x.nameEn ? x.nameEn : x.nameJa}</span><span class="s">{t(`mkt.${x.market}` as Key)}</span>
        {#if plus}
          <button type="button" class="side" class:full={plus.full} aria-disabled={plus.full} title={`${plus.title} (Ctrl+Enter)`} onclick={(e) => { e.stopPropagation(); add(i) }}>＋ {plus.label}</button>
        {/if}
        <button type="button" class="side star" class:fav={on} aria-pressed={on} title={`${t(on ? 'cmd.favOff' : 'cmd.favOn')} (Ctrl+D)`} aria-label={t(on ? 'cmd.favOff' : 'cmd.favOn')} onclick={(e) => { e.stopPropagation(); fav(i) }}>{on ? '★' : '☆'}</button>
      </div>
    {:else}
      <div class="it muted">{buf ? t('jump.none') : t('jump.next')}</div>
    {/each}
  </div>
  <div class="foot"><span>{enterAction(target, false) === 'add' ? t('jump.hintAdd', { name: target!.label }) : t('jump.hint')}</span><span>{t('cmd.hint.fav')}</span>{#if plus?.ctrlHint}<span>{t('cmd.hint.addTo', { list: plus.label })}</span>{/if}</div>
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
  .side.full {
    opacity: 0.45;
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
