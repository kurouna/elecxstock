<script lang="ts">
// 口座区分の構成比（NISA 成長投資枠・つみたて投資枠・旧 NISA・特定・一般）の円グラフ（FR-PF1）。
// 口座の色は口座を見分けるための色（上昇・下落の意味は持たない）。細い輪にして面を塗りすぎない。凡例に名前・割合・評価額を並べる
import type { AccountType } from '@shared/types'
import { arcPath, manYen } from '../../../lib/folio'
import { yen } from '../../../lib/folioTips'
import { accountName } from '../../../lib/portfolio'
import { t } from '../../../stores/app.svelte'

let { parts, nisa }: { parts: { acct: AccountType; value: number; share: number; a0: number; a1: number }[]; nisa: number } = $props()
let hov = $state(-1)
const tip = (p: (typeof parts)[number]) => `${accountName(p.acct)} ${(p.share * 100).toFixed(1)}% ${yen(p.value)}`
</script>

<div class="ring">
  <svg viewBox="0 0 200 200" role="img" aria-label={t('folio.acctMix')}>
    {#each parts as p, i (p.acct)}
      {@const am = (p.a0 + p.a1) / 2}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <path d={arcPath(p.a0, p.a1, 96, 70, 100, 100, parts.length > 1 ? 0.02 : 0)} fill={`var(--acct-${p.acct})`} class="sl" class:fade={hov >= 0 && hov !== i} style:transform={hov === i && parts.length > 1 ? `translate(${(9 * Math.cos(am)).toFixed(2)}px, ${(9 * Math.sin(am)).toFixed(2)}px)` : 'none'} onmouseenter={() => (hov = i)} onmouseleave={() => (hov = -1)}><title>{tip(p)}</title></path>
    {/each}
    <!-- 真ん中は NISA（成長・つみたて・旧）の割合 -->
    <text x="100" y="92" class="c1">NISA</text>
    <text x="100" y="132" class="c2">{(nisa * 100).toFixed(0)}%</text>
  </svg>
  <ul>
    {#each parts as p, i (p.acct)}
      <li title={tip(p)} class:hov={hov === i} onmouseenter={() => (hov = i)} onmouseleave={() => (hov = -1)}><span class="dot" style:background={`var(--acct-${p.acct})`}></span><span class="nm">{accountName(p.acct)}</span><span class="num pc">{(p.share * 100).toFixed(0)}%</span><span class="num mute amt">{manYen(p.value)}</span></li>
    {/each}
  </ul>
</div>

<style>
.ring {
  display: grid;
  grid-template-columns: 76px 1fr;
  gap: 10px;
  align-items: center;
}
svg {
  width: 76px;
  height: 76px;
  overflow: visible;
}
/* マウスを載せた口座は外へせり出す（凡例の行に載せても同じ） */
.sl {
  transition:
    transform calc(var(--motion) * 1.4) cubic-bezier(0.2, 0.8, 0.2, 1.4),
    opacity var(--motion);
}
.sl.fade {
  opacity: 0.45;
}
li.hov .nm {
  color: var(--text);
}
.c1 {
  font-size: 30px;
  text-anchor: middle;
  fill: var(--text-3);
}
.c2 {
  font-size: 44px;
  font-weight: 600;
  text-anchor: middle;
  fill: var(--text);
  font-family: var(--mono);
}
ul {
  container-type: inline-size;
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
  font-size: var(--fs-1);
  min-width: 0;
}
li {
  display: grid;
  grid-template-columns: 8px minmax(0, 1fr) 34px 54px;
  gap: 6px;
  align-items: center;
}
.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}
.nm {
  color: var(--text-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* 狭いときは評価額を外して口座の名前を切らない（評価額はポインタを載せると出る） */
@container (max-width: 230px) {
  li {
    grid-template-columns: 8px minmax(0, 1fr) 34px;
  }
  .amt {
    display: none;
  }
}
.pc,
.mute {
  text-align: right;
}
.mute {
  color: var(--text-3);
}
</style>
