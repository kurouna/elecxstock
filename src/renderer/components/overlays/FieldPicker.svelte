<script lang="ts">
// スクリーナーの条件を選ぶダイアログ（docs/mock/fields.html）。分類を決まった段に並べ、項目は名前と単位だけ。
// 説明は下の段（キーで選んだ項目・マウスを載せた項目）と ⓘ のツールチップ。キーだけで選べる（FR-KB4）:
// 文字を打つと絞り込む · ↑↓ 項目 · ←→ 隣の段（検索欄が空のとき）· Tab 次の分類 · Home End · Enter 足して閉じる ·
// Shift+Enter 続けて足す · Esc 検索を消す／閉じる。IME の変換中は矢印・Enter を渡さない（FR-KB5）

import { DEFAULT_RECENT_FIELDS, FIELD_BY_ID, FIELD_GROUPS, type FieldDef, MISSING_FIELDS, NEW_FIELD_IDS } from '@shared/fields'
import { onMount, tick } from 'svelte'
import { SvelteSet } from 'svelte/reactivity'
import { fieldMatch, fieldUnit } from '../../lib/fieldPick'
import { hlRanges, normText as norm } from '../../lib/highlight'
import { composing } from '../../lib/keys'
import { rootZoom, tipBeside } from '../../lib/pointer'
import { app, closeOverlay, t } from '../../stores/app.svelte'
import Icon from '../Icon.svelte'
import Hl from './Hl.svelte'
import Keys from './Keys.svelte'

let {
  title,
  fields,
  used,
  onAdd,
  resolve,
}: { title: string; fields: string[]; used: string[]; onAdd?: (id: string) => void; resolve: (id: string | null) => void } = $props()

const lang = $derived(app.settings.lang)
// 続けて足した項目にも ✓ を付ける（Shift+Enter のあとに描き直す）
// svelte-ignore state_referenced_locally
const usedSet = new SvelteSet(used)
let q = $state('')
// svelte-ignore state_referenced_locally
let sel = $state(fields[0] ?? '')
/** ← → で移るときに保つ高さ（往復で元の行に戻る） */
let wantY: number | null = null
let input = $state<HTMLInputElement>()
let grid = $state<HTMLElement>()
let hover = $state<string | null>(null)
let tip = $state<{ id: string; x: number; y: number } | null>(null)
let tipEl = $state<HTMLDivElement>()
let added = $state<string[]>([])

const defs = $derived(fields.map((id) => FIELD_BY_ID.get(id)).filter((f): f is FieldDef => !!f))
const match = (f: FieldDef): number => fieldMatch(f, q)
/** 分類ごとの項目（段は分類で決まり、絞り込んでも動かない） */
const cols = $derived.by(() => {
  const out: { id: string; label: string; items: FieldDef[] }[][] = [[], [], [], []]
  for (const g of FIELD_GROUPS) {
    const items = defs.filter((f) => f.group === g.id && match(f) > 0).sort((a, b) => match(b) - match(a))
    if (items.length) out[g.col]!.push({ id: g.id, label: g.label[lang], items })
  }
  return out
})
const flat = $derived(cols.flatMap((c) => c.flatMap((g) => g.items)))
const recent = $derived(
  (app.settings.recentFields.length ? app.settings.recentFields : DEFAULT_RECENT_FIELDS)
    .filter((id) => fields.includes(id))
    .slice(0, 8)
    .map((id) => FIELD_BY_ID.get(id)!)
    .filter(Boolean),
)
// 打つたびにいちばん合う項目を選ぶ（同じ合い方なら並びの先）。絞り込みで選んでいた項目が消えたら先頭へ
let lastQ = ''
$effect(() => {
  if (q !== lastQ) {
    lastQ = q
    let best: FieldDef | undefined
    for (const f of flat) if (!best || match(f) > match(best)) best = f
    if (best) sel = best.id
    return
  }
  if (flat.length && !flat.some((f) => f.id === sel)) sel = flat[0]!.id
})
const cur = $derived(FIELD_BY_ID.get(hover ?? sel))
const missing = $derived(
  q && !flat.length ? MISSING_FIELDS.filter((x) => norm(`${x.label.ja} ${x.label.en} ${x.words}`).includes(norm(q))) : [],
)

const unitOf = (f: FieldDef): string => fieldUnit(f, lang)
const isNew = (id: string) => NEW_FIELD_IDS.has(id) && !usedSet.has(id) && !app.settings.recentFields.includes(id)

function pick(id: string, keep: boolean) {
  if (!id) return
  if (keep && onAdd) {
    onAdd(id)
    added = [...added, id]
    usedSet.add(id)
    return
  }
  resolve(id)
  closeOverlay()
}
function close() {
  resolve(null)
  closeOverlay()
}
async function scrollSel() {
  await tick()
  grid?.querySelector('.it.sel')?.scrollIntoView({ block: 'nearest' })
}
function key(e: KeyboardEvent) {
  if (composing(e)) return
  const items = [...(grid?.querySelectorAll<HTMLElement>('.it') ?? [])]
  const i = items.findIndex((x) => x.dataset.id === sel)
  let next: HTMLElement | undefined
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    next = items[i + (e.key === 'ArrowDown' ? 1 : -1)]
    wantY = null
  } else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && !q) {
    // 隣の段の、覚えておいた高さにいちばん近い項目へ（検索欄に文字があるときは文字の移動に使う）
    const at = items[i]?.getBoundingClientRect()
    if (!at) return
    wantY ??= at.top
    const cs = [...(grid?.querySelectorAll<HTMLElement>('.col') ?? [])].filter((c) => c.querySelector('.it'))
    const ci = cs.findIndex((c) => c.contains(items[i]!))
    const col = cs[ci + (e.key === 'ArrowRight' ? 1 : -1)]
    const y = wantY
    if (col)
      next = [...col.querySelectorAll<HTMLElement>('.it')].sort(
        (a, b) => Math.abs(a.getBoundingClientRect().top - y) - Math.abs(b.getBoundingClientRect().top - y),
      )[0]
  } else if (e.key === 'Tab') {
    const gs = [...(grid?.querySelectorAll<HTMLElement>('.grp') ?? [])]
    const gi = gs.findIndex((g) => g.contains(items[i] ?? null))
    next = gs[(gi + (e.shiftKey ? -1 : 1) + gs.length) % gs.length]?.querySelector<HTMLElement>('.it') ?? undefined
    wantY = null
  } else if (e.key === 'Home' && !q) next = items[0]
  else if (e.key === 'End' && !q) next = items.at(-1)
  else if (e.key === 'Enter') {
    e.preventDefault()
    e.stopPropagation()
    pick(sel, e.shiftKey)
    return
  } else if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    if (q) q = ''
    else close()
    return
  } else return
  e.preventDefault()
  e.stopPropagation()
  hover = null
  if (next?.dataset.id) sel = next.dataset.id
  void scrollSel()
}
async function showTip(id: string, ev: MouseEvent) {
  const r = (ev.currentTarget as HTMLElement).getBoundingClientRect()
  tip = { id, ...tipBeside(r, 320, window.innerWidth, rootZoom()) }
  // 描いてから高さを測り、窓の下からはみ出さないよう上に寄せる（株価ボードのツールチップと同じ）
  await tick()
  if (tip?.id === id && tipEl)
    tip = { id, ...tipBeside(r, 320, window.innerWidth, rootZoom(), { height: tipEl.offsetHeight, viewportHeight: window.innerHeight }) }
}
onMount(() => input?.focus())
</script>

<!-- 探して選ぶダイアログと同じ骨格（lx。docs/design-dialogs.md §2）: 見出しと探す欄・段の一覧・選んだ項目の説明・キー -->
<div class="dialog lx picker" role="dialog" aria-label={title}>
  <div class="lx-head">
    <h3>{title}</h3>
    <label class="lx-search aux">
      <svg class="lx-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
      <input
        bind:this={input}
        bind:value={q}
        data-esc-local
        role="combobox"
        aria-expanded="true"
        aria-controls="fp-list"
        aria-activedescendant={sel ? `fp-${sel}` : undefined}
        placeholder={t('fp.search')}
        autocomplete="off"
        onkeydown={key} />
    </label>
    <span class="sub num">{q ? t('fp.hits', { n: flat.length }) : t('fp.count', { n: defs.length })}</span>
    <button type="button" class="x" aria-label={t('cmd.hint.close')} onclick={close}>✕</button>
  </div>
  {#if !q && recent.length}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="recent" onmousedown={(e) => e.preventDefault()}>
      <span>{t('fp.recent')}</span>
      {#each recent as f (f.id)}
        <button type="button" class="lx-chip" class:sel={f.id === sel} onclick={(e) => pick(f.id, e.shiftKey)} onmouseenter={() => (hover = f.id)} onmouseleave={() => (hover = null)}>
          {#if usedSet.has(f.id)}<span class="ck">✓</span>{/if}{f.label[lang]}
        </button>
      {/each}
    </div>
  {/if}
  <!-- 押しても検索欄からフォーカスを移さない（行をクリックしたあともキーで続けられる） -->
  <div class="grid" id="fp-list" role="listbox" bind:this={grid} onmousedown={(e) => e.preventDefault()}>
    {#if flat.length}
      {#each cols as col, ci (ci)}
        <div class="col">
          {#each col as g (g.id)}
            <div class="grp" role="group" aria-label={g.label}>
              <h4>{g.label}<span class="n">{g.items.length}</span></h4>
              {#each g.items as f (f.id)}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <div
                  class="it"
                  class:sel={f.id === sel}
                  class:weak={match(f) === 1}
                  role="option"
                  id={`fp-${f.id}`}
                  aria-selected={f.id === sel}
                  tabindex="-1"
                  data-id={f.id}
                  onclick={(e) => pick(f.id, e.shiftKey)}
                  onmouseenter={() => (hover = f.id)}
                  onmouseleave={() => (hover = null)}>
                  {#if usedSet.has(f.id)}<span class="ck" title={t('fp.used')}>✓</span>{/if}
                  <span class="nm"><Hl text={f.label[lang]} ranges={hlRanges(f.label[lang], q)} /></span>
                  {#if unitOf(f)}<span class="u">({unitOf(f)})</span>{/if}
                  {#if isNew(f.id)}<span class="new">{t('fp.new')}</span>{/if}
                  <span class="info" role="img" aria-label={t('common.about')} onmouseenter={(e) => showTip(f.id, e)} onmouseleave={() => (tip = null)}><Icon name="info" size={14} /></span>
                </div>
              {/each}
            </div>
          {/each}
        </div>
      {/each}
    {:else}
      <div class="empty">
        {t('fp.none', { q })}
        {#each missing as x (x.words)}<div class="why"><b>{x.label[lang]}</b>: {x.why[lang]}</div>{/each}
      </div>
    {/if}
  </div>
  <div class="lx-desc fp-desc" aria-live="polite">
    {#if cur}
      <b>{cur.label[lang]}{unitOf(cur) ? `（${unitOf(cur)}）` : ''}</b>
      <span class="d">{cur.description?.[lang] ?? ''}{usedSet.has(cur.id) ? t('fp.usedHint') : ''}</span>
    {/if}
  </div>
  <div class="lx-foot">
    <span>{t('fp.keyType')}</span>
    <span><Keys keys="← → ↑ ↓" /> {t('fp.keyMove')}</span>
    <span><Keys keys="Tab" /> {t('fp.keyGroup')}</span>
    <span><Keys keys="Enter" /> {t('fp.keyAdd')}</span>
    {#if onAdd}<span><Keys keys="Shift+Enter" /> {t('fp.keyMore')}{added.length ? `（${added.length}）` : ''}</span>{/if}
    <span><Keys keys="Esc" /> {q ? t('fp.keyClear') : t('fp.keyClose')}</span>
    <span class="r"><span class="legend"><span class="okc">✓</span> {t('fp.used')} · <Icon name="info" size={13} /> {t('common.about')}</span></span>
  </div>
  {#if tip}
    {@const f = FIELD_BY_ID.get(tip.id)}
    {#if f}<div class="tip" bind:this={tipEl} style:left={`${tip.x}px`} style:top={`${tip.y}px`}><b>{f.label[lang]}</b>{f.description?.[lang] ?? ''}</div>{/if}
  {/if}
</div>

<style>
  .picker {
    width: min(980px, calc(100vw - 48px));
    max-height: calc(100vh - 110px);
  }
  .x {
    background: none;
    border: 0;
    color: var(--text-3);
    font-size: 14px;
    cursor: pointer;
  }
  .recent {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 6px;
    padding: 0 12px 8px;
    border-bottom: 1px solid var(--line);
    font-size: var(--fs-1);
    color: var(--text-3);
  }
  .ck,
  .okc {
    color: var(--ok);
  }
  .lx-chip .ck {
    margin-right: 3px;
  }
  /* 分類は決まった段に置く（幅で 4 → 2 → 1 段） */
  .grid {
    overflow: auto;
    padding: 8px 12px 10px;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0 16px;
    border-top: 1px solid var(--line);
  }
  .col {
    min-width: 0;
  }
  .col + .col {
    border-left: 1px solid var(--line-soft);
    padding-left: 16px;
  }
  @container lxdlg (max-width: 760px) {
    .grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .col:nth-child(3) {
      border-left: 0;
      padding-left: 0;
    }
  }
  @container lxdlg (max-width: 420px) {
    .grid {
      grid-template-columns: minmax(0, 1fr);
    }
    .col + .col {
      border-left: 0;
      padding-left: 0;
    }
  }
  .grp {
    margin-bottom: 10px;
  }
  .grp h4 {
    display: flex;
    align-items: center;
    margin: 0 0 2px;
    padding: 2px 4px;
    font-size: var(--fs-2);
    font-weight: 700;
    color: var(--text);
    border-bottom: 1px solid var(--line);
  }
  .grp h4 .n {
    margin-left: auto;
    font-weight: 400;
    font-size: var(--fs-0);
    font-family: var(--mono);
    color: var(--text-3);
  }
  .it {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 22px;
    padding: 0 2px 0 16px;
    border-radius: 3px;
    cursor: pointer;
    white-space: nowrap;
    position: relative;
  }
  .it:hover {
    background: var(--hover);
  }
  .it.sel {
    background: var(--select-strong);
    box-shadow: inset 2px 0 0 var(--focus);
  }
  .nm {
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  .it.weak .nm {
    color: var(--text-2);
  }
  .u {
    color: var(--text-3);
    font-size: var(--fs-1);
  }
  .it .ck {
    position: absolute;
    left: 4px;
    font-size: var(--fs-1);
  }
  .new {
    font-size: var(--fs-0);
    color: var(--text-2);
    border: 1px solid var(--line-strong);
    border-radius: 3px;
    padding: 0 3px;
    line-height: 13px;
  }
  .info {
    margin-left: auto;
    flex: none;
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    border-radius: 3px;
    color: var(--text-2);
    visibility: hidden;
  }
  .it:hover .info,
  .it.sel .info {
    visibility: visible;
  }
  .info:hover {
    color: var(--text);
    background: var(--panel-3);
  }
  .tip {
    position: fixed;
    z-index: 60;
    max-width: 300px;
    padding: 6px 9px;
    background: var(--panel-3);
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    box-shadow: var(--shadow);
    font-size: var(--fs-1);
    color: var(--text-2);
    pointer-events: none;
  }
  .tip b {
    display: block;
    color: var(--text);
    margin-bottom: 2px;
  }
  .empty {
    grid-column: 1 / -1;
    padding: 26px;
    text-align: center;
    color: var(--text-3);
  }
  .why {
    margin-top: 8px;
  }
  .why b {
    color: var(--text-2);
  }
  /* 印の凡例は 1 行に（アイコンと文字を横に並べる） */
  .legend {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    white-space: nowrap;
  }
  /* 下の段: 選んだ項目の説明を 2 行まで（キーだけでも全文が読める） */
  .fp-desc {
    height: 64px;
  }
  .fp-desc .d {
    white-space: normal;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    line-height: 1.45;
  }
</style>
