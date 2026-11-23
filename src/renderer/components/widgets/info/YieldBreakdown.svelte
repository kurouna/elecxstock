<script lang="ts">
// 利回りの変化の内訳の欄（docs/design-yield-breakdown.md §2.1・§2.2。FR-I11）: 見出し・始まり → 今の利回り・目盛りの言葉と棒 3 本・一言・平面の小さな図・
// 「i」の読み方。どれを出すかは breakdownFor（shared/yieldPath.ts）、文言は lib/yieldText.ts。
// 読み方は ? かクリックで留める（tip）。マウスを載せる・フォーカスしている間も出す。外をクリック・Esc で閉じる
import type { YieldPoint } from '@shared/types'
import { type BreakdownState, yieldCaption, ZERO_BREAKDOWN } from '@shared/yieldPath'
import { captionText, ptText, ydT, yieldPct, ym } from '../../../lib/yieldText'
import { t } from '../../../stores/app.svelte'
import YieldBars from './YieldBars.svelte'
import YieldHowFig from './YieldHowFig.svelte'
import YieldPlane from './YieldPlane.svelte'

let {
  path,
  view,
  reit = false,
  tip = $bindable(false),
  onopen,
}: {
  path: YieldPoint[]
  view: Exclude<BreakdownState, { kind: 'hidden' }>
  reit?: boolean
  tip?: boolean
  onopen: () => void
} = $props()
const ok = $derived(view.kind === 'ok' ? view : null)
const span = $derived(ok ? ydT(ok.started ? 'yd.spanStarted' : 'yd.span', reit, { from: ym(path[ok.i0]!.m), n: ok.years }) : '')
/** マウスを載せている・フォーカスしている間だけ出す（留める tip とは別） */
let peek = $state(false)
const shown = $derived(tip || peek)
let block = $state<HTMLDivElement>()
let tipEl = $state<HTMLDivElement>()
// 出したら読み方が見えるところまでスクロールする（下のほうで開くと、ペインの下で切れる）
$effect(() => {
  if (tip && tipEl) tipEl.scrollIntoView({ block: 'nearest' })
})
const outside = (e: PointerEvent) => {
  if (tip && block && !block.contains(e.target as Node)) tip = false
}
</script>

<svelte:window onpointerdown={outside} />
<div class="yd-block" data-testid="yd" bind:this={block}>
  <div class="yd-hd">
    <b>{t('yd.title')}</b>
    <span class="muted" data-testid="yd-span">{span}</span>
    <button
      type="button"
      class="yd-i"
      class:on={shown}
      aria-label={t('yd.tip.title')}
      aria-expanded={shown}
      title={`${t('yd.tip.title')} (?)`}
      onclick={() => {
        tip = !tip
        // 留めを外したら、載せている間の表示も消す（押した手応え）
        if (!tip) peek = false
      }}
      onmouseenter={() => (peek = true)}
      onmouseleave={() => (peek = false)}
      onfocus={() => (peek = true)}
      onblur={() => (peek = false)}>i</button
    >
    <span class="grow"></span>
    {#if ok}<span class="muted">{t('yd.open')}</span>{/if}
  </div>
  <div class="yd-body">
    <div class="yd-main">
      {#if ok}
        <div class="yd-sum num">{yieldPct(ok.b.y0)} → {yieldPct(ok.b.y1)}<span class="yd-pt">{ptText(ok.b.pt)}</span></div>
        <YieldBars b={ok.b} {reit} />
        <div class="yd-cap" data-testid="yd-caption">{captionText(yieldCaption(ok.b), reit)}</div>
      {:else}
        <div class="yd-sum"><span class="yd-none" data-testid="yd-none">{t('yd.none')}</span></div>
        <!-- 欄の高さは保つ（棒と一言の場所を取ったまま見えなくする。↑↓ で銘柄を替えても配当のカードの高さが変わらない） -->
        <div class="yd-keep" aria-hidden="true"><YieldBars b={ZERO_BREAKDOWN} {reit} /><div class="yd-cap">—</div></div>
      {/if}
    </div>
    {#if ok}
      <button type="button" class="yd-thumb" title={`${ydT('yd.openTitle', reit)} (V)`} aria-label={ydT('yd.openTitle', reit)} onclick={onopen}>
        <YieldPlane {path} i0={ok.i0} small {reit} />
        <span class="yd-expand">⤢ {t('yd.expand')}</span>
      </button>
    {:else}
      <span class="yd-thumb yd-keep" aria-hidden="true"></span>
    {/if}
  </div>
  {#if shown}
    <div class="yd-tip" role="tooltip" data-testid="yd-tip" bind:this={tipEl}>
      <h6>{t('yd.tip.title')}</h6>
      <div><span class="yd-eq">{ydT('yd.tip.eq', reit)}</span> {ydT('yd.tip.body', reit)}</div>
      <div class="yd-how">
        <YieldHowFig />
        <ul>
          <li>{t('yd.tip.bars')}</li>
          <li>{ydT('yd.tip.plane', reit)}</li>
        </ul>
      </div>
      <div class="muted">{ydT('yd.tip.note', reit)}</div>
    </div>
  {/if}
</div>

<style>
  .yd-block {
    position: relative;
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid var(--line-soft);
    /* 小さな図を出すかは欄の幅で決める（700〜1039px の 2 列では配当の列が狭い） */
    container: yd / inline-size;
  }
  .yd-hd {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--fs-1);
    color: var(--text-2);
  }
  .yd-hd b {
    color: var(--text);
    font-size: var(--fs-2);
    font-weight: 600;
  }
  .grow {
    flex: 1;
  }
  .yd-i {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 1px solid var(--line-strong);
    background: transparent;
    color: var(--text-3);
    font: 600 10px/1 var(--font);
    display: inline-grid;
    place-items: center;
    padding: 0;
    cursor: help;
    flex: none;
  }
  .yd-i:hover,
  .yd-i:focus-visible,
  .yd-i.on {
    color: var(--focus);
    border-color: var(--focus);
    outline: none;
  }
  .yd-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 132px;
    gap: 12px;
    margin-top: 4px;
  }
  .yd-sum {
    font-size: 15px;
    font-weight: 600;
    line-height: 20px;
    height: 20px;
    white-space: nowrap;
    margin-bottom: 4px;
  }
  .yd-pt {
    font-size: var(--fs-1);
    font-weight: 400;
    color: var(--text-3);
    margin-left: 6px;
  }
  .yd-cap,
  .yd-none {
    font-size: var(--fs-1);
    color: var(--text-2);
    margin-top: 4px;
    line-height: 18px;
  }
  .yd-none {
    font-weight: 400;
  }
  .yd-keep {
    visibility: hidden;
  }
  .yd-thumb {
    position: relative;
    height: 100px;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 2px;
    background: var(--panel-2);
    cursor: zoom-in;
    display: flex;
  }
  .yd-thumb:hover,
  .yd-thumb:focus-visible {
    border-color: var(--focus);
    outline: none;
  }
  .yd-expand {
    position: absolute;
    right: 4px;
    bottom: 2px;
    font-size: var(--fs-0);
    color: var(--text-3);
  }
  .yd-tip {
    position: absolute;
    left: 0;
    top: 30px;
    z-index: 31;
    width: min(380px, 100%);
    background: var(--panel-2);
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    box-shadow: var(--shadow);
    padding: 10px 12px;
    font-size: var(--fs-1);
    color: var(--text-2);
    line-height: 1.6;
  }
  .yd-tip h6 {
    margin: 0 0 4px;
    font-size: var(--fs-2);
    color: var(--text);
  }
  .yd-eq {
    font-family: var(--mono);
    color: var(--text);
    background: var(--panel-3);
    padding: 1px 6px;
    border-radius: 2px;
  }
  .yd-how {
    display: flex;
    gap: 8px;
    align-items: center;
    margin: 8px 0 4px;
  }
  .yd-how ul {
    margin: 0;
    padding-left: 16px;
  }
  /* 欄の幅が 420px 未満なら小さな図を出さない（棒の目盛りの言葉が重ならないように。§7） */
  @container yd (max-width: 419px) {
    .yd-body {
      grid-template-columns: minmax(0, 1fr);
    }
    .yd-thumb {
      display: none;
    }
  }
</style>
