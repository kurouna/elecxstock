<script lang="ts">
// 保存したスクリーンの一覧（Ctrl+O。FR-SC12）: 開く・名前の変更（F2）・複製（Ctrl+Shift+D）・削除（Delete を 2 回）・
// 並べ替え（Alt+↑↓）・既定のスクリーンを戻す（Ctrl+Shift+R、FR-SC15。戻せるものがあるときだけ案内を出す）。
import type { SavedScreen } from '@shared/types'
import { onMount } from 'svelte'
import { missingDefaults, openScreenAnywhere, removeScreen } from '../../lib/screens'
import { app, promptDialog, rpc, saveScreens, screenName, t, toast } from '../../stores/app.svelte'
import { allPanes } from '../../stores/layout.svelte'

let query = $state('')
let sel = $state(0)
let pendingDel = $state<string | null>(null)
let input = $state<HTMLInputElement>()
let defs = $state<SavedScreen[]>([])
const missing = $derived(missingDefaults(defs, app.screens))
const openId = $derived(allPanes().find((p) => p.widget === 'screener')?.state.screenId as string | undefined)
const items = $derived(app.screens.filter((s) => !query || screenName(s).toLowerCase().includes(query.toLowerCase())))

async function key(e: KeyboardEvent) {
  if (e.isComposing) return
  if (e.key !== 'Delete') pendingDel = null
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
  else if (e.key === 'ArrowDown') sel = Math.min(items.length - 1, sel + 1)
  else if (e.key === 'ArrowUp') sel = Math.max(0, sel - 1)
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
      id: `s${now.toString(36)}`,
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
onMount(() => {
  void rpc('user.defaultScreens', {}).then((d) => (defs = d))
  sel = Math.max(
    0,
    app.screens.findIndex((s) => s.id === openId),
  )
  input?.focus()
})
</script>

<div class="dialog palette" role="dialog" aria-label={t('scr.list')}>
  <input class="search" bind:this={input} bind:value={query} placeholder={t('scr.searchPh')} onkeydown={key} oninput={() => (sel = 0)} />
  <div class="list res">
    <div class="grp">{t('scr.list')}</div>
    {#each items as s, i (s.id)}
      <button type="button" class="it" class:sel={i === sel} onclick={() => { app.overlay = null; openScreenAnywhere(s.id) }} onmousemove={() => (sel = i)}>
        <span class="n">{screenName(s)}{#if pendingDel === s.id}<span class="tag del">{t('scr.deleteAgain')}</span>{/if}</span>
        <span class="s">{t('scr.conds', { n: s.conditions.length })}</span>
        {#if s.id === openId}<span class="s">● {t('scr.openNow')}</span>{/if}
      </button>
    {/each}
  </div>
  <div class="foot keys">
    <div class="row"><span>{t('cmd.hint.move')}</span><span>Enter {t('scr.open')}</span><span class="end">{t('cmd.hint.close')}</span></div>
    <div class="row">
      <span>F2 {t('scr.rename')}</span><span>Ctrl+Shift+D {t('scr.duplicate')}</span><span>Alt+↑↓ {t('dlg.reorder')}</span><span>Delete {t('scr.delete')}</span>
      {#if missing.length}<span class="restore">Ctrl+Shift+R {t('scr.restoreDefaults', { n: missing.length })}</span>{/if}
    </div>
  </div>
</div>

<style>
  .palette {
    width: 600px;
    overflow: hidden;
  }
  .res {
    max-height: 420px;
    overflow: auto;
    padding: 4px 0;
  }
  .keys {
    flex-direction: column;
    gap: 2px;
  }
  .keys .row {
    display: flex;
    flex-wrap: wrap;
    column-gap: 16px;
  }
  .keys span {
    white-space: nowrap;
  }
  .keys .end {
    margin-left: auto;
  }
  .del {
    color: var(--danger);
    border-color: var(--danger-line);
  }
</style>
