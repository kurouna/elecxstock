<script lang="ts">
// 資産推移の図（FR-PF3・PF4）: 評価額は中立の線、取得額は破線の階段、その間の帯を含み損益の色で塗る（取得額より上は上昇の色、下は下落の色）。
// % にすると時間加重の概算とベンチマーク。記録の前の試算は細い中立の線だけ（数に入れない）
import type { FolioSeriesPoint } from '@shared/types'
import { histGeom, histIndexAt, manYen, monthTicks, pctGeom, signPct, yenFull } from '../../../lib/folio'
import { localX } from '../../../lib/pointer'
import { t } from '../../../stores/app.svelte'

let {
  points,
  pct,
  twr,
  bench,
  benchName = '',
  cross,
  onhover,
}: {
  points: FolioSeriesPoint[]
  pct: boolean
  twr: number[]
  bench: number[] | null
  /** ベンチマークの名前（十字線の値に出す） */
  benchName?: string
  cross: number
  onhover: (i: number) => void
} = $props()
let w = $state(0)
let h = $state(0)
const uid = $props.id()
const real = $derived(points.filter((p) => p.src !== 'est'))
const g = $derived(w > 20 && h > 20 && points.length ? histGeom(points, w, h) : null)
const pg = $derived(w > 20 && h > 20 && pct && real.length ? pctGeom([twr, ...(bench ? [bench] : [])], real.length, w, h) : null)
const ticksM = $derived(monthTicks((pct ? real : points).map((p) => p.d)))
const n = $derived(pct ? real.length : points.length)
const ci = $derived(cross >= 0 ? Math.min(cross, n - 1) : -1)
const cp = $derived(ci >= 0 ? (pct ? real : points)[ci] : undefined)
// 十字線の x。値の枠は十字線の横に出し、線と点を隠さない（右半分では左に出す）
const cx = $derived(ci >= 0 ? ((pct ? pg?.x(ci) : g?.x(ci)) ?? 0) : 0)
function move(e: MouseEvent) {
  if (n < 2) return
  // ポインタの位置は表示倍率が掛かった px なので、図と同じ CSS の px（w）に直してから点を選ぶ
  onhover(histIndexAt(localX(e.clientX, (e.currentTarget as HTMLElement).getBoundingClientRect(), w), w, n))
}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="chart" bind:clientWidth={w} bind:clientHeight={h} onmousemove={move} onmouseleave={() => onhover(-1)}>
  {#if g && !pct}
    <svg viewBox={`0 0 ${w} ${h}`} aria-label={t('folio.hist')}>
      {#each g.ticks as tk (tk.v)}
        <line x1="2" x2={w - 56} y1={tk.y} y2={tk.y} class="grid" />
        <text x={w - 50} y={tk.y + 3} class="ax">{manYen(tk.v)}</text>
      {/each}
      {#each ticksM as m (m.i)}<text x={g.x(m.i)} y={h - 4} class="ax mid">{m.label.length === 4 ? m.label : t('folio.month', { m: m.label })}</text>{/each}
      {#if g.estEnd}
        <rect x={g.x(0)} y="6" width={g.x(g.estEnd) - g.x(0)} height={h - 24} class="estbg" />
        <text x={g.x(0) + 8} y="20" class="ax">{t('folio.estNote')}</text>
        <path d={g.estPath} class="est" />
      {/if}
      <defs>
        <clipPath id={`${uid}u`}><path d={g.clipUp} /></clipPath>
        <clipPath id={`${uid}d`}><path d={g.clipDown} /></clipPath>
        <linearGradient id={`${uid}gu`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" class="su" /><stop offset="1" class="su0" /></linearGradient>
        <linearGradient id={`${uid}gd`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" class="sd0" /><stop offset="1" class="sd" /></linearGradient>
      </defs>
      <!-- 取得額（入れた元本）から 0 円までを中立の色で塗り、その上に含み損益の帯を重ねる（縦軸が 0 からと分かる） -->
      <path d={g.clipDown} class="costarea" />
      <path d={g.band} fill={`url(#${uid}gu)`} clip-path={`url(#${uid}u)`} />
      <path d={g.band} fill={`url(#${uid}gd)`} clip-path={`url(#${uid}d)`} />
      <path d={g.cPath} class="cost" />
      <path d={g.vPath} class="val" />
      {#each g.fills as i (i)}<circle cx={g.x(i)} cy={g.y(points[i]!.value)} r="2" class="fill" />{/each}
      <circle cx={g.x(points.length - 1)} cy={g.y(points.at(-1)!.value)} r="3.5" class="last" />
      {#if ci >= 0}<line x1={g.x(ci)} x2={g.x(ci)} y1="6" y2={h - 18} class="cross" />{#if cp}<circle cx={g.x(ci)} cy={g.y(cp.value)} r="3.5" class="cdot" />{/if}{/if}
    </svg>
  {:else if pg}
    <svg viewBox={`0 0 ${w} ${h}`} aria-label={t('folio.twr')}>
      {#each pg.ticks as tk (tk.v)}
        <line x1="2" x2={w - 56} y1={tk.y} y2={tk.y} class="grid" />
        <text x={w - 50} y={tk.y + 3} class="ax">{signPct(tk.v)}</text>
      {/each}
      {#each ticksM as m (m.i)}<text x={pg.x(m.i)} y={h - 4} class="ax mid">{m.label.length === 4 ? m.label : t('folio.month', { m: m.label })}</text>{/each}
      <line x1="2" x2={w - 56} y1={pg.y(0)} y2={pg.y(0)} class="zero" />
      {#if bench}<path d={pg.path(bench)} class="bench" />{/if}
      <path d={pg.path(twr)} class="val" />
      {#if ci >= 0}
        <line x1={pg.x(ci)} x2={pg.x(ci)} y1="6" y2={h - 18} class="cross" />
        {#if bench?.[ci] != null}<circle cx={pg.x(ci)} cy={pg.y(bench[ci]!)} r="3" class="cdot bench-dot" />{/if}
        {#if twr[ci] != null}<circle cx={pg.x(ci)} cy={pg.y(twr[ci]!)} r="3.5" class="cdot" />{/if}
      {/if}
    </svg>
  {/if}
  {#if cp}
    <div class="tip" class:flip={cx > w / 2} style:left={`${cx}px`}>
      <div class="row"><b class="num">{cp.d}</b><span class="mute">{t(`folio.src.${cp.src}`)}</span></div>
      <div class="row"><span class="mute">{t('folio.value')}</span><span class="num">¥{yenFull(cp.value)}</span></div>
      {#if cp.src !== 'est'}
        <div class="row"><span class="mute">{t('folio.cost')}</span><span class="num">¥{yenFull(cp.cost)}</span></div>
        <div class="row"><span class="mute">{t('folio.pnl')}</span><span class={`num ${cp.value - cp.cost >= 0 ? 'up' : 'down'}`}>{yenFull(cp.value - cp.cost, true)}</span></div>
      {/if}
      {#if pct && twr[ci] != null}<div class="row"><span class="mute">{t('folio.twr')}</span><span class="num">{signPct(twr[ci])}</span></div>{/if}
      {#if pct && bench?.[ci] != null}<div class="row bench-row"><span class="mute">{benchName}</span><span class="num">{signPct(bench[ci])}</span></div>{/if}
    </div>
  {/if}
</div>

<style>
.chart {
  flex: 1 1 0;
  min-height: 140px;
  position: relative;
}
svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.grid {
  stroke: var(--chart-grid);
}
.zero {
  stroke: var(--text-3);
  stroke-dasharray: 2 3;
}
.ax {
  font-size: 10px;
  fill: var(--text-3);
  font-family: var(--mono);
}
.mid {
  text-anchor: middle;
}
.estbg {
  fill: var(--panel-2);
}
.est {
  fill: none;
  stroke: var(--text-3);
  stroke-width: 1.2;
  opacity: 0.75;
}
.su {
  stop-color: var(--up);
  stop-opacity: 0.34;
}
.su0 {
  stop-color: var(--up);
  stop-opacity: 0.04;
}
.sd {
  stop-color: var(--down);
  stop-opacity: 0.34;
}
.sd0 {
  stop-color: var(--down);
  stop-opacity: 0.04;
}
:global(:root[data-theme='light']) .su,
:global(:root[data-theme='light']) .sd {
  stop-opacity: 0.22;
}
.costarea {
  fill: color-mix(in srgb, var(--text-3) 16%, transparent);
}
.cost {
  fill: none;
  stroke: var(--text-3);
  stroke-dasharray: 3 3;
}
.val {
  fill: none;
  stroke: var(--text);
  stroke-width: 1.6;
  stroke-linejoin: round;
}
.bench {
  fill: none;
  stroke: var(--ind1);
  stroke-width: 1.4;
}
.fill {
  fill: var(--panel);
  stroke: var(--text-3);
}
.last {
  fill: var(--text);
  stroke: var(--panel);
  stroke-width: 2;
}
.cross {
  stroke: var(--chart-cross);
  stroke-dasharray: 3 3;
}
/* 十字線の日の線の上の点 */
.cdot {
  fill: var(--text);
  stroke: var(--panel);
  stroke-width: 1.5;
}
.bench-dot {
  fill: var(--ind1);
}
.tip {
  position: absolute;
  top: 6px;
  transform: translateX(10px);
  pointer-events: none;
  background: var(--panel-2);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  padding: 4px 8px;
  font-size: var(--fs-1);
  white-space: nowrap;
  z-index: 2;
}
.tip.flip {
  transform: translateX(calc(-100% - 10px));
}
.row {
  display: flex;
  justify-content: space-between;
  gap: 14px;
}
.mute {
  color: var(--text-3);
}
.up {
  color: var(--up);
}
.down {
  color: var(--down);
}
</style>
