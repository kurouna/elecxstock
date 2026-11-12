// 保有の記録（§6.9, FR-H7〜H10）の画面側の操作。計算（移動平均法・分割の調整）は Core（src/core/holdings.ts）。
import { ACCOUNT_TYPES } from '@shared/api'
import type { AccountType, Holding, InstrumentId, Lot } from '@shared/types'
import { app, choiceDialog, confirmDialog, metric, nameOf, promptDialog, rpc, t, toast } from '../stores/app.svelte'
import type { Key } from './i18n'

export const accountName = (a: AccountType) => t(`acct.${a}` as Key)

export async function loadHoldings(): Promise<void> {
  app.holdings = await rpc('portfolio.list', {})
}
async function save(next: Holding[]): Promise<void> {
  app.holdings = await rpc('portfolio.save', { holdings: next })
}

/** 1 行の評価（評価額・評価損益・損益率・取得単価利回り） */
export function valuation(h: Holding): { value: number | null; pnl: number | null; pnlPct: number | null; yoc: number | null } {
  const m = metric(`JP:${h.code}`)
  const close = m?.close ?? null
  const value = close != null ? close * h.quantity : null
  const cost = h.avgCost * h.quantity
  const pnl = value != null ? value - cost : null
  return {
    value,
    pnl,
    pnlPct: pnl != null && cost > 0 ? (pnl / cost) * 100 : null,
    yoc: m?.div12 != null && h.avgCost > 0 ? (m.div12 / h.avgCost) * 100 : null,
  }
}

/** 直接入れた数量・単価は今の基準なので、その日付で取引にする（それより前の分割で調整されないように） */
const jstToday = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
const num = (s: string | null) => {
  if (s == null) return null
  const v = Number(s.replace(/[,，円¥\s]/g, ''))
  return Number.isFinite(v) && v >= 0 ? v : null
}

/**
 * 保有を足す・直す（FR-H7）。入力は「取引（買い・売り）を足す」か「数量と平均取得単価を直接入れる」のどちらでもよい。
 * id が無ければ、フォーカス中の銘柄から始める
 */
export async function editHolding(id: InstrumentId | null, cur?: Holding): Promise<void> {
  const code = cur?.code ?? (await promptDialog(t('hold.code'), id?.replace(/^\w+:/, '') ?? ''))?.toUpperCase()
  if (!code || !/^[0-9][0-9A-Z]{3,4}$/.test(code)) return
  const account = (cur?.account ??
    (await choiceDialog(
      t('hold.account'),
      ACCOUNT_TYPES.map((a) => ({ id: a, label: accountName(a) })),
    ))) as AccountType | null
  if (!account) return
  const exist = app.holdings.find((h) => h.code === code && h.account === account)
  const mode = await choiceDialog(t('hold.mode', { name: nameOf(`JP:${code}`) || code }), [
    { id: 'buy', label: t('hold.buy') },
    { id: 'sell', label: t('hold.sell'), hint: exist ? '' : t('hold.noPosition') },
    { id: 'direct', label: t('hold.direct'), hint: t('hold.directHint') },
  ])
  if (!mode) return
  let next: Holding
  if (mode === 'direct') {
    const q = num(await promptDialog(t('hold.qty'), String(exist?.quantity ?? '')))
    if (q == null) return
    const p = num(await promptDialog(t('hold.avg'), String(exist?.avgCost ?? metric(`JP:${code}`)?.close ?? '')))
    if (p == null) return
    // 直接入れたら、取引の履歴は持たない（数量と単価がその値になる）
    next = { ...(exist ?? {}), code, account, quantity: q, avgCost: p }
    delete next.lots
  } else {
    if (mode === 'sell' && !exist) {
      toast(t('hold.noPosition'))
      return
    }
    const date = await promptDialog(t('hold.date'), jstToday())
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return
    const q = num(await promptDialog(t('hold.qty'), ''))
    if (!q) return
    const p = num(await promptDialog(t('hold.price'), String(metric(`JP:${code}`)?.close ?? '')))
    if (p == null) return
    const fee = num(await promptDialog(t('hold.fee'), '0')) ?? 0
    const lot: Lot = { date, side: mode as 'buy' | 'sell', quantity: q, price: p, ...(fee ? { fee } : {}) }
    // 直接入れた保有に取引を足すときは、今の数量・単価を最初の取引として残す
    const base: Lot[] =
      exist?.lots ??
      (exist && exist.quantity > 0 ? [{ date: jstToday(), side: 'buy', quantity: exist.quantity, price: exist.avgCost }] : [])
    next = { ...(exist ?? { code, account, quantity: 0, avgCost: 0 }), lots: [...base, lot] }
  }
  const rest = app.holdings.filter((h) => !(h.code === code && h.account === account))
  await save([...rest, next])
  toast(t('hold.saved', { name: nameOf(`JP:${code}`) || code }))
}

export async function removeHolding(h: Holding): Promise<void> {
  const r = await confirmDialog({
    title: t('hold.removeTitle', { name: nameOf(`JP:${h.code}`) || h.code, acct: accountName(h.account) }),
    ok: t('hold.remove'),
    danger: true,
  })
  if (!r.ok) return
  await save(app.holdings.filter((x) => x !== h && !(x.code === h.code && x.account === h.account)))
}

/** 保有の JSON 書き出し（FR-H8, H10）。個人の資産情報なので、他人と共有しないことを示す */
export async function exportHoldings(): Promise<void> {
  const r = await confirmDialog({ title: t('hold.exportTitle'), body: t('hold.exportWarn'), ok: t('hold.exportDo') })
  if (!r.ok) return
  const json = await rpc('portfolio.export', {})
  if (await window.elecxstock.saveText(`elecxstock-holdings-${new Date().toISOString().slice(0, 10)}.json`, json)) toast(t('hold.exported'))
}

/** 保有の JSON 取り込み（FR-H9）: 差分を見せて確認し、合わせ方を選ぶ。取り込む前の記録は残して元に戻せる */
export async function importHoldings(): Promise<void> {
  const text = await window.elecxstock.openFile('json')
  if (typeof text !== 'string') return
  const p = await rpc('portfolio.previewImport', { json: text })
  const line = (h: Holding) => `${h.code} ${nameOf(`JP:${h.code}`)} · ${accountName(h.account)} · ${h.quantity.toLocaleString()}`
  const items = [
    t('hold.prevAdd', { n: p.add.length }),
    ...p.add.slice(0, 8).map((h) => `＋ ${line(h)}`),
    t('hold.prevUpdate', { n: p.update.length }),
    ...p.update.slice(0, 8).map((h) => `↻ ${line(h)}`),
    t('hold.prevSame', { n: p.same.length }),
    t('hold.prevRejected', { n: p.rejected.length }),
    ...p.rejected
      .slice(0, 8)
      .map((r) => `✕ #${r.index + 1} ${r.code || '?'}: ${r.reason === 'unknown-code' ? t('hold.unknownCode') : r.reason}`),
  ]
  const r = await confirmDialog({ title: t('hold.importTitle'), items, ok: t('hold.importNext') })
  if (!r.ok || !p.holdings.length) return
  const mode = await choiceDialog(t('hold.importMode'), [
    { id: 'merge', label: t('hold.merge'), hint: t('hold.mergeHint') },
    { id: 'replace', label: t('hold.replace'), hint: t('hold.replaceHint') },
  ])
  if (mode !== 'merge' && mode !== 'replace') return
  app.holdings = await rpc('portfolio.applyImport', { holdings: p.holdings, mode })
  toast(t('hold.imported', { n: p.holdings.length }), { label: t('hold.undo'), run: () => void undoHoldingsImport() }, 10_000)
}
export async function undoHoldingsImport(): Promise<void> {
  const r = await rpc('portfolio.undoImport', {})
  if (!r) {
    toast(t('hold.nothingToUndo'))
    return
  }
  app.holdings = r
  toast(t('hold.undone'))
}
