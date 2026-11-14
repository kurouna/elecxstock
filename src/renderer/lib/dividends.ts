// 銘柄情報の配当・分配金のグラフ（FR-I1）の計算。純粋関数（テストは tests/unit/renderer/dividends.test.ts）。
import type { Dividend, JstDate } from '@shared/types'

export interface DividendYear {
  year: number
  /** その年（暦年、権利落ち日で数える。連続増配の数え方と同じ）の合計（分割調整済み） */
  total: number
  count: number
  /** 基準日の年（年途中。前年比・減配の判定をしない） */
  partial: boolean
  /** 前年比（%）。前年が 0・年途中・最初の年は null */
  yoy: number | null
  /** 前年より減った（年途中は除く） */
  cut: boolean
}

/** 暦年ごとの合計。最初の年から基準日の年まで、配当の無い年も 0 で埋める */
export function annualDividends(divs: Dividend[], asOf: JstDate): DividendYear[] {
  const ds = divs.filter((d) => d.date <= asOf)
  if (!ds.length) return []
  const by = new Map<number, { total: number; count: number }>()
  for (const d of ds) {
    const y = Number(d.date.slice(0, 4))
    const v = by.get(y) ?? { total: 0, count: 0 }
    v.total += d.amount
    v.count++
    by.set(y, v)
  }
  const first = Math.min(...by.keys())
  const last = Number(asOf.slice(0, 4))
  const out: DividendYear[] = []
  for (let y = first; y <= last; y++) {
    const v = by.get(y) ?? { total: 0, count: 0 }
    const prev = out.at(-1)
    const partial = y === last
    const yoy = !partial && prev && prev.total > 0 ? (v.total / prev.total - 1) * 100 : null
    out.push({ year: y, total: v.total, count: v.count, partial, yoy, cut: !partial && !!prev && v.total < prev.total - 1e-9 })
  }
  return out
}

/** 回ごとの前年比: 1 年前の同じ時期（± 45 日）の回と比べる（%） */
export function eventYoy(divs: Dividend[], i: number): number | null {
  const d = divs[i]
  if (!d) return null
  const t0 = Date.parse(d.date) - 365 * 86400_000
  const prev = divs.find((x) => Math.abs(Date.parse(x.date) - t0) <= 45 * 86400_000)
  return prev?.amount ? (d.amount / prev.amount - 1) * 100 : null
}

/** グラフの幅に収まる本数（1 本 44px、5〜10 本。配当は 10 年分まで持つ） */
export function yearsThatFit(width: number): number {
  return Math.max(5, Math.min(10, Math.floor(width / 44)))
}

/**
 * 5 年の増配率（年率）: 年途中を除いた最新の年と、その 5 年前の年の合計から。どちらかが 0・年が足りなければ null。
 * 暦年の合計で比べる（連続増配の数え方と同じ）
 */
export function dividendCagr(years: DividendYear[], span = 5): number | null {
  const full = years.filter((y) => !y.partial)
  const last = full.at(-1)
  const first = full.at(-1 - span)
  if (!last || !first || !(first.total > 0) || !(last.total > 0)) return null
  return ((last.total / first.total) ** (1 / span) - 1) * 100
}

// 権利付最終日の目安は Core と共有する（src/shared/rights.ts）
export { nextRightsDates, recordDayOf } from '@shared/rights'
