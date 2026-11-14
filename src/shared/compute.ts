// 実行時に計算する指標（登録表の source.kind === 'compute'。FR-FD3）。保有・予定までの日数は metrics 表に持たない
// （利用者のデータを変えたらすぐ反映し、日付から数える日数は更新しない日に古くならないように）。
// Core（スクリーナーの判定）と renderer（結果表の列）の両方が使う純粋な関数
import { jstNow } from './calendar'
import { epochDay, nextRightsDates } from './rights'
import type { Instrument, InstrumentId, JstDate, MetricsRow } from './types'

/** 銘柄ごとの数量と取得価額の合計（口座区分をまたぐ） */
export type Held = Map<InstrumentId, { qty: number; cost: number }>

/** 保有の評価額（最新の終値 × 数量）の合計と、銘柄ごと・業種ごと */
export interface HeldStats {
  total: number
  value: Map<InstrumentId, number>
  bySector: Map<string, number>
}

export interface ComputeContext {
  holdings?: Held | undefined
  /** 保有割合の分母など（heldStats で 1 回だけ作る） */
  held?: HeldStats | undefined
  /** 今日（既定は日本時間の今日） */
  today?: JstDate | undefined
}

/** 実行時に計算する指標のキー */
export const COMPUTE_KEYS = new Set(['pnlPct', 'earningsDays', 'rightsDays', 'weight', 'sectorWeight', 'yoc'])

/** 業種のまとまり（J-REIT はまとめて 1 つ。銘柄情報の業種の中央値と同じ） */
export const sectorOf = (i: Pick<Instrument, 'kind' | 'sectorJa'>) => (i.kind === 'reit' ? 'REIT' : i.sectorJa)

export function heldStats(
  holdings: Held | undefined,
  metric: (id: InstrumentId) => Pick<MetricsRow, 'close'> | undefined,
  instrument: (id: InstrumentId) => Pick<Instrument, 'kind' | 'sectorJa'> | undefined,
): HeldStats {
  const value = new Map<InstrumentId, number>()
  const bySector = new Map<string, number>()
  let total = 0
  for (const [id, h] of holdings ?? []) {
    const c = metric(id)?.close
    if (c == null || !(h.qty > 0)) continue
    const v = c * h.qty
    value.set(id, v)
    total += v
    const ins = instrument(id)
    if (ins) bySector.set(sectorOf(ins), (bySector.get(sectorOf(ins)) ?? 0) + v)
  }
  return { total, value, bySector }
}

/**
 * 次の権利付最終日（日付の数）。保存した日付が過ぎていたら（権利落ち日から次の更新まで）、権利確定月と確定日の日から
 * 今日以降の次を出す
 */
function nextRightsDay(m: MetricsRow, today: JstDate): number | null {
  const t = epochDay(today)
  if (m.rightsDay != null && m.rightsDay >= t) return m.rightsDay
  if (!m.recordMonths?.length || m.recordDay == null) return null
  const r = nextRightsDates(m.recordMonths, today, 1, m.recordDay === 0 ? 'end' : m.recordDay)[0]
  return r ? epochDay(r.lastCum) : null
}

/** 実行時に計算する指標の値。欠損は null（FR-SC8） */
export function computeValue(
  key: string,
  ins: Pick<Instrument, 'id' | 'kind' | 'sectorJa'>,
  m: MetricsRow,
  ctx: ComputeContext,
): number | null {
  const h = ctx.holdings?.get(ins.id)
  switch (key) {
    case 'pnlPct':
      // 保有の評価損益率: 持っていない銘柄・終値の無い銘柄は欠損
      return h && h.cost > 0 && m.close != null ? ((m.close * h.qty) / h.cost - 1) * 100 : null
    case 'earningsDays':
    case 'rightsDays': {
      // 日付から今日までの暦日数。過ぎた決算発表の日は欠損（次の予定は気配の更新で入る）
      const today = ctx.today ?? jstNow().date
      const day = key === 'earningsDays' ? m.earningsDay : nextRightsDay(m, today)
      if (day == null) return null
      const d = day - epochDay(today)
      return d >= 0 ? d : null
    }
    case 'weight': {
      // 保有割合: 保有していない銘柄は 0%（保有の記録が無ければ欠損）
      const s = ctx.held
      if (!s || !(s.total > 0)) return null
      return ((s.value.get(ins.id) ?? 0) / s.total) * 100
    }
    case 'sectorWeight': {
      const s = ctx.held
      if (!s || !(s.total > 0)) return null
      return ((s.bySector.get(sectorOf(ins)) ?? 0) / s.total) * 100
    }
    case 'yoc':
      // 取得利回り: 過去 12 か月の配当 ÷ 平均取得単価。保有していない銘柄は欠損
      return h && h.qty > 0 && h.cost > 0 && m.div12 != null ? (m.div12 / (h.cost / h.qty)) * 100 : null
  }
  return null
}
