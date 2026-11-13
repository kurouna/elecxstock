<script lang="ts">
// 保有を足す・直す（FR-H7）: 銘柄・口座区分・数量・平均取得単価を 1 つのフォームで。キーだけで入れられる:
// Tab で項目、口座区分は ← →、Enter で保存、Esc で取り消し
import { ACCOUNT_TYPES } from '@shared/api'
import type { AccountType, Holding, Instrument } from '@shared/types'
import { onMount } from 'svelte'
import { accountName } from '../../lib/portfolio'
import { app, closeOverlay, nameOf, rpc, t } from '../../stores/app.svelte'

let { holding, resolve }: { holding?: Holding; resolve: (h: Holding | null) => void } = $props()
// svelte-ignore state_referenced_locally
let code = $state(holding?.code ?? '')
// svelte-ignore state_referenced_locally
let account = $state<AccountType>(holding?.account ?? 'tokutei')
// svelte-ignore state_referenced_locally
let qty = $state(holding ? String(holding.quantity) : '')
// svelte-ignore state_referenced_locally
let avg = $state(holding ? String(holding.avgCost) : '')
let found = $state<Instrument | null>(null)
let codeEl = $state<HTMLInputElement>()
let qtyEl = $state<HTMLInputElement>()
let token = 0

const C = $derived(code.normalize('NFKC').trim().toUpperCase())
$effect(() => {
  const q = C
  const my = ++token
  if (!/^[0-9][0-9A-Z]{3,4}$/.test(q)) {
    found = null
    return
  }
  void rpc('instruments.search', { q, limit: 5 }).then((r) => {
    if (my === token) found = r.find((x) => x.code === q) ?? null
  })
})
const num = (s: string) => {
  const v = Number(s.replace(/[,，円¥\s]/g, ''))
  return Number.isFinite(v) ? v : Number.NaN
}
const q = $derived(num(qty))
const a = $derived(num(avg))
const error = $derived(
  !/^[0-9][0-9A-Z]{3,4}$/.test(C) ? t('hold.errCode') : !(q > 0) ? t('hold.errQty') : !(a >= 0) ? t('hold.errAvg') : null,
)
const name = $derived(found ? (app.settings.lang === 'en' && found.nameEn ? found.nameEn : found.nameJa) : C ? nameOf(`JP:${C}`) : '')

// 閉じるとこの部品は外れて props が読めなくなるので、結果を渡してから閉じる
function save() {
  if (error) return
  resolve({ ...(holding ?? {}), code: C, account, quantity: q, avgCost: a })
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
  } else if (e.key === 'Enter') {
    e.preventDefault()
    e.stopPropagation()
    save()
  }
}
function accKey(e: KeyboardEvent) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
  e.preventDefault()
  const i = ACCOUNT_TYPES.indexOf(account)
  account = ACCOUNT_TYPES[(i + (e.key === 'ArrowRight' ? 1 : -1) + ACCOUNT_TYPES.length) % ACCOUNT_TYPES.length]!
}
onMount(() => (holding ? qtyEl : codeEl)?.focus())
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="dialog holding" role="dialog" aria-label={holding ? t('hold.editTitle') : t('hold.addTitle')} tabindex="-1" onkeydown={key}>
  <h3>{holding ? t('hold.editTitle') : t('hold.addTitle')}</h3>
  <div class="body">
    <label class="f">
      <span>{t('hold.code')}</span>
      <input bind:this={codeEl} name="code" class="num" bind:value={code} placeholder="7203" autocomplete="off" disabled={!!holding} />
      <span class="nm" class:muted={!name}>{name || t('hold.codeHint')}</span>
    </label>
    <div class="f">
      <span>{t('hold.account')}</span>
      <!-- svelte-ignore a11y_interactive_supports_focus -->
      <div class="seg" role="radiogroup" tabindex="0" aria-label={t('hold.account')} onkeydown={accKey}>
        {#each ACCOUNT_TYPES as x (x)}
          <button type="button" tabindex="-1" role="radio" aria-checked={account === x} onclick={() => (account = x)}>{accountName(x)}</button>
        {/each}
      </div>
    </div>
    <label class="f">
      <span>{t('hold.qty')}</span>
      <input bind:this={qtyEl} name="qty" class="num" bind:value={qty} inputmode="decimal" autocomplete="off" />
    </label>
    <label class="f">
      <span>{t('hold.avg')}</span>
      <input name="avg" class="num" bind:value={avg} inputmode="decimal" autocomplete="off" />
    </label>
    <div class="err">{error ?? ''}</div>
  </div>
  <div class="actions">
    <span class="muted keys">{t('hold.formKeys')}</span>
    <button type="button" class="btn" onclick={cancel}>{t('common.cancel')}</button>
    <button type="button" class="btn primary" disabled={!!error} onclick={save}>{t('hold.saveDo')}</button>
  </div>
</div>

<style>
  .holding {
    width: 560px;
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
    grid-template-columns: 110px auto 1fr;
    align-items: center;
    gap: var(--s-2);
  }
  .f > span:first-child {
    color: var(--text-2);
    font-size: var(--fs-2);
  }
  input {
    width: 140px;
    height: 26px;
    padding: 0 8px;
    background: var(--bg);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    color: var(--text);
  }
  input:focus,
  .seg:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 1px;
  }
  .nm {
    font-size: var(--fs-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .seg {
    grid-column: 2 / -1;
    display: flex;
    flex-wrap: wrap;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    width: max-content;
    max-width: 100%;
  }
  .seg button {
    background: var(--bg);
    border: 0;
    border-right: 1px solid var(--line-strong);
    padding: 0 8px;
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
  .err {
    min-height: 16px;
    color: var(--warn);
    font-size: var(--fs-1);
  }
  .actions {
    display: flex;
    gap: var(--s-2);
    align-items: center;
    justify-content: flex-end;
    margin-top: var(--s-2);
  }
  .keys {
    margin-right: auto;
    font-size: var(--fs-1);
  }
</style>
