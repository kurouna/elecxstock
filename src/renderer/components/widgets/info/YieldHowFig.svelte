<script lang="ts">
// 平面の読み方の小さな図（docs/design-yield-breakdown.md §2.2・§2.3）: 斜めの線は同じ利回り・→ 増配・↓ 株価が下がった・斜めに沿う = 変わらず
import { t } from '../../../stores/app.svelte'

const uid = $props.id()
</script>

<svg class="yd-how" viewBox="0 0 120 90" width="110" height="82" aria-hidden="true">
  <defs><marker id={`yd-ar-${uid}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L8 4L0 8z" fill="context-stroke" /></marker></defs>
  {#each [-2, -1, 0, 1, 2, 3] as k (k)}<line x1={k * 26} y1="90" x2={k * 26 + 90} y2="0" stroke="var(--yd-iso)" stroke-width="1.2" />{/each}
  <text x="116" y="10" text-anchor="end" class="yd-f" style:fill="var(--yd-iso-t)">{t('yd.fig.same')}</text>
  <circle cx="40" cy="44" r="3" fill="var(--text)" />
  <line x1="40" y1="44" x2="78" y2="44" stroke="var(--yd-div)" stroke-width="2" marker-end={`url(#yd-ar-${uid})`} />
  <text x="80" y="47" class="yd-f" style:fill="var(--yd-div)">{t('yd.fig.div')}</text>
  <line x1="40" y1="44" x2="40" y2="80" stroke="var(--yd-px)" stroke-width="2" marker-end={`url(#yd-ar-${uid})`} />
  <text x="44" y="84" class="yd-f" style:fill="var(--yd-px)">{t('yd.fig.px')}</text>
  <line x1="40" y1="44" x2="62" y2="22" stroke="var(--text-3)" stroke-width="1.5" stroke-dasharray="3 2" marker-end={`url(#yd-ar-${uid})`} />
  <text x="2" y="20" class="yd-f" style:fill="var(--text-3)">{t('yd.fig.along')}</text>
</svg>

<style>
  .yd-how {
    flex: none;
  }
  .yd-f {
    font-family: var(--font);
    font-size: 9px;
  }
</style>
