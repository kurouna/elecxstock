<script lang="ts">
// 配当の内訳（FR-PF7）: ドーナツ（上位 5 ＋その他。色は配当の金色の濃淡 = 割合の大きさ。分類ごとの色相は使わない）と、凡例を兼ねる一覧。
// 狭い幅ではドーナツをやめ、一覧に横棒を出す。行を選ぶとスライスが外へ出て、真ん中にその分類を出す
import { donutSlices } from '@shared/folio'
import { arcPath, type DivGroupRow, dimmed, donutShade, manYen, toneOf, yenFull } from '../../../lib/folio'
import { donutOtherTip, donutTip } from '../../../lib/folioTips'
import { t } from '../../../stores/app.svelte'

let {
  groups,
  total,
  sel,
  focused,
  brushed,
  label,
  unit,
  byCode,
  onpick,
}: {
  groups: DivGroupRow[]
  total: number
  sel: number
  focused: boolean
  brushed: Set<string> | null
  label: (g: DivGroupRow) => string
  unit: string
  /** 銘柄で分けた（ツールチップに銘柄の一覧を出さない） */
  byCode: boolean
  /** 行を押した（銘柄で分けたときはリンク色に送る） */
  onpick: (i: number) => void
} = $props()
const list = $derived(groups.filter((g) => g.annual > 0).sort((a, b) => b.annual - a.annual))
const slices = $derived(donutSlices(list.map((g) => ({ value: g.annual, g }))))
const s = $derived(focused ? sel : -1)
const colorOf = donutShade
const restFrom = $derived(slices.some((x) => !x.item) ? slices.length - 1 : list.length)
const isDim = (g: DivGroupRow) =>
  dimmed(
    brushed,
    g.rows.map((r) => r.code),
  )
// マウスを載せたスライス（一覧の行に載せたときはその行のスライス）。選んだ行より優先して外へ出し、真ん中に出す
let hov = $state(-1)
const sliceOf = (i: number) => {
  const k = slices.findIndex((sl) => sl.item?.g === list[i])
  return k >= 0 ? k : slices.length - 1
}
const active = $derived(hov >= 0 ? hov : s >= 0 ? sliceOf(s) : -1)
const curSl = $derived(active >= 0 ? slices[active] : undefined)
const tipOf = (k: number) => {
  const sl = slices[k]
  if (!sl) return ''
  return sl.item ? donutTip(sl.item.g, total, label(sl.item.g), byCode, t) : donutOtherTip(list.slice(restFrom), total, label, t)
}
let w = $state(0)
</script>

<!-- 狭いカードでは、ドーナツを上・一覧を下に重ねて名前を切らない（さらに狭ければドーナツをやめて横棒） -->
<div class="donut" class:stack={w >= 360 && w < 520} bind:clientWidth={w}>
  {#if w >= 360}
    <svg viewBox="-8 -8 216 216" aria-label={t('folio.dshare')}>
      {#each slices as sl, i (i)}
        {@const on = i === active}
        {@const dim = (active >= 0 && !on) || (sl.item ? isDim(sl.item.g) : false)}
        {@const am = (sl.a0 + sl.a1) / 2}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <g class="sl" class:on style:transform={on ? `translate(${(7 * Math.cos(am)).toFixed(2)}px, ${(7 * Math.sin(am)).toFixed(2)}px)` : 'none'} onmouseenter={() => (hov = i)} onmouseleave={() => (hov = -1)}>
          <path d={arcPath(sl.a0, sl.a1, 100, 64)} fill={on ? 'var(--gold)' : colorOf(i, !sl.item)} opacity={dim ? 0.35 : 1}><title>{tipOf(i)}</title></path>
          {#if sl.a1 - sl.a0 > 0.32}
            <text x={100 + 82 * Math.cos(am)} y={100 + 82 * Math.sin(am) + 4} class="pct" opacity={dim ? 0.4 : 1}>{((sl.value / total) * 100).toFixed(0)}%</text>
          {/if}
        </g>
      {/each}
      {#if curSl}
        <text x="100" y="92" class="c1">{curSl.item ? label(curSl.item.g) : t('folio.other')}</text>
        <text x="100" y="113" class="c2">{((curSl.value / total) * 100).toFixed(0)}%</text>
        <text x="100" y="129" class="c3">¥{yenFull(curSl.value)}</text>
      {:else}
        <text x="100" y="94" class="c1">{t('folio.annualNet')}</text>
        <text x="100" y="114" class="c2">{manYen(total)}</text>
        <text x="100" y="130" class="c3">{list.length} {unit}</text>
      {/if}
    </svg>
  {/if}
  <div class="shr" class:bars={w < 360}>
    {#each list as g, i (g.key)}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div class="r" class:sel={i === s} class:dim={isDim(g)} title={donutTip(g, total, label(g), byCode, t)} onclick={() => onpick(i)} onmouseenter={() => (hov = sliceOf(i))} onmouseleave={() => (hov = -1)}>
        <span class="nm"><i class="sw" style:background={i === s ? 'var(--gold)' : colorOf(Math.min(i, restFrom), i >= restFrom)}></i>{label(g)}</span>
        {#if w < 360}<span class="sb"><i style:width={`${(g.annual / list[0]!.annual) * 100}%`}></i></span>{/if}
        <span class="num">{manYen(g.annual)}</span>
        <span class="num mute">{((g.annual / total) * 100).toFixed(0)}%</span>
        <span class={`num ${toneOf(g.annual - g.annualPrev)}`}>{Math.abs(g.annual - g.annualPrev) < 1 ? '±0' : manYen(g.annual - g.annualPrev, true)}</span>
      </div>
    {/each}
  </div>
</div>

<style>
.donut {
  display: grid;
  grid-template-columns: minmax(140px, 38%) 1fr;
  gap: 10px;
  flex: 1 1 0;
  min-height: 0;
  align-items: center;
}
.donut.stack {
  grid-template-columns: 1fr;
  grid-template-rows: auto minmax(0, 1fr);
  align-items: start;
  align-content: start;
}
.donut.stack svg {
  width: auto;
  height: 150px;
  justify-self: center;
}
.donut:has(.bars) {
  grid-template-columns: 1fr;
  flex: none;
}
svg {
  width: 100%;
  aspect-ratio: 1;
  overflow: visible;
}
/* マウスを載せた・選んだスライスは外へせり出す */
.sl {
  transition: transform calc(var(--motion) * 1.4) cubic-bezier(0.2, 0.8, 0.2, 1.4);
}
.sl path {
  transition:
    fill var(--motion),
    opacity var(--motion);
}
.pct {
  pointer-events: none;
  font-size: 11px;
  font-weight: 600;
  text-anchor: middle;
  fill: var(--text);
  font-family: var(--mono);
}
.c1 {
  font-size: 11px;
  text-anchor: middle;
  fill: var(--text-2);
}
.c2 {
  font-size: 18px;
  font-weight: 600;
  text-anchor: middle;
  fill: var(--text);
  font-family: var(--mono);
}
.c3 {
  font-size: 10px;
  text-anchor: middle;
  fill: var(--text-3);
}
.shr {
  display: flex;
  flex-direction: column;
  gap: 3px;
  overflow-y: auto;
  overflow-x: hidden;
  align-self: stretch;
  max-height: 100%;
}
.bars {
  max-height: 260px;
}
.r {
  flex: none;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 50px 34px 56px;
  gap: 8px;
  align-items: center;
  font-size: var(--fs-1);
  padding: 1px 4px;
  border-radius: var(--radius);
}
.bars .r {
  grid-template-columns: minmax(0, 1fr) 1fr 50px 34px 56px;
}
.r {
  cursor: pointer;
}
.r:hover {
  background: var(--hover);
}
.r.sel {
  background: var(--panel-3);
}
.r.dim {
  opacity: 0.45;
}
.r span:nth-child(n + 2) {
  text-align: right;
}
.nm {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-2);
}
.sw {
  width: 9px;
  height: 9px;
  border-radius: 2px;
  display: inline-block;
  margin-right: 6px;
  vertical-align: -1px;
}
.sb {
  height: 8px;
  background: var(--panel-3);
  border-radius: 1px;
}
.sb i {
  display: block;
  height: 100%;
  background: var(--f-bar);
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
.flat {
  color: var(--flat);
}
</style>
