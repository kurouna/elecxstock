// データが最新か（FR-F10）。F5 を押したとき、最新なら取得せずに「データは最新です」と知らせる。
// 最新とするのは、次のすべてが成り立つとき:
//   1. 取得の対象のすべての銘柄に日足がある（新しく足した行・取得に失敗した銘柄が無い。FR-MB3）
//   2. 最後の更新が、直近の東証の取引日の大引け（15:30）より後
//   3. 最後の更新が、直近の海外の終値の区切り（火〜土の朝 7:00。米国の大引けは日本時間の 5〜6 時）より後（FR-MB3）
import { addDays, CLOSE_MINUTES, dayOfWeek, jstNow, lastClosedSession } from './calendar'
import type { JstDate } from './types'

/** 海外の終値がそろったとみなす時刻（日本時間の 7:00。米国の大引けは冬 6:00・夏 5:00） */
export const OVERSEAS_CLOSE_MINUTES = 7 * 60

const at = (d: JstDate, minutes: number) =>
  Date.parse(`${d}T${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:00+09:00`)

/** 直近の海外の終値の区切り（米国の月〜金の取引の翌朝 = 日本の火〜土の 7:00）。海外の休日は見ない */
export function lastOverseasClose(now = Date.now()): number {
  const { date, minutes } = jstNow(now)
  let d = minutes >= OVERSEAS_CLOSE_MINUTES ? date : addDays(date, -1)
  // 日（0）・月（1）の朝は米国の取引の後ではない
  while (dayOfWeek(d) === 0 || dayOfWeek(d) === 1) d = addDays(d, -1)
  return at(d, OVERSEAS_CLOSE_MINUTES)
}

export function isUpToDate(
  lastUpdate: string | null | undefined,
  status: { instruments: number; withBars: number } | null | undefined,
  now = Date.now(),
): boolean {
  if (!lastUpdate || !status?.withBars) return false
  if (status.withBars < status.instruments) return false
  const t = Date.parse(lastUpdate)
  return t >= at(lastClosedSession(now), CLOSE_MINUTES) && t >= lastOverseasClose(now)
}
