<script lang="ts">
import { addDays, jstNow } from '@shared/calendar'
// チャートグリッド（§6.11）: 多数のチャートを並べ、時間軸・期間・表示を一括で操作し、売買候補に印を付ける。

import type { Bars, Condition, InstrumentId, MetricsRow, Timeframe } from '@shared/types'
import { onMount } from 'svelte'
import { addToListDialog, keyOf, setFocus } from '../../lib/commands'
import { cls, fmt, px, sgn } from '../../lib/format'
import type { Key } from '../../lib/i18n'
import { registerPane } from '../../lib/panes'
import { PERIODS } from '../../lib/periods'
import { symbolDrop } from '../../lib/symbolDrag'
import {
  app,
  bridge,
  candidates,
  codeOf,
  ensureMetrics,
  isCand,
  isFav,
  listName,
  metric,
  nameOf,
  screenName,
  t,
  toast,
  toggleCand,
  toggleFav,
} from '../../stores/app.svelte'
import { type PaneNode, patchState, setLinkSymbol } from '../../stores/layout.svelte'
import Icon from '../Icon.svelte'
import PaneHeader from '../PaneHeader.svelte'
import PeriodPicker from '../PeriodPicker.svelte'
import { drawTile } from './gridDraw'

let { pane }: { pane: PaneNode } = $props()
const GRIDS: [number, number][] = [
  [2, 2],
  [3, 2],
  [3, 3],
  [4, 3],
  [5, 4],
  [6, 5],
]
const SORTS = ['ret', 'yieldTrailing', 'maDev75', 'fromHi52', 'turnover20'] as const
type SortKey = (typeof SORTS)[number] | 'none'
const S = $derived(pane.state as Record<string, unknown>)
const src = $derived((S.src as string) ?? 'live')
const own = $derived((S.own as InstrumentId[]) ?? [])
const tf = $derived(((S.tf as Timeframe) ?? 'D') as Timeframe)
const period = $derived((S.period as number) ?? 2)
const scale = $derived(((S.scale as number) ?? 0) as 0 | 1 | 2)
const ma = $derived(S.ma !== false)
const sortKey = $derived(((S.sort as SortKey) ?? 'ret') as SortKey)
const dir = $derived(((S.dir as number) ?? -1) as 1 | -1)
const size = $derived((S.size as number) ?? 3)
const page = $derived((S.page as number) ?? 0)
const candOnly = $derived(!!S.candOnly)
const favOnly = $derived(!!S.favOnly)
let sel = $state(0)
let zoom = $state<InstrumentId | null>(null)
let hoverDate = $state<string | null>(null)
let screenIds = $state<InstrumentId[]>([])
let rets = $state<Record<string, number>>({})
let bars = $state<Record<string, Bars>>({})
let full = $state<Record<string, Bars>>({})
let tiles = $state<HTMLDivElement>()
let raf = 0
let tokenScr = 0
let tokenBars = 0
const set = (patch: Record<string, unknown>) => patchState(pane, patch)

// 対象（FR-G1）
$effect(() => {
  void app.dataVersion
  let conds: Condition[] | null = null
  if (src === 'live') conds = app.liveConds.length ? app.liveConds : (app.screens[0]?.conditions ?? [])
  else if (src.startsWith('scr:')) conds = app.screens.find((s) => `scr:${s.id}` === src)?.conditions ?? []
  if (!conds) return
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
})
const srcIds = $derived.by((): InstrumentId[] => {
  if (src === 'own') return own
  if (src === 'live' || src.startsWith('scr:')) return screenIds
  return app.watchlists.find((w) => w.id === src)?.items ?? []
})
const fromDate = $derived(addDays(jstNow().date, -PERIODS[period]!.days)) // 日本時間の日付（FR-T1）
$effect(() => {
  const ids = srcIds
  ensureMetrics(ids)
  if (sortKey !== 'ret' || !ids.length) return
  void app.dataVersion
  bridge.call('returns.get', { ids: ids.slice(0, 5000), from: fromDate }).then((r) => (rets = r))
})
const codes = $derived.by(() => {
  let ids = srcIds
  if (candOnly) ids = ids.filter((id) => isCand(id))
  if (favOnly) ids = ids.filter((id) => isFav(id))
  if (sortKey === 'none') return ids
  const key = (id: InstrumentId) => (sortKey === 'ret' ? rets[id] : (metric(id)?.[sortKey as keyof MetricsRow] as number | null)) ?? -1e18
  return [...ids].sort((a, b) => (key(a) - key(b)) * dir)
})
const dims = $derived(GRIDS[size] ?? GRIDS[3]!)
const perPage = $derived(dims[0] * dims[1])
const pages = $derived(Math.max(1, Math.ceil(codes.length / perPage)))
const pageIds = $derived(codes.slice(Math.min(page, pages - 1) * perPage, Math.min(page, pages - 1) * perPage + perPage))
const rows = $derived(zoom ? 1 : Math.max(1, Math.min(dims[1], Math.ceil(pageIds.length / dims[0]))))
const cols = $derived(zoom ? 1 : dims[0])
const shown = $derived(zoom ? [zoom] : pageIds)

// 見えているタイルの足だけを取る（FR-G9）
$effect(() => {
  const ids = shown
  void app.dataVersion
  const per = { D: 1, W: 5, M: 21 }[tf]
  const days = PERIODS[period]!.days
  const count = Math.min(3000, days > 50000 ? 3000 : Math.ceil((days * 245) / 365 / per) + 80)
  if (!ids.length) return
  bridge.prioritize(ids)
  const my = ++tokenBars
  bridge.call('bars.many', { ids, tf, count }).then((r) => {
    if (my !== tokenBars) return
    const cut: Record<string, Bars> = {}
    for (const [id, b] of Object.entries(r)) {
      const i = b.time.findIndex((x) => x >= fromDate)
      const s = i < 0 ? b.time.length : i
      cut[id] = {
        ...b,
        time: b.time.slice(s),
        open: b.open.slice(s),
        high: b.high.slice(s),
        low: b.low.slice(s),
        close: b.close.slice(s),
        volume: b.volume.slice(s),
      }
    }
    full = r
    bars = cut
  })
})
$effect(() => {
  void bars
  void scale
  void ma
  void hoverDate
  void rows
  void cols
  void app.settings.candleStyle
  schedule()
})
function schedule() {
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(() => {
    tiles?.querySelectorAll<HTMLCanvasElement>('canvas[data-id]').forEach((cv) => {
      const id = cv.dataset.id!
      drawTile(cv, bars[id], full[id], { tf, scale, ma, hoverDate, fmtPx: px, fmtPct: (v) => sgn(v, 0, '%') })
    })
  })
}
const periodRet = (id: InstrumentId) => {
  const b = bars[id]
  return b && b.close.length > 1 ? (b.close.at(-1)! / b.close[0]! - 1) * 100 : null
}
function send() {
  const id = shown[sel]
  // リンク色の無いグリッド（フリー N の既定）は、ほかのチャートの銘柄を変えない
  if (id && pane.link) setLinkSymbol(pane.link, id)
}
/** ページをめくる（FR-G2）。at はめくった先で選ぶタイル（ページの枚数に収める）。端では何もしない */
function goPage(delta: number, at = 0): boolean {
  const cur = Math.min(page, pages - 1)
  const next = Math.max(0, Math.min(pages - 1, cur + delta))
  if (next === cur) return false
  set({ page: next })
  const n = Math.min(perPage, codes.length - next * perPage)
  sel = Math.max(0, Math.min(n - 1, at))
  send()
  return true
}
/**
 * 矢印でタイルを動かす。ページの端を越えるときは隣のページへ（→ は最後のタイルから次のページの先頭、← は先頭から
 * 前のページの最後、↓ は最下段から次のページの同じ列、↑ は最上段から前のページの最下段の同じ列）
 */
function moveSel(k: string): void {
  const n = pageIds.length
  const col = sel % cols
  if (k === 'ArrowRight' && sel >= n - 1) {
    if (goPage(1, 0)) return
  } else if (k === 'ArrowLeft' && sel <= 0) {
    if (goPage(-1, perPage - 1)) return
  } else if (k === 'ArrowDown' && sel + cols >= n) {
    if (goPage(1, col)) return
  } else if (k === 'ArrowUp' && sel - cols < 0) {
    if (goPage(-1, (dims[1] - 1) * cols + col)) return
  }
  const mv = ({ ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols } as Record<string, number>)[k] ?? 0
  sel = Math.max(0, Math.min(n - 1, sel + mv))
  send()
}
function addOwn(id: InstrumentId) {
  const next = own.includes(id) ? own : [...own, id]
  set({ own: next, src: 'own', sort: 'none', page: Math.floor((next.length - 1) / perPage) })
  sel = (next.length - 1) % perPage
  toast(t('grid.added', { name: nameOf(id) }))
}
/**
 * 選んだタイルの銘柄を差し替える（C キー・タイルの ✎）。コマンドバーで選んだ銘柄が、そのタイルの位置に入る。
 * 対象がウォッチリストやスクリーナーのときは、今の並びを「このグリッドの銘柄」に固定してから差し替える（FR-G10）
 */
let replacing: number | null = null
function startReplace(i = sel) {
  if (!shown[i]) return
  const cur = shown[i]
  if (src !== 'own') {
    set({ own: [...codes], src: 'own', sort: 'none' })
  } else if (sortKey !== 'none') {
    // 並べ替え中は見えている順を固定してから差し替える
    set({ own: [...codes], sort: 'none' })
  }
  // ★・◆で絞り込んでいるときは見えている並びと own がずれるので、銘柄で own の位置を探す
  replacing = ownIndex(cur)
  sel = i
  app.overlay = { kind: 'palette', q: '', title: t('grid.replaceTitle', { name: nameOf(shown[i]) }) }
}
/** このグリッドの銘柄（own）の中での位置。絞り込み中も見えているタイルの銘柄から探す */
function ownIndex(id: InstrumentId): number {
  return ((pane.state.own as InstrumentId[] | undefined) ?? []).indexOf(id)
}
/** 一覧の行をタイルに落としたら、そのタイルの銘柄を差し替える（C キーと同じ。FR-G10） */
function dropAt(i: number, id: InstrumentId) {
  if (zoom) {
    zoom = id // 拡大中は、落とした銘柄を拡大して見せる
    return
  }
  const cur = shown[i]
  if (!cur) return addOwn(id)
  if (src !== 'own' || sortKey !== 'none') set({ own: [...codes], src: 'own', sort: 'none' })
  sel = i
  setFocus(pane.id)
  const at = ownIndex(cur)
  if (at >= 0 && own[at] !== id) replaceAt(at, id)
}
function replaceAt(at: number, id: InstrumentId) {
  const old = own[at]
  const next = [...own]
  next[at] = id
  set({ own: next.filter((x, k) => x !== id || k === at) }) // 同じ銘柄は 1 つだけ
  toast(t('grid.replaced', { from: nameOf(old), to: nameOf(id) }))
}
// コマンドバーを選ばずに閉じたら、差し替えをやめる
$effect(() => {
  if (!app.overlay) replacing = null
})
function pinCurrent() {
  set({ own: [...codes], src: 'own', sort: 'none', page: 0 })
  sel = 0
  toast(t('grid.pinned', { n: codes.length }))
}
function cycleSort() {
  if (sortKey === 'none') return set({ sort: 'ret', dir: -1, page: 0 })
  if (dir < 0) return set({ dir: 1, page: 0 })
  const i = SORTS.indexOf(sortKey as (typeof SORTS)[number])
  set({ sort: SORTS[(i + 1) % SORTS.length], dir: -1, page: 0 })
}
async function candToList() {
  await addToListDialog([...candidates().items])
}
function srcLabel(s: string): string {
  if (s === 'own') return `${t('grid.own')} (${own.length})`
  if (s === 'live') return t('grid.live')
  if (s.startsWith('scr:')) {
    const x = app.screens.find((y) => `scr:${y.id}` === s)
    return x ? `⌕ ${screenName(x)}` : s
  }
  const w = app.watchlists.find((y) => y.id === s)
  return w ? listName(w) : s
}
const sortLabel = $derived(
  sortKey === 'none' ? t('grid.manual') : `${t(`sort.${sortKey === 'yieldTrailing' ? 'yield' : sortKey}` as Key)} ${dir < 0 ? '▼' : '▲'}`,
)

onMount(() => {
  const ro = new ResizeObserver(() => schedule())
  if (tiles) ro.observe(tiles)
  const off = registerPane(pane.id, {
    current: () => shown[sel],
    // Ctrl+Shift+A（リストに追加）はグリッドでは候補をまとめて送る（FR-G5）。候補が無ければ選択中のタイル
    selected: () => {
      const c = [...(candidates()?.items ?? [])]
      return c.length ? c : shown[sel] ? [shown[sel]!] : []
    },
    receive: (id) => {
      if (replacing != null) {
        const at = replacing
        replacing = null
        replaceAt(at, id)
      } else addOwn(id)
      return true
    },
    key(e) {
      const k = e.key
      const c = e.code
      const ctrl = e.ctrlKey || e.metaKey
      if (zoom && k === 'Escape') {
        zoom = null
        return true
      }
      if (e.altKey && !e.shiftKey && !ctrl && src === 'own' && sortKey === 'none' && (k === 'ArrowLeft' || k === 'ArrowRight')) {
        const i = Math.min(page, pages - 1) * perPage + sel
        const j = i + (k === 'ArrowLeft' ? -1 : 1)
        if (j >= 0 && j < own.length) {
          const next = [...own]
          ;[next[i], next[j]] = [next[j]!, next[i]!]
          set({ own: next })
          sel += j - i
        }
        return true
      }
      if (e.altKey && !ctrl && /^Digit[1-6]$/.test(c)) {
        set({ period: Number(c.slice(5)) - 1 })
        return true
      }
      // ★だけ表示: ほかのペインと同じ Ctrl+Shift+F（Shift+F も使える）
      if (ctrl && e.shiftKey && !e.altKey && c === 'KeyF') {
        set({ favOnly: !favOnly, page: 0 })
        sel = 0
        return true
      }
      if (ctrl || e.altKey) return false
      if (!zoom && (k === 'ArrowRight' || k === 'ArrowLeft' || k === 'ArrowDown' || k === 'ArrowUp')) {
        moveSel(k)
        return true
      }
      if (k === 'Home' || k === 'End') {
        sel = k === 'Home' ? 0 : Math.max(0, pageIds.length - 1)
        send()
        return true
      }
      if (k === 'PageDown' || k === 'PageUp') {
        goPage(k === 'PageDown' ? 1 : -1, 0)
        return true
      }
      if (!e.shiftKey && (c === 'KeyD' || c === 'KeyW' || c === 'KeyM')) {
        set({ tf: c.slice(3) })
        return true
      }
      if (c === 'KeyL') {
        set({ scale: scale === 1 ? 0 : 1 })
        return true
      }
      if (c === 'KeyN') {
        set({ scale: scale === 2 ? 0 : 2 })
        return true
      }
      if (c === 'KeyI') {
        set({ ma: !ma })
        return true
      }
      if (c === 'KeyS') {
        cycleSort()
        return true
      }
      if (c === 'KeyP') {
        pinCurrent()
        return true
      }
      if (c === 'KeyC') {
        startReplace()
        return true
      }
      if (c === 'KeyX') {
        hoverDate = hoverDate ? null : (bars[shown[sel] ?? '']?.time.at(-1) ?? null)
        return true
      }
      if (k === '+' || k === ';' || c === 'NumpadAdd') {
        set({ size: Math.min(GRIDS.length - 1, size + 1), page: 0 })
        return true
      }
      if (k === '-' || c === 'NumpadSubtract') {
        set({ size: Math.max(0, size - 1), page: 0 })
        return true
      }
      if (c === 'KeyG') {
        // 対象を切り替える（Shift+G で逆順）。マウスの選択欄と同じ
        const opts = SRC_OPTIONS
        const i = opts.indexOf(src)
        set({ src: opts[(i + (e.shiftKey ? -1 : 1) + opts.length) % opts.length], page: 0 })
        sel = 0
        return true
      }
      if (c === 'KeyF' && e.shiftKey) {
        set({ favOnly: !favOnly, page: 0 })
        sel = 0
        return true
      }
      if (c === 'KeyF') {
        if (shown[sel]) toggleFav(shown[sel]!)
        return true
      }
      if (c === 'Space' && e.shiftKey) {
        set({ candOnly: !candOnly, page: 0 })
        sel = 0
        return true
      }
      if (c === 'Space') {
        toggleCand(shown[sel])
        return true
      }
      if (k === 'Enter') {
        zoom = zoom ? null : (shown[sel] ?? null)
        return true
      }
      if (k === 'Delete' && src === 'own') {
        const id = shown[sel]
        if (id) {
          set({ own: own.filter((x) => x !== id) })
          sel = Math.max(0, sel - 1)
          toast(t('grid.removed', { name: nameOf(id) }))
        }
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
const SRC_OPTIONS = $derived(['own', 'live', ...app.screens.map((s) => `scr:${s.id}`), ...app.watchlists.map((w) => w.id)])
</script>

<PaneHeader {pane}>
  <span class="dim">{srcLabel(src)} · {t('list.items', { n: codes.length })}</span>
</PaneHeader>
<div class="bar">
  <span class="lbl">{t('grid.src')}</span>
  <select class="srcsel" title={`${t('grid.src')} (G / Shift+G)`} value={src} onchange={(e) => set({ src: (e.currentTarget as HTMLSelectElement).value, page: 0 })}>
    {#each SRC_OPTIONS as s (s)}<option value={s}>{srcLabel(s)}</option>{/each}
  </select>
  <span class="sep"></span>
  <span class="seg">{#each ['D', 'W', 'M'] as x (x)}<button type="button" aria-pressed={tf === x} onclick={() => set({ tf: x })} title={`${t(`tf.${x}` as Key)} (${x})`}>{x}</button>{/each}</span>
  <span class="sep"></span>
  <PeriodPicker value={period} onchange={(v) => set({ period: v ?? 2 })} />
  <span class="sep"></span>
  <span class="lbl">{t('grid.scale')}</span>
  <span class="seg">
    <button type="button" aria-pressed={scale === 0} onclick={() => set({ scale: 0 })}>{t('grid.linear')}</button>
    <button type="button" aria-pressed={scale === 1} title={`${t('grid.log')} (L)`} onclick={() => set({ scale: 1 })}>{t('grid.log')}</button>
    <button type="button" aria-pressed={scale === 2} title={`${t('grid.norm')} (N)`} onclick={() => set({ scale: 2 })}>{t('grid.norm')}</button>
  </span>
  <button type="button" class="toggle" class:on={ma} title={`${t('grid.ma')} (I)`} onclick={() => set({ ma: !ma })}><span class="box"></span>{t('grid.ma')}</button>
  <span class="sep"></span>
  <span class="lbl">{t('grid.sort')}</span>
  <button type="button" class="chip" title={`${t('grid.sort')} (S)`} onclick={cycleSort}>{sortLabel}</button>
  <span class="grow"></span>
  <button type="button" class="toggle" class:on={favOnly} aria-label={t('list.starOnlyLabel')} title={`${t('list.starOnlyLabel')} (Ctrl+Shift+F)`} onclick={() => set({ favOnly: !favOnly, page: 0 })}><span class="box"></span>★</button>
  <button type="button" class="toggle" class:on={candOnly} aria-label={t('grid.candOnlyLabel')} title={`${t('grid.candOnlyLabel')} (Shift+Space)`} onclick={() => set({ candOnly: !candOnly, page: 0 })}><span class="box"></span>◆ <span class="num">{candidates()?.items.length ?? 0}</span></button>
  <button type="button" class="ibtn" aria-label={t('grid.toListLabel')} title={`${t('grid.toListLabel')} (${keyOf('addTo')})`} onclick={candToList}><Icon name="listAdd" /></button>
  <button type="button" class="ibtn" aria-label={t('grid.pin')} title={`${t('grid.pinTip')} (P)`} onclick={pinCurrent}><Icon name="pin" /></button>
  <span class="sep"></span>
  <button type="button" class="chip" title={`${t('grid.finer')} (+)`} aria-label={t('grid.finer')} onclick={() => set({ size: Math.max(0, size - 1), page: 0 })}>−</button>
  <span class="num">{dims[0]}×{dims[1]}</span>
  <button type="button" class="chip" title={`${t('grid.coarser')} (−)`} aria-label={t('grid.coarser')} onclick={() => set({ size: Math.min(GRIDS.length - 1, size + 1), page: 0 })}>＋</button>
  <span class="pager">
    <button type="button" class="chip" title={`${t('grid.prevPage')} (PageUp)`} aria-label={t('grid.prevPage')} disabled={Math.min(page, pages - 1) <= 0} onclick={() => goPage(-1, 0)}>‹</button>
    <span class="num muted">{t('grid.page', { p: Math.min(page, pages - 1) + 1, n: pages })}</span>
    <button type="button" class="chip" title={`${t('grid.nextPage')} (PageDown)`} aria-label={t('grid.nextPage')} disabled={Math.min(page, pages - 1) >= pages - 1} onclick={() => goPage(1, 0)}>›</button>
  </span>
</div>
<div class="tiles" use:symbolDrop={addOwn} class:dense={cols >= 5} bind:this={tiles} style:grid-template-columns={`repeat(${cols}, 1fr)`} style:grid-template-rows={`repeat(${rows}, 1fr)`}>
  {#if !shown.length}
    <div class="state">{src === 'own' ? t('grid.emptyOwn') : t('grid.empty')}</div>
  {/if}
  {#each shown as id, i (id)}
    {@const m = metric(id)}
    {@const r = periodRet(id)}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div
      class="tile"
      use:symbolDrop={(x) => dropAt(i, x)}
      class:sel={i === sel && !zoom}
      class:cand={isCand(id)}
      onclick={() => { sel = i; send() }}
      ondblclick={() => (zoom = zoom ? null : id)}
      onmousemove={(e) => {
        const b = bars[id]
        const cv = (e.currentTarget as HTMLElement).querySelector('canvas')!
        const rc = cv.getBoundingClientRect()
        if (!b || !b.time.length) return
        const k = Math.max(0, Math.min(b.time.length - 1, Math.floor(((e.clientX - rc.left) / (rc.width - 48)) * b.time.length)))
        hoverDate = b.time[k]!
      }}
      onmouseleave={() => (hoverDate = null)}
    >
      <div class="h">
        <span class="c">{codeOf(id)}</span><span class="n">{nameOf(id)}</span><span class="p num">{px(m?.close)}</span><span class={`r num ${cls(r)}`}>{sgn(r, 1, '%')}</span>
        {#if zoom}<button type="button" class="back" title={`${t('grid.unzoom')} (Esc)`} onclick={(e) => { e.stopPropagation(); zoom = null }}>⤡ {t('grid.unzoom')}</button>{/if}
      </div>
      <div class="s">
        <button type="button" class="star" class:on={isFav(id)} title={`${t('act.fav')} (F)`} onclick={(e) => { e.stopPropagation(); sel = i; toggleFav(id) }}>★</button>
        <button type="button" class="dia" class:on={isCand(id)} title={`${t('grid.candToggle')} (Space)`} onclick={(e) => { e.stopPropagation(); sel = i; toggleCand(id) }}>◆</button>
        <span class="y num">{m?.yieldTrailing != null ? `${fmt(m.yieldTrailing)}%` : ''}</span>
        <button type="button" class="edit" title={`${t('grid.replace')} (C)`} onclick={(e) => { e.stopPropagation(); startReplace(i) }}>✎</button>
        {#if src === 'own'}<button type="button" class="edit" title={`${t('grid.remove')} (Delete)`} onclick={(e) => { e.stopPropagation(); sel = i; set({ own: own.filter((x) => x !== id) }) }}>✕</button>{/if}
      </div>
      <canvas data-id={id}></canvas>
    </div>
  {/each}
</div>

<div class="hint muted">{zoom ? t('grid.zoomHint') : t('grid.editHint')}</div>

<style>
  .hint {
    flex: none;
    font-size: var(--fs-1);
    padding: 3px var(--s-2);
    border-top: 1px solid var(--line);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .back {
    flex: none;
    margin-left: auto;
    background: var(--panel-3);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    color: var(--text-2);
    padding: 0 8px;
    font-size: var(--fs-1);
    cursor: pointer;
  }
  .back:hover {
    color: var(--text);
  }
  .edit {
    background: none;
    border: 0;
    color: var(--text-3);
    cursor: pointer;
    padding: 0 3px;
    opacity: 0;
    font-size: var(--fs-1);
  }
  .tile:hover .edit,
  .tile.sel .edit {
    opacity: 1;
  }
  :global(:root[data-input='pointer']) .tile.sel:not(:hover) .edit {
    opacity: 0;
  }
  .edit:hover {
    color: var(--text);
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 var(--s-2);
    border-bottom: 1px solid var(--line);
    flex: none;
    font-size: var(--fs-1);
    color: var(--text-3);
    white-space: nowrap;
    overflow: hidden;
  }
  .pager {
    display: inline-flex;
    align-items: center;
    gap: var(--s-1);
  }
  .pager .chip:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .sep {
    width: 1px;
    height: 14px;
    background: var(--line-strong);
    margin: 0 2px;
    flex: none;
  }
  .grow {
    flex: 1;
  }
  .srcsel {
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    height: 20px;
    font-size: var(--fs-1);
    max-width: 180px;
  }
  .tiles {
    flex: 1;
    min-height: 0;
    display: grid;
    gap: 1px;
    background: var(--line);
    position: relative;
  }
  .tile {
    position: relative;
    background: var(--panel);
    cursor: pointer;
    min-width: 0;
    min-height: 0;
  }
  .tile.sel {
    box-shadow: inset 0 0 0 1px var(--focus);
  }
  /* マウスで操作しているときは枠を出さず、ポインタを載せたタイルを淡く縁取る（FR-KB3） */
  :global(:root[data-input='pointer']:not([data-focus-always='true'])) .tile.sel {
    box-shadow: none;
  }
  :global(:root[data-input='pointer']) .tile:hover {
    box-shadow: inset 0 0 0 1px var(--line-strong);
  }
  .tile.cand .h {
    box-shadow: inset 2px 0 0 var(--gold);
  }
  .h {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    height: 20px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 6px;
    font-size: var(--fs-1);
    z-index: 1;
  }
  .c {
    font-family: var(--mono);
    color: var(--text-2);
  }
  .n {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .s {
    position: absolute;
    left: 6px;
    top: 20px;
    display: flex;
    gap: 6px;
    align-items: center;
    font-size: var(--fs-1);
    z-index: 1;
  }
  .y {
    color: var(--text-3);
  }
  .dia {
    color: var(--text-3);
    cursor: pointer;
    background: none;
    border: 0;
    padding: 0;
    font-size: var(--fs-1);
  }
  .dia.on {
    color: var(--gold);
  }
  .tiles.dense .y {
    display: none;
  }
  canvas {
    position: absolute;
    left: 0;
    right: 0;
    top: 36px;
    bottom: 2px;
    width: 100%;
    height: calc(100% - 38px);
  }
</style>
