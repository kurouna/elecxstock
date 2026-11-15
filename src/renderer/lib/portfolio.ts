// 保有の記録（§6.9, FR-H7〜H11）の画面側の操作。保有は証券会社の CSV を取り込んで作る（FR-H11）。
// CSV の読み取りと差分は Core（src/core/holdings.ts, src/core/brokers/rakuten.ts）。

import { jstNow } from '@shared/calendar'
import { DIVIDEND_TAX } from '@shared/folio'
import type { AccountType, Holding } from '@shared/types'
import { app, choiceDialog, confirmDialog, holdingDialog, loadInstruments, metric, nameOf, rpc, t, toast } from '../stores/app.svelte'
import { importedNote } from './folio'
import type { Key } from './i18n'

export const accountName = (a: AccountType) => t(`acct.${a}` as Key)

export async function loadHoldings(): Promise<void> {
  app.holdings = await rpc('portfolio.list', {})
  app.portfolioMeta = await rpc('portfolio.meta', {})
}

/** NISA の口座区分（配当・売却益が非課税） */
export const isNisa = (a: AccountType) => a.startsWith('nisa')
/** 配当にかかる税（所得税・住民税・復興特別所得税）。値は shared/folio.ts の 1 か所で持つ */
export { DIVIDEND_TAX }

export interface Valuation {
  /** 現在値: 取り込んだ日足の最新の終値。無ければ CSV の現在値 */
  close: number | null
  value: number | null
  cost: number
  pnl: number | null
  pnlPct: number | null
  /** 前日比（1 株と、保有数量ぶんの金額） */
  chgPct: number | null
  dayPnl: number | null
  /** 過去 12 か月の配当 × 数量（税引前・税引後。NISA は非課税） */
  div: number | null
  divNet: number | null
  yoc: number | null
}
/** 1 行の評価（評価額・評価損益・損益率・前日比・配当の見込み・取得単価利回り） */
export function valuation(h: Holding): Valuation {
  const m = metric(`JP:${h.code}`)
  const close = m?.close ?? h.price ?? null
  const value = close != null ? close * h.quantity : null
  const cost = h.avgCost * h.quantity
  const pnl = value != null ? value - cost : null
  const div = m?.div12 != null ? m.div12 * h.quantity : null
  return {
    close,
    value,
    cost,
    pnl,
    pnlPct: pnl != null && cost > 0 ? (pnl / cost) * 100 : null,
    chgPct: m?.chgPct ?? null,
    dayPnl: m?.chg != null ? m.chg * h.quantity : null,
    div,
    divNet: div != null ? (isNisa(h.account) ? div : div * (1 - DIVIDEND_TAX)) : null,
    yoc: m?.div12 != null && h.avgCost > 0 ? (m.div12 / h.avgCost) * 100 : null,
  }
}

/**
 * 取り込みのあと: Core が一覧に無い銘柄を利用者の銘柄として足すので、設定（追加した銘柄）・銘柄の一覧・CSV の情報を読み直す
 */
async function afterImport(): Promise<void> {
  app.portfolioMeta = await rpc('portfolio.meta', {})
  app.settings = (await rpc('user.load', {})).settings
  await loadInstruments()
}
/** 証券会社の CSV のバイト列を文字列にする。UTF-8 として読めなければ Shift_JIS（楽天証券の既定） */
export function decodeCsv(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('shift_jis').decode(bytes)
  }
}

/**
 * 楽天証券の保有商品の CSV を取り込む（FR-H11）。取り込むたびに、保有はすべて CSV の内容に置き換わる。
 * 取り込む前に差分（追加・更新・変わらない・無くなる・対象外）を見せて確認し、前の記録は元に戻せるように残す
 */
export async function importBrokerCsv(): Promise<void> {
  const bytes = await window.elecxstock.openFile('csv')
  if (!(bytes instanceof Uint8Array)) return
  const p = await rpc('portfolio.previewCsv', { text: decodeCsv(bytes) })
  const line = (h: Holding) =>
    `${h.code} ${nameOf(`JP:${h.code}`) || h.name || ''} · ${accountName(h.account)} · ${h.quantity.toLocaleString()}`
  const out = new Set(p.skipped.map((x) => x.kind || '?'))
  const items = [
    t('hold.prevAdd', { n: p.add.length }),
    ...p.add.slice(0, 6).map((h) => `＋ ${line(h)}`),
    t('hold.prevUpdate', { n: p.update.length }),
    ...p.update.slice(0, 6).map((h) => `↻ ${line(h)}`),
    t('hold.prevSame', { n: p.same.length }),
    t('hold.prevRemoved', { n: p.removed.length }),
    ...p.removed.slice(0, 6).map((h) => `− ${line(h)}`),
    ...(p.unknown.length ? [t('hold.prevUnknown', { n: p.unknown.length, codes: p.unknown.slice(0, 8).join(', ') })] : []),
    ...(p.skipped.length ? [t('hold.prevSkipped', { n: p.skipped.length, kinds: [...out].join('・') })] : []),
  ]
  // 何も無い CSV でも、今の保有が無くなる（すべて売った）ときは取り込める
  if (!p.holdings.length && !p.removed.length) {
    await confirmDialog({ title: t('hold.csvEmpty'), items, ok: t('common.close') })
    return
  }
  const r = await confirmDialog({
    title: t('hold.csvTitle', { n: p.holdings.length }),
    body: t('hold.csvBody'),
    items,
    ok: t('hold.csvDo'),
  })
  if (!r.ok) return
  app.holdings = await rpc('portfolio.applyCsv', { holdings: p.holdings, meta: p.meta })
  await afterImport()
  toast(t('hold.imported', { n: p.holdings.length }), { label: t('hold.undo'), run: () => void undoHoldingsImport() }, 10_000)
}

/** 同じ銘柄・口座区分を 1 つと数える鍵 */
const keyOf = (h: Pick<Holding, 'code' | 'account'>) => `${h.code}/${h.account}`

/**
 * 保有を足す・直す（FR-H7）。銘柄・口座区分・数量・平均取得単価をフォームで入れる。
 * 直した保有は取引の履歴（旧版の lots）を持たない。一覧に無いコードは利用者の銘柄として足してデータを取りにいく。
 * 証券会社の CSV を取り込むと、保有はまた CSV の内容に置き換わる
 */
export async function editHolding(cur?: Holding): Promise<void> {
  const h = await holdingDialog(cur)
  if (!h) return
  const { lots: _lots, price: _price, importedAt: _at, ...next } = h
  const drop = new Set([keyOf(next), ...(cur ? [keyOf(cur)] : [])])
  // 保有の銘柄は Core が取得の対象にする（一覧に無いコードだけ利用者の銘柄として足す）。名前と取得の対象を読み直す
  app.holdings = await rpc('portfolio.save', { holdings: [...app.holdings.filter((x) => !drop.has(keyOf(x))), next] })
  app.settings = (await rpc('user.load', {})).settings
  await loadInstruments()
  toast(t('hold.saved', { name: nameOf(`JP:${next.code}`) || next.code }))
}
/** 保有を外す（確認してから。取り消しから始まる） */
export async function removeHolding(h: Holding): Promise<void> {
  const r = await confirmDialog({
    title: t('hold.removeTitle', { name: `${h.code} ${nameOf(`JP:${h.code}`) || h.name || ''}`.trim(), acct: accountName(h.account) }),
    ok: t('hold.remove'),
    danger: true,
  })
  if (!r.ok) return
  app.holdings = await rpc('portfolio.save', { holdings: app.holdings.filter((x) => keyOf(x) !== keyOf(h)) })
  await loadInstruments()
}

/** 保有の JSON 書き出し（FR-H8, H10）。個人の資産情報なので、他人と共有しないことを示す */
export async function exportHoldings(): Promise<void> {
  const r = await confirmDialog({ title: t('hold.exportTitle'), body: t('hold.exportWarn'), ok: t('hold.exportDo') })
  if (!r.ok) return
  const json = await rpc('portfolio.export', {})
  if (await window.elecxstock.saveText(`elecxstock-holdings-${jstNow().date}.json`, json)) toast(t('hold.exported'))
}

/** 保有の JSON 取り込み（FR-H9）: 差分を見せて確認し、合わせ方を選ぶ。取り込む前の記録は残して元に戻せる */
export async function importHoldings(): Promise<void> {
  const text = await window.elecxstock.openFile('json')
  if (typeof text !== 'string') return
  const p = await rpc('portfolio.previewImport', { json: text })
  const line = (h: Holding) =>
    `${h.code} ${nameOf(`JP:${h.code}`) || h.name || ''} · ${accountName(h.account)} · ${h.quantity.toLocaleString()}`
  const items = [
    t('hold.prevAdd', { n: p.add.length }),
    ...p.add.slice(0, 8).map((h) => `＋ ${line(h)}`),
    t('hold.prevUpdate', { n: p.update.length }),
    ...p.update.slice(0, 8).map((h) => `↻ ${line(h)}`),
    t('hold.prevSame', { n: p.same.length }),
    ...(p.unknown.length ? [t('hold.prevUnknown', { n: p.unknown.length, codes: p.unknown.slice(0, 8).join(', ') })] : []),
    t('hold.prevRejected', { n: p.rejected.length }),
    ...(p.history?.length ? [t('hold.prevHistory', { n: p.history.length })] : []),
    ...p.rejected.slice(0, 8).map((r) => `✕ #${r.index + 1} ${r.code || '?'}: ${r.reason}`),
  ]
  const r = await confirmDialog({ title: t('hold.importTitle'), items, ok: t('hold.importNext') })
  if (!r.ok || (!p.holdings.length && !p.history?.length)) return
  const mode = await choiceDialog(t('hold.importMode'), [
    { id: 'merge', label: t('hold.merge'), hint: t('hold.mergeHint') },
    { id: 'replace', label: t('hold.replace'), hint: t('hold.replaceHint') },
  ])
  if (mode !== 'merge' && mode !== 'replace') return
  app.holdings = await rpc('portfolio.applyImport', {
    holdings: p.holdings,
    mode,
    meta: p.meta,
    ...(p.history ? { history: p.history } : {}),
  })
  await afterImport()
  // 記録だけの JSON なら、取り込んだ記録の日数を知らせる
  const note = importedNote(p.holdings.length, p.history?.length ?? 0)
  toast(t(note.key, { n: note.n }), { label: t('hold.undo'), run: () => void undoHoldingsImport() }, 10_000)
}
export async function undoHoldingsImport(): Promise<void> {
  const r = await rpc('portfolio.undoImport', {})
  if (!r) {
    toast(t('hold.nothingToUndo'))
    return
  }
  app.holdings = r
  app.portfolioMeta = await rpc('portfolio.meta', {})
  await loadInstruments()
  toast(t('hold.undone'))
}
