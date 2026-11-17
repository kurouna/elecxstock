<script lang="ts">
// キーの割り当て（FR-KB6）: アクションの登録表のキーを変える。↑↓ で選び、Enter のあと押したキーを割り当てる。
// 同じキーを使うアクションがあれば知らせ、入れ替えるかを尋ねる。Delete で外し、Backspace で既定に戻す。
import { onMount } from 'svelte'
import { ACTIONS, conflicts, keyCapture, keyOf } from '../../lib/commands'
import { assignable, eventKey, normalizeKey, reservedKey } from '../../lib/keys'
import { app, confirmDialog, saveSettings, t, toast } from '../../stores/app.svelte'

let sel = $state(0)
let recording = $state(false)
let q = $state('')
let box = $state<HTMLDivElement>()
const rows = $derived(
  ACTIONS.filter((a) => !q || a.label().toLowerCase().includes(q.toLowerCase()) || keyOf(a).toLowerCase().includes(q.toLowerCase())),
)
const custom = (id: string) => app.settings.keymap[id] != null
function setKey(id: string, key: string | null) {
  const km = { ...app.settings.keymap }
  const def = ACTIONS.find((a) => a.id === id)?.key ?? ''
  if (key == null || normalizeKey(key) === normalizeKey(def)) delete km[id]
  else km[id] = key
  saveSettings({ keymap: km })
}
async function record(e: KeyboardEvent) {
  const k = eventKey(e)
  if (!k) return
  e.preventDefault()
  e.stopPropagation()
  if (k === 'Esc') {
    recording = false
    return
  }
  const a = rows[sel]
  if (!a) return
  recording = false
  if (!assignable(k)) {
    toast(t(reservedKey(k) ? 'keys.reserved' : 'keys.needModifier', { key: k }), undefined, 4000)
    return
  }
  const clash = conflicts(a.id, k)
  if (clash.length) {
    const r = await confirmDialog({
      title: t('keys.conflictTitle', { key: k }),
      items: clash.map((c) => c.label()),
      body: t('keys.conflictBody'),
      ok: t('keys.conflictDo'),
    })
    app.overlay = { kind: 'settings', tab: 'keys' }
    if (!r.ok) return
    const km = { ...app.settings.keymap }
    for (const c of clash) km[c.id] = ''
    km[a.id] = k
    saveSettings({ keymap: km })
    return
  }
  setKey(a.id, k)
}
function key(e: KeyboardEvent) {
  if (recording) return record(e)
  if ((e.target as HTMLElement).matches('input')) {
    if (e.key === 'ArrowDown') {
      box?.focus()
      e.preventDefault()
    }
    return
  }
  const a = rows[sel]
  if (e.key === 'ArrowDown') sel = Math.min(rows.length - 1, sel + 1)
  else if (e.key === 'ArrowUp') sel = Math.max(0, sel - 1)
  else if (e.key === 'Enter' && a) recording = true
  else if (e.key === 'Delete' && a) setKey(a.id, '')
  else if (e.key === 'Backspace' && a) setKey(a.id, null)
  else return
  e.preventDefault()
  e.stopPropagation()
  queueMicrotask(() => box?.querySelector('.sel')?.scrollIntoView({ block: 'nearest' }))
}
async function resetAll() {
  const r = await confirmDialog({ title: t('keys.resetTitle'), ok: t('keys.reset'), danger: true })
  app.overlay = { kind: 'settings', tab: 'keys' }
  if (r.ok) saveSettings({ keymap: {} })
}
$effect(() => {
  keyCapture.on = recording
})
onMount(() => () => {
  recording = false
  keyCapture.on = false
})
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="keys" onkeydown={key}>
  <div class="top">
    <input class="q" bind:value={q} placeholder={t('keys.search')} />
    <button type="button" class="btn" onclick={resetAll}>{t('keys.reset')}</button>
  </div>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div class="list" tabindex="0" bind:this={box}>
    {#each rows as a, i (a.id)}
      <button type="button" class="it" class:sel={i === sel} onclick={() => { sel = i; recording = true; box?.focus() }}>
        <span class="n">{a.label()}</span>
        {#if recording && i === sel}
          <span class="rec">{t('keys.press')}</span>
        {:else}
          <kbd class:custom={custom(a.id)}>{keyOf(a) || '—'}</kbd>
        {/if}
      </button>
    {/each}
  </div>
  <p class="muted small">{t('keys.note')}</p>
</div>

<style>
  .top {
    display: flex;
    gap: var(--s-2);
    margin-bottom: var(--s-2);
  }
  .q {
    flex: 1;
    height: 28px;
    background: var(--bg);
    border: 1px solid var(--line-strong);
    padding: 0 8px;
    border-radius: var(--radius);
  }
  .list {
    max-height: 330px;
    overflow: auto;
    border: 1px solid var(--line);
    outline: none;
  }
  .list:focus-visible {
    border-color: var(--focus);
  }
  .it {
    display: flex;
    width: 100%;
    justify-content: space-between;
    align-items: center;
    height: 28px;
    padding: 0 10px;
    background: none;
    border: 0;
    cursor: pointer;
    text-align: left;
  }
  .it.sel {
    background: var(--select-strong);
  }
  .n {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  kbd.custom {
    border-color: var(--focus);
    color: var(--focus);
  }
  .rec {
    color: var(--warn);
    font-size: var(--fs-1);
  }
  .small {
    font-size: var(--fs-1);
  }
</style>
