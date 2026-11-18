<script lang="ts" module>
import type { SimResult as R0 } from '@shared/sim/types'

/** ペインごとの最後の結果（最大化・タブの切り替えで作り直されても、入力が同じなら計算し直さない） */
const LAST = new Map<string, { key: string; dv: number; result: R0 }>()
</script>

<script lang="ts">
// 配当シミュレータ（docs/design-simulator.md。FR-SIM1〜SIM9）: 出どころの銘柄群を仮想の銘柄群として、
// 過去（N 年前に買っていたら）とこれから（今買ったら）を Core の sim.run で 1 回に計算して見せる。
// 計算は src/shared/sim/、表示の変換・前提の文・表の列は lib/divsim.ts。このファイルには計算を書かない。
import { SIM_HORIZONS, SIM_YEARS, type SimResult } from '@shared/sim/types'
import type { Condition, InstrumentId } from '@shared/types'
import { onMount, untrack } from 'svelte'
import { fitColumns } from '../../lib/columns'
import {
  basisNotes,
  cycle,
  FWD_SORTS,
  indexAt,
  lineScale,
  PAST_SORTS,
  parseAmount,
  pct,
  receiptMonths,
  SIM_COMPARES,
  SIM_MIN_LOADING,
  SIM_SECTORS,
  SIM_TAXES,
  type SimTab,
  simColumns,
  simKey,
  simSettingsOf,
  simViewOf,
  sortFwd,
  sortPast,
  splitTemplate,
  spreadLabels,
  toPct,
  yen,
} from '../../lib/divsim'
import type { Key } from '../../lib/i18n'
import { registerPane } from '../../lib/panes'
import { localX } from '../../lib/pointer'
import { SelectionFollow } from '../../lib/selection'
import { liveConditions } from '../../lib/screens'
import {
  app,
  bridge,
  choiceDialog,
  codeOf,
  listName,
  nameOf,
  promptDialog,
  inst,
  screenName,
  t,
  toast,
} from '../../stores/app.svelte'
import { type PaneNode, patchState, setLinkSymbol } from '../../stores/layout.svelte'
import PaneHeader from '../PaneHeader.svelte'

let { pane }: { pane: PaneNode } = $props()
const S = $derived(pane.state as Record<string, unknown>)
const settings = $derived(simSettingsOf(S))
const view = $derived(simViewOf(S))
const tab = $derived(view.tab)
const lang = $derived(app.settings.lang)
const src = $derived((S.src as string | undefined) ?? 'live')
const psort = $derived((PAST_SORTS as readonly string[]).includes(S.psort as string) ? (S.psort as string) : 'total')
const fsort = $derived((FWD_SORTS as readonly string[]).includes(S.fsort as string) ? (S.fsort as string) : 'y1')
const set = (patch: Record<string, unknown>) => patchState(pane, patch)

// ---------------------------------------------------------------- 出どころ（§8）
let screenIds = $state.raw<InstrumentId[] | null>(null)
let tokenScr = 0
let lastSrc = ''
$effect(() => {
  // 指標の変化は取得の完了でまとめて 1 回（dataTick）。ウォッチリスト・保有の条件のスクリーンのため、それらも読む
  void dataTick
  void app.watchlists
  void app.holdings
  let conds: Condition[] | null = null
  if (src === 'live') conds = liveConditions()
  else if (src.startsWith('scr:')) conds = app.screens.find((s) => `scr:${s.id}` === src)?.conditions ?? []
  if (!conds) return
  // 出どころを替えたら、前の出どころの結果のまま計算しない（新しい結果が来るまで読み込み中）
  if (src !== lastSrc) {
    lastSrc = src
    screenIds = null
    loading = true
  }
  const my = ++tokenScr
  const favs = app.watchlists.find((w) => w.builtin === 'favorites')?.items ?? []
  bridge
    .call('screener.run', {
      conditions: $state.snapshot(conds) as Condition[],
      favorites: favs,
      watchlists: Object.fromEntries(app.watchlists.map((w) => [w.id, w.items])),
    })
    .then((r) => {
      if (my !== tokenScr) return
      for (const row of r.rows) app.metrics.set(row.id, row)
      screenIds = r.ids
    })
    .catch(() => {
      if (my === tokenScr) screenIds = []
    })
})
const isScreen = $derived(src === 'live' || src.startsWith('scr:'))
const srcIds = $derived<InstrumentId[] | null>(isScreen ? screenIds : (app.watchlists.find((w) => w.id === src)?.items ?? []))
const srcName = $derived.by(() => {
  if (src === 'live') return t('sim.src.live')
  if (src.startsWith('scr:')) {
    const s = app.screens.find((x) => `scr:${x.id}` === src)
    return s ? screenName(s) : t('sim.src.live')
  }
  const w = app.watchlists.find((x) => x.id === src)
  return w ? listName(w) : src
})

// ---------------------------------------------------------------- 取得の完了で 1 回だけ計算し直す（§7.6）
const busy = $derived(app.jobs.some((j) => j.status === 'running' || j.status === 'queued'))
let dataTick = $state(0)
let lastDv = app.dataVersion
let pendingData = false
$effect(() => {
  const dv = app.dataVersion
  const b = busy
  untrack(() => {
    if (dv !== lastDv) {
      lastDv = dv
      pendingData = true
    }
    if (pendingData && !b) {
      pendingData = false
      dataTick++
    }
  })
})

// ---------------------------------------------------------------- 計算（読み込み中を必ず出し、そろってから全部を出す）
const kept = untrack(() => {
  const x = LAST.get(pane.id)
  return x && x.dv === app.dataVersion ? x : undefined
})
let result = $state.raw<SimResult | null>(kept?.result ?? null)
let loading = $state(!kept)
let keptKey = kept?.key ?? ''
let error = $state<string | null>(null)
let announce = $state('')
let token = 0
let timer: ReturnType<typeof setTimeout> | undefined
let lastIdsKey = ''
const runKey = $derived(srcIds ? `${simKey(srcIds, settings)}|${dataTick}` : null)
$effect(() => {
  const k = runKey
  if (k == null) return
  untrack(() => {
    const ids = srcIds!
    const st = settings
    clearTimeout(timer)
    // 作り直された（最大化・タブの切り替え）だけなら計算し直さない
    if (simKey(ids, st) === keptKey) {
      keptKey = ''
      lastIdsKey = ids.join(',')
      return
    }
    keptKey = ''
    if (!ids.length) {
      token++
      result = null
      error = null
      loading = false
      return
    }
    loading = true
    // 出どころの結果の変化は 300ms 間引く（スクリーナーを続けて変えたとき）。設定の変更はすぐ
    const idsKey = ids.join(',')
    const wait = idsKey !== lastIdsKey ? 300 : 0
    lastIdsKey = idsKey
    // 計算中の古い要求の結果は、入力が変わった時点で捨てる
    const my = ++token
    timer = setTimeout(() => void run(ids, st, simKey(ids, st), my), wait)
  })
})
async function run(ids: InstrumentId[], st: typeof settings, key: string, my = ++token) {
  const t0 = performance.now()
  announce = ''
  try {
    const r = await bridge.call('sim.run', { ids: [...ids], settings: { ...st } })
    const rest = SIM_MIN_LOADING - (performance.now() - t0)
    if (rest > 0) await new Promise((ok) => setTimeout(ok, rest))
    if (my !== token) return
    result = r
    LAST.set(pane.id, { key, dv: app.dataVersion, result: r })
    error = null
    cross = -1
    fcross = -1
    announce = t('sim.done')
  } catch (e) {
    if (my !== token) return
    const x = e as { message?: string; code?: string }
    error = x?.message || x?.code || String(e)
    result = null
  } finally {
    if (my === token) loading = false
  }
}
function retry() {
  if (srcIds?.length) {
    loading = true
    void run(srcIds, settings, simKey(srcIds, settings))
  }
}
onMount(() => () => clearTimeout(timer))

// ---------------------------------------------------------------- 表示
const past = $derived(result?.past ?? null)
const fwd = $derived(result?.fwd ?? null)
const notes = $derived(result ? basisNotes(result, tab, isScreen) : [])
const warnCount = $derived(notes.filter((n) => n.warn).length)
const nameFor = (id: InstrumentId) => nameOf(id)
const sectorOf = (id: InstrumentId) => {
  const i = inst(id)
  if (!i) return ''
  if (i.kind === 'reit' || i.market === 'R') return 'REIT'
  return (lang === 'en' ? i.sectorEn : i.sectorJa) || ''
}
const cols = $derived(result ? simColumns(result, tab, { lang, label: (k) => t(k), name: nameFor, code: (id) => codeOf(id), sector: (id) => sectorOf(id) }) : [])
let tableW = $state(800)
const shownCols = $derived(fitColumns(cols, tableW))
const rows = $derived<InstrumentId[]>(
  !result
    ? []
    : tab === 'past'
      ? sortPast(result.past?.rows ?? [], psort).map((r) => r.id)
      : sortFwd(result.fwd.rows, fsort).map((r) => r.id),
)
const staleOf = $derived(new Map((result?.stale ?? []).map((s) => [s.id, s.d])))
const CARDS: Record<SimTab, string[]> = { past: ['hero', 'hist', 'years', 'basis', 'table'], fwd: ['hero', 'fy', 'cal', 'basis', 'table'] }
let card = $state<string | null>(null)
let row = $state(0)
let cross = $state(-1)
let fcross = $state(-1)
let msel = $state(-1)
let body = $state<HTMLDivElement>()

/** 表の選択は行の位置ではなく銘柄で持つ（計算し直して並びが変わっても、選んだ銘柄から動かない） */
const follow = new SelectionFollow<InstrumentId>()
$effect(() => {
  const r = follow.sync(rows, row)
  if (r.sel !== row) row = r.sel
})
function setTab(x: SimTab) {
  if (x === tab) return
  set({ tab: x })
  card = null
  row = 0
  follow.reset()
}
function scrollCard(c: string) {
  queueMicrotask(() => body?.querySelector(`[data-card="${c}"]`)?.scrollIntoView({ block: 'nearest' }))
}
function selectCard(c: string | null) {
  card = c
  if (c) scrollCard(c)
}
function send(i = row) {
  const id = rows[i]
  if (id) setLinkSymbol(pane.link, id)
}
function scrollRow() {
  queueMicrotask(() => body?.querySelector('tr.sel')?.scrollIntoView({ block: 'nearest' }))
}
async function pickSource() {
  const items = [
    { id: 'live', label: t('sim.src.live') },
    ...app.screens.map((s) => ({ id: `scr:${s.id}`, label: screenName(s), hint: t('sim.src.screen') })),
    ...app.watchlists.map((w) => ({ id: w.id, label: listName(w), hint: t('sim.src.list') })),
  ]
  const c = await choiceDialog(t('sim.src.title'), items)
  if (c) set({ src: c })
}
async function pickAmount() {
  const v = await promptDialog(t('sim.amountTitle'), String(settings.amount / 10_000))
  if (v == null) return
  const yenV = parseAmount(v)
  if (yenV == null) toast(t('sim.amountBad'), undefined, 3000, 'error')
  else set({ amount: yenV })
}
const steps = {
  years: (d = 1) => set({ years: cycle(SIM_YEARS, settings.years, d) }),
  horizon: (d = 1) => set({ horizon: cycle(SIM_HORIZONS, settings.horizon, d) }),
  div: () => set({ reinvest: !settings.reinvest }),
  tax: () => set({ tax: cycle(SIM_TAXES, settings.tax) }),
  cmp: () => set({ cmp: cycle(SIM_COMPARES, view.cmp) }),
  sector: () => set({ sector: cycle(SIM_SECTORS, settings.sector) }),
  pct: () => set({ pct: !view.pct }),
  receipt: () => set({ receipt: !view.receipt }),
  sort: () => {
    if (tab === 'past') set({ psort: cycle(PAST_SORTS, psort as (typeof PAST_SORTS)[number]) })
    else set({ fsort: cycle(FWD_SORTS, fsort as (typeof FWD_SORTS)[number]) })
    // 並べ替えは先頭から選び直す
    row = 0
    follow.reset()
  },
}

/** 文の形の設定の帯の語（押すかキーで次の値。§7.1） */
const tokens = $derived.by(
  (): Record<string, { label: string; key: string; run: () => void }> => ({
    years: { label: t('sim.yearsAgo', { n: settings.years }), key: 'Alt+1〜3', run: () => steps.years() },
    amount: { label: t('sim.amountTok', { v: yen(settings.amount, lang) }), key: 'A', run: () => void pickAmount() },
    n: { label: t('sim.items', { n: srcIds?.length ?? 0 }), key: 'L', run: () => void pickSource() },
    div: { label: t(settings.reinvest ? 'sim.div.reinv' : 'sim.div.recv'), key: 'R', run: steps.div },
    tax: { label: t(`sim.tax.${settings.tax}` as Key), key: 'X', run: steps.tax },
    cmp: { label: t(`sim.cmp.${view.cmp}` as Key), key: 'B', run: steps.cmp },
    sector: { label: t(`sim.sec.${settings.sector}` as Key), key: 'G', run: steps.sector },
    h: { label: t('sim.horizon', { n: settings.horizon }), key: 'Alt+1〜4', run: () => steps.horizon() },
  }),
)

// ---------------------------------------------------------------- 図
let hw = $state(0)
let hh = $state(0)
const showEtf = $derived(view.cmp === 'both' || view.cmp === 'etf')
const showPeer = $derived(view.cmp === 'both' || view.cmp === 'peer')
const hs = $derived.by(() => {
  if (!past) return null
  const p = past.principal
  const conv = (xs: number[] | null) => (view.pct ? toPct(xs, p) : xs)
  return {
    port: conv(past.port)!,
    value: conv(past.value)!,
    etf: showEtf ? conv(past.etf) : null,
    peer: showPeer ? conv(past.peer) : null,
    base: view.pct ? 0 : p,
  }
})
const hsc = $derived(hs && hw > 40 && hh > 40 ? lineScale([hs.port, hs.value, hs.etf, hs.peer, [hs.base, hs.base]], hw, hh) : null)
const fmtV = (v: number) => (view.pct ? pct(v) : yen(v, lang))
const ends = $derived.by(() => {
  if (!hs || !hsc) return []
  const xs: { y: number; label: string; v: number; cls: string }[] = [
    { y: hsc.y(hs.port.at(-1)!), label: t('sim.l.port'), v: hs.port.at(-1)!, cls: 'port' },
  ]
  if (hs.etf) xs.push({ y: hsc.y(hs.etf.at(-1)!), label: t('sim.l.etf'), v: hs.etf.at(-1)!, cls: 'etf' })
  if (hs.peer) xs.push({ y: hsc.y(hs.peer.at(-1)!), label: t('sim.l.peer'), v: hs.peer.at(-1)!, cls: 'peer' })
  const ys = spreadLabels(
    xs.map((x) => x.y),
    25,
    hsc.pad.t + 8,
    hsc.pad.t + hsc.ih - 14,
  )
  return xs.map((x, i) => ({ ...x, ly: ys[i]! }))
})
function histMove(e: MouseEvent) {
  if (!hsc) return
  card = 'hist'
  cross = indexAt(localX(e.clientX, (e.currentTarget as HTMLElement).getBoundingClientRect(), hw), hsc)
}
const bandPath = $derived(
  hs && hsc
    ? `${hsc.path(hs.port)}${[...hs.value]
        .reverse()
        .map((v, i) => `L${hsc.x(hs.value.length - 1 - i).toFixed(1)},${hsc.y(v).toFixed(1)}`)
        .join('')}Z`
    : '',
)
const tot = $derived(past ? Math.max(past.principal, past.principal + past.hero.gain) + Math.max(0, past.hero.received) : 1)
const ci = $derived(past && cross >= 0 ? Math.min(cross, past.dates.length - 1) : -1)

let yw = $state(0)
let yh = $state(0)
const ymax = $derived(past ? Math.max(1, ...past.years.map((y) => y.received)) : 1)

let fw = $state(0)
let fh = $state(0)
const fyGeom = $derived.by(() => {
  if (!fwd || fw < 60 || fh < 60) return null
  const n = fwd.years.length
  const pad = { l: 8, r: 56, t: 16, b: 18 }
  const iw = fw - pad.l - pad.r
  const ih = fh - pad.t - pad.b
  const bmax = Math.max(1, ...fwd.years.map((y) => y.flat))
  const cmax = Math.max(1, fwd.years.at(-1)?.cumFlat ?? 1, fwd.amount)
  const bw = Math.max(3, (iw / n) * 0.62)
  const x = (i: number) => pad.l + (iw * (i + 0.5)) / n
  const yb = (v: number) => pad.t + ih * (1 - v / (bmax * 1.15))
  const yc = (v: number) => pad.t + ih * (1 - v / (cmax * 1.05))
  const payback = fwd.years.findIndex((y) => y.cumFlat >= fwd.amount)
  return { n, pad, iw, ih, bw, x, yb, yc, payback, cmax }
})
function fyMove(e: MouseEvent) {
  if (!fyGeom) return
  card = 'fy'
  const px = localX(e.clientX, (e.currentTarget as HTMLElement).getBoundingClientRect(), fw)
  fcross = Math.max(0, Math.min(fyGeom.n - 1, Math.floor(((px - fyGeom.pad.l) / fyGeom.iw) * fyGeom.n)))
}
const fci = $derived(fwd && fcross >= 0 ? Math.min(fcross, fwd.years.length - 1) : -1)

const monthTotals = $derived(fwd ? (view.receipt ? receiptMonths(fwd.months) : fwd.months) : [])
const monthBy = $derived(
  fwd ? fwd.rows.filter((r) => r.y1 > 0).map((r) => ({ id: r.id, ms: view.receipt ? receiptMonths(r.months) : r.months })) : [],
)
const mmax = $derived(Math.max(1, ...monthTotals))
const monthLabel = (m: number) =>
  lang === 'ja' ? t('sim.month', { m: m + 1 }) : new Date(Date.UTC(2020, m, 1)).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
const monthPeople = $derived(msel >= 0 ? monthBy.filter((x) => (x.ms[msel] ?? 0) > 0).sort((a, b) => b.ms[msel]! - a.ms[msel]!) : [])
const nzMonths = $derived(monthTotals.filter((v) => v > 0).length)

// ---------------------------------------------------------------- キー（§9）
function key(e: KeyboardEvent): boolean {
  const c = e.code
  const k = e.key
  if (c === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) {
    const cs = CARDS[tab]
    const i = card ? cs.indexOf(card) : -1
    selectCard(cs[(i + (e.shiftKey ? -1 : 1) + cs.length + (i < 0 && e.shiftKey ? 1 : 0)) % cs.length]!)
    return true
  }
  if (e.altKey && !e.ctrlKey && !e.metaKey && /^Digit[1-4]$/.test(c)) {
    const i = Number(c.slice(5)) - 1
    if (tab === 'past' && SIM_YEARS[i]) set({ years: SIM_YEARS[i] })
    else if (tab === 'fwd' && SIM_HORIZONS[i]) set({ horizon: SIM_HORIZONS[i] })
    return true
  }
  if (e.ctrlKey || e.altKey || e.metaKey) return false
  const n = rows.length
  const page = Math.max(1, Math.floor((body?.clientHeight ?? 400) / 48))
  if ((k === 'PageUp' || k === 'PageDown') && card !== 'table') {
    setTab(k === 'PageUp' ? 'past' : 'fwd')
    return true
  }
  const mv = ({ ArrowDown: 1, ArrowUp: -1, PageDown: page, PageUp: -page } as Record<string, number>)[k]
  if (mv && !e.shiftKey && result) {
    card = 'table'
    row = Math.max(0, Math.min(n - 1, row + mv))
    send()
    scrollRow()
    return true
  }
  if ((k === 'Home' || k === 'End') && result) {
    if (card === 'hist' && past) cross = k === 'Home' ? 0 : past.dates.length - 1
    else if (card === 'fy' && fwd) fcross = k === 'Home' ? 0 : fwd.years.length - 1
    else {
      card = 'table'
      row = k === 'Home' ? 0 : Math.max(0, n - 1)
      send()
      scrollRow()
    }
    return true
  }
  if (k === 'ArrowLeft' || k === 'ArrowRight') {
    const d = k === 'ArrowLeft' ? -1 : 1
    if (card === 'hist' && past) {
      const m = past.dates.length
      cross = cross < 0 ? m - 1 : Math.max(0, Math.min(m - 1, cross + d * (e.shiftKey ? 12 : 1)))
      return true
    }
    if (card === 'fy' && fwd) {
      const m = fwd.years.length
      fcross = fcross < 0 ? 0 : Math.max(0, Math.min(m - 1, fcross + d * (e.shiftKey ? 5 : 1)))
      return true
    }
    if (card === 'cal' && fwd) {
      msel = msel < 0 ? 0 : (msel + d + 12) % 12
      return true
    }
    return false
  }
  if (k === 'Enter') {
    if (error) {
      retry()
      return true
    }
    if (!rows[row]) return false
    send()
    return true
  }
  if (k === 'Escape') {
    if (cross >= 0 || fcross >= 0 || msel >= 0) {
      cross = -1
      fcross = -1
      msel = -1
    } else if (card) card = null
    else return false
    return true
  }
  const act: Record<string, () => void> = {
    KeyN: () => selectCard('basis'),
    KeyL: () => void pickSource(),
    KeyA: () => void pickAmount(),
    KeyR: steps.div,
    KeyX: steps.tax,
    KeyB: steps.cmp,
    KeyG: steps.sector,
    KeyP: steps.pct,
    KeyV: steps.receipt,
    KeyS: steps.sort,
  }
  const f = !e.shiftKey ? act[c] : undefined
  if (!f) return false
  f()
  return true
}
onMount(() =>
  registerPane(pane.id, {
    key,
    current: () => rows[row] ?? null,
    selected: () => (rows[row] ? [rows[row]!] : []),
    columns: () => (result ? { ids: rows, cols, name: `${t('widget.divsim')} ${t(`sim.tab.${tab}` as Key)}` } : null),
    run(action) {
      if (action !== 'retry') return false
      retry()
      return true
    },
  }),
)
</script>

<PaneHeader {pane} collapse={600}>
  <span class="virtual" title={t('sim.virtualHint')}>{t('sim.virtual')}</span>
  <span class="src" title={srcName}>{srcName} · {t('sim.items', { n: srcIds?.length ?? 0 })}</span>
  {#if result}
    <button type="button" class="badge" class:warn={warnCount > 0} title={t('sim.badgeHint')} onclick={() => selectCard('basis')}>
      {warnCount ? '⚠ ' : ''}{t('sim.badge', { n: warnCount || notes.length })}
    </button>
    {#if (result.excluded.length || result.total > result.ids.length) && tab === 'past'}<span class="badge plain">{t('sim.excludedBadge', { n: result.excluded.length + result.total - result.ids.length })}</span>{/if}
    <span class="asof num">{t('sim.asOf', { d: result.asOf })}</span>
  {/if}
</PaneHeader>
<div class="sub">
  <span class="nav" role="tablist">
    <button type="button" role="tab" aria-selected={tab === 'past'} class:on={tab === 'past'} onclick={() => setTab('past')}>{t('sim.tab.past')} <kbd>PgUp</kbd></button>
    <button type="button" role="tab" aria-selected={tab === 'fwd'} class:on={tab === 'fwd'} onclick={() => setTab('fwd')}>{t('sim.tab.fwd')} <kbd>PgDn</kbd></button>
  </span>
  <div class="cfg">
    <span class="sent">
      {#each splitTemplate(t(tab === 'past' ? 'sim.s.past' : 'sim.s.fwd')) as p, i (i)}
        {#if typeof p === 'string'}{p}{:else if tokens[p.k]}<button type="button" class="tok" title={`${tokens[p.k]!.label} (${tokens[p.k]!.key})`} onclick={tokens[p.k]!.run}>{tokens[p.k]!.label}</button>{/if}
      {/each}
    </span>
    {#if tab === 'past'}
      <span class="sent dim">
        {#each splitTemplate(t('sim.s.cmp')) as p, i (i)}
          {#if typeof p === 'string'}{p}{:else if tokens[p.k]}<button type="button" class="tok" title={`${tokens[p.k]!.label} (${tokens[p.k]!.key})`} onclick={tokens[p.k]!.run}>{tokens[p.k]!.label}</button>{/if}
        {/each}
      </span>
    {/if}
  </div>
</div>
<div class="body" bind:this={body} class:calc={loading}>
  <div class="sr" role="status" aria-live="polite">{loading ? t('sim.loading') : announce}</div>
  {#if loading}
    <div class="loader">
      <div class="box" data-testid="sim-loading">
        <div class="bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
        <div class="ttl">{t('sim.loading')}</div>
        <div class="what">{t('sim.loadingWhat', { n: Math.min(srcIds?.length ?? 0, 200), y: settings.years, h: settings.horizon })}</div>
        <div class="track"><span></span></div>
      </div>
    </div>
  {:else if error}
    <div class="state">
      <div>{t('sim.error', { msg: error })}</div>
      <button type="button" class="btn" onclick={retry}>{t('sim.retry')} <kbd>Enter</kbd></button>
    </div>
  {:else if !result}
    <div class="state">
      <div class="ttl">{t('sim.empty')}</div>
      <div class="dim">{t('sim.emptyHint')}</div>
    </div>
  {:else if tab === 'past' && !past}
    <div class="state">
      <div class="ttl">{t('sim.noPast', { d: result.base })}</div>
      <div class="dim">{t('sim.noPastHint', { n: result.fwd.rows.length })}</div>
      <ul class="exl">
        {#each result.excluded.slice(0, 8) as x (x.id)}<li>{codeOf(x.id)} {nameOf(x.id)}: {t(`sim.why.${x.reason}` as Key)}</li>{/each}
      </ul>
    </div>
  {:else}
    <div class="grid {tab}" data-testid={`sim-${tab}`}>
      {#if tab === 'past' && past && hs}
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <section class="card c-hero" class:sel={card === 'hero'} data-card="hero" role="group" aria-label={t('sim.h.now')} aria-current={card === 'hero'} onmousedown={() => (card = 'hero')}>
          <h3>{t('sim.h.title', { y: settings.years, a: yen(past.principal, lang) })} <span class="dim">→ {t('sim.h.now')}</span></h3>
          <div class="big num" data-testid="sim-wealth">{yen(past.hero.wealth, lang)}<span class="unit">{lang === 'ja' ? '円' : ''}</span>
            <span class={`chg ${past.hero.totalPct >= 0 ? 'up' : 'down'}`}>{pct(past.hero.totalPct)}</span>
          </div>
          <div class="sentence">
            {t('sim.h.sentence', { g: yen(past.hero.gain, lang, true), d: yen(past.hero.received, lang, true), r: pct(past.hero.annual) })}
          </div>
          <div class="stack" aria-hidden="true">
            <span class="principal" style:width={`${(Math.min(past.principal, past.principal + past.hero.gain) / tot) * 100}%`}></span>
            {#if past.hero.gain > 0}<span class="cap" style:width={`${(past.hero.gain / tot) * 100}%`}></span>{/if}
            <span class="inc" style:width={`${(past.hero.received / tot) * 100}%`}></span>
            <i class="mark" style:left={`${(past.principal / tot) * 100}%`}></i>
          </div>
          <div class="legend"><span class="sw cap"></span>{t('sim.h.capital')} {yen(past.hero.gain, lang, true)}<span class="sw inc"></span>{t('sim.h.income')} {yen(past.hero.received, lang, true)}</div>
          <dl class="kpi">
            <div><dt>{t('sim.h.total')}</dt><dd class="num">{pct(past.hero.totalPct)}</dd></div>
            <div><dt>{t('sim.h.annual')}</dt><dd class="num">{pct(past.hero.annual)}</dd></div>
            <div><dt title={t('sim.h.yocHint')}>{t('sim.h.yoc')} ⓘ</dt><dd class="num">{pct(past.hero.yoc, 2, false)}</dd></div>
            <div><dt title={t('sim.h.yopHint')}>{t('sim.h.yop')} ⓘ</dt><dd class="num">{pct(past.hero.yieldOnPrincipal, 2, false)}</dd></div>
            <div><dt title={t('sim.h.ddHint')}>{t('sim.h.dd')} ⓘ</dt><dd class="num down">{past.dailyFrom ? pct(-past.hero.maxDD) : '—'}</dd></div>
            {#if showEtf && past.etfPct != null}<div><dt>{t('sim.h.vsEtf')}</dt><dd class="num">{pct(past.hero.totalPct - past.etfPct)}</dd></div>{/if}
            {#if showPeer && past.peerPct != null}<div><dt>{t('sim.h.vsPeer')}</dt><dd class="num">{pct(past.hero.totalPct - past.peerPct)}</dd></div>{/if}
          </dl>
        </section>
        <section class="card c-hist" class:sel={card === 'hist'} data-card="hist" role="group" aria-label={t('sim.hist')} aria-current={card === 'hist'}>
          <h3>{t('sim.hist')} <span class="dim">{t('sim.histSub')}</span>
            <span class="right legend">
              <span class="sw port"></span>{t('sim.l.port')}
              {#if !settings.reinvest}<span class="sw inc"></span>{t('sim.l.div')}{/if}
              {#if hs.etf}<span class="sw etf"></span>{t('sim.l.etf')}{/if}
              {#if hs.peer}<span class="sw peer"></span>{t('sim.l.peer')}{/if}
              <button type="button" class="tok" title="P" onclick={steps.pct}>{view.pct ? '%' : lang === 'ja' ? '円' : '¥'}</button>
            </span>
          </h3>
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="chart" bind:clientWidth={hw} bind:clientHeight={hh} onmousemove={histMove} onmouseleave={() => (cross = -1)}>
            {#if hsc}
              <svg viewBox={`0 0 ${hw} ${hh}`} aria-label={t('sim.hist')}>
                {#each hsc.ticks as v (v)}
                  <line x1={hsc.pad.l} x2={hw - hsc.pad.r} y1={hsc.y(v)} y2={hsc.y(v)} class="grid" />
                  <text x={hw - 4} y={hsc.y(v) + 3} class="ax end">{fmtV(v)}</text>
                {/each}
                <line x1={hsc.pad.l} x2={hw - hsc.pad.r} y1={hsc.y(hs.base)} y2={hsc.y(hs.base)} class="base" />
                {#if !settings.reinvest}
                  <path class="band" d={bandPath} />
                {/if}
                {#if hs.peer}<path class="ln peer" d={hsc.path(hs.peer)} />{/if}
                {#if hs.etf}<path class="ln etf" d={hsc.path(hs.etf)} />{/if}
                <path class="ln port" d={hsc.path(hs.port)} />
                {#each ends as e (e.cls)}
                  <text x={hw - hsc.pad.r + 4} y={e.ly} class={`endl ${e.cls}`}>{e.label}</text>
                  <text x={hw - hsc.pad.r + 4} y={e.ly + 11} class="endv num">{fmtV(e.v)}</text>
                {/each}
                {#if ci >= 0}
                  <line x1={hsc.x(ci)} x2={hsc.x(ci)} y1={hsc.pad.t} y2={hh - hsc.pad.b} class="cross" />
                  <circle cx={hsc.x(ci)} cy={hsc.y(hs.port[ci]!)} r="3" class="dot" />
                {/if}
                <text x={hsc.pad.l} y={hh - 4} class="ax">{past.dates[0]}</text>
                <text x={hw - hsc.pad.r} y={hh - 4} class="ax end">{past.dates.at(-1)}</text>
              </svg>
              {#if ci >= 0}
                <div class="tip" style:left={hsc.x(ci) > hw / 2 ? undefined : `${hsc.x(ci) + 10}px`} style:right={hsc.x(ci) > hw / 2 ? `${hw - hsc.x(ci) + 10}px` : undefined}>
                  <div class="num">{past.dates[ci]}</div>
                  <div><span class="sw port"></span>{t('sim.l.port')} <b class="num">{fmtV(hs.port[ci]!)}</b></div>
                  {#if !settings.reinvest}<div><span class="sw inc"></span>{t('sim.l.div')} <b class="num">{yen(past.received[ci]!, lang)}</b></div>{/if}
                  {#if hs.etf}<div><span class="sw etf"></span>{t('sim.l.etf')} <b class="num">{fmtV(hs.etf[ci]!)}</b></div>{/if}
                  {#if hs.peer}<div><span class="sw peer"></span>{t('sim.l.peer')} <b class="num">{fmtV(hs.peer[ci]!)}</b></div>{/if}
                </div>
              {/if}
            {/if}
          </div>
        </section>
        <section class="card c-years" class:sel={card === 'years'} data-card="years" role="group" aria-label={t('sim.years')} aria-current={card === 'years'}>
          <h3>{t('sim.years')} <span class="dim">{t('sim.yearsSub')}</span>
            {#if settings.reinvest}<span class="right legend"><span class="sw inc"></span>{t('sim.l.div')}<span class="sw extra"></span>{t('sim.l.extra')}</span>{/if}
          </h3>
          <div class="chart bars" bind:clientWidth={yw} bind:clientHeight={yh}>
            {#if yw > 40 && yh > 40}
              {@const n = past.years.length}
              {@const bw = Math.min(56, (yw / n) * 0.6)}
              <svg viewBox={`0 0 ${yw} ${yh}`} aria-label={t('sim.years')}>
                {#each past.years as y, i (y.year)}
                  {@const x = (yw * (i + 0.5)) / n}
                  {@const hgt = ((yh - 34) * y.received) / ymax}
                  {@const he = ((yh - 34) * y.extra) / ymax}
                  <rect x={x - bw / 2} y={yh - 16 - hgt} width={bw} height={hgt} class="bar inc" />
                  {#if he > 0}<rect x={x - bw / 2} y={yh - 16 - hgt} width={bw} height={he} class="bar extra" />{/if}
                  <text x={x} y={yh - 20 - hgt} class="ax mid num">{yen(y.received, lang)}</text>
                  <text x={x} y={yh - 4} class="ax mid">{y.year}{y.partial ? '*' : ''}</text>
                {/each}
              </svg>
            {/if}
          </div>
        </section>
      {/if}
      {#if tab === 'fwd' && fwd}
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <section class="card c-hero" class:sel={card === 'hero'} data-card="hero" role="group" aria-label={t('sim.f.y1')} aria-current={card === 'hero'} onmousedown={() => (card = 'hero')}>
          <h3>{t('sim.f.title', { a: yen(fwd.amount, lang) })} <span class="dim">→ {t('sim.f.y1')}</span></h3>
          <div class="big num gold" data-testid="sim-y1">{yen(fwd.y1, lang)}<span class="unit">{lang === 'ja' ? '円' : ''}</span></div>
          <dl class="kpi">
            <div><dt>{t('sim.f.yop')}</dt><dd class="num">{pct(fwd.yieldOnPrincipal, 2, false)}</dd></div>
            <div><dt>{t('sim.f.cum', { h: settings.horizon })}</dt><dd class="num">{yen(fwd.cum, lang)}</dd></div>
            {#if fwd.stress}
              <div><dt>{t('sim.f.stress', { y: fwd.stress.year })}</dt><dd class="num">{yen(fwd.stressY1, lang)} <span class="down">{pct(fwd.stressDiff)}</span></dd></div>
            {:else}
              <div><dt>{t('sim.l.stress')}</dt><dd class="dim">{t('sim.f.stressNone')}</dd></div>
            {/if}
          </dl>
        </section>
        <section class="card c-fy" class:sel={card === 'fy'} data-card="fy" role="group" aria-label={t('sim.fy')} aria-current={card === 'fy'}>
          <h3>{t('sim.fy')} <span class="dim">{t('sim.fySub')}</span>
            <span class="right legend"><span class="sw inc"></span>{t('sim.l.flat')}<span class="sw stress"></span>{t('sim.l.stress')}<span class="sw cum"></span>{t('sim.l.cum')}</span>
          </h3>
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="chart" bind:clientWidth={fw} bind:clientHeight={fh} onmousemove={fyMove} onmouseleave={() => (fcross = -1)}>
            {#if fyGeom}
              {@const g = fyGeom}
              <svg viewBox={`0 0 ${fw} ${fh}`} aria-label={t('sim.fy')}>
                {#each fwd.years as y, i (y.year)}
                  <rect x={g.x(i) - g.bw / 2} y={g.yb(y.flat)} width={g.bw} height={fh - g.pad.b - g.yb(y.flat)} class="bar inc" class:hl={i === fci} />
                  {#if g.n <= 12 || (i + 1) % 5 === 0 || i === 0}<text x={g.x(i)} y={fh - 4} class="ax mid">{i + 1}</text>{/if}
                {/each}
                <path class="ln stress" d={fwd.years.map((y, i) => `${i ? 'L' : 'M'}${g.x(i).toFixed(1)},${g.yb(y.stress).toFixed(1)}`).join('')} />
                <path class="ln cum" d={fwd.years.map((y, i) => `${i ? 'L' : 'M'}${g.x(i).toFixed(1)},${g.yc(y.cumFlat).toFixed(1)}`).join('')} />
                <text x={fw - 4} y={g.yc(fwd.years.at(-1)!.cumFlat) + 3} class="ax end">{yen(fwd.years.at(-1)!.cumFlat, lang)}</text>
                <text x={g.x(0)} y={g.yb(fwd.y1) - 4} class="ax mid num">{yen(fwd.y1, lang)}</text>
                {#if g.payback >= 0}
                  <line x1={g.x(g.payback)} x2={g.x(g.payback)} y1={g.pad.t} y2={fh - g.pad.b} class="cross" />
                  <rect class="pill" x={g.x(g.payback) + 2} y={g.pad.t - 2} width="70" height="14" rx="3" />
                  <text x={g.x(g.payback) + 6} y={g.pad.t + 8} class="ax">{t('sim.payback')}</text>
                {/if}
              </svg>
              {#if fci >= 0}
                {@const y = fwd.years[fci]!}
                <div class="tip" style:left={g.x(fci) > fw / 2 ? undefined : `${g.x(fci) + 10}px`} style:right={g.x(fci) > fw / 2 ? `${fw - g.x(fci) + 10}px` : undefined}>
                  <div>{t('sim.yearN', { n: y.year })}</div>
                  <div><span class="sw inc"></span>{t('sim.l.flat')} <b class="num">{yen(y.flat, lang)}</b></div>
                  <div><span class="sw stress"></span>{t('sim.l.stress')} <b class="num">{yen(y.stress, lang)}</b></div>
                  <div><span class="sw cum"></span>{t('sim.l.cum')} <b class="num">{yen(y.cumFlat, lang)}</b></div>
                </div>
              {/if}
            {/if}
          </div>
        </section>
        <section class="card c-cal" class:sel={card === 'cal'} data-card="cal" role="group" aria-label={t('sim.cal')} aria-current={card === 'cal'}>
          <h3>{t('sim.cal')}
            <span class="right"><button type="button" class="tok" title="V" onclick={steps.receipt}>{t(view.receipt ? 'sim.cal.receipt' : 'sim.cal.ex')}</button></span>
          </h3>
          <div class="months">
            {#each monthTotals as v, m (m)}
              <button type="button" class="mcol" class:on={m === msel} onclick={() => { card = 'cal'; msel = msel === m ? -1 : m }}>
                <span class="mbar" style:height={`${(v / mmax) * 100}%`}>
                  {#each monthBy.filter((x) => (x.ms[m] ?? 0) > 0) as x (x.id)}<i style:flex-grow={x.ms[m]}></i>{/each}
                </span>
                <span class="mv num">{v > 0 ? yen(v, lang) : ''}</span>
                <span class="ml">{monthLabel(m)}</span>
              </button>
            {/each}
          </div>
          <div class="msel dim">
            {#if !nzMonths}{t('sim.cal.none')}
            {:else if msel >= 0}
              {t('sim.cal.sel', { m: monthLabel(msel), v: yen(monthTotals[msel] ?? 0, lang), n: monthPeople.length })}
              {#each monthPeople.slice(0, 6) as x (x.id)}<span class="who">{codeOf(x.id)} {yen(x.ms[msel]!, lang)}</span>{/each}
            {/if}
          </div>
        </section>
      {/if}
      <section class="card c-basis" class:sel={card === 'basis'} data-card="basis" role="group" aria-label={t('sim.basisTitle')} aria-current={card === 'basis'} data-testid="sim-basis">
        <h3>{t('sim.basisTitle')}</h3>
        <ul class="notes">
          {#each notes as n (n.k)}<li class:warn={n.warn}>{n.warn ? '⚠ ' : ''}{t(n.k, n.a)}</li>{/each}
        </ul>
      </section>
      <section class="card c-table" class:sel={card === 'table'} data-card="table" role="group" aria-label={t('sim.table')} aria-current={card === 'table'}>
        <h3>{t('sim.table')} <span class="dim">{t('sim.tableSub')}</span>
          {#if tab === 'past' && past?.rows.some((r) => r.rank?.s17)}<span class="right dim">{t('sim.rank17')}</span>{/if}
        </h3>
        <div class="tbl" bind:clientWidth={tableW}>
          <table class="grid-t">
            <thead>
              <tr>{#each shownCols as c (c.id)}<th class:l={c.l} style:width={c.w ? `${c.w}px` : undefined} title={c.id === 'cuts' ? t('sim.cutsHint') : undefined}>{c.label()}{(tab === 'past' ? psort : fsort) === c.id ? ' ▼' : ''}</th>{/each}</tr>
            </thead>
            <tbody>
              {#each rows as id, i (id)}
                <tr class:sel={i === row && card === 'table'} class:stale={staleOf.has(id)} aria-selected={i === row} data-id={id} title={staleOf.has(id) ? t('sim.stale', { d: staleOf.get(id)! }) : undefined} onclick={() => { card = 'table'; row = i; send() }}>
                  {#each shownCols as c (c.id)}
                    {@const v = c.cell(id)}
                    <td class:l={c.l} class={`c-${c.id} ${v.c ?? ''}`}>{v.t}{#if c.id === 'code' && staleOf.has(id)}<span class="warnmark">!</span>{/if}</td>
                  {/each}
                </tr>
              {/each}
              {#if tab === 'past'}
                {#each result.excluded as x (x.id)}
                  <tr class="excl"><td class="l c-code">{codeOf(x.id)}</td><td class="l" colspan={Math.max(1, shownCols.length - 1)}>{nameOf(x.id)} — {t('sim.excludedRow')}: {t(`sim.why.${x.reason}` as Key)}</td></tr>
                {/each}
              {/if}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  {/if}
</div>
<div class="disclaim" role="note" data-testid="sim-disclaimer"><b>{t('sim.disclaimerLead')}</b>{t('sim.disclaimer')}</div>

<style>
  .virtual {
    flex: none;
    font-size: var(--fs-0);
    color: var(--text-2);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    padding: 0 4px;
    line-height: 14px;
  }
  .src {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--text-3);
    font-size: var(--fs-1);
  }
  .badge {
    flex: none;
    font: inherit;
    font-size: var(--fs-1);
    background: var(--panel-3);
    color: var(--text-3);
    border: 0;
    border-radius: var(--radius);
    padding: 0 6px;
    line-height: 18px;
    cursor: pointer;
  }
  .badge.warn {
    color: var(--warn);
  }
  .badge.plain {
    cursor: default;
  }
  .asof {
    margin-left: auto;
    flex: none;
    color: var(--text-3);
    font-size: var(--fs-1);
  }
  @container (max-width: 699px) {
    .asof,
    .virtual {
      display: none;
    }
  }
  .sub {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 2px 14px;
    padding: 0 10px 0 4px;
    border-bottom: 1px solid var(--line);
    background: var(--panel);
    flex: none;
  }
  .nav {
    display: inline-flex;
    flex: none;
    align-self: stretch;
  }
  .nav button {
    background: none;
    border: 0;
    font: inherit;
    font-size: var(--fs-2);
    padding: 0 10px;
    line-height: 30px;
    color: var(--text-3);
    cursor: pointer;
    white-space: nowrap;
  }
  .nav button.on {
    color: var(--text);
    box-shadow: inset 0 -2px 0 var(--focus);
  }
  kbd {
    font-size: var(--fs-0);
    color: var(--text-3);
    margin-left: 4px;
  }
  .cfg {
    flex: 1 1 340px;
    display: flex;
    flex-wrap: wrap;
    gap: 2px 14px;
    padding: 4px 0;
    font-size: var(--fs-1);
    color: var(--text-2);
  }
  .sent.dim {
    color: var(--text-3);
  }
  .tok {
    font: inherit;
    background: none;
    border: 0;
    padding: 0 1px;
    color: var(--text);
    border-bottom: 1px dotted var(--text-3);
    cursor: pointer;
  }
  .tok:hover {
    color: var(--focus);
  }
  .body {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: auto;
    background: var(--bg);
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
  .loader {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 12%;
  }
  .box {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: 14px 18px;
    min-width: min(300px, calc(100cqi - 24px));
    max-width: calc(100cqi - 24px);
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: center;
  }
  .box .ttl {
    color: var(--text);
    font-size: var(--fs-3);
  }
  .box .what {
    color: var(--text-3);
    font-size: var(--fs-1);
  }
  .bars {
    display: flex;
    gap: 3px;
    align-items: flex-end;
    height: 22px;
  }
  .bars i {
    width: 6px;
    background: var(--gold);
    border-radius: 1px;
    animation: grow 1.1s var(--ease-out) infinite;
  }
  .bars i:nth-child(2) {
    animation-delay: 0.1s;
  }
  .bars i:nth-child(3) {
    animation-delay: 0.2s;
  }
  .bars i:nth-child(4) {
    animation-delay: 0.3s;
  }
  .bars i:nth-child(5) {
    animation-delay: 0.4s;
  }
  @keyframes grow {
    0% {
      height: 3px;
    }
    60%,
    100% {
      height: 22px;
    }
  }
  .track {
    width: 160px;
    height: 2px;
    background: var(--line);
    overflow: hidden;
    border-radius: 1px;
  }
  .track span {
    display: block;
    width: 40%;
    height: 100%;
    background: var(--focus);
    animation: slide 1.2s ease-in-out infinite alternate;
  }
  @keyframes slide {
    from {
      transform: translateX(-10%);
    }
    to {
      transform: translateX(160%);
    }
  }
  :global(:root[data-reduce-motion='true']) .bars i,
  :global(:root[data-reduce-motion='true']) .track span {
    animation: none;
    height: 14px;
  }
  .state {
    padding: 40px 20px;
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: center;
    color: var(--text-2);
  }
  .state .ttl {
    font-size: var(--fs-3);
    color: var(--text);
  }
  .exl {
    list-style: none;
    padding: 0;
    margin: 0;
    font-size: var(--fs-1);
    color: var(--text-3);
  }
  .dim {
    color: var(--text-3);
    font-weight: 400;
  }
  .grid {
    display: grid;
    gap: 6px;
    padding: 6px;
    grid-template-columns: 1fr;
    animation: fadein 260ms var(--ease-out);
  }
  :global(:root[data-reduce-motion='true']) .grid {
    animation: none;
  }
  @keyframes fadein {
    from {
      opacity: 0;
    }
  }
  .grid.past {
    grid-template-areas: 'hero' 'hist' 'years' 'basis' 'table';
  }
  .grid.fwd {
    grid-template-areas: 'hero' 'fy' 'cal' 'basis' 'table';
  }
  @container (min-width: 760px) {
    .grid {
      grid-template-columns: repeat(6, 1fr);
    }
    .grid.past {
      grid-template-areas: 'hero hero hist hist hist hist' 'years years years basis basis basis' 'table table table table table table';
      grid-template-rows: minmax(280px, auto) minmax(200px, auto) auto;
    }
    .grid.fwd {
      grid-template-areas: 'hero hero fy fy fy fy' 'cal cal cal basis basis basis' 'table table table table table table';
      grid-template-rows: minmax(260px, auto) minmax(200px, auto) auto;
    }
  }
  @container (min-width: 1180px) {
    .grid {
      grid-template-columns: repeat(12, 1fr);
    }
    .grid.past {
      grid-template-areas: 'hero hero hero hero hist hist hist hist hist hist hist hist' 'years years years years years basis basis basis basis basis basis basis' 'table table table table table table table table table table table table';
      grid-template-rows: minmax(318px, auto) minmax(236px, auto) auto;
    }
    .grid.fwd {
      grid-template-areas: 'hero hero hero hero fy fy fy fy fy fy fy fy' 'cal cal cal cal cal cal cal basis basis basis basis basis' 'table table table table table table table table table table table table';
      grid-template-rows: minmax(300px, auto) minmax(236px, auto) auto;
    }
  }
  .c-hero {
    grid-area: hero;
  }
  .c-hist {
    grid-area: hist;
  }
  .c-years {
    grid-area: years;
  }
  .c-fy {
    grid-area: fy;
  }
  .c-cal {
    grid-area: cal;
  }
  .c-basis {
    grid-area: basis;
  }
  .c-table {
    grid-area: table;
  }
  .card {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 10px 12px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .card.sel {
    border-color: var(--focus);
  }
  h3 {
    margin: 0;
    font-size: var(--fs-2);
    font-weight: 500;
    color: var(--text);
    display: flex;
    align-items: center;
    gap: 4px 8px;
    flex-wrap: wrap;
    min-height: 20px;
  }
  h3 .right {
    margin-left: auto;
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
  }
  .legend {
    font-size: var(--fs-1);
    color: var(--text-3);
    display: flex;
    align-items: center;
    gap: 4px 6px;
    flex-wrap: wrap;
  }
  .sw {
    display: inline-block;
    width: 10px;
    height: 3px;
    border-radius: 1px;
    vertical-align: middle;
    margin-right: 2px;
  }
  .sw.port {
    background: var(--text);
  }
  .sw.inc {
    background: var(--gold);
    height: 8px;
  }
  .sw.extra {
    background: var(--gold);
    opacity: 0.45;
    height: 8px;
  }
  .sw.cap {
    background: var(--up);
    height: 8px;
  }
  .sw.etf {
    background: var(--ind1);
  }
  .sw.peer {
    background: var(--ind2);
  }
  .sw.stress {
    background: var(--down);
  }
  .sw.cum {
    background: var(--text-2);
  }
  .big {
    font-size: var(--fs-5);
    font-weight: 600;
    color: var(--text);
    display: flex;
    align-items: baseline;
    gap: 6px;
    flex-wrap: wrap;
  }
  .big.gold {
    color: var(--gold);
  }
  .unit {
    font-size: var(--fs-2);
    color: var(--text-2);
    font-weight: 400;
  }
  .chg {
    font-size: var(--fs-3);
  }
  .up {
    color: var(--up);
  }
  .down {
    color: var(--down);
  }
  .sentence {
    color: var(--text-2);
    font-size: var(--fs-2);
  }
  .stack {
    position: relative;
    display: flex;
    height: 10px;
    border-radius: 2px;
    overflow: hidden;
    background: var(--panel-3);
  }
  .stack span {
    height: 100%;
  }
  .stack .principal {
    background: var(--line-strong);
  }
  .stack .cap {
    background: var(--up);
  }
  .stack .inc {
    background: var(--gold);
  }
  .stack .mark {
    position: absolute;
    top: -2px;
    bottom: -2px;
    width: 2px;
    background: var(--text);
  }
  .kpi {
    margin: 4px 0 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 6px 12px;
  }
  .kpi div {
    display: flex;
    flex-direction: column;
  }
  .kpi dt {
    font-size: var(--fs-1);
    color: var(--text-3);
  }
  .kpi dd {
    margin: 0;
    font-size: var(--fs-3);
    color: var(--text);
  }
  .chart {
    position: relative;
    flex: 1;
    min-height: 180px;
  }
  .chart svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .chart :global(.grid) {
    stroke: var(--chart-grid);
  }
  .ax {
    fill: var(--text-3);
    font-size: 10px;
  }
  .ax.end {
    text-anchor: end;
  }
  .ax.mid {
    text-anchor: middle;
  }
  .base {
    stroke: var(--text-3);
    stroke-dasharray: 3 3;
  }
  .ln {
    fill: none;
    stroke-width: 1.6;
  }
  .ln.port {
    stroke: var(--text);
    stroke-width: 2;
  }
  .ln.etf {
    stroke: var(--ind1);
    stroke-dasharray: 5 3;
  }
  .ln.peer {
    stroke: var(--ind2);
    stroke-dasharray: 1.5 2.5;
  }
  .ln.stress {
    stroke: var(--down);
    stroke-dasharray: 4 3;
  }
  .ln.cum {
    stroke: var(--text-2);
  }
  .band {
    fill: var(--gold);
    opacity: 0.35;
  }
  .endl {
    font-size: 10px;
    fill: var(--text-3);
  }
  .endl.port {
    fill: var(--text);
  }
  .endl.etf {
    fill: var(--ind1);
  }
  .endl.peer {
    fill: var(--ind2);
  }
  .endv {
    font-size: 10px;
    fill: var(--text-2);
  }
  .cross {
    stroke: var(--chart-cross);
    stroke-dasharray: 2 2;
  }
  .dot {
    fill: var(--text);
  }
  .pill {
    fill: var(--panel);
    opacity: 0.85;
  }
  .tip {
    position: absolute;
    top: 8px;
    background: var(--panel-2);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    padding: 4px 8px;
    font-size: var(--fs-1);
    color: var(--text-2);
    pointer-events: none;
    white-space: nowrap;
  }
  .bar.inc {
    fill: var(--gold);
  }
  .bar.extra {
    fill: var(--panel);
    opacity: 0.45;
  }
  :global(:root[data-theme='light']) .bar.inc {
    stroke: var(--gold);
  }
  .bar.hl {
    opacity: 0.75;
  }
  .months {
    flex: 1;
    min-height: 140px;
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    gap: 4px;
  }
  .mcol {
    font: inherit;
    background: none;
    border: 0;
    padding: 0;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    align-items: stretch;
    gap: 2px;
    min-width: 0;
  }
  .mcol.on .ml {
    color: var(--text);
    font-weight: 600;
  }
  .mbar {
    display: flex;
    flex-direction: column-reverse;
    gap: 1px;
    min-height: 0;
  }
  .mbar i {
    background: var(--gold);
    flex-basis: 0;
    min-height: 1px;
  }
  .mv {
    order: -1;
    font-size: 9px;
    color: var(--text-3);
    text-align: center;
    overflow: hidden;
  }
  .ml {
    font-size: var(--fs-0);
    color: var(--text-3);
    text-align: center;
  }
  .msel {
    min-height: 18px;
    font-size: var(--fs-1);
    display: flex;
    gap: 4px 10px;
    flex-wrap: wrap;
  }
  .who {
    color: var(--text-2);
  }
  .notes {
    margin: 0;
    padding-left: 16px;
    font-size: var(--fs-1);
    color: var(--text-2);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .notes li.warn {
    color: var(--text);
    list-style: none;
    margin-left: -14px;
  }
  .tbl {
    overflow-x: auto;
  }
  .grid-t {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--fs-1);
  }
  .grid-t th,
  .grid-t td {
    padding: 0 6px;
    height: var(--row);
    text-align: right;
    white-space: nowrap;
    border-bottom: 1px solid var(--line-soft);
  }
  .grid-t th {
    color: var(--text-3);
    font-weight: 400;
  }
  .grid-t .l {
    text-align: left;
  }
  .grid-t td.c-name {
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .grid-t tr.sel td {
    background: var(--select);
  }
  .grid-t td.gold {
    color: var(--gold);
  }
  .grid-t tr.excl td {
    color: var(--text-3);
  }
  .warnmark {
    color: var(--warn);
    margin-left: 2px;
  }
  .disclaim {
    flex: none;
    min-height: 22px;
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    line-height: 1.5;
    gap: 0 4px;
    padding: 3px 10px;
    font-size: var(--fs-1);
    color: var(--text-3);
    border-top: 1px solid var(--line);
    background: var(--panel-2);
  }
  .disclaim::before {
    content: 'ⓘ';
    margin-right: 4px;
  }
  .disclaim b {
    font-weight: 500;
    color: var(--text-2);
  }
</style>
