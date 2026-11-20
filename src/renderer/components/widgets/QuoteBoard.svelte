<script lang="ts">
// 株価ボード（ヒートマップのペインのカードの表示。docs/design-quote-board.md・FR-QB1〜QB8）。
// 日足の終値と前日比を銘柄のカードで並べる（リアルタイムではない。値は指標の表 metrics とマーケット一覧の行だけ）。
// 計算・並べ替え・分類・騰落・基準日・移動は lib/quoteBoard.ts。ヒートマップの状態（period・sector・starOnly）は読み書きしない
import { priceDigits, refOf } from '@shared/markets'
import type { Condition, InstrumentId } from '@shared/types'
import { onMount, type Snippet, tick, untrack } from 'svelte'
import { DEFAULT_COLUMNS, resolveColumns } from '../../lib/columns'
import { chgDigits, cls, money, px, sgn } from '../../lib/format'
import { composing } from '../../lib/keys'
import { latest } from '../../lib/latest'
import { type PaneApi, registerPane } from '../../lib/panes'
import { rootZoom, tipBeside } from '../../lib/pointer'
import {
  boardAsOf,
  boardBreadth,
  boardMove,
  boardRows,
  chgView,
  dayLabel,
  heldIds,
  keepIdsWhileLoading,
  QB_GROUPS,
  QB_INDEX_IDS,
  QB_SORTS,
  QB_TOP,
  type QbItem,
  type QbMove,
  readQbState,
  resolveSource,
  rowsInView,
  shortDate,
  sourceList,
  stepSource,
  topByCap,
} from '../../lib/quoteBoard'
import { LinkFollow, listCurrent, SelectionFollow } from '../../lib/selection'
import { app, bridge, codeOf, ensureMetrics, inst, isFav, listName, nameOf, screenInputs, screenName, t } from '../../stores/app.svelte'
import { linkSeq, linkSymbol, type PaneNode, patchState, setLinkSymbol } from '../../stores/layout.svelte'
import PaneHeader, { type MoreItem } from '../PaneHeader.svelte'

let { pane, wrapApi, lead, more }: { pane: PaneNode; wrapApi?: (api: PaneApi) => PaneApi; lead?: Snippet; more?: () => MoreItem[] } =
  $props()

const st = $derived(readQbState(pane.state))
const lang = $derived(app.settings.lang === 'en' ? 'en' : 'ja')
const src = $derived(resolveSource(st.src, { watchlists: app.watchlists, screens: app.screens }))
const sources = $derived(sourceList(app.watchlists, app.screens))

// ---- 出どころの銘柄（§3.1）。null は読み込み中 ----
let capIds = $state<InstrumentId[] | null>(null)
let scrIds = $state<InstrumentId[] | null>(null)
/** scrIds がどの出どころの結果か（同じ出どころの取り直しでは前の一覧を残す） */
let scrSrc: string | null = null
const capFresh = latest()
const scrFresh = latest()
const run = (conditions: Condition[]) => bridge.call('screener.run', { conditions, favorites: [], watchlists: {} })
const capOf = (id: InstrumentId) => app.metrics.get(id)?.marketCap ?? null
// 時価総額の上位は取得の終わり（dataVersion）だけで取り直す（★・ウォッチリストの変化では走らない）
$effect(() => {
  void app.dataVersion
  if (src !== 'cap') return
  const ok = capFresh()
  Promise.all([
    run([
      { field: 'attr.market', op: 'in', value: ['P'] },
      { field: 'attr.kind', op: 'in', value: ['stock'] },
    ]),
    run([
      { field: 'attr.market', op: 'in', value: ['R'] },
      { field: 'attr.kind', op: 'in', value: ['reit'] },
    ]),
  ])
    .then(([s, r]) => {
      if (!ok()) return // 古い応答で上書きしない
      for (const row of [...s.rows, ...r.rows]) app.metrics.set(row.id, row)
      capIds = [...topByCap(s.ids, capOf, QB_TOP.stock), ...topByCap(r.ids, capOf, QB_TOP.reit)]
    })
    .catch(() => {
      // 取れなければ前の一覧のまま（初めてなら空。読み込み中のまま固まらない）
      if (ok()) capIds = capIds ?? []
    })
})
// 保存したスクリーニング条件は、取得の終わりと、条件に含みうる★・ウォッチリスト・保有の変化で取り直す
$effect(() => {
  void app.dataVersion
  void screenInputs()
  if (!src.startsWith('scr:')) return
  const screen = app.screens.find((s) => `scr:${s.id}` === src)
  if (!screen) return
  const ok = scrFresh()
  // 同じ条件の取り直し（取得の終わり・★の付け外し）の間は前の一覧のまま。別の条件へ替えたときだけ読み込み中
  untrack(() => {
    scrIds = keepIdsWhileLoading(scrSrc, src, scrIds)
    scrSrc = src
  })
  const favs = app.watchlists.find((w) => w.builtin === 'favorites')?.items ?? []
  bridge
    .call('screener.run', {
      conditions: $state.snapshot(screen.conditions) as Condition[],
      favorites: favs,
      watchlists: Object.fromEntries(app.watchlists.map((w) => [w.id, w.items])),
    })
    .then((r) => {
      if (!ok()) return
      for (const row of r.rows) app.metrics.set(row.id, row)
      scrIds = r.ids
    })
    .catch(() => {
      if (ok()) scrIds = scrIds ?? []
    })
})
const held = $derived(heldIds(app.holdings))
const ids = $derived.by((): InstrumentId[] | null => {
  if (src === 'cap') return capIds
  if (src.startsWith('scr:')) return scrIds
  if (src === 'held') return held
  return app.watchlists.find((w) => `wl:${w.id}` === src)?.items ?? []
})
// ウォッチリスト・保有の銘柄は指標を読み、取得を先に回してもらう（マーケット一覧と同じ）
$effect(() => {
  if (src !== 'held' && !src.startsWith('wl:')) return
  const list = ids ?? []
  ensureMetrics(list)
  bridge.prioritize(list.slice(0, 60))
})
$effect(() => {
  void app.dataVersion // 取得の終わりにも読み直す（初回の取得のあとに確実に出す）
  ensureMetrics([...QB_INDEX_IDS])
  bridge.prioritize([...QB_INDEX_IDS])
})

const items = $derived.by((): QbItem[] => {
  void app.metrics.size
  void app.dataVersion
  return (ids ?? []).map((id) => {
    const i = inst(id)
    return { id, m: app.metrics.get(id), sector: i?.sectorJa ?? '', reit: i?.kind === 'reit' }
  })
})
const groups = $derived(boardRows(items, st.sort, st.group, st.star, isFav))
const flat = $derived(groups.flatMap((g) => g.items))
const rowIds = $derived(flat.map((x) => x.id))
const indexOfId = $derived(new Map(flat.map((x, i) => [x.id, i])))
const breadth = $derived(boardBreadth(flat))
const asOf = $derived(boardAsOf(flat))
const loading = $derived(ids === null)

// ---- 選択（銘柄で持つ。取得で並びが変わっても動かない） ----
let sel = $state(0)
let gridEl = $state<HTMLDivElement>()
const follow = new SelectionFollow<InstrumentId>()
$effect(() => {
  const r = follow.sync(rowIds, sel)
  if (r.sel !== sel) sel = r.sel
})
const linkFollow = new LinkFollow<InstrumentId>()
$effect(() => {
  const id = pane.link ? linkSymbol(pane.link) : null
  const i = linkFollow.pick(id, rowIds, pane.link ? linkSeq(pane.link) : 0)
  if (i >= 0)
    untrack(() => {
      if (sel !== i) sel = i
      scrollSel()
    })
})
const cur = $derived(flat[sel])
function send(i = sel) {
  const id = rowIds[i]
  if (id) setLinkSymbol(pane.link, id)
}
function scrollSel() {
  queueMicrotask(() => gridEl?.querySelector('.card.sel')?.scrollIntoView({ block: 'nearest' }))
}
/** 並べ替え・出どころ・分類・★のみを変えたら先頭から（マーケット一覧の setGroup と同じ）。先頭の銘柄は、新しい一覧が届いてから送る */
let sendFirst = $state(false)
function restart(patch: Record<string, unknown>) {
  patchState(pane, patch)
  sel = 0
  follow.reset()
  linkFollow.hold()
  sendFirst = true
}
// 結果があとで届く出どころ（スクリーニング条件・初めての時価総額の上位）では、読み込み中の間は送らず、届いた一覧の先頭を送る。
// 出どころの取り直しの effect（上）より後に置く（替えた直後に前の一覧の先頭を送らないため）
$effect(() => {
  if (!sendFirst || loading) return
  const first = rowIds[0]
  untrack(() => {
    sendFirst = false
    if (first) send(0)
  })
})
// 選んでいるタブが見えるようにする（タブが多くて横に溢れるとき）
let tabsEl = $state<HTMLDivElement>()
$effect(() => {
  void src
  queueMicrotask(() => tabsEl?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }))
})
const setSrc = (s: string) => restart({ qbSrc: s })
const stepSrc = (d: 1 | -1) => setSrc(stepSource(src, sources, d))
const stepSort = () => restart({ qbSort: QB_SORTS[(QB_SORTS.indexOf(st.sort) + 1) % QB_SORTS.length] })
const stepGroup = () => restart({ qbGroup: QB_GROUPS[(QB_GROUPS.indexOf(st.group) + 1) % QB_GROUPS.length] })
const toggleStar = () => restart({ qbStar: !st.star })
const toggleIdx = () => patchState(pane, { qbIdx: !st.idx })
const resize = (d: 1 | -1) => patchState(pane, { qbSize: Math.max(1, Math.min(3, st.size + d)) })
/** 「⋯」のメニュー: 表示の切り替え（親から）と、キーでしかできなかった指数のカード・大きさ */
const moreItems = (): MoreItem[] => [
  ...(more?.() ?? []),
  { id: 'qbIdx', label: t(st.idx ? 'qb.idxHide' : 'qb.idxShow'), hint: 'I', run: toggleIdx },
  { id: 'qbBigger', label: t('qb.bigger'), hint: '+', run: () => resize(1) },
  { id: 'qbSmaller', label: t('qb.smaller'), hint: '−', run: () => resize(-1) },
]
function moveBy(dir: QbMove) {
  const cards = [...(gridEl?.querySelectorAll<HTMLElement>('.card') ?? [])]
  // offsetLeft・offsetTop（CSS の px）。getBoundingClientRect は表示倍率と最大化の transform で歪む
  const rects = cards.map((c) => ({ x: c.offsetLeft, y: c.offsetTop, w: c.offsetWidth, h: c.offsetHeight }))
  const page = rowsInView(gridEl?.clientHeight ?? 400, (rects[0]?.h ?? 64) + 1)
  sel = boardMove(rects, sel, dir, page)
  send()
  scrollSel()
}

onMount(() => {
  const api: PaneApi = {
    current: () => {
      const link = pane.link ? linkSymbol(pane.link) : null
      return listCurrent(link, rowIds, sel, linkFollow.isHeld(link))
    },
    selected: () => (rowIds[sel] ? [rowIds[sel]!] : []),
    columns: () =>
      rowIds.length ? { ids: [...rowIds], cols: resolveColumns(undefined, DEFAULT_COLUMNS.watchlist), name: t('qb.view.board') } : null,
    key(e) {
      if (composing(e)) return false
      const k = e.key
      const ctrl = e.ctrlKey || e.metaKey
      const dir = (
        {
          ArrowLeft: 'left',
          ArrowRight: 'right',
          ArrowUp: 'up',
          ArrowDown: 'down',
          PageUp: 'pageUp',
          PageDown: 'pageDown',
          Home: 'home',
          End: 'end',
        } as Record<string, QbMove>
      )[k]
      if (dir && !ctrl && !e.altKey && !e.shiftKey) {
        moveBy(dir)
        return true
      }
      if ((k === 'PageDown' || k === 'PageUp') && ctrl && !e.shiftKey && !e.altKey) {
        stepSrc(k === 'PageDown' ? 1 : -1)
        return true
      }
      if (ctrl && e.shiftKey && !e.altKey && e.code === 'KeyF') {
        toggleStar()
        return true
      }
      if (ctrl || e.altKey) return false
      if (e.code === 'KeyG') {
        stepSrc(e.shiftKey ? -1 : 1)
        return true
      }
      if (e.shiftKey) return false
      if (e.code === 'KeyS') {
        stepSort()
        return true
      }
      if (e.code === 'KeyB') {
        stepGroup()
        return true
      }
      if (e.code === 'KeyI') {
        toggleIdx()
        return true
      }
      // + − はチャートグリッドと同じ判定（JIS 配列では ; のキーで大きくなる）
      if (k === '+' || k === ';' || e.code === 'NumpadAdd') {
        resize(1)
        return true
      }
      if (k === '-' || e.code === 'NumpadSubtract') {
        resize(-1)
        return true
      }
      return false
    },
  }
  const off = registerPane(pane.id, wrapApi ? wrapApi(api) : api)
  return off
})

// ---- 表示 ----
const srcLabel = (s: string): string => {
  if (s === 'cap') return t('qb.src.cap')
  if (s === 'held') return t('list.holdings')
  if (s.startsWith('scr:')) {
    const sc = app.screens.find((x) => `scr:${x.id}` === s)
    return sc ? t('qb.src.screen', { name: screenName(sc) }) : s
  }
  const w = app.watchlists.find((x) => `wl:${x.id}` === s)
  return w ? listName(w) : s
}
const srcCount = (s: string): number | null => {
  if (s === 'cap') return capIds?.length ?? null
  if (s === 'held') return held.length
  if (s.startsWith('wl:')) return app.watchlists.find((x) => `wl:${x.id}` === s)?.items.length ?? 0
  return s === src ? (scrIds?.length ?? null) : null
}
const groupLabel = (k: string | null): string => {
  if (k == null) return ''
  if (st.group === 'kind') return t(`qb.kind.${k as 'stock' | 'reit'}`)
  if (lang === 'en') {
    const i = flat.find((x) => x.sector === k)
    return (i ? inst(i.id)?.sectorEn : '') || k
  }
  return k === 'REIT' ? 'J-REIT' : k
}
const sectorText = (id: InstrumentId): string => {
  const i = inst(id)
  if (!i) return ''
  if (i.kind === 'reit') return t('qb.reitSector')
  return lang === 'en' ? i.sectorEn || i.sectorJa : i.sectorJa
}
const marketText = (id: InstrumentId): string => {
  const m = inst(id)?.market
  return m ? t(`mkt.${m}` as Parameters<typeof t>[0]) : ''
}
const chgText = (chg: number | null | undefined, close: number | null | undefined, digits?: number) => sgn(chg, digits ?? chgDigits(close))
/** 前日比の色と矢印（表示の桁で丸めて 0 なら変わらず。chgText と同じ桁） */
const view = (chg: number | null | undefined, close: number | null | undefined, digits?: number) => chgView(chg, digits ?? chgDigits(close))
const pctText = (v: number | null | undefined) => sgn(v, 2, '%')
const oku = (v: number | null | undefined) => money(v)

// ツールチップ（マウスを載せたカード。キーボードでは下の 2 行に同じ値）
let tip = $state<{ id: InstrumentId; x: number; y: number } | null>(null)
let tipEl = $state<HTMLDivElement>()
async function showTip(id: InstrumentId, ev: MouseEvent) {
  const r = (ev.currentTarget as HTMLElement).getBoundingClientRect()
  tip = { id, ...tipBeside(r, 260, window.innerWidth, rootZoom()) }
  // 描いてから高さを測り、窓の下からはみ出さないよう上に寄せる
  await tick()
  if (tip?.id === id && tipEl)
    tip = {
      id,
      ...tipBeside(r, tipEl.offsetWidth, window.innerWidth, rootZoom(), { height: tipEl.offsetHeight, viewportHeight: window.innerHeight }),
    }
}
</script>

{#snippet detail(id: InstrumentId)}
  {@const m = app.metrics.get(id)}
  {@const v = view(m?.chg, m?.close)}
  <span class="dt">{t('qb.close')}</span><span class={`num ${v.cls}`}>{px(m?.close)}</span>
  <span class="dt">{t('qb.chg')}</span><span class={`num ${v.cls}`}>{v.arrow}{chgText(m?.chg, m?.close)}（{pctText(m?.chgPct)}）</span>
  <span class="dt">{t('qb.prev')}</span><span class="num">{px(m?.close != null && m?.chg != null ? m.close - m.chg : null)}</span>
  <span class="dt">{t('qb.turnover')}</span><span class="num">{oku(m?.turnover).n}{oku(m?.turnover).u}</span>
  <span class="dt">{t('qb.range52')}</span><span class="num">{px(m?.lo52)} – {px(m?.hi52)}</span>
  <span class="dt">{t('qb.cap')}</span><span class="num">{oku(m?.marketCap).n}{oku(m?.marketCap).u}</span>
  <span class="dt">{t('qb.date')}</span><span class={`num ${m?.stale ? 'warn' : ''}`}>{m?.asOf ? dayLabel(m.asOf, lang) : '—'}{m?.provisional ? t('qb.prov') : ''}</span>
{/snippet}

<PaneHeader {pane} collapse={600} more={moreItems} title={t('qb.view.board')}>
  {@render lead?.()}
  {#if asOf.date}
    <span class="asof" title={asOf.provisional ? `${t('qb.asOfTip')} / ${t('chart.provisional')}` : t('qb.asOfTip')}>
      {t('qb.asOf', { date: dayLabel(asOf.date, lang) })}{asOf.provisional ? t('qb.prov') : ''}<span class="wide">{asOf.prev ? t('qb.asOfPrev', { prev: dayLabel(asOf.prev, lang) }) : ''}</span>
    </span>
  {/if}
</PaneHeader>
<div class="bar2">
  <div class="tabs" role="tablist" bind:this={tabsEl}>
    {#each sources as s (s)}
      {@const n = srcCount(s)}
      <button type="button" role="tab" aria-selected={s === src} title={`${srcLabel(s)} (G / Ctrl+PageDown)`} onclick={() => setSrc(s)}>
        {srcLabel(s)}{#if n != null}<span class="count num">{n}</span>{/if}
      </button>
    {/each}
  </div>
  <span class="tools">
    <button type="button" class="chip" title={`${t('qb.sortTip')} (S)`} onclick={stepSort}>{t(`qb.sort.${st.sort}`)}</button>
    <button type="button" class="chip wide" title={`${t('qb.groupTip')} (B)`} onclick={stepGroup}>{t(`qb.group.${st.group}`)}</button>
    <button type="button" class="chip" aria-pressed={st.star} aria-label={t('list.starOnlyLabel')} title={`${t('list.starOnlyLabel')} (Ctrl+Shift+F)`} onclick={toggleStar}>★</button>
    <!-- 指数のカードと大きさ（キーは I・+ −）。狭いペインでは「⋯」のメニューに入る -->
    <button type="button" class="chip wide" aria-pressed={st.idx} aria-label={t('qb.idxLabel')} title={`${t(st.idx ? 'qb.idxHide' : 'qb.idxShow')} (I)`} onclick={toggleIdx}>{t('qb.idxChip')}</button>
    <span class="wide sizes" role="group" aria-label={t('qb.sizeLabel')}>
      <button type="button" class="chip" aria-label={t('qb.smaller')} title={`${t('qb.smaller')} (−)`} disabled={st.size <= 1} onclick={() => resize(-1)}>−</button>
      <button type="button" class="chip" aria-label={t('qb.bigger')} title={`${t('qb.bigger')} (+)`} disabled={st.size >= 3} onclick={() => resize(1)}>+</button>
    </span>
  </span>
</div>
{#if st.idx}
  <div class="idx">
    {#each QB_INDEX_IDS as id (id)}
      {@const m = app.metrics.get(id)}
      {@const d = priceDigits(id)}
      {@const v = view(m?.chg, m?.close, d)}
      <div class={`icard ${v.cls}`} class:stale={m?.stale}>
        <span class="n">{refOf(id)?.name[lang] ?? nameOf(id)}{#if id.startsWith('JP:')}<span class="cd num">{codeOf(id)}</span>{/if}</span>
        <span class="v num">{#if m?.stale && m.asOf}<span class="sd">{shortDate(m.asOf)}</span>{/if}{px(m?.close, d)}</span>
        <span class="c num">{v.arrow}{chgText(m?.chg, m?.close, d)} ({pctText(m?.chgPct)})</span>
      </div>
    {/each}
  </div>
{/if}
{#if !loading && flat.length}
  {@const total = Math.max(1, breadth.up + breadth.down + breadth.flat)}
  <div class="breadth">
    <span class="side up"><span class="lb">▲ {t('qb.up')}</span><b class="num">{breadth.up}</b></span>
    <span class="mid">
      <span class="ratio" role="img" aria-label={t('qb.breadthAria', { up: breadth.up, flat: breadth.flat, down: breadth.down })}>
        <i class="ru" style:width={`${(breadth.up / total) * 100}%`}></i><i class="re" style:width={`${(breadth.flat / total) * 100}%`}></i><i class="rd" style:width={`${(breadth.down / total) * 100}%`}></i>
      </span>
      <span class="sub">
        {t('qb.flat', { n: breadth.flat })}
        <span title={t('qb.avgTip')}>{t('qb.avg')} <span class={`num ${cls(breadth.avgPct, 2)}`}>{pctText(breadth.avgPct)}</span></span>
        {#if breadth.stale > 0}<span class="warn" title={t('qb.staleTip')}>{t('qb.stale', { n: breadth.stale })}</span>{/if}
      </span>
    </span>
    <span class="side down"><b class="num">{breadth.down}</b><span class="lb">{t('qb.down')} ▼</span></span>
  </div>
{/if}
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class={`grid s${st.size}`} bind:this={gridEl} role="grid" tabindex="-1" aria-busy={loading} onscroll={() => (tip = null)} onmouseleave={() => (tip = null)}>
  {#if loading}
    {#each { length: 18 } as _, i (i)}<div class="skel"></div>{/each}
  {:else if !flat.length}
    <div class="empty">{t('qb.empty')}<br /><span class="dim">{t('qb.emptyHint')}</span></div>
  {:else}
    {#each groups as g (g.key ?? '')}
      {#if g.key != null}
        {@const b = boardBreadth(g.items)}
        <div class="ghead">{groupLabel(g.key)}<span class="gc num"><span class="up">▲{b.up}</span> <span class="down">▼{b.down}</span> {t('qb.avg')} <span class={cls(b.avgPct, 2)}>{pctText(b.avgPct)}</span></span></div>
      {/if}
      {#each g.items as x (x.id)}
        {@const i = indexOfId.get(x.id) ?? -1}
        {@const m = x.m}
        {@const v = view(m?.chg, m?.close)}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div
          class={`card ${v.cls}`}
          class:sel={i === sel}
          class:stale={m?.stale}
          role="gridcell"
          tabindex="-1"
          aria-selected={i === sel}
          aria-label={`${nameOf(x.id)} ${codeOf(x.id)}`}
          data-id={x.id}
          onclick={() => {
            sel = i
            send()
          }}
          onmouseenter={(e) => showTip(x.id, e)}
        >
          <span class="nm">{nameOf(x.id)}</span>
          <span class="px num">{#if m?.stale && m.asOf}<span class="sd">{shortDate(m.asOf)}</span>{/if}{px(m?.close)}</span>
          <span class="chg num"><span class="yen">{v.arrow}{chgText(m?.chg, m?.close)}</span><span class="pct">{pctText(m?.chgPct)}</span></span>
        </div>
      {/each}
    {/each}
  {/if}
</div>
<div class="foot" class:hide={!cur}>
  {#if cur}
    <div><b>{nameOf(cur.id)}</b> <span class="num dim">{codeOf(cur.id)}</span> <span class="dim">{marketText(cur.id)}・{sectorText(cur.id)}</span></div>
    <div class="dl">{@render detail(cur.id)}</div>
  {:else}
    <div>&nbsp;</div>
    <div>&nbsp;</div>
  {/if}
</div>
{#if tip}
  <div class="tip" bind:this={tipEl} style:left={`${tip.x}px`} style:top={`${tip.y}px`} role="tooltip">
    <div class="th"><b>{nameOf(tip.id)}</b> <span class="num dim">{codeOf(tip.id)}</span></div>
    <div class="dim">{marketText(tip.id)}・{sectorText(tip.id)}</div>
    <div class="tdl">{@render detail(tip.id)}</div>
  </div>
{/if}

<style>
  .asof {
    font-size: var(--fs-1);
    color: var(--text-3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  .bar2 {
    flex: none;
    display: flex;
    align-items: stretch;
    border-bottom: 1px solid var(--line);
    min-width: 0;
  }
  .tabs {
    display: flex;
    flex: 1;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .tabs button {
    flex: 0 1 auto;
    min-width: 24px;
    background: none;
    border: 0;
    border-bottom: 2px solid transparent;
    padding: 0 10px;
    height: 26px;
    color: var(--text-3);
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tabs button[aria-selected='true'] {
    color: var(--text);
    border-bottom-color: var(--text-2);
    flex-shrink: 0;
  }
  .count {
    color: var(--text-3);
    margin-left: 4px;
    font-size: var(--fs-1);
  }
  .tools {
    flex: none;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 var(--s-2);
  }
  .sizes {
    display: inline-flex;
    gap: 2px;
  }
  .tools .chip[aria-pressed='true'] {
    border-color: var(--focus);
    color: var(--text);
  }
  /* 1 行目: 指数のカード 3 枚（同じ大きさ・同じ文字） */
  .idx {
    flex: none;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1px;
    background: var(--line);
    border-bottom: 1px solid var(--line);
  }
  .icard {
    background: var(--panel);
    padding: 6px 12px 7px;
    display: grid;
    min-width: 0;
  }
  .icard .n {
    font-weight: 700;
    font-size: var(--fs-2);
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .icard .cd {
    font-weight: 400;
    font-size: var(--fs-1);
    color: var(--text-3);
    margin-left: 6px;
  }
  .icard .v {
    font-size: calc(var(--fs-4) * 1.5);
    font-weight: 600;
    line-height: 1.25;
    white-space: nowrap;
  }
  .icard .c {
    font-size: var(--fs-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .icard.up .v,
  .icard.up .c,
  .card.up .px,
  .card.up .chg {
    color: var(--up);
  }
  .icard.down .v,
  .icard.down .c,
  .card.down .px,
  .card.down .chg {
    color: var(--down);
  }
  .icard.stale,
  .card.stale {
    opacity: 0.55;
  }
  /* 騰落の帯（選挙速報のように、上昇を棒の左・下落を右に大きく。真ん中の目盛りが半数） */
  .breadth {
    flex: none;
    display: grid;
    grid-template-columns: auto minmax(60px, 1fr) auto;
    align-items: center;
    column-gap: 12px;
    padding: 5px 12px;
    min-height: 44px;
    border-bottom: 1px solid var(--line);
    color: var(--text-3);
    white-space: nowrap;
    overflow: hidden;
  }
  .side {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }
  .side b {
    font-size: calc(var(--fs-4) * 1.4);
    font-weight: 700;
    line-height: 1;
  }
  .side .lb {
    font-size: var(--fs-1);
  }
  .side.up {
    color: var(--up);
  }
  .side.down {
    color: var(--down);
  }
  .mid {
    display: grid;
    gap: 3px;
    min-width: 0;
  }
  .ratio {
    position: relative;
    display: flex;
    height: 12px;
    background: var(--line-strong);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .ratio::after {
    content: '';
    position: absolute;
    left: 50%;
    top: -1px;
    bottom: -1px;
    width: 1px;
    background: var(--text);
    opacity: 0.6;
  }
  .ratio i {
    display: block;
    height: 100%;
  }
  .ru {
    background: var(--up);
  }
  .re {
    background: var(--text-3);
    opacity: 0.5;
  }
  .rd {
    background: var(--down);
  }
  .sub {
    display: flex;
    justify-content: center;
    gap: var(--s-3);
    font-size: var(--fs-1);
    overflow: hidden;
  }
  .warn {
    color: var(--warn);
  }
  /* カード */
  .grid {
    flex: 1;
    min-height: 0;
    overflow: auto;
    display: grid;
    gap: 1px;
    align-content: start;
    background: var(--line);
    padding: 1px;
    position: relative;
    grid-template-columns: repeat(auto-fill, minmax(var(--tile-w), 1fr));
  }
  .grid.s1 {
    --tile-w: 104px;
    --tile-h: 54px;
    --price-fs: var(--fs-3);
  }
  .grid.s2 {
    --tile-w: 132px;
    --tile-h: 64px;
    --price-fs: var(--fs-4);
  }
  .grid.s3 {
    --tile-w: 172px;
    --tile-h: 80px;
    --price-fs: calc(var(--fs-4) * 1.3);
  }
  .ghead {
    grid-column: 1 / -1;
    display: flex;
    gap: var(--s-2);
    background: var(--panel-2);
    color: var(--text-2);
    font-size: var(--fs-1);
    padding: 2px var(--s-2);
  }
  .gc {
    margin-left: auto;
  }
  .card {
    background: var(--panel);
    height: var(--tile-h);
    padding: 4px 7px 3px;
    display: grid;
    grid-template-rows: auto 1fr auto;
    min-width: 0;
    overflow: hidden;
    cursor: pointer;
    outline: none;
  }
  .card:hover:not(.sel) {
    background: var(--hover);
  }
  .card.sel {
    background: var(--select);
    box-shadow: inset 0 0 0 1px var(--line-strong);
  }
  :global(.pane.focused) .card.sel {
    box-shadow: inset 0 0 0 2px var(--focus);
  }
  .nm {
    font-size: var(--fs-1);
    color: var(--text-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .px {
    align-self: center;
    text-align: right;
    font-size: var(--price-fs);
    font-weight: 600;
    line-height: 1.1;
  }
  .sd {
    font-size: var(--fs-0);
    color: var(--warn);
    margin-right: 4px;
  }
  .chg {
    display: flex;
    justify-content: space-between;
    gap: 4px;
    font-size: var(--fs-1);
    white-space: nowrap;
  }
  .card.flat .chg {
    color: var(--text-3);
  }
  .grid.s1 .pct {
    display: none;
  }
  .grid.s1 .chg {
    justify-content: flex-end;
  }
  .skel {
    height: var(--tile-h);
    background: var(--panel);
  }
  .empty {
    grid-column: 1 / -1;
    background: var(--panel);
    padding: 48px 24px;
    text-align: center;
    color: var(--text-2);
    line-height: 1.8;
  }
  /* 選んだ銘柄の詳しい値（2 行。選んでいないときも場所を取る） */
  .foot {
    flex: none;
    padding: 2px var(--s-3);
    border-top: 1px solid var(--line);
    font-size: var(--fs-1);
    color: var(--text-3);
    line-height: 17px;
  }
  .foot > div {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .foot b {
    color: var(--text);
  }
  .foot.hide > div {
    visibility: hidden;
  }
  .dl :global(.dt) {
    margin-left: var(--s-2);
  }
  .dl :global(.dt:first-child) {
    margin-left: 0;
  }
  .dl :global(.num) {
    margin-left: 3px;
  }
  .dl :global(.num:not(.up):not(.down):not(.warn)) {
    color: var(--text-2);
  }
  .tip {
    position: fixed;
    z-index: 60;
    pointer-events: none;
    min-width: 230px;
    background: var(--panel-3);
    border: 1px solid var(--line-strong);
    box-shadow: var(--shadow);
    border-radius: var(--radius);
    padding: 7px 10px;
    font-size: var(--fs-1);
    color: var(--text-2);
  }
  .tip .th b {
    color: var(--text);
    font-size: var(--fs-2);
  }
  .tdl {
    display: grid;
    grid-template-columns: auto auto;
    gap: 1px 14px;
    margin-top: 4px;
  }
  .tdl :global(.num) {
    text-align: right;
  }
  .tdl :global(.num:not(.up):not(.down):not(.warn)) {
    color: var(--text);
  }
  .tdl :global(.dt) {
    color: var(--text-3);
  }
  @container (max-width: 519px) {
    .wide {
      display: none;
    }
    .icard {
      padding: 5px 8px 6px;
    }
    .icard .v {
      font-size: var(--fs-4);
    }
    .icard .c {
      font-size: var(--fs-1);
    }
    .icard .cd {
      display: none;
    }
  }
</style>
