// 表示期間（FR-G3, C13）: チャートグリッドとチャートで同じ選択肢。Alt+1〜6
import type { Timeframe } from '@shared/types'
import type { Key } from './i18n'

export const PERIODS: { key: Key; days: number }[] = [
  { key: 'p.3m', days: 92 },
  { key: 'p.6m', days: 183 },
  { key: 'p.1y', days: 365 },
  { key: 'p.2y', days: 730 },
  { key: 'p.5y', days: 1826 },
  { key: 'p.all', days: 100000 },
]
/** 1 年あたりの足の本数（日足は営業日） */
const PER_YEAR: Record<Timeframe, number> = { D: 245, W: 52, M: 12 }
/** 少なすぎて読めない本数にしない（月足の 3 か月など） */
const MIN_BARS: Record<Timeframe, number> = { D: 20, W: 13, M: 12 }

/** 期間に入る足の本数。n は手元の本数（「全期間」はすべて） */
export function barsForPeriod(period: number, tf: Timeframe, n: number): number {
  const p = PERIODS[period]
  if (!p || p.days >= 100000) return n
  return Math.min(n, Math.max(MIN_BARS[tf], Math.round((p.days / 365) * PER_YEAR[tf])))
}
