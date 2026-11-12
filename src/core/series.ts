// 足の計算: 週足・月足の集計（FR-D4, T3）、月次系列との継ぎ合わせ（FR-D7）、価格の調整（FR-D2, C4）。純粋関数。
import type { Adjustment, Bars, Dividend, InstrumentId, JstDate, Split, Timeframe } from '@shared/types'
import { addDays, dayOfWeek, isTradingDay } from './calendar'

export interface DayBar {
  d: JstDate
  o: number
  h: number
  l: number
  c: number
  v: number
  prov?: boolean
}

export function weekKey(d: JstDate): JstDate {
  const w = (dayOfWeek(d) + 6) % 7 // 月曜 0
  return addDays(d, -w)
}
const monthKey = (d: JstDate) => d.slice(0, 7)

/** 日足を週足・月足にまとめる。足の日付はその期間の最初の取引日（FR-T3） */
export function aggregate(days: DayBar[], tf: Timeframe): DayBar[] {
  if (tf === 'D') return days
  const key = tf === 'W' ? weekKey : monthKey
  const out: DayBar[] = []
  let k0 = ''
  for (const b of days) {
    const k = key(b.d)
    const cur = out.at(-1)
    if (!cur || k !== k0) {
      out.push({ ...b })
      k0 = k
    } else {
      cur.h = Math.max(cur.h, b.h)
      cur.l = Math.min(cur.l, b.l)
      cur.c = b.c
      cur.v += b.v
      if (b.prov) cur.prov = true
    }
  }
  return out
}

/** 期間がまだ終わっていない（今週・今月）か */
export function isForming(barDate: JstDate, tf: Timeframe, today: JstDate): boolean {
  if (tf === 'W') {
    if (weekKey(barDate) !== weekKey(today)) return false
    // 今週の残りの日に取引日があれば形成途中
    for (let d = addDays(today, 1); weekKey(d) === weekKey(today); d = addDays(d, 1)) if (isTradingDay(d)) return true
    return false
  }
  if (tf === 'M') {
    if (monthKey(barDate) !== monthKey(today)) return false
    for (let d = addDays(today, 1); monthKey(d) === monthKey(today); d = addDays(d, 1)) if (isTradingDay(d)) return true
    return false
  }
  return false
}

/** 月足: 日足の最初の月まで（その月を含む）は月次系列、それより後は日足の集計（FR-D7） */
export function mergeMonthly(monthly: DayBar[], daily: DayBar[]): { bars: DayBar[]; monthlyUntil: number } {
  const agg = aggregate(daily, 'M')
  if (!monthly.length) return { bars: agg, monthlyUntil: 0 }
  const firstDailyMonth = daily.length ? monthKey(daily[0]!.d) : '9999-99'
  const head = monthly.filter((b) => monthKey(b.d) <= firstDailyMonth)
  const tail = agg.filter((b) => monthKey(b.d) > firstDailyMonth)
  if (!tail.length && !daily.length) return { bars: head, monthlyUntil: head.length }
  return { bars: [...head, ...tail], monthlyUntil: head.length }
}

/** 分割係数: その日より後に起きた分割の比率の積（未調整に戻すときに掛ける） */
export function splitFactor(d: JstDate, splits: Split[]): number {
  let f = 1
  for (const s of splits) if (s.date > d) f *= s.ratio
  return f
}

/** 価格の調整（FR-C4）。保存値は分割調整済み。未調整は分割係数で戻し、配当込みは配当から計算する（FR-D2） */
export function adjust(days: DayBar[], adj: Adjustment, splits: Split[], dividends: Dividend[]): DayBar[] {
  if (adj === 'split') return days
  if (adj === 'unadjusted') {
    return days.map((b) => {
      const f = splitFactor(b.d, splits)
      return f === 1 ? b : { ...b, o: b.o * f, h: b.h * f, l: b.l * f, c: b.c * f, v: b.v / f }
    })
  }
  // 配当込み: 権利落ち日より前の価格に (1 − 配当 / 前日終値) を掛けていく
  const idx = new Map(days.map((b, i) => [b.d, i]))
  const factors = new Array<number>(days.length).fill(1)
  for (const dv of dividends) {
    let i = idx.get(dv.date)
    if (i == null) i = days.findIndex((b) => b.d >= dv.date)
    if (i == null || i <= 0) continue
    const prev = days[i - 1]!.c
    if (!(prev > 0)) continue
    const f = 1 - dv.amount / prev
    for (let k = 0; k < i; k++) factors[k]! *= f
  }
  return days.map((b, i) => {
    const f = factors[i]!
    return f === 1 ? b : { ...b, o: b.o * f, h: b.h * f, l: b.l * f, c: b.c * f }
  })
}

export function toBars(id: InstrumentId, tf: Timeframe, bars: DayBar[], today: JstDate, monthlyUntil = 0): Bars {
  const out: Bars = { id, tf, time: [], open: [], high: [], low: [], close: [], volume: [], provisional: [], forming: [] }
  bars.forEach((b, i) => {
    out.time.push(b.d)
    out.open.push(b.o)
    out.high.push(b.h)
    out.low.push(b.l)
    out.close.push(b.c)
    out.volume.push(b.v)
    if (b.prov) out.provisional.push(i)
    if (i === bars.length - 1 && isForming(b.d, tf, today)) out.forming.push(i)
  })
  if (monthlyUntil) out.monthlyUntil = monthlyUntil
  return out
}
