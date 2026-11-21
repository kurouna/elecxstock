// 保有の記録（§6.9, FR-H5, H7〜H10）。純粋関数。保存は UserStore（holdings.json）で、市場データの DB には置かない。
import { folioPointSchema, holdingSchema, portfolioMetaSchema } from '@shared/api'
import { toJstDate } from '@shared/calendar'
import { splitFactor } from '@shared/folio'
import type { BrokerCsvPreview, FolioPoint, Holding, HoldingsImportPreview, Lot, PortfolioMeta, Split } from '@shared/types'
import { z } from 'zod'
import { parseRakutenCsv } from './brokers/rakuten'

export const HOLDINGS_FORMAT = 'elecxstock.holdings'
export const HOLDINGS_VERSION = 1

/**
 * 取引から数量と平均取得単価を出す（移動平均法、FR-H5）。
 * - 取引の後に株式分割があれば、数量 × 分割係数・単価 ÷ 分割係数で今の基準にそろえる（日足と同じ基準、FR-D2）
 * - 手数料は取得価額に含める（買いのときだけ。売りの手数料は平均取得単価を変えない）
 * - 売りは数量だけを減らし、平均取得単価は変えない。数量が 0 になったら平均取得単価も 0 に戻す
 */
export function fromLots(lots: Lot[], splits: Split[] = []): { quantity: number; avgCost: number } {
  const sorted = [...lots].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.side === 'buy' ? -1 : 1))
  let qty = 0
  let avg = 0
  for (const l of sorted) {
    const f = splits.filter((s) => s.date > l.date).reduce((p, s) => p * s.ratio, 1)
    const q = l.quantity * f
    const price = l.price / f
    if (l.side === 'buy') {
      const cost = avg * qty + q * price + (l.fee ?? 0)
      qty += q
      avg = qty > 0 ? cost / qty : 0
    } else {
      qty = Math.max(0, qty - q)
      if (qty < 1e-9) {
        qty = 0
        avg = 0
      }
    }
  }
  return { quantity: Math.round(qty * 1e6) / 1e6, avgCost: Math.round(avg * 1e4) / 1e4 }
}

/**
 * 取引があれば数量・平均取得単価を取引から計算し直す。取引が無ければ（CSV で取り込んだ保有）、取り込んだ日より後の分割で
 * 数量を掛け取得単価を割り、今の基準（日足と同じ）にそろえる。基準の日（importedAt）は最後の分割の日に寄せるので、
 * 画面から保存し直しても、資産推移の記録（posOf）でもう一度は掛けない。CSV を取り込み直すまでの保有のペインの評価を正しくする
 */
export function normalize(h: Holding, splits: Split[] = []): Holding {
  if (h.lots?.length) {
    // 取引から計算した数量は今の基準（すべての分割を掛けた後）。基準の日を最後の分割の日に寄せ、posOf が分割を二重に掛けず、
    // 分割の前の日（分割の日の場中に記録する前の取引日）では戻せるようにする。分割が無ければ基準の日は持たない
    const { importedAt: _i, ...rest } = h
    const last = splits
      .map((x) => x.date)
      .sort()
      .at(-1)
    return { ...rest, ...fromLots(h.lots, splits), ...(last ? { importedAt: `${last}T00:00:00+09:00` } : {}) }
  }
  const t = h.importedAt ? Date.parse(h.importedAt) : Number.NaN
  if (!Number.isFinite(t)) return h
  const base = toJstDate(t)
  const later = splits.filter((x) => x.date > base)
  if (!later.length) return h
  const f = splitFactor(later, base)
  const last = later
    .map((x) => x.date)
    .sort()
    .at(-1)!
  return {
    ...h,
    quantity: Math.round(h.quantity * f * 1e6) / 1e6,
    avgCost: Math.round((h.avgCost / f) * 1e4) / 1e4,
    // CSV の現在値（日足の無い銘柄の評価に使う）も今の基準に
    ...(h.price != null ? { price: Math.round((h.price / f) * 1e4) / 1e4 } : {}),
    importedAt: `${last}T00:00:00+09:00`,
  }
}

const keyOf = (h: Pick<Holding, 'code' | 'account'>) => `${h.code}/${h.account}`
/** 中身が同じかを比べる鍵（確認用の銘柄名・CSV の現在値・取り込んだ日時は比べない） */
const sig = ({ name: _n, price: _p, importedAt: _i, ...rest }: Holding) => JSON.stringify(rest)

/** 保有の JSON を書き出す（FR-H8）。市場データ（CSV の現在値 price も）は含めない。銘柄名は確認用（銘柄の一覧の名前、無ければ CSV の名前） */
export function exportHoldings(
  holdings: Holding[],
  nameOf: (code: string) => string,
  app: string,
  now = new Date(),
  meta: PortfolioMeta | null = null,
  history: FolioPoint[] = [],
): string {
  return JSON.stringify(
    {
      format: HOLDINGS_FORMAT,
      version: HOLDINGS_VERSION,
      exportedAt: now.toISOString(),
      app,
      // 最後に取り込んだ証券会社の CSV の情報（累計の実現損益・配当金）。別の PC に移しても同じ表示にする
      ...(meta ? { meta } : {}),
      holdings: holdings.map(({ price: _price, ...h }) => ({ ...h, name: nameOf(h.code) || h.name || '' })),
      // 資産推移の記録（作り直せないので、保有と一緒に別の PC へ移せるようにする。FR-PF2）
      ...(history.length ? { history } : {}),
    },
    null,
    1,
  )
}

/**
 * 保有の JSON を読み、取り込む前の確認に使う差分を作る（FR-H9）。
 * 1 件ずつ zod で検証し、不正な値は「取り込めない」に入れて残りを取り込めるようにする。
 * 銘柄の一覧に無いコード（書き出した PC で足した銘柄など）は取り込み、unknown に挙げる（取り込むときに銘柄を足す）
 */
export function previewImport(json: string, current: Holding[], known: (code: string) => boolean): HoldingsImportPreview {
  let o: unknown
  try {
    o = JSON.parse(json)
  } catch (e) {
    throw Object.assign(new Error(`JSON: ${(e as Error).message}`), { code: 'invalid-params' })
  }
  const top = z
    .object({ format: z.literal(HOLDINGS_FORMAT), version: z.number().int().min(1), holdings: z.array(z.unknown()) })
    .safeParse(o)
  if (!top.success) throw Object.assign(new Error('not an elecxstock holdings file'), { code: 'invalid-params' })
  if (top.data.version > HOLDINGS_VERSION)
    throw Object.assign(new Error(`format version ${top.data.version} is newer`), { code: 'invalid-params' })
  const cur = new Map(current.map((h) => [keyOf(h), h]))
  const m = portfolioMetaSchema.safeParse((o as { meta?: unknown }).meta)
  const out: HoldingsImportPreview = {
    add: [],
    update: [],
    same: [],
    rejected: [],
    unknown: [],
    holdings: [],
    meta: m.success ? m.data : null,
  }
  // 資産推移の記録（読めなければ取り込まない。保有の取り込みは止めない）
  const hist = z
    .array(folioPointSchema)
    .max(100_000)
    .safeParse((o as { history?: unknown }).history)
  if (hist.success && hist.data.length) out.history = hist.data as FolioPoint[]
  const seen = new Set<string>()
  top.data.holdings.forEach((raw, index) => {
    const code = String((raw as { code?: unknown })?.code ?? '').toUpperCase()
    const r = holdingSchema.safeParse({ ...(raw as object), code })
    if (!r.success) {
      out.rejected.push({ index, code, reason: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') })
      return
    }
    if (!known(r.data.code) && !out.unknown.includes(r.data.code)) out.unknown.push(r.data.code)
    const k = keyOf(r.data)
    if (seen.has(k)) {
      out.rejected.push({ index, code, reason: 'duplicate' })
      return
    }
    seen.add(k)
    const h = r.data
    out.holdings.push(h)
    const was = cur.get(k)
    if (!was) out.add.push(h)
    else if (sig(was) === sig(h)) out.same.push(h)
    else out.update.push(h)
  })
  return out
}

/** 取り込む（FR-H9）: merge は同じ銘柄・口座区分を置き換えて残りを残す。replace はすべて置き換える */
export function applyImport(current: Holding[], incoming: Holding[], mode: 'merge' | 'replace'): Holding[] {
  if (mode === 'replace') return incoming
  const map = new Map(current.map((h) => [keyOf(h), h]))
  for (const h of incoming) map.set(keyOf(h), h)
  return [...map.values()]
}

/**
 * 証券会社の CSV（楽天証券）を読み、取り込む前の確認に使う差分を作る（FR-H11）。
 * 取り込むと保有はすべて CSV の内容に置き換わるので、CSV に無い今の保有は「無くなる」に入る。
 * 同じ銘柄・口座区分が 2 行あれば、数量を足し、平均取得単価は数量で重みを付けて平均する
 */
export function previewBrokerCsv(text: string, current: Holding[], known: (code: string) => boolean, now = new Date()): BrokerCsvPreview {
  const p = parseRakutenCsv(text, now.toISOString())
  const merged = new Map<string, Holding>()
  for (const h of p.holdings) {
    const k = keyOf(h)
    const was = merged.get(k)
    if (!was) merged.set(k, h)
    else {
      const q = was.quantity + h.quantity
      merged.set(k, { ...was, quantity: q, avgCost: q > 0 ? (was.avgCost * was.quantity + h.avgCost * h.quantity) / q : 0 })
    }
  }
  const holdings = [...merged.values()]
  const cur = new Map(current.map((h) => [keyOf(h), h]))
  const out: BrokerCsvPreview = {
    add: [],
    update: [],
    same: [],
    removed: [],
    skipped: p.skipped,
    unknown: [...new Set(holdings.filter((h) => !known(h.code)).map((h) => h.code))],
    holdings,
    meta: {
      broker: 'rakuten',
      importedAt: now.toISOString(),
      realized: p.summary?.realized ?? null,
      dividends: p.summary?.dividends ?? null,
    },
  }
  for (const h of holdings) {
    const was = cur.get(keyOf(h))
    if (!was) out.add.push(h)
    else if (was.quantity === h.quantity && Math.abs(was.avgCost - h.avgCost) < 1e-6) out.same.push(h)
    else out.update.push(h)
  }
  const next = new Set(holdings.map(keyOf))
  out.removed = current.filter((h) => !next.has(keyOf(h)) && h.quantity > 0)
  return out
}
