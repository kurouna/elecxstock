// 銘柄ごとの指標の計算（FR-S10, FR-I1〜I4, FR-D9）。純粋関数。足りない期間の指標は null（欠損）にする。
import type { Dividend, InstrumentId, JstDate, MetricsRow, Quote, Split } from '@shared/types'
import { addDays, addYears, isTradingDay } from './calendar'
import type { DayBar } from './series'

export const NEED = { hi52: 245, ret1m: 21, ret3m: 63, ret1y: 245, ret3y: 735, ma25: 25, ma75: 75, rsi: 15, turnover: 20 } as const

function sma(bars: DayBar[], n: number): number | null {
  if (bars.length < n) return null
  let s = 0
  for (let i = bars.length - n; i < bars.length; i++) s += bars[i]!.c
  return s / n
}
function ret(bars: DayBar[], n: number): number | null {
  if (bars.length <= n) return null
  const a = bars[bars.length - 1 - n]!.c
  return a > 0 ? (bars.at(-1)!.c / a - 1) * 100 : null
}
export function rsi(bars: DayBar[], n = 14): number | null {
  if (bars.length < n + 1) return null
  let g = 0
  let l = 0
  const start = Math.max(1, bars.length - n * 5)
  // Wilder の平滑化（最後の 5n 本で収束させる）
  for (let i = start; i < bars.length; i++) {
    const d = bars[i]!.c - bars[i - 1]!.c
    const up = Math.max(d, 0)
    const dn = Math.max(-d, 0)
    g = (g * (n - 1) + up) / n
    l = (l * (n - 1) + dn) / n
  }
  if (l === 0) return 100
  return 100 - 100 / (1 + g / l)
}

/** 権利確定月 = 権利落ち日の翌営業日の月（FR-H3） */
export function recordMonth(exDate: JstDate): number {
  let d = addDays(exDate, 1)
  while (!isTradingDay(d)) d = addDays(d, 1)
  return Number(d.slice(5, 7))
}

export function computeMetrics(
  id: InstrumentId,
  bars: DayBar[],
  dividends: Dividend[],
  splits: Split[],
  quote: Quote | null,
  lastSession: JstDate,
): MetricsRow {
  const last = bars.at(-1)
  const prev = bars.at(-2)
  const empty: MetricsRow = {
    id,
    asOf: null,
    provisional: false,
    stale: true,
    close: null,
    chg: null,
    chgPct: null,
    yieldTrailing: null,
    div12: null,
    per: quote?.per ?? null,
    pbr: quote?.pbr ?? null,
    eps: quote?.eps ?? null,
    bps: quote?.bps ?? null,
    marketCap: quote?.marketCap ?? null,
    turnover20: null,
    hi52: null,
    lo52: null,
    fromHi52: null,
    maDev25: null,
    maDev75: null,
    ret1m: null,
    ret3m: null,
    ret1y: null,
    ret3y: null,
    rsi14: null,
    volRatio: null,
    recordMonths: [],
    gapSuspect: false,
  }
  if (!last) return empty
  const close = last.c
  const asOf = last.d
  // 実績利回り: 過去 12 か月（権利落ち日ベース）の配当合計 ÷ 終値。上場 12 か月未満は欠損（期間不足）
  const from = addYears(asOf, -1)
  const div12 = dividends.filter((d) => d.date > from && d.date <= asOf).reduce((s, d) => s + d.amount, 0)
  const longEnough = bars[0]!.d <= addDays(from, 7)
  const yieldTrailing = longEnough && close > 0 ? (div12 / close) * 100 : null
  const win = bars.slice(-NEED.hi52)
  const hi52 = bars.length >= NEED.hi52 ? Math.max(...win.map((b) => b.h)) : null
  const lo52 = bars.length >= NEED.hi52 ? Math.min(...win.map((b) => b.l)) : null
  const t20 = bars.slice(-NEED.turnover)
  const turnover20 = bars.length >= NEED.turnover ? t20.reduce((s, b) => s + b.c * b.v, 0) / NEED.turnover : null
  const vPrev = bars.slice(-NEED.turnover - 1, -1)
  const vAvg = vPrev.length === NEED.turnover ? vPrev.reduce((s, b) => s + b.v, 0) / NEED.turnover : null
  const ma25 = sma(bars, NEED.ma25)
  const ma75 = sma(bars, NEED.ma75)
  // 分割イベントのない ±50% 超のギャップ（FR-D5）
  const splitDays = new Set(splits.map((s) => s.date))
  let gapSuspect = false
  for (let i = Math.max(1, bars.length - 300); i < bars.length; i++) {
    const a = bars[i - 1]!.c
    const b = bars[i]!.c
    if (a > 0 && Math.abs(b / a - 1) > 0.5 && !splitDays.has(bars[i]!.d)) gapSuspect = true
  }
  const months = new Set<number>()
  const from2 = addYears(asOf, -2)
  for (const d of dividends) if (d.date > from2) months.add(recordMonth(d.date))
  let per = quote?.per ?? null
  if (per == null && quote?.eps && quote.eps > 0) per = close / quote.eps
  let pbr = quote?.pbr ?? null
  if (pbr == null && quote?.bps && quote.bps > 0) pbr = close / quote.bps
  return {
    ...empty,
    asOf,
    provisional: !!last.prov,
    stale: asOf < lastSession,
    close,
    chg: prev ? close - prev.c : null,
    chgPct: prev && prev.c > 0 ? (close / prev.c - 1) * 100 : null,
    yieldTrailing,
    div12,
    per,
    pbr,
    turnover20,
    hi52,
    lo52,
    fromHi52: hi52 ? (close / hi52 - 1) * 100 : null,
    maDev25: ma25 ? (close / ma25 - 1) * 100 : null,
    maDev75: ma75 ? (close / ma75 - 1) * 100 : null,
    ret1m: ret(bars, NEED.ret1m),
    ret3m: ret(bars, NEED.ret3m),
    ret1y: ret(bars, NEED.ret1y),
    ret3y: ret(bars, NEED.ret3y),
    rsi14: rsi(bars),
    volRatio: vAvg && vAvg > 0 ? last.v / vAvg : null,
    recordMonths: [...months].sort((a, b) => a - b),
    gapSuspect,
  }
}
