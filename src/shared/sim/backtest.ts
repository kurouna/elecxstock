// 配当シミュレータの過去（バックテスト。docs/design-simulator.md §5.1）。純粋関数。
// 選んだ群・1306・同業種の群が同じ関数（hold）を通る。
import { addDays, addYears, isTradingDay } from '../calendar'
import { dpsBlocks } from '../folio'
import type { Dividend, JstDate } from '../types'

/**
 * 価格の系列。daily より前の点は月次（日付は月の初日 YYYY-MM-01、終値はその月の月末の終値）、daily 以降は日足。
 * 月次の点は日足の最初の月まで持つ（その月の最初の日足より前の日は月次の値）
 */
export interface Px {
  d: JstDate[]
  c: number[]
  daily: number
}
const monthOf = (d: JstDate) => d.slice(0, 7)

export function buildPx(monthly: { d: JstDate; c: number }[], daily: { d: JstDate; c: number }[]): Px {
  const first = daily[0]?.d
  const head = monthly.filter((b) => b.c > 0 && (!first || monthOf(b.d) <= monthOf(first)))
  const tail = daily.filter((b) => b.c > 0)
  return {
    d: [...head.map((b) => `${monthOf(b.d)}-01`), ...tail.map((b) => b.d)],
    c: [...head.map((b) => b.c), ...tail.map((b) => b.c)],
    daily: head.length,
  }
}

/** d 以前の最後の点の位置（lo〜hi の中。無ければ lo − 1） */
function lastAtOrBefore(xs: JstDate[], d: JstDate, lo: number, hi: number): number {
  let a = lo
  let b = hi
  while (a < b) {
    const m = (a + b) >> 1
    if (xs[m]! <= d) a = m + 1
    else b = m
  }
  return a - 1
}

/**
 * その日の価格。日足の範囲（最初の日足以降）はその日以前の最後の終値（売買停止の日は前の終値）。
 * それより前はその月の月末の終値（無ければ前の月の終値）。記録より前は null
 */
export function priceAt(px: Px, d: JstDate): number | null {
  const n = px.d.length
  if (px.daily < n && d >= px.d[px.daily]!) return px.c[lastAtOrBefore(px.d, d, px.daily, n)]!
  const i = lastAtOrBefore(px.d, `${monthOf(d)}-01`, 0, px.daily)
  return i >= 0 ? px.c[i]! : null
}
/** 日足の範囲の外（月末の終値で計算する）日か */
const isMonthlyAt = (px: Px, d: JstDate): boolean => px.daily >= px.d.length || d < px.d[px.daily]!
/** 最後の点（今日の終値。無ければ最後の終値）。月次の点しか無ければ月の初日の日付 */
export function lastPx(px: Px): { d: JstDate; c: number } | null {
  const n = px.d.length
  return n ? { d: px.d[n - 1]!, c: px.c[n - 1]! } : null
}
/** 最初の日足の日付（無ければ null） */
export const dailyStart = (px: Px): JstDate | null => px.d[px.daily] ?? null

/** その日以前の最後の取引日（日付で基準日を指定したとき） */
export function tradingOnOrBefore(d: JstDate): JstDate {
  let x = d
  while (!isTradingDay(x)) x = addDays(x, -1)
  return x
}
/** 基準日: 今日の N 年前の同じ日以前の最後の取引日 */
export function baseDate(today: JstDate, years: number): JstDate {
  let d = addYears(today, -years)
  while (!isTradingDay(d)) d = addDays(d, -1)
  return d
}
function endOfMonth(d: JstDate): JstDate {
  const y = Number(d.slice(0, 4))
  const m = Number(d.slice(5, 7))
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${d.slice(0, 7)}-${String(last).padStart(2, '0')}`
}
/** 推移の点: 基準日・基準日より後で今日より前の月末ごと・今日 */
export function monthEnds(base: JstDate, today: JstDate): JstDate[] {
  const out = [base]
  for (let e = endOfMonth(base); e < today; e = endOfMonth(addDays(e, 1))) if (e > base) out.push(e)
  if (today > base) out.push(today)
  return out
}

export interface HoldIn {
  px: Px
  divs: Dividend[]
  base: JstDate
  amount: number
  reinvest: boolean
  /** 税引後の割合（税引前・非課税は 1） */
  net: number
  /** 積立（その日の終値で足して買う額。ends の日付に合わせる） */
  adds?: Map<JstDate, number>
}
export interface HoldOut {
  buy: number
  /** 月末の終値で買った（基準日が日足の範囲より前） */
  monthlyBuy: boolean
  shares0: number
  shares: number
  /** 受け取った配当（税引後。再投資のときは再投資の前の額） */
  received: number
  /** 権利落ちごと: net は受け取った額、extra はそのうち再投資で増えた株の分 */
  events: { d: JstDate; net: number; extra: number }[]
  /** ends の各点: v は評価額、r は受け取った配当の累計 */
  path: { v: number; r: number }[]
}

/**
 * 均等の金額で基準日に買い持ちしたときの推移（§5.1）。基準日の終値で買い、基準日より後に権利落ちした配当を受け取る。
 * 月末の終値で買ったときは、その月末より後の権利落ちから。再投資は税引後の額を権利落ち日の終値で（端株を認める）。
 * 基準日に価格が無ければ null
 */
export function hold(inp: HoldIn, ends: JstDate[]): HoldOut | null {
  const buy = priceAt(inp.px, inp.base)
  if (buy == null || !(buy > 0)) return null
  const monthlyBuy = isMonthlyAt(inp.px, inp.base)
  const from = monthlyBuy ? endOfMonth(inp.base) : inp.base
  const last = ends.at(-1) ?? inp.base
  const divs = inp.divs
    .filter((x) => x.date > from && x.date <= last && x.amount > 0)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const shares0 = inp.amount / buy
  let shares = shares0
  // 入れたお金で買った株（基準日の分と積立）。再投資で増えた株は shares − owned
  let owned = shares0
  let received = 0
  const events: HoldOut['events'] = []
  const path: HoldOut['path'] = []
  let k = 0
  for (const e of ends) {
    while (k < divs.length && divs[k]!.date <= e) {
      const x = divs[k++]!
      const net = shares * x.amount * inp.net
      events.push({ d: x.date, net, extra: (shares - owned) * x.amount * inp.net })
      received += net
      if (inp.reinvest) {
        const p = priceAt(inp.px, x.date)
        if (p && p > 0) shares += net / p
      }
    }
    const p = e < inp.base ? buy : (priceAt(inp.px, e) ?? buy)
    const add = inp.adds?.get(e) ?? 0
    if (add > 0 && p > 0) {
      shares += add / p
      owned += add / p
    }
    path.push({ v: shares * p, r: received })
  }
  return { buy, monthlyBuy, shares0, shares, received, events, path }
}
/** 今の価値: 評価額 + 受け取った配当（再投資しないとき） */
export const wealthAt = (p: { v: number; r: number }, reinvest: boolean): number => (reinvest ? p.v : p.v + p.r)

/** 最大下落率（山からの最大の下げ。0〜1） */
export function maxDrawdown(xs: number[]): number {
  let peak = 0
  let dd = 0
  for (const x of xs) {
    if (x > peak) peak = x
    else if (peak > 0) dd = Math.max(dd, 1 - x / peak)
  }
  return dd
}
/** 期間（N 年）の中で、1 株配当の年（直近 N 回の合計）が前年を下回った回数。記念配当の剥落も含む */
export function cutCount(divs: Dividend[], _base: JstDate, today: JstDate, years: number): number {
  const dps = dpsBlocks(divs, today, years + 1).dps
  let n = 0
  for (let i = 1; i < dps.length; i++) {
    const a = dps[i]
    const b = dps[i - 1]
    if (a != null && b != null && a < b - 1e-9) n++
  }
  return n
}
/** a ÷ b。b が 0 なら null（画面で NaN を出さない） */
export function ratioOrNull(a: number, b: number): number | null {
  return b === 0 || !Number.isFinite(b) ? null : a / b
}
/** 取引日（from〜to） */
export function tradingDays(from: JstDate, to: JstDate): JstDate[] {
  const out: JstDate[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) if (isTradingDay(d)) out.push(d)
  return out
}
