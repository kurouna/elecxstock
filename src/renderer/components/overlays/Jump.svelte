<script lang="ts">
// 銘柄ジャンプ（FR-O1）: 1〜9 で始まるコードを 5 桁まで打ち、Enter でリンクグループに送る。

import type { Instrument } from '@shared/types'
import { onMount } from 'svelte'
import { sendSymbol } from '../../lib/commands'
import type { Key } from '../../lib/i18n'
import { app, bridge, closeOverlay, t } from '../../stores/app.svelte'

let { first }: { first: string } = $props()
let buf = $state('')
let sel = $state(0)
let cand = $state<Instrument[]>([])
let token = 0
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
  else if (e.key === 'Enter') {
    const x = cand[sel]
    app.overlay = null
    if (x) sendSymbol(x.id)
  } else if (e.key === 'Escape') closeOverlay()
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
      <div class="it" class:sel={i === sel}><span class="c">{x.code}</span><span class="n">{app.settings.lang === 'en' && x.nameEn ? x.nameEn : x.nameJa}</span><span class="s">{t(`mkt.${x.market}` as Key)}</span></div>
    {:else}
      <div class="it muted">{t('jump.none')}</div>
    {/each}
  </div>
  <div class="foot"><span>{t('jump.title')}</span><span style="margin-left:auto">{t('jump.hint')}</span></div>
</div>

<style>
  .jump {
    position: fixed;
    left: 50%;
    top: 28%;
    transform: translateX(-50%);
    width: 380px;
    z-index: 60;
  }
  .big {
    font-size: 28px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--line-strong);
    letter-spacing: 0.1em;
  }
</style>
