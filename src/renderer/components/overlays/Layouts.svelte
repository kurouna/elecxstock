<script lang="ts">
// マイレイアウトのページのメニュー（FR-L14。docs/design-mylayouts.md §3.2）。タブの ▾・Ctrl+Shift+L・このタブで Ctrl+Shift+8 で開き、
// タブの下に出す。↑↓ Enter・1〜9 で開く・Alt+↑↓ 並べ替え・Insert 新しいページ・Shift+Insert 複製・F2 名前・Delete 2 回で削除・
// Ctrl+Z 削除を元に戻す・Esc で閉じる。ページを選ぶまで表示中のタブは変えない
import type { SavedLayout } from '@shared/types'
import { onMount } from 'svelte'
import { copyTab, duplicate, type MenuRow, menuRows, nameOfPage, newPage, remove, rename, undoRemove } from '../../lib/pages'
import { app, t } from '../../stores/app.svelte'
import { layout, movePage, openablePages, setPage } from '../../stores/layout.svelte'

const rows = $derived(menuRows(openablePages(), layout.doc.active))
let sel = $state(
  Math.max(
    0,
    openablePages().findIndex((p) => p.id === layout.doc.page),
  ),
)
let pendingDel = $state<string | null>(null)
let box = $state<HTMLDivElement>()
let pos = $state<{ left: number; top: number } | null>(null)
$effect(() => {
  if (sel >= rows.length) sel = rows.length - 1
})
/** 複製・名前・削除の相手: 選んでいる行がページならそのページ、操作の行なら表示中のページ */
const target = $derived.by((): SavedLayout | undefined => {
  const r = rows[sel]
  return r?.kind === 'page' ? r.page : openablePages().find((p) => p.id === layout.doc.page)
})

function open(p: SavedLayout) {
  app.overlay = null
  setPage(p.id)
}
function del(p: SavedLayout | undefined) {
  if (!p) return
  if (pendingDel !== p.id) pendingDel = p.id
  else {
    pendingDel = null
    remove(p.id)
  }
}
function runRow(r: MenuRow | undefined) {
  if (!r) return
  if (r.kind === 'page') open(r.page)
  else if (r.kind === 'new') void newPage()
  else if (r.kind === 'duplicate') void duplicate(target?.id)
  else if (r.kind === 'rename') void rename(target?.id)
  else if (r.kind === 'copyTab') void copyTab()
  else del(target)
}
function key(e: KeyboardEvent) {
  if (e.isComposing) return
  const r = rows[sel]
  const ctrl = e.ctrlKey || e.metaKey
  if (e.key !== 'Delete' && !(e.key === 'Enter' && r?.kind === 'delete')) pendingDel = null
  const digit = /^Digit([1-9])$/.exec(e.code)
  if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && e.altKey) {
    const d = e.key === 'ArrowUp' ? -1 : 1
    if (r?.kind === 'page' && movePage(r.page.id, d)) sel += d
  } else if (e.key === 'ArrowDown') sel = Math.min(rows.length - 1, sel + 1)
  else if (e.key === 'ArrowUp') sel = Math.max(0, sel - 1)
  else if (e.key === 'Home') sel = 0
  else if (e.key === 'End') sel = rows.length - 1
  else if (e.key === 'Enter') runRow(r)
  else if (digit && !ctrl && !e.altKey && !e.shiftKey) {
    const p = openablePages()[Number(digit[1]) - 1]
    if (p) open(p)
  } else if (e.key === 'Insert' && e.shiftKey) void duplicate(target?.id)
  else if (e.key === 'Insert') void newPage()
  else if (e.key === 'F2') void rename(target?.id)
  else if (e.key === 'Delete') del(target)
  else if (ctrl && !e.shiftKey && !e.altKey && e.code === 'KeyZ') undoRemove()
  else return
  e.preventDefault()
  e.stopPropagation()
}
onMount(() => {
  // タブの ▾ の下に出す（無ければフリーのタブ、それも無ければ上の真ん中）
  const a = document.querySelector('[data-page-menu]') ?? document.querySelector('[data-preset="free"]')
  const r = a?.getBoundingClientRect()
  const w = box?.offsetWidth ?? 320
  if (r?.width) pos = { left: Math.max(4, Math.min(r.right - w, window.innerWidth - w - 4)), top: r.bottom + 2 }
  box?.focus()
})
const label: Record<Exclude<MenuRow['kind'], 'page'>, () => string> = {
  new: () => `＋ ${t('lay.new')}`,
  duplicate: () => `⧉ ${t('lay.duplicate')}`,
  rename: () => `✎ ${t('lay.rename')}`,
  copyTab: () => `↓ ${t('lay.saveCurrent')}`,
  delete: () => `🗑 ${t('lay.delete')}`,
}
const hint: Record<Exclude<MenuRow['kind'], 'page'>, string> = {
  new: 'Insert',
  duplicate: 'Shift+Insert',
  rename: 'F2',
  copyTab: '',
  delete: 'Delete ×2',
}
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  class="dialog pmenu"
  class:anchored={!!pos}
  style:left={pos ? `${pos.left}px` : null}
  style:top={pos ? `${pos.top}px` : null}
  role="menu"
  aria-label={t('lay.title')}
  tabindex="0"
  bind:this={box}
  onkeydown={key}
>
  {#each rows as r, i (r.kind === 'page' ? r.page.id : r.kind)}
    {#if r.kind !== 'page' && rows[i - 1]?.kind === 'page'}<div class="sep" role="separator"></div>{/if}
    {#if r.kind === 'page'}
      <button
        type="button"
        role="menuitemradio"
        class="it"
        class:sel={i === sel}
        aria-checked={r.page.id === layout.doc.page}
        onclick={() => open(r.page)}
        onmousemove={() => (sel = i)}
      >
        <span class="ck" aria-hidden="true">{r.page.id === layout.doc.page ? '✓' : ''}</span>
        <span class="n">{nameOfPage(r.page)}</span>
        {#if pendingDel === r.page.id}<span class="tag warn">{t('scr.deleteAgain')}</span>{/if}
        <span class="s num">{r.n ?? ''}</span>
      </button>
    {:else}
      <button type="button" role="menuitem" class="it act" class:sel={i === sel} onclick={() => runRow(r)} onmousemove={() => (sel = i)}>
        <span class="n">{label[r.kind]()}</span>
        {#if r.kind === 'delete' && pendingDel && target?.id === pendingDel}<span class="tag warn">{t('scr.deleteAgain')}</span>{/if}
        <span class="s">{hint[r.kind]}</span>
      </button>
    {/if}
  {/each}
</div>

<style>
  .pmenu {
    width: 320px;
    padding: 4px 0;
    outline: none;
    max-height: calc(100vh - 80px);
    overflow: auto;
  }
  .pmenu.anchored {
    position: fixed;
  }
  .it {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    width: 100%;
    padding: 4px var(--s-3);
    background: none;
    border: 0;
    color: var(--text);
    text-align: left;
    cursor: pointer;
  }
  .it:hover {
    background: var(--hover);
  }
  .it.sel {
    background: var(--select-strong);
    box-shadow: inset 2px 0 0 var(--focus);
  }
  .it .ck {
    width: 1em;
    color: var(--focus);
  }
  .it .n {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .it .s {
    color: var(--text-3);
    font-size: var(--fs-1);
  }
  .it.act .n {
    color: var(--text-2);
  }
  .sep {
    height: 1px;
    margin: 4px 0;
    background: var(--line);
  }
</style>
