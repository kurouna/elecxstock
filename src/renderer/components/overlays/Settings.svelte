<script lang="ts">
// 設定（Ctrl+,。docs/design-dialogs.md §6・FR-KB11）: 左に探す欄とタブ、右に節ごとの枠。行は「名前と説明｜操作｜↺」。
// 項目の登録表（探す・既定に戻す・変えた数・行の種類の性質）は lib/settingsSpec.ts。キー: ↑ ↓ でタブ、→ / Enter で本文、
// 本文は ↑ ↓ で行（使えない行・操作の無い行にも止まる）、← → で行の中の部品と値（表示倍率・保存期間は仮の値で Enter で決める）、
// Space / Enter でスイッチ・ボタン、Backspace で既定に戻す、Esc で仮の値をやめる → 探すのをやめる → タブへ
import { LWC_NOTICE, LWC_NOTICE_PARTS, splitToken, TRADINGVIEW_URL, yahooUrl } from '@shared/attribution'
import { type LoginState, loginView } from '@shared/background'
import { CODE_RE } from '@shared/code'
import type { Settings as S } from '@shared/types'
import { targetsFromInputs, targetTexts, YIELD_TARGETS_UI } from '@shared/yieldLines'
import { onMount } from 'svelte'
// アプリのアイコン（インストーラ・タスクバーと同じ。build/icon.svg が正）
import appIcon from '../../../../build/icon.svg'
import { ACTIONS, checkUpdate, doResetAllLayouts, exportUser, importUser, keyCapture } from '../../lib/commands'
import { noticeOpen } from '../../lib/fileNotice'
import { dateTime } from '../../lib/format'
import type { Key } from '../../lib/i18n'
import { composing } from '../../lib/keys'
import {
  defaultOf,
  defaultText,
  dependencyOff,
  fmtMb,
  footHints,
  groupRows,
  isModified,
  KIND,
  modifiedCount,
  RETENTION_YEARS,
  retentionEstimate,
  rowById,
  rowsOfTab,
  SCALES,
  SETTING_TABS,
  type SettingRow,
  type SettingTab,
  searchSettings,
  signedMb,
  stepIn,
} from '../../lib/settingsSpec'
import NewsSettings from '../../news/NewsSettings.svelte'
import { app, bridge, confirmDialog, loadInstruments, nameOf, promptDialog, rpc, saveSettings, t, toast } from '../../stores/app.svelte'
import Hl from './Hl.svelte'
import Keys from './Keys.svelte'
import KeysSettings from './KeysSettings.svelte'
import Seg from './settings/Seg.svelte'
import Stepper from './settings/Stepper.svelte'
import Switch from './settings/Switch.svelte'

let { tab = 'general' }: { tab?: string } = $props()
let cur = $state<SettingTab>('general')
let q = $state('')
let notices = $state('')
let tabsEl = $state<HTMLElement>()
/** フォーカスがタブにある（下の段の案内をタブの操作にする） */
let onTabs = $state(false)
let body = $state<HTMLElement>()
let search = $state<HTMLInputElement>()
/** 表示倍率・保存期間の仮の値（← → で動かし、Enter で決める。行を離れたらやめる） */
let pend = $state<{ uiScale?: number; retentionYears?: number }>({})
const tr = (k: string, a?: Record<string, string | number>) => t(k as Key, a)
// データ源の文の「Yahoo Finance」をリンクにする
const src = $derived(splitToken(t('set.dataSource'), 'Yahoo Finance'))
const searching = $derived(!!q.trim())
const items = $derived(searching ? searchSettings(q, tr) : rowsOfTab(cur).map((row) => ({ row, ranges: [] as [number, number][] })))
const sections = $derived(groupRows(items, (x) => (searching ? x.row.tab : x.row.section)))
const s = $derived(app.settings)
const actionIds = ACTIONS.map((a) => a.id)

onMount(() => {
  cur = (SETTING_TABS as readonly string[]).includes(tab) ? (tab as SettingTab) : 'general'
  focusTab()
  void bridge
    .call('data.status', {})
    .then((st) => (app.status = st))
    .catch(() => {})
})
const focusTab = () => queueMicrotask(() => tabsEl?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus())
function selectTab(x: SettingTab) {
  cur = x
  q = ''
  pend = {}
  focusTab()
}
// ---- 行の移動（本文）
const rowsEl = () => [...(body?.querySelectorAll<HTMLElement>('[data-row]') ?? [])]
/** 行の中の操作できる部品（見えているもの。↺ は除く） */
const partsOf = (row: Element) =>
  [...row.querySelectorAll<HTMLElement>('button, input, [tabindex="0"]')].filter(
    (el) =>
      !el.classList.contains('rst') &&
      el.getAttribute('aria-hidden') !== 'true' &&
      !(el as HTMLButtonElement).disabled &&
      el.offsetParent !== null &&
      getComputedStyle(el).visibility !== 'hidden',
  )
/** 行へフォーカス: 主な部品（data-primary）か最初の部品。部品が無ければ行そのもの（使えない行・文だけの行にも止まる） */
function focusRow(i: number) {
  queueMicrotask(() => {
    const rows = rowsEl()
    // 行の無いタブ（キー・ニュース）は、本文の最初の操作へ
    if (!rows.length) return void body?.querySelector<HTMLElement>('input:not(:disabled), button:not(:disabled), [tabindex="0"]')?.focus()
    const row = rows[Math.max(0, Math.min(rows.length - 1, i))]!
    const parts = partsOf(row)
    ;(parts.find((p) => p.hasAttribute('data-primary')) ?? parts[0] ?? row).focus()
  })
}
function navKey(e: KeyboardEvent) {
  const i = SETTING_TABS.indexOf(cur)
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp')
    selectTab(SETTING_TABS[(i + (e.key === 'ArrowDown' ? 1 : -1) + SETTING_TABS.length) % SETTING_TABS.length]!)
  else if (e.key === 'ArrowRight' || e.key === 'Enter') focusRow(0)
  else return
  e.preventDefault()
}
/** 本文のキー（セグメント・ステッパー・キーの割り当ては自分で受けて止める） */
function bodyKey(e: KeyboardEvent) {
  if (composing(e)) return
  const el = e.target as HTMLElement
  const inInput = el.tagName === 'INPUT'
  const rowEl = el.closest<HTMLElement>('[data-row]')
  const rows = rowsEl()
  const at = rowEl ? rows.indexOf(rowEl) : -1
  if (e.key === 'Escape') {
    if (Object.keys(pend).length) {
      pend = {}
      toast(t('set.pendingCancel'))
    } else if (searching) {
      q = ''
      search?.focus()
    } else focusTab()
  } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && at >= 0) {
    if (e.key === 'ArrowUp' && at === 0 && searching) search?.focus()
    else focusRow(at + (e.key === 'ArrowDown' ? 1 : -1))
  } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && rowEl && !inInput) {
    // 行の中の部品を巡る。先頭での ← はタブへ
    const parts = partsOf(rowEl)
    const i = parts.indexOf(el)
    const j = i + (e.key === 'ArrowRight' ? 1 : -1)
    if (j < 0) focusTab()
    else if (j < parts.length) parts[j]!.focus()
  } else if (e.key === 'Backspace' && !inInput && rowEl) {
    const row = rowById(rowEl.dataset.row!)
    if (!row || !isModified(row, s)) return
    resetRow(row)
  } else return
  e.preventDefault()
}
/** 仮の値は、その行を離れたらやめる（別の行の Enter は別の意味になるため） */
function bodyFocus(e: FocusEvent) {
  const id = (e.target as HTMLElement).closest<HTMLElement>('[data-row]')?.dataset.row
  if (pend.uiScale != null && id !== 'scale') pend = omit(pend, 'uiScale')
  if (pend.retentionYears != null && id !== 'retention') pend = omit(pend, 'retentionYears')
}
function resetRow(row: SettingRow) {
  if (!row.setting) return
  if (row.setting === 'uiScale') pend = omit(pend, 'uiScale')
  if (row.setting === 'retentionYears') {
    pend = omit(pend, 'retentionYears')
    return void setRetention(defaultOf('retentionYears'))
  }
  if (row.setting === 'yieldTargets') yt = targetTexts(defaultOf('yieldTargets'))
  saveSettings({ [row.setting]: defaultOf(row.setting) } as Partial<S>)
  toast(t('set.reverted', { name: t(row.label as Key) }))
}
/** 「既定: …」に出す既定の値 */
const defText = (row: SettingRow) => (row.setting ? defaultText(row.setting, tr) : '')
// ---- 探す（Ctrl+F・/）: 全タブから。キーを割り当てている間は押したキーを割り当てに回す
function dialogKey(e: KeyboardEvent) {
  if (keyCapture.on) return
  const typing = (e.target as HTMLElement).tagName === 'INPUT'
  if ((e.ctrlKey && e.code === 'KeyF') || (e.key === '/' && !typing && !(cur === 'keys' && body?.contains(e.target as Node)))) {
    e.preventDefault()
    e.stopPropagation()
    search?.focus()
    search?.select()
  }
}
function searchKey(e: KeyboardEvent) {
  if (composing(e)) return
  if (e.key === 'ArrowDown' || e.key === 'Enter') {
    if (searching) focusRow(0)
    else focusTab()
  } else if (e.key === 'Escape' && q) q = ''
  else return
  e.preventDefault()
}
// ---- サインイン時の起動（FR-BG6・BG7）: 正は Windows の登録なので、開くたびに main に聞く
let login = $state<LoginState | null>(null)
const bgView = $derived(loginView(login, { readOnly: app.readOnly }))
void window.elecxstock
  .loginItem()
  .then((st) => {
    if (st) login = st
  })
  .catch(() => {})
function setLogin(on: boolean, hidden: boolean) {
  void window.elecxstock
    .setLoginItem(on, hidden)
    .then((st) => {
      if (st) login = st
    })
    .catch(() => {})
}
const depOff = (row: SettingRow) => dependencyOff(row, s, bgView.login.on)
// ---- 目標利回り（FR-C12）: 欄は打った順のまま。Enter か Tab（欄を離れたとき）で保存し、読めない欄は空に戻して知らせる
let yt = $state(targetTexts(app.settings.yieldTargets))
function commitYield() {
  const r = targetsFromInputs(yt)
  yt = r.texts
  if (r.bad) toast(t('set.yieldTargetBad'))
  saveSettings({ yieldTargets: r.targets })
}
// ---- 表示倍率・保存期間（仮の値 → Enter で決める）
const omit = <T extends object>(o: T, k: keyof T): T => {
  const c = { ...o }
  delete c[k]
  return c
}
function step(k: 'uiScale' | 'retentionYears', d: 1 | -1) {
  const list = k === 'uiScale' ? SCALES : RETENTION_YEARS
  const v = stepIn(list, pend[k] ?? s[k], d)
  pend = v === s[k] ? omit(pend, k) : { ...pend, [k]: v }
}
async function commit(k: 'uiScale' | 'retentionYears') {
  const v = pend[k]
  if (v == null) return
  pend = omit(pend, k)
  if (k === 'retentionYears') return void (await setRetention(v))
  saveSettings({ uiScale: v })
  toast(t('set.applied', { name: t('set.scale'), v: `${Math.round(v * 100)}%` }))
}
async function setRetention(years: number) {
  const cur0 = app.settings.retentionYears
  if (years === cur0) return
  if (years < cur0) {
    // 縮めるときは、消える期間・件数・容量を示して確認する（FR-D6。決めるときに 1 回だけ）
    const plan = await rpc('jobs.planRetention', { years })
    const r = await confirmDialog({
      title: t('ret.title', { n: years }),
      body: t('ret.body', { date: plan.deleteBefore ?? '', rows: plan.rows.toLocaleString(), mb: Math.round(plan.approxBytes / 1048576) }),
      ok: t('ret.apply'),
      danger: true,
    })
    app.overlay = { kind: 'settings', tab: 'data' }
    if (!r.ok) return
  }
  await rpc('jobs.applyRetention', { years })
  app.settings = { ...app.settings, retentionYears: years }
  if (years > cur0) toast(t('ret.extended', { n: years }))
  app.status = await rpc('data.status', {})
}
/** 下の段の案内（探している間は全部の操作） */
const hints = $derived(searching ? { toggle: true, value: true, reset: true } : footHints(cur))
const est = $derived(retentionEstimate(app.status?.dbBytes ?? 0, s.retentionYears, pend.retentionYears ?? s.retentionYears))
// ---- データ
async function reset() {
  const st = app.status
  const r = await confirmDialog({
    title: t('reset.title'),
    items: t('reset.items', { mb: Math.round((st?.dbBytes ?? 0) / 1048576), n: (st?.instruments ?? 0).toLocaleString() }).split('|'),
    body: t('set.dataNote'),
    check: t('reset.keepDelisted'),
    ok: t('reset.do'),
    danger: true,
  })
  if (!r.ok) {
    app.overlay = { kind: 'settings', tab: 'data' }
    return
  }
  await rpc('jobs.reset', { keepDelisted: r.checked })
  toast(t('reset.started'))
}
async function addUser() {
  const code = (await promptDialog(t('set.addInstrument'), ''))?.trim().toUpperCase()
  app.overlay = { kind: 'settings', tab: 'data' }
  if (!code || !CODE_RE.test(code)) return
  const ins = await rpc('instruments.addUser', { code })
  if (ins) app.instruments.set(ins.id, ins)
  app.settings = (await rpc('user.load', {})).settings
  toast(t('cmd.addUser', { code }))
}
async function removeUser(code: string) {
  await rpc('instruments.removeUser', { code })
  app.settings = { ...app.settings, userInstruments: app.settings.userInstruments.filter((c) => c !== code) }
  await loadInstruments()
}
async function importJpx() {
  const bytes = noticeOpen(await window.elecxstock.openFile('xlsx'))
  if (!(bytes instanceof Uint8Array)) return
  const n = await rpc('data.importJpx', { bytes: new Uint8Array(bytes) })
  toast(t('jpx.imported', { n: n.toLocaleString() }))
}
const runAction = (id: string) => ACTIONS.find((a) => a.id === id)?.run()
</script>

{#snippet switchRow(row: SettingRow, on: boolean, change: () => void, off: boolean)}
  <Switch {on} label={t(row.label as Key)} disabled={off} describedby={row.dependsOn ? `dep-${row.id}` : undefined} onchange={change} />
{/snippet}

{#snippet themeItem(o: { v: 'dark' | 'light'; label: string })}
  <svg class="thm-pv pv-{o.v}" viewBox="0 0 112 64" aria-hidden="true">
    <rect class="bg" width="112" height="64" /><rect class="pn" width="112" height="9" /><rect class="tx" x="6" y="3.5" width="18" height="2" />
    <rect class="pn ln" x="4" y="13" width="44" height="47" /><rect class="sel" x="5" y="21" width="42" height="7" /><rect class="fc" x="5" y="21" width="2" height="7" />
    <rect class="tx" x="9" y="16" width="20" height="1.6" /><rect class="tx" x="9" y="23.7" width="24" height="1.6" /><rect class="tx" x="9" y="31" width="18" height="1.6" /><rect class="tx" x="9" y="38" width="22" height="1.6" />
    <rect class="pn ln" x="52" y="13" width="56" height="47" />
    <path class="wk" d="M66 22v26M80 18v24M94 26v26" /><rect class="up" x="63" y="27" width="6" height="14" /><rect class="dn" x="77" y="22" width="6" height="12" /><rect class="up" x="91" y="30" width="6" height="16" />
  </svg>
  {o.label}
{/snippet}

{#snippet candleItem(o: { v: 'jp' | 'us'; label: string })}
  <svg class="cdl-pv cdl-{o.v}" width="34" height="22" viewBox="0 0 34 22" aria-hidden="true">
    <path d="M6 2v18M17 4v16M28 1v16" /><rect class="up" x="3" y="6" width="6" height="9" /><rect class="dn" x="14" y="8" width="6" height="8" /><rect class="up" x="25" y="3" width="6" height="9" />
  </svg>
  {o.label}
{/snippet}

{#snippet control(row: SettingRow)}
  {@const off = depOff(row)}
  {#if row.kind === 'seg'}
    <Seg options={[{ v: 'ja', label: '日本語' }, { v: 'en', label: 'English' }]} value={s.lang} label={t('set.lang')} onchange={(v) => saveSettings({ lang: v })} />
  {:else if row.kind === 'switch' && row.setting}
    {@const k = row.setting as 'autoUpdate'}
    {@render switchRow(row, !!s[k], () => saveSettings({ [k]: !s[k] } as Partial<S>), (row.id === 'closeToTray' && bgView.closeToTray.disabled) || off)}
    {#if row.id === 'checkUpdates'}
      <button type="button" class="btn" onclick={() => checkUpdate(true)}>{t('act.checkUpdate')}</button>
      {#if app.update}<button type="button" class="link-btn" onclick={() => window.elecxstock.openExternal(app.update!.url)}>{t('update.available', { v: app.update.version })}</button>{/if}
    {/if}
  {:else if row.kind === 'login'}
    {@render switchRow(row, bgView.login.on, () => setLogin(!bgView.login.on, !!login?.hidden), bgView.login.disabled)}
  {:else if row.kind === 'loginHidden'}
    {@render switchRow(row, bgView.hidden.on, () => setLogin(true, !bgView.hidden.on), bgView.hidden.disabled)}
  {:else if row.kind === 'theme'}
    <Seg options={[{ v: 'dark', label: t('set.dark') }, { v: 'light', label: t('set.light') }]} value={s.theme} label={t('set.theme')} variant="stack" item={themeItem} onchange={(v) => saveSettings({ theme: v })} />
  {:else if row.kind === 'scale'}
    {@const p = pend.uiScale ?? s.uiScale}
    <Stepper
      text="{Math.round(p * 100)}%"
      label={t('set.scale')}
      canDown={p > SCALES[0]}
      canUp={p < SCALES[SCALES.length - 1]!}
      pending={pend.uiScale != null}
      commitText={t('set.commit', { v: `${Math.round(p * 100)}%` })}
      downLabel={t('set.smaller')}
      upLabel={t('set.larger')}
      onstep={(d) => step('uiScale', d)}
      oncommit={() => commit('uiScale')}
    />
    <!-- 見本の文字は幅を決めておく（大きさを変えても隣の部品が動かない） -->
    <span class="sample"><span style:font-size="{Math.round(11 * p)}px">{t('set.sample')}</span></span>
  {:else if row.kind === 'density'}
    <span class="dens" aria-hidden="true">{#each [0, 1, 2] as i (i)}<i style:height="{s.density === 'compact' ? 9 : 13}px"></i>{/each}</span>
    <Seg options={[{ v: 'normal', label: t('set.normal') }, { v: 'compact', label: t('set.compact') }]} value={s.density} label={t('set.density')} onchange={(v) => saveSettings({ density: v })} />
  {:else if row.kind === 'candle'}
    <Seg options={[{ v: 'jp', label: t('set.jp') }, { v: 'us', label: t('set.us') }]} value={s.candleStyle} label={t('set.candle')} variant="card" item={candleItem} onchange={(v) => saveSettings({ candleStyle: v })} />
  {:else if row.kind === 'yield'}
    <svg class="ypv" viewBox="0 0 150 40" aria-hidden="true">
      <path class="ln" d="M2 30 L20 24 L38 27 L56 15 L74 19 L92 9 L110 14 L128 6 L148 11" />
      {#each s.yieldTargets.slice(0, YIELD_TARGETS_UI) as v, i (i)}
        <line class="yl" x1="0" x2="150" y1={18 + i * 10} y2={18 + i * 10} /><text class="yt-t" x="148" y={16 + i * 10} text-anchor="end">{v}%</text>
      {/each}
    </svg>
    <span class="yts">
      {#each yt as _, i (i)}
        <input
          class="yt num"
          type="text"
          inputmode="decimal"
          placeholder="—"
          aria-label={t('set.yieldTarget', { n: i + 1 })}
          aria-disabled={off || undefined}
          aria-describedby={off ? `dep-${row.id}` : undefined}
          readonly={off}
          tabindex={off ? -1 : 0}
          data-primary={i === 0 ? '' : undefined}
          bind:value={yt[i]}
          onchange={commitYield}
          onkeydown={(e) => {
            if (e.key === 'Enter' && !composing(e)) commitYield()
          }}
        />
      {/each}
      <span class="u">%</span>
    </span>
  {:else if row.kind === 'retention'}
    {@const p = pend.retentionYears ?? s.retentionYears}
    <Stepper
      text={t('set.years', { n: p })}
      label={t('set.retention')}
      canDown={p > 1}
      canUp={p < 10}
      pending={pend.retentionYears != null}
      danger={p < s.retentionYears}
      commitText={`${t('set.commit', { v: t('set.years', { n: p }) })}${p < s.retentionYears ? '…' : ''}`}
      downLabel={t('set.shorter')}
      upLabel={t('set.longer')}
      onstep={(d) => step('retentionYears', d)}
      oncommit={() => commit('retentionYears')}
    />
    <span class="stp-note" class:pend={pend.retentionYears != null}>
      {pend.retentionYears != null ? t('set.estimateDelta', { mb: est.mb.toLocaleString(), d: signedMb(est.deltaMb) }) : t('set.estimate', { mb: est.mb.toLocaleString() })}
    </span>
  {:else if row.kind === 'chips'}
    <span class="chips">
      {#each s.userInstruments as c (c)}
        <span class="uchip"><b>{c}</b>{nameOf(`JP:${c}`)}<button type="button" aria-label="{t('common.remove')} {c}" onclick={() => removeUser(c)}>×</button></span>
      {/each}
      <button type="button" class="btn" data-primary onclick={addUser}>＋ {t('set.addInstrument')}</button>
    </span>
  {:else if row.kind === 'tablink'}
    <button type="button" class="btn" data-primary onclick={() => selectTab(row.tab)}>{t('set.openTab')}</button>
  {:else if row.kind === 'buttons'}
    {#if row.id === 'resetAllLayouts'}
      <button type="button" class="btn" data-primary onclick={() => void doResetAllLayouts()}>{t('set.resetAllLayouts')}…</button>
    {:else if row.id === 'universe'}
      <button type="button" class="btn" data-primary onclick={() => rpc('jobs.start', { kind: 'universe' })}>{t('act.universe')}</button>
      <button type="button" class="btn" onclick={importJpx}>{t('set.importJpx')}</button>
    {:else if row.id === 'userData'}
      <button type="button" class="btn" data-primary onclick={exportUser}>{t('set.exportUser')}</button>
      <button type="button" class="btn" onclick={importUser}>{t('set.importUser')}</button>
    {:else if row.id === 'backupDb'}
      <button type="button" class="btn" data-primary onclick={() => runAction('backupDb')}>{t('act.backupDb')}</button>
    {:else if row.id === 'logs'}
      <button type="button" class="btn" data-primary onclick={() => window.elecxstock.openLogs()}>{t('act.openLogs')}</button>
      <button type="button" class="btn" onclick={() => runAction('jobs')}>{t('act.jobs')}</button>
    {:else if row.id === 'reset'}
      <button type="button" class="btn danger" data-primary onclick={reset}>{t('set.reset')}…</button>
    {:else if row.id === 'notices'}
      <button type="button" class="btn" data-primary onclick={async () => (notices = notices ? '' : (await window.elecxstock.notices()) || '—')}>{notices ? t('common.close') : t('set.showNotices')}</button>
    {/if}
  {:else if row.kind === 'info' && row.id === 'dataLabel'}
    {#if app.info?.provider === 'stub'}<span>{t('set.dataSourceStub')}</span>{:else}<span>{src.before}<button type="button" class="link-btn" onclick={() => window.elecxstock.openExternal(yahooUrl(app.settings.lang))}>{src.token}</button>{src.after}</span>{/if}
  {:else if row.kind === 'info' && row.id === 'chartsLabel'}
    <span class="notice">
      <span>{LWC_NOTICE[0]}</span>
      <span class="dim">{LWC_NOTICE_PARTS.before}<button type="button" class="link-btn" onclick={() => window.elecxstock.openExternal(TRADINGVIEW_URL)}>{LWC_NOTICE_PARTS.token}</button>{LWC_NOTICE_PARTS.after}</span>
    </span>
  {/if}
{/snippet}

{#snippet settingRow(row: SettingRow, ranges: [number, number][])}
  {@const mod = isModified(row, s)}
  {@const off = depOff(row)}
  {#if row.kind === 'stats'}
    {@const st = app.status}
    <div class="stats">
      <div><span class="k">{t('set.statDb')}</span><b class="num">{fmtMb(st?.dbBytes)} MB</b></div>
      <div><span class="k">{t('set.symbols')}</span><b class="num">{(st?.withBars ?? 0).toLocaleString()} / {(st?.instruments ?? 0).toLocaleString()}</b></div>
      <div><span class="k">{t('set.statFailures')}</span><b class="num" class:bad={(st?.failures ?? 0) > 0}>{(st?.failures ?? 0).toLocaleString()}</b></div>
      <div>
        <span class="k">{t('set.statRangeLabel')}</span><b class="num">{st?.oldestBar ?? '—'} – {st?.newestBar ?? '—'}</b>
        <span class="note">{t('set.statRangeNote', { at: dateTime(st?.lastUpdate) })} · {t('set.monthlyNote')}</span>
      </div>
    </div>
  {:else if row.kind === 'app'}
    <div class="appcard" data-row={row.id} tabindex="-1">
      <img class="logo" src={appIcon} alt="" />
      <div>
        <b>elecxstock</b>
        <span class="sub">{t('set.version')} <span class="num">{app.info?.version ?? __APP_VERSION__}</span> · <button type="button" class="link-btn" onclick={() => window.elecxstock.openExternal('https://github.com/kurouna/elecxstock')}>github.com/kurouna/elecxstock</button></span>
      </div>
      <button type="button" class="btn" data-primary onclick={() => checkUpdate(true)}>{t('act.checkUpdate')}</button>
    </div>
  {:else}
    <!-- 行そのものもフォーカスを受ける（操作の無い行・使えない行にも ↑ ↓ で止まり、理由を読める） -->
    <div class="srow" class:wide={KIND[row.kind].wide} class:dep={off} data-row={row.id} tabindex="-1" aria-label={t(row.label as Key)} aria-disabled={off || undefined} aria-describedby={off ? `dep-${row.id}` : undefined}>
      <div class="lab">
        <b>
          {#if mod}<span class="mod" aria-hidden="true"></span>{/if}
          {#if searching}<span class="crumb">{t(`set.${row.tab}` as Key)} › {t(`setsec.${row.section}` as Key)}</span>{/if}
          <Hl text={t(row.label as Key)} {ranges} />
          {#if mod && defText(row)}<span class="def">{t('set.defaultIs', { v: defText(row) })}</span>{/if}
        </b>
        {#if row.desc}<span class="d">{t(row.desc as Key)}</span>{/if}
        {#if row.id === 'loginStart' && bgView.login.note}<span class="d warn">{t(bgView.login.note === 'dev' ? 'set.loginStartDev' : 'set.loginStartDisabled')}</span>{/if}
        {#if row.dependsOn}<span class="d warn" class:hid={!off} id="dep-{row.id}">{t('set.depWarn', { name: t(rowById(row.dependsOn)!.label as Key) })}</span>{/if}
      </div>
      <div class="ctl">{@render control(row)}</div>
      <button type="button" class="rst" class:on={mod} tabindex="-1" aria-hidden={!mod || undefined} title={t('set.resetRow', { v: defText(row) })} aria-label={t('set.resetRow', { v: defText(row) })} onclick={() => resetRow(row)}>↺</button>
    </div>
  {/if}
{/snippet}

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="dialog settings" role="dialog" aria-label={t('set.title')} onkeydowncapture={dialogKey}>
  <nav class="snav">
    <h3>{t('set.title')}</h3>
    <label class="lx-search aux" title="{t('set.searchPh')} (Ctrl+F)">
      <svg class="lx-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
      <input bind:this={search} bind:value={q} placeholder={t('set.searchPh')} aria-label={t('set.searchPh')} data-esc-local={q ? '' : undefined} onkeydown={searchKey} />
      <kbd>Ctrl+F</kbd>
    </label>
    <!-- svelte-ignore a11y_interactive_supports_focus -->
    <div class="tabs" role="tablist" aria-orientation="vertical" aria-label={t('a11y.settingsTabs')} bind:this={tabsEl} onkeydown={navKey} onfocusin={() => (onTabs = true)} onfocusout={() => (onTabs = false)}>
      {#each SETTING_TABS as x (x)}
        {@const n = modifiedCount(x, s, actionIds)}
        <button type="button" role="tab" aria-selected={!searching && cur === x} aria-controls="set-body" tabindex={cur === x ? 0 : -1} title={t(`set.${x}` as Key)} onclick={() => selectTab(x)}>
          <svg class="lx-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={TAB_ICON[x]} /></svg>
          <span class="t">{t(`set.${x}` as Key)}</span>
          {#if n}<span class="n" title={t('set.tabCount')}>{n}</span>{/if}
        </button>
      {/each}
    </div>
    <div class="ver">{app.info?.version ?? __APP_VERSION__} · {t('set.saved')}</div>
  </nav>
  <div class="smain">
    <div class="shead">
      {#if searching}<h2>{t('set.searchTitle', { q: q.trim() })}</h2><span class="hsub">{t('set.searchSub')}</span>{:else}<h2>{t(`set.${cur}` as Key)}</h2><span class="hsub">{t(`set.sub.${cur}` as Key)}</span>{/if}
    </div>
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="sbody" id="set-body" role="tabpanel" tabindex="-1" bind:this={body} onkeydown={bodyKey} onfocusin={bodyFocus} data-esc-local>
      {#if !searching && cur === 'keys'}
        <KeysSettings />
      {:else if !searching && cur === 'news'}
        <NewsSettings />
      {:else}
        {#each sections as sec (sec.key)}
          {@const danger = !searching && sec.items[0]!.row.danger}
          <section class="card2" class:danger>
            <h4>{searching ? t(`set.${sec.key}` as Key) : t(`setsec.${sec.key}` as Key)}{#if danger}<span class="s">{t('set.dangerNote')}</span>{/if}</h4>
            {#each sec.items as x (x.row.id)}{@render settingRow(x.row, x.ranges)}{/each}
          </section>
        {:else}
          <div class="lx-empty">{t('set.searchNone', { q: q.trim() })}</div>
        {/each}
        {#if !searching && cur === 'about'}
          {#if notices}<pre class="notices" tabindex="-1">{notices}</pre>{/if}
          <p class="disc">{t('set.disclaimer')}</p>
        {/if}
      {/if}
    </div>
    <div class="sfoot">
      {#if onTabs}
        <span><Keys keys="↑ ↓" /> {t('set.foot.tabs')}</span><span><Keys keys="→" /> {t('set.foot.toBody')}</span><span><Keys keys="Esc" /> {t('dlg.closeKey')}</span><span class="note">{t('set.foot.countNote')}</span>
      {:else if Object.keys(pend).length}
        <span><Keys keys="← →" /> {t('set.foot.value')}</span><span><Keys keys="Enter" /> {t('set.foot.decide')}</span><span><Keys keys="Esc" /> {t('set.foot.cancel')}</span>
      {:else if !searching && cur === 'keys'}
        <span><Keys keys="↑ ↓" /> {t('set.foot.row')}</span><span><Keys keys="Enter" /> {t('keys.foot.change')}</span><span><Keys keys="Delete" /> {t('keys.foot.remove')}</span><span><Keys keys="Backspace" /> {t('set.foot.reset')}</span><span><Keys keys="/" /> {t('set.foot.search')}</span><span><Keys keys="Esc" /> {t('set.foot.toTabs')}</span>
      {:else if !searching && cur === 'news'}
        <span><Keys keys="Tab" /> {t('set.foot.move')}</span><span><Keys keys="Space" /> {t('set.foot.toggle')}</span><span><Keys keys="Esc" /> {t('set.foot.toTabs')}</span>
      {:else}
        <span><Keys keys="↑ ↓" /> {t('set.foot.row')}</span>{#if hints.toggle}<span><Keys keys="Space" /> {t('set.foot.toggle')}</span>{/if}{#if hints.value}<span><Keys keys="← →" /> {t('set.foot.value')}</span>{/if}{#if hints.reset}<span><Keys keys="Backspace" /> {t('set.foot.reset')}</span>{/if}<span><Keys keys="Esc" /> {t('set.foot.toTabs')}</span>
      {/if}
      <span class="r"><Keys keys="Ctrl+F" /> {t('set.foot.search')}</span>
    </div>
  </div>
</div>

<script lang="ts" module>
const TAB_ICON: Record<string, string> = {
  general: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1',
  display: 'M3 4h18v12H3zM8 20h8M12 16v4',
  chart: 'M4 19h16M7 15V9M12 17V6M17 13V5M5.5 9h3v5h-3zM10.5 8h3v6h-3zM15.5 7h3v4h-3z',
  data: 'M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3zM5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3',
  keys: 'M3 7h18v10H3zM7 11h.01M11 11h.01M15 11h.01M8 14h8',
  news: 'M4 5h13v14H4zM17 9h3v8a2 2 0 0 1-2 2M7 9h7M7 12.5h7M7 16h4',
  about: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 11v5M12 8v.01',
}
</script>

<style>
  .settings {
    width: 980px;
    height: 660px;
    max-height: calc(100vh - 100px);
    display: flex;
    overflow: hidden;
    border-radius: var(--radius-dlg);
    container: setdlg / inline-size;
  }
  .snav {
    position: relative;
    width: 220px;
    flex: none;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--line);
    background: var(--panel);
  }
  .snav h3 {
    margin: 0;
    padding: 12px 14px 8px;
    font-size: var(--fs-4);
  }
  .snav .lx-search {
    flex: none;
    margin: 0 10px 8px;
  }
  .snav .lx-search input {
    font-size: var(--fs-2);
  }
  .tabs {
    flex: 1;
    overflow: auto;
    padding: 2px 0;
  }
  .tabs button {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    height: 34px;
    padding: 0 14px;
    background: none;
    border: 0;
    cursor: pointer;
    color: var(--text-2);
    text-align: left;
    white-space: nowrap;
  }
  .tabs button:hover {
    background: var(--hover);
  }
  .tabs button[aria-selected='true'] {
    background: var(--select-strong);
    color: var(--text);
    box-shadow: inset var(--sel-bar) 0 0 var(--focus);
  }
  .tabs .t {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* 既定から変えた数は数字だけ（未読の通知に見えないように） */
  .tabs .n {
    margin-left: auto;
    font: var(--fs-0) var(--mono);
    color: var(--text-3);
  }
  .ver {
    padding: 10px 14px;
    border-top: 1px solid var(--line);
    color: var(--text-3);
    font-size: var(--fs-1);
  }
  .smain {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .shead {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 14px 22px 8px;
  }
  .shead h2 {
    margin: 0;
    font-size: var(--fs-4);
  }
  .hsub {
    color: var(--text-3);
    font-size: var(--fs-1);
  }
  .sbody {
    flex: 1;
    overflow: auto;
    padding: 4px 22px 22px;
    outline: none;
  }
  .sbody :global(.card2) {
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-dlg);
    background: var(--panel);
    margin-top: 14px;
    overflow: hidden;
  }
  .sbody :global(.card2 > h4) {
    margin: 0;
    padding: 9px 14px 8px;
    font-size: var(--fs-3);
    display: flex;
    align-items: baseline;
    gap: 8px;
    border-bottom: 1px solid var(--line);
    background: var(--panel-2);
  }
  .sbody :global(.card2 > h4 .s) {
    font-weight: 400;
    color: var(--text-3);
    font-size: var(--fs-1);
  }
  /* 危険な操作は --danger 系（--up は欧米式で緑になるので使わない） */
  .card2.danger {
    border-color: var(--danger-line);
  }
  .card2.danger > h4 {
    color: var(--danger);
    background: var(--danger-bg);
    border-bottom-color: var(--danger-line);
  }
  .srow {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto 26px;
    align-items: center;
    gap: 4px 16px;
    min-height: 52px;
    padding: 9px 8px 9px 16px;
    outline: none;
  }
  .srow + .srow {
    border-top: 1px solid var(--line-soft);
  }
  .srow:focus-within,
  .appcard:focus-within {
    background: var(--select);
    box-shadow: inset var(--sel-bar) 0 0 var(--focus);
  }
  .srow.wide {
    grid-template-columns: minmax(0, 1fr) 26px;
  }
  .srow.wide .ctl {
    grid-column: 1;
    grid-row: 2;
    justify-self: start;
  }
  .srow.wide .rst {
    grid-column: 2;
    grid-row: 1;
  }
  .lab {
    min-width: 0;
  }
  .lab b {
    font-weight: 500;
    display: block;
  }
  .lab .d {
    display: block;
    color: var(--text-3);
    font-size: var(--fs-1);
    margin-top: 1px;
  }
  /* 依存する行が使えないとき: 名前と説明を薄く（不透明度ではなく色で。理由の文は warn のまま） */
  .srow.dep .lab b,
  .srow.dep .lab .d:not(.warn) {
    color: var(--text-3);
  }
  .lab .d.warn {
    color: var(--warn);
  }
  /* 依存する行の注意は場所を取ったまま出し入れする（行の高さを変えない） */
  .lab .d.hid {
    visibility: hidden;
  }
  .crumb {
    display: inline-block;
    margin-right: 6px;
    font-size: var(--fs-0);
    color: var(--text-3);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-ctl);
    padding: 0 4px;
    font-weight: 400;
    vertical-align: 1px;
  }
  /* 既定から変えた印: 名前の前の点（選択行の左の線と離す）と「既定: …」 */
  .mod {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--focus);
    margin-right: 6px;
    vertical-align: 2px;
  }
  .def {
    font-weight: 400;
    color: var(--text-3);
    font-size: var(--fs-1);
    margin-left: 6px;
  }
  .rst {
    width: 24px;
    height: 24px;
    border-radius: var(--radius-ctl);
    background: none;
    border: 0;
    color: var(--text-3);
    cursor: pointer;
    font-size: var(--fs-3);
    visibility: hidden;
  }
  .rst.on {
    visibility: visible;
  }
  .rst:hover {
    background: var(--panel-3);
    color: var(--text);
  }
  .ctl {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    justify-self: end;
  }
  .stp-note {
    color: var(--text-3);
    font-size: var(--fs-1);
    min-width: 140px;
  }
  .stp-note.pend {
    color: var(--text);
  }
  /* テーマの見本: 色はトークン（app.css の --pv-dark-*・--pv-light-*） */
  .thm-pv {
    width: 112px;
    height: 64px;
    display: block;
    border-radius: var(--radius-ctl);
  }
  .pv-dark {
    --b: var(--pv-dark-bg);
    --p: var(--pv-dark-panel);
    --l: var(--pv-dark-line-strong);
    --x: var(--pv-dark-text-2);
    --s: var(--pv-dark-select-strong);
    --f: var(--pv-dark-focus);
    --u: var(--pv-dark-up);
    --d: var(--pv-dark-down);
  }
  .pv-light {
    --b: var(--pv-light-bg);
    --p: var(--pv-light-panel);
    --l: var(--pv-light-line-strong);
    --x: var(--pv-light-text-2);
    --s: var(--pv-light-select-strong);
    --f: var(--pv-light-focus);
    --u: var(--pv-light-up);
    --d: var(--pv-light-down);
  }
  .thm-pv .bg {
    fill: var(--b);
  }
  .thm-pv .pn {
    fill: var(--p);
  }
  .thm-pv .ln {
    stroke: var(--l);
  }
  .thm-pv .tx {
    fill: var(--x);
  }
  .thm-pv .sel {
    fill: var(--s);
  }
  .thm-pv .fc {
    fill: var(--f);
  }
  .thm-pv .wk {
    stroke: var(--x);
    stroke-width: 0.8;
  }
  .thm-pv .up {
    fill: var(--u);
  }
  .thm-pv .dn {
    fill: var(--d);
  }
  /* ローソク足の見本: 今のテーマの日本式・欧米式の色（--up-jp など） */
  .cdl-pv path {
    stroke: var(--text-3);
  }
  .cdl-jp .up {
    fill: var(--up-jp);
  }
  .cdl-jp .dn {
    fill: var(--down-jp);
  }
  .cdl-us .up {
    fill: var(--up-us);
  }
  .cdl-us .dn {
    fill: var(--down-us);
  }
  /* 見本の文字: 幅を決めて、大きさを変えても隣が動かない */
  .sample {
    display: inline-flex;
    align-items: center;
    width: 240px;
    height: 30px;
    overflow: hidden;
    color: var(--text-2);
    border: 1px dashed var(--line-strong);
    border-radius: var(--radius-ctl);
    padding: 0 8px;
    white-space: nowrap;
  }
  /* 行の高さの見本: 架空の文字の線を入れた 3 行 */
  .dens {
    display: grid;
    width: 120px;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-ctl);
    overflow: hidden;
    background: var(--panel);
  }
  .dens i {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 6px;
    border-top: 1px solid var(--line);
  }
  .dens i:first-child {
    border-top: 0;
  }
  .dens i::before {
    content: '';
    width: 22px;
    height: 2px;
    background: var(--text-3);
  }
  .dens i::after {
    content: '';
    flex: 1;
    height: 2px;
    background: var(--line-strong);
  }
  .ypv {
    width: 150px;
    height: 40px;
  }
  .ypv .ln {
    fill: none;
    stroke: var(--text-2);
    stroke-width: 1.4;
  }
  .ypv .yl {
    stroke: var(--yield-line);
    stroke-dasharray: 3 3;
  }
  .ypv .yt-t {
    fill: var(--yield-line);
    font-size: 8px;
  }
  .yts {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .yt {
    width: 62px;
    height: 26px;
    text-align: right;
  }
  .yt[aria-disabled='true'] {
    color: var(--text-3);
    background: var(--panel-2);
    border-color: var(--line);
  }
  .yts .u {
    color: var(--text-3);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
  }
  .uchip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 24px;
    padding: 0 4px 0 9px;
    border: 1px solid var(--line-strong);
    border-radius: 12px;
    background: var(--panel-2);
    font-size: var(--fs-1);
  }
  .uchip b {
    font-family: var(--mono);
    font-weight: 500;
  }
  .uchip button {
    background: none;
    border: 0;
    color: var(--text-3);
    cursor: pointer;
  }
  /* データの状態: 2 列 × 2 段。見出しを上に 1 行、値をその下に（4 列だと見出しが折れ、値が切れた） */
  .stats {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .stats > div {
    padding: 10px 14px;
    min-width: 0;
  }
  .stats > div:nth-child(even) {
    border-left: 1px solid var(--line-soft);
  }
  .stats > div:nth-child(n + 3) {
    border-top: 1px solid var(--line-soft);
  }
  .stats b {
    display: block;
    font-size: var(--fs-4);
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .stats b.bad {
    color: var(--warn);
  }
  .stats .k,
  .stats .note {
    display: block;
    color: var(--text-3);
    font-size: var(--fs-1);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .stats .k {
    margin-bottom: 2px;
  }
  .appcard {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    align-items: center;
    padding: 16px;
    outline: none;
  }
  .appcard .logo {
    width: 48px;
    height: 48px;
    flex: none;
  }
  .appcard b {
    font-size: var(--fs-4);
    display: block;
  }
  .appcard .sub {
    color: var(--text-3);
    font-size: var(--fs-1);
  }
  .appcard > .btn {
    margin-left: auto;
  }
  .notice {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }
  .link-btn {
    background: none;
    border: 0;
    color: var(--focus);
    cursor: pointer;
    padding: 0;
    text-align: left;
  }
  .notices {
    max-height: 240px;
    overflow: auto;
    font-family: var(--mono);
    font-size: var(--fs-1);
    white-space: pre-wrap;
    background: var(--bg);
    border: 1px solid var(--line);
    padding: var(--s-2);
    margin: var(--s-2) 0;
  }
  .disc {
    margin: 14px 2px 0;
    color: var(--text-3);
    font-size: var(--fs-1);
  }
  .sfoot {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    padding: 6px 22px;
    border-top: 1px solid var(--line);
    color: var(--text-3);
    font-size: var(--fs-1);
  }
  .sfoot .r {
    margin-left: auto;
  }
  /* 狭い窓・表示倍率 150%（1366×768 で実質 910×512。ダイアログは 878px）: 左の列をアイコンだけに、行は操作を下に、状態は 2×2 */
  @container setdlg (max-width: 900px) {
    .snav {
      width: 52px;
    }
    .snav h3,
    .ver,
    .tabs .t,
    .tabs .n,
    .snav .lx-search kbd {
      display: none;
    }
    .snav .lx-search {
      margin: 10px 8px;
      padding: 0 7px;
    }
    .snav .lx-search input {
      width: 0;
      flex: 0;
    }
    .snav .lx-search:focus-within {
      position: absolute;
      top: 0;
      left: 0;
      z-index: 3;
      width: 260px;
    }
    .snav .lx-search:focus-within input {
      width: auto;
      flex: 1;
    }
    .tabs button {
      justify-content: center;
      padding: 0;
    }
    .sbody {
      padding: 4px 12px 16px;
    }
    .srow {
      grid-template-columns: minmax(0, 1fr) 26px;
    }
    .srow .ctl {
      grid-column: 1;
      grid-row: 2;
      justify-self: start;
    }
    .srow .rst {
      grid-column: 2;
      grid-row: 1;
    }
  }
</style>
