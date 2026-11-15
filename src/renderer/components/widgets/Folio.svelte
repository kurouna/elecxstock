<script lang="ts">
// folio（ポートフォリオ。FR-PF1〜PF8・docs/design-portfolio.md）: 保有を 1 枚のダッシュボードで見せる。
// 上の段（概要）: 評価額・資産推移・資産構成・損益寄与・配当見込み・今後 30 日の予定。下の段: 配当の分析。
// 計算は lib/folio.ts（画面のロジック）と shared/folio.ts（純粋な関数）、記録と期間の計算は Core（folio.*）。キーは registerPane
import { jstNow, lastClosedSession } from '@shared/calendar'
import type { AlertView, FolioAt, FolioContrib, FolioDividends, FolioSeries, InstrumentId } from '@shared/types'
import { onMount } from 'svelte'
import { condsText } from '../../lib/alertText'
import {
  ALLOC_GROUPS,
  acctParts,
  allocStats,
  BENCHES,
  benchSeries,
  briefOf,
  type Card,
  CONTRIB_PERIODS,
  clampIndex,
  contribBars,
  contribRows,
  contribSummary,
  DIV_GROUPS,
  DIV_SORTS,
  divBridgeSteps,
  divGroups,
  divMonths,
  divRows,
  divSummary,
  divYields,
  eventsOf,
  type FolioView,
  groupKey,
  HIST_PERIODS,
  heroNumbers,
  histHead,
  histPoints,
  manYen,
  moveRow,
  nextCard,
  nisaShare,
  reselect,
  rowsAtDay,
  rowsOf,
  signPct,
  spatialNext,
  type TableRow,
  type Tile,
  tableRows,
  toggleOpen,
  toneOf,
  totalsOf,
  trendGeom,
  viewKey,
  viewOf,
  yenFull,
} from '../../lib/folio'
import { briefText, groupLabel } from '../../lib/folioText'
import type { Key } from '../../lib/i18n'
import { registerPane } from '../../lib/panes'
import { periodOfKey } from '../../lib/periods'
import { loadHoldings } from '../../lib/portfolio'
import { app, ensureMetrics, inst, metric, nameOf, rpc, t } from '../../stores/app.svelte'
import { type PaneNode, saveLayout, setLinkSymbol } from '../../stores/layout.svelte'
import PaneHeader from '../PaneHeader.svelte'
import AcctRing from './folio/AcctRing.svelte'
import AllocMap from './folio/AllocMap.svelte'
import DivBars from './folio/DivBars.svelte'
import DivTable from './folio/DivTable.svelte'
import Donut from './folio/Donut.svelte'
import FlipNum from './folio/FlipNum.svelte'
import HistChart from './folio/HistChart.svelte'
import Seg from './folio/Seg.svelte'
import Waterfall from './folio/Waterfall.svelte'

let { pane }: { pane: PaneNode } = $props()

// ---- 表示の状態（ペインに保存する） ----
const view = $derived(viewOf(pane.state.folio))
// 読み直しは値で見る（view は表示の設定を変えるたびに作り直すので、そのまま読むと分類・並べ替えを変えただけでも全部を読み直す）
const est = $derived(view.est)
const benchId = $derived(BENCHES[view.bench])
function setView(v: FolioView) {
  pane.state = { ...pane.state, folio: v }
  saveLayout()
}
let card = $state<Card | null>(null)
let cross = $state(-1)
let tile = $state(0)
let crow = $state(0)
let ev = $state(0)
let dm = $state(1)
let srow = $state(0)
let drow = $state(0)
let open = $state(new Set<string>())
let leaves = $state<Tile[]>([])

// ---- 材料 ----
let series = $state<FolioSeries | null>(null)
let contribM = $state<FolioContrib | null>(null)
let contribY = $state<FolioContrib | null>(null)
let divs = $state<FolioDividends | null>(null)
let at = $state<FolioAt | null>(null)
let bench = $state<{ d: string; c: number }[]>([])
let alerts = $state<AlertView[]>([])
let loaded = $state(false)
onMount(() => void loadHoldings())
const ids = $derived([...new Set(app.holdings.map((h) => `JP:${h.code}`)), 'IDX:N225', 'JP:1306'])
$effect(() => ensureMetrics(ids))
let gen = 0
async function loadAll() {
  const my = ++gen
  const [s, m, y, d, a] = await Promise.all([
    rpc('folio.series', { est }),
    rpc('folio.contrib', { period: 'month' }),
    rpc('folio.contrib', { period: 'year' }),
    rpc('folio.dividends', {}),
    rpc('alerts.list', {}).catch(() => [] as AlertView[]),
  ])
  if (my !== gen) return
  series = s
  contribM = m
  contribY = y
  divs = d
  alerts = a
  loaded = true
}
let timer: ReturnType<typeof setTimeout> | undefined
$effect(() => {
  // 保有・市場データ・試算の切り替えで読み直す（まとめて 1 回）
  void app.holdings
  void app.dataVersion
  void est
  clearTimeout(timer)
  timer = setTimeout(() => void loadAll(), 60)
  return () => clearTimeout(timer)
})
$effect(() => {
  const id = benchId
  if (!id) {
    bench = []
    return
  }
  void rpc('bars.get', { id, tf: 'D', adjustment: 'split' }).then((b) => {
    // 素早く切り替えたとき、古い応答で新しいベンチマークを上書きしない
    if (benchId === id) bench = b.time.map((d, i) => ({ d, c: b.close[i]! }))
  })
})

// ---- 行と数 ----
const get = (id: string) => ({ m: metric(id), ins: inst(id), name: nameOf(id) })
const rows = $derived.by(() => {
  void app.dataVersion
  void app.metrics.size
  return rowsOf(app.holdings, get, series?.now)
})
const hp = $derived(series ? histPoints(series.points, view) : [])
const head = $derived(histHead(hp))
const recs = $derived(series?.points.filter((p) => p.src !== 'est') ?? [])
const realN = $derived(recs.length)
/** 十字線の日（資産推移を選び、キーで日を決めたとき。最新の日・試算の日は連動しない） */
const crossDay = $derived.by(() => {
  if (card !== 'hist' || cross < 0 || view.pct) return null
  const p = hp[Math.min(cross, hp.length - 1)]
  return p && p.src !== 'est' && p !== hp.at(-1) ? p.d : null
})
$effect(() => {
  const d = crossDay
  if (!d) {
    at = null
    return
  }
  void rpc('folio.at', { d }).then((x) => {
    if (crossDay === d) at = x
  })
})
const shown = $derived(crossDay && at ? rowsAtDay(at, rows, (c) => nameOf(`JP:${c}`)) : rows)
const tot = $derived(totalsOf(shown))
/** 今の合計（十字線の日でも、配当の利回りは今の評価額・取得額で割る） */
const baseTot = $derived(totalsOf(rows))
const heroN = $derived(heroNumbers(series?.points ?? [], crossDay && at ? crossDay : null, tot, app.portfolioMeta))
const received = $derived(app.portfolioMeta?.dividends ?? 0)
const acctMix = $derived(acctParts(shown))
const accts = $derived.by(() => {
  const m = new Map<string, number>()
  for (const r of shown) m.set(r.acct, (m.get(r.acct) ?? 0) + r.value)
  return [...m].filter(([, v]) => v > 0)
})
const nisaCost = $derived(shown.filter((r) => r.acct === 'nisa_growth' || r.acct === 'nisa_tsumitate').reduce((s, r) => s + r.cost, 0))
const benchS = $derived(view.bench ? benchSeries(hp, bench) : null)
const stats = $derived(allocStats(shown))
const cPeriod = $derived(CONTRIB_PERIODS[view.contrib]!)
const cRows = $derived(contribRows(cPeriod, shown, cPeriod === 'month' ? contribM : contribY, (c) => nameOf(`JP:${c}`)))
const cBars = $derived(contribBars(cRows))
const cSum = $derived(contribSummary(cRows))
const zeroAt = $derived(cRows.findIndex((r) => r.v <= 0))
const dRows = $derived(divs ? divRows(divs, rows, (c) => get(`JP:${c}`)) : [])
const dsum = $derived(
  dRows.length
    ? divSummary(
        dRows,
        !!divs?.yearAgoDate,
        rows.map((r) => ({ code: r.code, acct: r.acct, qty: r.qty })),
      )
    : null,
)
/** 配当の利回り・取得利回り（十字線の日でも今の評価額・取得額で割る） */
const dy = $derived(dsum ? divYields(dsum.gross, baseTot) : { yld: null, yoc: null })
const today = $derived.by(() => {
  void app.dataVersion // データの更新のたびに数え直す（日付をまたいで開いたままでもずれない）
  return jstNow().date
})
const months = $derived(divMonths(dRows, Number(today.slice(5, 7))))
const dGroup = $derived(DIV_GROUPS[view.dgroup]!)
const dGroups = $derived(divGroups(dRows, dGroup))
const shareList = $derived(dGroups.filter((g) => g.annual > 0).sort((a, b) => b.annual - a.annual))
const tRows = $derived<TableRow[]>(tableRows(dRows, dGroup, DIV_SORTS[view.dsort]!, open))
const alertsMet = $derived(
  alerts
    .filter(
      (a) =>
        a.enabled &&
        a.state.met &&
        a.target.kind === 'symbol' &&
        app.holdings.some((h) => `JP:${h.code}` === (a.target as { id: string }).id),
    )
    .map((a) => {
      const id = (a.target as { id: string }).id
      return { code: id.slice(3), name: nameOf(id), text: condsText(a.conditions) }
    }),
)
const events = $derived(eventsOf(rows, dRows, alertsMet, today))
const brief = $derived(
  briefOf(
    contribRows('year', rows, contribY, (c) => nameOf(`JP:${c}`)),
    dsum,
  ),
)
const trend = $derived(divs ? divs.trend : [])
let tw = $state(0)
let th = $state(0)
const tg = $derived(tw > 40 && th > 20 ? trendGeom(trend, tw, th) : null)
const evRange = 30

// 選んでいる銘柄（行の位置ではなく銘柄で覚える。取得で値が変わって並びが入れ替わっても、選んだ銘柄から動かない）
let crowKey: string | null = null
let evKey: string | null = null
let drowKey: string | null = null
let tileKey: string | null = null
let srowKey: string | null = null
const evKeyOf = (e: (typeof events)[number]) => `${e.type}:${e.code}:${e.date}`
const dKeyOf = (r: TableRow) => (r.type === 'g' ? `g:${r.g.key}` : `m:${r.r.code}`)
$effect(() => {
  const c = reselect(cRows, crowKey, (r) => r.code, crow)
  if (c !== crow) crow = c
  const e = reselect(events, evKey, evKeyOf, ev)
  if (e !== ev) ev = e
  const d = reselect(tRows, drowKey, dKeyOf, drow)
  if (d !== drow) drow = d
  const t0 = reselect(leaves, tileKey, (x) => x.item.key, tile)
  if (t0 !== tile) tile = t0
  const s0 = reselect(shareList, srowKey, (x) => x.key, srow)
  if (s0 !== srow) srow = s0
})
/**
 * 今選んでいる行の銘柄を覚える（行を動かした・押した・分類を開閉した・表示を切り替えたとき）。位置だけを変えて覚え直さないと、
 * 上の reselect が前に覚えた銘柄の行へ戻してしまう。一覧（tRows など）は $derived なので、状態を変えた直後に読めば新しい並び
 */
function remember(): void {
  crowKey = cRows[crow]?.code ?? null
  evKey = events[ev] ? evKeyOf(events[ev]!) : null
  drowKey = tRows[drow] ? dKeyOf(tRows[drow]!) : null
  tileKey = leaves[tile]?.item.key ?? null
  srowKey = shareList[srow]?.key ?? null
}
// 保有を外した・予定が過ぎた・分類を変えたなどで一覧が短くなったら、選んでいる位置を最後に寄せる
$effect(() => {
  if (crow >= cRows.length) crow = clampIndex(crow, cRows.length)
  if (ev >= events.length) ev = clampIndex(ev, events.length)
  if (srow >= shareList.length) srow = clampIndex(srow, shareList.length)
  if (drow >= tRows.length) drow = clampIndex(drow, tRows.length)
  if (tile >= leaves.length) tile = clampIndex(tile, leaves.length)
})
/** 選んでいる分類・月の銘柄（他のカードでは、それ以外を薄くする） */
const brushed = $derived.by((): Set<string> | null => {
  if (card === 'alloc') {
    const t0 = leaves[tile]
    if (!t0) return null
    const g = ALLOC_GROUPS[view.group]!
    if (g === 'code') return new Set([t0.item.rows[0]!.code])
    const k = groupKey(g, t0.item.rows[0]!)
    return new Set(shown.filter((r) => groupKey(g, r) === k).map((r) => r.code))
  }
  if (card === 'dshare') return shareList[srow] ? new Set(shareList[srow]!.rows.map((r) => r.code)) : null
  if (card === 'dtab') {
    const r = tRows[drow]
    return r?.type === 'g' ? new Set(r.g.rows.map((x) => x.code)) : null
  }
  if (card === 'div') return new Set(months[dm]?.codes.map((c) => c.code) ?? [])
  return null
})
const dim = (code: string) => !!brushed && !brushed.has(code)

// ---- 段（概要 ／ 配当の分析） ----
let scroller = $state<HTMLDivElement>()
let dsec = $state<HTMLElement>()
let sec = $state<'top' | 'div'>('top')
function goSec(s: 'top' | 'div') {
  scroller?.scrollTo({ top: s === 'top' || !dsec ? 0 : dsec.offsetTop - 4, behavior: app.settings.reduceMotion ? 'auto' : 'smooth' })
}
function onScroll() {
  if (!scroller || !dsec) return
  sec = scroller.scrollTop + scroller.clientHeight * 0.4 >= dsec.offsetTop ? 'div' : 'top'
}
$effect(() => {
  // 選んだカードを見える位置へ
  if (!card) return
  queueMicrotask(() => scroller?.querySelector(`[data-card="${card}"]`)?.scrollIntoView({ block: 'nearest' }))
})
$effect(() => {
  void crow
  if (card === 'contrib') queueMicrotask(() => scroller?.querySelector('.crow.sel')?.scrollIntoView({ block: 'nearest' }))
})

// ---- 今選んでいる銘柄 ----
function current(): InstrumentId | null {
  const code =
    card === 'alloc'
      ? leaves[tile]?.item.rows[0]?.code
      : card === 'contrib'
        ? cRows[crow]?.code
        : card === 'events'
          ? events[ev]?.code
          : card === 'dtab'
            ? (() => {
                const r = tRows[drow]
                return r?.type === 'm' ? r.r.code : undefined
              })()
            : card === 'div'
              ? months[dm]?.codes[0]?.code
              : card === 'dshare' && dGroup === 'code'
                ? shareList[srow]?.key
                : undefined
  return code ? `JP:${code}` : null
}
const LIST_CARDS: Card[] = ['contrib', 'dshare', 'dtab']
/** 選んだ銘柄を同じリンク色のチャート・銘柄情報に出す（FR-PF6。一覧のペインと同じく、選ぶと追従する） */
function follow(): void {
  remember()
  const id = current()
  if (id) setLinkSymbol(pane.link, id)
}
/** クリックで選ぶ（カードを選び、行・タイル・予定を選んでリンク色に送る） */
function pick(c: Card, i: number): void {
  card = c
  if (c === 'alloc') tile = i
  else if (c === 'contrib') crow = i
  else if (c === 'events') ev = i
  else if (c === 'dshare') srow = i
  else if (c === 'dtab') drow = i
  else if (c === 'div') dm = i
  follow()
}
function key(e: KeyboardEvent): boolean {
  const c = e.code
  if (c === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) {
    card = nextCard(card, e.shiftKey)
    return true
  }
  const p = periodOfKey(e)
  if (p != null) {
    setView({ ...view, period: p })
    cross = -1
    return true
  }
  if (e.ctrlKey || e.altKey || e.metaKey) return false
  if (c === 'Escape') {
    if (cross >= 0) cross = -1
    else if (card) card = null
    else return false
    return true
  }
  if ((c === 'PageDown' || c === 'PageUp') && !(card && LIST_CARDS.includes(card))) {
    goSec(c === 'PageDown' ? 'div' : 'top')
    return true
  }
  if (card === 'hist' && (c === 'ArrowLeft' || c === 'ArrowRight')) {
    const n = view.pct ? hp.filter((x) => x.src !== 'est').length : hp.length
    cross = cross < 0 ? n - 1 : Math.max(0, Math.min(n - 1, cross + (c === 'ArrowLeft' ? -1 : 1)))
    return true
  }
  if (card === 'alloc' && c.startsWith('Arrow')) {
    tile = spatialNext(leaves, tile, c)
    follow()
    return true
  }
  if (card === 'events' && (c === 'ArrowLeft' || c === 'ArrowRight')) {
    ev = Math.max(0, Math.min(events.length - 1, ev + (c === 'ArrowLeft' ? -1 : 1)))
    follow()
    return true
  }
  if (card === 'div' && (c === 'ArrowLeft' || c === 'ArrowRight')) {
    dm = Math.max(0, Math.min(11, dm + (c === 'ArrowLeft' ? -1 : 1)))
    return true
  }
  if (card === 'dtab' && (c === 'ArrowLeft' || c === 'ArrowRight')) {
    const r = toggleOpen(tRows, drow, open, c === 'ArrowRight', dGroup)
    open = r.open
    drow = r.sel
    remember()
    return true
  }
  if (card && LIST_CARDS.includes(card)) {
    const n = card === 'contrib' ? cRows.length : card === 'dshare' ? shareList.length : tRows.length
    const cur = card === 'contrib' ? crow : card === 'dshare' ? srow : drow
    const next = moveRow(cur, n, e.key)
    if (next != null) {
      if (card === 'contrib') crow = next
      else if (card === 'dshare') srow = next
      else drow = next
      follow()
      return true
    }
  }
  if (c === 'Enter') {
    if (card === 'dtab' && tRows[drow]?.type === 'g') {
      const r = toggleOpen(tRows, drow, open, undefined, dGroup)
      open = r.open
      drow = r.sel
      remember()
      return true
    }
    if (card === 'div') {
      // 配当の表（銘柄ごと）へ移り、その月の最初の銘柄を選んでリンク色に送る。権利月の銘柄が無い月は何もしない
      const first = months[dm]?.codes[0]?.code
      if (!first) return true
      applyView({ ...view, dgroup: 0 })
      card = 'dtab'
      queueMicrotask(() => {
        drow = clampIndex(
          tRows.findIndex((r) => r.type === 'm' && r.r.code === first),
          tRows.length,
        )
        follow()
      })
      goSec('div')
      return true
    }
    const id = current()
    follow()
    return !!id
  }
  const v = viewKey(view, c, card)
  if (v) {
    applyView(v)
    return true
  }
  return false
}
/** 表示の状態を変える（キーと、見出しの切り替え・列名を押したときで同じ。選んでいる行・タイル・十字線は戻す） */
function applyView(v: FolioView): void {
  if (v.group !== view.group) tile = 0
  if (v.dgroup !== view.dgroup) {
    srow = 0
    drow = 0
    open = new Set()
  }
  if (v.contrib !== view.contrib) crow = 0
  if (v.dsort !== view.dsort) drow = 0
  if (v.pct !== view.pct || v.period !== view.period) cross = -1
  setView(v)
  remember()
}
const segLabel = (k: Key) => t(k)
onMount(() => registerPane(pane.id, { key, current, selected: () => (current() ? [current()!] : []) }))
const pct = (a: number, b: number) => (b ? (a / b) * 100 : null)
const kk = (k: string, s: Key) => ({ k, s: t(s) })
const isLoading = $derived(!loaded)
const empty = $derived(loaded && !rows.length && !recs.length)
</script>

<PaneHeader {pane} collapse={600}>
  {#if !empty}<span class="muted sub">{t('folio.sub', { n: new Set(rows.map((r) => r.code)).size, a: accts.length })}</span>{/if}
  <span class="nav" role="tablist">
    <button type="button" role="tab" aria-selected={sec === 'top'} class:on={sec === 'top'} onclick={() => goSec('top')}>{t('folio.secTop')} <kbd>PgUp</kbd></button>
    <button type="button" role="tab" aria-selected={sec === 'div'} class:on={sec === 'div'} onclick={() => goSec('div')}>{t('folio.secDiv')} <kbd>PgDn</kbd></button>
  </span>
  {#if series?.readOnly}<span class="chip warn" title={series.error ?? ''}>{t('folio.readOnly')}</span>{/if}
  <span class="muted asof">{t('folio.asof', { d: lastClosedSession().slice(5).replace('-', '/'), n: realN })}</span>
</PaneHeader>

<div class="folio" bind:this={scroller} onscroll={onScroll}>
  {#if isLoading}
    <div class="grid">
      {#each ['hero', 'hist', 'alloc', 'contrib', 'div', 'events'] as c (c)}<section class={`card c-${c}`}><div class="sk w28"></div><div class="sk w45"></div><div class="sk fill"></div></section>{/each}
    </div>
  {:else if empty}
    <div class="empty"><div><b>{t('folio.emptyTitle')}</b>{t('folio.emptyBody')}</div></div>
  {:else}
    <div class="grid">
      <!-- 評価額 -->
      <section class="card c-hero" data-card="hero" style:--tone={tot.pnl >= 0 ? 'var(--up)' : 'var(--down)'}>
        <h3>{t('folio.value')}<span class="right">{#if crossDay}<span class="crossday">{t('folio.crossDay', { d: crossDay.replaceAll('-', '/') })} <kbd>Esc</kbd></span>{:else}<span class="chip">{t('folio.noCash')}</span>{/if}</span></h3>
        <div class="hero-value">¥<FlipNum text={yenFull(tot.value)} /></div>
        <div class="hero-sub">
          <span class={`num ${toneOf(tot.day)}`}>{yenFull(tot.day, true)}（{signPct(pct(tot.day, tot.value - tot.day), 2)}）</span>
          <span class="mute">{crossDay ? t('folio.prevDay') : t('folio.today')}</span>
          {#if !crossDay}<span class="mute">{t('folio.n225')} <span class={`num ${toneOf(metric('IDX:N225')?.chgPct)}`}>{signPct(metric('IDX:N225')?.chgPct, 2)}</span> · <span title="1306">{t('folio.topixEtf')}</span> <span class={`num ${toneOf(metric('JP:1306')?.chgPct)}`}>{signPct(metric('JP:1306')?.chgPct, 2)}</span></span>{/if}
        </div>
        {#if !crossDay && brief}<div class="brief">{briefText(brief)}</div>{/if}
        <div class="stats">
          <div class="stat"><span class="k">{t('folio.pnl')}</span><span class={`v num ${toneOf(tot.pnl)}`}>{manYen(tot.pnl, true)} <span class="mute">{signPct(pct(tot.pnl, tot.cost))}</span></span></div>
          <div class="stat"><span class="k">{t('folio.cost')}</span><span class="v num">{manYen(tot.cost)}</span></div>
          <div class="stat" title={t('folio.totalTip')}><span class="k">{t('folio.total')}</span><span class={`v num ${toneOf(heroN.total)}`}>{manYen(heroN.total, true)}</span></div>
          <div class="stat" title={t('folio.fromPeakTip')}><span class="k">{t('folio.fromPeak')}</span><span class={`v num ${heroN.fromPeak != null && heroN.fromPeak < -0.05 ? 'down' : 'flat'}`}>{heroN.fromPeak == null ? '—' : signPct(heroN.fromPeak)}</span></div>
          <div class="stat" title={t('folio.prevRecTip')}><span class="k">{t('folio.prevRec')}</span><span class={`v num ${toneOf(heroN.prevRec)}`}>{heroN.prevRec == null ? '—' : manYen(heroN.prevRec, true)}</span></div>
          <div class="stat"><span class="k">PER · β</span><span class="v num">{tot.per?.toFixed(1) ?? '—'} · {tot.beta?.toFixed(2) ?? '—'}</span></div>
        </div>
        <AcctRing parts={acctMix} nisa={nisaShare(acctMix)} />
        <div class="nisa" title={t('folio.nisaTip')}><span>{t('folio.nisa')}</span><span class="track"><i style:width={`${Math.min(100, (nisaCost / 18e6) * 100)}%`}></i></span><span class="num">{manYen(nisaCost)} <span class="mute">/ {t('folio.nisaLife')}</span></span></div>
      </section>

      <!-- 資産推移 -->
      <section class="card c-hist" class:focus={card === 'hist'} data-card="hist">
        <h3>
          {t('folio.hist')}
          <span class="right">
            <Seg items={HIST_PERIODS.map((p) => t(`folio.p.${p.key}` as Key))} on={view.period} label={segLabel('folio.k.period')} onpick={(i) => applyView({ ...view, period: i })} />
            <Seg items={[t('folio.yen'), '%']} on={view.pct ? 1 : 0} label={segLabel('folio.k.pct')} onpick={(i) => applyView({ ...view, pct: i === 1 })} />
          </span>
        </h3>
        <div class="hist-tools">
          {#if view.pct}
            <Seg items={[t('folio.benchNone'), t('folio.bench.1'), t('folio.bench.2')]} on={view.bench} label={segLabel('folio.k.bench')} onpick={(i) => applyView({ ...view, bench: i })} />
          {:else}
            <button type="button" class="toggle" class:on={view.est} aria-pressed={view.est} tabindex="-1" title={t('folio.k.est')} onclick={() => applyView({ ...view, est: !view.est, period: !view.est && view.period === 0 ? 5 : view.period })}>{t('folio.estToggle')} <kbd>E</kbd></button>
          {/if}
        </div>
        <div class="histhead">
          {#if view.pct}
            <span class={`big num ${toneOf(head.twr.at(-1))}`}>{signPct(head.twr.at(-1), 2)}</span><span class="mute">{t('folio.twrNote')}</span>
            {#if view.bench}{#if benchS}<span class="legend"><span><span class="dot" style:background="var(--ind1)"></span>{t(`folio.bench.${view.bench}` as Key)} {signPct(benchS.at(-1), 2)}</span></span>{:else}<span class="chip warn">{t('folio.benchWait')}</span>{/if}{/if}
          {:else}
            <span class={`big num ${toneOf(head.pnl)}`}>{manYen(head.pnl, true)}</span><span class="mute">{t('folio.pnl')}（{signPct(head.pnlPct)}）</span>
            {#if head.move != null}<span class="mute">{t('folio.move')} <span class="num txt2">{manYen(head.move, true)}</span> · {t('folio.since', { d: head.from!.replaceAll('-', '/') })}</span>{/if}
            <span class="legend right"><span><span class="dot" style:background="var(--text)"></span>{t('folio.value')}</span><span><span class="dot dash"></span>{t('folio.cost')}</span><span><span class="dot" style:background="var(--up)"></span>{t('folio.gain')}</span><span><span class="dot" style:background="var(--down)"></span>{t('folio.loss')}</span>{#if hp.some((x) => x.src === 'fill')}<span><span class="dot ring"></span>{t('folio.src.fill')}</span>{/if}</span>
          {/if}
        </div>
        <HistChart points={hp} pct={view.pct} twr={head.twr} bench={benchS} {cross} onhover={(i) => (cross = i)} />
        <div class="wfbox">
          {#if realN < 5}
            <div class="note">{t('folio.newRecords', { n: realN })}</div>
          {:else if head.bridge}
            <Waterfall
              steps={[
                { key: 'start', v: head.bridge.start, total: true },
                { key: 'flow', v: head.bridge.flow, flow: true },
                { key: 'move', v: head.bridge.move },
                { key: 'end', v: head.bridge.end, total: true },
              ]}
              label={(k) => t(`folio.wf.${k}` as Key)}
              aside={{ text: t('folio.wf.received'), v: head.bridge.received }}
              fs={10}
              bottom={15}
              maxW={64}
              cut={0.15}
            />
          {/if}
        </div>
        <div class="keys" class:off={card !== 'hist'} aria-hidden={card !== 'hist'}>{#each [kk('Alt+1〜6', 'folio.k.period'), kk('← →', 'folio.k.cross'), kk('P', 'folio.k.pct'), kk('B', 'folio.k.bench'), kk('E', 'folio.k.est')] as x (x.k)}<span><kbd>{x.k}</kbd> {x.s}</span>{/each}</div>
      </section>

      <!-- 資産構成 -->
      <section class="card c-alloc" class:focus={card === 'alloc'} data-card="alloc">
        <h3>
          {t('folio.alloc')}{#if crossDay}<span class="crossday">{t('folio.atDay', { d: crossDay.slice(5).replace('-', '/') })}</span>{/if}
          <span class="right">
            <Seg items={ALLOC_GROUPS.map((g) => t(`folio.g.${g}` as Key))} on={view.group} label={segLabel('folio.k.group')} onpick={(i) => applyView({ ...view, group: i })} />
            <Seg items={[t('folio.heatPnl'), t('folio.heatDay')]} on={view.heat} label={segLabel('folio.k.heat')} onpick={(i) => applyView({ ...view, heat: i })} />
          </span>
        </h3>
        <div class="conc">
          <span title={t('folio.cyclicalTip')}>{t('folio.cyclical')} <b class="num">{(stats.cyclical * 100).toFixed(0)}%</b> · {t('folio.defensive')} <b class="num">{(stats.defensive * 100).toFixed(0)}%</b></span>
          <span>{t('folio.maxShare')}<b class="num">{(stats.max * 100).toFixed(1)}%</b></span>
          <span>{t('folio.top5')}<b class="num">{(stats.top5 * 100).toFixed(0)}%</b></span>
          <span title={t('folio.effTip')}>{t('folio.eff')}<b class="num">{stats.effective.toFixed(1)}</b></span>
        </div>
        <AllocMap rows={shown} group={ALLOC_GROUPS[view.group]!} heat={view.heat} sel={tile} focused={card === 'alloc'} label={groupLabel} ontiles={(l) => (leaves = l)} onpick={(i) => pick('alloc', i)} />
        <div class="keys" class:off={card !== 'alloc'} aria-hidden={card !== 'alloc'}>{#each [kk('G', 'folio.k.group'), kk('H', 'folio.k.heat'), kk('← → ↑ ↓', 'folio.k.tile'), kk('Enter', 'folio.k.chart')] as x (x.k)}<span><kbd>{x.k}</kbd> {x.s}</span>{/each}</div>
      </section>

      <!-- 損益寄与 -->
      <section class="card c-contrib" class:focus={card === 'contrib'} data-card="contrib">
        <h3>
          {t('folio.contrib')}{#if crossDay && (cPeriod === 'day' || cPeriod === 'all')}<span class="crossday">{t('folio.atDay', { d: crossDay.slice(5).replace('-', '/') })}</span>{/if}
          <span class="right"><Seg items={CONTRIB_PERIODS.map((p) => t(`folio.c.${p}` as Key))} on={view.contrib} label={segLabel('folio.k.cperiod')} onpick={(i) => applyView({ ...view, contrib: i })} /></span>
        </h3>
        <div class="csum">
          <b class={`num ${toneOf(cSum.total)}`}>{manYen(cSum.total, true)}</b>
          {#if cSum.div}<span>{t('folio.ofDiv')} <span class="num gold">{manYen(cSum.div, true)}</span></span>{/if}
          <span>{t('folio.upDown', { u: cSum.up, d: cSum.down })}</span>
          <span class="right">{t(`folio.cNote.${cPeriod}` as Key, { d: lastClosedSession().slice(5).replace('-', '/') })}{#if (cPeriod === 'month' ? contribM : contribY)?.beforeRecords && (cPeriod === 'month' || cPeriod === 'year')} · {t('folio.beforeRecords')}{/if}</span>
        </div>
        <div class="contrib">
          {#each cRows as r, i (r.code)}
            {#if i === zeroAt && i > 0}<div class="zero">0</div>{/if}
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <div class="crow" class:sel={card === 'contrib' && i === crow} class:dim={dim(r.code)} class:sold={!!r.soldOn} title={r.soldOn ? t('folio.soldTip', { d: r.soldOn }) : ''} onclick={() => pick('contrib', i)}>
              <span class="nm"><span class="mute num">{r.code}</span> {r.name}{#if r.soldOn}<span class="tag">{t('folio.fx.sold')}</span>{/if}</span>
              <span class="track"><span class="b" class:upb={r.price >= 0} class:downb={r.price < 0} style:left={`${cBars[i]!.pl}%`} style:width={`${cBars[i]!.pw}%`}></span>{#if r.div}<span class="b goldb" style:left={`${cBars[i]!.dl}%`} style:width={`${cBars[i]!.dw}%`}></span>{/if}</span>
              <span class={`val num ${toneOf(r.v)}`}>{manYen(r.v, true)}</span>
            </div>
          {/each}
        </div>
        <div class="keys" class:off={card !== 'contrib'} aria-hidden={card !== 'contrib'}>{#each [kk('T', 'folio.k.cperiod'), kk('↑ ↓ PgUp PgDn', 'folio.k.row'), kk('Enter', 'folio.k.chart')] as x (x.k)}<span><kbd>{x.k}</kbd> {x.s}</span>{/each}</div>
      </section>

      <!-- 配当見込み -->
      <section class="card c-div" class:focus={card === 'div'} data-card="div">
        <h3>{t('folio.divFc')}<span class="right mute small" title={t('folio.divFcTip')}>{t('folio.divFcNote')}</span></h3>
        {#if dsum}
          <div class="divkpi">
            <div><div class="k">{t('folio.annualNet')}</div><div class="v num">¥{yenFull(dsum.now)}</div></div>
            <div><div class="k">{t('folio.yoy')}</div><div class={`v num ${toneOf(dsum.delta)}`}>{dsum.hasYearAgo || dsum.delta ? manYen(dsum.delta, true) : '—'} <span class="mute">{signPct(pct(dsum.delta, dsum.prev))}</span></div></div>
            <div><div class="k">{t('folio.yieldYoc')}</div><div class="v num">{dy.yld == null ? '—' : dy.yld.toFixed(2)}% / {dy.yoc == null ? '—' : dy.yoc.toFixed(2)}%</div></div>
          </div>
        {/if}
        <DivBars {months} sel={card === 'div' ? dm : -1} {brushed} onpick={(i) => pick('div', i)} />
        <div class="legend"><span><span class="dot" style:background="var(--f-bar)"></span>{t('folio.next12')}</span><span><span class="dot thin"></span>{t('folio.prevSame')}</span><span><span class="dot" style:background="var(--gold)"></span>{t('folio.nextMonth')}</span></div>
        <div class="keys" class:off={card !== 'div'} aria-hidden={card !== 'div'}>{#each [kk('← →', 'folio.k.month'), kk('Enter', 'folio.k.toTable')] as x (x.k)}<span><kbd>{x.k}</kbd> {x.s}</span>{/each}</div>
      </section>

      <!-- 今後 30 日の予定 -->
      <section class="card c-events" class:focus={card === 'events'} data-card="events">
        <h3>{t('folio.events')}<span class="right legend"><span><span class="gold">◆</span>{t('folio.ev.rights')}</span><span><span class="mute">■</span>{t('folio.ev.earnings')}</span><span>○ {t('folio.ev.alert')}</span></span></h3>
        <div class="tl" aria-hidden="true">
          <i class="axis"></i>
          {#each [0, 7, 14, 21, 30] as d (d)}<span class="tick" style:left={`${(d / evRange) * 100}%`}><em>{d === 0 ? t('folio.today') : d === 30 ? t('folio.d30') : t('folio.weeks', { n: d / 7 })}</em></span>{/each}
          {#each events as e, i (i)}<span class={`mark ${e.type}`} class:sel={card === 'events' && i === ev} class:dim={dim(e.code)} style:left={`${(e.day / evRange) * 100}%`} style:bottom={`${events.slice(0, i).filter((x) => x.day === e.day).length * 9 + 12}px`}></span>{/each}
        </div>
        {#if events.length}
          <div class="events">
            {#each events as e, i (i)}
              <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
              <div class="ev" class:sel={card === 'events' && i === ev} class:dim={dim(e.code)} onclick={() => pick('events', i)}>
                <span class="d"><span class="num">{e.date.slice(5).replace('-', '/')}</span> · {e.day ? t('folio.inDays', { n: e.day }) : e.type === 'alert' ? t('folio.ev.met') : t('folio.today')}</span>
                <span class={`t ${e.type}`}>{t(`folio.ev.${e.type}Long` as Key)}</span>
                <span class="n"><span class="mute num">{e.code}</span> {e.name}</span>
                <span class="x num">{e.type === 'rights' ? (e.amount ? t('folio.ev.amount', { v: yenFull(e.amount) }) : '') : e.type === 'earnings' ? t('folio.ev.qty', { n: (e.qty ?? 0).toLocaleString() }) : e.text}</span>
              </div>
            {/each}
          </div>
        {:else}
          <div class="note">{t('folio.noEvents')}</div>
        {/if}
      </section>
    </div>

    <!-- 配当の分析 -->
    <section class="dsec" bind:this={dsec}>
      <h2>{t('folio.secDiv')}<span class="mute">{t('folio.divNote', { n: realN })}</span></h2>
      <div class="dgrid">
        <section class="card c-dshare" class:focus={card === 'dshare'} data-card="dshare">
          <h3>{t('folio.dshare')}<span class="right"><Seg items={DIV_GROUPS.map((g) => t(`folio.dg.${g}` as Key))} on={view.dgroup} label={segLabel('folio.k.group')} onpick={(i) => applyView({ ...view, dgroup: i })} /></span></h3>
          {#if dsum}<Donut groups={dGroups} total={dsum.now} sel={srow} focused={card === 'dshare'} {brushed} label={(g) => (dGroup === 'code' ? `${g.key} ${g.rows[0]?.name ?? ''}` : groupLabel(g.key))} unit={t(`folio.unit.${dGroup}` as Key)} onpick={(i) => pick('dshare', i)} />{/if}
          <div class="keys" class:off={card !== 'dshare'} aria-hidden={card !== 'dshare'}>{#each [kk('G', 'folio.k.group'), kk('↑ ↓', 'folio.k.row')] as x (x.k)}<span><kbd>{x.k}</kbd> {x.s}</span>{/each}</div>
        </section>
        <section class="card c-dsum" data-card="dsum">
          <h3>{t('folio.annualNet')}<span class="right"><span class="chip">{t('folio.fc')}</span></span></h3>
          {#if dsum}
            <div class="dbig">¥<FlipNum text={yenFull(dsum.now)} /></div>
            <div class="hero-sub">
              {#if dsum.hasYearAgo || dsum.prev}<span class={`num ${toneOf(dsum.delta)}`}>{yenFull(dsum.delta, true)}（{signPct(pct(dsum.delta, dsum.prev))}）</span><span class="mute">{t('folio.yoyPrev', { v: yenFull(dsum.prev) })}</span>{/if}
            </div>
            {#if !dsum.hasYearAgo}<div class="note">{t('folio.noYearAgo')}</div>{/if}
            <div class="trend" bind:clientWidth={tw} bind:clientHeight={th} title={t('folio.trendTip')}>
              {#if tg}
                <svg viewBox={`0 0 ${tw} ${th}`}>
                  <path d={tg.area} class="tarea" /><path d={tg.line} class="tline" />
                  <text x={tw - 46} y={tg.y(trend.at(-1)!.v) + 4} class="tl">{manYen(trend.at(-1)!.v)}</text>
                </svg>
              {:else}<div class="note">{t('folio.trendWait')}</div>{/if}
            </div>
            <div class="stats row">
              <div class="stat"><span class="k">{t('folio.perMonth')}</span><span class="v num">¥{yenFull(dsum.perMonth)}</span></div>
              <div class="stat"><span class="k">{t('folio.gross')}</span><span class="v num">¥{yenFull(dsum.gross)}</span></div>
              <div class="stat"><span class="k">{t('folio.yield')}</span><span class="v num">{dy.yld == null ? '—' : dy.yld.toFixed(2)}%</span></div>
              <div class="stat"><span class="k">{t('folio.yoc')}</span><span class="v num">{dy.yoc == null ? '—' : dy.yoc.toFixed(2)}%</span></div>
              <div class="stat" title={t('folio.nisaSavedTip')}><span class="k">{t('folio.nisaSaved')}</span><span class="v num">¥{yenFull(dsum.nisaSaved)}</span></div>
              <div class="stat"><span class="k">{t('folio.received')}</span><span class="v num">{received ? `¥${yenFull(received)}` : '—'}</span></div>
              <div class="stat"><span class="k">{t('folio.raisedCut')}</span><span class="v num"><span class="up">{dsum.raised}</span> · <span class="down">{dsum.cut}</span></span></div>
              <div class="stat"><span class="k">{t('folio.top3')}</span><span class="v num">{(dsum.top3 * 100).toFixed(0)}%</span></div>
            </div>
            {#if app.settings.divGoal}
              <div class="goal"><span>{t('folio.goal', { v: manYen(app.settings.divGoal) })}</span><span class="track"><i style:width={`${Math.min(100, (dsum.perMonth / app.settings.divGoal) * 100)}%`}></i></span><span class="num">{((dsum.perMonth / app.settings.divGoal) * 100).toFixed(0)}%</span></div>
            {/if}
          {/if}
        </section>
        <section class="card c-dwf" data-card="dwf">
          <h3>{t('folio.dwf')}<span class="right mute small">{t('folio.dwfNote')}</span></h3>
          {#if dsum}<Waterfall steps={divBridgeSteps(dsum)} label={(k) => t(`folio.dwf.${k}` as Key)} minH={170} />{/if}
          <div class="note">{t('folio.dwfDef')}</div>
        </section>
        <section class="card c-dtab" class:focus={card === 'dtab'} data-card="dtab">
          <h3>{dGroup === 'code' ? t('folio.dtabCode') : t('folio.dtabGroup', { g: t(`folio.dg.${dGroup}` as Key) })}<span class="right"><Seg items={DIV_GROUPS.map((g) => t(`folio.dg.${g}` as Key))} on={view.dgroup} label={segLabel('folio.k.group')} onpick={(i) => applyView({ ...view, dgroup: i })} /></span></h3>
          <DivTable
            rows={tRows}
            group={dGroup}
            sort={view.dsort}
            sel={drow}
            focused={card === 'dtab'}
            {brushed}
            label={groupLabel}
            onpick={(i) => pick('dtab', i)}
            onsort={(i) => applyView({ ...view, dsort: i })}
            ontoggle={(i) => {
              card = 'dtab'
              const r = toggleOpen(tRows, i, open, undefined, dGroup)
              open = r.open
              drow = r.sel
              remember()
            }}
          />
          <div class="keys" class:off={card !== 'dtab'} aria-hidden={card !== 'dtab'}>{#each [kk('G', 'folio.k.group'), kk('S', 'folio.k.sort'), kk('→ ←', 'folio.k.open'), kk('↑ ↓ PgUp PgDn Home End', 'folio.k.row'), kk('Enter', 'folio.k.chart')] as x (x.k)}<span><kbd>{x.k}</kbd> {x.s}</span>{/each}</div>
        </section>
      </div>
    </section>
  {/if}
</div>

<style>
.sub {
  margin-left: 4px;
}
.asof {
  margin-left: auto;
  white-space: nowrap;
}
.nav {
  display: inline-flex;
  gap: 2px;
  margin-left: 12px;
}
.nav button {
  background: none;
  border: 0;
  padding: 0 8px;
  line-height: 18px;
  color: var(--text-3);
  border-radius: var(--radius);
  cursor: pointer;
  font: inherit;
  display: inline-flex;
  gap: 6px;
  align-items: center;
  white-space: nowrap;
}
.nav button.on {
  color: var(--text);
  background: var(--panel-3);
  box-shadow: inset 0 -2px 0 var(--focus);
}
.folio {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: auto;
  container-type: inline-size;
  background: var(--bg);
}
.grid,
.dgrid {
  display: grid;
  gap: 6px;
  padding: 6px;
  grid-template-columns: 1fr;
}
.grid {
  grid-template-areas: 'hero' 'hist' 'alloc' 'contrib' 'div' 'events';
}
.dgrid {
  padding-top: 0;
  grid-template-areas: 'dshare' 'dsum' 'dwf' 'dtab';
}
@container (min-width: 760px) {
  .grid {
    grid-template-columns: repeat(6, 1fr);
    grid-template-areas: 'hero hero hist hist hist hist' 'alloc alloc alloc alloc contrib contrib' 'div div div events events events';
  }
  .dgrid {
    grid-template-columns: repeat(6, 1fr);
    grid-template-areas: 'dshare dshare dshare dsum dsum dsum' 'dwf dwf dwf dwf dwf dwf' 'dtab dtab dtab dtab dtab dtab';
  }
}
@container (min-width: 1180px) {
  .grid {
    min-height: 100%;
    grid-template-columns: repeat(12, 1fr);
    grid-template-rows: minmax(300px, 1.2fr) minmax(220px, 1fr) auto;
    grid-template-areas:
      'hero hero hero hist hist hist hist hist hist hist hist hist'
      'alloc alloc alloc alloc alloc contrib contrib contrib div div div div'
      'events events events events events events events events events events events events';
  }
  .dgrid {
    grid-template-columns: repeat(12, 1fr);
    grid-template-rows: 360px 440px;
    grid-template-areas: 'dshare dshare dshare dshare dsum dsum dsum dsum dwf dwf dwf dwf' 'dtab dtab dtab dtab dtab dtab dtab dtab dtab dtab dtab dtab';
  }
}
.c-hero {
  grid-area: hero;
}
.c-hist {
  grid-area: hist;
}
.c-alloc {
  grid-area: alloc;
}
.c-contrib {
  grid-area: contrib;
}
.c-div {
  grid-area: div;
}
.c-events {
  grid-area: events;
}
.c-dshare {
  grid-area: dshare;
}
.c-dsum {
  grid-area: dsum;
}
.c-dwf {
  grid-area: dwf;
}
.c-dtab {
  grid-area: dtab;
}
.card {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 10px 12px;
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.card.focus {
  border-color: var(--focus);
}
.card h3 {
  margin: 0;
  font-size: var(--fs-2);
  font-weight: 500;
  color: var(--text-2);
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 20px;
}
.right {
  margin-left: auto;
  display: flex;
  gap: 6px;
  align-items: center;
}
.small {
  font-size: var(--fs-1);
  font-weight: 400;
}
.chip {
  font-size: var(--fs-1);
  padding: 0 7px;
  border-radius: 9px;
  border: 1px solid var(--line-strong);
  color: var(--text-3);
  white-space: nowrap;
  font-weight: 400;
}
.chip.warn {
  color: var(--warn);
  border-color: color-mix(in srgb, var(--warn) 50%, transparent);
}
.crossday {
  font-size: var(--fs-1);
  color: var(--focus);
  border: 1px solid color-mix(in srgb, var(--focus) 50%, transparent);
  border-radius: var(--radius);
  padding: 0 6px;
  white-space: nowrap;
  font-weight: 400;
}
.keys {
  display: flex;
  gap: 8px;
  font-size: var(--fs-1);
  color: var(--text-3);
  flex-wrap: wrap;
}
/* 選んでいないカードの案内は見えなくするだけにする（出し入れするとカードの高さが変わり、ツリーマップが並び直す） */
.keys.off {
  visibility: hidden;
}
.mute {
  color: var(--text-3);
}
.txt2 {
  color: var(--text-2);
}
.up {
  color: var(--up);
}
.down {
  color: var(--down);
}
.flat {
  color: var(--flat);
}
.gold {
  color: var(--gold);
}
.note {
  font-size: var(--fs-1);
  color: var(--text-3);
}
/* 評価額 */
.c-hero {
  gap: 6px;
}
.c-hero::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(110% 80% at 0% 0%, color-mix(in srgb, var(--tone) 13%, transparent), transparent 62%);
}
:global(:root[data-theme='light']) .c-hero::before {
  display: none;
}
.hero-value {
  font-family: var(--mono);
  font-size: clamp(28px, 6cqi, 42px);
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.05;
}
@container (min-width: 1180px) {
  .hero-value {
    font-size: clamp(30px, 2.7cqi, 42px);
  }
}
.hero-sub {
  display: flex;
  gap: 2px 12px;
  flex-wrap: wrap;
  font-size: var(--fs-2);
  color: var(--text-2);
  align-items: baseline;
}
.brief {
  font-size: var(--fs-2);
  color: var(--text-2);
  line-height: 1.6;
  border-left: 2px solid var(--line-strong);
  padding-left: 8px;
}
.stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.stat {
  padding: 4px 0;
  border-top: 1px solid var(--line-soft);
  display: flex;
  flex-direction: column;
  font-size: var(--fs-1);
  min-width: 0;
}
.stat:nth-child(odd) {
  padding-right: 12px;
}
.stat:nth-child(even) {
  padding-left: 12px;
  border-left: 1px solid var(--line-soft);
}
.stat .k {
  color: var(--text-3);
  white-space: nowrap;
}
.stat .v {
  font-weight: 500;
  font-size: var(--fs-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.stats.row .stat {
  flex-direction: row;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  font-size: var(--fs-2);
}
/* 横に並べるときは、値を切らずにラベルの側を省略する */
.stats.row .stat .k {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.stats.row .stat .v {
  flex: none;
  overflow: visible;
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 12px;
  font-size: var(--fs-1);
  color: var(--text-2);
}
.legend span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
}
.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  display: inline-block;
  flex: none;
}
.dot.dash {
  border: 1px dashed var(--text-3);
}
.dot.ring {
  border: 1px solid var(--text-3);
}
.dot.thin {
  width: 4px;
  border-radius: 1px;
  background: var(--text-3);
  opacity: 0.55;
}
.nisa {
  font-size: var(--fs-1);
  color: var(--text-3);
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 8px;
  align-items: center;
}
.nisa .track,
.goal .track {
  height: 4px;
  background: var(--panel-3);
  border-radius: 2px;
  overflow: hidden;
}
.nisa .track i {
  display: block;
  height: 100%;
  background: var(--text-3);
}
/* 資産推移 */
.hist-tools {
  display: flex;
  justify-content: flex-end;
  margin-top: -4px;
}
.toggle {
  font: inherit;
  font-size: var(--fs-1);
  color: var(--text-3);
  background: none;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 0 6px;
  line-height: 16px;
  cursor: pointer;
  display: inline-flex;
  gap: 4px;
  align-items: center;
}
.toggle:hover {
  color: var(--text-2);
}
.toggle.on {
  color: var(--text);
  border-color: var(--focus);
}
.histhead {
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
  font-size: var(--fs-2);
}
.big {
  font-size: var(--fs-5);
  font-weight: 600;
}
.wfbox {
  height: 78px;
  flex: none;
  display: flex;
}
.wfbox .note {
  align-self: center;
}
/* 資産構成 */
.conc {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  font-size: var(--fs-1);
  color: var(--text-3);
  align-items: baseline;
}
.conc b {
  color: var(--text);
  font-weight: 600;
  font-size: var(--fs-3);
  margin-left: 4px;
}
/* 損益寄与 */
.csum {
  display: flex;
  gap: 12px;
  align-items: baseline;
  font-size: var(--fs-1);
  color: var(--text-3);
  flex-wrap: wrap;
}
.csum b {
  font-size: var(--fs-3);
  font-weight: 600;
}
.contrib {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
}
@container (max-width: 1179px) {
  .contrib {
    min-height: 220px;
  }
  /* 1 列・6 列では行の高さが中身で決まるので、表とドーナツに高さを持たせる */
  .c-dtab {
    min-height: 420px;
  }
  .c-dwf {
    min-height: 260px;
  }
}
.crow {
  flex: none;
  display: grid;
  grid-template-columns: minmax(64px, 1.2fr) 1.6fr minmax(52px, auto);
  align-items: center;
  gap: 8px;
  font-size: var(--fs-1);
  height: 20px;
  padding: 0 4px;
  border-radius: var(--radius);
}
.crow,
.ev {
  cursor: pointer;
}
.crow:hover,
.ev:hover {
  background: var(--hover);
}
.crow.sel {
  background: var(--panel-3);
}
.crow.dim {
  opacity: 0.45;
}
.crow.sold .nm {
  color: var(--text-3);
}
.crow .nm {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-2);
}
.track {
  position: relative;
  height: 8px;
}
.track::before {
  content: '';
  position: absolute;
  left: 50%;
  top: -5px;
  bottom: -5px;
  width: 1px;
  background: var(--line-strong);
}
.b {
  position: absolute;
  top: 0;
  height: 100%;
  border-radius: 1px;
}
.upb {
  background: var(--up);
}
.downb {
  background: var(--down);
}
.goldb {
  background: var(--gold);
}
.val {
  text-align: right;
}
.zero {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-0);
  color: var(--text-3);
  margin: 1px 4px;
}
.zero::before,
.zero::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--line);
}
.tag {
  margin-left: 4px;
  font-size: var(--fs-0);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  padding: 0 3px;
  color: var(--text-3);
}
/* 配当見込み */
.divkpi {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px 12px;
}
.divkpi .k {
  font-size: var(--fs-1);
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.divkpi .v {
  font-size: var(--fs-3);
  font-weight: 600;
  white-space: nowrap;
}
/* 予定 */
.tl {
  position: relative;
  height: 30px;
  flex: none;
  margin: 0 8px;
}
.axis {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 12px;
  height: 1px;
  background: var(--line-strong);
}
.tick {
  position: absolute;
  bottom: 0;
  transform: translateX(-50%);
  font-size: 10px;
  color: var(--text-3);
}
.tick em {
  font-style: normal;
  white-space: nowrap;
}
.mark {
  position: absolute;
  width: 8px;
  height: 8px;
  transform: translate(-50%, 50%);
}
.mark.rights {
  background: var(--gold);
  transform: translate(-50%, 50%) rotate(45deg);
}
.mark.earnings {
  background: var(--text-3);
}
.mark.alert {
  border: 1.5px solid var(--text);
  border-radius: 50%;
  background: var(--panel);
}
.mark.sel {
  outline: 2px solid var(--focus);
}
.mark.dim {
  opacity: 0.35;
}
.events {
  display: flex;
  gap: 6px;
  overflow-x: auto;
}
@container (max-width: 1179px) {
  .events {
    flex-direction: column;
    overflow: visible;
  }
  .ev {
    flex: none !important;
  }
}
.ev {
  flex: 1 0 190px;
  display: grid;
  grid-template-columns: auto auto;
  column-gap: 8px;
  padding: 4px 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  font-size: var(--fs-2);
}
.ev.sel {
  border-color: var(--focus);
}
.ev.dim {
  opacity: 0.45;
}
.ev .d {
  color: var(--text-3);
  font-size: var(--fs-1);
}
.ev .t {
  font-size: var(--fs-1);
  justify-self: end;
  color: var(--text-2);
}
.ev .t.rights {
  color: var(--gold);
}
.ev .t.rights::before {
  content: '◆ ';
}
.ev .t.earnings::before {
  content: '■ ';
  color: var(--text-3);
}
.ev .t.alert::before {
  content: '○ ';
}
.ev .n {
  grid-column: span 2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ev .x {
  grid-column: span 2;
  font-size: var(--fs-1);
  color: var(--text-2);
}
/* 配当の分析 */
.dsec > h2 {
  margin: 10px 8px 6px;
  font-size: var(--fs-3);
  font-weight: 600;
  display: flex;
  align-items: baseline;
  gap: 4px 10px;
  flex-wrap: wrap;
}
.dsec > h2 .mute {
  font-size: var(--fs-1);
  font-weight: 400;
}
.dbig {
  font-family: var(--mono);
  font-size: clamp(24px, 4.5cqi, 32px);
  font-weight: 600;
  line-height: 1.1;
  letter-spacing: -0.02em;
}
@container (min-width: 1180px) {
  .dbig {
    font-size: 32px;
  }
}
.trend {
  position: relative;
  height: 70px;
  flex: none;
}
.trend svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.tarea {
  fill: color-mix(in srgb, var(--gold) 18%, transparent);
}
.tline {
  fill: none;
  stroke: var(--gold);
  stroke-width: 1.5;
}
.tl {
  font-size: 10px;
  fill: var(--text-2);
  font-family: var(--mono);
}
.goal {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 8px;
  align-items: center;
  font-size: var(--fs-1);
  color: var(--text-3);
}
.goal .track i {
  display: block;
  height: 100%;
  background: var(--gold);
}
/* 読み込み中・保有なし */
.sk {
  background: linear-gradient(90deg, var(--panel-2), var(--panel-3), var(--panel-2));
  background-size: 200% 100%;
  animation: sk 1.2s linear infinite;
  border-radius: var(--radius);
  height: 12px;
}
.sk.w28 {
  width: 28%;
}
.sk.w45 {
  width: 45%;
}
.sk.fill {
  flex: 1;
  min-height: 40px;
}
@keyframes sk {
  to {
    background-position: -200% 0;
  }
}
:global(:root[data-reduce-motion='true']) .sk {
  animation: none;
}
.empty {
  height: 100%;
  display: grid;
  place-items: center;
  text-align: center;
  color: var(--text-2);
  font-size: var(--fs-3);
  line-height: 1.8;
  padding: 24px;
}
.empty b {
  display: block;
  font-size: var(--fs-4);
  color: var(--text);
  margin-bottom: 6px;
}
</style>
