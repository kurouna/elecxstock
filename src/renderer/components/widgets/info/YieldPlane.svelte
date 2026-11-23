<script lang="ts">
// 配当と株価の平面（docs/design-yield-breakdown.md §2.3・§3.4。FR-I11）: 横 = 1 株配当（直近 12 か月）、縦 = 株価の両対数。
// 小さな図（文字なし）と広げた図で同じ部品。形の計算は lib/yieldPlane.ts。大きさは ResizeObserver の clientWidth・clientHeight（最大化の動きの途中で縮んで見えないように）
import type { YieldPoint } from '@shared/types'
import { fmt } from '../../../lib/format'
import { ISO_YIELDS, isoLines, labelDy, labelPos, logTicks, planeBox, textWidth, toXY, trail } from '../../../lib/yieldPlane'
import { ydT, yieldPct } from '../../../lib/yieldText'
import { t } from '../../../stores/app.svelte'

let {
  path,
  i0,
  cursor = null,
  small = false,
  reit = false,
}: {
  path: YieldPoint[]
  /** 期間の始まり（ここから今まで描く） */
  i0: number
  /** 十字線の月（広げた図だけ） */
  cursor?: string | null
  small?: boolean
  reit?: boolean
} = $props()

let box = $state<HTMLSpanElement>()
let w = $state(0)
let h = $state(0)
$effect(() => {
  const el = box
  if (!el) return
  const ro = new ResizeObserver(() => {
    w = el.clientWidth
    h = el.clientHeight
  })
  ro.observe(el)
  return () => ro.disconnect()
})
const pts = $derived(path.slice(i0))
const pad = $derived(small ? { l: 4, r: 4, t: 4, b: 4 } : { l: 64, r: 24, t: 14, b: 34 })
// 余白より少し広いときだけ描く（狭すぎる枠では描かない）
const b = $derived(w > pad.l + pad.r + 10 && h > pad.t + pad.b + 10 ? planeBox(pts, w, h, pad) : null)
const iso = $derived(b ? isoLines(b, ISO_YIELDS) : [])
const segs = $derived(b ? trail(pts, b) : [])
const first = $derived(pts.find((p) => p.div12 > 0))
const last = $derived(pts.at(-1))
const startIso = $derived(b && first ? isoLines(b, [first.div12 / first.price])[0] : undefined)
const nowIso = $derived(b && last && last.div12 > 0 ? isoLines(b, [last.div12 / last.price])[0] : undefined)
const startDy = $derived(labelDy(startIso, nowIso))
const xy = (p: YieldPoint): [number, number] => (b ? toXY(b, p.div12, p.price) : [0, 0])
const cur = $derived(cursor ? pts.find((p) => p.m === cursor && p.div12 > 0) : undefined)
// 札の文字と位置（枠からはみ出す側を避ける。lib/yieldPlane.ts の labelPos）
const startText = $derived(first ? t('yd.ov.isoStart', { m: first.m.replace('-', '/'), y: yieldPct(first.div12 / first.price) }) : '')
const nowIsoText = $derived(last && last.div12 > 0 ? t('yd.ov.isoNow', { y: yieldPct(last.div12 / last.price) }) : '')
const nowText = $derived(last && last.div12 > 0 ? t('yd.ov.now', { y: yieldPct(last.div12 / last.price) }) : '')
const startLp = $derived(startIso ? labelPos(startIso.x2, 'end', textWidth(startText, 12), 0, w) : null)
const nowIsoLp = $derived(nowIso ? labelPos(nowIso.x2, 'end', textWidth(nowIsoText, 12), 0, w) : null)
const nowXY = $derived(b && last && last.div12 > 0 ? xy(last) : null)
const nowLp = $derived(nowXY ? labelPos(nowXY[0], 'start', textWidth(nowText, 12), 0, w, 10) : null)
const yearLp = (x: number) => labelPos(x, 'start', textWidth('0000', 10.5), 0, w, 5)
const col = (tt: number) => `color-mix(in srgb, var(--yd-new) ${Math.round(tt * 100)}%, var(--yd-old))`
const xt = $derived(b && !small ? logTicks(Math.exp(b.lx0), Math.exp(b.lx1)) : [])
const yt = $derived(b && !small ? logTicks(Math.exp(b.ly0), Math.exp(b.ly1)) : [])
const tick = (v: number) => fmt(v, v < 1 ? 2 : v < 10 ? 1 : 0)
</script>

<span class="yd-plane" class:small bind:this={box} data-testid={small ? 'yd-thumb' : 'yd-plane'}>
  {#if b}
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={ydT('yd.ov.sub', reit)} data-points={pts.length}>
      {#each xt as v (v)}
        {@const x = toXY(b, v, 1)[0]}
        <line x1={x} x2={x} y1={pad.t} y2={h - pad.b} stroke="var(--chart-grid)" /><text class="yd-ax" x={x} y={h - 18} text-anchor="middle">{tick(v)}</text>
      {/each}
      {#each yt as v (v)}
        {@const y = toXY(b, 1, v)[1]}
        <line x1={pad.l} x2={w - pad.r} y1={y} y2={y} stroke="var(--chart-grid)" /><text class="yd-ax" x={pad.l - 6} y={y + 3.5} text-anchor="end">{tick(v)}</text>
      {/each}
      {#each iso as l (l.yield)}
        <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="var(--yd-iso)" />
        {#if !small}<text class="yd-iso" x={l.x2 - 4} y={l.y2 + 12} text-anchor="end">{Math.round(l.yield * 100)}%</text>{/if}
      {/each}
      {#if !small}
        {#if startIso && startLp}<line x1={startIso.x1} y1={startIso.y1} x2={startIso.x2} y2={startIso.y2} stroke="var(--yd-old)" stroke-width="1.5" stroke-dasharray="6 4" /><text class="yd-lbl" x={startLp.x} y={startIso.y2 + 26 + startDy} text-anchor={startLp.anchor} style:fill="var(--text-2)">{startText}</text>{/if}
        {#if nowIso && nowIsoLp}<line x1={nowIso.x1} y1={nowIso.y1} x2={nowIso.x2} y2={nowIso.y2} stroke="var(--yd-new)" stroke-width="1.5" stroke-dasharray="6 4" /><text class="yd-lbl" x={nowIsoLp.x} y={nowIso.y2 + 26} text-anchor={nowIsoLp.anchor} style:fill="var(--yd-new)">{nowIsoText}</text>{/if}
        <text class="yd-zone" x={w - pad.r} y={h - 4} text-anchor="end">{t(reit ? 'yd.ov.xAxisReit' : 'yd.ov.xAxis')}</text>
        <text class="yd-zone" x={4} y={pad.t + 10}>{t('yd.ov.yAxis')}</text>
        <text class="yd-zone" x={w - pad.r - 8} y={h - pad.b - 8} text-anchor="end">{t('yd.ov.high')}</text>
        <text class="yd-zone" x={pad.l + 8} y={pad.t + 26}>{t('yd.ov.low')}</text>
      {/if}
      {#each segs as s, k (k)}
        <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={col(s.t)} stroke-width={small ? 1 + s.t : 1.2 + s.t * 1.6} stroke-linecap="round" />
      {/each}
      {#if !small}
        {#each pts as p (p.m)}
          {#if p.div12 > 0 && (p.m.endsWith('-01') || p === first)}
            {@const q = xy(p)}
            {@const lp = yearLp(q[0])}
            <circle cx={q[0]} cy={q[1]} r="2.5" fill="var(--text-3)" /><text class="yd-ax yd-year" x={lp.x} y={q[1] - 4} text-anchor={lp.anchor}>{p.m.slice(0, 4)}</text>
          {/if}
        {/each}
      {/if}
      {#if first}{@const q = xy(first)}<circle cx={q[0]} cy={q[1]} r={small ? 2.5 : 4} fill="var(--yd-old)" />{/if}
      {#if last && last.div12 > 0}
        {@const q = xy(last)}
        <circle cx={q[0]} cy={q[1]} r={small ? 3.5 : 6} fill="var(--yd-now)" stroke="var(--panel)" stroke-width="2" />
        {#if !small && nowLp}<text class="yd-lbl" x={nowLp.x} y={q[1] + 4} text-anchor={nowLp.anchor}>{nowText}</text>{/if}
      {/if}
      {#if cur}
        {@const q = xy(cur)}
        <line x1={q[0]} x2={q[0]} y1={pad.t} y2={h - pad.b} stroke="var(--chart-cross)" stroke-dasharray="3 3" />
        <line x1={pad.l} x2={w - pad.r} y1={q[1]} y2={q[1]} stroke="var(--chart-cross)" stroke-dasharray="3 3" />
        <circle cx={q[0]} cy={q[1]} r="6" fill="none" stroke="var(--focus)" stroke-width="2" data-testid="yd-cross" />
      {/if}
    </svg>
  {/if}
</span>

<style>
  .yd-plane {
    display: block;
    position: relative;
    flex: 1;
    min-height: 0;
    min-width: 0;
  }
  .yd-plane.small {
    flex: none;
    width: 100%;
    height: 100%;
  }
  svg {
    position: absolute;
    inset: 0;
  }
  .yd-ax {
    font-family: var(--mono);
    font-size: 10.5px;
    fill: var(--text-3);
  }
  .yd-year {
    fill: var(--text-2);
  }
  .yd-iso {
    font-family: var(--font);
    font-size: 11px;
    fill: var(--yd-iso-t);
  }
  .yd-lbl {
    font-family: var(--font);
    font-size: 12px;
    fill: var(--text);
  }
  .yd-zone {
    font-family: var(--font);
    font-size: 11px;
    fill: var(--text-3);
  }
</style>
