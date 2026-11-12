<script lang="ts">
// コマンドバー（Ctrl+K）: 銘柄（コード・日本語名・英語名）・スクリーン・アクションを 1 つの入力で探す（FR-KB1, O1）。

import type { Instrument } from '@shared/types'
import { onMount } from 'svelte'
import { ACTIONS, type Action, sendSymbol } from '../../lib/commands'
import type { Key } from '../../lib/i18n'
import { openScreenAnywhere } from '../../lib/screens'
import { app, bridge, rpc, screenName, t, toast } from '../../stores/app.svelte'

let { q = '' }: { q?: string } = $props()
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
const actOnly = $derived(norm.startsWith('>'))
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
const items = $derived.by((): Item[] => {
  const acts = ACTIONS.filter((a) => !qq || a.label().toLowerCase().includes(qq) || a.id.toLowerCase().includes(qq)).map((a) => ({
    kind: 'act' as const,
    a,
  }))
  const scrs = actOnly
    ? []
    : app.screens
        .filter((s) => !qq || screenName(s).toLowerCase().includes(qq))
        .slice(0, 6)
        .map((s) => ({ kind: 'scr' as const, id: s.id, name: screenName(s) }))
  const out: Item[] = [...syms.map((i) => ({ kind: 'sym' as const, i })), ...scrs, ...acts]
  // 一覧に無いコードは「追加して取得する」（FR-U3）
  if (!actOnly && /^[0-9][0-9A-Z]{3,4}$/i.test(qq) && !syms.some((s) => s.code.toLowerCase() === qq))
    out.unshift({ kind: 'add', code: qq.toUpperCase() })
  return out
})
$effect(() => {
  if (sel >= items.length) sel = Math.max(0, items.length - 1)
})
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
  else if (e.key === 'Enter') void go()
  else return
  e.preventDefault()
  queueMicrotask(() => res?.querySelector('.sel')?.scrollIntoView({ block: 'nearest' }))
}
onMount(() => {
  query = q
  input?.focus()
})
</script>

<div class="dialog palette" role="dialog" aria-label="command bar">
  <input class="search" bind:this={input} bind:value={query} placeholder={t('top.search')} onkeydown={key} oninput={() => (sel = 0)} />
  <div class="list res" bind:this={res}>
    {#each items as x, i (i)}
      {#if i === 0 || items[i - 1]!.kind !== x.kind}
        <div class="grp">{x.kind === 'sym' || x.kind === 'add' ? t('cmd.symbols') : x.kind === 'scr' ? t('cmd.screens') : t('cmd.actions')}</div>
      {/if}
      <button type="button" class="it" class:sel={i === sel} onclick={() => go(i)} onmousemove={() => (sel = i)}>
        {#if x.kind === 'sym'}
          <span class="c">{x.i.code}</span><span class="n">{app.settings.lang === 'en' && x.i.nameEn ? x.i.nameEn : x.i.nameJa}</span><span class="s">{t(`mkt.${x.i.market}` as Key)}{x.i.status === 'delisted' ? ' · delisted' : ''}</span>
        {:else if x.kind === 'add'}
          <span class="c">{x.code}</span><span class="n">{t('cmd.addUser', { code: x.code })}</span>
        {:else if x.kind === 'scr'}
          <span class="c">⌕</span><span class="n">{x.name}</span>
        {:else}
          <span class="n">{x.a.label()}</span>{#if x.a.key}<kbd>{x.a.key}</kbd>{/if}
        {/if}
      </button>
    {/each}
  </div>
  <div class="foot"><span>{t('cmd.hint.move')}</span><span>{t('cmd.hint.enter')}</span><span>{t('cmd.hint.close')}</span><span style="margin-left:auto">{t('cmd.hint.actions')}</span></div>
</div>

<style>
  .palette {
    width: 640px;
    overflow: hidden;
  }
  .res {
    max-height: 420px;
    overflow: auto;
    padding: 4px 0;
  }
</style>
