<script lang="ts">
// コマンドバー（Ctrl+K）: 銘柄（コード・日本語名・英語名）・スクリーニング条件・アクション・ペインの種類・ペインの中のキーを 1 つの入力で探す
// （FR-KB1, KB9, O1。docs/design-dialogs.md §3）。候補の組み立ては lib/palette.ts、照合は @shared/match。
// 空のときは最近の銘柄（チップ）・最近使ったアクション・このペインで、を先に出す。範囲は検索欄の下のチップ（Tab）と接頭辞（> # @）
import type { Instrument, InstrumentId } from '@shared/types'
import { onMount } from 'svelte'
import { type Action, focusedAddTarget, keyOf, paletteActions, sendSymbol } from '../../lib/commands'
import { keepFocus } from '../../lib/focusTrap'
import type { Key } from '../../lib/i18n'
import { composing } from '../../lib/keys'
import { pageCommands } from '../../lib/pages'
import {
  buildPalette,
  CONTEXT_ACTIONS,
  fmtChgPct,
  fmtClose,
  groupOf,
  isTracked,
  moveRow,
  type PalAction,
  type PalItem,
  parseQuery,
  pushRecent,
  recentOf,
  SCOPES,
  type Scope,
  stripPrefix,
} from '../../lib/palette'
import { openScreenAnywhere, paletteScreens } from '../../lib/screens'
import { clampSel } from '../../lib/selection'
import { langIx, PANE_KEY_ROWS, SECTION_KEY, type SectionId } from '../../lib/shortcuts'
import { WIDGET_INFO } from '../../lib/widgetInfo'
import { outcomeText, paneCounts, pickOutcome } from '../../lib/widgetPicker'
import { FREE_WIDGETS, IS_FREE } from '../../lib/windowSlot'
import {
  app,
  bridge,
  codeOf,
  ensureMetrics,
  inst,
  isFav,
  metric,
  nameOf,
  rpc,
  saveSettings,
  screenName,
  t,
  toast,
  toggleFav,
} from '../../stores/app.svelte'
import { allPanes, changeWidget, findPane, layout, paneSymbol, type WidgetId } from '../../stores/layout.svelte'
import Hl from './Hl.svelte'
import Keys from './Keys.svelte'

/** title があるときは銘柄だけを選ぶ（chart-grid のタイルの差し替えなど） */
let { q = '', title }: { q?: string; title?: string } = $props()
let query = $state('')
let scope = $state<Scope>('all')
let sel = $state(0)
let syms = $state<Instrument[]>([])
let input = $state<HTMLInputElement>()
let res = $state<HTMLDivElement>()
let token = 0

const tr = (k: string, a?: Record<string, string | number>) => t(k as Key, a)
const parsed = $derived(parseQuery(query, scope))
const focusPane = $derived(findPane(app.focus))
const widget = $derived(focusPane?.widget)
/** ペインの種類の候補: 変えると何が起きるか（ペインの種類のダイアログと同じ文。docs/design-dialogs.md §3・§5） */
function paneOutcome(target: WidgetId): string {
  const id = focusPane ? paneSymbol(focusPane) : undefined
  const o = pickOutcome({
    mode: 'change',
    current: widget ?? null,
    target,
    link: focusPane?.link ?? 0,
    inTab: paneCounts(allPanes(layout.entry))[target] ?? 0,
  })
  return outcomeText(o, { tr, sym: id ? `${codeOf(id)} ${nameOf(id)}` : '', curName: widget ? t(`widget.${widget}` as Key) : '' })
    .filter(Boolean)
    .join(' · ')
}
// アクション（この窓で使えるもの）と、マイレイアウトのページを開く項目（FR-L14。ACTIONS には入れない）
const acts = $derived.by((): (Action & { group: ReturnType<typeof groupOf> })[] => {
  const pages: Action[] = pageCommands().map((c) => ({ id: c.id, label: () => c.label, run: c.run }))
  return [...paletteActions(), ...pages].map((a) => ({ ...a, group: groupOf(a.id) }))
})
const palActs = $derived(
  acts.map((a): PalAction => ({ id: a.id, label: a.label(), key: keyOf(a), group: a.group, reason: a.enabled?.() ?? null })),
)
const actById = $derived(new Map(acts.map((a) => [a.id, a])))
const palById = $derived(new Map(palActs.map((a) => [a.id, a])))
// ペインの種類（フリー N で使えないものは出さない）
const widgets = $derived(
  (Object.keys(WIDGET_INFO) as WidgetId[])
    .filter((w) => !IS_FREE || FREE_WIDGETS.includes(w))
    .map((w) => ({
      id: w,
      name: t(`widget.${w}` as Key),
      alias: t(`widgetAlias.${w}` as Key)
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
      current: w === widget,
    })),
)
const li = $derived(langIx(app.settings.lang))
// ペインの中のキー（全体の段のキーは入れない。lib/shortcuts.ts）
const paneKeyRows = PANE_KEY_ROWS
const paneKeys = $derived(paneKeyRows.map((r) => ({ label: r.label[li], alias: r.alias ?? [], grp: r.grp[li], keys: r.keys ?? '' })))
const recent = $derived(recentOf(app.settings.paletteRecent ?? []))

// 銘柄は Core で探す（遅れて届いた古い結果は捨てる）
$effect(() => {
  const s = parsed.q
  const my = ++token
  if (!s || (!title && parsed.scope !== 'all' && parsed.scope !== 'sym')) {
    syms = []
    return
  }
  bridge
    .call('instruments.search', { q: s.toLowerCase(), limit: 10 })
    .then((r) => {
      if (my === token) syms = r
    })
    .catch(() => {})
})
/** 検索で当たった銘柄。取得の対象外（スタンダード・グロースなど）は app.instruments に無いので、検索の結果から描く */
const found = $derived(new Map(syms.map((i) => [i.id, i])))
const insOf = (id: InstrumentId) => found.get(id) ?? inst(id)
const nmOf = (id: InstrumentId) => {
  const i = found.get(id)
  return i ? (app.settings.lang === 'en' && i.nameEn ? i.nameEn : i.nameJa) : nameOf(id)
}
const cdOf = (id: InstrumentId) => found.get(id)?.code ?? codeOf(id)
const screens = $derived(paletteScreens().map((x) => ({ id: x.id, name: screenName(x) })))
const screenNameOf = $derived(new Map(screens.map((x) => [x.id, x.name])))
const groups = $derived(
  buildPalette({
    q: parsed.q,
    scope: parsed.scope,
    actions: palActs,
    screens,
    syms: syms.map((i) => ({
      id: i.id,
      code: i.code,
      name: app.settings.lang === 'en' && i.nameEn ? i.nameEn : i.nameJa,
      tracked: isTracked(i),
    })),
    widgets: app.focus ? widgets : [],
    paneKeys,
    recentSyms: recent.syms,
    recentActs: recent.acts,
    context: widget ? (CONTEXT_ACTIONS[widget] ?? []) : [],
    contextName: widget ? t(`widget.${widget}` as Key) : '',
    symbolsOnly: !!title,
    tr,
  }),
)
const flat = $derived(groups.flatMap((g) => g.items.map((it) => ({ it, g }))))
const chipRows = $derived(flat.map((x) => !!x.g.chips))
/** 候補の通し番号（行ごとに探さない） */
const indexOf = $derived(new Map(flat.map((x, i) => [x.it, i])))
// 終値・前日比は手元の指標から（無ければ取りに行き、届くまでは出さない）
$effect(() => {
  const ids = flat.flatMap(({ it }) => (it.kind === 'sym' ? [it.id] : []))
  if (ids.length) ensureMetrics(ids)
})
$effect(() => {
  // 空の一覧で -1 にしない（遅れて届いた候補で Enter が効かなくなるため）
  const c = clampSel(sel, flat.length)
  if (c !== sel) sel = c
})
const cur = $derived(flat[sel])
const heldCodes = $derived(new Set(app.holdings.map((h) => h.code)))
/** フォーカス中のペインが足す先を持てば（ウォッチリスト・パフォーマンス比較）、そこに直接足せる（Ctrl+Enter） */
const target = $derived(title ? null : focusedAddTarget())

function remember(key: string) {
  saveSettings({ paletteRecent: pushRecent(app.settings.paletteRecent ?? [], key, 20) })
}
/** 候補の銘柄 ID。まだ一覧に無いコードは、追加して取得を始めてから返す */
async function idOf(x: PalItem | undefined): Promise<InstrumentId | null> {
  if (x?.kind === 'sym') return x.id
  if (x?.kind !== 'add') return null
  const ins = await rpc('instruments.addUser', { code: x.code })
  if (!ins) return null
  app.instruments.set(ins.id, ins)
  toast(t('cmd.addUser', { code: x.code }))
  return ins.id
}
/** ☆: お気に入りに入れる・外す。コマンドバーは閉じない（続けて探せるように） */
async function fav(i = sel) {
  const x = flat[i]?.it
  const id = await idOf(x)
  if (!id) return
  toggleFav(id)
  if (x?.kind === 'add') {
    app.overlay = null
    sendSymbol(id)
  }
}
/** フォーカス中のペインの足す先に足す（ウォッチリストは足してから表示する）。足せなければ足す先が理由を知らせ、閉じない */
async function addTo(i = sel) {
  const to = target
  if (!to) return
  const id = await idOf(flat[i]?.it)
  if (!id || !to.add(id)) return
  app.overlay = null
  remember(`sym:${id}`)
}
async function go(i = sel) {
  const x = flat[i]?.it
  if (!x) return
  if (x.kind === 'act') {
    const r = palById.get(x.id)?.reason
    if (r) return void toast(t(r as Key))
  }
  if (x.kind === 'pane' && x.id === widget) return void toast(t('cmd.nowType'))
  // 一覧に無いコードは、足してから閉じる（先に閉じると、待っている間に「閉じた＝やめた」と受け取られ、グリッドの C の差し替えが追加になる）
  if (x.kind === 'add') {
    const id = await idOf(x)
    app.overlay = null
    if (id) {
      remember(`sym:${id}`)
      sendSymbol(id)
    }
    return
  }
  app.overlay = null
  if (x.kind === 'sym') {
    remember(`sym:${x.id}`)
    sendSymbol(x.id)
  } else if (x.kind === 'scr') openScreenAnywhere(x.id)
  else if (x.kind === 'act') {
    if (!x.id.startsWith('page:')) remember(`act:${x.id}`)
    await actById.get(x.id)?.run()
  } else if (x.kind === 'pane') {
    if (app.focus) changeWidget(app.focus, x.id)
  } else if (x.kind === 'key') app.overlay = { kind: 'help', q: paneKeys[x.index]?.label ?? '' }
}
/** ↑ ↓: 最近の銘柄のチップの行は 1 段として飛ぶ。← →: チップの上だけ */
const moveV = (d: 1 | -1) => (sel = moveRow(chipRows, sel, d))
function key(e: KeyboardEvent) {
  if (composing(e)) return
  const onChip = !!flat[sel]?.g.chips
  if (e.key === 'ArrowDown') moveV(1)
  else if (e.key === 'ArrowUp') moveV(-1)
  else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && onChip) {
    const j = sel + (e.key === 'ArrowRight' ? 1 : -1)
    if (flat[j]?.g.chips) sel = j
  } else if (e.key === 'PageDown') sel = clampSel(sel + 8, flat.length)
  else if (e.key === 'PageUp') sel = Math.max(0, sel - 8)
  else if (e.key === 'Tab') {
    // 範囲を巡る（銘柄だけを探すとき（title）は範囲が無いので、何もしない。ダイアログの外へフォーカスを出さない）
    if (title) return e.preventDefault()
    const i = SCOPES.indexOf(parsed.scope)
    scope = SCOPES[(i + (e.shiftKey ? -1 : 1) + SCOPES.length) % SCOPES.length]!
    query = stripPrefix(query)
    sel = 0
  } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    void addTo()
  } else if (e.key === 'Enter') void go()
  else if (e.code === 'KeyD' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && !title) void fav()
  else if (e.key === 'Escape' && query) {
    query = ''
    sel = 0
  } else return
  e.preventDefault()
  queueMicrotask(() => res?.querySelector('.sel')?.scrollIntoView({ block: 'nearest' }))
}
function pickScope(s: Scope) {
  scope = s
  query = stripPrefix(query)
  sel = 0
  input?.focus()
}
const secName = (sec: SectionId) => t(SECTION_KEY[sec])
const mkt = (i: Instrument | undefined) => (i ? t(`mkt.${i.market}` as Key) : '')
onMount(() => {
  query = q
  input?.focus()
})
</script>

{#snippet code(id: InstrumentId, hit: number | undefined)}
  {@const c = cdOf(id)}
  <span class="code">{#if hit}<mark>{c.slice(0, hit)}</mark>{c.slice(hit)}{:else}{c}{/if}</span>
{/snippet}

<!-- 押しても探す欄からフォーカスを移さない（閉じない行・見出しを押したあとも打つ・Esc が効く） -->
<!-- svelte-ignore a11y_interactive_supports_focus -->
<div class="dialog lx palette" role="dialog" aria-label={t('a11y.commandBar')} onmousedown={keepFocus}>
  {#if title}<div class="ttl">{title}</div>{/if}
  <div class="lx-head">
    <label class="lx-search">
      <svg class="lx-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
      <input
        bind:this={input}
        bind:value={query}
        placeholder={title ? t('cmd.symbolPh') : t('cmd.ph')}
        role="combobox"
        aria-expanded="true"
        aria-controls="pal-list"
        aria-activedescendant={cur ? `pal-${sel}` : undefined}
        data-esc-local={query ? '' : undefined}
        onkeydown={key}
        oninput={() => (sel = 0)}
      />
    </label>
  </div>
  {#if !title}
    <div class="lx-scope">
      <span>{t('cmd.scope')}</span>
      {#each SCOPES as s (s)}
        <button type="button" class="lx-chip" class:on={parsed.scope === s} aria-pressed={parsed.scope === s} tabindex="-1" onclick={() => pickScope(s)}>{t(`cmd.scope.${s}` as Key)}</button>
      {/each}
      <span class="r"><Keys keys="Tab" /> {t('cmd.scopeNext')}</span>
    </div>
  {/if}
  <div class="lx-res list" id="pal-list" role="listbox" aria-label={t('a11y.commandBar')} bind:this={res}>
    {#each groups as g (g.id)}
      <div role="group" aria-labelledby="pal-g-{g.id}">
        <div class="lx-grp" id="pal-g-{g.id}">{g.title}{#if g.more}<span class="more">{t('cmd.more', { n: g.more })}</span>{/if}<span class="n">{g.chips ? '' : g.items.length}</span></div>
        {#if g.chips}
          <div class="chips">
            {#each g.items as it (it.kind === 'sym' ? it.id : '')}
              {@const i = indexOf.get(it) ?? -1}
              {#if it.kind === 'sym'}
                <button type="button" class="lx-chip sym" class:sel={i === sel} id="pal-{i}" role="option" aria-selected={i === sel} tabindex="-1" onclick={() => go(i)} onmousemove={() => (sel = i)}>
                  <b>{cdOf(it.id)}</b>{nmOf(it.id)}
                </button>
              {/if}
            {/each}
          </div>
        {:else}
          {#each g.items as it, k (k)}
            {@const i = indexOf.get(it) ?? -1}
            {@const a = it.kind === 'act' ? palById.get(it.id) : undefined}
            <div class="row" class:on={i === sel}>
              <button
                type="button"
                class="it"
                class:sel={i === sel}
                class:off={!!a?.reason || (it.kind === 'pane' && it.id === widget)}
                id="pal-{i}"
                role="option"
                aria-selected={i === sel}
                aria-disabled={!!a?.reason || (it.kind === 'pane' && it.id === widget)}
                tabindex="-1"
                onclick={() => go(i)}
                onmousemove={() => (sel = i)}
              >
                {#if it.kind === 'sym'}
                  {@const ins = insOf(it.id)}
                  {@const m = metric(it.id)}
                  <span class="lead">{@render code(it.id, it.codeHit)}</span>
                  <span class="n"><Hl text={nmOf(it.id)} ranges={it.ranges} /></span>
                  <span class="mk">{mkt(ins)}{ins?.status === 'delisted' ? ' · delisted' : ''}</span>
                  <span class="held">{heldCodes.has(cdOf(it.id)) ? t('cmd.held') : ''}</span>
                  <span class="px">{fmtClose(m?.close, app.settings.lang)}</span>
                  <span class="chg" class:up={(m?.chgPct ?? 0) > 0} class:down={(m?.chgPct ?? 0) < 0}>{fmtChgPct(m?.chgPct)}</span>
                {:else if it.kind === 'add'}
                  <span class="lead"><span class="code">{it.code}</span></span><span class="n add">{t('cmd.addLabel', { code: it.code })}</span>
                {:else if it.kind === 'scr'}
                  <span class="lead"><svg class="lx-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16l-6 7v6l-4 2v-8z" /></svg></span>
                  <span class="n"><Hl text={screenNameOf.get(it.id) ?? ''} ranges={it.ranges} /></span>
                {:else if it.kind === 'act' && a}
                  <span class="lead">
                    {#if a.reason}<svg class="lx-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="1.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>{/if}
                    <span class="tg">{g.tags ? t(`agroupShort.${a.group}` as Key) : ''}</span>
                  </span>
                  <span class="n"><Hl text={a.label} ranges={it.ranges} /></span>
                  {#if a.reason}<span class="lx-sr">{t('cmd.lock')}</span>{/if}
                  {#if a.key}<Keys keys={a.key} />{/if}
                {:else if it.kind === 'pane'}
                  <span class="lead"><svg class="lx-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={WIDGET_INFO[it.id].icon} /></svg><span class="tg">{it.id === widget ? t('wpick.current') : ''}</span></span>
                  <span class="n"><b><Hl text={t(`widget.${it.id}` as Key)} ranges={it.ranges} /></b> <span class="s">{t(`widgetDesc.${it.id}` as Key)}</span></span>
                {:else if it.kind === 'key'}
                  {@const r = paneKeyRows[it.index]}
                  <span class="lead" title={r ? secName(r.sec) : ''}><span class="tg">{r ? secName(r.sec) : ''}</span></span>
                  <span class="n"><Hl text={paneKeys[it.index]?.label ?? ''} ranges={it.ranges} /></span>
                  <Keys keys={paneKeys[it.index]?.keys ?? ''} />
                {/if}
              </button>
              {#if !title && (it.kind === 'sym' || it.kind === 'add')}
                {@const on = it.kind === 'sym' && isFav(it.id)}
                {#if target && !target.quiet}
                  <button type="button" class="side" class:full={target.full} aria-hidden="true" tabindex="-1" title={`${target.full ? (target.fullTitle ?? target.title) : target.title} (Ctrl+Enter)`} onclick={() => addTo(i)} onmousemove={() => (sel = i)}>＋ {target.label}</button>
                {/if}
                <button type="button" class="side star" class:fav={on} aria-hidden="true" tabindex="-1" title={`${t(on ? 'cmd.favOff' : 'cmd.favOn')} (Ctrl+D)`} onclick={() => fav(i)} onmousemove={() => (sel = i)}>{on ? '★' : '☆'}</button>
              {/if}
            </div>
          {/each}
        {/if}
      </div>
    {/each}
    {#if !groups.length && parsed.q}<div class="lx-empty">{t('cmd.none', { q: parsed.q })}</div>{:else if !parsed.q && (title || parsed.scope === 'sym')}<div class="lx-empty">{t('cmd.symEmpty')}</div>{:else if !groups.length}<div class="lx-empty">{t('cmd.scopeEmpty')}</div>{/if}
  </div>
  <span class="lx-sr" aria-live="polite">{t('dlg.count', { n: flat.length })}</span>
  <div class="lx-desc" aria-live="polite">
    {#if cur}
      {@const it = cur.it}
      {#if it.kind === 'sym'}
        {@const ins = insOf(it.id)}
        {@const m = metric(it.id)}
        <b>{cdOf(it.id)} {nmOf(it.id)}</b>
        <span class="d">
          {t('cmd.symDesc', { mkt: mkt(ins), sector: ins ? (app.settings.lang === 'en' ? ins.sectorEn : ins.sectorJa) : '' })}{#if m}{' · '}{m.yieldTrailing ? t('cmd.yield', { v: `${m.yieldTrailing.toFixed(2)}%` }) : t('cmd.noDiv')}{/if}{#if heldCodes.has(cdOf(it.id))}{' · '}{t('cmd.heldYes')}{/if}
        </span>
        <span class="r">
          <span><Keys keys="Enter" /> {t('cmd.toChart')}</span>
          {#if target && !target.quiet}<span><Keys keys="Ctrl+Enter" /> {target.title}</span>{/if}
          {#if !title}<span><Keys keys="Ctrl+D" /> {t('cmd.favKey')}</span>{/if}
        </span>
      {:else if it.kind === 'add'}
        <b>{t('cmd.addLabel', { code: it.code })}</b><span class="d">{t('cmd.addDesc')}</span><span class="r"><span><Keys keys="Enter" /> {t('cmd.open')}</span></span>
      {:else if it.kind === 'scr'}
        <b>{screenNameOf.get(it.id) ?? ''}</b><span class="d">{t('cmd.screenDesc')}</span><span class="r"><span><Keys keys="Enter" /> {t('cmd.open')}</span></span>
      {:else if it.kind === 'act'}
        {@const a = palById.get(it.id)}
        <b>{a?.label}</b>
        <span class="d" class:warn={!!a?.reason}>{a?.reason ? t('cmd.unavailable', { why: t(a.reason as Key) }) : t('cmd.actDesc', { group: t(`agroup.${a?.group ?? 'app'}` as Key) })}</span>
        <span class="r">{#if !a?.reason}<span><Keys keys="Enter" /> {t('cmd.run')}</span>{/if}</span>
      {:else if it.kind === 'pane'}
        <b>{t('cmd.changeTo', { name: t(`widget.${it.id}` as Key) })}</b>
        <span class="d">{it.id === widget ? t('cmd.nowType') : paneOutcome(it.id)}</span>
        <span class="r">{#if it.id !== widget}<span><Keys keys="Enter" /> {t('cmd.change')}</span>{/if}</span>
      {:else if it.kind === 'key'}
        {@const r = paneKeyRows[it.index]}
        <b>{r ? `${secName(r.sec)}: ${r.label[li]}` : ''}</b>
        <span class="d">{t('help.paneKey', { sec: r ? secName(r.sec) : '' })}</span>
        <span class="r"><span><Keys keys="Enter" /> {t('cmd.openHelp')}</span></span>
      {/if}
    {/if}
  </div>
  <div class="lx-foot">
    <span><Keys keys="↑ ↓" /> {t('wpick.move')}</span>
    <span><Keys keys="Esc" /> {query ? t('dlg.clearQuery') : t('dlg.closeKey')}</span>
    {#if !title}<span class="r">{t('cmd.prefixHint')}</span>{/if}
  </div>
</div>

<style>
  .ttl {
    padding: 8px 12px 0;
    font-size: var(--fs-1);
    color: var(--text-2);
  }
  .palette {
    width: 720px;
    max-height: min(640px, calc(100vh - 120px));
  }
  .row {
    display: flex;
    align-items: stretch;
  }
  .row.on {
    background: var(--select-strong);
  }
  .it {
    height: 30px;
  }
  /* 行の先頭は種類によらず同じ幅（名前の始まりをそろえる） */
  .lead {
    flex: none;
    width: 76px;
    display: flex;
    align-items: center;
    gap: 6px;
    overflow: hidden;
    color: var(--text-3);
    font-size: var(--fs-1);
  }
  .lead .code {
    font-family: var(--mono);
    font-size: var(--fs-2);
    color: var(--text-2);
  }
  .tg {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .it.off .n,
  .it.off .lead {
    color: var(--text-3);
  }
  .it.off :global(kbd) {
    color: var(--text-3);
    border-color: var(--line);
  }
  .n.add {
    color: var(--focus);
  }
  .mk {
    flex: none;
    width: 64px;
    font-size: var(--fs-1);
    color: var(--text-3);
    white-space: nowrap;
    overflow: hidden;
  }
  .held {
    flex: none;
    width: 32px;
    font-size: var(--fs-0);
    color: var(--text-2);
  }
  .px {
    flex: none;
    width: 76px;
    text-align: right;
    font-family: var(--mono);
    color: var(--text-2);
  }
  .chg {
    flex: none;
    width: 62px;
    text-align: right;
    font-family: var(--mono);
    color: var(--text-3);
  }
  .chg.up {
    color: var(--up);
  }
  .chg.down {
    color: var(--down);
  }
  .s {
    color: var(--text-3);
    font-size: var(--fs-1);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 6px;
    padding: 2px 12px 6px;
  }
  .lx-chip.sym b {
    font-family: var(--mono);
    font-weight: 500;
    margin-right: 4px;
  }
  .more {
    letter-spacing: 0;
  }
  .side {
    flex: none;
    background: none;
    border: 0;
    padding: 0 10px;
    color: var(--text-3);
    cursor: pointer;
    font-size: var(--fs-1);
    white-space: nowrap;
  }
  .side:hover {
    color: var(--text);
    background: var(--hover);
  }
  .side.full {
    opacity: 0.45;
  }
  .star {
    font-size: var(--fs-3);
  }
  .star.fav {
    color: var(--star-on);
  }
</style>
