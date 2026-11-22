<script lang="ts" module>
/** 一覧の 1 行 */
export interface PfRow {
  id: string
  code: string
  /** 短い名前（札と同じ） */
  short: string
  /** 正式名 */
  name: string
  bench: boolean
  /** 線の色（比べる相手は灰） */
  color: string
  dash: boolean
  off: boolean
  /** 値（十字線の日、無ければ終わりの日）の文字と色 */
  value: string
  tone: string
  /** データなし・取得中などの理由（あれば線を描かない） */
  reason: string | null
}
/** 選んだ行の詳細（2 行） */
export interface PfDetail {
  id: string
  code: string
  name: string
  /** 「26/11/13 まで +49.4%」など。理由があれば理由 */
  parts: { label: string; value: string; tone?: string }[]
  warn: string | null
}
</script>

<script lang="ts">
// 左下: 銘柄の一覧（docs/design-perf.md §2.4）。色の線・コード・短い名前・値・「−」。比べる相手は下に分けて出す。
// ＋は銘柄ジャンプを開く（Ctrl+Enter でこのペインに足す）。選んだ行の詳細を固定の高さで出す
import { t } from '../../../stores/app.svelte'

let {
  rows,
  bench,
  sel,
  focused,
  count,
  max,
  sortLabel,
  detail,
  onsel,
  onremove,
  onadd,
  onimport,
  onsort,
  onshow,
}: {
  rows: PfRow[]
  bench: PfRow[]
  sel: string | null
  focused: boolean
  count: number
  max: number
  sortLabel: string
  detail: PfDetail | null
  onsel: (id: string) => void
  onremove: (id: string) => void
  onadd: () => void
  onimport: () => void
  onsort: () => void
  onshow: (id: string) => void
} = $props()
let body = $state<HTMLDivElement>()
$effect(() => {
  void sel
  queueMicrotask(() => body?.querySelector('.pf-row.sel')?.scrollIntoView({ block: 'nearest' }))
})
</script>

{#snippet row(r: PfRow)}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="pf-row"
    class:sel={r.id === sel}
    class:off={r.off}
    class:nodata={!!r.reason}
    role="option"
    tabindex="-1"
    aria-selected={r.id === sel}
    data-id={r.id}
    onclick={() => onsel(r.id)}
    ondblclick={() => onshow(r.id)}
  >
    <span class="pf-sw" class:dash={r.dash} style:--sw={r.color}></span>
    <span class="pf-nm" title={`${r.code} ${r.name}`}><span class="pf-c num">{r.code}</span><span class="pf-n">{r.short}</span></span>
    {#if r.reason}
      <span class="pf-v why" title={r.reason}>{r.reason}</span>
    {:else if r.off}
      <span class="pf-v why">{t('pf.hidden')}</span>
    {:else}
      <span class={`pf-v num ${r.tone}`}>{r.value}</span>
    {/if}
    <button type="button" class="pf-minus" title={`${t('pf.remove')} (Delete)`} aria-label={`${t('pf.remove')} ${r.code}`} onclick={(e) => { e.stopPropagation(); onremove(r.id) }}>−</button>
  </div>
{/snippet}

<section class="pf-list" class:focus={focused} data-testid="pf-list">
  <div class="pf-lh">
    <span>{t('pf.stocks')} <span class="num" data-testid="pf-count">{count} / {max}</span></span>
    <span class="pf-r">
      <button type="button" class="pf-link" title={`${t('pf.importHint')} (I)`} onclick={onimport}>{t('pf.import')}</button>
      <button type="button" class="pf-link" title={`${t('pf.sortHint')} (S)`} onclick={onsort}>{sortLabel} ▾</button>
      <button type="button" class="pf-plus" disabled={count >= max} title={count >= max ? t('pf.full') : `${t('pf.addBtn')} (Insert)`} aria-label={t('pf.addBtn')} onclick={onadd}>＋</button>
    </span>
  </div>
  <div class="pf-rows" bind:this={body} role="listbox" aria-label={t('pf.stocks')}>
    {#each rows as r (r.id)}{@render row(r)}{/each}
    {#if bench.length}
      <div class="pf-grp">{t('pf.bench')}</div>
      {#each bench as r (r.id)}{@render row(r)}{/each}
    {/if}
  </div>
  <div class="pf-detail" data-testid="pf-detail">
    {#if detail}
      <div class="pf-dn"><span class="pf-c num">{detail.code}</span>{detail.name}</div>
      {#if detail.warn}
        <div class="pf-dm warn">{detail.warn}</div>
      {:else}
        <div class="pf-dm">
          {#each detail.parts as p (p.label)}<span>{p.label} <b class={`num ${p.tone ?? ''}`}>{p.value}</b></span>{/each}
        </div>
      {/if}
    {/if}
  </div>
</section>

<style>
  .pf-list {
    grid-area: list;
    position: relative;
    border-right: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .pf-list.focus::after {
    content: '';
    position: absolute;
    inset: 0;
    border: 1px solid var(--focus);
    pointer-events: none;
  }
  .pf-lh {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px 4px;
    font-size: var(--fs-0);
    color: var(--text-3);
    letter-spacing: 0.06em;
    flex: none;
  }
  .pf-r {
    margin-left: auto;
    display: inline-flex;
    gap: 8px;
    align-items: center;
    letter-spacing: 0;
  }
  .pf-link {
    background: none;
    border: 0;
    padding: 0;
    font: inherit;
    font-size: var(--fs-1);
    color: var(--text-2);
    cursor: pointer;
    border-bottom: 1px dashed var(--line-strong);
  }
  .pf-link:hover {
    color: var(--focus);
  }
  .pf-plus {
    background: transparent;
    border: 1px solid var(--line-strong);
    color: var(--text);
    width: 22px;
    height: 20px;
    border-radius: var(--radius);
    cursor: pointer;
    font: 500 14px/1 var(--font);
    display: inline-grid;
    place-items: center;
    padding: 0;
  }
  .pf-plus:hover {
    border-color: var(--focus);
    color: var(--focus);
  }
  .pf-plus:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
  .pf-rows {
    flex: 1;
    overflow: auto;
    scrollbar-width: thin;
    padding: 0 6px 6px;
  }
  .pf-row {
    display: grid;
    grid-template-columns: 14px minmax(0, 1fr) auto 18px;
    gap: 1px 8px;
    align-items: center;
    padding: 4px 6px;
    border-radius: var(--radius);
    cursor: pointer;
    outline: none;
  }
  .pf-row.sel {
    background: var(--panel-3);
  }
  .pf-list.focus .pf-row.sel {
    box-shadow: inset 2px 0 0 var(--focus);
  }
  .pf-sw {
    width: 12px;
    height: 3px;
    border-radius: 2px;
    background: var(--sw);
  }
  .pf-sw.dash {
    background: none;
    height: 0;
    border-top: 2px dashed var(--sw);
  }
  .pf-row.off .pf-sw,
  .pf-row.nodata .pf-sw {
    background: transparent;
    border: 1px dashed var(--line-strong);
    height: 6px;
  }
  .pf-row.off {
    opacity: 0.5;
  }
  .pf-nm {
    display: flex;
    gap: 6px;
    align-items: baseline;
    min-width: 0;
  }
  .pf-c {
    color: var(--text-3);
    font-size: var(--fs-1);
    flex: none;
  }
  .pf-n {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pf-v {
    text-align: right;
    font-size: var(--fs-3);
    font-weight: 500;
  }
  .pf-v.up {
    color: var(--up);
  }
  .pf-v.down {
    color: var(--down);
  }
  .pf-v.why {
    font-size: var(--fs-1);
    font-weight: 400;
    color: var(--warn);
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pf-row.off .pf-v.why {
    color: var(--text-3);
  }
  .pf-minus {
    background: transparent;
    border: 1px solid transparent;
    color: var(--text-3);
    width: 18px;
    height: 18px;
    border-radius: var(--radius);
    cursor: pointer;
    font: 500 13px/1 var(--font);
    display: grid;
    place-items: center;
    padding: 0;
    opacity: 0.35;
  }
  .pf-row:hover .pf-minus,
  .pf-row.sel .pf-minus {
    opacity: 1;
  }
  .pf-minus:hover {
    color: var(--text);
    border-color: var(--line-strong);
  }
  .pf-grp {
    font-size: var(--fs-0);
    color: var(--text-3);
    padding: 8px 6px 2px;
    letter-spacing: 0.06em;
  }
  .pf-detail {
    flex: none;
    height: 50px;
    border-top: 1px solid var(--line);
    padding: 6px 12px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: var(--fs-1);
    color: var(--text-3);
    overflow: hidden;
  }
  .pf-dn {
    color: var(--text);
    font-size: var(--fs-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pf-dn .pf-c {
    margin-right: 6px;
  }
  .pf-dm {
    display: flex;
    flex-wrap: wrap;
    gap: 0 12px;
    white-space: nowrap;
  }
  .pf-dm b {
    font-weight: 500;
    color: var(--text);
  }
  .pf-dm b.up {
    color: var(--up);
  }
  .pf-dm b.down {
    color: var(--down);
  }
  .pf-dm.warn {
    color: var(--warn);
    white-space: normal;
  }
  @container (max-width: 859px) {
    .pf-list {
      border-right: 0;
      border-top: 1px solid var(--line);
      max-height: 260px;
    }
  }
</style>
