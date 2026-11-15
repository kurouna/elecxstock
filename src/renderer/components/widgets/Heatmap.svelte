<script lang="ts">
// heatmap（§6.3）: 33 業種と銘柄のツリーマップ。面積 = 時価総額、色 = 騰落率（P で期間を切り替え）。
// 矢印で長方形を移り、Enter で業種の中へ（銘柄はリンクグループへ送る）、Esc / Backspace で業種へ戻る。
import type { InstrumentId } from '@shared/types'
import { onMount } from 'svelte'
import { fmt, money, sgn } from '../../lib/format'
import type { Key } from '../../lib/i18n'
import { registerPane } from '../../lib/panes'
import { SelectionFollow } from '../../lib/selection'
import { neighbor, type Placed, squarify } from '../../lib/treemap'
import { app, bridge, inst, isFav, nameOf, t } from '../../stores/app.svelte'
import { type PaneNode, patchState, setLinkSymbol } from '../../stores/layout.svelte'
import PaneHeader from '../PaneHeader.svelte'

let { pane }: { pane: PaneNode } = $props()
const PERIODS = [
  { col: 'chgPct', key: 'heat.1d', range: 3 },
  { col: 'ret1m', key: 'heat.1m', range: 10 },
  { col: 'ret3m', key: 'heat.3m', range: 15 },
  { col: 'ret1y', key: 'heat.1y', range: 30 },
] as const
const pi = $derived((pane.state.period as number) ?? 0)
const per = $derived(PERIODS[pi] ?? PERIODS[0])
const sector = $derived((pane.state.sector as string | null) ?? null)
const starOnly = $derived(!!pane.state.starOnly)
let ids = $state<InstrumentId[]>([])
let sel = $state(0)
let host = $state<HTMLDivElement>()
let W = $state(600)
let H = $state(400)

async function run() {
  const r = await bridge.call('screener.run', {
    conditions: [
      { field: 'attr.market', op: 'in', value: ['P'] },
      { field: 'attr.kind', op: 'in', value: ['stock'] },
    ],
    favorites: [],
    watchlists: {},
  })
  for (const row of r.rows) app.metrics.set(row.id, row)
  ids = r.ids
}
$effect(() => {
  void app.dataVersion
  void run()
})
const ret = (id: InstrumentId) => (app.metrics.get(id) as unknown as Record<string, number | null> | undefined)?.[per.col] ?? null
const cap = (id: InstrumentId) => app.metrics.get(id)?.marketCap ?? 0
const secName = (s: string) => {
  const i = ids.find((x) => inst(x)?.sectorJa === s)
  const ins = i ? inst(i) : undefined
  return app.settings.lang === 'en' ? ins?.sectorEn || s : s
}
interface Cell {
  key: string
  label: string
  cap: number
  ret: number | null
  id?: InstrumentId
}
const cells = $derived.by((): Cell[] => {
  void app.metrics.size
  const pool = starOnly ? ids.filter((x) => isFav(x)) : ids
  if (sector) {
    return pool.filter((x) => inst(x)?.sectorJa === sector).map((x) => ({ key: x, label: nameOf(x), cap: cap(x), ret: ret(x), id: x }))
  }
  const by = new Map<string, { cap: number; w: number; n: number }>()
  for (const x of pool) {
    const s = inst(x)?.sectorJa || '—'
    const c = cap(x)
    const r = ret(x)
    const e = by.get(s) ?? { cap: 0, w: 0, n: 0 }
    e.cap += c
    if (r != null && c > 0) {
      e.w += r * c // 時価総額で加重した騰落率
      e.n += c
    }
    by.set(s, e)
  }
  return [...by].map(([s, e]) => ({ key: s, label: secName(s), cap: e.cap, ret: e.n ? e.w / e.n : null }))
})
const placed = $derived<Placed<Cell>[]>(squarify(cells, (c) => c.cap, { x: 0, y: 0, w: W, h: H }))
// 取得で時価総額が変わってタイルの並びが入れ替わっても、選んでいたタイル（業種・銘柄）から動かない。消えたら最後に寄せる
const follow = new SelectionFollow<Placed<Cell>>((p) => p.item.key)
$effect(() => {
  const s = follow.sync(placed, sel).sel
  if (s !== sel) sel = s
})
/** 色: 上昇は --up、下落は --down、期間の幅で濃さを決める */
function color(r: number | null): string {
  if (r == null) return 'var(--panel-3)'
  const a = Math.min(1, Math.abs(r) / per.range)
  const c = r >= 0 ? 'var(--up)' : 'var(--down)'
  return `color-mix(in srgb, ${c} ${Math.round(18 + a * 62)}%, var(--panel))`
}
function enter(i = sel) {
  const p = placed[i]
  if (!p) return
  if (p.item.id) setLinkSymbol(pane.link, p.item.id)
  else {
    patchState(pane, { sector: p.item.key })
    sel = 0
    follow.reset()
  }
}
function back() {
  if (!sector) return false
  const s = sector
  patchState(pane, { sector: null })
  follow.reset()
  queueMicrotask(
    () =>
      (sel = Math.max(
        0,
        placed.findIndex((p) => p.item.key === s),
      )),
  )
  return true
}

onMount(() => {
  const ro = new ResizeObserver(() => {
    W = host?.clientWidth ?? 600
    H = host?.clientHeight ?? 400
  })
  if (host) ro.observe(host)
  const off = registerPane(pane.id, {
    current: () => placed[sel]?.item.id,
    selected: () => {
      const p = placed[sel]
      if (p?.item.id) return [p.item.id]
      return ids.filter((x) => inst(x)?.sectorJa === p?.item.key)
    },
    key(e) {
      const k = e.key
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyF') {
        patchState(pane, { starOnly: !starOnly })
        return true
      }
      if (e.ctrlKey || e.altKey || e.metaKey) return false
      const dir = ({ ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' } as const)[k as 'ArrowLeft']
      if (dir) {
        sel = neighbor(placed, sel, dir)
        if (placed[sel]?.item.id) setLinkSymbol(pane.link, placed[sel]!.item.id!)
        return true
      }
      if (k === 'Enter') {
        enter()
        return true
      }
      if (k === 'Escape' || k === 'Backspace') return back()
      if (e.code === 'KeyP') {
        patchState(pane, { period: (pi + (e.shiftKey ? PERIODS.length - 1 : 1)) % PERIODS.length })
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

<PaneHeader {pane} collapse={600}>
  <button type="button" class="chip" disabled={!sector} onclick={back}>{sector ? `← ${secName(sector)}` : t('heat.sectors')}</button>
  <span class="lbl">{t('heat.retLabel')}</span>
  <span class="seg" role="group" aria-label={t('heat.retPeriod')}>
    {#each PERIODS as p, i (p.col)}<button type="button" aria-pressed={pi === i} title={`${t('heat.retPeriod')} (P)`} onclick={() => patchState(pane, { period: i })}>{t(p.key as Key)}</button>{/each}
  </span>
  <button type="button" class="toggle" class:on={starOnly} aria-label={t('list.starOnlyLabel')} title={`${t('list.starOnlyLabel')} (Ctrl+Shift+F)`} onclick={() => patchState(pane, { starOnly: !starOnly })}><span class="box"></span>★</button>
</PaneHeader>
<div class="map" bind:this={host}>
  {#if !placed.length}<div class="state">{t('heat.empty')}</div>{/if}
  {#each placed as p, i (p.item.key)}
    <button
      type="button"
      class="cell"
      class:sel={i === sel}
      style:left={`${p.x}px`}
      style:top={`${p.y}px`}
      style:width={`${p.w}px`}
      style:height={`${p.h}px`}
      style:background={color(p.item.ret)}
      title={`${p.item.label} ${sgn(p.item.ret, 2, '%')} · ${money(p.item.cap).n}${money(p.item.cap).u}`}
      onclick={() => { sel = i; enter(i) }}
    >
      {#if p.w > 46 && p.h > 26}
        <span class="n">{p.item.label}</span>
        <span class="r num">{sgn(p.item.ret, p.w > 90 ? 2 : 1, '%')}</span>
        {#if p.h > 56 && p.w > 90}<span class="c num">{money(p.item.cap).n}{money(p.item.cap).u}</span>{/if}
      {/if}
    </button>
  {/each}
</div>
<div class="legend muted">
  <span>{t('heat.legend')}</span>
  <span class="scale">
    <i style:background={color(-per.range)}></i><i style:background={color(-per.range / 2)}></i><i style:background={color(0)}></i><i style:background={color(per.range / 2)}></i><i style:background={color(per.range)}></i>
  </span>
  <span class="num">−{fmt(per.range, 0)}% … +{fmt(per.range, 0)}%</span>
</div>

<style>
  .lbl {
    font-size: var(--fs-1);
    color: var(--text-3);
  }
  /* 狭いときは見出しの「騰落率」の言葉を省く（期間の切り替えは残す） */
  @container (max-width: 519px) {
    .lbl {
      display: none;
    }
  }
  .map {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  .cell {
    position: absolute;
    border: 1px solid var(--panel);
    padding: 4px 5px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: flex-start;
    gap: 1px;
    overflow: hidden;
    cursor: pointer;
    color: var(--text);
    text-align: left;
  }
  .cell.sel {
    outline: 2px solid var(--focus);
    outline-offset: -2px;
    z-index: 1;
  }
  .n {
    font-size: var(--fs-1);
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
  .r {
    font-size: var(--fs-2);
  }
  .c {
    font-size: var(--fs-0);
    color: var(--text-2);
  }
  .legend {
    flex: none;
    display: flex;
    gap: var(--s-2);
    align-items: center;
    font-size: var(--fs-1);
    padding: 3px var(--s-2);
    border-top: 1px solid var(--line);
  }
  .scale {
    display: inline-flex;
  }
  .scale i {
    width: 18px;
    height: 8px;
  }
</style>
