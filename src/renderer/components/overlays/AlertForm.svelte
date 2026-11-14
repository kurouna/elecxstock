<script lang="ts">
// アラートを作る・直す（FR-AL7。design-alerts.md §6.2）。対象は銘柄かスクリーン（FR-AL2。← → で切り替え）。キーだけで入れられる:
// 条件の行で F 指標・O ≥ と ≤・R 相対条件・← → 値・Enter 値を入力・Delete 条件を外す・Insert 条件を足す。
// Tab で項目を移り、Ctrl+Enter で保存、Esc で取り消し（メモ欄の文字と単キーがぶつからないよう、単キーは条件の行だけ）
import { alertConditionOk, conditionMet, distanceOf, fieldValue, heldFrom, SCREEN_ALERT_LIMIT } from '@shared/alerts'
import { FIELD_BY_ID, FIELDS, type FieldDef, perShare, refFields, usable } from '@shared/fields'
import type { AlertView, Condition, InstrumentId } from '@shared/types'
import { onMount, tick, untrack } from 'svelte'
import { condText, distanceText, fieldValueText } from '../../lib/alertText'
import { type AlertDraft, app, closeOverlay, codeOf, ensureMetrics, metric, nameOf, screenName, t } from '../../stores/app.svelte'

let {
  edit,
  symbol,
  screenId,
  resolve,
}: { edit?: AlertView; symbol?: InstrumentId; screenId?: string; resolve: (a: AlertDraft | null) => void } = $props()

const MAX = 3
const NONE = 'JP:0000' as InstrumentId
// svelte-ignore state_referenced_locally
const id: InstrumentId = (edit?.target.kind === 'symbol' ? edit.target.id : symbol) ?? NONE
// 直すときは対象の種類を変えない。作るときは銘柄とスクリーンを切り替えられる（スクリーンが 1 つも無ければ銘柄だけ）
// svelte-ignore state_referenced_locally
const canSymbol = edit ? edit.target.kind === 'symbol' : id !== NONE
// svelte-ignore state_referenced_locally
const canScreen = edit ? edit.target.kind === 'screen' : app.screens.length > 0
// svelte-ignore state_referenced_locally
let kind = $state<'symbol' | 'screen'>(edit ? edit.target.kind : screenId || !canSymbol ? 'screen' : 'symbol')
// svelte-ignore state_referenced_locally
let scr = $state((edit?.target.kind === 'screen' ? edit.target.screenId : screenId) ?? app.screens[0]?.id ?? '')
let kindEl = $state<HTMLElement>()
let scrEl = $state<HTMLSelectElement>()
const lang = $derived(app.settings.lang)
const m = $derived(metric(id))

/** 保有（損益率の条件の「いま」に使う。Core と同じく数量と取得額を足し合わせる） */
const held = $derived(heldFrom(app.holdings))

/** アラートに使える指標（数値の市場の指標と保有の損益率。保有が無ければ損益率は出さない。直すときは今の条件の指標を残す） */
const fields = FIELDS.filter(
  (f) =>
    usable(f) &&
    alertConditionOk({ field: f.id, op: '<=', value: 0 }) &&
    (!f.requires?.includes('holdings') || app.holdings.length > 0 || !!edit?.conditions.some((c) => c.field === f.id)),
)

/** 価格の刻み（17,500 なら 100、3,000 なら 10、500 なら 1） */
function stepOf(c: Condition): number {
  const f = FIELD_BY_ID.get(c.field)
  if (c.ref) return 1
  if (f && perShare(f)) {
    const v = Math.abs(Number(c.value)) || Math.abs(fieldNow(c.field) ?? 0)
    return v >= 1 ? Math.max(1, 10 ** (Math.floor(Math.log10(v)) - 2)) : 1
  }
  return f?.step ?? (f?.type === 'percent' ? 0.1 : 1)
}
const fieldNow = (field: string) => (m ? fieldValue(field, m, held, id) : null)
const round = (v: number, st: number) => Math.round(Math.round(v / st) * st * 1e6) / 1e6

/** 指標を選んだときの既定の条件（終値なら今の 5% 下、ほかは今の値か登録表の既定） */
function defaultCond(field: string): Condition {
  const f = FIELD_BY_ID.get(field)
  const now = fieldNow(field)
  const base: Condition = { field, op: '<=', value: 0 }
  if (f && perShare(f) && now != null) {
    const v = now * 0.95
    return { ...base, value: round(v, stepOf({ ...base, value: v })) }
  }
  if (now != null) return { ...base, op: '>=', value: round(now, f?.type === 'percent' ? 0.1 : (f?.step ?? 1)) }
  return { ...base, value: typeof f?.default === 'number' ? f.default : 0 }
}

// svelte-ignore state_referenced_locally
let conds = $state<Condition[]>(edit ? structuredClone($state.snapshot(edit.adjusted ?? edit.conditions)) : [defaultCond('price.close')])
// svelte-ignore state_referenced_locally
let repeat = $state(edit?.repeat ?? true)
// svelte-ignore state_referenced_locally
let note = $state(edit?.note ?? '')
/** 値の欄の文字（入力中は文字のまま持ち、確定で数にする） */
let typing = $state<{ i: number; s: string } | null>(null)
let rows = $state<HTMLElement[]>([])
let fieldEls = $state<HTMLSelectElement[]>([])
let refEls = $state<HTMLSelectElement[]>([])
let valEls = $state<HTMLInputElement[]>([])

const error = $derived(
  kind === 'screen'
    ? !app.screens.some((x) => x.id === scr)
      ? t('al.inv.noScreen')
      : !edit && app.alerts.filter((a) => a.target.kind === 'screen').length >= SCREEN_ALERT_LIMIT
        ? t('al.screenLimit')
        : null
    : conds.length === 0 || !conds.every(alertConditionOk)
      ? t('al.invalidCond')
      : id === NONE
        ? t('al.noSymbol')
        : null,
)
const nowLine = $derived.by(() => {
  if (kind === 'screen') return t('al.screenHint')
  if (!m) return t('al.nowUnknown')
  const r = conds.map((c) => conditionMet(c, m, held, id))
  if (r.some((x) => x == null)) return t('al.nowUnknown')
  if (r.every((x) => x)) return t('al.nowMet')
  return t('al.nowNot', { d: distanceText(distanceOf(conds, m, held, id)) })
})

/** 指標がまだ手元に無ければ取ってきて、届いたら一度だけ、触る前なら既定の値（今の終値の 5% 下）を入れ直す */
let touched = false
let defaulted = false
$effect(() => {
  if (id === NONE || defaulted) return
  if (!m) {
    ensureMetrics([id])
    return
  }
  defaulted = true
  if (!edit && !touched) conds = [defaultCond(untrack(() => conds[0]?.field) ?? 'price.close')]
})
function update(i: number, c: Condition | null) {
  touched = true
  if (c) conds[i] = c
  else if (conds.length > 1) conds = conds.filter((_, j) => j !== i)
}
function setField(i: number, field: string) {
  update(i, defaultCond(field))
}
function setRef(i: number, ref: string) {
  const c = conds[i]
  if (!c) return
  if (!ref) {
    const { ref: _r, ...rest } = c
    update(i, { ...rest, value: defaultCond(c.field).value })
  } else update(i, { ...c, ref, value: 0 })
}
const flip = (i: number) => update(i, { ...conds[i]!, op: conds[i]!.op === '>=' ? '<=' : '>=' })
function step(i: number, d: number) {
  const c = conds[i]
  if (!c) return
  const st = stepOf(c)
  update(i, { ...c, value: round(Number(c.value) + st * d, st) })
}
async function addCond() {
  if (conds.length >= MAX) return
  const used = new Set(conds.map((c) => c.field))
  const f = fields.find((x) => !used.has(x.id)) ?? fields[0]!
  touched = true
  conds = [...conds, defaultCond(f.id)]
  await tick()
  rows[conds.length - 1]?.focus()
}
async function removeCond(i: number) {
  if (conds.length <= 1) return
  update(i, null)
  await tick()
  rows[Math.min(i, conds.length - 1)]?.focus()
}
function commitTyping() {
  if (!typing) return
  const v = Number(
    typing.s
      .normalize('NFKC')
      .replace(/[,，円¥%％\s]/g, '')
      .replace('−', '-'),
  )
  const c = conds[typing.i]
  if (c && Number.isFinite(v)) update(typing.i, { ...c, value: v })
  typing = null
}

function rowKey(e: KeyboardEvent, i: number) {
  if (e.isComposing || e.target !== e.currentTarget || e.ctrlKey || e.altKey || e.metaKey) return
  const k = e.key
  if (e.code === 'KeyF' && !e.shiftKey) fieldEls[i]?.focus()
  else if (e.code === 'KeyO' && !e.shiftKey) flip(i)
  else if (e.code === 'KeyR' && !e.shiftKey) refEls[i]?.focus()
  else if (k === 'ArrowLeft' || k === 'ArrowRight') step(i, k === 'ArrowRight' ? 1 : -1)
  else if (k === 'ArrowUp' || k === 'ArrowDown') rows[Math.max(0, Math.min(conds.length - 1, i + (k === 'ArrowUp' ? -1 : 1)))]?.focus()
  else if (k === 'Enter') valEls[i]?.focus()
  else if (k === 'Delete') void removeCond(i)
  else if (k === 'Insert') void addCond()
  else return
  e.preventDefault()
  e.stopPropagation()
}
/** 行の中の欄で Enter・Esc を押したら行に戻る（Esc でダイアログを閉じない） */
function backToRow(e: KeyboardEvent, i: number) {
  if (e.isComposing || (e.key !== 'Enter' && e.key !== 'Escape') || e.ctrlKey) return
  e.preventDefault()
  e.stopPropagation()
  if (e.currentTarget instanceof HTMLInputElement) {
    if (e.key === 'Enter') commitTyping()
    else typing = null
  }
  rows[i]?.focus()
}

// 閉じるとこの部品は外れて props が読めなくなるので、結果を渡してから閉じる
function save() {
  commitTyping()
  if (error) return
  const n = note.trim()
  resolve({
    id: edit?.id ?? '',
    target: kind === 'screen' ? { kind: 'screen', screenId: scr } : { kind: 'symbol', id },
    conditions: kind === 'screen' ? [] : ($state.snapshot(conds) as Condition[]),
    repeat,
    enabled: edit?.enabled ?? true,
    ...(n ? { note: n.slice(0, 200) } : {}),
  })
  closeOverlay()
}
function cancel() {
  resolve(null)
  closeOverlay()
}
function key(e: KeyboardEvent) {
  if (e.isComposing) return
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    cancel()
  } else if (e.key === 'Enter' && e.ctrlKey) {
    e.preventDefault()
    e.stopPropagation()
    save()
  } else if (e.key === 'Insert' && kind === 'symbol' && !(e.target instanceof HTMLInputElement)) {
    e.preventDefault()
    void addCond()
  }
}
function kindKey(e: KeyboardEvent) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== ' ') return
  e.preventDefault()
  kind = kind === 'symbol' ? 'screen' : 'symbol'
}
function repKey(e: KeyboardEvent) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== ' ') return
  e.preventDefault()
  repeat = !repeat
}
const fname = (f: FieldDef | undefined) => f?.label[lang] ?? ''
const valueShown = (i: number, c: Condition) =>
  typing?.i === i ? typing.s : c.ref ? `${Number(c.value) >= 0 ? '+' : ''}${c.value}%` : fieldValueText(c.field, Number(c.value))
/** 換算したしきい値を直すときは、元の値も出す（§6.2） */
const adjustedNote = $derived(edit?.adjusted ? edit.conditions.map(condText).join(lang === 'ja' ? ' かつ ' : ' and ') : '')

onMount(() => (kind === 'screen' ? (canSymbol ? kindEl : scrEl) : rows[0])?.focus())
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="dialog alertform" role="dialog" aria-label={edit ? t('al.formEdit') : t('al.formNew')} tabindex="-1" onkeydown={key}>
  <h3>{edit ? t('al.formEdit') : t('al.formNew')}</h3>
  <div class="body">
    <div class="f">
      <span class="lb">{t('al.target')}</span>
      <span class="tgrow">
        {#if canSymbol && canScreen}
          <!-- svelte-ignore a11y_interactive_supports_focus -->
          <span class="seg" role="radiogroup" tabindex="0" aria-label={t('al.target')} bind:this={kindEl} onkeydown={kindKey}>
            <button type="button" tabindex="-1" role="radio" aria-checked={kind === 'symbol'} onclick={() => (kind = 'symbol')}><span class="num">{codeOf(id)}</span> {nameOf(id)}</button>
            <button type="button" tabindex="-1" role="radio" aria-checked={kind === 'screen'} onclick={() => (kind = 'screen')}>{t('al.targetScreen')}</button>
          </span>
        {:else if canSymbol}
          <span class="tg"><span class="num c">{codeOf(id)}</span> {nameOf(id)}</span>
        {/if}
        {#if kind === 'screen'}
          <select name="screen" aria-label={t('al.targetScreen')} bind:this={scrEl} bind:value={scr}>
            {#each app.screens as x (x.id)}<option value={x.id}>{screenName(x)}</option>{/each}
          </select>
        {/if}
      </span>
    </div>
    {#if kind === 'screen'}
      <div class="f">
        <span class="lb">{t('al.cond')}</span>
        <span>{t('al.screenCond')}</span>
      </div>
    {:else}
    {#each conds as c, i (i)}
      {@const f = FIELD_BY_ID.get(c.field)}
      <div class="f">
        <span class="lb">{i === 0 ? t('al.cond') : t('al.and')}</span>
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <div class="row" role="group" tabindex="0" aria-label={condText(c)} bind:this={rows[i]} onkeydown={(e) => rowKey(e, i)}>
          <select tabindex="-1" aria-label={t('al.field')} bind:this={fieldEls[i]} value={c.field} onchange={(e) => setField(i, e.currentTarget.value)} data-esc-local onkeydown={(e) => backToRow(e, i)}>
            {#each fields as x (x.id)}<option value={x.id}>{fname(x)}</option>{/each}
          </select>
          <button type="button" tabindex="-1" class="op" aria-label={t('al.op')} onclick={() => flip(i)}>{c.op === '>=' ? '≥' : '≤'}</button>
          {#if c.ref}
            <select tabindex="-1" aria-label={t('al.ref')} bind:this={refEls[i]} value={c.ref} onchange={(e) => setRef(i, e.currentTarget.value)} data-esc-local onkeydown={(e) => backToRow(e, i)}>
              <option value="">{t('al.refNone')}</option>
              {#each f ? refFields(f) : [] as g (g.id)}<option value={g.id}>{fname(g)}</option>{/each}
            </select>
          {/if}
          <input
            tabindex="-1"
            class="num val"
            aria-label={t('al.value')}
            autocomplete="off"
            bind:this={valEls[i]}
            value={valueShown(i, c)}
            onfocus={() => (typing = { i, s: String(c.value) })}
            oninput={(e) => (typing = { i, s: e.currentTarget.value })}
            onblur={commitTyping}
            data-esc-local onkeydown={(e) => backToRow(e, i)} />
          {#if !c.ref && f && refFields(f).length}
            <select tabindex="-1" class="refpick" aria-label={t('al.ref')} bind:this={refEls[i]} value="" onchange={(e) => setRef(i, e.currentTarget.value)} data-esc-local onkeydown={(e) => backToRow(e, i)}>
              <option value="">{t('al.ref')}</option>
              {#each refFields(f) as g (g.id)}<option value={g.id}>{fname(g)}</option>{/each}
            </select>
          {/if}
          <span class="now muted">{fieldValueText(c.field, fieldNow(c.field))}</span>
          {#if conds.length > 1}
            <button type="button" tabindex="-1" class="x" aria-label={t('al.removeCond')} title={t('al.removeCond')} onclick={() => removeCond(i)}>✕</button>
          {/if}
        </div>
      </div>
    {/each}
    {#if conds.length < MAX}
      <div class="f">
        <span class="lb"></span>
        <button type="button" class="btn add" onclick={addCond}>＋ {t('al.addCond')}</button>
      </div>
    {/if}
    {/if}
    <div class="f">
      <span class="lb">{t('al.repeat')}</span>
      <!-- svelte-ignore a11y_interactive_supports_focus -->
      <div class="seg" role="radiogroup" tabindex="0" aria-label={t('al.repeat')} onkeydown={repKey}>
        <button type="button" tabindex="-1" role="radio" aria-checked={repeat} onclick={() => (repeat = true)}>{t('al.repeatEach')}</button>
        <button type="button" tabindex="-1" role="radio" aria-checked={!repeat} onclick={() => (repeat = false)}>{t('al.repeatOnce')}</button>
      </div>
    </div>
    <label class="f">
      <span class="lb">{t('al.note')}</span>
      <input name="note" class="note" bind:value={note} maxlength="200" autocomplete="off" />
    </label>
    {#if adjustedNote}<div class="adj muted">{t('al.splitTip', { v: adjustedNote })}</div>{/if}
    <div class="nowline" class:met={nowLine === t('al.nowMet')}>{error ?? nowLine}</div>
  </div>
  <div class="actions">
    <button type="button" class="btn" onclick={cancel}>{t('common.cancel')}</button>
    <button type="button" class="btn primary" disabled={!!error} onclick={save}>{edit ? t('al.saveEdit') : t('al.create')}</button>
  </div>
  <div class="muted keys">{t('al.formKeys')}</div>
</div>

<style>
  .alertform {
    width: 680px;
    padding: var(--s-3) var(--s-4);
  }
  h3 {
    margin: 0 0 var(--s-3);
    font-size: var(--fs-3);
  }
  .body {
    display: grid;
    gap: var(--s-2);
  }
  .f {
    display: grid;
    grid-template-columns: 72px 1fr;
    align-items: center;
    gap: var(--s-2);
  }
  .lb {
    color: var(--text-2);
    font-size: var(--fs-2);
  }
  .tgrow {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    min-width: 0;
  }
  .tg .c {
    color: var(--text-2);
    margin-right: 4px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 4px;
    border: 1px solid transparent;
    border-radius: var(--radius);
    min-width: 0;
  }
  .row:focus {
    outline: none;
    border-color: var(--focus);
    background: var(--select);
  }
  select,
  input,
  .op {
    height: 26px;
    padding: 0 6px;
    background: var(--bg);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    color: var(--text);
    font-size: var(--fs-2);
  }
  select {
    max-width: 180px;
  }
  .refpick {
    max-width: 120px;
    color: var(--text-3);
  }
  .op {
    width: 30px;
    cursor: pointer;
  }
  .val {
    width: 110px;
    text-align: right;
  }
  .note {
    width: 100%;
  }
  .now {
    margin-left: auto;
    font-size: var(--fs-1);
    white-space: nowrap;
  }
  .x {
    background: none;
    border: 0;
    color: var(--text-3);
    cursor: pointer;
  }
  select:focus,
  input:focus,
  .seg:focus-visible,
  .add:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 1px;
  }
  .add {
    width: max-content;
  }
  .seg {
    display: flex;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    width: max-content;
  }
  .seg button {
    background: var(--bg);
    border: 0;
    border-right: 1px solid var(--line-strong);
    padding: 0 10px;
    height: 24px;
    color: var(--text-2);
    font-size: var(--fs-1);
    cursor: pointer;
  }
  .seg button:last-child {
    border-right: 0;
  }
  .seg button[aria-checked='true'] {
    background: var(--select-strong);
    color: var(--text);
  }
  .adj {
    font-size: var(--fs-1);
  }
  .nowline {
    min-height: 18px;
    font-size: var(--fs-2);
    color: var(--text-2);
  }
  .nowline.met {
    color: var(--warn);
  }
  .actions {
    display: flex;
    gap: var(--s-2);
    align-items: center;
    justify-content: flex-end;
    margin-top: var(--s-2);
  }
  .actions .btn {
    white-space: nowrap;
  }
  .keys {
    margin-top: var(--s-2);
    font-size: var(--fs-1);
  }
</style>
