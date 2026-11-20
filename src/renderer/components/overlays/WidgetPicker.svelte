<script lang="ts">
// ペインの種類を選ぶ（Ctrl+Shift+N と、右・下に分割の続き。docs/design-dialogs.md §5・§6.5・FR-L7・FR-L11）。
// 線画の図・名前・説明のカードを分類ごとの格子に並べる。打って絞り込み、矢印で動き、Enter で決める
import { onMount, untrack } from 'svelte'
import type { Key } from '../../lib/i18n'
import { composing } from '../../lib/keys'
import { WIDGET_INFO } from '../../lib/widgetInfo'
import { gridMove, outcomeText, paneCounts, pickerGroups, pickOutcome, pickSel } from '../../lib/widgetPicker'
import { FREE_WIDGETS, IS_FREE } from '../../lib/windowSlot'
import { app, codeOf, nameOf, type Overlay, t } from '../../stores/app.svelte'
import { allPanes, findPane, layout, paneSymbol, type WidgetId } from '../../stores/layout.svelte'
import Hl from './Hl.svelte'
import Keys from './Keys.svelte'

let { overlay }: { overlay: Extract<Overlay, { kind: 'widgetPicker' }> } = $props()
let q = $state('')
let input = $state<HTMLInputElement>()
let res = $state<HTMLDivElement>()
const pane = $derived(findPane(overlay.paneId))
const current = $derived(overlay.mode === 'change' ? (pane?.widget ?? null) : null)
const tr = (k: string, a?: Record<string, string | number>) => t(k as Key, a)
const groups = $derived(pickerGroups({ q, free: IS_FREE, current, counts: paneCounts(allPanes(layout.entry)), tr }))
const enabled = $derived(groups.flatMap((g) => g.cards).filter((c) => !c.disabled))
let sel = $state<WidgetId | null>(null)
// 選ぶカード（初めは今の種類。打ったら今の種類以外の先頭。lib/widgetPicker.ts の pickSel）
$effect(() => {
  const next = pickSel(
    enabled.map((c) => c.id),
    current,
    q,
    untrack(() => sel),
  )
  if (next !== untrack(() => sel)) sel = next
})
const card = $derived(enabled.find((c) => c.id === sel))
const sym = $derived.by(() => {
  const id = pane ? paneSymbol(pane) : undefined
  return id ? `${codeOf(id)} ${nameOf(id)}` : ''
})
const outcome = $derived(
  sel ? pickOutcome({ mode: overlay.mode, dir: overlay.dir, current, target: sel, link: pane?.link ?? 0, inTab: card?.inTab ?? 0 }) : null,
)
const lines = $derived(
  outcome
    ? outcomeText(outcome, {
        tr,
        sym,
        curName: current ? t(`widget.${current}` as Key) : '',
        targetName: sel ? t(`widget.${sel}` as Key) : '',
      })
    : ['', ''],
)
const title = $derived(
  overlay.mode === 'change' ? t('wpick.title') : overlay.dir === 'col' ? t('wpick.titleSplitCol') : t('wpick.titleSplitRow'),
)
const verb = $derived(outcome?.kind === 'same' ? t('wpick.close') : overlay.mode === 'split' ? t('wpick.add') : t('wpick.change'))

function done(w: WidgetId | null) {
  // 先に resolve を取る（overlay は app.overlay を読むので、閉じたあとは読めない）
  const resolve = overlay.resolve
  app.overlay = null
  resolve(w)
}
function choose(id: WidgetId | null = sel) {
  const c = enabled.find((x) => x.id === id)
  if (!c) return
  // 今と同じ種類なら何もしないで閉じる
  done(c.current ? null : c.id)
}
/** 格子の列の数（幅で 4 か 2。画面の CSS が決める） */
function cols(): number {
  const g = res?.querySelector<HTMLElement>('.cards')
  return g ? getComputedStyle(g).gridTemplateColumns.split(' ').filter(Boolean).length || 4 : 4
}
function key(e: KeyboardEvent) {
  if (composing(e)) return
  if (e.key === 'Escape' && q) {
    q = ''
    e.preventDefault()
    return
  }
  if (!sel) return
  const empty = !q
  // 打っている間は ← → が文字のカーソルなので、↑ ↓ は読む順に 1 枚ずつ（同じ行の 2 枚目にも行ける）
  const dir =
    e.key === 'ArrowDown'
      ? empty
        ? 'down'
        : 'next'
      : e.key === 'ArrowUp'
        ? empty
          ? 'up'
          : 'prev'
        : e.key === 'ArrowRight' && empty
          ? 'right'
          : e.key === 'ArrowLeft' && empty
            ? 'left'
            : null
  if (dir) sel = gridMove(groups, cols(), sel, dir)
  else if (e.key === 'Home' && empty) sel = enabled[0]?.id ?? sel
  else if (e.key === 'End' && empty) sel = enabled[enabled.length - 1]?.id ?? sel
  else if (e.key === 'Enter') choose()
  else return
  e.preventDefault()
  queueMicrotask(() => res?.querySelector('.sel')?.scrollIntoView({ block: 'nearest' }))
}
onMount(() => input?.focus())
</script>

<div class="dialog lx wpick" role="dialog" aria-label={title}>
  <div class="lx-head">
    <h3>{title}</h3>
    {#if overlay.mode === 'change' && pane}
      <span class="tgt"><span class="dot" style:background={pane.link ? `var(--l${pane.link})` : 'transparent'}></span>{t('wpick.target', { name: t(`widget.${pane.widget}` as Key), link: pane.link ? t('wpick.link', { n: pane.link }) : t('wpick.noLink') })}</span>
    {/if}
    <label class="lx-search">
      <svg class="lx-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
      <input
        bind:this={input}
        bind:value={q}
        placeholder={t('wpick.ph')}
        role="combobox"
        aria-expanded="true"
        aria-controls="wpick-list"
        aria-activedescendant={sel ? `wpick-${sel}` : undefined}
        data-esc-local={q ? '' : undefined}
        onkeydown={key}
      />
    </label>
  </div>
  <div class="lx-res" id="wpick-list" role="listbox" aria-label={title} bind:this={res}>
    {#each groups as g (g.group)}
      <div class="wg" role="group" aria-label={t(`wgroup.${g.group}` as Key)}>
        <div class="lx-grp">{t(`wgroup.${g.group}` as Key)}<span class="n">{g.cards.length}</span></div>
        <div class="cards">
          {#each g.cards as c (c.id)}
            <button
              type="button"
              class="card"
              class:sel={c.id === sel}
              class:off={c.disabled}
              id="wpick-{c.id}"
              role="option"
              aria-selected={c.id === sel}
              aria-disabled={c.disabled}
              data-widget={c.id}
              tabindex="-1"
              onclick={() => choose(c.id)}
              onmousemove={() => !c.disabled && (sel = c.id)}
            >
              <svg class="lx-fig" viewBox="0 0 56 36" aria-hidden="true">
                {#each WIDGET_INFO[c.id].fig as [d, cls], i (i)}<path {d} class={cls ?? ''} />{/each}
              </svg>
              <span class="nm"><Hl text={c.name} ranges={c.ranges} /></span>
              <span class="ds">{c.desc}</span>
              <span class="bd">
                {#if c.current}<span class="cur">{t('wpick.current')}</span>{/if}
                {#if c.disabled}<span title={t('wpick.freeOnlyHint')}>{t('wpick.freeOnly')}<span class="lx-sr">（{t('wpick.freeOnlyHint')}）</span></span>{/if}
                {#if c.inTab > 0 && !c.disabled}<span>{t('wpick.inTab', { n: c.inTab })}</span>{/if}
              </span>
            </button>
          {/each}
        </div>
      </div>
    {:else}
      <div class="lx-empty">{t('wpick.none', { q })}</div>
    {/each}
  </div>
  <span class="lx-sr" aria-live="polite">{t('dlg.count', { n: enabled.length })}</span>
  <div class="lx-desc" aria-live="polite">
    {#if card}
      <b>{overlay.mode === 'split' ? t('wpick.addName', { name: card.name }) : outcome?.kind === 'same' ? card.name : t('wpick.toName', { name: card.name })}</b>
      <span class="d">{lines[0]}</span>
      <span class="d">{lines[1]}</span>
      <span class="r"><span><Keys keys="Enter" /> {verb}</span></span>
    {/if}
  </div>
  <div class="lx-foot">
    <span><Keys keys="← → ↑ ↓" /> {t('wpick.move')}</span>
    <span><Keys keys="Esc" /> {q ? t('dlg.clearQuery') : t('dlg.closeKey')}</span>
    {#if IS_FREE}<span class="r">{t('wpick.freeCount', { n: FREE_WIDGETS.length })}</span>{/if}
  </div>
</div>

<style>
  .wpick {
    width: 820px;
  }
  .wpick .lx-head {
    border-bottom: 1px solid var(--line);
  }
  .wpick .lx-res {
    padding: 4px 12px 12px;
  }
  .wpick .lx-desc {
    height: 72px;
    grid-template-rows: auto auto auto;
  }
  .wpick .lx-desc .d + .d {
    grid-row: 3;
  }
  .tgt {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--text-2);
    font-size: var(--fs-1);
    white-space: nowrap;
  }
  .tgt .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    border: 1px solid var(--line-strong);
  }
  .wg + .wg {
    margin-top: 4px;
  }
  .wg .lx-grp {
    padding: 6px 0 4px;
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
  }
  @container lxdlg (max-width: 640px) {
    .tgt {
      display: none;
    }
    .cards {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  .card {
    position: relative;
    display: grid;
    grid-template-columns: 56px minmax(0, 1fr);
    gap: 2px 10px;
    align-items: start;
    padding: 8px 9px;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-dlg);
    background: var(--panel);
    color: var(--text);
    cursor: pointer;
    text-align: left;
    font: inherit;
  }
  .card:hover {
    border-color: var(--text-3);
  }
  .card.sel {
    border-color: var(--focus);
    background: var(--select-strong);
    box-shadow: 0 0 0 1px var(--focus);
  }
  /* 線画の図の見た目は共通の骨格（Overlays.svelte の .lx-fig） */
  .card .lx-fig {
    grid-row: 1 / 4;
  }
  .card.sel .lx-fig {
    color: var(--focus);
  }
  .nm {
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ds {
    font-size: var(--fs-0);
    line-height: 1.45;
    color: var(--text-3);
  }
  .bd {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .bd > span {
    font-size: var(--fs-0);
    line-height: 14px;
    padding: 0 4px;
    border-radius: var(--radius-ctl);
    border: 1px solid var(--line-strong);
    color: var(--text-2);
  }
  .bd > .cur {
    border-color: var(--text-2);
    color: var(--text);
  }
  /* 使えない種類: 不透明度ではなく文字の色で薄くする（ライトでも説明が読める） */
  .card.off {
    cursor: default;
    background: var(--panel-2);
  }
  .card.off .nm {
    color: var(--text-2);
    font-weight: 400;
  }
  .card.off .lx-fig {
    color: var(--line-strong);
  }
</style>
