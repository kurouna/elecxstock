<script lang="ts">
// market-overview（§6.3, FR-U6）: 指数・指数連動 ETF の小さなチャート群。
// 既定は日経平均・TOPIX 連動 ETF（1306。TOPIX そのものは Yahoo で取れない）・NYダウ・ドル/円（マーケット一覧の行。FR-U6）。
// 1〜9 で銘柄を足し、Delete で外す。D/W/M で時間軸、Alt+1〜6 で表示期間（チャートと同じ）、矢印で選び、Enter でリンクグループへ。
import { priceDigits } from '@shared/markets'
import type { Bars, InstrumentId, Timeframe } from '@shared/types'
import { onMount } from 'svelte'
import { cls, px, sgn } from '../../lib/format'
import { appendLimited } from '../../lib/gridNav'
import { latest } from '../../lib/latest'
import { registerPane } from '../../lib/panes'
import { marketBars, periodOfKey } from '../../lib/periods'
import { app, bridge, codeOf, nameOf, t, toast } from '../../stores/app.svelte'
import { type PaneNode, patchState, setLinkSymbol } from '../../stores/layout.svelte'
import PaneHeader from '../PaneHeader.svelte'
import PeriodPicker from '../PeriodPicker.svelte'
import { drawTile, tileLookKey } from './gridDraw'

let { pane }: { pane: PaneNode } = $props()
const DEFAULT = ['IDX:N225', 'JP:1306', 'IDX:DJI', 'IDX:USDJPY']
/** 小さなチャートの上限 */
const MAX = 12
const ids = $derived((pane.state.ids as InstrumentId[] | undefined) ?? DEFAULT)
const tf = $derived(((pane.state.tf as Timeframe) ?? 'D') as Timeframe)
/** 表示期間（PERIODS の位置）。無ければ時間軸ごとの既定の本数 */
const period = $derived(pane.state.period as number | undefined)
let bars = $state<Record<string, Bars>>({})
let sel = $state(0)
let host = $state<HTMLDivElement>()

const fresh = latest()
async function load() {
  const ok = fresh()
  const r = await bridge.call('bars.many', { ids: [...ids], tf, count: marketBars(period, tf) })
  if (!ok()) return // 時間軸・期間を続けて変えたとき、古い応答で上書きしない
  bars = r
  queueMicrotask(draw)
}
function draw() {
  for (const cv of host?.querySelectorAll<HTMLCanvasElement>('canvas') ?? []) {
    const id = cv.dataset.id!
    drawTile(cv, bars[id], bars[id], {
      tf,
      scale: 0,
      ma: true,
      hoverDate: null,
      // 目盛りは 1,000 以上なら整数（日経平均の小数 2 桁で幅を取らない）
      fmtPx: (v) => px(v, Math.abs(v) >= 1000 ? 0 : priceDigits(id)),
      fmtPct: (v) => sgn(v, 0, '%'),
    })
  }
}
$effect(() => {
  void ids.join()
  void tf
  void period
  void app.dataVersion
  void load()
})
// テーマ・陽線/陰線の色を替えたら描き直す（取り直さない。タイルは描くときに CSS の変数を読む）
let raf = 0
$effect(() => {
  void tileLookKey(app.settings)
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(draw)
})
const ret = (id: InstrumentId) => {
  const b = bars[id]
  return b && b.close.length > 1 ? (b.close.at(-1)! / b.close.at(-2)! - 1) * 100 : null
}
const send = () => ids[sel] && setLinkSymbol(pane.link, ids[sel]!)

onMount(() => {
  // 連動 ETF（1306 など）は Core が取得の対象に入れる（FR-U6）。利用者の追加にはしない
  const ro = new ResizeObserver(() => draw())
  if (host) ro.observe(host)
  const off = registerPane(pane.id, {
    current: () => ids[sel],
    receive: (id) => {
      const r = appendLimited(ids, id, MAX)
      if (r.result === 'added') {
        patchState(pane, { ids: r.ids })
        toast(t('grid.added', { name: nameOf(id) }))
      } else if (r.result === 'full') toast(t('mkt.full', { n: MAX }))
      return true
    },
    key(e) {
      const p = periodOfKey(e)
      if (p != null) {
        patchState(pane, { period: p })
        return true
      }
      if (e.ctrlKey || e.altKey || e.metaKey) return false
      const k = e.key
      if (k === 'ArrowRight' || k === 'ArrowDown') {
        sel = Math.min(ids.length - 1, sel + 1)
        send()
        return true
      }
      if (k === 'ArrowLeft' || k === 'ArrowUp') {
        sel = Math.max(0, sel - 1)
        send()
        return true
      }
      if (k === 'Enter') {
        send()
        return true
      }
      if (!e.shiftKey && (e.code === 'KeyD' || e.code === 'KeyW' || e.code === 'KeyM')) {
        patchState(pane, { tf: e.code.slice(3) })
        return true
      }
      if (k === 'Delete' && ids[sel]) {
        patchState(pane, { ids: ids.filter((x) => x !== ids[sel]) })
        sel = Math.max(0, sel - 1)
        return true
      }
      return false
    },
  })
  return () => {
    ro.disconnect()
    cancelAnimationFrame(raf)
    off()
  }
})
</script>

<PaneHeader {pane}>
  <span class="seg">{#each ['D', 'W', 'M'] as x (x)}<button type="button" aria-pressed={tf === x} onclick={() => patchState(pane, { tf: x })}>{x}</button>{/each}</span>
  <PeriodPicker allowDefault value={period} onchange={(v) => patchState(pane, { period: v })} />
  <span class="muted hint">{t('mkt.hint')}</span>
</PaneHeader>
<div class="tiles" bind:this={host}>
  {#each ids as id, i (id)}
    {@const b = bars[id]}
    {@const r = ret(id)}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="tile" class:sel={i === sel} onclick={() => { sel = i; send() }}>
      <div class="h">
        <span class="c">{codeOf(id)}</span><span class="n">{nameOf(id)}</span>
        <span class="p num">{px(b?.close.at(-1), priceDigits(id))}</span><span class={`r num ${cls(r)}`}>{sgn(r, 2, '%')}</span>
      </div>
      {#if b && !b.time.length}<div class="state small">{t('chart.noData')}</div>{/if}
      <canvas data-id={id}></canvas>
    </div>
  {/each}
</div>

<style>
  .hint {
    font-size: var(--fs-1);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tiles {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    grid-auto-rows: minmax(120px, 1fr);
    gap: 1px;
    background: var(--line);
    overflow: auto;
  }
  .tile {
    position: relative;
    background: var(--panel);
    display: flex;
    flex-direction: column;
    min-height: 0;
    cursor: pointer;
  }
  .tile.sel {
    box-shadow: inset 0 0 0 1px var(--focus);
  }
  .h {
    display: flex;
    gap: 6px;
    align-items: baseline;
    padding: 4px 6px 0;
    font-size: var(--fs-1);
    white-space: nowrap;
  }
  .c {
    font-family: var(--mono);
    color: var(--text-3);
  }
  .n {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
  }
  canvas {
    flex: 1;
    min-height: 0;
    width: 100%;
  }
</style>
