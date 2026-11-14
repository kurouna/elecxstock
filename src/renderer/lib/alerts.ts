// アラートの操作（作る・直す・消す・取り消す・鳴ったときの知らせ。FR-AL5・AL7・AL8。design-alerts.md §5・§6）
import type { AlertFire, AlertView, InstrumentId } from '@shared/types'
import { alertDialog, app, codeOf, inst, nameOf, rpc, t, toast } from '../stores/app.svelte'
import { condsText, fieldValueText } from './alertText'

/** ポップアップを開く・閉じる（tab が無ければ、未読があれば履歴） */
export function toggleAlerts(tab?: 'alerts' | 'history'): void {
  if (app.overlay?.kind === 'alerts' && !tab) {
    app.overlay = null
    return
  }
  app.overlay = { kind: 'alerts', tab: tab ?? (app.alertsUnread > 0 ? 'history' : 'alerts') }
}

/** 作るダイアログを開いて保存する。back なら閉じたあとポップアップに戻る */
export async function createAlert(symbol: InstrumentId | null, back = false): Promise<void> {
  if (!symbol) {
    toast(t('al.noSymbol'))
    if (back) app.overlay = { kind: 'alerts', tab: 'alerts' }
    return
  }
  const d = await alertDialog({ symbol })
  if (d) {
    const v = await rpc('alerts.save', { alert: d }).catch(() => null)
    if (v) toast(t('al.saved', { name: `${codeOf(v.target.id)} ${nameOf(v.target.id)}` }))
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
let removed: { at: number; data: NonNullable<Awaited<ReturnType<typeof removeCall>>> } | null = null
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
  await rpc('alerts.restore', { alert: r.alert, state: r.state }).catch(() => null)
  app.alertsRev++
  toast(t('al.restored'))
}

/** 鳴ったときのトースト（1 枚目だけ。1 件なら押すと銘柄を開き、複数ならポップアップの履歴を開く） */
export async function notifyFired(fires: AlertFire[], unread: number, open: (id: InstrumentId) => void): Promise<void> {
  app.alertsUnread = unread
  app.alertsRev++
  if (!fires.length) return
  if (fires.length === 1) {
    const f = fires[0]!
    // 一覧に無い銘柄（プライム以外など）は名前を取ってから知らせる
    if (!inst(f.instrument))
      for (const i of await rpc('instruments.get', { ids: [f.instrument] }).catch(() => [])) app.instruments.set(i.id, i)
    const c = f.conditions[0]
    const id = f.instrument
    toast(
      t('al.fired1', {
        code: codeOf(id),
        name: nameOf(id),
        cond: condsText(f.conditions),
        val: c ? fieldValueText(c.field, f.values[c.field]) : '—',
      }),
      {
        label: t('al.openSymbol'),
        run: () => {
          void rpc('alerts.markRead', { ids: [f.id] }).then((n) => (app.alertsUnread = n))
          open(id)
        },
      },
      15_000,
    )
  } else toast(t('al.firedN', { n: fires.length }), { label: t('al.openList'), run: () => toggleAlerts('history') }, 15_000)
}
