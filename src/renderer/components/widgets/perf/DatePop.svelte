<script lang="ts">
// 基準日・終わりの日のカレンダー（docs/design-perf.md §2.3）。日曜始まりの 6 週。休場日は薄く、選ぶと直前の営業日。
// 選べない範囲は消す。キー: ← → 日・↑ ↓ 週・PgUp PgDn 月（Shift で年）・Home End 月の初め／終わり・数字 8 桁・Enter・Esc（親の key から呼ぶ）
import { isTradingDay } from '@shared/calendar'
import type { JstDate } from '@shared/types'
import { onMount } from 'svelte'
import { addMonths, calendarCells, calMove, type DateLimits, parseYmd, slash, snapTrading, weekday } from '../../../lib/perf'
import { app, t, toast } from '../../../stores/app.svelte'

let {
  field,
  chosen,
  other,
  limits,
  onpick,
  onclose,
}: {
  field: 'base' | 'end'
  /** 今の日（100 にした日・終わりの日） */
  chosen: JstDate
  /** もう一方の日（間を淡く塗る） */
  other: JstDate
  limits: DateLimits
  onpick: (d: JstDate) => void
  onclose: () => void
} = $props()

// svelte-ignore state_referenced_locally
let cur = $state<JstDate>(chosen)
let typed = $state('')
let el = $state<HTMLDivElement>()
const ym = $derived(cur.slice(0, 7))
const cells = $derived(calendarCells(ym))
const lang = $derived(app.settings.lang)
const head = $derived(lang === 'ja' ? `${Number(ym.slice(0, 4))} 年 ${Number(ym.slice(5, 7))} 月` : `${ym.slice(0, 4)}/${ym.slice(5, 7)}`)
const dis = (d: JstDate) => d < limits.min || d > limits.max
const lo = $derived(field === 'base' ? chosen : other)
const hi = $derived(field === 'base' ? other : chosen)

function pick(d: JstDate) {
  const s = snapTrading(d)
  if (dis(d) || dis(s)) {
    toast(t('pf.calOut', { a: slash(limits.min), b: slash(limits.max) }))
    return
  }
  onpick(s)
}
/** 親のキー処理から呼ぶ。扱ったら true */
export function key(e: KeyboardEvent): boolean {
  const c = e.code
  if (/^(Digit|Numpad)\d$/.test(c) && !e.ctrlKey && !e.altKey) {
    typed = (typed + c.slice(-1)).slice(0, 8)
    if (typed.length === 8) {
      const d = parseYmd(typed)
      if (d) cur = d
      else toast(t('pf.badDate'))
      typed = ''
    }
    return true
  }
  if (c === 'Backspace') {
    typed = typed.slice(0, -1)
    return true
  }
  if (c === 'Enter' || c === 'Space') {
    pick(cur)
    return true
  }
  if (c === 'Escape' || c === 'Tab') {
    onclose()
    return c === 'Escape'
  }
  const m = calMove(cur, e.key, e.shiftKey)
  if (m) {
    cur = m
    typed = ''
  }
  return true
}
onMount(() => {
  // 外を押したら閉じる（日付の欄を押したときは、欄が開け閉めする）
  const outside = (e: PointerEvent) => {
    const tg = e.target as Element | null
    if (el && !el.contains(tg) && !tg?.closest?.('[data-pf-field]')) onclose()
  }
  window.addEventListener('pointerdown', outside, true)
  return () => window.removeEventListener('pointerdown', outside, true)
})
</script>

<div class="pf-pop" bind:this={el} role="dialog" aria-label={t('pf.calTitle')} data-testid="pf-cal">
  <div class="pf-calh">
    <button type="button" class="pf-nb" title={`${t('pf.prevYear')} (Shift+PgUp)`} aria-label={t('pf.prevYear')} onclick={() => (cur = addMonths(cur, -12))}>«</button>
    <button type="button" class="pf-nb" title={`${t('pf.prevMonth')} (PgUp)`} aria-label={t('pf.prevMonth')} onclick={() => (cur = addMonths(cur, -1))}>‹</button>
    <span class="pf-ym" data-testid="pf-cal-ym">{#if typed}<span class="pf-typed num">{typed}</span>{:else}{head}{/if}</span>
    <button type="button" class="pf-nb" title={`${t('pf.nextMonth')} (PgDn)`} aria-label={t('pf.nextMonth')} onclick={() => (cur = addMonths(cur, 1))}>›</button>
    <button type="button" class="pf-nb" title={`${t('pf.nextYear')} (Shift+PgDn)`} aria-label={t('pf.nextYear')} onclick={() => (cur = addMonths(cur, 12))}>»</button>
  </div>
  <div class="pf-calg">
    {#each [0, 1, 2, 3, 4, 5, 6] as w (w)}<div class="pf-wh">{weekday(`2024-09-0${w + 1}`, lang)}</div>{/each}
    {#each cells as d (d)}
      {@const off = !isTradingDay(d)}
      <button
        type="button"
        class="pf-dd num"
        class:oth={d.slice(0, 7) !== ym}
        class:off
        class:dis={dis(d)}
        class:on={d === chosen}
        class:cur={d === cur}
        class:rng={d > lo && d < hi && d.slice(0, 7) === ym}
        data-day={d}
        disabled={dis(d)}
        title={off ? t('pf.calOff') : ''}
        tabindex="-1"
        onclick={() => pick(d)}>{Number(d.slice(8))}</button
      >
    {/each}
  </div>
  <div class="pf-calf">
    <span>{field === 'base' ? t('pf.calBase') : t('pf.calEnd')}</span>
    {#if field === 'end'}<button type="button" class="pf-pbtn" onclick={() => onpick(limits.max)}>{t('pf.today')}</button>{/if}
  </div>
</div>

<style>
  .pf-pop {
    position: relative;
    width: 260px;
    padding: 8px;
    background: var(--panel);
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    box-shadow: 0 10px 34px rgb(0 0 0 / 0.45);
  }
  .pf-calh {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-bottom: 6px;
  }
  .pf-ym {
    flex: 1;
    text-align: center;
    font-weight: 500;
    font-size: var(--fs-3);
  }
  .pf-typed {
    color: var(--focus);
  }
  .pf-nb {
    background: transparent;
    border: 1px solid transparent;
    color: var(--text-2);
    width: 24px;
    height: 22px;
    border-radius: var(--radius);
    cursor: pointer;
    font: inherit;
  }
  .pf-nb:hover {
    border-color: var(--line-strong);
    color: var(--text);
  }
  .pf-calg {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 1px;
  }
  .pf-wh {
    text-align: center;
    font-size: var(--fs-0);
    color: var(--text-3);
    padding: 2px 0;
  }
  .pf-dd {
    text-align: center;
    font-size: var(--fs-2);
    line-height: 26px;
    border-radius: var(--radius);
    cursor: pointer;
    color: var(--text);
    border: 1px solid transparent;
    background: transparent;
    padding: 0;
  }
  .pf-dd:hover {
    background: var(--panel-3);
  }
  .pf-dd.off,
  .pf-dd.oth {
    color: var(--text-3);
  }
  .pf-dd.oth {
    opacity: 0.45;
  }
  .pf-dd.dis {
    opacity: 0.25;
    cursor: not-allowed;
  }
  .pf-dd.rng {
    background: color-mix(in srgb, var(--focus) 12%, transparent);
  }
  .pf-dd.on {
    background: var(--focus);
    color: #fff;
  }
  .pf-dd.cur {
    border-color: var(--focus);
  }
  .pf-calf {
    display: flex;
    gap: 6px;
    align-items: center;
    justify-content: space-between;
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid var(--line-soft);
    font-size: var(--fs-1);
    color: var(--text-3);
  }
  .pf-pbtn {
    background: var(--panel-2);
    border: 1px solid var(--line-strong);
    color: var(--text-2);
    border-radius: var(--radius);
    padding: 1px 8px;
    font: inherit;
    font-size: var(--fs-1);
    cursor: pointer;
  }
</style>
