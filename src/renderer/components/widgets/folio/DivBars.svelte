<script lang="ts">
// 配当見込みの月の棒（FR-PF7）: 今後 12 か月（権利落ちの月に積む）。左隣の細い棒が前年同月、来月は金色。
// 下のリボンは権利月の銘柄の点。月を選ぶと点が金色になり、下にその月の銘柄と額を並べる
import { manYen, yenFull } from '../../../lib/folio'
import { t } from '../../../stores/app.svelte'

type Month = { m: number; now: number; prev: number; codes: { code: string; name: string; amt: number }[] }
let { months, sel, brushed }: { months: Month[]; sel: number; brushed: Set<string> | null } = $props()
let w = $state(0)
let h = $state(0)
const mx = $derived(Math.max(1, ...months.flatMap((x) => [x.now, x.prev])))
const top = $derived(Math.max(0, ...months.map((x) => x.now)))
const B = 16
const yh = (v: number) => (v ? Math.max(2, (v / mx) * (h - B - 14)) : 0)
const cur = $derived(sel >= 0 ? months[sel] : undefined)
</script>

<div class="bars" bind:clientWidth={w} bind:clientHeight={h}>
  {#if w > 20 && h > 20}
    <svg viewBox={`0 0 ${w} ${h}`} aria-label={t('folio.divMonths')}>
      {#each months as x, i (x.m)}
        {@const cx = (w / 12) * (i + 0.5)}
        {@const bw = Math.min(24, (w / 12) * 0.5)}
        {#if x.prev}<rect x={cx - bw / 2 - 6} y={h - B - yh(x.prev)} width="4" height={yh(x.prev)} rx="1" class="prev" />{/if}
        <rect x={cx - bw / 2} y={h - B - yh(x.now)} width={bw} height={yh(x.now)} rx="1.5" class:next={i === 1} class="bar">
          <title>{t('folio.monthAmt', { m: x.m, now: yenFull(x.now), prev: yenFull(x.prev) })}</title>
        </rect>
        {#if x.now && (x.now === top || i === 1)}<text x={cx} y={h - B - Math.max(yh(x.now), yh(x.prev)) - 4} class="lab">{manYen(x.now)}</text>{/if}
        <text x={cx} y={h - 3} class="ax" class:on={i === 1}>{t('folio.month', { m: x.m })}</text>
      {/each}
    </svg>
  {/if}
</div>
<div class="ribbon" aria-hidden="true">
  {#each months as x, i (x.m)}
    <span class="cell" class:sel={i === sel}>
      {#each x.codes.slice(0, 4) as c (c.code)}<i class:on={i === sel} class:dim={brushed && !brushed.has(c.code)} title={`${c.code} ${c.name}`}></i>{/each}
      {#if x.codes.length > 4}<em>+{x.codes.length - 4}</em>{/if}
    </span>
  {/each}
</div>
<div class="mlist">
  {#if cur}
    <b>{t('folio.month', { m: cur.m })}</b>
    {#if cur.codes.length}{#each cur.codes as c (c.code)}<span><span class="mute num">{c.code}</span> {c.name} <span class="num">¥{yenFull(c.amt)}</span></span>{/each}{:else}<span class="mute">{t('folio.noRights')}</span>{/if}
  {:else}
    <span class="mute">{t('folio.ribbonHint')}</span>
  {/if}
</div>

<style>
.bars {
  flex: 1 1 0;
  min-height: 100px;
  max-height: 180px;
  position: relative;
}
svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.bar {
  fill: var(--f-bar);
}
.bar.next {
  fill: var(--gold);
}
.prev {
  fill: var(--text-3);
  opacity: 0.55;
}
.lab {
  font-size: 10px;
  text-anchor: middle;
  fill: var(--text-2);
  font-family: var(--mono);
}
.ax {
  font-size: 10px;
  text-anchor: middle;
  fill: var(--text-3);
}
.ax.on {
  fill: var(--text);
  font-weight: 600;
}
.ribbon {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  border-top: 1px solid var(--line);
  min-height: 24px;
  flex: none;
}
.cell {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-content: flex-start;
  gap: 3px;
  padding: 4px 2px 2px;
  border-radius: var(--radius);
}
.cell.sel {
  box-shadow: inset 0 0 0 1px var(--focus);
}
.cell i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-3);
  opacity: 0.7;
}
.cell i.on {
  background: var(--gold);
  opacity: 1;
}
.cell i.dim {
  opacity: 0.3;
}
.cell em {
  font-size: 9px;
  font-style: normal;
  color: var(--text-3);
  width: 100%;
  text-align: center;
}
.mlist {
  font-size: var(--fs-1);
  color: var(--text-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-height: 16px;
  display: flex;
  gap: 12px;
  flex: none;
}
.mute {
  color: var(--text-3);
}
</style>
