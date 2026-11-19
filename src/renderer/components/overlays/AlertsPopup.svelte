<script lang="ts">
// アラートのポップアップ（FR-AL8。design-alerts.md §6.1）: アラートの一覧と鳴った履歴。画面の上寄りに重ねて開き、
// レイアウトは変えない。Insert 作る・E 直す・Space 有効と停止・Delete 消す・Enter 銘柄（スクリーンはスクリーナー）を開く・
// H 切り替え・R 既読・Ctrl+Shift+F 成立中だけ・Esc 閉じる。一覧は app.alerts（チャートの点線と同じもの）
import { jstDateTimeText } from '@shared/calendar'
import type { AlertFire, AlertView } from '@shared/types'
import { onMount, tick } from 'svelte'
import {
  canUndoRemoveAlert,
  editAlert,
  fireText,
  openTarget,
  removeAlert,
  setAlertEnabled,
  targetText,
  undoRemoveAlert,
} from '../../lib/alerts'
import { condsText, distanceText, fieldValueText } from '../../lib/alertText'
import { newAlertForFocus, sendSymbol } from '../../lib/commands'
import type { Key } from '../../lib/i18n'
import { app, closeOverlay, rpc, t, toast } from '../../stores/app.svelte'

let { tab: initial }: { tab?: 'alerts' | 'history' } = $props()
// svelte-ignore state_referenced_locally
let tab = $state<'alerts' | 'history'>(initial ?? (app.alertsUnread > 0 ? 'history' : 'alerts'))
const list = $derived(app.alerts)
let hist = $state<AlertFire[]>([])
let onlyMet = $state(false)
let sel = $state(0)
let loaded = $state(false)
let root = $state<HTMLElement>()
let body = $state<HTMLElement>()

const shown = $derived(onlyMet ? list.filter((a) => a.enabled && a.state.met === true && !a.state.invalid) : list)
const rows = $derived(tab === 'alerts' ? shown.length : hist.length)

async function load() {
  hist = await rpc('alerts.history', {}).catch(() => [])
  sel = Math.max(0, Math.min(sel, (tab === 'alerts' ? shown.length : hist.length) - 1))
  loaded = true
}
$effect(() => {
  void app.alertsRev
  void load()
})

type St = 'on' | 'off' | 'met' | 'bad'
// スクリーンのアラートは「成立中」を持たない（結果に銘柄があるのはふつうのこと）
const stOf = (a: AlertView): St => (!a.enabled ? 'off' : a.state.invalid ? 'bad' : a.state.met && a.target.kind === 'symbol' ? 'met' : 'on')
const MARK: Record<St, string> = { on: '●', off: '○', met: '◎', bad: '!' }
// 鳴った時刻は日本時間で出す（FR-T1。PC の時刻帯によらない）
const atText = jstDateTimeText

function open(x: { screenId?: string; instrument?: AlertFire['instrument'] }) {
  closeOverlay()
  openTarget(x, sendSymbol)
}
/** 履歴の行を開く（未読なら既読にする。Enter とダブルクリック） */
function openFire(f: AlertFire) {
  if (!f.read) void markRead([f.id])
  open(f)
}
const targetOf = (a: AlertView) => (a.target.kind === 'screen' ? { screenId: a.target.screenId } : { instrument: a.target.id })
const create = () => newAlertForFocus(true)
async function markRead(ids?: string[]) {
  app.alertsUnread = await rpc('alerts.markRead', ids ? { ids } : {}).catch(() => app.alertsUnread)
  hist = hist.map((f) => (!ids || ids.includes(f.id) ? { ...f, read: true } : f))
  if (!ids) toast(t('al.readAll'))
}
function switchTab(to: 'alerts' | 'history') {
  tab = to
  sel = 0
}
async function scrollSel() {
  await tick()
  body?.querySelector('tr.sel')?.scrollIntoView({ block: 'nearest' })
}

function key(e: KeyboardEvent) {
  if (e.isComposing) return
  const k = e.key
  const ctrl = e.ctrlKey || e.metaKey
  const a = tab === 'alerts' ? shown[sel] : undefined
  const f = tab === 'history' ? hist[sel] : undefined
  // Esc は handleKey（capture）が閉じる
  if (k === 'ArrowDown' || k === 'ArrowUp') sel = Math.max(0, Math.min(rows - 1, sel + (k === 'ArrowDown' ? 1 : -1)))
  else if (k === 'PageDown' || k === 'PageUp') sel = Math.max(0, Math.min(rows - 1, sel + (k === 'PageDown' ? 10 : -10)))
  else if (k === 'Home') sel = 0
  else if (k === 'End') sel = Math.max(0, rows - 1)
  else if (ctrl && e.shiftKey && e.code === 'KeyF') {
    onlyMet = !onlyMet
    sel = 0
  } else if (ctrl && !e.shiftKey && !e.altKey && e.code === 'KeyZ' && canUndoRemoveAlert()) void undoRemoveAlert()
  else if (ctrl || e.altKey) return
  else if (e.code === 'KeyH') switchTab(tab === 'alerts' ? 'history' : 'alerts')
  else if (k === 'Enter' && (a || f)) {
    if (a) open(targetOf(a))
    else openFire(f!)
  } else if (tab === 'history' && e.code === 'KeyR') void markRead()
  else if (tab === 'alerts' && k === 'Insert') create()
  else if (tab === 'alerts' && e.code === 'KeyE' && a) void editAlert(a)
  else if (tab === 'alerts' && k === ' ' && a) void setAlertEnabled(a.id, !a.enabled)
  else if (tab === 'alerts' && k === 'Delete' && a) void removeAlert(a.id)
  else return
  e.preventDefault()
  e.stopPropagation()
  void scrollSel()
}
onMount(() => root?.focus())
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_no_noninteractive_tabindex -->
<div class="dialog alerts" role="dialog" aria-label={t('al.title')} tabindex="0" bind:this={root} onkeydown={key}>
  <div class="hd">
    <h3>{t('al.title')}</h3>
    <div class="tabs" role="tablist">
      <button type="button" tabindex="-1" role="tab" aria-selected={tab === 'alerts'} onclick={() => switchTab('alerts')}>{t('al.tabAlerts')} <span class="n">{list.length}</span></button>
      <button type="button" tabindex="-1" role="tab" aria-selected={tab === 'history'} onclick={() => switchTab('history')}>
        {t('al.tabHistory')}
        {#if app.alertsUnread}<span class="badge">{app.alertsUnread}</span>{/if}
      </button>
    </div>
    {#if tab === 'alerts'}
      <label class="only"><input type="checkbox" tabindex="-1" bind:checked={onlyMet} /> {t('al.onlyMet')}</label>
      <button type="button" tabindex="-1" class="btn add" onclick={create}>＋ {t('al.add')}</button>
    {/if}
    <button type="button" tabindex="-1" class="close" aria-label={t('cmd.hint.close')} onclick={closeOverlay}>✕</button>
  </div>
  <div class="body" bind:this={body}>
    {#if tab === 'alerts'}
      {#if !shown.length}
        <div class="empty muted">{t('al.empty')}</div>
      {:else}
        <table>
          <thead>
            <tr><th>{t('al.colState')}</th><th>{t('al.colSymbol')}</th><th>{t('al.colCond')}</th><th class="r">{t('al.colNow')}</th><th class="r">{t('al.colDist')}</th><th>{t('al.colLast')}</th></tr>
          </thead>
          <tbody>
            {#each shown as a, i (a.id)}
              {@const st = stOf(a)}
              <tr class:sel={i === sel} class:off={!a.enabled} onclick={() => (sel = i)} ondblclick={() => open(targetOf(a))}>
                <td class="st {st}">{MARK[st]} {t(`al.st.${st}` as Key)}</td>
                <td class="sym">{targetText(a)}</td>
                <td class="cond">
                  {a.target.kind === 'screen' ? t('al.screenCond') : condsText(a.adjusted ?? a.conditions)}
                  {#if a.adjusted}<span class="tag" title={t('al.splitTip', { v: condsText(a.conditions) })}>{t('al.split')}</span>{/if}
                  {#if a.state.invalid}<span class="tag warn">{t(`al.inv.${a.state.invalid}` as Key)}</span>{/if}
                  {#if a.note}<span class="note muted">{a.note}</span>{/if}
                </td>
                <td class="num r">{a.target.kind === 'screen' ? (a.now == null ? '—' : t('al.members', { n: a.now })) : a.conditions[0] ? fieldValueText(a.conditions[0].field, a.now) : '—'}</td>
                <td class="num r">{st === 'met' ? t('al.st.met') : distanceText(a.distance)}</td>
                <td class="num muted">{a.state.lastFired ? atText(a.state.lastFired) : '—'}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    {:else if loaded && !hist.length}
      <div class="empty muted">{t('al.historyEmpty')}</div>
    {:else}
      <table>
        <thead>
          <tr><th>{t('al.colAt')}</th><th>{t('al.colSymbol')}</th><th>{t('al.colCond')}</th><th class="r">{t('al.colValue')}</th></tr>
        </thead>
        <tbody>
          {#each hist as f, i (f.id)}
            {@const c = f.conditions[0]}
            <tr class:sel={i === sel} class:unread={!f.read} onclick={() => (sel = i)} ondblclick={() => openFire(f)}>
              <td class="num">{atText(f.at)}</td>
              <td class="sym">{f.screenId ? targetText({ target: { kind: 'screen', screenId: f.screenId } }) : targetText({ target: { kind: 'symbol', id: f.instrument } })}</td>
              <td class="cond">
                {f.screenId ? fireText(f) : condsText(f.conditions)}
                {#if f.splitAdjusted}<span class="tag">{t('al.split')}</span>{/if}
                {#if f.provisional}<span class="tag" title={t('al.provTip')}>{t('al.prov')}</span>{/if}
              </td>
              <td class="num r">{c ? fieldValueText(c.field, f.values[c.field]) : '—'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
  <div class="foot">{tab === 'alerts' ? t('al.keys') : t('al.keysHist')}</div>
</div>

<style>
  .alerts {
    width: min(920px, calc(100vw - 48px));
    display: flex;
    flex-direction: column;
    overflow: hidden;
    outline: none;
  }
  .hd {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    padding: var(--s-2) var(--s-3);
    border-bottom: 1px solid var(--line-strong);
  }
  .hd h3 {
    margin: 0;
  }
  .tabs {
    display: flex;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
  }
  .tabs button {
    background: var(--bg);
    border: 0;
    border-right: 1px solid var(--line-strong);
    padding: 0 10px;
    height: 24px;
    color: var(--text-2);
    font-size: var(--fs-1);
    cursor: pointer;
  }
  .tabs button:last-child {
    border-right: 0;
  }
  .tabs button[aria-selected='true'] {
    background: var(--select-strong);
    color: var(--text);
  }
  .tabs .n {
    color: var(--text-3);
  }
  .badge {
    display: inline-block;
    min-width: 16px;
    padding: 0 4px;
    border-radius: 8px;
    background: var(--warn);
    color: var(--bg);
    font-size: var(--fs-1);
    line-height: 16px;
    text-align: center;
  }
  .only {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: var(--fs-1);
    color: var(--text-2);
  }
  .add {
    margin-left: auto;
  }
  .close {
    margin-left: auto;
    background: none;
    border: 0;
    color: var(--text-3);
    cursor: pointer;
  }
  .add + .close {
    margin-left: 0;
  }
  .body {
    max-height: 420px;
    overflow: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--fs-2);
  }
  th {
    position: sticky;
    top: 0;
    background: var(--panel-2);
    text-align: left;
    font-weight: normal;
    color: var(--text-3);
    font-size: var(--fs-1);
    padding: 4px 8px;
    border-bottom: 1px solid var(--line);
  }
  td {
    padding: 3px 8px;
    white-space: nowrap;
    border-bottom: 1px solid var(--line);
  }
  .r {
    text-align: right;
  }
  tr {
    cursor: default;
  }
  tr.sel td {
    background: var(--select-strong);
  }
  tr.sel td:first-child {
    box-shadow: inset 2px 0 0 var(--focus);
  }
  tr.off td {
    color: var(--text-3);
  }
  tr.unread td {
    font-weight: 600;
  }
  .sym {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cond {
    max-width: 360px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .st.met {
    color: var(--warn);
  }
  .st.bad {
    color: var(--danger);
  }
  .tag {
    margin-left: 6px;
    padding: 0 4px;
    border: 1px solid var(--line-strong);
    border-radius: 3px;
    font-size: var(--fs-1);
    color: var(--text-2);
  }
  .tag.warn {
    color: var(--danger);
    border-color: var(--danger-line);
  }
  .note {
    margin-left: 6px;
    font-size: var(--fs-1);
  }
  .empty {
    padding: var(--s-4);
    text-align: center;
  }
</style>
