// 銘柄ごとの指標の計算（FR-S10, FR-I1〜I4, FR-D9）。純粋関数。足りない期間の指標は null（欠損）にする。
import { isExternal, isStale } from '@shared/markets'
import { epochDay, nextRightsDates, recordDayOf } from '@shared/rights'
import type { Dividend, InstrumentId, InstrumentKind, JstDate, MetricsRow, Quote, Split } from '@shared/types'
import { addDays, addYears, isTradingDay } from './calendar'
import type { DayBar } from './series'

/** 指標の計算に要る直近の日足の本数（いちばん長い 3 年騰落率 735 本 + 余裕）。これより古い足は読まない */
export const METRIC_BARS = 800
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
  /** 最初の日足の日付。bars が直近だけのとき（METRIC_BARS 本）に、全期間の始まりを渡す */
  firstBar: JstDate | undefined = bars[0]?.d,
  /** 種別（最低投資金額・ROE）と日経平均の終値（日付 → 終値。ベータ） */
  opt: { kind?: InstrumentKind; index?: Map<JstDate, number> } = {},
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
    ma25: null,
    ma75: null,
    ma200: null,
    payout: null,
    divUpYears: null,
    divNoCutYears: null,
    gcDays: null,
    dcDays: null,
    yield2p: null,
    roe: null,
    divYoy: null,
    divCagr5: null,
    minInvest: null,
    fromLo52: null,
    ytdFromHi: null,
    ytdFromLo: null,
    maDev200: null,
    vol60: null,
    beta1y: null,
    mdd3y: null,
    ret6m: null,
    retYtd: null,
    tr1y: null,
    tr3y: null,
    turnover: null,
    newHi52: null,
    newLo52: null,
    earningsDay: null,
    rightsDay: null,
    recordDay: null,
    recordMonths: [],
    gapSuspect: false,
    anomaly: false,
  }
  if (!last) return empty
  const close = last.c
  const asOf = last.d
  // 実績利回り: 過去 12 か月（権利落ち日ベース）の配当合計 ÷ 終値。上場 12 か月未満は欠損（期間不足）
  const from = addYears(asOf, -1)
  const div12 = dividends.filter((d) => d.date > from && d.date <= asOf).reduce((s, d) => s + d.amount, 0)
  const longEnough = (firstBar ?? bars[0]!.d) <= addDays(from, 7)
  const yieldTrailing = longEnough && close > 0 ? (div12 / close) * 100 : null
  const win = bars.slice(-NEED.hi52)
  const hi52 = bars.length >= NEED.hi52 ? Math.max(...win.map((b) => b.h)) : null
  // 52 週の新高値・新安値（FR-BR5）: 最新の足の高値・安値が、その前の 52 週（NEED.hi52 本）を上回る・下回るか
  const before = bars.length > NEED.hi52 ? bars.slice(-NEED.hi52 - 1, -1) : null
  const newHi52 = before ? (last.h > Math.max(...before.map((b) => b.h)) ? 1 : 0) : null
  const newLo52 = before ? (last.l < Math.min(...before.map((b) => b.l)) ? 1 : 0) : null
  const lo52 = bars.length >= NEED.hi52 ? Math.min(...win.map((b) => b.l)) : null
  const t20 = bars.slice(-NEED.turnover)
  const turnover20 = bars.length >= NEED.turnover ? t20.reduce((s, b) => s + b.c * b.v, 0) / NEED.turnover : null
  const vPrev = bars.slice(-NEED.turnover - 1, -1)
  const vAvg = vPrev.length === NEED.turnover ? vPrev.reduce((s, b) => s + b.v, 0) / NEED.turnover : null
  const ma25 = sma(bars, NEED.ma25)
  const ma75 = sma(bars, NEED.ma75)
  const ma200 = sma(bars, 200)
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
    stale: isStale(id, asOf, lastSession),
    close,
    chg: prev ? close - prev.c : null,
    chgPct: prev && prev.c > 0 ? (close / prev.c - 1) * 100 : null,
    yieldTrailing,
    div12,
    per,
    pbr,
    turnover20,
    turnover: last.v > 0 ? close * last.v : null,
    newHi52,
    newLo52,
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
    ma25,
    ma75,
    ma200,
    payout: div12 > 0 && quote?.eps && quote.eps > 0 ? (div12 / quote.eps) * 100 : null,
    ...divYears(dividends, asOf, firstBar ?? bars[0]!.d),
    ...crossDays(bars),
    yield2p: yieldTwoPeriods(dividends, asOf, close),
    ...moreMetrics(bars, dividends, asOf, firstBar ?? bars[0]!.d, quote, opt, { lo: lo52, ma200, months }),
    recordMonths: [...months].sort((a, b) => a - b),
    gapSuspect,
    anomaly: anomalous(bars, isExternal(id)),
  }
}

/**
 * 異常値（FR-D5 の残り）: 高値 < 安値、終値 0 以下、終値が高値・安値の外、出来高が負（直近 300 本）。
 * 海外の行（external。為替・暗号資産・海外の指数など、FR-MB3）は、終値 0 以下と出来高が負だけを見る。Yahoo の 24 時間の市場の日足は、
 * 終値と高値・安値の区切りが違い、終値が高値・安値の外（為替で数銭）や高値 < 安値（暗号資産）になることがあり、取り直しても直らないため
 */
export function anomalous(bars: DayBar[], external = false): boolean {
  for (let i = Math.max(0, bars.length - 300); i < bars.length; i++) {
    const b = bars[i]!
    if (!(b.c > 0) || b.v < 0) return true
    if (external) continue
    const eps = Math.max(1e-9, b.c * 1e-6)
    if (b.h + eps < b.l || b.c > b.h + eps || b.c < b.l - eps) return true
  }
  return false
}

/** 連続増配・非減配の年数。暦年（権利落ち日）ごとの合計で比べ、保存期間の範囲内で数える */
export function divYears(
  dividends: Dividend[],
  asOf: JstDate,
  firstBar: JstDate,
): { divUpYears: number | null; divNoCutYears: number | null } {
  const { total, first } = annualTotals(dividends, firstBar)
  const last = Number(asOf.slice(0, 4)) - 1 // 終わった年まで
  if (last - first < 1) return { divUpYears: null, divNoCutYears: null }
  const count = (ok: (a: number, b: number) => boolean) => {
    let n = 0
    for (let y = last; y > first; y--) {
      const a = total.get(y) ?? 0
      const b = total.get(y - 1) ?? 0
      if (a > 0 && b > 0 && ok(a, b)) n++
      else break
    }
    return n
  }
  return { divUpYears: count((a, b) => a > b * 1.0005), divNoCutYears: count((a, b) => a >= b * 0.9995) }
}

/** 25 日線と 75 日線のゴールデンクロス・デッドクロスからの取引日数。直近 245 本に無ければ欠損 */
export function crossDays(bars: DayBar[]): { gcDays: number | null; dcDays: number | null } {
  const n = bars.length
  if (n < 76) return { gcDays: null, dcDays: null }
  const from = Math.max(75, n - 245)
  const ma = (end: number, k: number) => {
    let s = 0
    for (let i = end - k + 1; i <= end; i++) s += bars[i]!.c
    return s / k
  }
  let gc: number | null = null
  let dc: number | null = null
  let prev = ma(from - 1, 25) - ma(from - 1, 75)
  for (let i = from; i < n; i++) {
    const cur = ma(i, 25) - ma(i, 75)
    if (prev <= 0 && cur > 0) gc = n - 1 - i
    if (prev >= 0 && cur < 0) dc = n - 1 - i
    prev = cur
  }
  return { gcDays: gc, dcDays: dc }
}

/** 直近の決算期 2 回分を年換算した利回り（FR-I3）。決算期の変更で 12 か月に分配が 1 回・3 回入る J-REIT 向け */
export function yieldTwoPeriods(dividends: Dividend[], asOf: JstDate, close: number): number | null {
  const ds = dividends.filter((d) => d.date <= asOf)
  const a = ds.at(-1)
  const b = ds.at(-2)
  if (!a || !b || !(close > 0) || a.date < addDays(asOf, -400)) return null
  const months = (Number(a.date.slice(0, 4)) - Number(b.date.slice(0, 4))) * 12 + Number(a.date.slice(5, 7)) - Number(b.date.slice(5, 7))
  if (months < 2 || months > 7) return null
  return (((a.amount + b.amount) * 12) / (2 * months) / close) * 100
}

// ---------------------------------------------------------------- 条件を選ぶダイアログの見直しで足した指標（P3）

/** 配当込みの値（チャートの「配当込み」と同じく、権利落ち日に (1 − 配当 ÷ 前日終値) で落ちた分を戻す）。古い順の倍率を掛けた終値 */
export function totalReturnSeries(bars: DayBar[], dividends: Dividend[]): Float64Array {
  const out = new Float64Array(bars.length)
  const divs = [...dividends].sort((a, b) => (a.date < b.date ? -1 : 1))
  let di = 0
  while (di < divs.length && bars[0] && divs[di]!.date <= bars[0].d) di++
  let g = 1
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]!
    while (di < divs.length && divs[di]!.date <= b.d) {
      const p = i > 0 ? bars[i - 1]!.c : 0
      if (p > 0 && divs[di]!.amount > 0 && divs[di]!.amount < p) g /= 1 - divs[di]!.amount / p
      di++
    }
    out[i] = b.c * g
  }
  return out
}

/**
 * 暦年（権利落ち日）ごとの配当合計と、1 年分そろっている最初の年。記録の始まりは日足の最初の日か、それより前からある
 * 配当の記録（月次の系列で 10 年分入る）の古いほう。日足だけで数えると保存期間（既定 5 年）で頭打ちになり、銘柄情報と食い違う
 */
export function annualTotals(dividends: Dividend[], firstBar: JstDate): { total: Map<number, number>; first: number } {
  const total = new Map<number, number>()
  let start = firstBar
  for (const d of dividends) {
    total.set(Number(d.date.slice(0, 4)), (total.get(Number(d.date.slice(0, 4))) ?? 0) + d.amount)
    if (d.date < start) start = d.date
  }
  return { total, first: Number(start.slice(0, 4)) + (start.slice(5) <= '01-10' ? 0 : 1) }
}

/** ボラティリティ（年率）: 直近 n 本の日々の騰落率の標準偏差 × √245。n + 1 本未満は欠損 */
export function volatility(bars: DayBar[], n = 60): number | null {
  if (bars.length < n + 1) return null
  const r: number[] = []
  for (let i = bars.length - n; i < bars.length; i++) {
    const a = bars[i - 1]!.c
    if (!(a > 0)) return null
    r.push(bars[i]!.c / a - 1)
  }
  const mean = r.reduce((x, y) => x + y, 0) / n
  const v = r.reduce((x, y) => x + (y - mean) ** 2, 0) / (n - 1)
  return Math.sqrt(v) * Math.sqrt(245) * 100
}

/** ベータ: 直近 1 年（245 本）の日次の騰落率を、日経平均と日付で突き合わせる（売買停止・新規上場でずれない）。120 組未満は欠損 */
export function beta(bars: DayBar[], index: Map<JstDate, number> | undefined): number | null {
  if (!index?.size) return null
  const xs: number[] = []
  const ys: number[] = []
  for (let i = Math.max(1, bars.length - 245); i < bars.length; i++) {
    const a = bars[i - 1]!
    const b = bars[i]!
    const ia = index.get(a.d)
    const ib = index.get(b.d)
    if (!(a.c > 0) || !ia || !ib) continue
    xs.push(ib / ia - 1)
    ys.push(b.c / a.c - 1)
  }
  if (xs.length < 120) return null
  const mx = xs.reduce((p, q) => p + q, 0) / xs.length
  const my = ys.reduce((p, q) => p + q, 0) / ys.length
  let cov = 0
  let vx = 0
  for (let i = 0; i < xs.length; i++) {
    cov += (xs[i]! - mx) * (ys[i]! - my)
    vx += (xs[i]! - mx) ** 2
  }
  return vx > 0 ? cov / vx : null
}

function moreMetrics(
  bars: DayBar[],
  dividends: Dividend[],
  asOf: JstDate,
  firstBar: JstDate,
  quote: Quote | null,
  opt: { kind?: InstrumentKind; index?: Map<JstDate, number> },
  base: { lo: number | null; ma200: number | null; months: Set<number> },
): Partial<MetricsRow> {
  const last = bars.at(-1)!
  const close = last.c
  const n = bars.length
  // ROE: 株式だけ。EPS・BPS が 0 以下なら欠損
  const eps = quote?.eps ?? null
  const bps = quote?.bps ?? null
  const roe = opt.kind === 'stock' && eps != null && bps != null && eps > 0 && bps > 0 ? (eps / bps) * 100 : null
  // 配当の前年比・5 年の年率（年途中を除いた最新の年から）
  const { total, first } = annualTotals(dividends, firstBar)
  const ly = Number(asOf.slice(0, 4)) - 1
  const at = (y: number) => (y >= first ? (total.get(y) ?? 0) : null)
  const a0 = at(ly)
  const a1 = at(ly - 1)
  const a5 = at(ly - 5)
  // 無配に転じた年は −100%（減配の条件から漏らさない）
  const divYoy = a0 != null && a1 != null && a0 >= 0 && a1 > 0 ? (a0 / a1 - 1) * 100 : null
  const divCagr5 = a0 != null && a5 != null && a0 > 0 && a5 > 0 ? ((a0 / a5) ** (1 / 5) - 1) * 100 : null
  // 最低投資金額: 株式 100 株・REIT 1 口。ETF・ETN などは単位が分からないので欠損
  const lot = opt.kind === 'stock' ? 100 : opt.kind === 'reit' ? 1 : null
  // 年初来（1〜3 月は昨年来）の高値・安値。足りない（その日より後に上場した）ときは欠損
  const y = Number(asOf.slice(0, 4))
  const ytdStart = `${Number(asOf.slice(5, 7)) <= 3 ? y - 1 : y}-01-01`
  let yh = Number.NEGATIVE_INFINITY
  let yl = Number.POSITIVE_INFINITY
  if (firstBar <= addDays(ytdStart, 10)) {
    for (let i = n - 1; i >= 0 && bars[i]!.d >= ytdStart; i--) {
      if (bars[i]!.h > yh) yh = bars[i]!.h
      if (bars[i]!.l < yl) yl = bars[i]!.l
    }
  }
  // 年初来騰落率: 前年最後の終値から
  const yStart = `${y}-01-01`
  let prevYearClose: number | null = null
  for (let i = n - 1; i >= 0; i--)
    if (bars[i]!.d < yStart) {
      prevYearClose = bars[i]!.c
      break
    }
  // 配当込み（1・3 年）と 3 年の最大下落率
  // 要る窓（3 年 + 1 本）だけで作る（渡す足の本数で結果が変わらないように）
  const win = bars.slice(-(NEED.ret3y + 1))
  const tr = totalReturnSeries(win, dividends)
  const w = win.length
  const back = (k: number) => (w - 1 - k >= 0 && tr[w - 1 - k]! > 0 ? (tr[w - 1]! / tr[w - 1 - k]! - 1) * 100 : null)
  let mdd3y: number | null = null
  if (n >= 700) {
    let peak = 0
    let worst = 0
    for (let i = 0; i < w; i++) {
      const v = tr[i]!
      if (v > peak) peak = v
      else if (peak > 0) worst = Math.min(worst, v / peak - 1)
    }
    mdd3y = worst * 100
  }
  // 次の決算発表（Yahoo の予定）と権利付最終日（過去の権利落ち日から推定）を日付の数で持つ
  const earningsDay = quote?.earningsNext ? epochDay(quote.earningsNext) : null
  const recordDay = recordDayOf(dividends)
  const rights = nextRightsDates(
    [...base.months].sort((a, b) => a - b),
    asOf,
    1,
    recordDay,
  )[0]
  return {
    roe,
    divYoy,
    divCagr5,
    minInvest: lot ? close * lot : null,
    fromLo52: base.lo ? (close / base.lo - 1) * 100 : null,
    ytdFromHi: Number.isFinite(yh) && yh > 0 ? (close / yh - 1) * 100 : null,
    ytdFromLo: Number.isFinite(yl) && yl > 0 ? (close / yl - 1) * 100 : null,
    maDev200: base.ma200 ? (close / base.ma200 - 1) * 100 : null,
    vol60: volatility(bars),
    beta1y: beta(bars, opt.index),
    mdd3y,
    ret6m: ret(bars, 123),
    retYtd: prevYearClose && prevYearClose > 0 ? (close / prevYearClose - 1) * 100 : null,
    tr1y: back(NEED.ret1y),
    tr3y: back(NEED.ret3y),
    earningsDay,
    rightsDay: rights ? epochDay(rights.lastCum) : null,
    recordDay: base.months.size ? (recordDay === 'end' ? 0 : recordDay) : null,
  }
}
