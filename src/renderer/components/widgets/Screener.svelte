<script lang="ts">
// スクリーナー（§5.2, §5.3）。条件エディタは指標の登録表から作る（FR-FD1）。結果は仮想スクロール（FR-SC3）。

import { FIELD_BY_ID, FIELDS, MARKET_CHOICES } from '@shared/fields'
import type { Condition, InstrumentId, MetricsRow, ScreenResult } from '@shared/types'
import { onMount } from 'svelte'
import { prefetch } from '../../lib/barsCache'
import { openInGrid } from '../../lib/commands'
import { cls, fmt, money, px, sgn } from '../../lib/format'
import type { Key } from '../../lib/i18n'
import { registerPane } from '../../lib/panes'
import { condsOf, isDirty, renameScreen, saveScreen, saveScreenAs, screenOf, setConds } from '../../lib/screens'
import {
  app,
  bridge,
  choiceDialog,
  codeOf,
  inst,
  isFav,
  listName,
  nameOf,
  promptDialog,
  screenName,
  t,
  toggleFav,
} from '../../stores/app.svelte'
import { linkSymbol, type PaneNode, patchState, setLinkSymbol } from '../../stores/layout.svelte'
import PaneHeader from '../PaneHeader.svelte'

let { pane }: { pane: PaneNode } = $props()
onMount(() => {
  if (!pane.state.screenId && app.screens[0]) patchState(pane, { screenId: app.screens[0].id })
})
const conds = $derived(condsOf(pane))
const dirty = $derived(isDirty(pane))
const scr = $derived(screenOf(pane))
let result = $state<ScreenResult | null>(null)
let sel = $state(0)
let ci = $state(-1) // 条件の行（-1 は結果の表）
let col = $state(5)
let sort = $state<{ k: keyof MetricsRow; dir: 1 | -1 }>({ k: 'yieldTrailing', dir: -1 })
let scroller = $state<HTMLDivElement>()
let scrollTop = $state(0)
let viewH = $state(400)
let total = $state(0)
let timer: ReturnType<typeof setTimeout> | null = null

const COLS: { k: keyof MetricsRow | 'star' | 'code' | 'name' | 'mkt'; label: () => string; w?: number; l?: boolean }[] = [
  { k: 'star', label: () => '', w: 24, l: true },
  { k: 'code', label: () => t('col.code'), w: 52, l: true },
  { k: 'name', label: () => t('col.name'), l: true },
  { k: 'mkt', label: () => t('col.mkt'), w: 70, l: true },
  { k: 'close', label: () => t('col.close'), w: 76 },
  { k: 'yieldTrailing', label: () => t('col.yield'), w: 62 },
  { k: 'per', label: () => t('col.per'), w: 52 },
  { k: 'pbr', label: () => t('col.pbr'), w: 52 },
  { k: 'turnover20', label: () => t('col.turnover'), w: 74 },
  { k: 'ret1y', label: () => t('col.ret1y'), w: 66 },
]

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
const rows = $derived.by(() => {
  if (!result) return [] as InstrumentId[]
  const k = sort.k
  const ids = [...result.ids]
  const m = (id: InstrumentId) => app.metrics.get(id)
  return ids.sort((a, b) => (((m(a)?.[k] as number) ?? -1e18) - ((m(b)?.[k] as number) ?? -1e18)) * sort.dir)
})
$effect(() => {
  bridge.prioritize(rows.slice(0, 40))
})
const ROW = $derived(app.settings.density === 'compact' ? 20 : 24)
const start = $derived(Math.max(0, Math.floor(scrollTop / ROW) - 10))
const end = $derived(Math.min(rows.length, Math.ceil((scrollTop + viewH) / ROW) + 10))

function send() {
  const id = rows[sel]
  if (id) setLinkSymbol(pane.link || 1, id)
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
  const v = Math.round((Number(c.value) + (f.step ?? 1) * d) * 1e6) / 1e6
  update(i, { ...c, value: v })
}
async function typeValue(i: number) {
  const c = conds[i]
  const f = c && FIELD_BY_ID.get(c.field)
  if (!c || !f || (f.type !== 'number' && f.type !== 'percent' && f.type !== 'ratio' && f.type !== 'money')) return step(i, 1)
  const unit = f.type === 'money' ? 1e8 : 1
  const s = await promptDialog(
    `${f.label[app.settings.lang]}${f.type === 'money' ? (app.settings.lang === 'ja' ? '（億円）' : ' (×100M JPY)') : ''}`,
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
async function addCond() {
  const used = new Set(conds.map((c) => c.field))
  const choice = await choiceDialog(
    t('scr.addCond'),
    FIELDS.filter((f) => f.availableFrom === 'P1' && !used.has(f.id)).map((f) => ({
      id: f.id,
      label: f.label[app.settings.lang],
      hint: f.description?.[app.settings.lang] ?? '',
    })),
  )
  if (!choice) return
  const f = FIELD_BY_ID.get(choice)!
  const value = f.source.kind === 'user' && f.type === 'enum' ? [app.watchlists[0]?.id ?? 'favorites'] : (f.default ?? 0)
  setConds(pane, [...conds, { field: f.id, op: f.operators[0]!, value }])
  ci = conds.length
}
function showValue(c: Condition): string {
  const f = FIELD_BY_ID.get(c.field)
  if (!f) return String(c.value)
  if (f.type === 'bool') return c.value ? t('common.yes') : t('common.no')
  if (f.source.kind === 'attr')
    return (c.value as string[]).map((v) => MARKET_CHOICES.find((m) => m.value === v)?.label[app.settings.lang] ?? v).join(', ')
  if (f.source.kind === 'user')
    return (c.value as string[])
      .map((id) => {
        const w = app.watchlists.find((x) => x.id === id)
        return w ? listName(w) : id
      })
      .join(', ')
  if (f.type === 'money') {
    const m = money(Number(c.value))
    return `${m.n} ${m.u}`
  }
  if (f.type === 'percent') return `${fmt(Number(c.value), f.digits ?? 2)} %`
  if (f.type === 'ratio') return `${fmt(Number(c.value), f.digits ?? 2)} ×`
  return fmt(Number(c.value), f.digits ?? 0)
}
const opLabel = (op: string) => ({ '>=': '≥', '<=': '≤', '=': '=', in: '∈', notin: '∉' })[op] ?? op

onMount(() => {
  const ro = new ResizeObserver(() => (viewH = scroller?.clientHeight ?? 400))
  if (scroller) ro.observe(scroller)
  const off = registerPane(pane.id, {
    current: () => rows[sel] ?? linkSymbol(pane.link),
    selected: () => (rows[sel] ? [rows[sel]!] : []),
    key(e) {
      const k = e.key
      const ctrl = e.ctrlKey || e.metaKey
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
      if (ci >= 0 && !ctrl && !e.altKey) {
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
      const n = rows.length
      const page = Math.max(1, Math.floor(viewH / ROW) - 1)
      const mv = ({ ArrowDown: 1, ArrowUp: -1, PageDown: page, PageUp: -page } as Record<string, number>)[k]
      if (mv && !ctrl && !e.altKey && !e.shiftKey) {
        sel = Math.max(0, Math.min(n - 1, sel + mv))
        send()
        scrollSel()
        return true
      }
      if ((k === 'Home' || k === 'End') && !ctrl) {
        sel = k === 'Home' ? 0 : Math.max(0, n - 1)
        send()
        scrollSel()
        return true
      }
      if ((k === 'ArrowLeft' || k === 'ArrowRight') && !e.altKey && !ctrl) {
        col = Math.max(4, Math.min(COLS.length - 1, col + (k === 'ArrowLeft' ? -1 : 1)))
        return true
      }
      if (e.code === 'KeyS' && !ctrl && !e.altKey) {
        const kk = COLS[col]!.k as keyof MetricsRow
        sort = { k: kk, dir: sort.k === kk ? (-sort.dir as 1 | -1) : -1 }
        sel = 0
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
</script>

<PaneHeader {pane}>
  <button type="button" class="chip scr" title="Ctrl+O" onclick={() => (app.overlay = { kind: 'screens' })}>▾ {scr ? screenName(scr) : t('scr.untitled')}</button>
  {#if dirty}<span class="dirty">● {t('scr.modified')}</span>{/if}
  <button type="button" class="chip" title="Ctrl+S" disabled={!dirty} onclick={() => saveScreen(pane)}>{t('scr.save')}</button>
  <button type="button" class="chip" title="Ctrl+Shift+S" onclick={() => saveScreenAs(pane)}>{t('scr.saveAs')}</button>
  <button type="button" class="chip" title="Ctrl+Shift+G" onclick={openInGrid}>{t('scr.openGrid')}</button>
</PaneHeader>
<div class="conds">
  {#each conds as c, i (i)}
    {@const f = FIELD_BY_ID.get(c.field)}
    <div class="cond" class:focus={i === ci && app.focus === pane.id} class:invalid={result?.invalid.includes(i)} title={result?.invalid.includes(i) ? t('scr.invalid') : (f?.description?.[app.settings.lang] ?? '')}>
      <span class="and">{i ? t('scr.and') : ''}</span>
      <button type="button" class="f" onclick={() => (ci = i)}>{f ? f.label[app.settings.lang] : c.field}</button>
      <button type="button" class="op" onclick={() => flipOp(i)}>{opLabel(c.op)}</button>
      <button type="button" class="v" onclick={() => { ci = i; void typeValue(i) }}>{showValue(c)}</button>
      {#if f?.source.kind === 'metrics'}
        <button type="button" class="toggle miss" class:on={c.includeMissing} title={t('scr.missing')} onclick={() => update(i, { ...c, includeMissing: !c.includeMissing })}><span class="box"></span></button>
      {:else}<span></span>{/if}
      <button type="button" class="x" title="Delete" onclick={() => update(i, null)}>✕</button>
    </div>
  {/each}
  <div class="meta">
    <span><button type="button" class="chip" onclick={addCond}>＋ {t('scr.addCond')}</button> <span class="muted">{t('scr.hint')}</span></span>
    <span class="num">{t('scr.hits', { n: rows.length, total: (app.status?.instruments ?? total).toLocaleString(), ms: result?.ms ?? '—' })}</span>
  </div>
</div>
<div class="scroll body" bind:this={scroller} onscroll={() => (scrollTop = scroller!.scrollTop)}>
  <table class="grid">
    <colgroup>{#each COLS as c (c.k)}<col style:width={c.w ? `${c.w}px` : undefined} />{/each}</colgroup>
    <thead>
      <tr>
        {#each COLS as c, i (c.k)}
          <th class:l={c.l} class:cur={i === col && ci < 0 && app.focus === pane.id}>{c.label()}{sort.k === c.k ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#if start > 0}<tr class="spacer" style:height={`${start * ROW}px`}><td colspan={COLS.length}></td></tr>{/if}
      {#each rows.slice(start, end) as id, k (id)}
        {@const i = start + k}
        {@const m = app.metrics.get(id)}
        {@const ins = inst(id)}
        {@const tv = money(m?.turnover20)}
        <tr class:sel={i === sel} class:stale={m?.stale} onclick={() => { sel = i; ci = -1; send() }}>
          <td class="l"><button type="button" class="star" class:on={isFav(id)} onclick={(e) => { e.stopPropagation(); toggleFav(id) }}>★</button></td>
          <td class="l code">{codeOf(id)}</td>
          <td class="l name">{nameOf(id)}</td>
          <td class="l name dim">{ins ? t(`mkt.${ins.market}` as Key) : ''}</td>
          <td>{px(m?.close)}</td>
          <td>{m?.yieldTrailing != null ? fmt(m.yieldTrailing) : '—'}<span class="unit">%</span></td>
          <td>{fmt(m?.per, 1)}</td>
          <td>{fmt(m?.pbr)}</td>
          <td>{tv.n}<span class="unit">{tv.u}</span></td>
          <td class={cls(m?.ret1y)}>{sgn(m?.ret1y, 1, '%')}</td>
        </tr>
      {/each}
      {#if end < rows.length}<tr class="spacer" style:height={`${(rows.length - end) * ROW}px`}><td colspan={COLS.length}></td></tr>{/if}
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
    grid-template-columns: 32px 1fr 36px 140px 18px 18px;
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
