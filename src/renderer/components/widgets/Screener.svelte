<script lang="ts">
// スクリーナー（§5.2, §5.3）。条件エディタは指標の登録表から作る（FR-FD1）。結果は仮想スクロール（FR-SC3）。

import { FIELD_BY_ID, FIELDS, type FieldDef, MARKET_CHOICES, moneyScale, refFields, usable } from '@shared/fields'
import type { Condition, InstrumentId, ScreenResult } from '@shared/types'
import { onMount, untrack } from 'svelte'
import { fieldValueText } from '../../lib/alertText'
import { prefetch } from '../../lib/barsCache'
import { COLUMN_BY_ID, chooseColumns, DEFAULT_COLUMNS, resolveColumns, sortIds } from '../../lib/columns'
import { keyOf, openInGrid } from '../../lib/commands'
import { fmt } from '../../lib/format'
import { registerPane } from '../../lib/panes'
import { condsOf, extrasOf, isDirty, renameScreen, saveScreen, saveScreenAs, screenOf, setConds } from '../../lib/screens'
import { endSymbolDrag, startSymbolDrag } from '../../lib/symbolDrag'
import {
  app,
  bridge,
  choiceDialog,
  fieldPicker,
  isFav,
  listName,
  promptDialog,
  rememberField,
  screenName,
  t,
} from '../../stores/app.svelte'
import { linkSymbol, type PaneNode, patchState, setLinkSymbol } from '../../stores/layout.svelte'
import Icon from '../Icon.svelte'
import PaneHeader from '../PaneHeader.svelte'
import RowCells from './RowCells.svelte'

let { pane }: { pane: PaneNode } = $props()
onMount(() => {
  if (!pane.state.screenId && app.screens[0]) patchState(pane, { screenId: app.screens[0].id })
})
const conds = $derived(condsOf(pane))
const dirty = $derived(isDirty(pane))
const scr = $derived(screenOf(pane))
let result = $state<ScreenResult | null>(null)
let sel = $state(0)
/** 複数選択の起点（-1 は 1 行だけ）。Shift+↑↓ で広げ、Ctrl+A で全部（§6.5, FR-W4） */
let anchor = $state(-1)
const lo = $derived(anchor < 0 ? sel : Math.min(anchor, sel))
const hi = $derived(anchor < 0 ? sel : Math.max(anchor, sel))
let ci = $state(-1) // 条件の行（-1 は結果の表）
let col = $state(5)
const extras = $derived(extrasOf(pane))
const sort = $derived(extras.sort)
const limit = $derived(extras.limit)
const cols = $derived(resolveColumns(extras.columns, DEFAULT_COLUMNS.screener))
let scroller = $state<HTMLDivElement>()
let scrollTop = $state(0)
let viewH = $state(400)
let total = $state(0)
let timer: ReturnType<typeof setTimeout> | null = null

async function run() {
  const favs = app.watchlists.find((w) => w.builtin === 'favorites')?.items ?? []
  const wl = Object.fromEntries(app.watchlists.map((w) => [w.id, w.items]))
  const r = await bridge.call('screener.run', { conditions: $state.snapshot(conds) as Condition[], favorites: favs, watchlists: wl })
  for (const row of r.rows) app.metrics.set(row.id, row)
  result = r
  total = app.status?.instruments ?? r.ids.length
}
$effect(() => {
  void conds
  void app.dataVersion
  void app.watchlists
  if (timer) clearTimeout(timer)
  timer = setTimeout(run, 120)
})
const sorted = $derived.by(() => {
  if (!result) return [] as InstrumentId[]
  void app.metrics.size
  return sortIds(result.ids, cols.find((c) => c.id === sort.k) ?? COLUMN_BY_ID.get(sort.k), sort.dir)
})
/** ★のみ表示（Ctrl+Shift+F。ほかの一覧と同じ。§6.5.3） */
const starOnly = $derived(!!pane.state.starOnly)
/** 上位 N 件（FR-SC5）: 並べ替えの順で上から。★のみ表示はその中の★の銘柄 */
const rows = $derived.by(() => {
  const top = limit ? sorted.slice(0, limit) : sorted
  return starOnly ? top.filter((id) => isFav(id)) : top
})
$effect(() => {
  bridge.prioritize(rows.slice(0, 40))
})
const ROW = $derived(app.settings.density === 'compact' ? 20 : 24)
const start = $derived(Math.max(0, Math.floor(scrollTop / ROW) - 10))
const end = $derived(Math.min(rows.length, Math.ceil((scrollTop + viewH) / ROW) + 10))

function send() {
  const id = rows[sel]
  if (id) setLinkSymbol(pane.link, id)
  prefetch([rows[sel + 1], rows[sel - 1]])
}
function scrollSel() {
  if (!scroller) return
  const y = sel * ROW
  if (y < scroller.scrollTop) scroller.scrollTop = y
  else if (y + ROW * 2 > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = y + ROW * 2 - scroller.clientHeight
}
function update(i: number, c: Condition | null) {
  const next = [...conds]
  if (c) next[i] = c
  else next.splice(i, 1)
  setConds(pane, next)
  if (!c) ci = Math.min(ci, next.length - 1)
}
function step(i: number, d: number) {
  const c = conds[i]
  const f = c && FIELD_BY_ID.get(c.field)
  if (!c || !f) return
  if (f.type === 'bool') return update(i, { ...c, value: !c.value })
  if (f.source.kind === 'attr' && f.source.key !== 'market') {
    // 業種・種別: 1 つずつ切り替える（複数は Enter で足す）
    const ch = f.choices ?? []
    const cur = (Array.isArray(c.value) ? c.value[0] : String(c.value)) ?? ''
    const k = ch.findIndex((x) => x.value === cur)
    return update(i, { ...c, value: [ch[(k + d + ch.length) % ch.length]!.value] })
  }
  if (f.source.kind === 'attr') {
    const opts = [['P', 'R'], ['P'], ['R'], ['P', 'S', 'G'], ['P', 'S', 'G', 'R', 'E']]
    const k = opts.findIndex((o) => JSON.stringify(o) === JSON.stringify(c.value))
    return update(i, { ...c, value: opts[(k + d + opts.length) % opts.length]! })
  }
  if (f.source.kind === 'user') {
    const ids = app.watchlists.map((w) => w.id)
    const cur = (Array.isArray(c.value) ? c.value[0] : '') ?? ''
    const k = ids.indexOf(cur)
    return update(i, { ...c, value: [ids[(k + d + ids.length) % ids.length]!] })
  }
  const st = c.ref ? 1 : (f.step ?? 1) // 相対条件の値は相手からの差（%）
  const v = Math.round((Number(c.value) + st * d) * 1e6) / 1e6
  update(i, { ...c, value: v })
}
async function typeValue(i: number) {
  const c = conds[i]
  const f = c && FIELD_BY_ID.get(c.field)
  if (c && f?.type === 'enum' && f.choices) {
    // 選択肢から 1 つ選んで、条件の値に足す・外す
    const vals = new Set(Array.isArray(c.value) ? c.value : [String(c.value)])
    const id = await choiceDialog(
      f.label[app.settings.lang],
      f.choices.map((x) => ({ id: x.value, label: (vals.has(x.value) ? '✓ ' : '') + x.label[app.settings.lang] })),
    )
    if (!id) return
    if (vals.has(id)) vals.delete(id)
    else vals.add(id)
    if (vals.size) update(i, { ...c, value: [...vals] })
    return
  }
  if (!c || !f || (f.type !== 'number' && f.type !== 'percent' && f.type !== 'ratio' && f.type !== 'money')) return step(i, 1)
  if (c.ref) {
    const s = await promptDialog(t('scr.refOffset'), String(c.value))
    const v = Number((s ?? '').replace(/[,，%％]/g, ''))
    if (s != null && Number.isFinite(v)) update(i, { ...c, value: v })
    return
  }
  // 金額は表示の単位（円・万円・億円）で打つ
  const unit = f.type === 'money' ? moneyScale(f) : 1
  const lang = app.settings.lang
  const s = await promptDialog(
    `${f.label[lang]}${f.type === 'money' && f.unit ? (lang === 'ja' ? `（${f.unit.ja}）` : ` (${f.unit.en})`) : ''}`,
    String(Number(c.value) / unit),
  )
  if (s == null) return
  const v = Number(s.replace(/[,，]/g, ''))
  if (Number.isFinite(v)) update(i, { ...c, value: v * unit })
}
function flipOp(i: number) {
  const c = conds[i]
  const f = c && FIELD_BY_ID.get(c.field)
  if (!c || !f || f.operators.length < 2) return
  const k = f.operators.indexOf(c.op)
  update(i, { ...c, op: f.operators[(k + 1) % f.operators.length]! })
}
/** 「かつ」「または」の切り替え（FR-SC5）: すぐ上の条件と「または」でまとめる */
function toggleOr(i: number) {
  const c = conds[i]
  if (!c || i === 0) return
  update(i, { ...c, or: !c.or })
}
/** 相対条件（FR-SC5）: 別の指標と比べる（例: 終値 ≥ 75日移動平均 +0%）。もう一度で解除 */
async function toggleRef(i: number) {
  const c = conds[i]
  const f = c && FIELD_BY_ID.get(c.field)
  if (!c || !f) return
  if (c.ref) {
    const { ref: _r, ...rest } = c
    return update(i, { ...rest, value: f.default ?? 0 })
  }
  const refs = refFields(f)
  if (!refs.length) return
  const id = await choiceDialog(
    t('scr.refTitle', { name: f.label[app.settings.lang] }),
    refs.map((g) => ({ id: g.id, label: g.label[app.settings.lang] })),
  )
  if (id) update(i, { ...c, ref: id, value: 0, op: c.op === '<=' ? '<=' : '>=' })
}
async function setLimit() {
  const s = await promptDialog(t('scr.limitTitle'), limit ? String(limit) : '')
  if (s == null) return
  const n = Math.floor(Number(s))
  patchState(pane, { limit: Number.isFinite(n) && n > 0 ? Math.min(5000, n) : undefined })
}
async function pickColumns() {
  const ids = await chooseColumns(cols)
  if (ids) patchState(pane, { cols: ids })
}
function sortBy(k: string) {
  patchState(pane, { sort: { k, dir: sort.k === k ? (-sort.dir as 1 | -1) : -1 } })
  sel = 0
}
/** 保有の記録が無いときは、保有の指標を出さない（FR-H6） */
const available = (f: FieldDef) => !f.requires?.includes('holdings') || app.holdings.length > 0
/** 条件の指標を変える（クリック・F キー）。演算子と値は新しい指標の既定に戻す */
/** 条件にできる指標（保有の記録が無ければ保有の指標は出さない） */
const pickable = () => FIELDS.filter((f) => usable(f) && available(f)).map((f) => f.id)
/** 新しい条件の既定（演算子と値は指標の既定） */
const newCond = (f: FieldDef): Condition => ({
  field: f.id,
  op: f.operators[0]!,
  value: f.source.kind === 'user' && f.type === 'enum' ? [app.watchlists[0]?.id ?? 'favorites'] : (f.default ?? 0),
})
async function changeField(i: number) {
  const c = conds[i]
  if (!c) return
  // 条件を選ぶダイアログ（docs/mock/fields.html）。使っている指標には ✓（範囲で絞るため、同じ指標も選べる）
  const choice = await fieldPicker({
    title: t('scr.changeField'),
    fields: pickable(),
    used: conds.filter((_, j) => j !== i).map((x) => x.field),
  })
  if (!choice || choice === c.field) return
  rememberField(choice)
  const f = FIELD_BY_ID.get(choice)!
  const value = f.source.kind === 'user' && f.type === 'enum' ? [app.watchlists[0]?.id ?? 'favorites'] : (f.default ?? 0)
  update(i, { field: f.id, op: f.operators[0]!, value, ...(c.or && i > 0 ? { or: true } : {}) })
  ci = i
}
/** 条件を上下に動かす（↑↓ のボタン・Alt+↑↓）。結果は変わらないが、読みやすい順に並べられる */
function moveCond(i: number, d: number) {
  const j = i + d
  if (j < 0 || j >= conds.length) return
  const next = [...conds]
  ;[next[i], next[j]] = [next[j]!, next[i]!]
  setConds(pane, next)
  ci = j
}
async function addCond() {
  // Shift+Enter で開いたまま続けて足す（足すたびに条件の末尾に入れる）。Enter は足して閉じ、値の入力へ
  const add = (id: string) => {
    rememberField(id)
    setConds(pane, [...conds, newCond(FIELD_BY_ID.get(id)!)])
    ci = conds.length - 1
  }
  const choice = await fieldPicker({ title: t('scr.addCond'), fields: pickable(), used: conds.map((c) => c.field), onAdd: add })
  if (choice) add(choice)
}
function showValue(c: Condition): string {
  const f = FIELD_BY_ID.get(c.field)
  if (!f) return String(c.value)
  if (c.ref) {
    const g = FIELD_BY_ID.get(c.ref)
    const d = Number(c.value)
    return `${g?.label[app.settings.lang] ?? c.ref}${d ? ` ${d > 0 ? '+' : '−'}${fmt(Math.abs(d), 1)}%` : ''}`
  }
  if (f.type === 'bool') return c.value ? t('common.yes') : t('common.no')
  if (f.source.kind === 'attr')
    return (c.value as string[])
      .map((v) => (f.choices ?? MARKET_CHOICES).find((m) => m.value === v)?.label[app.settings.lang] ?? v)
      .join(', ')
  if (f.source.kind === 'user')
    return (c.value as string[])
      .map((id) => {
        const w = app.watchlists.find((x) => x.id === id)
        return w ? listName(w) : id
      })
      .join(', ')
  if (f.type === 'money') return fieldValueText(f.id, Number(c.value))
  if (f.type === 'percent') return `${fmt(Number(c.value), f.digits ?? 2)} %`
  if (f.type === 'ratio') return `${fmt(Number(c.value), f.digits ?? 2)} ×`
  return fmt(Number(c.value), f.digits ?? 0)
}
const opLabel = (op: string) => ({ '>=': '≥', '<=': '≤', '=': '=', in: '∈', notin: '∉' })[op] ?? op

onMount(() => {
  const ro = new ResizeObserver(() => (viewH = scroller?.clientHeight ?? 400))
  if (scroller) ro.observe(scroller)
  const off = registerPane(pane.id, {
    // 「いまの銘柄」はリンク先のチャートが表示している銘柄（銘柄ジャンプのあとに Ctrl+D が前の行に効かないように）
    current: () => (pane.link ? linkSymbol(pane.link) : null) ?? rows[sel],
    selected: () => rows.slice(lo, hi + 1),
    columns: () => ({ ids: rows, cols, name: scr ? screenName(scr) : 'screener' }),
    run(action) {
      if (action === 'columns') void pickColumns()
      else if (action === 'limit') void setLimit()
      else return false
      return true
    },
    key(e) {
      const k = e.key
      const ctrl = e.ctrlKey || e.metaKey
      if (ctrl && e.shiftKey && !e.altKey && e.code === 'KeyF') {
        patchState(pane, { starOnly: !starOnly })
        sel = 0
        return true
      }
      if (ctrl && !e.altKey && e.code === 'KeyS') {
        if (e.shiftKey) void saveScreenAs(pane)
        else saveScreen(pane)
        return true
      }
      if (k === 'F2') {
        void renameScreen(pane)
        return true
      }
      if (k === 'Tab' && !ctrl) {
        ci = ci >= 0 ? -1 : 0
        return true
      }
      if (ci >= 0 && e.altKey && !ctrl && (k === 'ArrowUp' || k === 'ArrowDown')) {
        moveCond(ci, k === 'ArrowUp' ? -1 : 1)
        return true
      }
      if (ci >= 0 && !ctrl && !e.altKey) {
        if (e.code === 'KeyF' && !e.shiftKey) {
          void changeField(ci)
          return true
        }
        if (k === 'ArrowUp' || k === 'ArrowDown') {
          ci = Math.max(0, Math.min(conds.length - 1, ci + (k === 'ArrowUp' ? -1 : 1)))
          return true
        }
        if (k === 'ArrowLeft' || k === 'ArrowRight') {
          step(ci, k === 'ArrowRight' ? 1 : -1)
          return true
        }
        if (k === 'Enter') {
          void typeValue(ci)
          return true
        }
        if (e.code === 'KeyO') {
          flipOp(ci)
          return true
        }
        if (e.code === 'KeyA' && !e.shiftKey) {
          toggleOr(ci)
          return true
        }
        if (e.code === 'KeyR' && !e.shiftKey) {
          void toggleRef(ci)
          return true
        }
        if (k === 'Delete') {
          update(ci, null)
          return true
        }
        if (k === 'Insert' || k === '+' || e.code === 'NumpadAdd') {
          void addCond()
          return true
        }
        if (k === 'Escape') {
          ci = -1
          return true
        }
        return false
      }
      if (k === 'Insert') {
        void addCond()
        return true
      }
      if (ctrl && e.shiftKey && !e.altKey && e.code === 'KeyC') {
        void pickColumns()
        return true
      }
      if (e.code === 'KeyT' && !ctrl && !e.altKey && !e.shiftKey) {
        void setLimit()
        return true
      }
      const n = rows.length
      const page = Math.max(1, Math.floor(viewH / ROW) - 1)
      const mv = ({ ArrowDown: 1, ArrowUp: -1, PageDown: page, PageUp: -page } as Record<string, number>)[k]
      if (mv && !ctrl && !e.altKey) {
        if (e.shiftKey) {
          if (anchor < 0) anchor = sel
        } else anchor = -1
        sel = Math.max(0, Math.min(n - 1, sel + mv))
        send()
        scrollSel()
        return true
      }
      if (ctrl && !e.shiftKey && !e.altKey && e.code === 'KeyA') {
        anchor = 0
        sel = Math.max(0, n - 1)
        return true
      }
      if (k === 'Escape' && anchor >= 0) {
        anchor = -1
        return true
      }
      if ((k === 'Home' || k === 'End') && !ctrl) {
        anchor = -1
        sel = k === 'Home' ? 0 : Math.max(0, n - 1)
        send()
        scrollSel()
        return true
      }
      if ((k === 'ArrowLeft' || k === 'ArrowRight') && !e.altKey && !ctrl) {
        col = Math.max(1, Math.min(cols.length - 1, col + (k === 'ArrowLeft' ? -1 : 1)))
        return true
      }
      if (e.code === 'KeyS' && !ctrl && !e.altKey) {
        sortBy(cols[col]!.id)
        return true
      }
      if (k === 'Enter' && !ctrl) {
        send()
        return true
      }
      return false
    },
  })
  return () => {
    ro.disconnect()
    off()
  }
})
// 銘柄ジャンプなどでリンク先の銘柄が変わったら、一覧にあればその行を選ぶ
$effect(() => {
  const id = pane.link ? linkSymbol(pane.link) : null
  const i = id ? rows.indexOf(id) : -1
  if (i >= 0)
    untrack(() => {
      if (sel !== i) sel = i
    })
})
</script>

<PaneHeader {pane}>
  <button type="button" class="chip scr" title={`${t('act.screens')} (${keyOf('screens')})`} onclick={() => (app.overlay = { kind: 'screens' })}>▾ {scr ? screenName(scr) : t('scr.untitled')}</button>
  {#if dirty}<span class="dirty">● {t('scr.modified')}</span>{/if}
  <button type="button" class="ibtn" aria-label={t('scr.save')} title={`${t('scr.save')} (Ctrl+S)`} disabled={!dirty} onclick={() => saveScreen(pane)}><Icon name="save" /></button>
  <button type="button" class="ibtn" aria-label={t('scr.saveAsLabel')} title={`${t('scr.saveAsLabel')} (Ctrl+Shift+S)`} onclick={() => saveScreenAs(pane)}><Icon name="saveAs" /></button>
  <button type="button" class="toggle" class:on={starOnly} aria-label={t('list.starOnlyLabel')} title={`${t('list.starOnlyLabel')} (Ctrl+Shift+F)`} onclick={() => patchState(pane, { starOnly: !starOnly })}><span class="box"></span>★</button>
  <button type="button" class="ibtn" aria-label={t('scr.openGrid')} title={`${t('scr.openGridTip')} (${keyOf('openGrid')})`} onclick={openInGrid}><Icon name="grid" /></button>
</PaneHeader>
<div class="conds">
  {#each conds as c, i (i)}
    {@const f = FIELD_BY_ID.get(c.field)}
    <div class="cond" class:focus={i === ci && app.focus === pane.id} class:invalid={result?.invalid.includes(i)} title={result?.invalid.includes(i) ? t('scr.invalid') : (f?.description?.[app.settings.lang] ?? '')}>
      <button type="button" class="and" class:or={c.or && i > 0} title={`${t('scr.andOrTip')} (A)`} onclick={() => toggleOr(i)}>{i ? (c.or ? t('scr.or') : t('scr.and')) : ''}</button>
      <button type="button" class="f" title={`${t('scr.changeField')} (F)`} onclick={() => { ci = i; void changeField(i) }}>{f ? f.label[app.settings.lang] : c.field}</button>
      <button type="button" class="op" onclick={() => flipOp(i)}>{opLabel(c.op)}</button>
      <button type="button" class="v" onclick={() => { ci = i; void typeValue(i) }}>{showValue(c)}</button>
      {#if (f?.source.kind === 'metrics' && f.type !== 'enum') || f?.source.kind === 'compute'}
        <button type="button" class="toggle miss" class:on={c.includeMissing} title={t('scr.missing')} onclick={() => update(i, { ...c, includeMissing: !c.includeMissing })}><span class="box"></span></button>
      {:else}<span></span>{/if}
      <button type="button" class="mv" aria-label={t('scr.moveUp')} title={`${t('scr.moveUp')} (Alt+↑)`} disabled={i === 0} onclick={() => moveCond(i, -1)}>↑</button>
      <button type="button" class="mv" aria-label={t('scr.moveDown')} title={`${t('scr.moveDown')} (Alt+↓)`} disabled={i === conds.length - 1} onclick={() => moveCond(i, 1)}>↓</button>
      <button type="button" class="x" aria-label={t('scr.removeCond')} title={`${t('scr.removeCond')} (Delete)`} onclick={() => update(i, null)}>✕</button>
    </div>
  {/each}
  <div class="meta">
    <span><button type="button" class="chip" onclick={addCond}>＋ {t('scr.addCond')}</button> <span class="muted">{t('scr.hint')}</span></span>
    <span class="num">
      {#if limit}<button type="button" class="chip" title={`${t('scr.topTip')} (T)`} onclick={setLimit}>{t('scr.top', { n: limit })}</button>{/if}
      {t('scr.hits', { n: sorted.length, total: (app.status?.instruments ?? total).toLocaleString(), ms: result?.ms ?? '—' })}
      <button type="button" class="ibtn" aria-label={t('cols.choose')} title={`${t('cols.choose')} (Ctrl+Shift+C)`} onclick={pickColumns}><Icon name="columns" /></button>
    </span>
  </div>
</div>
<div class="scroll body" bind:this={scroller} onscroll={() => (scrollTop = scroller!.scrollTop)}>
  {#if result && !rows.length}<div class="state">{t('scr.noHits')}</div>{/if}
  <table class="grid">
    <colgroup>{#each cols as c (c.id)}<col style:width={c.w ? `${c.w}px` : undefined} />{/each}</colgroup>
    <thead>
      <tr>
        {#each cols as c, i (c.id)}
          <th class:l={c.l} class:cur={i === col && ci < 0 && app.focus === pane.id} onclick={() => sortBy(c.id)}>{c.label()}{sort.k === c.id ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#if start > 0}<tr class="spacer" style:height={`${start * ROW}px`}><td colspan={cols.length}></td></tr>{/if}
      {#each rows.slice(start, end) as id, k (id)}
        {@const i = start + k}
        <tr draggable="true" ondragstart={(e) => startSymbolDrag(e, id)} ondragend={endSymbolDrag} class:sel={i === sel} class:multi={anchor >= 0 && i >= lo && i <= hi} class:stale={app.metrics.get(id)?.stale} onclick={(e) => { if (e.shiftKey) { if (anchor < 0) anchor = sel } else anchor = -1; sel = i; ci = -1; send() }}>
          <RowCells {id} {cols} />
        </tr>
      {/each}
      {#if end < rows.length}<tr class="spacer" style:height={`${(rows.length - end) * ROW}px`}><td colspan={cols.length}></td></tr>{/if}
    </tbody>
  </table>
</div>

<style>
  .scr {
    color: var(--text);
    font-weight: 500;
    font-size: var(--fs-2);
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .dirty {
    color: var(--warn);
    font-size: var(--fs-1);
  }
  .conds {
    padding: 6px var(--s-2);
    border-bottom: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: none;
    max-height: 45%;
    overflow-y: auto;
  }
  .cond {
    display: grid;
    grid-template-columns: 32px 1fr 36px 140px 18px 16px 16px 18px;
    gap: 6px;
    align-items: center;
    height: 24px;
  }
  .cond .f,
  .cond .op,
  .cond .v {
    height: 22px;
    background: var(--bg);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    display: flex;
    align-items: center;
    padding: 0 6px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
    text-align: left;
  }
  .cond .op,
  .cond .v {
    font-family: var(--mono);
    justify-content: flex-end;
  }
  /* 比較の記号（≧ ≦ ＝ など）は真ん中に */
  .cond .op {
    justify-content: center;
    padding: 0;
  }
  .cond .mv {
    background: none;
    border: 0;
    padding: 0;
    color: var(--text-3);
    cursor: pointer;
    font-size: var(--fs-1);
  }
  .cond .mv:hover:not(:disabled) {
    color: var(--text);
  }
  .cond .mv:disabled {
    opacity: 0.25;
    cursor: default;
  }
  .cond.focus .f,
  .cond.focus .op,
  .cond.focus .v {
    border-color: var(--focus);
  }
  .cond.invalid .f {
    text-decoration: line-through;
    color: var(--text-3);
  }
  .and {
    color: var(--text-3);
    font-size: var(--fs-1);
    text-align: center;
    white-space: nowrap;
    background: none;
    border: 0;
    padding: 0;
    cursor: pointer;
  }
  .and.or {
    color: var(--warn);
  }
  .x {
    background: none;
    border: 0;
    color: var(--text-3);
    cursor: pointer;
  }
  .meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: var(--text-3);
    font-size: var(--fs-1);
    padding-top: 2px;
    gap: 8px;
  }
  .meta > span:first-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .body {
    flex: 1;
    min-height: 0;
  }
  .spacer td {
    height: auto;
    padding: 0;
    border: 0;
  }
</style>
