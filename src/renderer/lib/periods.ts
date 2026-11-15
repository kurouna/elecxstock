// 表示期間（FR-G3・§6.5.4・§6.5.6）: チャートグリッド・チャート・マーケットで同じ選択肢。Alt+1〜6
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

/** Alt+1〜6 の表示期間（PERIODS の位置）。当たらなければ null。チャート・グリッド・マーケットで共通 */
export function periodOfKey(e: Pick<KeyboardEvent, 'code' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>): number | null {
  if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return null
  const m = /^Digit([1-6])$/.exec(e.code)
  return m ? Number(m[1]) - 1 : null
}

/** マーケットのタイルの既定の本数（日足は約半年・週足は約 2 年・月足は 10 年） */
const MARKET_DEFAULT: Record<Timeframe, number> = { D: 130, W: 104, M: 120 }
/** 一度に取れる本数の上限（bars.many の count） */
const MAX_BARS = 3000
/** マーケットのタイルに出す足の本数。期間を選んでいなければ時間軸ごとの既定、選べばチャートと同じ数え方（全期間は上限まで） */
export function marketBars(period: number | undefined, tf: Timeframe): number {
  return period == null ? MARKET_DEFAULT[tf] : barsForPeriod(period, tf, MAX_BARS)
}
