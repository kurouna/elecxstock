<script lang="ts">
// 保存したスクリーンの一覧（Ctrl+O。FR-SC12）: 開く・名前の変更（F2）・複製（Ctrl+Shift+D）・削除（Delete を 2 回）・
// 並べ替え（Alt+↑↓）・既定のスクリーンを戻す（Ctrl+Shift+R、FR-SC15。戻せるものがあるときだけ案内を出す）。

import type { SavedScreen } from '@shared/types'
import { onMount } from 'svelte'
import { conditionsText } from '../../lib/conditionEdit'
import { keepFocus } from '../../lib/focusTrap'
import { composing } from '../../lib/keys'
import { missingDefaults, newScreenId, openScreenAnywhere, removeScreen, screenRows } from '../../lib/screens'
import { clampSel } from '../../lib/selection'
import { app, promptDialog, rpc, saveScreens, screenName, t, toast } from '../../stores/app.svelte'
import { allPanes } from '../../stores/layout.svelte'
import Hl from './Hl.svelte'
import Keys from './Keys.svelte'

let query = $state('')
let sel = $state(0)
let pendingDel = $state<string | null>(null)
let input = $state<HTMLInputElement>()
let res = $state<HTMLDivElement>()
let defs = $state<SavedScreen[]>([])
const missing = $derived(missingDefaults(defs, app.screens))
const openId = $derived(allPanes().find((p) => p.widget === 'screener')?.state.screenId as string | undefined)
const rows = $derived(screenRows(app.screens, query))
const items = $derived(rows.map((r) => r.s))
const cur = $derived(items[sel])

async function key(e: KeyboardEvent) {
  if (composing(e)) return
  if (e.key !== 'Delete') pendingDel = null
  if (e.key === 'Escape' && query) {
    query = ''
    sel = 0
    return e.preventDefault()
  }
  const x = items[sel]
  if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && e.altKey) {
    if (query || !x) return e.preventDefault()
    const i = app.screens.indexOf(x)
    const j = i + (e.key === 'ArrowUp' ? -1 : 1)
    if (j < 0 || j >= app.screens.length) return e.preventDefault()
    const ss = [...app.screens]
    ;[ss[i], ss[j]] = [ss[j]!, ss[i]!]
    app.screens = ss
    sel = j
    saveScreens()
  } else if (e.ctrlKey && e.shiftKey && e.code === 'KeyR') void restoreDefaults()
  else if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) sel = clampSel(sel + 1, items.length)
  else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) sel = Math.max(0, sel - 1)
  else if (e.key === 'Home' && !query) sel = 0
  else if (e.key === 'End' && !query) sel = clampSel(items.length - 1, items.length)
  else if (e.key === 'Enter' && x) {
    app.overlay = null
    openScreenAnywhere(x.id)
  } else if (e.key === 'Delete' && x) {
    if (app.screens.length <= 1) return
    if (pendingDel !== x.id) pendingDel = x.id
    else {
      removeScreen(x.id) // 開いていたペインは残った最初のスクリーンを開く
      pendingDel = null
      sel = Math.max(0, Math.min(sel, items.length - 1)) // 末尾を消したら、新しい末尾を選ぶ
    }
  } else if (e.key === 'F2' && x) {
    const name = await promptDialog(t('scr.renameTitle'), screenName(x))
    app.overlay = { kind: 'screens' }
    if (name) {
      x.name = { ja: name, en: name }
      saveScreens()
    }
  } else if (e.ctrlKey && e.shiftKey && e.code === 'KeyD' && x) {
    const now = Date.now()
    app.screens.splice(app.screens.indexOf(x) + 1, 0, {
      ...JSON.parse(JSON.stringify(x)),
      id: newScreenId(now),
      name: { ja: t('scr.copyOf', { name: x.name.ja }), en: `${x.name.en} copy` },
      created: now,
      updated: now,
    })
    saveScreens()
  } else return
  e.preventDefault()
}
/** 既定のスクリーンを戻す（FR-SC15）。消したものだけを末尾に足し、編集したものは上書きしない。戻すものが無ければ何もしない */
function restoreDefaults() {
  const add = missing
  if (!add.length) return
  app.screens = [...app.screens, ...add]
  saveScreens()
  toast(t('scr.restored', { n: add.length }))
}
// 選んだ行を見せる（キーで送ったとき・開いたとき。一覧は縦に流れる）
$effect(() => {
  void sel
  void rows
  queueMicrotask(() => res?.querySelector('.it.sel')?.scrollIntoView({ block: 'nearest' }))
})
onMount(() => {
  void rpc('user.defaultScreens', {})
    .then((d) => (defs = d))
    .catch(() => {}) // 読めなければ「既定を戻す」の案内を出さないだけ
  sel = Math.max(
    0,
    app.screens.findIndex((s) => s.id === openId),
  )
  input?.focus()
})
</script>

<!-- 探して選ぶダイアログと同じ骨格（lx。docs/design-dialogs.md §2）: 見出しと探す欄・一覧・選んだ条件の中身・キー -->
<!-- svelte-ignore a11y_interactive_supports_focus -->
<div class="dialog lx scrlist" role="dialog" aria-label={t('scr.list')} onmousedown={keepFocus}>
  <div class="lx-head">
    <h3>{t('scr.list')}</h3>
    <label class="lx-search aux">
      <svg class="lx-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
      <input
        bind:this={input}
        bind:value={query}
        placeholder={t('scr.searchPh')}
        role="combobox"
        aria-expanded="true"
        aria-controls="scrlist-list"
        aria-activedescendant={cur ? `scr-${cur.id}` : undefined}
        data-esc-local={query ? '' : undefined}
        onkeydown={key}
        oninput={() => (sel = 0)}
      />
    </label>
  </div>
  <div class="lx-res list" bind:this={res} id="scrlist-list" role="listbox" aria-label={t('scr.list')}>
    {#each rows as r, i (r.s.id)}
      <button
        type="button"
        class="it"
        class:sel={i === sel}
        id="scr-{r.s.id}"
        role="option"
        aria-selected={i === sel}
        tabindex="-1"
        onclick={() => {
          app.overlay = null
          openScreenAnywhere(r.s.id)
        }}
        onmousemove={() => (sel = i)}
      >
        <span class="n"><Hl text={screenName(r.s)} ranges={r.ranges} /></span>
        {#if pendingDel === r.s.id}<span class="tag del">{t('scr.deleteAgain')}</span>{/if}
        {#if r.s.id === openId}<span class="now">{t('scr.openNow')}</span>{/if}
        <span class="s num">{t('scr.conds', { n: r.s.conditions.length })}</span>
      </button>
    {:else}
      <div class="lx-empty">{t('scr.none', { q: query })}</div>
    {/each}
  </div>
  <div class="lx-desc" aria-live="polite">
    {#if cur}
      <b>{screenName(cur)}</b>
      <span class="d cond">{conditionsText(cur.conditions, app.settings.lang) || '—'}</span>
      <span class="r"><span><Keys keys="Enter" /> {t('scr.open')}</span></span>
    {/if}
  </div>
  <div class="lx-foot">
    <span><Keys keys="↑ ↓" /> {t('dlg.select')}</span>
    <span><Keys keys="F2" /> {t('scr.rename')}</span>
    <span><Keys keys="Ctrl+Shift+D" /> {t('scr.duplicate')}</span>
    <span><Keys keys="Alt+↑ / Alt+↓" /> {t('dlg.reorder')}</span>
    <span><Keys keys="Delete" /> {t('scr.delete')}</span>
    <span><Keys keys="Esc" /> {query ? t('dlg.clearQuery') : t('dlg.closeKey')}</span>
    {#if missing.length}<span class="restore"><Keys keys="Ctrl+Shift+R" /> {t('scr.restoreDefaults', { n: missing.length })}</span>{/if}
  </div>
</div>

<style>
  .scrlist {
    width: 640px;
  }
  .scrlist .lx-head {
    border-bottom: 1px solid var(--line);
  }
  .scrlist .lx-res {
    max-height: 420px;
  }
  .now {
    flex: none;
    font-size: var(--fs-0);
    line-height: 14px;
    padding: 0 4px;
    border-radius: var(--radius-ctl);
    border: 1px solid var(--line-strong);
    color: var(--text-2);
  }
  /* 条件の文は 2 行まで（長ければ「…」） */
  .scrlist .lx-desc {
    height: 64px;
  }
  /* 既定を戻す案内は右に寄せ、狭い幅でも隠さない（.r は 600px 以下で隠れる） */
  .restore {
    margin-left: auto;
  }
  .scrlist .tag {
    flex: none;
  }
  .scrlist .lx-desc .cond {
    grid-column: 1 / -1;
    white-space: normal;
    display: -webkit-box;
    line-clamp: 2;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    line-height: 1.45;
  }
  .del {
    color: var(--danger);
    border-color: var(--danger-line);
  }
</style>
