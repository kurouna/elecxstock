<script lang="ts">
// ショートカット一覧（F1。FR-KB7。docs/design-dialogs.md §4）: 探して見るだけの画面（実行はコマンドバーの役目）。
// 文字で絞り込むか、Tab で「キーを押して探す」に切り替えて押したキーを使う操作を探す。フォーカス中のペインの段を先頭に出す。
// 割り当てを変えられるキー（アクションの登録表）は、今の割り当てを出す（FR-KB6）。行の登録表は lib/shortcuts.ts
import { onMount } from 'svelte'
import { ACTIONS, keyCapture, keyOf } from '../../lib/commands'
import type { Key } from '../../lib/i18n'
import { composing, eventKey, normalizeKey } from '../../lib/keys'
import { clampSel } from '../../lib/selection'
import {
  blocks,
  filterShortcuts,
  helpSection,
  isModeToggle,
  jumpSection,
  langIx,
  rebindable,
  rowDefault,
  rowKeys,
  SECTION_KEY,
  type SectionId,
  SHORTCUTS,
  sectionOrder,
} from '../../lib/shortcuts'
import { app, t } from '../../stores/app.svelte'
import { findPane, PRESET_IDS } from '../../stores/layout.svelte'
import Hl from './Hl.svelte'
import Keys from './Keys.svelte'

let { q: q0 = '' }: { q?: string } = $props()
let q = $state('')
let mode = $state<'text' | 'key'>('text')
let combo = $state('')
let sel = $state(0)
let live = $state('')
let input = $state<HTMLInputElement>()
/** キーを押して探す間の欄（読み上げで選んだ行を伝えるため combobox にする） */
let kfield = $state<HTMLSpanElement>()
let list = $state<HTMLDivElement>()

const li = $derived(langIx(app.settings.lang))
const focusWidget = $derived(findPane(app.focus)?.widget)
const ctx = $derived(helpSection(focusWidget))
const order = $derived(sectionOrder(ctx))
const keyOfId = (id: string) => keyOf(id)
const hits = $derived(
  filterShortcuts(SHORTCUTS, {
    q: mode === 'text' ? q : '',
    combo: mode === 'key' ? combo : '',
    lang: app.settings.lang,
    keyOf: keyOfId,
    presetIds: PRESET_IDS,
  }),
)
// 段の順に並べ直し、行に通し番号を振る（↑ ↓ の選択）
const secs = $derived.by(() => {
  let i = 0
  return order.map((s) => {
    const rows = hits.filter((h) => h.row.sec === s).map((h) => ({ ...h, i: i++ }))
    return { sec: s, rows, blocks: blocks(rows) }
  })
})
const flat = $derived(secs.flatMap((s) => s.rows))
$effect(() => {
  const c = clampSel(sel, flat.length)
  if (c !== sel) sel = c
})
const cur = $derived(flat[sel])
const secName = (s: SectionId) => t(SECTION_KEY[s])
const defaultKey = (id: string) => ACTIONS.find((a) => a.id === id)?.key ?? ''
/** 既定から変えた行の既定のキー（変えていなければ null） */
const curDefault = $derived(cur ? rowDefault(cur.row, keyOfId, defaultKey, PRESET_IDS) : null)

function setMode(m: 'text' | 'key') {
  mode = m
  combo = ''
  sel = 0
  live = m === 'key' ? t('help.keyMode') : t('help.textMode')
  // キーを押して探す間は、アプリ全体のキー処理を止める（押したキーで別の操作が動かないように。Esc・Tab はここで受ける）
  keyCapture.on = m === 'key'
  queueMicrotask(() => (m === 'key' ? kfield : input)?.focus())
}
function scrollSel() {
  queueMicrotask(() => {
    // 段の見出し（sticky）の下に隠れないよう、行の scroll-margin-top（CSS の px。表示倍率が掛かっても見出しの高さとそろう）で余白を取る
    list?.querySelector<HTMLElement>('.row.sel')?.scrollIntoView({ block: 'nearest' })
  })
}
function key(e: KeyboardEvent) {
  if (composing(e)) return
  const plain = !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey
  if (isModeToggle(e)) setMode(mode === 'key' ? 'text' : 'key')
  else if (e.key === 'Escape') {
    // 押したキー → キーで探す → 打った語 → 閉じる（最後はアプリ全体の Esc が閉じる）
    if (combo) combo = ''
    else if (mode === 'key') setMode('text')
    else if (q) q = ''
    else return
    sel = 0
  } else if (plain && e.key === 'ArrowDown') sel = clampSel(sel + 1, flat.length)
  else if (plain && e.key === 'ArrowUp') sel = Math.max(0, sel - 1)
  else if (plain && (e.key === 'PageDown' || e.key === 'PageUp'))
    sel = jumpSection(
      flat.map((x) => x.row.sec),
      sel,
      e.key === 'PageDown' ? 1 : -1,
    )
  else if (mode === 'key') {
    const k = eventKey(e)
    if (!k) return
    combo = normalizeKey(k)
    sel = 0
  } else return
  e.preventDefault()
  e.stopPropagation()
  scrollSel()
}
function pickSec(s: SectionId) {
  const i = flat.findIndex((x) => x.row.sec === s)
  if (i >= 0) sel = i
  scrollSel()
  ;(mode === 'key' ? kfield : input)?.focus()
}
onMount(() => {
  q = q0
  input?.focus()
  return () => {
    keyCapture.on = false
  }
})
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="dialog lx help"
  role="dialog"
  aria-label={t('help.title')}
  tabindex="-1"
  onkeydown={key}
  data-esc-local={q || mode === 'key' ? '' : undefined}
>
  <div class="lx-head">
    <h3>{t('help.title')}</h3>
    <label class="lx-search" class:keymode={mode === 'key'}>
      <svg class="lx-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
      {#if mode === 'text'}
        <input
          bind:this={input}
          bind:value={q}
          oninput={() => (sel = 0)}
          placeholder={t('help.ph')}
          role="combobox"
          aria-expanded="true"
          aria-controls="help-list"
          aria-activedescendant={cur ? `help-${cur.i}` : undefined}
        />
      {:else}
        <span
          class="kfield"
          bind:this={kfield}
          tabindex="-1"
          role="combobox"
          aria-label={t('help.byKey')}
          aria-expanded="true"
          aria-controls="help-list"
          aria-activedescendant={cur ? `help-${cur.i}` : undefined}
        >
          {#if combo}<Keys keys={combo} hit={combo} />{:else}<span class="ph">{t('help.pressKey')}</span>{/if}
        </span>
      {/if}
    </label>
    <span class="cnt" aria-live="polite">{hits.length} / {SHORTCUTS.length}</span>
  </div>
  <div class="lx-scope">
    <span>{t('help.how')}</span>
    <button type="button" class="lx-chip" class:on={mode === 'text'} aria-pressed={mode === 'text'} tabindex="-1" onclick={() => setMode('text')}>{t('help.byText')}</button>
    <button type="button" class="lx-chip" class:on={mode === 'key'} aria-pressed={mode === 'key'} tabindex="-1" onclick={() => setMode('key')}>{t('help.byKey')}</button>
    <span class="r"><Keys keys="Tab" /> {t('help.toggleHow')}</span>
  </div>
  <div class="hb">
    <nav class="toc" aria-label={t('help.sections')}>
      {#each secs as s, k (s.sec)}
        {#if k === 0 && s.sec === ctx}<span class="ctx">{t('help.ctx')}</span>{/if}
        {#if k === 1 && secs[0]!.sec === ctx}<hr />{/if}
        <button type="button" tabindex="-1" class:on={cur?.row.sec === s.sec} class:zero={!s.rows.length} title={secName(s.sec)} onclick={() => pickSec(s.sec)}>
          <span class="t">{secName(s.sec)}</span><span class="n">{s.rows.length}</span>
        </button>
      {/each}
    </nav>
    <div class="list" id="help-list" role="listbox" aria-label={t('help.title')} bind:this={list}>
      {#each secs as s (s.sec)}
        {#if s.rows.length}
          <div role="group" aria-label={secName(s.sec)}>
            <div class="sec">
              <span class="h4" aria-hidden="true">{secName(s.sec)}</span>
              {#if s.sec === ctx && focusWidget}<span class="badge">{t('help.ctxPane', { name: t(`widget.${focusWidget}` as Key) })}</span>{/if}
              <span class="n">{s.rows.length}</span>
            </div>
            <!-- 行が多い段は、幅があれば小見出しのまとまりごとに 2 段組み -->
            <div class:cols={s.rows.length >= 8}>
              {#each s.blocks as b, bi (bi)}
                <div class="blk">
                  {#if b.grp[li] !== secName(s.sec)}<div class="sub">{b.grp[li]}</div>{/if}
                  {#each b.items as x (x.i)}
                    {@const k = rowKeys(x.row, keyOfId, PRESET_IDS)}
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <div class="row" class:sel={x.i === sel} id="help-{x.i}" role="option" aria-selected={x.i === sel} tabindex="-1" onclick={() => ((sel = x.i), (mode === 'key' ? kfield : input)?.focus())}>
                      <span class="k">
                        {#if k}<Keys keys={k} hit={mode === 'key' ? combo : ''} />{:else}<span class="nokey">{t('help.noKey')}</span>{/if}
                      </span>
                      <span class="nm"><Hl text={x.row.label[li]} ranges={x.ranges} /></span>
                      <span class="b" title={rebindable(x.row) ? t('help.rebindable') : undefined}>
                        {#if rebindable(x.row)}
                          <svg class="lx-icon pen" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13 7 4 4" /></svg>
                          <span class="lx-sr">{t('help.rebindable')}</span>
                        {/if}
                      </span>
                    </div>
                  {/each}
                </div>
              {/each}
            </div>
          </div>
        {/if}
      {/each}
      {#if !flat.length}<div class="lx-empty">{mode === 'key' ? (combo ? t('help.keyNone', { key: combo }) : t('help.pressKey')) : t('help.textNone', { q })}</div>{/if}
    </div>
  </div>
  <div class="lx-desc" aria-live="polite">
    {#if cur}
      <b>{cur.row.label[li]}</b>
      <span class="d">
        {#if rebindable(cur.row)}
          {t('help.rebind')}{#if curDefault != null}{' · '}{t('help.default', { key: curDefault || '—' })}{/if}
        {:else}
          {cur.row.sec === 'general' ? t('help.fixedKey') : t('help.paneKey', { sec: secName(cur.row.sec) })}
        {/if}
      </span>
      <span class="r"><span class="path">{secName(cur.row.sec)} › {cur.row.grp[li]}</span></span>
    {/if}
  </div>
  <div class="lx-foot">
    <span><Keys keys="↑ ↓" /> {t('wpick.move')}</span>
    <span><Keys keys="PgUp PgDn" /> {t('help.section')}</span>
    <span><Keys keys="Esc" /> {mode === 'key' ? (combo ? t('dlg.clearQuery') : t('help.toText')) : q ? t('dlg.clearQuery') : t('dlg.closeKey')}</span>
    <span class="r">{t('help.footRebind')}</span>
  </div>
  <span class="lx-sr" aria-live="assertive">{live}</span>
</div>

<style>
  .help {
    width: 980px;
    height: 640px;
  }
  .help:focus,
  .kfield:focus {
    outline: none;
  }
  .kfield {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
  }
  .cnt {
    color: var(--text-3);
    font: var(--fs-1) var(--mono);
    white-space: nowrap;
  }
  .hb {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 200px minmax(0, 1fr);
  }
  @container lxdlg (max-width: 720px) {
    .hb {
      grid-template-columns: minmax(0, 1fr);
    }
    .toc {
      display: none;
    }
  }
  .toc {
    border-right: 1px solid var(--line);
    overflow: auto;
    padding: 6px 0;
    background: var(--panel);
  }
  .toc button {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    height: 28px;
    padding: 0 12px;
    background: none;
    border: 0;
    text-align: left;
    cursor: pointer;
    color: var(--text-2);
    white-space: nowrap;
  }
  .toc button .t {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .toc button:hover {
    background: var(--hover);
  }
  .toc button.on {
    background: var(--select-strong);
    color: var(--text);
    box-shadow: inset var(--sel-bar) 0 0 var(--focus);
  }
  .toc button.zero,
  .toc button.zero .n {
    color: var(--text-3);
  }
  .toc .n {
    margin-left: auto;
    font-family: var(--mono);
    font-size: var(--fs-0);
    color: var(--text-3);
  }
  .toc .ctx {
    display: block;
    padding: 0 12px 2px;
    font-size: var(--fs-0);
    color: var(--focus);
  }
  .toc hr {
    border: 0;
    border-top: 1px solid var(--line);
    margin: 6px 12px;
  }
  .list {
    overflow: auto;
    padding: 0 0 10px;
  }
  .sec {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 10px 16px 4px;
    background: var(--panel-2);
    border-bottom: 1px solid var(--line);
  }
  .sec .h4 {
    font-weight: 700;
    font-size: var(--fs-3);
  }
  .sec .badge {
    font-size: var(--fs-0);
    color: var(--focus);
  }
  .sec .n {
    margin-left: auto;
    font: var(--fs-0) var(--mono);
    color: var(--text-3);
  }
  .cols {
    columns: 2 360px;
    column-gap: 24px;
    padding-right: 8px;
  }
  .blk {
    break-inside: avoid;
  }
  .sub {
    padding: 8px 16px 2px;
    font-size: var(--fs-1);
    color: var(--text-3);
    letter-spacing: 0.06em;
  }
  /* 行: キー（左の固定列・右寄せ）| 操作 | 割り当てを変えられる印。名前とキーが離れない */
  .row {
    scroll-margin-top: 36px;
    display: grid;
    grid-template-columns: 130px minmax(0, 1fr) 20px;
    align-items: center;
    gap: 12px;
    min-height: 28px;
    padding: 2px 8px 2px 12px;
    cursor: default;
  }
  .row:hover {
    background: var(--hover);
  }
  .row.sel {
    background: var(--select-strong);
    box-shadow: inset var(--sel-bar) 0 0 var(--focus);
  }
  /* 長いキーの並び（↑ ↓ PgUp PgDn Home End など）は切らずに折り返す（右寄せのまま） */
  .row .k {
    min-width: 0;
    display: flex;
    justify-content: flex-end;
  }
  .row .k :global(.lx-keys) {
    min-width: 0;
    flex-wrap: wrap;
    justify-content: flex-end;
    row-gap: 2px;
  }
  .row .nm {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .row .b {
    display: grid;
    place-items: center;
    color: var(--text-3);
  }
  .pen {
    width: 13px;
    height: 13px;
  }
  .nokey {
    color: var(--text-3);
    font-size: var(--fs-1);
  }
  .path {
    color: var(--text-3);
  }
</style>
