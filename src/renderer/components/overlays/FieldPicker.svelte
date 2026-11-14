<script lang="ts">
// スクリーナーの条件を選ぶダイアログ（docs/mock/fields.html）。分類を決まった段に並べ、項目は名前と単位だけ。
// 説明は下の段（キーで選んだ項目・マウスを載せた項目）と ⓘ のツールチップ。キーだけで選べる（FR-KB4）:
// 文字を打つと絞り込む · ↑↓ 項目 · ←→ 隣の段（検索欄が空のとき）· Tab 次の分類 · Home End · Enter 足して閉じる ·
// Shift+Enter 続けて足す · Esc 検索を消す／閉じる。IME の変換中は矢印・Enter を渡さない（FR-KB5）
import { DEFAULT_RECENT_FIELDS, FIELD_BY_ID, FIELD_GROUPS, type FieldDef, MISSING_FIELDS, NEW_FIELD_IDS } from '@shared/fields'
import { onMount, tick } from 'svelte'
import { SvelteSet } from 'svelte/reactivity'
import { app, closeOverlay, t } from '../../stores/app.svelte'
import Icon from '../Icon.svelte'

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
let added = $state<string[]>([])

const defs = $derived(fields.map((id) => FIELD_BY_ID.get(id)).filter((f): f is FieldDef => !!f))
const norm = (s: string) => s.normalize('NFKC').toLowerCase()
/** 2: 名前・別名で当たった / 1: 説明だけで当たった / 0: 当たらない */
function match(f: FieldDef): number {
  if (!q) return 2
  const t0 = norm(q)
  // 名前と同じ（「EPS」で EPS を、別名に EPS を持つ配当性向より先に）
  if (norm(f.label.ja) === t0 || norm(f.label.en) === t0) return 3
  if (norm(`${f.label.ja} ${f.label.en} ${f.alias ?? ''}`).includes(t0)) return 2
  if (norm(`${f.description?.ja ?? ''} ${f.description?.en ?? ''}`).includes(t0)) return 1
  return 0
}
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

/** 単位（登録表に無ければ種類から） */
function unitOf(f: FieldDef): string {
  if (f.unit) return f.unit[lang]
  if (f.type === 'percent') return '%'
  if (f.type === 'ratio') return lang === 'ja' ? '倍' : 'x'
  return ''
}
const isNew = (id: string) => NEW_FIELD_IDS.has(id) && !usedSet.has(id) && !app.settings.recentFields.includes(id)
function hl(s: string): string {
  const e = s.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  if (!q) return e
  const i = norm(e).indexOf(norm(q))
  return i < 0 ? e : `${e.slice(0, i)}<mark>${e.slice(i, i + q.length)}</mark>${e.slice(i + q.length)}`
}

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
  if (e.isComposing) return
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
function showTip(id: string, ev: MouseEvent) {
  const r = (ev.currentTarget as HTMLElement).getBoundingClientRect()
  tip = { id, x: Math.min(r.right + 8, window.innerWidth - 320), y: r.top - 4 }
}
onMount(() => input?.focus())
</script>

<div class="dialog picker" role="dialog" aria-label={title}>
  <div class="dh">
    <h3>{title}</h3>
    <label class="search">
      <span class="ic">⌕</span>
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
    <span class="cnt">{q ? t('fp.hits', { n: flat.length }) : t('fp.count', { n: defs.length })}</span>
    <button type="button" class="x" aria-label={t('cmd.hint.close')} onclick={close}>✕</button>
  </div>
  {#if !q && recent.length}
    <div class="recent">
      <span>{t('fp.recent')}</span>
      {#each recent as f (f.id)}
        <button type="button" class="chip" class:sel={f.id === sel} onclick={(e) => pick(f.id, e.shiftKey)} onmouseenter={() => (hover = f.id)} onmouseleave={() => (hover = null)}>
          {#if usedSet.has(f.id)}<span class="ck">✓</span>{/if}{f.label[lang]}
        </button>
      {/each}
    </div>
  {/if}
  <div class="grid" id="fp-list" role="listbox" bind:this={grid}>
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
                  <span class="nm">{@html hl(f.label[lang])}</span>
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
  <div class="desc" aria-live="polite">
    {#if cur}
      <b>{cur.label[lang]}{unitOf(cur) ? `（${unitOf(cur)}）` : ''}</b>
      <span class="d">{cur.description?.[lang] ?? ''}{usedSet.has(cur.id) ? t('fp.usedHint') : ''}</span>
    {/if}
  </div>
  <div class="foot">
    <span>{t('fp.keyType')}</span>
    <span><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> {t('fp.keyMove')}</span>
    <span><kbd>Tab</kbd> {t('fp.keyGroup')}</span>
    <span><kbd>Enter</kbd> {t('fp.keyAdd')}</span>
    {#if onAdd}<span><kbd>Shift+Enter</kbd> {t('fp.keyMore')}{added.length ? `（${added.length}）` : ''}</span>{/if}
    <span><kbd>Esc</kbd> {q ? t('fp.keyClear') : t('fp.keyClose')}</span>
    <span class="r"><span class="okc">✓</span> {t('fp.used')} · <Icon name="info" size={13} /> {t('common.about')}</span>
  </div>
  {#if tip}
    {@const f = FIELD_BY_ID.get(tip.id)}
    {#if f}<div class="tip" style:left={`${tip.x}px`} style:top={`${tip.y}px`}><b>{f.label[lang]}</b>{f.description?.[lang] ?? ''}</div>{/if}
  {/if}
</div>

<style>
  .picker {
    container: fp / inline-size;
    width: min(980px, calc(100vw - 48px));
    max-height: calc(100vh - 110px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: 0;
  }
  .dh {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px 6px;
  }
  .dh h3 {
    margin: 0;
    font-size: var(--fs-3);
    white-space: nowrap;
  }
  .cnt {
    font-size: var(--fs-1);
    color: var(--text-3);
    white-space: nowrap;
  }
  .search {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 10px;
    border: 1px solid var(--focus);
    border-radius: 4px;
    background: var(--bg);
    min-width: 0;
  }
  .search input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: none;
    color: var(--text);
    font: inherit;
    outline: none;
  }
  .search .ic {
    color: var(--text-3);
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
  .chip {
    height: 22px;
    padding: 0 9px;
    border: 1px solid var(--line-strong);
    border-radius: 11px;
    background: var(--panel-3);
    color: var(--text);
    font-size: var(--fs-1);
    cursor: pointer;
    white-space: nowrap;
  }
  .chip.sel {
    border-color: var(--focus);
    background: var(--select-strong);
  }
  .ck,
  .okc {
    color: var(--ok);
  }
  .chip .ck {
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
  @container fp (max-width: 760px) {
    .grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .col:nth-child(3) {
      border-left: 0;
      padding-left: 0;
    }
  }
  @container fp (max-width: 420px) {
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
  .nm :global(mark) {
    background: none;
    color: var(--focus);
    font-weight: 700;
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
  /* 下の段: 選んだ項目の説明を 2 行まで（キーだけでも全文が読める） */
  .desc {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0 10px;
    align-items: baseline;
    height: 50px;
    padding: 6px 12px;
    border-top: 1px solid var(--line);
    background: var(--panel);
    font-size: var(--fs-1);
    color: var(--text-2);
  }
  .desc b {
    color: var(--text);
    font-size: var(--fs-2);
    white-space: nowrap;
  }
  .desc .d {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 14px;
    padding: 5px 12px;
    border-top: 1px solid var(--line);
    font-size: var(--fs-1);
    color: var(--text-3);
  }
  .foot .r {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }
  @container fp (max-width: 600px) {
    .foot .r {
      display: none;
    }
  }
  kbd {
    font-family: var(--mono);
    font-size: var(--fs-0);
    border: 1px solid var(--line-strong);
    border-bottom-width: 2px;
    border-radius: 3px;
    padding: 0 4px;
    color: var(--text-2);
    background: var(--panel-3);
  }
</style>
