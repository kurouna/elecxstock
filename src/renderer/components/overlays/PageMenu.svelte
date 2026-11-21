<script lang="ts">
// マイレイアウトのページのメニュー（FR-L14。docs/design-mylayouts.md §3.2）。タブの ▾・Ctrl+Shift+L・このタブで Ctrl+Shift+8 で開き、
// タブの下に出す。↑↓ Enter・1〜9 で開く・Alt+↑↓ 並べ替え・Insert 新しいページ・Shift+Insert 複製・F2 名前・Delete 2 回で削除・
// Ctrl+Z 削除を元に戻す・Esc で閉じる。ページを選ぶまで表示中のタブは変えない。キーの判定は lib/pages.ts（menuKey・deletePress）

import type { SavedLayout } from '@shared/types'
import { onMount } from 'svelte'
import { keepFocus } from '../../lib/focusTrap'
import { composing } from '../../lib/keys'
import {
  copyTab,
  deletePress,
  duplicate,
  type MenuCommand,
  type MenuRow,
  menuKey,
  menuPosition,
  menuRows,
  menuTarget,
  nameOfPage,
  newPage,
  remove,
  rename,
  undoRemove,
} from '../../lib/pages'
import { rootZoom } from '../../lib/pointer'
import { clampSel } from '../../lib/selection'
import { app, t } from '../../stores/app.svelte'
import { layout, movePage, openablePages, setPage } from '../../stores/layout.svelte'
import Icon, { type IconName } from '../Icon.svelte'
import Keys from './Keys.svelte'

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
  if (sel >= rows.length) sel = clampSel(sel, rows.length)
})
const target = $derived(menuTarget(rows, sel, layout.doc.page))

function open(p: SavedLayout | undefined) {
  if (!p) return
  app.overlay = null
  setPage(p.id)
}
/** キー・クリックの操作を行う（クリックは、その行で Enter を押したのと同じ） */
function run(cmd: MenuCommand) {
  const r = rows[sel]
  const d = deletePress(pendingDel, cmd, r, target?.id)
  pendingDel = d.pending
  if (d.remove && target) return void remove(target.id)
  switch (cmd.kind) {
    case 'select':
      sel = cmd.sel
      return
    case 'reorder':
      if (r?.kind === 'page' && movePage(r.page.id, cmd.delta)) sel += cmd.delta
      return
    case 'open':
      return open(openablePages()[cmd.index])
    case 'new':
      return void newPage()
    case 'duplicate':
      return void duplicate(target?.id)
    case 'rename':
      return void rename(target?.id)
    case 'undo':
      return void undoRemove()
    case 'delete':
      return
    case 'row':
      if (r?.kind === 'page') open(r.page)
      else if (r?.kind === 'copyTab') void copyTab()
      else if (r && r.kind !== 'delete') run({ kind: r.kind })
  }
}
function key(e: KeyboardEvent) {
  const cmd = menuKey(e, sel, rows.length)
  if (!cmd) {
    if (!composing(e) && !['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) pendingDel = null
    return
  }
  run(cmd)
  e.preventDefault()
  e.stopPropagation()
}
function click(i: number) {
  sel = i
  run({ kind: 'row' })
}
onMount(() => {
  // タブの ▾ の下に出す（無ければフリーのタブ、それも無ければ上の真ん中）
  const a = document.querySelector('[data-page-menu]') ?? document.querySelector('[data-preset="free"]')
  const r = a?.getBoundingClientRect()
  if (r?.width) pos = menuPosition(r, box?.offsetWidth ?? 320, window.innerWidth, rootZoom())
  box?.focus()
})
// キーで選んだ行が、スクロールの外に出ないようにする（ページが多いとメニューは縦に流れる）
$effect(() => {
  void sel
  queueMicrotask(() => box?.querySelector('.it.sel')?.scrollIntoView({ block: 'nearest' }))
})
type Act = Exclude<MenuRow['kind'], 'page'>
const label: Record<Act, () => string> = {
  new: () => t('lay.new'),
  duplicate: () => t('lay.duplicate'),
  rename: () => t('lay.rename'),
  copyTab: () => t('lay.saveCurrent'),
  delete: () => t('lay.delete'),
}
const icon: Record<Act, IconName> = { new: 'plus', duplicate: 'copy', rename: 'edit', copyTab: 'import', delete: 'trash' }
/** 操作のキー（空白は続けて押す: Delete を 2 回） */
const hint: Record<Act, string> = {
  new: 'Insert',
  duplicate: 'Shift+Insert',
  rename: 'F2',
  copyTab: '',
  delete: 'Delete Delete',
}
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  class="dialog page-menu"
  class:anchored={!!pos}
  style:left={pos ? `${pos.left}px` : null}
  style:top={pos ? `${pos.top}px` : null}
  role="menu"
  aria-label={t('lay.title')}
  tabindex="0"
  bind:this={box}
  onkeydown={key}
  onmousedown={keepFocus}
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
        onclick={() => click(i)}
        onmousemove={() => (sel = i)}
      >
        <span class="ck" aria-hidden="true">{r.page.id === layout.doc.page ? '✓' : ''}</span>
        <span class="n">{nameOfPage(r.page)}</span>
        {#if pendingDel === r.page.id}<span class="tag warn">{t('scr.deleteAgain')}</span>{/if}
        <span class="s num">{r.n ?? ''}</span>
      </button>
    {:else}
      <button type="button" role="menuitem" class="it act" class:sel={i === sel} onclick={() => click(i)} onmousemove={() => (sel = i)}>
        <span class="ck"><Icon name={icon[r.kind]} size={14} /></span>
        <span class="n">{label[r.kind]()}</span>
        {#if r.kind === 'delete' && pendingDel && target?.id === pendingDel}<span class="tag warn">{t('scr.deleteAgain')}</span>{/if}
        {#if hint[r.kind]}<Keys keys={hint[r.kind]} />{/if}
      </button>
    {/if}
  {/each}
  <div class="lx-foot">
    <span><Keys keys="Enter" /> {t('lay.keyOpen')}</span>
    <span><Keys keys="1〜9" /> {t('lay.keyNum')}</span>
    <span><Keys keys="Alt+↑ / Alt+↓" /> {t('dlg.reorder')}</span>
    <span><Keys keys="Ctrl+Z" /> {t('lay.keyUndo')}</span>
  </div>
</div>

<style>
  .page-menu {
    width: 320px;
    padding: 4px 0;
    outline: none;
    max-height: calc(100vh - 80px);
    overflow: auto;
  }
  .page-menu.anchored {
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
    width: 14px;
    flex: none;
    display: grid;
    place-items: center;
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
  .it.act .ck {
    color: var(--text-3);
  }
  .page-menu .lx-foot {
    margin-top: 4px;
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
