// 権利付最終日と権利落ち日の目安（FR-I8）。Core（スクリーナーの「権利付最終日まで」）と銘柄情報が使う純粋な関数。
// 権利確定日は過去の権利落ち日から推定する: 権利落ち日の翌営業日が権利確定日（受け渡しが 2 営業日後のため）。
// その日が月の最後の営業日なら「月末」、そうでなければその日付（20 日決算など）
import { addDays, isTradingDay, prevTradingDay } from './calendar'
import type { Dividend, JstDate } from './types'

/** 権利確定日の日: 'end' は月末、数は日付。配当の記録が無ければ 'end' */
export type RecordDay = 'end' | number

const nextTrading = (d: JstDate): JstDate => {
  let x = addDays(d, 1)
  while (!isTradingDay(x)) x = addDays(x, 1)
  return x
}
const monthEnd = (y: number, m: number): JstDate => new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)

/** いちばん新しい権利落ち日から、権利確定日の日を推定する */
export function recordDayOf(dividends: Dividend[]): RecordDay {
  let last: JstDate | null = null
  for (const d of dividends) if (!last || d.date > last) last = d.date
  if (!last) return 'end'
  const record = nextTrading(last)
  const y = Number(record.slice(0, 4))
  const m = Number(record.slice(5, 7))
  const end = monthEnd(y, m)
  const lastTrading = isTradingDay(end) ? end : prevTradingDay(end)
  return record === lastTrading ? 'end' : Number(record.slice(8, 10))
}

/**
 * 今日以降の権利付最終日と権利落ち日を、近い順に count 件。権利確定日が休場日なら前の営業日から数え、
 * 権利付最終日はその 2 営業日前、権利落ち日はその次の営業日
 */
export function nextRightsDates(
  months: number[],
  today: JstDate,
  count = 2,
  day: RecordDay = 'end',
): { month: number; lastCum: JstDate; ex: JstDate }[] {
  if (!months.length) return []
  const out: { month: number; lastCum: JstDate; ex: JstDate }[] = []
  let y = Number(today.slice(0, 4))
  let m = Number(today.slice(5, 7))
  for (let k = 0; k < 24 && out.length < count; k++) {
    if (months.includes(m)) {
      const end = monthEnd(y, m)
      const target = day === 'end' ? end : `${end.slice(0, 8)}${String(Math.min(day, Number(end.slice(8, 10)))).padStart(2, '0')}`
      const record = isTradingDay(target) ? target : prevTradingDay(target)
      const lastCum = prevTradingDay(prevTradingDay(record))
      if (lastCum >= today) out.push({ month: m, lastCum, ex: nextTrading(lastCum) })
    }
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return out
}

/** 1970-01-01 からの日数（metrics に日付を数で持つ。スクリーナーが今日との差を出す） */
export const epochDay = (d: JstDate): number => Math.round(Date.parse(`${d}T00:00:00Z`) / 86400000)
