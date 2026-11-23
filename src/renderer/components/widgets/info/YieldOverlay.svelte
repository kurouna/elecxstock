<script lang="ts">
// 広げた配当と株価の平面（docs/design-yield-breakdown.md §2.3。FR-I11）: ペインの見出しの下を覆う層。左に平面、右に読み方と、十字線の月までの内訳。
// キーは SymbolInfo の key から受ける（開いている間は層の後ろのペインのキーを受け、銘柄の切り替えなど全体のキーは通す）
import type { YieldPoint } from '@shared/types'
import { yieldBreakdown, yieldCaption } from '@shared/yieldPath'
import { px } from '../../../lib/format'
import { cursorIndex } from '../../../lib/yieldPlane'
import { captionText, ydT, yieldPct, ym } from '../../../lib/yieldText'
import { t } from '../../../stores/app.svelte'
import YieldBars from './YieldBars.svelte'
import YieldHowFig from './YieldHowFig.svelte'
import YieldPlane from './YieldPlane.svelte'

let {
  path,
  i0,
  span,
  cursor,
  name,
  reit = false,
  onspan,
  onclose,
}: {
  path: YieldPoint[]
  /** 期間の始まり（欄と同じ。breakdownFor の i0） */
  i0: number
  span: 5 | 'max'
  cursor: string | null
  name: string
  reit?: boolean
  onspan: (s: 5 | 'max') => void
  onclose: () => void
} = $props()
// 十字線の月まで（始まりの月なら ±0 の内訳。読み方の欄の高さを変えない）
const i1 = $derived(Math.max(i0, cursorIndex(path, cursor)))
const b = $derived(yieldBreakdown(path, i0, i1))
const cur = $derived(cursor ? path.find((p) => p.m === cursor) : undefined)
</script>

<div class="yd-over" role="dialog" aria-label={ydT('yd.ov.title', reit, { name })} data-testid="yd-overlay">
  <div class="yd-ovh">
    <b>{ydT('yd.ov.title', reit, { name })}</b>
    <span class="muted">{ydT('yd.ov.sub', reit)}</span>
    <span class="grow"></span>
    <span class="yd-seg" role="radiogroup" aria-label={t('yd.spanLabel')} title={`${t('yd.spanLabel')} (N)`}>
      <button type="button" role="radio" aria-checked={span === 5} class:on={span === 5} onclick={() => onspan(5)}>{t('yd.span5')}</button>
      <button type="button" role="radio" aria-checked={span === 'max'} class:on={span === 'max'} onclick={() => onspan('max')}>{t('yd.spanMax')}</button>
    </span>
    <button type="button" class="yd-close" onclick={onclose}>{t('yd.ov.close')} Esc</button>
  </div>
  <div class="yd-ovplane">
    <div class="yd-read" data-testid="yd-read">
      {#if cur}
        <span class="yd-day num">{ym(cur.m)}</span> · {ydT('yd.ov.read', reit, { p: px(cur.price), d: px(cur.div12), y: cur.div12 > 0 ? yieldPct(cur.div12 / cur.price) : '—' })}
      {:else}{t('yd.ov.readHint')}{/if}
    </div>
    <YieldPlane {path} {i0} {cursor} {reit} />
  </div>
  <div class="yd-legend">
    <h6>{t('yd.ov.guide')}</h6>
    <div class="yd-how"><YieldHowFig /><div>{t('yd.ov.guideText')}<br />{t('yd.ov.arrows')}</div></div>
    {#if b}
      <div data-testid="yd-ovdec">
        <h6>{ym(path[i0]!.m)} → {ym(path[i1]!.m)}</h6>
        <div class="yd-sum num">{yieldPct(b.y0)} → {yieldPct(b.y1)}</div>
        <YieldBars {b} {reit} />
        <div class="muted yd-cap">{i1 > i0 ? captionText(yieldCaption(b), reit) : '—'}</div>
      </div>
    {/if}
    <div class="muted">{t('yd.ov.keys')}</div>
    <div class="muted">{ydT('yd.tip.note', reit)}</div>
  </div>
</div>

<style>
  .yd-over {
    position: absolute;
    inset: 28px 0 0 0;
    z-index: 32;
    background: var(--panel);
    /* ペインの見出し（PaneHeader）の下を覆う */
    border-top: 1px solid var(--line);
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px;
    grid-template-rows: auto minmax(0, 1fr);
  }
  .yd-ovh {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 12px;
    border-bottom: 1px solid var(--line);
    font-size: var(--fs-1);
  }
  .yd-ovh b {
    font-size: var(--fs-3);
  }
  .grow {
    flex: 1;
  }
  .yd-seg {
    display: inline-flex;
    gap: 1px;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 1px;
  }
  .yd-seg button,
  .yd-close {
    padding: 0 8px;
    font: inherit;
    font-size: var(--fs-1);
    color: var(--text-3);
    line-height: 18px;
    border: 0;
    background: transparent;
    cursor: pointer;
  }
  .yd-seg button.on {
    background: var(--panel-3);
    color: var(--text);
    box-shadow: inset 0 -1px 0 var(--focus);
  }
  .yd-close {
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    color: var(--text-2);
  }
  .yd-ovplane {
    display: flex;
    flex-direction: column;
    min-height: 0;
    padding: 6px 10px;
  }
  .yd-read {
    font-size: var(--fs-1);
    color: var(--text-3);
    min-height: 18px;
  }
  .yd-day {
    color: var(--focus);
  }
  .yd-legend {
    border-left: 1px solid var(--line);
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    font-size: var(--fs-1);
    color: var(--text-2);
    overflow: auto;
  }
  .yd-legend h6 {
    margin: 0;
    font-size: var(--fs-2);
    color: var(--text);
  }
  .yd-how {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .yd-sum {
    font-size: 15px;
    font-weight: 600;
    color: var(--text);
    margin: 2px 0 4px;
  }
  .yd-cap {
    margin-top: 4px;
  }
  /* 最大化しても窓が狭いときだけ、読み方を平面の下に積む */
  @container (max-width: 899px) {
    .yd-over {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto minmax(200px, 1fr) auto;
    }
    .yd-legend {
      border-left: 0;
      border-top: 1px solid var(--line);
      max-height: 45%;
    }
  }
</style>
