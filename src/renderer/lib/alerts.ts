// アラートの操作（作る・直す・消す・取り消す・鳴ったときの知らせ。FR-AL2・AL5・AL7・AL8。design-alerts.md §5・§6）
import { ALERT_LIMIT, usesHoldings } from '@shared/alerts'
import type { AlertFire, AlertView, InstrumentId } from '@shared/types'
import { alertDialog, app, codeOf, inst, nameOf, rpc, screenName, t, toast } from '../stores/app.svelte'
import { condsText, fieldValueText } from './alertText'
import { openScreenAnywhere } from './screens'
import { IS_FREE } from './windowSlot'

/** アラートの一覧を読み直す（ポップアップ・チャートの点線が使う。どの窓でも） */
export async function loadAlerts(): Promise<void> {
  app.alerts = await rpc('alerts.list', {}).catch(() => app.alerts)
}

/** ポップアップを開く・閉じる（tab が無ければ、未読があれば履歴） */
export function toggleAlerts(tab?: 'alerts' | 'history'): void {
  if (app.overlay?.kind === 'alerts' && !tab) {
    app.overlay = null
    return
  }
  app.overlay = { kind: 'alerts', tab: tab ?? (app.alertsUnread > 0 ? 'history' : 'alerts') }
}

/** アラートの対象の名前（銘柄は「コード 名前」、スクリーンは「[名前]」） */
export function targetText(a: Pick<AlertView, 'target'>): string {
  if (a.target.kind === 'symbol') return `${codeOf(a.target.id)} ${nameOf(a.target.id)}`
  const id = a.target.screenId
  const s = app.screens.find((x) => x.id === id)
  return `[${s ? screenName(s) : t('al.inv.noScreen')}]`
}

/** 鳴った記録・アラートの「開く」: 銘柄は銘柄ジャンプと同じ規則で、スクリーンはスクリーナーで開く */
export function openTarget(x: { screenId?: string; instrument?: InstrumentId }, send: (id: InstrumentId) => void): void {
  if (x.screenId) openScreenAnywhere(x.screenId)
  else if (x.instrument) send(x.instrument)
}

/**
 * 作るダイアログを開いて保存する。symbol か screenId のどちらかを初めの対象にする（ダイアログで切り替えられる）。
 * back なら閉じたあとポップアップに戻る
 */
export async function createAlert(symbol: InstrumentId | null, back = false, screenId?: string): Promise<void> {
  if (app.alerts.length >= ALERT_LIMIT) {
    toast(t('al.limit'))
    if (back) app.overlay = { kind: 'alerts', tab: 'alerts' }
    return
  }
  if (!symbol && !app.screens.length) {
    toast(t('al.noSymbol'))
    if (back) app.overlay = { kind: 'alerts', tab: 'alerts' }
    return
  }
  const d = await alertDialog({
    ...(symbol ? { symbol } : {}),
    ...(screenId || !symbol ? { screenId: screenId ?? app.screens[0]?.id } : {}),
  })
  if (d) {
    const v = await rpc('alerts.save', { alert: d }).catch(() => null)
    if (v) toast(t('al.saved', { name: targetText(v) }))
    app.alertsRev++
  }
  if (back) app.overlay = { kind: 'alerts', tab: 'alerts' }
}
export async function editAlert(edit: AlertView): Promise<void> {
  const d = await alertDialog({ edit })
  if (d) {
    const v = await rpc('alerts.save', { alert: d }).catch(() => null)
    if (v) toast(t('al.updated'))
    app.alertsRev++
  }
  app.overlay = { kind: 'alerts', tab: 'alerts' }
}
export async function setAlertEnabled(id: string, enabled: boolean): Promise<void> {
  const v = await rpc('alerts.setEnabled', { id, enabled }).catch(() => null)
  if (v) toast(t(enabled ? 'al.enabled' : 'al.disabled'))
  app.alertsRev++
}

/** 直前に消したアラート（10 秒以内なら Ctrl+Z・トーストで戻す。§6.1） */
type Removed = NonNullable<Awaited<ReturnType<typeof removeCall>>>
let removed: { at: number; data: Removed } | null = null
const UNDO_MS = 10_000
const removeCall = (id: string) => rpc('alerts.remove', { id })
export async function removeAlert(id: string): Promise<void> {
  const r = await removeCall(id).catch(() => null)
  app.alertsRev++
  if (!r) return
  removed = { at: Date.now(), data: r }
  toast(t('al.removed'), { label: t('al.undo'), run: () => void undoRemoveAlert() }, UNDO_MS)
}
export const canUndoRemoveAlert = (): boolean => !!removed && Date.now() - removed.at < UNDO_MS
export async function undoRemoveAlert(): Promise<void> {
  if (!canUndoRemoveAlert()) return
  const r = removed!.data
  removed = null
  const v = await rpc('alerts.restore', { alert: r.alert, state: r.state }).catch(() => null)
  app.alertsRev++
  if (v) toast(t('al.restored'))
}

/** 鳴った記録の 1 行の文（トースト・履歴・通知） */
export function fireText(f: AlertFire): string {
  if (f.screenId) {
    const names = (f.members ?? []).slice(0, 3).map((id) => `${codeOf(id)} ${nameOf(id)}`)
    const rest = (f.members?.length ?? 0) - names.length + (f.more ?? 0)
    return `${names.join(app.settings.lang === 'ja' ? '、' : ', ')}${rest > 0 ? ` ${t('al.more', { n: rest })}` : ''}`
  }
  const c = f.conditions[0]
  return `${condsText(f.conditions)}（${c ? fieldValueText(c.field, f.values[c.field]) : '—'}）`
}
const fireTitle = (f: AlertFire) =>
  f.screenId
    ? t('al.firedScreen', {
        screen: targetText({ target: { kind: 'screen', screenId: f.screenId } }),
        n: (f.members?.length ?? 0) + (f.more ?? 0),
      })
    : `${codeOf(f.instrument)} ${nameOf(f.instrument)}`

/** Windows の通知（FR-AL5）: 画面ロック中にも見えるので、金額は出さず銘柄と条件だけ。保有の条件はそうとだけ */
function notifyBody(f: AlertFire): string {
  const prov = f.provisional ? ` ${t('al.notifyProv')}` : ''
  if (f.screenId) return `${fireText(f)}${prov}`
  if (f.conditions.some(usesHoldings)) return t('al.notifyHeld') + prov
  return `${condsText(f.conditions)}${prov}`
}

/**
 * 鳴ったときの知らせ（1 枚目だけ）: トースト 1 つと Windows の通知 1 つ（何件鳴っても 1 つにまとめる）。
 * 1 件なら押すと銘柄（スクリーンはスクリーナー）を開き、複数ならポップアップの履歴を開く
 */
export async function notifyFired(fires: AlertFire[], unread: number, send: (id: InstrumentId) => void): Promise<void> {
  app.alertsUnread = unread
  app.alertsRev++
  if (!fires.length || IS_FREE) return
  // 一覧に無い銘柄（プライム以外など）は名前を取ってから知らせる
  const missing = [...new Set(fires.flatMap((f) => [f.instrument, ...(f.members ?? [])]))].filter((id) => !inst(id))
  if (missing.length) for (const i of await rpc('instruments.get', { ids: missing }).catch(() => [])) app.instruments.set(i.id, i)
  const notify = (title: string, body: string) => {
    if (app.settings.alertNotify) void window.elecxstock.notify(title, body).catch(() => false)
  }
  if (fires.length === 1) {
    const f = fires[0]!
    toast(
      `${t('al.toast')}: ${fireTitle(f)} ${fireText(f)}`,
      {
        label: f.screenId ? t('al.openScreen') : t('al.openSymbol'),
        run: () => {
          void rpc('alerts.markRead', { ids: [f.id] }).then((n) => (app.alertsUnread = n))
          openTarget(f, send)
        },
      },
      15_000,
    )
    notify(`${t('al.toast')}: ${fireTitle(f)}`, notifyBody(f))
  } else {
    const msg = t('al.firedN', { n: fires.length })
    toast(msg, { label: t('al.openList'), run: () => toggleAlerts('history') }, 15_000)
    notify(
      `elecxstock: ${msg}`,
      fires
        .slice(0, 3)
        .map(fireTitle)
        .join(app.settings.lang === 'ja' ? '、' : ', '),
    )
  }
}
