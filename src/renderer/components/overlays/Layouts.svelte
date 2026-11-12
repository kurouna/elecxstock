<script lang="ts">
// 名前を付けたレイアウト（Ctrl+Shift+L。FR-L4 の P2）: 今のレイアウトを保存（Insert）・開く（Enter）・名前の変更（F2）・
// 上書き（Ctrl+S）・削除（Delete を 2 回）・並べ替え（Alt+↑↓）。開くと今のプリセットの「今のレイアウト」に読み込む。
import type { SavedLayout } from '@shared/types'
import { onMount } from 'svelte'
import { app, promptDialog, rpc, t, toast } from '../../stores/app.svelte'
import { applyEntry, type LayoutEntry, layout, normalizeEntry, snapshotEntry } from '../../stores/layout.svelte'

let sel = $state(0)
let pendingDel = $state<string | null>(null)
let box = $state<HTMLDivElement>()
const name = (l: SavedLayout) => (app.settings.lang === 'en' ? l.name.en || l.name.ja : l.name.ja)
const persist = () => void rpc('user.saveLayouts', { layouts: $state.snapshot(app.layouts) }).catch(() => {})
const reopen = () => (app.overlay = { kind: 'layouts' })

async function saveNew() {
  const n = await promptDialog(t('lay.saveTitle'), '')
  reopen()
  if (!n) return
  const now = Date.now()
  app.layouts = [
    ...app.layouts,
    {
      id: `l${now.toString(36)}`,
      name: { ja: n, en: n },
      entry: snapshotEntry(),
      links: { ...$state.snapshot(layout.doc.links) },
      created: now,
      updated: now,
    },
  ]
  sel = app.layouts.length - 1
  persist()
  toast(t('lay.saved', { name: n }))
}
function overwrite(l: SavedLayout) {
  l.entry = snapshotEntry()
  l.links = { ...$state.snapshot(layout.doc.links) }
  l.updated = Date.now()
  persist()
  toast(t('lay.saved', { name: name(l) }))
}
function open(l: SavedLayout) {
  const e = normalizeEntry(l.entry)
  if (!e) return toast(t('lay.broken'))
  app.overlay = null
  applyEntry(e as LayoutEntry, l.links)
  toast(t('lay.opened', { name: name(l) }))
}
async function key(e: KeyboardEvent) {
  if (e.isComposing) return
  const ls = app.layouts
  const x = ls[sel]
  if (e.key !== 'Delete') pendingDel = null
  if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && e.altKey && x) {
    const j = sel + (e.key === 'ArrowUp' ? -1 : 1)
    if (j >= 0 && j < ls.length) {
      const n = [...ls]
      ;[n[sel], n[j]] = [n[j]!, n[sel]!]
      app.layouts = n
      sel = j
      persist()
    }
  } else if (e.key === 'ArrowDown') sel = Math.min(ls.length - 1, sel + 1)
  else if (e.key === 'ArrowUp') sel = Math.max(0, sel - 1)
  else if (e.key === 'Enter' && x) open(x)
  else if (e.key === 'Insert' || (e.ctrlKey && e.shiftKey && e.code === 'KeyS')) void saveNew()
  else if (e.ctrlKey && !e.shiftKey && e.code === 'KeyS' && x) overwrite(x)
  else if (e.key === 'F2' && x) {
    const n = await promptDialog(t('lay.renameTitle'), name(x))
    reopen()
    if (n) {
      x.name = { ja: n, en: n }
      persist()
    }
  } else if (e.key === 'Delete' && x) {
    if (pendingDel !== x.id) pendingDel = x.id
    else {
      app.layouts = ls.filter((l) => l.id !== x.id)
      sel = Math.max(0, Math.min(sel, app.layouts.length - 1))
      persist()
      pendingDel = null
    }
  } else return
  e.preventDefault()
}
onMount(() => box?.focus())
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div class="dialog palette" role="dialog" aria-label={t('lay.title')} tabindex="0" bind:this={box} onkeydown={key}>
  <div class="head"><h3>{t('lay.title')}</h3><button type="button" class="chip" onclick={saveNew}>＋ {t('lay.saveCurrent')} <kbd>Insert</kbd></button></div>
  <div class="list res">
    {#if !app.layouts.length}<div class="empty muted">{t('lay.empty')}</div>{/if}
    {#each app.layouts as l, i (l.id)}
      <button type="button" class="it" class:sel={i === sel} onclick={() => open(l)} onmousemove={() => (sel = i)}>
        <span class="n">{name(l)}{#if pendingDel === l.id}<span class="tag warn">{t('scr.deleteAgain')}</span>{/if}</span>
        <span class="s">{new Date(l.updated).toLocaleString(app.settings.lang === 'ja' ? 'ja-JP' : 'en-US', { dateStyle: 'short', timeStyle: 'short' })}</span>
      </button>
    {/each}
  </div>
  <div class="foot">
    <span>Enter {t('lay.open')}</span><span>Insert {t('lay.saveCurrent')}</span><span>Ctrl+S {t('lay.overwrite')}</span><span>F2</span><span>Alt+↑↓</span><span>Delete</span>
  </div>
</div>

<style>
  .palette {
    width: 560px;
    overflow: hidden;
    outline: none;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--s-3) var(--s-3) var(--s-2);
  }
  .head h3 {
    margin: 0;
  }
  .res {
    max-height: 420px;
    overflow: auto;
    padding: 4px 0;
  }
  .empty {
    padding: var(--s-3);
  }
</style>
