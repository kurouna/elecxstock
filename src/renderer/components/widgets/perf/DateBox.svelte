<script lang="ts">
// 左上: 基準日（実際に 100 にした日を大きく）と終わりの日・寄せた理由と注意の 1 行・年初〜20 年前の札（docs/design-perf.md §2.2）。
// 日付を押すとカレンダー（DatePop）。キーは親（PerfPane）の key で受ける
import type { JstDate } from '@shared/types'
import { type DateLimits, PF_PRESETS, slash, weekday } from '../../../lib/perf'
import { app, t } from '../../../stores/app.svelte'
import DatePop from './DatePop.svelte'

let {
  base,
  end,
  endIsToday,
  field,
  focused,
  notes,
  warn,
  preset,
  cal,
  limits,
  onfield,
  onpreset,
  onpick,
  onclose,
  pop = $bindable(),
}: {
  base: JstDate
  end: JstDate
  endIsToday: boolean
  field: 'base' | 'end'
  focused: boolean
  /** 打った日と 100 にした日が違う理由・配当込みの範囲（無ければ空） */
  notes: string
  warn: boolean
  /** 今の基準日に合う札（-1 は無し） */
  preset: number
  /** 開いているカレンダー */
  cal: 'base' | 'end' | null
  limits: DateLimits
  onfield: (f: 'base' | 'end') => void
  onpreset: (i: number) => void
  onpick: (d: JstDate) => void
  onclose: () => void
  pop?: { key: (e: KeyboardEvent) => boolean } | undefined
} = $props()
const lang = $derived(app.settings.lang)
let baseEl = $state<HTMLButtonElement>()
let endEl = $state<HTMLButtonElement>()
/** カレンダーは押した欄の下に出す（縦に積む狭い形でも欄の下） */
const popPos = (f: 'base' | 'end') => {
  const el = f === 'base' ? baseEl : endEl
  return el ? { top: el.offsetTop + el.offsetHeight + 4, left: Math.max(0, el.offsetLeft - 4) } : { top: 62, left: 0 }
}
const presetLabel = (n: number) => (n === 0 ? t('pf.ytd') : t('pf.years', { n }))
</script>

<section class="pf-date" class:focus={focused} data-testid="pf-date">
  <div class="pf-dl">{t('pf.base')}</div>
  <button type="button" class="pf-field" class:sel={field === 'base'} bind:this={baseEl} data-pf-field="base" data-testid="pf-base" onclick={() => onfield('base')}>
    <span class="pf-d num">{slash(base)}</span><span class="pf-w">{weekday(base, lang)}</span><span class="pf-cal" aria-hidden="true">▾</span>
  </button>
  <button type="button" class="pf-field end" class:sel={field === 'end'} bind:this={endEl} data-pf-field="end" data-testid="pf-end" onclick={() => onfield('end')}>
    <span class="pf-d num">〜 {slash(end)}</span><span class="pf-w">{endIsToday ? t('pf.today') : weekday(end, lang)}</span><span class="pf-cal" aria-hidden="true">▾</span>
  </button>
  <div class="pf-snap" class:warn data-testid="pf-snap">{notes}</div>
  <div class="pf-chips">
    {#each PF_PRESETS as n, i (n)}
      <button type="button" class:on={preset === i} title={`${presetLabel(n)} (Alt+${i + 1})`} onclick={() => onpreset(i)}>{presetLabel(n)}</button>
    {/each}
  </div>
  {#if cal}
    {#key cal}
      {@const pos = popPos(cal)}
      <div class="pf-popat" style:top={`${pos.top}px`} style:left={`${pos.left}px`}>
        <DatePop bind:this={pop} field={cal} chosen={cal === 'base' ? base : end} other={cal === 'base' ? end : base} {limits} {onpick} {onclose} />
      </div>
    {/key}
  {/if}
</section>

<style>
  .pf-date {
    grid-area: date;
    position: relative;
    border-right: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
    padding: 10px 14px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .pf-date.focus::after {
    content: '';
    position: absolute;
    inset: 0;
    border: 1px solid var(--focus);
    pointer-events: none;
  }
  .pf-dl {
    font-size: var(--fs-0);
    color: var(--text-3);
    letter-spacing: 0.06em;
  }
  .pf-field {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 4px 8px;
    margin: 0 -8px;
    border-radius: var(--radius);
    border: 1px solid transparent;
    background: transparent;
    color: var(--text);
    cursor: pointer;
    text-align: left;
    font: inherit;
  }
  .pf-field:hover {
    border-color: var(--line-strong);
  }
  .pf-field.sel {
    border-color: var(--line-strong);
    background: var(--panel-2);
  }
  .pf-date.focus .pf-field.sel {
    border-color: var(--focus);
  }
  .pf-d {
    font: 600 26px/1.1 var(--mono);
    letter-spacing: -0.01em;
  }
  .pf-w {
    font-size: var(--fs-2);
    color: var(--text-2);
  }
  .pf-cal {
    margin-left: auto;
    color: var(--text-3);
  }
  .pf-field.end {
    padding-top: 0;
    padding-bottom: 0;
  }
  .pf-field.end .pf-d {
    font-size: var(--fs-3);
    font-weight: 500;
    color: var(--text-2);
  }
  .pf-snap {
    font-size: var(--fs-1);
    color: var(--text-3);
    min-height: 16px;
  }
  .pf-snap:empty {
    display: none;
  }
  .pf-snap.warn {
    color: var(--warn);
  }
  .pf-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .pf-chips button {
    font: inherit;
    font-size: var(--fs-1);
    padding: 0 6px;
    line-height: 19px;
    border: 1px solid var(--line);
    border-radius: 10px;
    color: var(--text-2);
    background: transparent;
    cursor: pointer;
    white-space: nowrap;
  }
  .pf-chips button.on {
    border-color: var(--focus);
    color: var(--text);
  }
  .pf-popat {
    position: absolute;
    /* ペインの中の説明・メニューと同じく、銘柄を落とす場所の表示（30）より上 */
    z-index: 31;
  }
  @container (max-width: 859px) {
    .pf-date {
      border-right: 0;
      flex-direction: row;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px 14px;
      padding: 8px 12px;
    }
  }
</style>
