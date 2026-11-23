<script lang="ts">
// 利回りの変化の内訳の棒（docs/design-yield-breakdown.md §2.1）: 目盛りの言葉と、配当・株価・利回りの 3 本。どれも利回りを押し上げた向きを右に描く
// （配当は増えると右、株価は下がると右）。欄と広げた平面の右の欄で同じ部品
import { barScale, barWidth, type YieldBreakdown } from '@shared/yieldPath'
import { ratePct } from '../../../lib/yieldText'
import { t } from '../../../stores/app.svelte'

let { b, reit = false }: { b: YieldBreakdown; reit?: boolean } = $props()
const s = $derived(barScale(b))
const rows = $derived([
  { key: 'div', label: t(reit ? 'yd.divReit' : 'yd.div'), push: b.lD, value: ratePct(b.dD), color: 'var(--yd-div)' },
  { key: 'px', label: t('yd.price'), push: -b.lP, value: ratePct(b.dP), color: 'var(--yd-px)' },
  { key: 'y', label: t('yd.yield'), push: b.lY, value: ratePct(b.dY), color: 'var(--yd-y)' },
])
</script>

<div class="yd-bars" data-testid="yd-bars">
  <div class="yd-axis"><span></span><span class="yd-axw"><span>{t('yd.axisDown')}</span><span>{t('yd.axisUp')}</span></span><span></span></div>
  {#each rows as r (r.key)}
    {@const wd = barWidth(r.push, s)}
    <div class="yd-row" data-bar={r.key}>
      <span class="yd-k">{r.label}</span>
      <span class="yd-track"><i style:left={`${r.push >= 0 ? 50 : 50 - wd}%`} style:width={`${wd}%`} style:background={r.color}></i><i class="yd-mid"></i></span>
      <span class="yd-v num">{r.value}</span>
    </div>
  {/each}
</div>

<style>
  .yd-bars {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .yd-axis,
  .yd-row {
    display: grid;
    grid-template-columns: 64px minmax(0, 1fr) 52px;
    gap: 6px;
    align-items: center;
  }
  .yd-axis {
    font-size: var(--fs-0);
    color: var(--text-3);
  }
  .yd-axw {
    display: flex;
    justify-content: space-between;
  }
  .yd-row {
    font-size: var(--fs-1);
    color: var(--text-2);
  }
  .yd-track {
    height: 8px;
    background: var(--panel-3);
    position: relative;
    border-radius: 2px;
  }
  .yd-track i {
    position: absolute;
    top: 0;
    bottom: 0;
    border-radius: 2px;
  }
  .yd-track .yd-mid {
    left: 50%;
    width: 1px;
    background: var(--line-strong);
  }
  .yd-v {
    text-align: right;
    color: var(--text);
  }
</style>
