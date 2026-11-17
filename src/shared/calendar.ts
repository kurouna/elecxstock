// 日付・時刻・営業日（§3.4 FR-T1〜T2）。すべて日本時間の 'YYYY-MM-DD' で扱い、PC の時刻帯に依存しない。
import type { JstDate } from '@shared/types'

const JST_OFFSET_MS = 9 * 3600_000

/** 日本時間の今の日付と時刻（分） */
export function jstNow(now = Date.now()): { date: JstDate; minutes: number } {
  const d = new Date(now + JST_OFFSET_MS)
  return { date: d.toISOString().slice(0, 10), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() }
}

/** UTC の時刻（Date）を日本時間の日付にする */
export function toJstDate(t: Date | number): JstDate {
  return new Date((typeof t === 'number' ? t : t.getTime()) + JST_OFFSET_MS).toISOString().slice(0, 10)
}

export function addDays(d: JstDate, n: number): JstDate {
  const t = Date.parse(`${d}T00:00:00Z`) + n * 86400_000
  return new Date(t).toISOString().slice(0, 10)
}
export function dayOfWeek(d: JstDate): number {
  return new Date(`${d}T00:00:00Z`).getUTCDay()
}
export function addYears(d: JstDate, n: number): JstDate {
  const y = Number(d.slice(0, 4)) + n
  return `${y}${d.slice(4)}`
}

/** 日足の保存期間の始まりに足す余裕（日）。N 年ちょうどでは営業日が N 年の指標（3 年の騰落率は 736 本）に少し足りないため */
export const RETENTION_MARGIN_DAYS = 31

/** 日足の保存期間（N 年）の始まり。取得と削除の境が同じになるよう、この関数だけで決める（FR-D6） */
export function retentionStart(today: JstDate, years: number): JstDate {
  return addDays(addYears(today, -years), -RETENTION_MARGIN_DAYS)
}

const holidayCache = new Map<number, Set<JstDate>>()

/** 日本の祝日（内閣府の規則。春分・秋分は近似式）。1980〜2099 で使う */
export function japaneseHolidays(year: number): Set<JstDate> {
  const hit = holidayCache.get(year)
  if (hit) return hit
  const p = (m: number, d: number) => `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const nthMonday = (m: number, n: number) => {
    const first = dayOfWeek(p(m, 1))
    const day = 1 + ((8 - first) % 7) + (n - 1) * 7
    return p(m, day)
  }
  const base = new Set<JstDate>()
  base.add(p(1, 1))
  base.add(nthMonday(1, 2)) // 成人の日
  base.add(p(2, 11))
  if (year >= 2020) base.add(p(2, 23)) // 天皇誕生日
  const spring = Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4))
  base.add(p(3, spring))
  base.add(p(4, 29))
  base.add(p(5, 3))
  base.add(p(5, 4))
  base.add(p(5, 5))
  if (year === 2020) base.add(p(7, 23))
  else if (year === 2021) base.add(p(7, 22))
  else base.add(nthMonday(7, 3)) // 海の日
  if (year === 2020) base.add(p(7, 24))
  else if (year === 2021) base.add(p(7, 23))
  else base.add(nthMonday(10, 2)) // スポーツの日
  if (year === 2020) base.add(p(8, 10))
  else if (year === 2021) base.add(p(8, 8))
  else base.add(p(8, 11)) // 山の日
  base.add(nthMonday(9, 3)) // 敬老の日
  const autumn = Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4))
  base.add(p(9, autumn))
  base.add(p(11, 3))
  base.add(p(11, 23))
  const all = new Set(base)
  // 振替休日: 日曜の祝日の後の最初の平日（祝日でない日）
  for (const d of base) {
    if (dayOfWeek(d) === 0) {
      let n = addDays(d, 1)
      while (base.has(n)) n = addDays(n, 1)
      all.add(n)
    }
  }
  // 国民の休日: 祝日に挟まれた平日
  for (const d of base) {
    const n = addDays(d, 1)
    const n2 = addDays(d, 2)
    if (!base.has(n) && base.has(n2) && dayOfWeek(n) !== 0) all.add(n)
  }
  holidayCache.set(year, all)
  return all
}

/** 東証の休場日の補正（臨時休場など）。規則で決まらない日だけをここに足す（FR-T2） */
const EXTRA_CLOSED = new Set<JstDate>(['2019-04-30', '2019-05-01', '2019-05-02', '2019-10-22', '2020-10-01'])

export function isTradingDay(d: JstDate): boolean {
  const w = dayOfWeek(d)
  if (w === 0 || w === 6) return false
  const md = d.slice(5)
  if (md === '12-31' || md === '01-01' || md === '01-02' || md === '01-03') return false // 年末年始
  if (EXTRA_CLOSED.has(d)) return false
  return !japaneseHolidays(Number(d.slice(0, 4))).has(d)
}

export function prevTradingDay(d: JstDate): JstDate {
  let x = addDays(d, -1)
  while (!isTradingDay(x)) x = addDays(x, -1)
  return x
}

/** 大引け（15:30）を過ぎた直近の取引日。場中なら前の取引日 */
export const CLOSE_MINUTES = 15 * 60 + 30
export function lastClosedSession(now = Date.now()): JstDate {
  const { date, minutes } = jstNow(now)
  if (isTradingDay(date) && minutes >= CLOSE_MINUTES) return date
  return prevTradingDay(date)
}
export function isMarketOpen(now = Date.now()): boolean {
  const { date, minutes } = jstNow(now)
  return isTradingDay(date) && minutes >= 9 * 60 && minutes < CLOSE_MINUTES
}

/** 2 つの日付の間の取引日の数（a < b、a は含まず b は含む） */
export function tradingDaysBetween(a: JstDate, b: JstDate): number {
  let n = 0
  let x = a
  while (x < b) {
    x = addDays(x, 1)
    if (isTradingDay(x)) n++
    if (n > 4000) break
  }
  return n
}
