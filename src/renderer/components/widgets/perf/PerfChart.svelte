<script lang="ts" module>
/** チャートに描く 1 本の線（基準日を 100 にした値） */
export interface PfLine {
  id: string
  /** 札・小箱の短い名前 */
  label: string
  /** 線の色（CSS の値。var(--pf-1) など） */
  color: string
  bench: boolean
  /** 破線（1343） */
  dash: boolean
  t: string[]
  v: number[]
}
</script>

<script lang="ts">
// パフォーマンス比較のチャート（docs/design-perf.md §2.5）: SVG の線・100 の水平線・基準日の縦線・右端の札・十字線と値の順の小箱・継ぎ目の印。
// 形の計算は lib/perf.ts。線の d は十字線と切り離して作り（十字線を動かしても作り直さない）、画素の幅に間引く
import type { JstDate } from '@shared/types'
import { localX } from '../../../lib/pointer'
import {
  crossBox,
  dayNum,
  fitLabel,
  keepSpaced,
  labelWidth,
  nearestDay,
  layoutEndLabels,
  type PfFrame,
  type PfMode,
  pfTick,
  pfValue,
  slash,
  thinIdx,
  timeTicks,
  valueAt,
  valueTicks,
  yRange,
} from '../../../lib/perf'
import { t } from '../../../stores/app.svelte'

let {
  lines,
  frame,
  mode,
  log,
  cross,
  axis,
  sel,
  solo,
  oncross,
  onleave,
  svg = $bindable(),
}: {
  lines: PfLine[]
  frame: PfFrame
  mode: PfMode
  log: boolean
  cross: JstDate | null
  /** 十字線が止まる日（すべての線の日付） */
  axis: JstDate[]
  /** 強調する線（一覧にフォーカスしているときの選んだ行。無ければ null） */
  sel: string | null
  /** H: 選んだ線だけ色・ほかは灰 */
  solo: boolean
  oncross: (d: JstDate | null) => void
  /** マウスがチャートの外へ出た */
  onleave?: () => void
  svg?: SVGSVGElement | undefined
} = $props()

let box = $state<HTMLDivElement>()
/** clipPath の ID（ペインごと。同じ窓に 2 枚あっても混ざらない） */
const uid = $props.id()
const clipId = `pfclip-${uid}`
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

/** 右端の札の幅（狭いと札を出さない） */
const labelW = $derived(labelWidth(w))
/** 札の文字を置ける幅（文字の始まり lx + 3 から SVG の右の端まで。2px あける） */
const labelTextW = $derived(labelW - 13)
const pad = $derived({ l: 50, r: 10 + labelW, t: 10, b: 24 })
const iw = $derived(Math.max(1, w - pad.l - pad.r))
const ih = $derived(Math.max(1, h - pad.t - pad.b))
const x0 = $derived(dayNum(frame.base))
const x1 = $derived(dayNum(frame.end))
const X = $derived((d: JstDate) => pad.l + (x1 > x0 ? ((dayNum(d) - x0) / (x1 - x0)) * iw : 0))
const range = $derived(yRange(lines.flatMap((l) => l.v), log))
const tr = $derived(log ? Math.log : (v: number) => v)
const Y = $derived((v: number) => pad.t + (1 - (tr(v) - tr(range.lo)) / (tr(range.hi) - tr(range.lo) || 1)) * ih)
const vTicks = $derived(valueTicks(range.lo, range.hi, log))
const tTicks = $derived(timeTicks(frame.base, frame.end))
/** 目盛りの文字は 56px 以上あける */
const tShow = $derived(keepSpaced(tTicks.map((k) => X(k.d)), 56))
const ok = $derived(w >= 120 && h >= 80)
const baseText = $derived(t('pf.baseLabel', { d: slash(frame.base), v: mode === 'idx' ? '100' : '0%' }))

/** 線の d（十字線と切り離す） */
const paths = $derived(
  ok
    ? lines.map((l) => {
        let d = ''
        for (const i of thinIdx(l.t.length, iw)) d += `${d ? 'L' : 'M'}${X(l.t[i]!).toFixed(1)} ${Y(l.v[i]!).toFixed(1)}`
        return { id: l.id, d }
      })
    : [],
)
/** 線の見た目（選んだ線を太く、ほかを薄く。H は選んだ線だけ色） */
function strokeOf(l: PfLine): { color: string; width: number; opacity: number } {
  const on = sel === l.id
  const color = solo && sel && !on ? 'var(--line-strong)' : l.color
  return { color, width: on ? 3 : 2, opacity: sel && !on ? (solo ? 0.9 : 0.3) : 1 }
}
/** 右端の札（いつも線の終点の値。十字線では動かさない） */
const labels = $derived.by(() => {
  if (!ok || !labelW) return []
  const items = lines.map((l) => ({ l, v: l.v.at(-1)!, y0: Y(l.v.at(-1)!), ex: X(l.t.at(-1)!) }))
  const ys = layoutEndLabels(
    items.map((x) => x.y0),
    pad.t + 6,
    h - pad.b - 6,
    17,
  )
  return items.map((x, i) => ({ ...x, y: ys[i]! }))
})
const crossItems = $derived(cross ? crossBox(lines.map((l) => ({ l, v: valueAt(l, cross) }))) : [])
const cx = $derived(cross ? X(cross) : 0)
const boxW = 150
const boxLeft = $derived(cx + 14 + boxW > w - pad.r ? cx - 14 - boxW : cx + 14)

function onmove(e: MouseEvent) {
  if (!ok || !box || !axis.length) return
  const x = localX(e.clientX, box.getBoundingClientRect(), box.clientWidth)
  const day = x0 + ((x - pad.l) / iw) * (x1 - x0)
  if (day < x0 - 2 || day > x1 + 2) return
  const pick = nearestDay(axis, day)
  if (pick && pick !== cross) oncross(pick)
}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="pf-chart" bind:this={box} onmousemove={onmove} onmouseleave={() => onleave?.()}>
  {#if ok}
    <svg
      bind:this={svg}
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      data-base={frame.base}
      data-end={frame.end}
      data-monthly={frame.monthly ? '1' : '0'}
      data-stitch={frame.stitch ?? ''}
      data-lines={lines.length}
      role="img"
      aria-label={t('pf.chartLabel', { d: slash(frame.base), n: lines.length })}
    >
      {#each vTicks as v (v)}
        <line x1={pad.l} x2={w - pad.r} y1={Y(v)} y2={Y(v)} stroke="var(--chart-grid)" />
        <text class="ax" x={pad.l - 6} y={Y(v) + 3.5} text-anchor="end">{pfTick(v, mode)}</text>
      {/each}
      {#each tTicks as k, i (k.d)}
        {@const x = X(k.d)}
        <line x1={x} x2={x} y1={pad.t} y2={h - pad.b} stroke="var(--chart-grid)" />
        {#if tShow[i] && (!cross || Math.abs(x - cx) > 60)}<text class="ax" x={x} y={h - 7} text-anchor="middle">{k.label}</text>{/if}
      {/each}
      <line x1={pad.l} x2={w - pad.r} y1={Y(100)} y2={Y(100)} stroke="var(--text-3)" />
      <line x1={pad.l} x2={pad.l} y1={pad.t} y2={h - pad.b} stroke="var(--text-3)" stroke-dasharray="3 3" />
      <rect fill="var(--panel)" opacity="0.92" x={pad.l + 4} y={pad.t} width={baseText.length * 6.6 + 10} height="16" rx="2" />
      <text class="ax dim" x={pad.l + 8} y={pad.t + 12}>{baseText}</text>
      {#if frame.stitch}
        {@const sx = X(frame.stitch)}
        <line x1={sx} x2={sx} y1={h - pad.b - 6} y2={h - pad.b} stroke="var(--warn)" />
        <text class="ax warn" x={sx + 4} y={h - pad.b - 8}>{t('pf.stitch')}</text>
      {/if}
      <clipPath id={clipId}><rect x={pad.l} y={pad.t - 2} width={iw + 4} height={ih + 4} /></clipPath>
      <g clip-path={`url(#${clipId})`}>
        {#each paths as p, i (p.id)}
          {@const l = lines[i]!}
          {@const s = strokeOf(l)}
          <path d={p.d} data-id={l.id} fill="none" stroke={s.color} stroke-width={s.width} stroke-dasharray={l.dash ? '6 3' : undefined} stroke-linejoin="round" opacity={s.opacity} />
        {/each}
      </g>
      {#each labels as x (x.l.id)}
        {@const s = strokeOf(x.l)}
        {@const lx = w - pad.r + 18}
        <path d={`M${x.ex + 3} ${x.y0} L${lx - 8} ${x.y}`} stroke={x.l.color} stroke-width="1" fill="none" opacity={s.opacity < 1 ? 0.3 : 0.7} />
        <circle cx={lx - 4} cy={x.y} r="3.5" fill={s.opacity < 1 ? 'var(--line-strong)' : x.l.color} />
        <text class="lbl" data-label={x.l.id} x={lx + 3} y={x.y + 4} opacity={s.opacity < 1 ? 0.5 : 1}>{fitLabel(x.l.label, pfValue(x.v, mode), labelTextW)} <tspan class="lv">{pfValue(x.v, mode)}</tspan></text>
      {/each}
      {#if cross}
        <g data-noimg>
          <line x1={cx} x2={cx} y1={pad.t} y2={h - pad.b} stroke="var(--chart-cross)" stroke-dasharray="3 3" />
          {#each crossItems as x (x.l.id)}
            <circle cx={cx} cy={Y(x.v)} r="4" fill={strokeOf(x.l).color} stroke="var(--panel)" stroke-width="2" />
          {/each}
          <rect x={boxLeft} y={pad.t + 22} width={boxW} height={10 + crossItems.length * 16} rx="3" fill="var(--panel-2)" stroke="var(--line-strong)" opacity="0.96" />
          {#each crossItems as x, j (x.l.id)}
            {@const yy = pad.t + 38 + j * 16}
            <circle cx={boxLeft + 10} cy={yy - 4} r="3.5" fill={strokeOf(x.l).color} />
            <text class="lbl sm" x={boxLeft + 19} y={yy}>{fitLabel(x.l.label, pfValue(x.v, mode), boxW - 27)}</text>
            <text class="ax val" data-cross={x.l.id} x={boxLeft + boxW - 8} y={yy} text-anchor="end">{pfValue(x.v, mode)}</text>
          {/each}
          <rect fill="var(--panel)" opacity="0.92" x={cx - 38} y={h - pad.b + 3} width="76" height="16" rx="2" />
          <text class="ax focus" x={cx} y={h - 7} text-anchor="middle">{slash(cross)}</text>
        </g>
      {/if}
    </svg>
  {/if}
</div>

<style>
  .pf-chart {
    flex: 1 1 0;
    min-height: 160px;
    position: relative;
    overflow: hidden;
  }
  svg {
    position: absolute;
    inset: 0;
    overflow: visible;
  }
  .ax {
    font-family: var(--mono);
    font-size: 10.5px;
    fill: var(--text-3);
  }
  .ax.dim {
    fill: var(--text-2);
  }
  .ax.warn {
    fill: var(--warn);
  }
  .ax.focus {
    fill: var(--focus);
  }
  .ax.val {
    fill: var(--text);
    font-weight: 600;
  }
  .lbl {
    font-family: var(--font);
    font-size: 12px;
    fill: var(--text);
  }
  .lbl.sm {
    font-size: 11px;
  }
  .lv {
    font-family: var(--mono);
    font-weight: 600;
  }
</style>
