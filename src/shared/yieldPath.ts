// 利回りの変化の内訳（docs/design-yield-breakdown.md §3。FR-I11）。純粋な関数: Core が材料（日足・月次系列・配当）を読んで呼び、
// 画面は結果から棒・一言・平面を描く。月末の終値と直近 12 か月の配当の月ごとの点、期間の始まり、内訳（ln の和）、一言の種類
import { addDays, addYears, isTradingDay } from './calendar'
import type { JstDate, YieldPoint } from './types'

export type { YieldPoint }

export interface MonthClose {
  /** 'YYYY-MM' */
  m: string
  /** その月の最後の足の日（月次系列の月は、その月の最終営業日） */
  d: JstDate
  c: number
}

const shiftMonth = (ym: string, n: number): string => {
  const t = Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1 + n
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}
/** 2 つの月（YYYY-MM）の間の月数 */
const monthsBetween = (a: string, b: string): number =>
  (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7))
const monthEnd = (ym: string): JstDate => {
  let d = addDays(`${shiftMonth(ym, 1)}-01`, -1)
  while (!isTradingDay(d)) d = addDays(d, -1)
  return d
}

/**
 * 月末の終値: 日足のある月はその月の最後の足（今月は最新の足）、日足の始まりの月より前は月次系列（日はその月の最終営業日。
 * 月次系列の日付は月の初めなので、そのまま使わない）。どちらも古い順
 */
export function monthCloses(daily: readonly { d: JstDate; c: number }[], monthly: readonly { d: string; c: number }[]): MonthClose[] {
  const first = daily[0]?.d.slice(0, 7)
  const out: MonthClose[] = []
  for (const b of monthly) {
    const m = b.d.slice(0, 7)
    if (first && m >= first) break
    if (b.c > 0) out.push({ m, d: monthEnd(m), c: b.c })
  }
  for (const b of daily) {
    if (!(b.c > 0)) continue
    const m = b.d.slice(0, 7)
    const last = out.at(-1)
    if (last?.m === m) {
      last.d = b.d
      last.c = b.c
    } else out.push({ m, d: b.d, c: b.c })
  }
  return out
}

/**
 * 月ごとの点（§3.1）。終わった月の 12 か月の配当は権利落ち日の月で数え（m の 11 か月前〜m）、最後の点（今）だけは
 * 指標の実績利回りと同じく「最新の足の日の 1 年前より後〜その日」で数える。12 か月の窓がすべて配当の記録（divFrom 以後）と株価の範囲の
 * 中にある月だけを出す（最初の足は 7 日の余裕。指標の longEnough と同じ）。最初の足の日（firstBar）は実際の足の日を渡す
 * （closes の日は月の最後の足・月次は月末に直してあるので、省くとその月を 1 か月遅く数える）。正の配当が 1 回も無ければ null
 */
export function yieldPath(
  closes: readonly MonthClose[],
  dividends: readonly { date: JstDate; amount: number }[],
  divFrom: JstDate,
  firstBar: JstDate | undefined = closes[0]?.d,
): YieldPoint[] | null {
  const divs = dividends.filter((x) => x.amount > 0)
  if (!divs.length) return null
  if (!firstBar || !closes.length) return []
  const byMonth = new Map<string, number>()
  for (const x of divs) byMonth.set(x.date.slice(0, 7), (byMonth.get(x.date.slice(0, 7)) ?? 0) + x.amount)
  const covered = (from: JstDate) => from >= divFrom && firstBar <= addDays(from, 7)
  const out: YieldPoint[] = []
  closes.forEach((c, i) => {
    let div12 = 0
    let from: JstDate
    if (i === closes.length - 1) {
      from = addYears(c.d, -1)
      for (const x of divs) if (x.date > from && x.date <= c.d) div12 += x.amount
    } else {
      from = `${shiftMonth(c.m, -11)}-01`
      for (let k = -11; k <= 0; k++) div12 += byMonth.get(shiftMonth(c.m, k)) ?? 0
    }
    if (covered(from)) out.push({ m: c.m, d: c.d, price: c.c, div12 })
  })
  return out
}

/**
 * 期間の始まり（§3.2）: 今の月の years 年前の月（'max' は最初の点）。年数は実際の長さ（四捨五入。1 年以上）。
 * 始まりより前の 11 か月に 12 か月の配当が 0 の月があれば、その最後の月の 12 か月後から（started。配当を始めた・再開した）。今の配当が 0（無配）・
 * 今の前の 11 か月に 0 の月がある（1 年以内に再開して、今の 12 か月が埋まっていない）・13 点に満たなければ null
 */
export function spanStart(path: readonly YieldPoint[], years: 5 | 'max'): { i0: number; years: number; started: boolean } | null {
  const last = path.at(-1)
  if (!last || !(last.div12 > 0)) return null
  for (let k = path.length - 2; k >= 0 && monthsBetween(path[k]!.m, last.m) <= 11; k--) if (!(path[k]!.div12 > 0)) return null
  const target = years === 'max' ? '' : shiftMonth(last.m, -years * 12)
  let i0 = path.findIndex((p) => p.m >= target)
  let started = false
  // 配当を始めた・再開した銘柄: 12 か月の配当が 0 だった最後の月の 12 か月後から（12 か月の窓が丸ごと配当のある期間に入る月。
  // 始まりの点が 0 でなくても、窓が埋まる途中なら同じ。埋まっていくだけの増配に見せない）
  for (;;) {
    let z = -1
    for (let k = i0; k >= 0 && monthsBetween(path[k]!.m, path[i0]!.m) <= 11; k--)
      if (!(path[k]!.div12 > 0)) {
        z = k
        break
      }
    if (z < 0) break
    const from = shiftMonth(path[z]!.m, 12)
    i0 = path.findIndex((q) => q.m >= from)
    started = true
    if (i0 < 0) return null
  }
  // 13 点（1 年）に満たなければ出さない
  if (i0 < 0 || path.length - 1 - i0 < 12) return null
  const months = monthsBetween(path[i0]!.m, last.m)
  return { i0, years: Math.max(1, Math.round(months / 12)), started }
}

export interface YieldBreakdown {
  /** 始まりと終わりの利回り（比率） */
  y0: number
  y1: number
  /** ln 比: 配当・株価・利回り（lY = lD − lP） */
  lD: number
  lP: number
  lY: number
  /** 増減率（比率）: exp(ln 比) − 1 */
  dD: number
  dP: number
  dY: number
  /** 利回りの差（pt） */
  pt: number
}
/** 内訳（§3.2）。どちらかの 12 か月の配当が 0 なら null */
export function yieldBreakdown(path: readonly YieldPoint[], i0: number, i1: number): YieldBreakdown | null {
  const a = path[i0]
  const b = path[i1]
  if (!a || !b || !(a.div12 > 0) || !(b.div12 > 0) || !(a.price > 0) || !(b.price > 0)) return null
  const lD = Math.log(b.div12 / a.div12)
  const lP = Math.log(b.price / a.price)
  const y0 = a.div12 / a.price
  const y1 = b.div12 / b.price
  return { y0, y1, lD, lP, lY: lD - lP, dD: Math.exp(lD) - 1, dP: Math.exp(lP) - 1, dY: Math.exp(lD - lP) - 1, pt: (y1 - y0) * 100 }
}

/** 一言の種類（§3.3）。文言は画面（i18n）が作る。by は大きかった方 */
export type YieldCaption =
  | { kind: 'flat' }
  | { kind: 'same'; dD: number; dP: number }
  | { kind: 'main'; up: boolean; by: 'div' | 'price' }
  | { kind: 'both'; up: boolean }
  | { kind: 'over'; up: boolean; by: 'div' | 'price' }
/** ±2% 未満の ln 比を「ほぼ変わらない」とみなす */
const SMALL = Math.log(1.02)
export function yieldCaption(b: YieldBreakdown): YieldCaption {
  const small = (v: number) => Math.abs(v) < SMALL
  if (small(b.lD) && small(b.lP)) return { kind: 'flat' }
  if (small(b.lY)) return { kind: 'same', dD: b.dD, dP: b.dP }
  const up = b.lY > 0
  // 利回りを押し上げた向き: 配当は増えると正、株価は下がると正
  const pd = b.lD
  const pp = -b.lP
  const a = Math.abs(pd)
  const c = Math.abs(pp)
  if (Math.sign(pd) === Math.sign(pp) || small(b.lD) || small(b.lP)) {
    if (a >= c * 1.5) return { kind: 'main', up, by: 'div' }
    if (c >= a * 1.5) return { kind: 'main', up, by: 'price' }
    return { kind: 'both', up }
  }
  return { kind: 'over', up, by: a > c ? 'div' : 'price' }
}
/** 棒の目盛り: いちばん大きい ln 比（0.15 を下限。小さな変化を大げさに描かない） */
export const barScale = (b: YieldBreakdown): number => Math.max(Math.abs(b.lD), Math.abs(b.lP), Math.abs(b.lY), 0.15)
/** 棒の長さ（全体の幅に対する %。真ん中から片側の 50% で頭打ち） */
export const barWidth = (v: number, scale: number): number => (Math.min(Math.abs(v), scale) / scale) * 50

/** 欄に出すもの（§2.1）: 出さない・今は無配の 1 行・内訳 */
export type BreakdownState =
  | { kind: 'hidden' }
  | { kind: 'none' }
  | { kind: 'ok'; i0: number; years: number; started: boolean; b: YieldBreakdown }
export function breakdownFor(path: readonly YieldPoint[] | null | undefined, years: 5 | 'max'): BreakdownState {
  if (!path || path.length < 13) return { kind: 'hidden' }
  if (!(path.at(-1)!.div12 > 0)) return path.some((p) => p.div12 > 0) ? { kind: 'none' } : { kind: 'hidden' }
  const s = spanStart(path, years)
  const b = s ? yieldBreakdown(path, s.i0, path.length - 1) : null
  return s && b ? { kind: 'ok', ...s, b } : { kind: 'hidden' }
}
/** 変化の無い内訳（無配の欄で、棒の場所を取ったまま見えなくするため） */
export const ZERO_BREAKDOWN: YieldBreakdown = { y0: 0, y1: 0, lD: 0, lP: 0, lY: 0, dD: 0, dP: 0, dY: 0, pt: 0 }
