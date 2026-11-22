<script lang="ts">
// パフォーマンス比較（docs/design-perf.md。FR-PC1〜PC12）: 基準日を 100 として複数の銘柄の値動きを 1 枚に重ねる。
// 左上に基準日、左下に銘柄、右にチャート。計算は lib/perf.ts（純粋な関数）、文言は lib/perfRows.ts。
// 銘柄は銘柄ジャンプの Ctrl+Enter で足す（PaneApi.addTarget）。状態は pf で始まるキーで、開いただけでは書かない（§6）
import type { Results } from '@shared/api'
import { jstNow, retentionStart } from '@shared/calendar'
import type { Condition, InstrumentId, JstDate } from '@shared/types'
import { onMount, tick, untrack } from 'svelte'
import { getBars } from '../../lib/barsCache'
import { isSaveKey, perfImageName, SAVE_TOAST, savePerfImage } from '../../lib/chartImage'
import { heldIds } from '../../lib/divsim'
import { setMaximized } from '../../lib/paneMax'
import { registerPane } from '../../lib/panes'
import {
  baseLimits,
  clampDate,
  cycleBench,
  disambiguate,
  divNote,
  endLimits,
  endsProvisional,
  type Indexed,
  importPatch,
  indexSeries,
  isBench,
  monthlyPending,
  nextSort,
  PF_MAX,
  PF_PRESETS,
  type PfInput,
  pfValue,
  pfView,
  presetBase,
  removePatch,
  resolveFrame,
  sinceBase,
  slash,
  snapTrading,
  sortIds,
  stepCross,
  stepDate,
  stitch,
  valueAt,
  weekday,
} from '../../lib/perf'
import { detailParts, frameNotes, setName, shortOf, stateReason, toneOf } from '../../lib/perfRows'
import { perfSets } from '../../lib/perfSets'
import { perfTarget, writePerf } from '../../lib/perfTarget'
import {
  app,
  choiceDialog,
  codeOf,
  listName,
  nameOf,
  promptDialog,
  screenIds,
  screenName,
  t,
  toast,
  touched,
} from '../../stores/app.svelte'
import { linkSymbol, type PaneNode, setLinkSymbol } from '../../stores/layout.svelte'
import PaneHeader from '../PaneHeader.svelte'
import DateBox from './perf/DateBox.svelte'
import PerfChart, { type PfLine } from './perf/PerfChart.svelte'
import PerfList, { type PfRow } from './perf/PerfList.svelte'

let { pane }: { pane: PaneNode } = $props()
type BarsResult = Results['bars.get']

/** 作ったときに 1 回だけ、リンク色のチャートの銘柄を種にする（初めて開いたときに書き、あとは追わない） */
const seed: InstrumentId | null = untrack(() => (pane.state.pfIds === undefined && pane.link ? (linkSymbol(pane.link) ?? null) : null))
// 種を書いておく（書かないと、開き直すたびにその時のリンク色の銘柄を種にしてしまう。§6）
onMount(() => {
  if (untrack(() => pane.state.pfIds === undefined)) writePerf(pane, seed, {})
})
const view = $derived(pfView(pane.state, seed))
const set = (patch: Record<string, unknown>) => writePerf(pane, seed, patch)

// ---------------------------------------------------------------- 日付
let today = $state(jstNow().date)
// 日をまたいでも開いたままなら「今日」を進める（既定の 1 年前・札・選べる範囲）
onMount(() => {
  const id = setInterval(() => {
    const d = jstNow().date
    if (d !== today) today = d
  }, 60_000)
  return () => clearInterval(id)
})
const typedBase = $derived(view.base ?? presetBase(today, 1))
const adj = $derived(view.total ? ('total' as const) : ('split' as const))
const idsKey = $derived([...view.ids, ...view.bench].join())
/** 中身のキーから作る（並べ替え・表し方の変更で作り直さない） */
const allIds = $derived(idsKey ? idsKey.split(',') : [])

// ---------------------------------------------------------------- 取得（§3.1）
let bars = $state<Record<string, { d: BarsResult | null; m: BarsResult | null }>>({})
let loading = $state(true)
let token = 0
async function load() {
  const my = ++token
  loading = true
  const ids = allIds
  const base = typedBase
  const a = adj
  const out: Record<string, { d: BarsResult | null; m: BarsResult | null }> = {}
  await Promise.all(
    ids.map(async (id) => {
      try {
        const d = await getBars(id, 'D', a)
        // 基準日がその銘柄の日足より前なら月次も取る（D／M は実際に届いた日足の始まりで決める）
        const m = d.time.length && d.time[0]! > base ? await getBars(id, 'M', a) : null
        out[id] = { d, m }
      } catch {
        out[id] = { d: null, m: null }
      }
    }),
  )
  if (my !== token) return
  bars = out
  loading = false
}
/** 月次がまだ要る銘柄（基準日がその日足より前で、月次を読んでいない）。基準日を動かすたびに全部を読み直さない */
const needM = $derived(allIds.filter((id) => (bars[id]?.d?.time[0] ?? '') > typedBase && !bars[id]?.m).join())
/** 最後に読んだ銘柄と価格の種類（月次が届いて needM が空に戻ったときに読み直さない） */
let loadedKey = ''
$effect(() => {
  const key = `${idsKey}|${adj}`
  // needM は条件の前に読む（後ろに置くと、初めの実行で依存に入らず、基準日を日足より前へ動かしても月次を読まない）
  const need = needM
  if (key === loadedKey && !need) return
  loadedKey = key
  untrack(() => void load())
})
// 取得の知らせ: 表示中の銘柄を含むときだけ取り直す（届いてから置き換える）
let seen = untrack(() => app.dataVersion)
$effect(() => {
  const v = app.dataVersion
  if (v === seen) return
  seen = v
  untrack(() => {
    today = jstNow().date
    if (allIds.some((id) => touched(id))) void load()
  })
})

// ---------------------------------------------------------------- 計算
const retFrom = $derived(retentionStart(today, app.settings.retentionYears))
/** 月次を読んでいる途中（基準日を日足より前へ動かした直後）。「データなし」と出さない */
const readingM = (id: string) => loading && (bars[id]?.d?.time[0] ?? '') > typedBase && !bars[id]?.m
const inputs = $derived<PfInput[]>(
  allIds.map((id) => {
    const b = bars[id]
    if (!b?.d) return { id, s: null }
    const pending = readingM(id) || (!!b.m && monthlyPending(typedBase, b.d, b.m.monthlyUntil, b.d.monthlyFetched))
    return { id, s: stitch(b.d, b.m && b.m.monthlyUntil != null ? b.m : null), pending }
  }),
)
const frame = $derived(resolveFrame(typedBase, view.end ?? null, inputs, today))
const lineOf = $derived.by(() => {
  const out: Record<string, Indexed> = {}
  for (const x of inputs) {
    const s = frame.states[x.id]
    if (x.s && s?.kind === 'ok') out[x.id] = indexSeries(x.s, s)
  }
  return out
})
const endVal = $derived(Object.fromEntries(Object.entries(lineOf).map(([id, l]) => [id, l.v.at(-1)])))
const divFrom = $derived(
  divNote(
    view.total,
    frame.base,
    Object.fromEntries(allIds.flatMap((id) => (frame.states[id]?.kind === 'ok' && bars[id]?.d ? [[id, bars[id]!.d!.divFrom]] : []))),
  ),
)
/** 終点に仮の足（FR-D8）があるか */
const provisional = $derived(
  endsProvisional(
    view.end,
    allIds.map((id) => bars[id]?.d),
  ),
)
/** 表示中の銘柄の最新の足の日（終わりの日をここまで進めたら「今日」に戻す） */
const latestDay = $derived(
  allIds
    .map((id) => bars[id]?.d?.time.at(-1) ?? '')
    .sort()
    .at(-1) ?? '',
)
const notes = $derived(frameNotes(frame, typedBase, divFrom))
const order = $derived(sortIds(view.ids, view.sort, endVal))
const rowKeys = $derived([...order, ...view.bench])
const axis = $derived([...new Set(Object.values(lineOf).flatMap((l) => l.t))].sort())

// ---------------------------------------------------------------- 一時の状態（保存しない）
let blk = $state<'date' | 'list' | 'chart'>('chart')
let field = $state<'base' | 'end'>('base')
let cal = $state<'base' | 'end' | null>(null)
let selId = $state<string | null>(null)
let cross = $state<JstDate | null>(null)
let solo = $state(false)
/** 画像を描いている間（選んだ行の強調・H・十字線を入れない） */
let exporting = $state(false)
let svg = $state<SVGSVGElement>()
let pop = $state<{ key: (e: KeyboardEvent) => boolean }>()
const sel = $derived(selId && rowKeys.includes(selId) ? selId : (rowKeys[0] ?? null))
const at = $derived(cross ?? frame.end)

const colorOf = (id: string) => (isBench(id) ? 'var(--pf-bench)' : `var(--pf-${view.slots[id] ?? 1})`)
/** 札・一覧の名前（短い名前が重なるときはコードを添える） */
const names = $derived(disambiguate(allIds.map((id) => ({ id, code: codeOf(id), short: shortOf(id) }))))
const lines = $derived<PfLine[]>(
  rowKeys
    .filter((id) => lineOf[id] && !view.off.includes(id))
    .map((id) => ({
      id,
      label: names[id] ?? shortOf(id),
      color: colorOf(id),
      bench: isBench(id),
      dash: id === 'JP:1343',
      t: lineOf[id]!.t,
      v: lineOf[id]!.v,
    })),
)
function rowOf(id: string): PfRow {
  const l = lineOf[id]
  const v = l ? valueAt(l, at) : undefined
  const b = bars[id]
  const reason = (loading && !b) || readingM(id) ? t('pf.loading') : b && !b.d ? t('pf.failed') : stateReason(frame.states[id])
  return {
    id,
    code: codeOf(id),
    short: names[id] ?? shortOf(id),
    name: nameOf(id),
    bench: isBench(id),
    color: colorOf(id),
    dash: id === 'JP:1343',
    off: view.off.includes(id),
    value: pfValue(v, view.mode),
    tone: toneOf(v, view.mode),
    reason,
  }
}
const rows = $derived(order.map(rowOf))
const benchRows = $derived(view.bench.map(rowOf))
const detail = $derived.by(() => {
  if (!sel) return null
  const d = detailParts(lineOf[sel], frame.states[sel], frame)
  return { id: sel, code: codeOf(sel), name: nameOf(sel), ...d }
})
const presetIdx = $derived(PF_PRESETS.findIndex((n) => presetBase(today, n) === typedBase))
const anyOk = $derived(Object.keys(lineOf).length > 0)

// ---------------------------------------------------------------- 操作
function setBase(d: JstDate) {
  set({ pfBase: clampDate(d, baseLimits(today, view.end)) })
  cross = null
}
function setEnd(d: JstDate | null) {
  if (!d || d >= (latestDay || snapTrading(today))) set({ pfEnd: undefined })
  else set({ pfEnd: clampDate(d, endLimits(today, frame.base)) })
  cross = null
}
function openCal(f: 'base' | 'end') {
  blk = 'date'
  field = f
  cal = cal === f ? null : f
}
function pickCal(d: JstDate) {
  if (cal === 'base') setBase(d)
  else setEnd(d)
  cal = null
}
function remove(id: string) {
  set(removePatch(view, id))
  toast(t('pf.removed', { name: nameOf(id) }))
}
function toggleOff(id: string) {
  set({ pfOff: view.off.includes(id) ? view.off.filter((x) => x !== id) : [...view.off, id] })
}
/** 同じリンク色のチャートに出す（最大化していたら戻してから） */
function show(id: string) {
  if (!pane.link) return void toast(t('pf.noLink'))
  if (app.maximized === pane.id) setMaximized(null)
  setLinkSymbol(pane.link, id)
}
/** 銘柄ジャンプを開く（5 銘柄でも開く。比べる相手は足せ、ほかは足す先が理由を知らせる） */
function openJump() {
  app.overlay = { kind: 'jump', first: '' }
}
/** 取り込む（I）: ウォッチリスト・保有・スクリーニング条件の結果・比較の組から置き換える */
async function importFrom() {
  const held = heldIds(app.holdings)
  const items = [
    ...app.watchlists.map((w) => ({
      id: `wl:${w.id}`,
      label: listName(w),
      hint: `${t('pf.src.list')} · ${t('pf.items', { n: w.items.length })}`,
    })),
    ...(held.length ? [{ id: 'held', label: t('pf.src.held'), hint: t('pf.items', { n: held.length }) }] : []),
    ...app.screens.map((s) => ({ id: `scr:${s.id}`, label: screenName(s), hint: t('pf.src.screen') })),
    ...perfSets.list().map((s) => ({ id: `set:${s.name}`, label: s.name, hint: t('pf.src.set') })),
  ]
  const c = await choiceDialog(t('pf.importTitle'), items)
  if (!c) return
  if (c.startsWith('set:')) {
    const s = perfSets.get(c.slice(4))
    if (!s) return
    set({
      ...importPatch(s.ids),
      pfBase: s.base ?? undefined,
      pfEnd: s.end ?? undefined,
      pfBench: s.bench,
      pfMode: s.mode,
      pfTotal: s.total,
      pfLog: s.log,
    })
    cross = null
    return
  }
  let ids: InstrumentId[] = []
  let name = ''
  if (c === 'held') {
    ids = held
    name = t('pf.src.held')
  } else if (c.startsWith('wl:')) {
    const w = app.watchlists.find((x) => `wl:${x.id}` === c)
    ids = w?.items ?? []
    name = w ? listName(w) : ''
  } else if (c.startsWith('scr:')) {
    const s = app.screens.find((x) => `scr:${x.id}` === c)
    if (!s) return
    name = screenName(s)
    try {
      ids = await screenIds($state.snapshot(s.conditions) as Condition[])
    } catch {
      return void toast(t('pf.importFailed'))
    }
  }
  const p = importPatch(ids)
  set(p)
  cross = null
  toast(t('pf.imported', { name, n: p.pfIds.length }))
}
/** 比較の組を覚える（K。メモリだけ。§2.6） */
async function remember() {
  const name = await promptDialog(t('pf.setTitle'), setName(frame.base, view.ids))
  if (!name?.trim()) return
  perfSets.save({
    name: name.trim(),
    base: view.base ?? null,
    end: view.end ?? null,
    ids: view.ids,
    bench: view.bench,
    mode: view.mode,
    total: view.total,
    log: view.log,
  })
  toast(t('pf.setSaved', { name: name.trim() }))
}
async function saveImage() {
  if (!app.settings.chartSave) return
  const text = {
    title: `${t('pf.imgTitle', { d: slash(frame.base), v: view.mode === 'idx' ? '100' : '0%' })} 〜 ${slash(frame.end)}`,
    sub: [view.total ? t('pf.total') : t('pf.price'), frame.monthly ? t('pf.imgMonthly') : t('pf.imgDaily'), t('pf.imgSplit')].join(' · '),
    source: t('pf.imgSource'),
  }
  exporting = true
  await tick()
  const r = await savePerfImage(svg, text, perfImageName(frame.base, frame.end), Math.max(2, window.devicePixelRatio || 1)).finally(
    () => (exporting = false),
  )
  const k = SAVE_TOAST[r]
  if (k) toast(t(k))
}

// ---------------------------------------------------------------- キー（§5）
const BLKS = ['date', 'list', 'chart'] as const
function key(e: KeyboardEvent): boolean {
  const c = e.code
  if (cal && pop) {
    if (c !== 'Tab') return pop.key(e)
    cal = null
  }
  if (c === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) {
    blk = BLKS[(BLKS.indexOf(blk) + (e.shiftKey ? 2 : 1)) % 3]!
    return true
  }
  if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && /^Digit[1-6]$/.test(c)) {
    setBase(presetBase(today, PF_PRESETS[Number(c.slice(5)) - 1]!))
    return true
  }
  if (e.ctrlKey || e.altKey || e.metaKey) return false
  if (c === 'Escape' && cross) {
    cross = null
    return true
  }
  if (blk === 'chart' && isSaveKey(e, app.settings.chartSave)) {
    void saveImage()
    return true
  }
  const plain: Record<string, () => void> = {
    Insert: openJump,
    KeyI: () => void importFrom(),
    KeyP: () => set({ pfMode: view.mode === 'idx' ? 'pct' : 'idx' }),
    KeyT: () => set({ pfTotal: !view.total }),
    KeyL: () => set({ pfLog: !view.log }),
    KeyH: () => (solo = !solo),
    KeyB: () => set({ pfBench: cycleBench(view.bench) }),
    KeyK: () => void remember(),
  }
  if (!e.shiftKey && plain[c]) {
    plain[c]!()
    return true
  }
  if (blk === 'date') {
    if (c === 'Enter' || c === 'Space') {
      openCal(field)
      return true
    }
    if (c === 'Home' || c === 'End') {
      field = c === 'Home' ? 'base' : 'end'
      return true
    }
    if (c === 'Backspace' && field === 'end') {
      setEnd(null)
      return true
    }
    const step = (
      {
        ArrowLeft: ['day', -1],
        ArrowRight: ['day', 1],
        ArrowUp: ['month', -1],
        ArrowDown: ['month', 1],
        PageUp: ['year', -1],
        PageDown: ['year', 1],
      } as const
    )[e.key as 'ArrowLeft']
    if (step) {
      if (field === 'base') setBase(stepDate(frame.base, step[0], step[1], frame.monthly))
      else setEnd(stepDate(frame.end, step[0], step[1], false))
      return true
    }
    return false
  }
  if (blk === 'list') {
    const i = sel ? rowKeys.indexOf(sel) : -1
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      selId = rowKeys[Math.max(0, Math.min(rowKeys.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))] ?? null
      return true
    }
    // 選んだ銘柄を先に読んでおく（selId を変えると sel も変わる）
    const cur = sel
    if (!cur) return false
    if (c === 'Space') toggleOff(cur)
    else if (c === 'Delete') {
      selId = rowKeys[i + 1] ?? rowKeys[i - 1] ?? null
      remove(cur)
    } else if (c === 'KeyS') set({ pfSort: nextSort(view.sort) })
    else if (c === 'Enter') show(cur)
    else return false
    return true
  }
  const nx = stepCross(axis, cross, e.key, e.shiftKey)
  if (nx) {
    cross = nx
    return true
  }
  return false
}

onMount(() =>
  registerPane(pane.id, {
    key,
    addTarget: () => perfTarget(pane, seed),
    current: () => sel,
    selected: () => (sel ? [sel] : []),
  }),
)

const readout = $derived.by(() => {
  if (!cross) return t(view.total ? 'pf.readEndTotal' : 'pf.readEnd', { d: slash(frame.end) })
  const s = sinceBase(frame.base, cross, frame.monthly ? (frame.stitch ?? '9999-12-31') : null)
  return t(s.unit === 'month' ? 'pf.readCrossM' : 'pf.readCross', { n: s.n })
})
const granTip = $derived(t(frame.monthly ? 'pf.granMonthly' : 'pf.granDaily', { d: slash(retFrom), y: app.settings.retentionYears }))
const empty = $derived(!view.ids.length)
</script>

<PaneHeader {pane} collapse={600}>
  <span class="pf-asof num">{t('pf.asOf', { d: `${slash(frame.end)}（${weekday(frame.end, app.settings.lang)}）` })}</span>
  {#if app.settings.chartSave}
    <button type="button" class="pf-save" title={`${t('pf.saveImage')} (S)`} onclick={() => void saveImage()}>⤓ {t('pf.image')}</button>
  {/if}
</PaneHeader>
<div class="pf-main" data-testid="perf">
  <DateBox
    base={frame.base}
    end={frame.end}
    endIsToday={!view.end}
    {field}
    focused={app.focus === pane.id && blk === 'date'}
    notes={notes.text}
    warn={notes.warn}
    preset={presetIdx}
    {cal}
    limits={cal === 'end' ? endLimits(today, frame.base) : baseLimits(today, view.end)}
    onfield={openCal}
    onpreset={(i) => setBase(presetBase(today, PF_PRESETS[i]!))}
    onpick={pickCal}
    onclose={() => (cal = null)}
    bind:pop
  />
  <PerfList
    {rows}
    bench={benchRows}
    {sel}
    focused={app.focus === pane.id && blk === 'list'}
    count={view.ids.length}
    max={PF_MAX}
    sortLabel={t((['pf.sort0', 'pf.sort1', 'pf.sort2'] as const)[view.sort])}
    {detail}
    onsel={(id) => {
      selId = id
      blk = 'list'
    }}
    onremove={remove}
    onadd={openJump}
    onimport={() => void importFrom()}
    onsort={() => set({ pfSort: nextSort(view.sort) })}
    onshow={show}
  />
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <section class="pf-chartblk" class:focus={app.focus === pane.id && blk === 'chart'} class:loading onclick={() => (blk = 'chart')}>
    <div class="pf-ttl">
      <span class="pf-h num" data-testid="pf-title">{slash(frame.base)}（{weekday(frame.base, app.settings.lang)}）= {view.mode === 'idx' ? '100' : '0%'}</span>
      <span class="pf-m num">〜 {slash(frame.end)}</span>
      <span class="pf-tag" class:warn={frame.monthly} title={granTip} data-testid="pf-gran">{frame.monthly && frame.monthlyTo ? t('pf.monthly', { m: slash(frame.monthlyTo).slice(0, 7) }) : t('pf.daily')}</span>
      {#if divFrom}<span class="pf-tag warn">{t('pf.divTag', { m: slash(divFrom).slice(0, 7) })}</span>{/if}
      {#if provisional}<span class="pf-tag" title={t('pf.provHint')}>{t('pf.prov')}</span>{/if}
      <span class="pf-r">
        <span class="pf-seg" title="P" role="radiogroup" aria-label="100 / %">
          <button type="button" role="radio" aria-checked={view.mode === 'idx'} class:on={view.mode === 'idx'} onclick={() => set({ pfMode: 'idx' })}>100</button>
          <button type="button" role="radio" aria-checked={view.mode === 'pct'} class:on={view.mode === 'pct'} onclick={() => set({ pfMode: 'pct' })}>%</button>
        </span>
        <span class="pf-seg" title="T" role="radiogroup" aria-label={t('pf.total')}>
          <button type="button" role="radio" aria-checked={!view.total} class:on={!view.total} onclick={() => set({ pfTotal: false })}>{t('pf.price')}</button>
          <button type="button" role="radio" aria-checked={view.total} class:on={view.total} data-testid="pf-total" onclick={() => set({ pfTotal: true })}>{t('pf.total')}</button>
        </span>
        <span class="pf-seg" title="L" role="radiogroup" aria-label={t('pf.log')}>
          <button type="button" role="radio" aria-checked={!view.log} class:on={!view.log} onclick={() => set({ pfLog: false })}>{t('pf.linear')}</button>
          <button type="button" role="radio" aria-checked={view.log} class:on={view.log} onclick={() => set({ pfLog: true })}>{t('pf.log')}</button>
        </span>
      </span>
    </div>
    <div class="pf-read" data-testid="pf-readout">
      {#if cross}<span class="pf-day num">{slash(cross)}（{weekday(cross, app.settings.lang)}）</span>{/if}<span>{readout}</span>
    </div>
    {#if empty}
      <div class="pf-empty"><div class="pf-et">{t('pf.empty')}</div><div>{t('pf.emptyHint')}</div></div>
    {:else if !loading && !anyOk}
      <div class="pf-empty"><div class="pf-et">{t('pf.allNoData')}</div></div>
    {:else}
      <PerfChart
        {lines}
        {frame}
        mode={view.mode}
        log={view.log}
        {axis} sel={exporting ? null : (app.focus === pane.id && blk === 'list') || solo ? sel : null}
        solo={solo && !exporting}
        cross={exporting ? null : cross}
        oncross={(d) => (cross = d)}
        onleave={() => {
          if (blk !== 'chart') cross = null
        }}
        bind:svg />
    {/if}
  </section>
</div>
<div class="pf-foot">
  <span><b>{t('pf.disclaimer')}</b></span>
  <span class="pf-fr">{t('pf.footNote')}{view.total ? ` · ${t('pf.footTotal')}` : ''}</span>
</div>

<style>
  .pf-main {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 236px minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
    grid-template-areas: 'date chart' 'list chart';
  }
  @container (max-width: 1199px) {
    .pf-main {
      grid-template-columns: 220px minmax(0, 1fr);
    }
  }
  @container (max-width: 859px) {
    .pf-main {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto minmax(240px, 1fr) auto;
      grid-template-areas: 'date' 'chart' 'list';
    }
  }
  .pf-asof {
    margin-left: auto;
    color: var(--text-3);
    font-size: var(--fs-1);
    white-space: nowrap;
  }
  .pf-save {
    font: inherit;
    font-size: var(--fs-1);
    color: var(--text-2);
    background: transparent;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    padding: 0 6px;
    line-height: 17px;
    cursor: pointer;
    flex: none;
  }
  .pf-chartblk {
    grid-area: chart;
    position: relative;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    padding: 10px 14px 6px;
    gap: 6px;
  }
  .pf-chartblk.focus::after {
    content: '';
    position: absolute;
    inset: 0;
    border: 1px solid var(--focus);
    pointer-events: none;
  }
  .pf-chartblk.loading :global(svg) {
    opacity: 0.35;
  }
  /* 読み込み中: チャートの枠を残して光を流す（§2.6。動きを減らす設定では流さない） */
  .pf-chartblk.loading::before {
    content: '';
    position: absolute;
    inset: 60px 14px 6px;
    pointer-events: none;
    background: linear-gradient(100deg, transparent 30%, color-mix(in srgb, var(--panel-3) 60%, transparent) 50%, transparent 70%);
    background-size: 300% 100%;
    animation: pf-shine 1.4s linear infinite;
  }
  :global(:root[data-reduce-motion='true']) .pf-chartblk.loading::before {
    animation: none;
  }
  @keyframes pf-shine {
    to {
      background-position: -200% 0;
    }
  }
  .pf-ttl {
    display: flex;
    align-items: baseline;
    gap: 6px 14px;
    flex-wrap: wrap;
  }
  .pf-h {
    font-size: var(--fs-4);
    font-weight: 600;
  }
  .pf-m {
    font-size: var(--fs-2);
    color: var(--text-2);
  }
  .pf-tag {
    font-size: var(--fs-1);
    color: var(--text-2);
    border: 1px solid var(--line-strong);
    border-radius: 9px;
    padding: 0 8px;
    line-height: 17px;
    cursor: default;
  }
  .pf-tag.warn {
    color: var(--warn);
    border-color: color-mix(in srgb, var(--warn) 55%, transparent);
  }
  .pf-r {
    margin-left: auto;
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .pf-seg {
    display: inline-flex;
    gap: 1px;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 1px;
  }
  .pf-seg button {
    padding: 0 8px;
    font: inherit;
    font-size: var(--fs-1);
    color: var(--text-3);
    line-height: 18px;
    border-radius: 2px;
    border: 0;
    background: transparent;
    cursor: pointer;
    white-space: nowrap;
  }
  .pf-seg button.on {
    background: var(--panel-3);
    color: var(--text);
    box-shadow: inset 0 -1px 0 var(--focus);
  }
  .pf-read {
    display: flex;
    gap: 4px 14px;
    align-items: baseline;
    flex-wrap: wrap;
    font-size: var(--fs-1);
    color: var(--text-3);
    min-height: 18px;
  }
  .pf-day {
    color: var(--focus);
  }
  .pf-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: var(--text-2);
    text-align: center;
    padding: 0 16px;
  }
  .pf-et {
    font-size: var(--fs-4);
    color: var(--text);
  }
  .pf-foot {
    flex: none;
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 3px 10px;
    font-size: var(--fs-1);
    color: var(--text-3);
    border-top: 1px solid var(--line);
    background: var(--panel-2);
    white-space: nowrap;
    overflow: hidden;
  }
  .pf-foot b {
    font-weight: 500;
    color: var(--text-2);
  }
  .pf-fr {
    margin-left: auto;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
