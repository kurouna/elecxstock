<script lang="ts">
// 銘柄情報（FR-I1〜I4・I6〜I9, H3, V12）。docs/mock/info.html の見直し案。
// 上から: 見出し（市場・業種・リスト・分割・基準日）→ 値段の欄（値段・前日比・52 週の位置・当日の値・保有）→ 主な数字
// （実績利回り・PER・PBR・時価総額。業種の中央値と比べる）→ 予定（次の決算発表・権利付最終日）→ 配当 → 値動き・保有・アラート。
// 枠の幅で並びを変える（container queries）: 〜699px は 1 列、700〜1039px は左に値段・予定・数字・右に配当、1040px〜は
// 1 段目に値段と数字、2 段目に配当と値動きなど。配当のグラフは ← → で棒を選び、Y で年ごとと回ごとを切り替える。
// 配当込みの騰落率・最大下落率・利回りの範囲・業種の中央値・決算発表は、表示中の銘柄だけ Core がその場で計算する（info.extra）
import { yahooQuoteUrl } from '@shared/attribution'
import { jstNow } from '@shared/calendar'
import type { Dividend, InfoExtra } from '@shared/types'
import { onMount } from 'svelte'
import { condsText, distanceText } from '../../lib/alertText'
import { changeSymbol } from '../../lib/chartMenu'
import { keyOf } from '../../lib/commands'
import { annualDividends, eventYoy, nextRightsDates, recordDayOf, yearsThatFit } from '../../lib/dividends'
import { chgDigits, cls, date, fmt, money, px, retCls, retText, sgn } from '../../lib/format'
import type { Key } from '../../lib/i18n'
import { registerPane } from '../../lib/panes'
import { accountName, valuation } from '../../lib/portfolio'
import { secret } from '../../lib/privacy.svelte'
import {
  app,
  bridge,
  codeOf,
  ensureMetrics,
  inst,
  isFav,
  listName,
  metric,
  nameOf,
  rpc,
  t,
  toast,
  toggleFav,
} from '../../stores/app.svelte'
import { type PaneNode, paneSymbol, patchState } from '../../stores/layout.svelte'
import Icon from '../Icon.svelte'
import PaneHeader from '../PaneHeader.svelte'

let { pane }: { pane: PaneNode } = $props()
const id = $derived(paneSymbol(pane) ?? 'JP:7203')
const m = $derived(metric(id))
const ins = $derived(inst(id))
/** この銘柄の Yahoo Finance のページ（FR-I10。指数は無し） */
const quoteUrl = $derived(ins ? yahooQuoteUrl(app.settings.lang, ins.code, ins.kind) : null)
const openQuote = () => {
  if (quoteUrl) void window.elecxstock.openExternal(quoteUrl).catch(() => {})
}
const ja = $derived(app.settings.lang === 'ja')
let divs = $state<Dividend[]>([])
let extra = $state<InfoExtra | null>(null)
let plotW = $state(0)
/** 選んでいる棒（-1 は無し）。ポインタとキーで同じものを使う */
let sel = $state(-1)
/** 値段の欄が見えなくなるまでスクロールしたら、見出しに値段を出す */
let scrolled = $state(false)
let scroller = $state<HTMLDivElement>()
let token = 0

// 銘柄が変わったら、選んでいた棒をはずす（別の銘柄の同じ位置の棒を指さないように）
$effect(() => {
  void id
  sel = -1
  // 前の銘柄でスクロールしていたら先頭に戻す（短い内容でスクロールが起きず、見出しの値段が残らないように）
  scrolled = false
  if (scroller) scroller.scrollTop = 0
})
$effect(() => {
  void app.dataVersion
  const my = ++token
  ensureMetrics([id])
  bridge
    .call('dividends.get', { id })
    .then((d) => {
      if (my === token) divs = d
    })
    .catch(() => {
      // 前の銘柄の配当を出したままにしない
      if (my === token) divs = []
    })
  bridge
    .call('info.extra', { id })
    .then((x) => {
      if (my === token) extra = x
    })
    .catch(() => {
      if (my === token) extra = null
    })
})

const today = $derived(jstNow().date)
const reit = $derived(ins?.kind === 'reit')
const unitWord = $derived(reit ? t('si.units') : t('si.shares'))
/** 売買単位（株式は 100 株、REIT は 1 口。ETF などは分からないので出さない） */
const lot = $derived(ins?.kind === 'reit' ? 1 : ins?.kind === 'stock' ? 100 : null)
const yen = (v: number | null | undefined) => {
  const x = money(v)
  return { n: x.n, u: ja && x.n !== '—' ? `${x.u}円` : x.u }
}
/** 予定まで: 今日なら「今日」、それ以外は「あと N 日」 */
const leftText = (d: string) => (daysTo(d) === 0 ? t('si.today') : t('si.daysLeft', { n: daysTo(d) }))
const daysTo = (d: string) => Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000)

// ---------------- 配当のグラフ
const mode = $derived((pane.state.divMode as 'year' | 'event' | undefined) ?? 'year')
const asOf = $derived(m?.asOf ?? today)
const fit = $derived(yearsThatFit(plotW))
const allYears = $derived(annualDividends(divs, asOf))
const years = $derived(allYears.slice(-fit))
const events = $derived(divs.slice(-fit))
type Bar = { key: string; v: number; label: string; partial: boolean; cut: boolean; latest: boolean }
/** 年の札: 棒が 34px 以上なら 4 桁、狭ければ '26 */
const wide = $derived(plotW / Math.max(1, mode === 'year' ? years.length : events.length) >= 34)
const bars = $derived.by((): Bar[] => {
  if (mode === 'year') {
    const lastFull = years.findLastIndex((y) => !y.partial)
    return years.map((y, i) => ({
      key: String(y.year),
      v: y.total,
      label: wide ? String(y.year) : `'${String(y.year).slice(2)}`,
      partial: y.partial,
      cut: y.cut,
      latest: i === lastFull,
    }))
  }
  return events.map((d, i) => ({
    key: d.date,
    v: d.amount,
    label: i === 0 || d.date.slice(0, 4) !== events[i - 1]!.date.slice(0, 4) ? (wide ? d.date.slice(0, 4) : `'${d.date.slice(2, 4)}`) : '',
    partial: false,
    cut: false,
    latest: i === events.length - 1,
  }))
})
const maxV = $derived(Math.max(0, ...bars.map((b) => b.v)))
const maxAt = $derived(bars.findIndex((b) => b.v === maxV))
// 棒の上の金額: 1 本 40px 以上あれば全部、狭ければ最新・最大・選んだ棒だけ
const showAll = $derived(bars.length > 0 && plotW / bars.length >= 40)
$effect(() => {
  if (sel >= bars.length) sel = bars.length - 1
})
function setMode(next: 'year' | 'event') {
  patchState(pane, { divMode: next })
  sel = -1
}
/** 1 株あたりの金額（整数なら小数を付けない） */
const amt = (v: number | null | undefined) => (v == null ? '—' : fmt(v, Number.isInteger(Math.round(v * 10) / 10) ? 0 : 1))
const summary = $derived.by(() => {
  const a = allYears.filter((y) => !y.partial)
  const last = a.at(-1)
  if (!last) return t('info.divNone')
  return t('info.divSummary', { from: a[0]!.year, to: last.year, v: px(last.total), yoy: last.yoy != null ? sgn(last.yoy, 1, '%') : '—' })
})
// 5 年の増配率はスクリーナーと同じ値（記録の最初の年が年の途中なら使わない。metrics.divCagr5）
const cagr = $derived(m?.divCagr5 ?? null)
/**
 * 連続増配・非減配の年数が、配当の記録の長さで頭打ちか（「以上」と書く）。記録（月次の系列で約 10 年）の最初の年まで
 * 続いているときだけ。記録の最初の年は年の途中かもしれないので、指標（metrics.divYears）と同じくその次の年から数える
 */
const capOf = (years: number | null | undefined) => {
  const first = divs[0]?.date
  if (years == null || !first || first > `${Number(asOf.slice(0, 4)) - 9}-12-31`) return false
  const from = Number(first.slice(0, 4)) + (first.slice(5) <= '01-10' ? 0 : 1)
  const max = Number(asOf.slice(0, 4)) - 1 - from
  return max > 0 && years >= max
}
const upCapped = $derived(capOf(m?.divUpYears))
const noCutCapped = $derived(capOf(m?.divNoCutYears))
// 権利確定日は過去の権利落ち日から推定する（月末か、20 日などの日付）
const rights = $derived(nextRightsDates(m?.recordMonths ?? [], today, 2, recordDayOf(divs)))
const monthName = (x: number) => (ja ? `${x}月` : new Date(2026, x - 1, 1).toLocaleString('en', { month: 'short' }))

// ---------------- 値段・52 週
const pos = (v: number | null | undefined, a: number | null | undefined, b: number | null | undefined) =>
  v == null || a == null || b == null || b <= a ? null : Math.max(0, Math.min(100, ((v - a) / (b - a)) * 100))
const mas = $derived(
  [
    { n: 25, v: m?.ma25, color: 'var(--ma1)' },
    { n: 75, v: m?.ma75, color: 'var(--ma2)' },
    { n: 200, v: m?.ma200, color: 'var(--ma3)' },
  ].map((x) => ({ ...x, dev: x.v && m?.close != null ? (m.close / x.v - 1) * 100 : null })),
)
const shareCount = (v: number | null | undefined) => {
  if (v == null) return '—'
  if (!ja) return fmt(v, 0)
  return v >= 1e4 ? `${fmt(v / 1e4, v >= 1e6 ? 0 : 1)}万` : fmt(v, 0)
}

// ---------------- 保有（口座区分をまたいで合計。評価は最新の終値）
const held = $derived.by(() => {
  const code = id.replace(/^\w+:/, '')
  const hs = app.holdings.filter((h) => h.code === code && h.quantity > 0)
  if (!hs.length) return null
  let qty = 0
  let cost = 0
  let value = 0
  for (const h of hs) {
    const v = valuation(h)
    qty += h.quantity
    cost += v.cost
    value += v.value ?? v.cost
  }
  const avg = qty ? cost / qty : 0
  return {
    qty,
    avg,
    value,
    pnl: value - cost,
    pnlPct: cost > 0 ? (value / cost - 1) * 100 : null,
    yoc: m?.div12 != null && avg > 0 ? (m.div12 / avg) * 100 : null,
    annual: m?.div12 != null ? qty * m.div12 : null,
    accounts: hs.map((h) => accountName(h.account)).join(' · '),
  }
})

// ---------------- 業種の中央値・リスト・アラート
const vsSector = (v: number | null | undefined, med: number | null | undefined) =>
  v == null || med == null || !(med > 0) ? null : (v / med - 1) * 100
const lists = $derived(app.watchlists.filter((w) => w.builtin !== 'favorites' && w.items.includes(id)))
const alerts = $derived(app.alerts.filter((a) => a.target.kind === 'symbol' && a.target.id === id))
const mc = $derived(yen(m?.marketCap))
const tv = $derived(yen(m?.turnover20))
const minInvest = $derived(lot && m?.close != null ? yen(m.close * lot) : null)
const note = $derived(
  [t('info.trailingNote', { date: date(m?.asOf) }), t('si.noteSector'), t('si.noteRights'), t('si.noteEarnings'), t('si.noteTotal')].join(
    '\n',
  ),
)

onMount(() =>
  registerPane(pane.id, {
    current: () => id,
    key(e) {
      if (e.ctrlKey || e.altKey || e.metaKey) return false
      // ↑ ↓ PageUp PageDown で本文を縦にスクロールする（マウスを使わずに下のカードまで見る。FR-KB4）
      // O でこの銘柄の Yahoo Finance のページをブラウザで開く（FR-I10）
      if (e.code === 'KeyO' && !e.shiftKey && quoteUrl) {
        openQuote()
        return true
      }
      if (scroller && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'PageDown' || e.key === 'PageUp')) {
        const page = Math.max(40, scroller.clientHeight - 40)
        const d = e.key === 'ArrowDown' ? 40 : e.key === 'ArrowUp' ? -40 : e.key === 'PageDown' ? page : -page
        scroller.scrollBy({ top: d, behavior: app.settings.reduceMotion ? 'auto' : 'smooth' })
        return true
      }
      const n = bars.length
      if (!n) return false
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        sel = sel < 0 ? n - 1 : Math.max(0, Math.min(n - 1, sel + (e.key === 'ArrowRight' ? 1 : -1)))
        return true
      }
      if (e.key === 'Home' || e.key === 'End') {
        sel = e.key === 'Home' ? 0 : n - 1
        return true
      }
      if (e.key === 'Escape' && sel >= 0) {
        sel = -1
        return true
      }
      if (e.code === 'KeyY' && !e.shiftKey) {
        setMode(mode === 'year' ? 'event' : 'year')
        return true
      }
      return false
    },
  }),
)
</script>

<PaneHeader {pane}>
  <button type="button" class="star" class:on={isFav(id)} title={`${t('act.fav')} (${keyOf('fav')})`} onclick={() => toggleFav(id)}>★</button>
  <button type="button" class="sym" title={`${t('chart.change')} (C)`} onclick={() => changeSymbol(pane)}><span class="code">{codeOf(id)}</span>{nameOf(id)}</button>
  {#if scrolled}<span class="hp num">{px(m?.close)} <span class={cls(m?.chgPct, 2)}>{sgn(m?.chgPct, 2, '%')}</span></span>{/if}
  <button
    type="button"
    class="ibtn"
    aria-label={t('info.refetch')}
    title={`${t('info.refetchHint')} (${keyOf('refetch')})`}
    onclick={() =>
      rpc('jobs.refetch', { ids: [id] })
        .then(() => toast(t('refetch.started', { n: 1 })))
        .catch(() => {})}><Icon name="refresh" /></button>
  <button type="button" class="ibtn" aria-label={t('common.about')} title={note}><Icon name="info" /></button>
  {#if quoteUrl}<button type="button" class="ibtn" aria-label={t('info.openYahoo')} title={`${t('info.openYahoo')} (O)`} onclick={openQuote}><Icon name="external" /></button>{/if}
</PaneHeader>
<div class="scroll" bind:this={scroller} onscroll={(e) => (scrolled = e.currentTarget.scrollTop > 90)}>
  <div class="si">
    <div class="meta">
      <span>{ins ? t(`mkt.${ins.market}` as Key) : ''}{ins?.sectorJa ? ` · ${!ja && ins.sectorEn ? ins.sectorEn : ins.sectorJa}` : ''}</span>
      {#each lists as w (w.id)}<span class="chip">{listName(w)}</span>{/each}
      {#if extra?.split}<span>{t('si.split')} <span class="num">{date(extra.split.date)} {extra.split.ratio >= 1 ? `1:${fmt(extra.split.ratio, extra.split.ratio % 1 ? 2 : 0)}` : `${fmt(1 / extra.split.ratio, 0)}:1`}</span></span>{/if}
      <span class="grow"></span>
      {#if m?.stale && m.asOf}<span class="chip warnc">⚠ {t('si.stale', { date: date(m.asOf) })}</span>{:else if m?.asOf}<span>{t('info.asOf', { date: date(m.asOf) })}{m.provisional ? ` · ${t('chart.provisional')}` : ''}</span>{/if}
    </div>
    {#if m?.gapSuspect || m?.anomaly || ins?.status === 'delisted'}
      <div class="notes">
        {#if m?.gapSuspect}<div class="warn">{t('info.gap')}</div>{/if}
        {#if m?.anomaly}<div class="warn">{t('list.anomalyHint')}</div>{/if}
        {#if ins?.status === 'delisted'}<div class="warn">{t('list.delistedHint')}</div>{/if}
      </div>
    {/if}

    <!-- 値段の欄 -->
    <section class="hero" aria-label={t('si.price')}>
      <div class="top">
        <span class="price num">{px(m?.close)}</span>
        <span class={`chg num ${cls(m?.chg, chgDigits(m?.close))}`}>{sgn(m?.chg, chgDigits(m?.close))} ({sgn(m?.chgPct, 2, '%')})</span>
        {#if m?.fromHi52 != null}<span class="fh">{t('si.fromHi')} <span class="num">{sgn(m.fromHi52, 1, '%')}</span></span>{/if}
      </div>
      {#if m?.hi52 != null && m.lo52 != null}
        <div class="range">
          <div class="lab">
            <span>{t('si.lo52')} <b class="num">{px(m.lo52)}</b> <span class="d num">{date(extra?.lo52d)}</span></span>
            <span>{t('si.hi52')} <b class="num">{px(m.hi52)}</b> <span class="d num">{date(extra?.hi52d)}</span></span>
          </div>
          <div class="bar52">
            <span class="track"></span>
            {#each mas as x (x.n)}{#if pos(x.v, m.lo52, m.hi52) != null}<span class="tick" style:left={`${pos(x.v, m.lo52, m.hi52)}%`} style:background={x.color}></span>{/if}{/each}
            {#if pos(m.close, m.lo52, m.hi52) != null}<span class="me" style:left={`${pos(m.close, m.lo52, m.hi52)}%`}></span>{/if}
          </div>
          <div class="legend">
            {#each mas as x (x.n)}<span><i style:background={x.color}></i>{t('si.fromMa', { n: x.n })} <span class={`num ${cls(x.dev, 1)}`}>{sgn(x.dev, 1, '%')}</span></span>{/each}
          </div>
        </div>
      {/if}
      {#if extra?.day}
        {@const d = extra.day}
        <div class="ohlc num">
          <span><i>{t('si.open')}</i>{px(d.o)}</span><span><i>{t('si.high')}</i>{px(d.h)}</span><span><i>{t('si.low')}</i>{px(d.l)}</span><span><i>{t('si.prev')}</i>{px(d.prev)}</span>
          <span><i>{t('si.volume')}</i>{shareCount(d.v)}<i class="after">{unitWord}{m?.volRatio != null ? `（${t('si.volRatio', { x: fmt(m.volRatio, 2) })}）` : ''}</i></span>
        </div>
      {/if}
      {#if held}
        <div class="heldbar">
          <span>{t('si.held')} <span class="num">{secret(fmt(held.qty, 0))}</span>{unitWord}</span>
          <span>{t('hold.pnl')} <b class={`num ${cls(held.pnl, 0)}`}>{secret(sgn(held.pnl, 0))}{ja ? '円' : ''}</b> <span class={`num ${cls(held.pnlPct, 1)}`}>{sgn(held.pnlPct, 1, '%')}</span></span>
          <span>{t('hold.yoc')} <span class="num">{held.yoc != null ? `${fmt(held.yoc)}%` : '—'}</span></span>
          {#if held.annual != null}<span>{reit ? t('si.annualDivReit') : t('si.annualDiv')} <span class="num">{secret(fmt(held.annual, 0))}</span>{ja ? '円' : ''}</span>{/if}
        </div>
      {/if}
    </section>

    <!-- 主な数字 -->
    <div class="tw">
      <div class="tiles">
        <div class="tile">
          <div class="k">{t('info.trailingYield')}</div>
          <div class="v num">{m?.yieldTrailing != null ? fmt(m.yieldTrailing) : m?.asOf ? t('info.shortHistory') : '—'}{#if m?.yieldTrailing != null}<span class="u">%</span>{/if}</div>
          {#if extra?.sector?.yield != null && m?.yieldTrailing != null}<div class="sub">{t('si.sector')} <span class="num">{fmt(extra.sector.yield, 1)}%</span>（{sgn(vsSector(m.yieldTrailing, extra.sector.yield), 0, '%')}）</div>{/if}
        </div>
        {#if reit}
          <div class="tile" title={t('info.yield2pNote')}>
            <div class="k">{t('si.yield2p')}</div>
            <div class="v num">{fmt(m?.yield2p)}{#if m?.yield2p != null}<span class="u">%</span>{/if}</div>
            <div class="sub">{t('si.yield2pSub')}</div>
          </div>
        {:else}
          <div class="tile">
            <div class="k">PER</div>
            <div class="v num">{fmt(m?.per, 1)}{#if m?.per != null}<span class="u">{t('si.times')}</span>{/if}</div>
            {#if extra?.sector?.per != null && m?.per != null}<div class="sub">{t('si.sector')} <span class="num">{fmt(extra.sector.per, 1)}{t('si.times')}</span>（{sgn(vsSector(m.per, extra.sector.per), 0, '%')}）</div>{/if}
            {#if m?.eps != null}<div class="sub">EPS <span class="num">{px(m.eps)}</span>{ja ? '円' : ''}</div>{/if}
          </div>
        {/if}
        <div class="tile">
          <div class="k">{reit ? t('info.pbrBook') : 'PBR'}</div>
          <div class="v num">{fmt(m?.pbr)}{#if m?.pbr != null}<span class="u">{t('si.times')}</span>{/if}</div>
          {#if extra?.sector?.pbr != null && m?.pbr != null}<div class="sub">{t('si.sector')} <span class="num">{fmt(extra.sector.pbr, 2)}{t('si.times')}</span>（{sgn(vsSector(m.pbr, extra.sector.pbr), 0, '%')}）</div>{/if}
          {#if m?.bps != null}<div class="sub">BPS <span class="num">{px(m.bps)}</span>{ja ? '円' : ''}</div>{/if}
        </div>
        <div class="tile">
          <div class="k">{t('info.mcap')}</div>
          <div class="v num">{mc.n}<span class="u">{mc.u}</span></div>
          <div class="sub" title={t('info.turnoverNote')}>{t('si.turnover')} <span class="num">{tv.n}{tv.u}</span></div>
          {#if minInvest}<div class="sub">{t('si.minInvest')} <span class="num">{minInvest.n}{minInvest.u}</span></div>{/if}
        </div>
      </div>
    </div>

    <!-- 予定（次の 1 回だけ） -->
    {#if extra?.earnings?.next || rights[0]}
      <div class="ev">
        {#if extra?.earnings?.next}
          <span class="e">{t('si.earnings')} <b class="num">{date(extra.earnings.next)}</b> {extra.earnings.estimate ? t('si.estimated') : t('si.planned')} <span class="left" class:now={daysTo(extra.earnings.next) === 0}>{leftText(extra.earnings.next)}</span></span>
        {/if}
        {#if rights[0]}
          <span class="e">{t('si.lastCum')} <b class="num">{date(rights[0].lastCum)}</b> {t('si.approx')} <span class="left" class:now={daysTo(rights[0].lastCum) === 0}>{leftText(rights[0].lastCum)}</span></span>
        {/if}
      </div>
    {/if}

    <!-- 配当 -->
    <section class="card c-div">
      <h5>{reit ? t('si.divReit') : t('si.div')}<span class="grow"></span><span class="muted">{reit ? t('info.perUnit') : t('info.perShare')}</span></h5>
      <div class="stats">
        <div class="stat"><div class="k">{t('si.div12')}</div><div class="v num">{amt(m?.div12)}{#if m?.div12 != null && ja}<span class="u">円</span>{/if}</div></div>
        {#if cagr != null}<div class="stat" title={t('si.cagrNote')}><div class="k">{t('si.cagr')}</div><div class="v num">{sgn(cagr, 1, '%')}<span class="u">{t('si.perYear')}</span></div></div>{/if}
        <div class="stat" title={t('info.streakNote')}>
          <div class="k">{t('info.streak')}</div>
          <div class="v num">{#if m?.divUpYears != null}{m.divUpYears}<span class="u">{upCapped ? t('si.yearsMore') : t('si.yearsUnit')}</span> / {m.divNoCutYears ?? 0}<span class="u">{noCutCapped ? t('si.yearsMore') : t('si.yearsUnit')}</span>{:else}—{/if}</div>
        </div>
        {#if m?.payout != null}
          <div class="stat">
            <div class="k">{t('info.payout')}</div>
            <div class="v num">{fmt(m.payout, 0)}<span class="u">%</span></div>
            <div class="meter" class:hot={m.payout > 80}><i style:width={`${Math.min(100, m.payout)}%`}></i></div>
          </div>
        {/if}
      </div>
      {#if extra?.yieldRange && m?.yieldTrailing != null}
        {@const r = extra.yieldRange}
        {@const p = pos(m.yieldTrailing, r.lo, r.hi) ?? 50}
        <div class="yr">
          <div class="lab"><span>{t('si.yRange', { n: r.years })} <b class="num">{fmt(r.lo, 1)}%</b></span><span><b class="num">{fmt(r.hi, 1)}%</b></span></div>
          <div class="ybar"><span class="track"></span><span class="me" style:left={`${p}%`}></span></div>
          <div class="cap">{t(p >= 66 ? 'si.yHigh' : p <= 33 ? 'si.yLow' : 'si.yMid', { v: `${fmt(m.yieldTrailing)}%`, n: r.years })}</div>
        </div>
      {/if}
      {#if m?.recordMonths.length}
        <div class="rec">{t('info.recordMonths')} <b>{m.recordMonths.map(monthName).join('・')}</b>{#if rights.length}　{t('si.lastCum')} <span class="num">{rights.map((r) => date(r.lastCum)).join('、')}</span>（{t('si.approx')}）{/if}</div>
      {/if}
      <div class="dchart">
        <div class="dtop">
          <span>{mode === 'year' ? t('si.byYearTotal') : t('si.byEventList')}</span>
          <span class="grow"></span>
          <span class="seg" role="group" aria-label={t('info.divMode')} title={`${t('info.divMode')} (Y)`}>
            <button type="button" aria-pressed={mode === 'year'} onclick={() => setMode('year')}>{t('info.byYear')}</button>
            <button type="button" aria-pressed={mode === 'event'} onclick={() => setMode('event')}>{t('info.byEvent')}</button>
          </span>
        </div>
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="plot" role="img" aria-label={summary} bind:clientWidth={plotW} onmouseleave={() => (sel = -1)}>
          {#if !bars.length}<div class="none muted">{t('info.divNone')}</div>{/if}
          <div class="row">
            {#each bars as b, i (b.key)}
              {@const h = maxV ? (b.v / maxV) * 100 : 0}
              <div class="b" class:on={sel === i} onmouseenter={() => (sel = i)}>
                <div class="col">
                  <i class:latest={b.latest} class:partial={b.partial} class:cut={b.cut} style:height={`${h * 0.86}%`}></i>
                  <span class="bv num" class:show={showAll || b.latest || i === maxAt || sel === i} style:bottom={`calc(${h * 0.86}% + 1px)`}>{amt(b.v)}</span>
                  {#if sel === i}
                    <div class="tip" aria-live="polite" class:right={i > bars.length / 2}>
                      {#if mode === 'year'}
                        {@const y = years[i]!}
                        <div>{t('info.yearOf', { y: y.year })}{y.partial ? ` · ${t('info.partialYear', { n: y.count })}` : ` · ${t('info.times', { n: y.count })}`}</div>
                        <div>{reit ? t('info.perUnit') : t('info.perShare')} <b class="num">{amt(y.total)}</b></div>
                        {#if y.yoy != null}<div>{t('info.yoyYear')} <b class={y.cut ? 'num cutc' : 'num'}>{sgn(y.yoy, 1, '%')}</b></div>{/if}
                      {:else}
                        {@const d = events[i]!}
                        {@const yy = eventYoy(divs, divs.length - events.length + i)}
                        <div>{t('info.exDate')} <b class="num">{date(d.date)}</b></div>
                        <div>{reit ? t('info.perUnit') : t('info.perShare')} <b class="num">{amt(b.v)}</b></div>
                        {#if yy != null}<div>{t('info.yoy')} <b class="num">{sgn(yy, 1, '%')}</b></div>{/if}
                      {/if}
                    </div>
                  {/if}
                </div>
                <span class="y num">{b.label}{#if b.cut}<span class="cutmark">▼</span>{/if}</span>
              </div>
            {/each}
          </div>
        </div>
        <div class="dfoot">{t('si.barHint')}</div>
      </div>
    </section>

    <div class="cw">
      <div class="cards" class:noheld={!held}>
        <!-- 値動き: 値段と配当込みの騰落率を同じ表で -->
        <section class="card c-tech">
          <h5>{t('si.price')}<span class="grow"></span><span class="muted" title={t('info.crossNote')}>RSI(14) <span class="num">{fmt(m?.rsi14, 1)}</span> · {m?.gcDays != null && (m.dcDays == null || m.gcDays <= m.dcDays) ? t('info.gcAgo', { n: m.gcDays }) : m?.dcDays != null ? t('info.dcAgo', { n: m.dcDays }) : '—'}</span></h5>
          <table class="rt">
            <thead><tr><th></th><th>{t('si.m1')}</th><th>{t('si.m3')}</th><th>{t('si.y1')}</th><th>{t('si.y3')}</th><th>{t('si.y5')}</th></tr></thead>
            <tbody>
              <tr>
                <td>{t('si.rowPrice')}</td>
                {#each [m?.ret1m, m?.ret3m, m?.ret1y, m?.ret3y, extra?.ret5y] as v, i (i)}<td class={v == null ? 'na' : retCls(v)}>{retText(v)}</td>{/each}
              </tr>
              <tr title={t('si.noteTotal')}>
                <td>{t('si.rowTotal')}</td>
                <td class="na"></td><td class="na"></td>
                {#each [extra?.tr.y1, extra?.tr.y3, extra?.tr.y5] as v, i (i)}<td class={v == null ? 'na' : retCls(v)}>{retText(v)}</td>{/each}
              </tr>
            </tbody>
          </table>
          {#if extra?.mdd}
            <div class="kv"><span>{t('si.mdd', { n: extra.mdd.years })}</span><span><span class="down">{sgn(extra.mdd.pct, 1, '%')}</span> <span class="u">{date(extra.mdd.from).slice(0, 7)}〜{date(extra.mdd.to).slice(0, 7)}</span></span></div>
          {/if}
        </section>
        {#if held}
          <section class="card c-held held">
            <h5>{t('info.gHeld')}<span class="grow"></span><span class="muted accts">{held.accounts}</span></h5>
            <div class="pnl"><span class={`v num ${cls(held.pnl, 0)}`}>{secret(sgn(held.pnl, 0))}<span class="u">{ja ? '円' : ''}</span></span><span class={`num ${cls(held.pnlPct, 1)}`}>{sgn(held.pnlPct, 1, '%')}</span></div>
            <div class="kv"><span>{t('hold.qty')}</span><span>{secret(fmt(held.qty, 0))}<span class="u">{unitWord}</span></span></div>
            <div class="kv"><span>{t('hold.avgShort')}</span><span>{px(held.avg)}<span class="u">{ja ? '円' : ''}</span></span></div>
            <div class="kv"><span>{t('hold.value')}</span><span>{secret(fmt(held.value, 0))}<span class="u">{ja ? '円' : ''}</span></span></div>
            {#if held.annual != null}<div class="kv"><span>{reit ? t('si.annualDivReit') : t('si.annualDiv')}</span><span>{secret(fmt(held.annual, 0))}<span class="u">{ja ? '円' : ''}</span></span></div>{/if}
          </section>
        {/if}
        <section class="card c-al">
          <h5>{t('si.alerts')}<span class="grow"></span><span class="muted">{alerts.length ? t('si.alertsN', { n: alerts.length }) : ''}</span></h5>
          {#each alerts as a (a.id)}
            {@const met = a.enabled && a.state.met && !a.state.invalid}
            <div class="al">
              <span class="st" class:met>{!a.enabled ? `○ ${t('al.st.off')}` : a.state.invalid ? `! ${t('al.st.bad')}` : met ? `◎ ${t('al.st.met')}` : `● ${t('al.st.on')}`}</span>
              <span class="c">{condsText(a.adjusted ?? a.conditions)}</span>
              <span class="d num">{met ? '' : distanceText(a.distance)}</span>
            </div>
          {:else}
            <div class="muted small">{t('si.noAlerts')}</div>
          {/each}
          <div class="hint"><kbd>{keyOf('alertNew')}</kbd> {t('si.alertNew')} · <kbd>{keyOf('alerts')}</kbd> {t('si.alertList')}</div>
        </section>
      </div>
    </div>
  </div>
</div>

<style>
  /* 狭い見出しでも銘柄のコードは見せる（FR-V5）。値段（スクロールしたとき）のほうを先に縮める */
  .sym {
    flex-shrink: 1;
    min-width: 4.5em;
    background: none;
    border: 0;
    padding: 0;
    color: inherit;
    cursor: pointer;
    font-weight: 700;
    font-size: var(--fs-3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .code {
    font-family: var(--mono);
    color: var(--text-2);
    margin-right: 6px;
    font-weight: 500;
  }
  .hp {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    min-width: 0;
    flex-shrink: 2;
  }
  .scroll {
    container: si / inline-size;
  }
  /* 行の間は gap でなく各要素の下の余白で空ける（無い要素の空の行に gap が二重に入らないように） */
  .si {
    padding: var(--s-2) var(--s-3) var(--s-1);
    display: grid;
    row-gap: 0;
    column-gap: var(--s-2);
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: 'meta' 'notes' 'hero' 'tiles' 'ev' 'div' 'cards';
  }
  .si > * {
    margin-bottom: var(--s-2);
  }
  .meta {
    grid-area: meta;
  }
  .notes {
    grid-area: notes;
    font-size: var(--fs-1);
  }
  .hero {
    grid-area: hero;
  }
  .tw {
    grid-area: tiles;
  }
  .ev {
    grid-area: ev;
  }
  .c-div {
    grid-area: div;
  }
  .cw {
    grid-area: cards;
  }
  /* 700〜1039px: 左に値段・予定・数字、右に配当。ほかのカードは下に（横長で低い枠でも配当のグラフまで見える） */
  @container si (min-width: 700px) {
    .si {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      grid-template-rows: auto auto auto auto auto 1fr auto;
      grid-template-areas: 'meta meta' 'notes notes' 'hero div' 'ev div' 'tiles div' '. div' 'cards cards';
      align-items: start;
    }
    .c-div {
      align-self: stretch;
    }
  }
  /* 1040px〜: 1 段目に値段（左）と数字・予定（右）、2 段目に配当（左）と値動きなど（右） */
  @container si (min-width: 1040px) {
    .si {
      grid-template-columns: minmax(0, 500px) minmax(0, 1fr);
      grid-template-rows: auto auto auto auto 1fr auto;
      grid-template-areas: 'meta meta' 'notes notes' 'hero tiles' 'hero ev' 'hero .' 'div cards';
    }
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 8px;
    color: var(--text-3);
    font-size: var(--fs-1);
  }
  .grow {
    flex: 1;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    height: 18px;
    padding: 0 7px;
    border-radius: 9px;
    background: var(--panel-3);
    color: var(--text-2);
    white-space: nowrap;
  }
  .chip.warnc {
    background: color-mix(in srgb, var(--warn) 14%, var(--panel));
    color: var(--warn);
  }
  .warn {
    color: var(--warn);
  }
  .muted {
    color: var(--text-3);
  }
  .small {
    font-size: var(--fs-1);
  }
  /* 値段の欄 */
  .hero,
  .card {
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 6px;
    min-width: 0;
  }
  .hero {
    padding: var(--s-2) var(--s-3);
    display: grid;
    gap: 6px;
  }
  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 12px;
  }
  .price {
    font-size: 28px;
    font-weight: 700;
    line-height: 1.1;
    letter-spacing: -0.02em;
  }
  .chg {
    font-size: var(--fs-4);
    font-weight: 600;
  }
  .fh {
    font-size: var(--fs-1);
    color: var(--text-2);
  }
  .fh .num {
    color: var(--text);
  }
  .lab {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font-size: var(--fs-1);
    color: var(--text-3);
    flex-wrap: wrap;
  }
  .lab b {
    font-weight: 500;
    font-size: var(--fs-2);
    color: var(--text);
  }
  .bar52,
  .ybar {
    position: relative;
    height: 18px;
  }
  .track {
    position: absolute;
    left: 0;
    right: 0;
    top: 7px;
    height: 4px;
    border-radius: 2px;
    background: var(--line-strong);
  }
  .tick {
    position: absolute;
    top: 3px;
    width: 2px;
    height: 12px;
    border-radius: 1px;
    transform: translateX(-1px);
  }
  .me {
    position: absolute;
    top: 1px;
    width: 10px;
    height: 16px;
    transform: translateX(-5px);
    border-radius: 3px;
    background: var(--text);
    box-shadow: 0 0 0 2px var(--panel-2);
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 12px;
    font-size: var(--fs-1);
    color: var(--text-3);
  }
  .legend i {
    display: inline-block;
    width: 8px;
    height: 3px;
    vertical-align: middle;
    margin-right: 4px;
    border-radius: 1px;
  }
  .ohlc {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 14px;
    padding-top: 6px;
    border-top: 1px solid var(--line);
    font-size: var(--fs-2);
    color: var(--text-2);
  }
  .ohlc i {
    font: normal var(--fs-1) var(--font);
    color: var(--text-3);
    margin-right: 4px;
  }
  .ohlc i.after {
    margin: 0 0 0 2px;
  }
  .heldbar {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 14px;
    padding: 6px 8px;
    border-radius: 4px;
    background: var(--panel-3);
    font-size: var(--fs-1);
    color: var(--text-3);
  }
  .heldbar b {
    font-size: var(--fs-3);
  }
  .heldbar .num {
    color: var(--text);
  }
  .heldbar .num.up,
  .heldbar b.up {
    color: var(--up);
  }
  .heldbar .num.down,
  .heldbar b.down {
    color: var(--down);
  }
  /* 主な数字（枠を付けず、区切り線だけ。2×2 か 4 つ横並び） */
  .tw {
    container: tiles / inline-size;
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--panel-2);
  }
  .tile {
    padding: 6px 10px 7px;
    min-width: 0;
    border-left: 1px solid var(--line);
    border-top: 1px solid var(--line);
  }
  .tile:nth-child(odd) {
    border-left: 0;
  }
  .tile:nth-child(-n + 2) {
    border-top: 0;
  }
  @container tiles (min-width: 680px) {
    .tiles {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
    .tile {
      border-top: 0;
    }
    .tile:nth-child(odd) {
      border-left: 1px solid var(--line);
    }
    .tile:first-child {
      border-left: 0;
    }
  }
  .tile .k,
  .tile .sub {
    font-size: var(--fs-1);
    color: var(--text-3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tile .v {
    font-size: 18px;
    font-weight: 700;
    line-height: 1.3;
    white-space: nowrap;
  }
  .tile .sub .num {
    color: var(--text-2);
  }
  .u {
    font: 400 var(--fs-1) var(--font);
    color: var(--text-3);
    margin-left: 1px;
  }
  /* 予定 */
  .ev {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 6px;
  }
  .e {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    padding: 3px 8px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--focus) 10%, var(--panel-2));
    font-size: var(--fs-1);
    color: var(--text-3);
    white-space: nowrap;
  }
  .e b {
    color: var(--text);
    font-size: var(--fs-2);
    font-weight: 600;
  }
  .e .left {
    color: var(--text-2);
  }
  .e .left.now {
    color: var(--warn);
    font-weight: 700;
  }
  /* カード */
  .card {
    padding: 8px 10px 10px;
  }
  .card > h5 {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 0 6px;
    font-size: var(--fs-2);
    font-weight: 700;
    color: var(--text);
  }
  .card > h5 .muted {
    font-weight: 400;
    font-size: var(--fs-1);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  .kv {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    padding: 3px 0;
    border-bottom: 1px solid var(--line-soft);
  }
  .kv:last-child {
    border-bottom: 0;
  }
  .kv > span:first-child {
    color: var(--text-3);
    font-size: var(--fs-1);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  .kv > span:last-child {
    font-family: var(--mono);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
    gap: 6px 12px;
    margin-bottom: 8px;
  }
  .stat .k {
    font-size: var(--fs-1);
    color: var(--text-3);
  }
  .stat .v {
    font-size: var(--fs-3);
    font-weight: 600;
  }
  .meter {
    position: relative;
    height: 4px;
    border-radius: 2px;
    background: var(--panel-3);
    margin-top: 3px;
    overflow: hidden;
  }
  .meter i {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    border-radius: 2px;
    background: var(--text-2);
  }
  .meter.hot i {
    background: var(--warn);
  }
  .yr {
    margin-bottom: 8px;
  }
  .ybar {
    height: 14px;
  }
  .ybar .track {
    top: 5px;
  }
  .ybar .me {
    top: 0;
    width: 8px;
    height: 14px;
    transform: translateX(-4px);
  }
  .cap {
    font-size: var(--fs-1);
    color: var(--text-2);
  }
  .rec {
    padding: 5px 8px;
    margin-bottom: 8px;
    border-radius: 4px;
    background: var(--panel-3);
    font-size: var(--fs-1);
    color: var(--text-3);
  }
  .rec b {
    color: var(--text);
    font-weight: 600;
  }
  .rec .num {
    color: var(--text-2);
  }
  /* 配当のグラフ: 幅いっぱいに使い、年の札を必ず見せる */
  .dchart {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .dtop {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
    font-size: var(--fs-1);
    color: var(--text-3);
  }
  .seg {
    display: inline-flex;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .seg button {
    background: none;
    border: 0;
    padding: 0 8px;
    height: 18px;
    font-size: var(--fs-1);
    color: var(--text-3);
    cursor: pointer;
  }
  .seg button + button {
    border-left: 1px solid var(--line-strong);
  }
  .seg button[aria-pressed='true'] {
    background: var(--select-strong);
    color: var(--text);
  }
  .plot {
    position: relative;
    height: 128px;
  }
  @container si (min-width: 1040px) {
    .plot {
      height: 156px;
    }
  }
  .none {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    font-size: var(--fs-1);
  }
  .row {
    position: absolute;
    inset: 0;
    display: flex;
    gap: 4px;
    border-bottom: 1px solid var(--line-strong);
    padding-bottom: 16px;
  }
  .b {
    flex: 1 1 0;
    max-width: 52px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    position: relative;
  }
  .col {
    flex: 1;
    position: relative;
  }
  .b i {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    min-height: 1px;
    background: color-mix(in srgb, var(--text-3) 45%, var(--panel-3));
    border-radius: 2px 2px 0 0;
  }
  .b i.latest {
    background: var(--focus);
  }
  /* 年途中: 枠だけ（まだ増える） */
  .b i.partial {
    background: transparent;
    border: 1px dashed var(--focus);
    border-bottom: 0;
  }
  .b i.cut {
    background: color-mix(in srgb, var(--warn) 55%, var(--line-strong));
  }
  .b.on i {
    outline: 1px solid var(--focus);
    outline-offset: 1px;
  }
  .bv {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    font-size: var(--fs-0);
    color: var(--text-3);
    white-space: nowrap;
    line-height: 14px;
    visibility: hidden;
  }
  .bv.show {
    visibility: visible;
  }
  .y {
    position: absolute;
    left: 0;
    right: 0;
    bottom: -16px;
    height: 14px;
    font-size: var(--fs-0);
    color: var(--text-3);
    line-height: 14px;
    text-align: center;
    white-space: nowrap;
  }
  .cutmark {
    color: var(--warn);
    margin-left: 1px;
  }
  /* 選んだ棒の上に出す（棒の位置に合わせる。端の棒では内側へ寄せる） */
  .tip {
    position: absolute;
    bottom: calc(100% + 4px);
    left: 50%;
    transform: translateX(-50%);
    z-index: 5;
    background: var(--panel-3);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: 6px 8px;
    font-size: var(--fs-1);
    color: var(--text-2);
    white-space: nowrap;
    pointer-events: none;
    display: grid;
    gap: 2px;
  }
  .tip.right {
    left: auto;
    right: 0;
    transform: none;
  }
  .b:first-child .tip:not(.right) {
    left: 0;
    transform: none;
  }
  .tip b {
    color: var(--text);
    font-weight: 600;
    margin-left: 6px;
  }
  .tip .cutc {
    color: var(--warn);
  }
  .dfoot {
    margin-top: 18px;
    font-size: var(--fs-1);
    color: var(--text-3);
  }
  /* 値動き */
  .rt {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 6px;
    font-size: var(--fs-1);
  }
  .rt th {
    white-space: nowrap;
    font-weight: 400;
    color: var(--text-3);
    text-align: right;
    padding: 1px 4px;
  }
  .rt th:first-child,
  .rt td:first-child {
    text-align: left;
    color: var(--text-3);
    padding-left: 0;
    white-space: nowrap;
    font-family: var(--font);
    font-weight: 400;
  }
  .rt td {
    text-align: right;
    font-family: var(--mono);
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    font-size: var(--fs-2);
    padding: 3px 4px;
    border-top: 1px solid var(--line-soft);
  }
  .rt td.na {
    color: var(--text-3);
    font-weight: 400;
  }
  /* カードの並び（幅で 1 列か 2 列。並ぶ順は固定） */
  .cw {
    container: cards / inline-size;
  }
  .cards {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--s-2);
    align-items: start;
  }
  /* 2 列にするのは、値動きの表（6 列の数字）が 1 列分の幅に収まるときだけ（狭いと数字がカードからはみ出す） */
  @container cards (min-width: 660px) {
    .cards {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-template-rows: auto 1fr;
      grid-template-areas: 'tech held' 'tech al';
    }
    .cards.noheld {
      grid-template-areas: 'tech al';
    }
    .c-tech {
      grid-area: tech;
    }
    .c-held {
      grid-area: held;
    }
    .c-al {
      grid-area: al;
    }
  }
  .pnl {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 2px;
  }
  .pnl .v {
    font-size: var(--fs-4);
    font-weight: 700;
  }
  .al {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 6px;
    align-items: center;
    padding: 3px 0;
    border-bottom: 1px solid var(--line-soft);
    font-size: var(--fs-1);
  }
  .al .st {
    padding: 0 5px;
    border-radius: 3px;
    background: var(--panel-3);
    color: var(--text-2);
    white-space: nowrap;
  }
  .al .st.met {
    background: color-mix(in srgb, var(--warn) 14%, var(--panel));
    color: var(--warn);
  }
  .al .c {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .al .d {
    color: var(--text-3);
  }
  .hint {
    font-size: var(--fs-1);
    color: var(--text-3);
    margin-top: 4px;
  }
  kbd {
    font-family: var(--mono);
    font-size: var(--fs-0);
    border: 1px solid var(--line-strong);
    border-bottom-width: 2px;
    border-radius: 3px;
    padding: 0 3px;
    color: var(--text-2);
    background: var(--panel-3);
  }
</style>
