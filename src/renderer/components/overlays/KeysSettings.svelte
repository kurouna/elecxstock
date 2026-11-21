<script lang="ts">
// キーの割り当て（FR-KB6。docs/design-dialogs.md §6）: アクションの登録表のキーを変える。分類ごとの枠に、F1 と同じ行（キーを左の列）で並べる。
// ↑↓ で選び、Enter のあと押したキーを割り当てる。同じキーを使うアクションがあれば行の中で知らせ、Enter で入れ替える（Esc でやめる）。
// Delete で外し、Backspace で既定に戻す。/ で探す。「変えたものだけ」で絞る
import { onMount } from 'svelte'
import { ACTIONS, conflicts, keyCapture, keyOf } from '../../lib/commands'
import type { Key } from '../../lib/i18n'
import { assignable, composing, eventKey, reservedKey, withKey } from '../../lib/keys'
import { groupOf } from '../../lib/palette'
import { clampSel } from '../../lib/selection'
import { groupRows, keyRows } from '../../lib/settingsSpec'
import { app, confirmDialog, saveSettings, t, toast } from '../../stores/app.svelte'
import Hl from './Hl.svelte'
import Keys from './Keys.svelte'

let sel = $state(0)
let recording = $state(false)
/** 押したキーが別のアクションと重なったとき（行の中で知らせ、Enter で入れ替える） */
let clash = $state<{ key: string; others: { id: string; label: string }[] } | null>(null)
let q = $state('')
let onlyChanged = $state(false)
let box = $state<HTMLDivElement>()
let search = $state<HTMLInputElement>()
const acts = $derived(ACTIONS.map((a) => ({ id: a.id, label: a.label(), key: keyOf(a), group: groupOf(a.id), def: a.key ?? '' })))
const rows = $derived(keyRows(acts, { q, onlyChanged, keymap: app.settings.keymap, groupName: (g) => t(`agroup.${g}` as Key) }))
const groups = $derived(groupRows(rows, (r) => r.a.group))
const indexed = $derived(groups.map((g) => ({ ...g, items: g.items.map((r) => ({ ...r, i: rows.indexOf(r) })) })))
$effect(() => {
  const c = clampSel(sel, rows.length)
  if (c !== sel) sel = c
})
const custom = (id: string) => app.settings.keymap[id] != null
const changedCount = $derived(Object.keys(app.settings.keymap).filter((id) => acts.some((a) => a.id === id)).length)
const defOf = (id: string) => ACTIONS.find((a) => a.id === id)?.key ?? ''
function setKey(id: string, key: string | null) {
  saveSettings({ keymap: withKey(app.settings.keymap, id, key, defOf(id)) })
}
function stopRecording() {
  recording = false
  clash = null
}
function record(e: KeyboardEvent) {
  const k = eventKey(e)
  if (!k) return
  e.preventDefault()
  e.stopPropagation()
  const a = rows[sel]?.a
  if (!a) return stopRecording()
  if (k === 'Esc') return stopRecording()
  // 重なりを知らせている間の Enter は入れ替える
  if (clash && k === 'Enter') {
    // 入れ替え: 重なった操作は割り当てなしにし、この操作に書く（既定と同じなら上書きを消す。setKey と同じ）
    let km = app.settings.keymap
    for (const c of clash.others) km = withKey(km, c.id, '', defOf(c.id))
    saveSettings({ keymap: withKey(km, a.id, clash.key, defOf(a.id)) })
    return stopRecording()
  }
  if (!assignable(k)) {
    toast(t(reservedKey(k) ? 'keys.reserved' : 'keys.needModifier', { key: k }), undefined, 4000)
    return stopRecording()
  }
  const others = conflicts(a.id, k)
  if (others.length) {
    clash = { key: k, others: others.map((c) => ({ id: c.id, label: c.label() })) }
    return
  }
  setKey(a.id, k)
  stopRecording()
}
function key(e: KeyboardEvent) {
  if (recording) return record(e)
  // 検索欄で変換の候補を ↓ で選んでいる間に、一覧へ移らない（FR-KB5）
  if (composing(e)) return
  if ((e.target as HTMLElement).matches('input')) {
    if (e.key === 'ArrowDown') box?.focus()
    // 語があれば Esc で消す（無ければ設定の Esc に任せてタブへ）
    else if (e.key === 'Escape' && q) q = ''
    else return
    e.preventDefault()
    e.stopPropagation()
    return
  }
  // 一覧のキーは一覧にフォーカスがあるときだけ（上の段のボタンの Enter・Space はボタンのまま。Delete・Backspace で行を変えない）
  if (!box?.contains(e.target as Node)) {
    if (e.key !== '/') return
    search?.focus()
    e.preventDefault()
    e.stopPropagation()
    return
  }
  const a = rows[sel]?.a
  if (e.key === 'ArrowDown') sel = clampSel(sel + 1, rows.length)
  else if (e.key === 'ArrowUp') sel = Math.max(0, sel - 1)
  else if (e.key === 'Enter' && a) recording = true
  else if (e.key === 'Delete' && a) setKey(a.id, '')
  else if (e.key === 'Backspace' && a) setKey(a.id, null)
  else if (e.key === '/') search?.focus()
  else return
  e.preventDefault()
  e.stopPropagation()
  queueMicrotask(() => box?.querySelector('.krow.sel')?.scrollIntoView({ block: 'nearest' }))
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
  <div class="ktop">
    <label class="lx-search aux">
      <svg class="lx-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
      <input bind:this={search} bind:value={q} placeholder={t('keys.search')} aria-label={t('keys.search')} oninput={() => (sel = 0)} />
    </label>
    <button type="button" class="lx-chip" class:on={onlyChanged} aria-pressed={onlyChanged} onclick={() => ((onlyChanged = !onlyChanged), (sel = 0))}>{t('keys.onlyChanged')}<span class="n">{changedCount}</span></button>
    <button type="button" class="btn" onclick={resetAll}>{t('keys.reset')}…</button>
  </div>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <!-- 一覧の外へフォーカスが移ったら割り当ての記録をやめる（キーを取ったままにしない。Esc で設定を閉じられるように） -->
  <div
    class="klist"
    tabindex="0"
    role="listbox"
    aria-label={t('set.keys')}
    aria-activedescendant={rows[sel] ? `key-${rows[sel]!.a.id}` : undefined}
    bind:this={box}
    onfocusout={(e) => !box?.contains(e.relatedTarget as Node | null) && stopRecording()}
  >
    {#each indexed as g (g.key)}
      <section class="kgrp" role="group" aria-label={t(`agroup.${g.key}` as Key)}>
        <div class="h4" aria-hidden="true">{t(`agroup.${g.key}` as Key)}</div>
        {#each g.items as r (r.a.id)}
          {@const on = r.i === sel}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div class="krow" class:sel={on} id="key-{r.a.id}" role="option" aria-selected={on} tabindex="-1" onclick={() => ((sel = r.i), (clash = null), (recording = true), box?.focus({ preventScroll: true }))}>
            <span class="k">
              {#if recording && on}
                <span class="rec">{clash ? clash.key : t('keys.pressing')}</span>
              {:else if r.a.key}
                <Keys keys={r.a.key} changed={custom(r.a.id)} />
              {:else}
                <span class="none">—</span>
              {/if}
            </span>
            <span class="nm">
              {#if custom(r.a.id)}<span class="mod" aria-hidden="true"></span>{/if}<Hl text={r.a.label} ranges={r.ranges} />
              {#if custom(r.a.id)}<span class="def">{t('set.defaultIs', { v: r.a.def || '—' })}</span>{/if}
            </span>
            <button type="button" class="rst" class:on={custom(r.a.id)} tabindex="-1" title={t('set.resetRow', { v: r.a.def || '—' })} aria-label={t('set.resetRow', { v: r.a.def || '—' })} onclick={(e) => (e.stopPropagation(), stopRecording(), setKey(r.a.id, null))}>↺</button>
            {#if recording && on && clash}
              <span class="cf" role="alert">{t('keys.conflictInline', { key: clash.key, name: clash.others.map((c) => c.label).join('・') })}</span>
            {/if}
          </div>
        {/each}
      </section>
    {:else}
      <div class="lx-empty">{t('keys.none')}</div>
    {/each}
  </div>
  <p class="note">{t('keys.note')}</p>
</div>

<style>
  .ktop {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-top: 14px;
  }
  .klist {
    outline: none;
  }
  .klist:focus-visible .krow.sel {
    outline: 1px solid var(--focus);
    outline-offset: -1px;
  }
  .kgrp {
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-dlg);
    background: var(--panel);
    margin-top: 14px;
    overflow: hidden;
  }
  .kgrp .h4 {
    font-weight: 700;
    padding: 8px 14px 7px;
    font-size: var(--fs-3);
    border-bottom: 1px solid var(--line);
    background: var(--panel-2);
  }
  /* F1 と同じ行の作り: キー（左の固定列・右寄せ）| 操作 | ↺ */
  .krow {
    display: grid;
    grid-template-columns: 150px minmax(0, 1fr) 26px;
    gap: 12px;
    align-items: center;
    min-height: 30px;
    padding: 2px 8px 2px 12px;
    cursor: pointer;
  }
  .krow + .krow {
    border-top: 1px solid var(--line-soft);
  }
  .krow.sel {
    background: var(--select);
    box-shadow: inset var(--sel-bar) 0 0 var(--focus);
  }
  .k {
    justify-self: end;
  }
  .rec {
    color: var(--warn);
    font-size: var(--fs-1);
  }
  .none {
    color: var(--text-3);
  }
  .nm {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mod {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--focus);
    margin-right: 6px;
    vertical-align: 2px;
  }
  .def {
    color: var(--text-3);
    font-size: var(--fs-1);
    margin-left: 6px;
  }
  .rst {
    width: 24px;
    height: 24px;
    border-radius: var(--radius-ctl);
    background: none;
    border: 0;
    color: var(--text-3);
    cursor: pointer;
    visibility: hidden;
  }
  .rst.on {
    visibility: visible;
  }
  .cf {
    grid-column: 1 / -1;
    padding: 0 0 3px 162px;
    color: var(--warn);
    font-size: var(--fs-1);
  }
  .note {
    margin: 14px 2px 0;
    color: var(--text-3);
    font-size: var(--fs-1);
  }
  @container setdlg (max-width: 900px) {
    .krow {
      grid-template-columns: 110px minmax(0, 1fr) 26px;
    }
    .cf {
      padding-left: 122px;
    }
  }
</style>
