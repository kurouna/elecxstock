<script lang="ts">
// スクリーナー（§5.2, §5.3）。条件エディタは指標の登録表から作る（FR-FD1）。結果は仮想スクロール（FR-SC3）。

import { canIncludeMissing, editText, parseConditionValue, typesNumber, valueUnit } from '@shared/conditionInput'
import { FIELD_BY_ID, FIELDS, type FieldDef, refFields, refInPoints, usable } from '@shared/fields'
import type { Condition, InstrumentId, ScreenResult } from '@shared/types'
import { onMount, tick, untrack } from 'svelte'
import { prefetch } from '../../lib/barsCache'
import { COLUMN_BY_ID, chooseColumns, DEFAULT_COLUMNS, fitColumns, resolveColumns, sortIds } from '../../lib/columns'
import { keyOf, openInGrid } from '../../lib/commands'
import { conditionValueText, moveCondition, newCondition, stepValue, valueChoices } from '../../lib/conditionEdit'
import { registerPane } from '../../lib/panes'
import { condsOf, extrasOf, isDirty, renameScreen, saveScreen, saveScreenAs, screenOf, setConds } from '../../lib/screens'
import { SelectionFollow } from '../../lib/selection'
import { endSymbolDrag, startSymbolDrag } from '../../lib/symbolDrag'
import {
  app,
  bridge,
  choiceDialog,
  fieldPicker,
  isFav,
  promptDialog,
  rememberField,
  screenInputs,
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
const allCols = $derived(resolveColumns(extras.columns, DEFAULT_COLUMNS.screener))
/** 一覧の幅（狭いと右の列から隠し、コードと銘柄名を残す。FR-V12） */
let width = $state(600)
const cols = $derived(fitColumns(allCols, width))
// 狭くて列を隠したら、選んでいる列を見えている列に寄せる（見出しの枠と ← → の起点がずれないように）
$effect(() => {
  if (col > cols.length - 1) col = Math.max(1, cols.length - 1)
})
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
  void screenInputs() // 指標・ウォッチリスト・保有（追加・直し・取り込み・元に戻す。別の窓での変更も）
  if (timer) clearTimeout(timer)
  timer = setTimeout(run, 120)
})
const sorted = $derived.by(() => {
  if (!result) return [] as InstrumentId[]
  void app.metrics.size
  void screenInputs() // 保有の列などで並べ替えているとき
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
// 結果が変わったら、選んでいた銘柄の行に移る（並びが入れ替わっても動かない）。消えたら同じ位置（短くなれば最後の行）に寄せ、
// 見える位置まで送る（一覧が短くなると、スクロールの位置が描く範囲の外に残るため）
const follow = new SelectionFollow<InstrumentId>()
$effect(() => {
  const r = follow.sync(rows, sel, anchor)
  if (r.anchor !== anchor) anchor = r.anchor
  if (r.sel === sel) return
  sel = r.sel
  void tick().then(scrollSel)
})
// 別のスクリーンを開いたら先頭の行から
$effect(() => {
  void pane.state.screenId
  untrack(() => {
    sel = 0
    anchor = -1
    follow.reset()
  })
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
  // 描く範囲は scrollTop の状態から決めるので、DOM の値に合わせる（一覧が短くなってブラウザが位置を下げたとき、scroll が来ないことがある）
  scrollTop = scroller.scrollTop
}
// 行の数が変わったら、描く範囲を DOM のスクロールの位置に合わせる
$effect(() => {
  void rows.length
  void tick().then(() => {
    if (scroller) scrollTop = scroller.scrollTop
  })
})
function update(i: number, c: Condition | null) {
  const next = [...conds]
  if (c) next[i] = c
  else next.splice(i, 1)
  setConds(pane, next)
  if (!c) ci = Math.min(ci, next.length - 1)
}
function step(i: number, d: number) {
  const c = conds[i]
  const v = c ? stepValue(c, d) : null
  if (c && v != null) update(i, { ...c, value: v })
}
async function typeValue(i: number) {
  const c = conds[i]
  const f = c && FIELD_BY_ID.get(c.field)
  const choices = f ? valueChoices(f, app.settings.lang) : []
  if (c && f && choices.length) {
    // 選択肢から 1 つ選んで、条件の値に足す・外す（業種・種別・権利確定月・ウォッチリストなど）
    const vals = new Set(Array.isArray(c.value) ? c.value : [String(c.value)])
    const id = await choiceDialog(
      f.label[app.settings.lang],
      choices.map((x) => ({ id: x.id, label: (vals.has(x.id) ? '✓ ' : '') + x.label })),
    )
    if (!id) return
    if (vals.has(id)) vals.delete(id)
    else vals.add(id)
    if (vals.size) update(i, { ...c, value: [...vals] })
    return
  }
  if (!c || !typesNumber(f)) return step(i, 1)
  // 金額は表示の単位（円・万円・億円）で打つ。「30万」「1.5億」のように単位を付けてもよい（アラートのダイアログと同じ関数）
  const lang = app.settings.lang
  const unit = valueUnit(c, lang)
  const title = c.ref
    ? t(refInPoints(c.field) ? 'scr.refOffsetPt' : 'scr.refOffset')
    : `${f!.label[lang]}${unit ? (lang === 'ja' ? `（${unit}）` : ` (${unit})`) : ''}`
  const s = await promptDialog(title, editText(c))
  const v = s == null ? null : parseConditionValue(c, s)
  if (v != null) update(i, { ...c, value: v })
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
  const ids = await chooseColumns(allCols)
  if (ids) patchState(pane, { cols: ids })
}
function sortBy(k: string) {
  patchState(pane, { sort: { k, dir: sort.k === k ? (-sort.dir as 1 | -1) : -1 } })
  sel = 0
  follow.reset()
}
/** 保有の記録が無いときは、保有の指標を出さない（FR-H6） */
const available = (f: FieldDef) => !f.requires?.includes('holdings') || app.holdings.length > 0
/** 条件の指標を変える（クリック・F キー）。演算子と値は新しい指標の既定に戻す */
/** 条件にできる指標（保有の記録が無ければ保有の指標は出さない） */
const pickable = () => FIELDS.filter((f) => usable(f) && available(f)).map((f) => f.id)
/** 新しい条件の既定（演算子と値は指標の既定） */
const newCond = (f: FieldDef): Condition => newCondition(f)
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
/** 条件を上下に動かす（↑↓ のボタン・Alt+↑↓）。「かつ／または」は行の位置に残すので、まとまりの形は変わらない */
function moveCond(i: number, d: number) {
  const j = i + d
  if (j < 0 || j >= conds.length) return
  setConds(pane, moveCondition(conds, i, d))
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
const showValue = (c: Condition): string => conditionValueText(c, app.settings.lang)
const opLabel = (op: string) => ({ '>=': '≥', '<=': '≤', '=': '=', in: '∈', notin: '∉' })[op] ?? op

onMount(() => {
  const ro = new ResizeObserver(() => {
    viewH = scroller?.clientHeight ?? 400
    width = scroller?.clientWidth ?? 600
  })
  if (scroller) ro.observe(scroller)
  const off = registerPane(pane.id, {
    // 「いまの銘柄」はリンク先のチャートが表示している銘柄（銘柄ジャンプのあとに Ctrl+D が前の行に効かないように）
    current: () => (pane.link ? linkSymbol(pane.link) : null) ?? rows[sel],
    selected: () => rows.slice(lo, hi + 1),
    columns: () => ({ ids: rows, cols: allCols, name: scr ? screenName(scr) : 'screener' }),
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
        follow.reset()
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
        // 条件が無ければ結果の表のまま（無い条件の行にフォーカスを置かない）
        ci = ci >= 0 || !conds.length ? -1 : 0
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
        sortBy(cols[Math.min(col, cols.length - 1)]!.id) // 狭くて列を隠したあとも、見えている列で並べ替える
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
// 銘柄ジャンプなどでリンク先の銘柄が変わったら（結果が変わって行の位置が動いたときも）、一覧にあればその行を選ぶ
$effect(() => {
  const id = pane.link ? linkSymbol(pane.link) : null
  const i = id ? rows.indexOf(id) : -1
  if (i >= 0)
    untrack(() => {
      if (sel === i) return
      sel = i
      // 仮想スクロールの描く範囲の外なら、選んだ行が見える位置まで送る
      void tick().then(scrollSel)
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
      {#if canIncludeMissing(f)}
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
