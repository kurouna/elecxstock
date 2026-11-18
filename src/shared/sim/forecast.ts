// 配当シミュレータのこれから（試算。docs/design-simulator.md §5.2）。純粋関数。
// 予想ではなく、過去の実績の機械的な延長（横ばいと減配のストレス）。
import { addYears } from '../calendar'
import { dpsBlocks } from '../folio'
import type { Dividend, JstDate } from '../types'

export function median(xs: number[]): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

/**
 * 1 年の 1 株配当 D₀（直近 N 回の権利落ちの合計。N は直近 2 年の回数から。FR-PF7 と同じ数え方）。
 * J-REIT は回ごとの直近 4 回の中央値 × 年の回数（売却益による一時的な増配をならす）。直近 1 年に権利落ちが無ければ 0（無配）。
 * years は記録の年数（N 回で区切った年のうち、配当のある年の数）
 */
export function annualOf(divs: Dividend[], asOf: JstDate, reit: boolean): { d0: number; perYear: number; years: number } {
  const b = dpsBlocks(divs, asOf, 10)
  const years = b.dps.filter((v) => v != null && v > 0).length
  if (!b.last.length) return { d0: 0, perYear: b.perYear, years }
  if (reit) {
    const xs = divs.filter((d) => d.date <= asOf && d.amount > 0).sort((a, c) => (a.date < c.date ? -1 : 1))
    return { d0: (median(xs.slice(-4).map((d) => d.amount)) ?? 0) * b.perYear, perYear: b.perYear, years }
  }
  return { d0: b.dps.at(-1) ?? 0, perYear: b.perYear, years }
}

/** 直近 1 年の権利落ち（古い順） */
export function lastYearEvents(divs: Dividend[], asOf: JstDate): Dividend[] {
  const y1 = addYears(asOf, -1)
  return divs.filter((d) => d.date > y1 && d.date <= asOf && d.amount > 0).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

/**
 * D₀ を月（権利落ちの月。0 が 1 月）に配る割合: 直近 1 年の回ごとの実績の比（均等割りしない）。
 * J-REIT は月ごとに直近 4 回の中で同じ月の回の中央値の比。配当が無ければすべて 0
 */
export function monthShares(divs: Dividend[], asOf: JstDate, reit: boolean): number[] {
  const out = new Array<number>(12).fill(0)
  const last = lastYearEvents(divs, asOf)
  if (!last.length) return out
  if (reit) {
    const xs = divs
      .filter((d) => d.date <= asOf && d.amount > 0)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .slice(-4)
    for (const m of new Set(last.map((d) => Number(d.date.slice(5, 7)) - 1)))
      out[m] = median(xs.filter((d) => Number(d.date.slice(5, 7)) - 1 === m).map((d) => d.amount)) ?? 0
  } else for (const d of last) out[Number(d.date.slice(5, 7)) - 1]! += d.amount
  const sum = out.reduce((a, b) => a + b, 0)
  return sum > 0 ? out.map((x) => x / sum) : out.fill(0)
}

/** 暦年（権利落ち日で数える）ごとの 1 株配当の合計 */
export function yearTotals(divs: Dividend[]): Map<number, number> {
  const m = new Map<number, number>()
  for (const d of divs) {
    const y = Number(d.date.slice(0, 4))
    m.set(y, (m.get(y) ?? 0) + d.amount)
  }
  return m
}

/** ストレスの年を選ぶ材料: 銘柄ごとの年の合計と、記録の始まりの年（その年は年途中なので使わない） */
export interface StressItem {
  id: string
  /** 17 業種（J-REIT は 'REIT'。業種が無ければ null） */
  s17: string | null
  years: Map<number, number>
  from: number
}
/** y−1 年と y 年の両方に、まる 1 年分の記録があるか（記録の始まりの年・今年は使わない） */
const covered = (i: StressItem, y: number, thisYear: number) => i.from < y - 1 && y < thisYear

/**
 * 減配のストレスの年（§5.2.1）: 市場全体（両方の年に記録のある銘柄の和）の前年比がいちばん低い年。
 * 両方の年に記録のある銘柄が全体の 50% に満たない年は候補にしない。同じ前年比なら新しい年
 */
export function pickStressYear(pool: StressItem[], thisYear: number): { year: number; ratio: number } | null {
  if (!pool.length) return null
  const first = Math.min(...pool.map((i) => i.from))
  let best: { year: number; ratio: number } | null = null
  for (let y = first + 2; y < thisYear; y++) {
    let cur = 0
    let prev = 0
    let n = 0
    for (const i of pool) {
      if (!covered(i, y, thisYear)) continue
      n++
      cur += i.years.get(y) ?? 0
      prev += i.years.get(y - 1) ?? 0
    }
    if (n < pool.length * 0.5 || !(prev > 0)) continue
    const ratio = cur / prev
    if (!best || ratio <= best.ratio + 1e-12) best = { year: y, ratio }
  }
  return best
}

/**
 * 銘柄ごとのストレスの前年比 r: 両方の年に記録があり前の年が 0 でなければ実績、無ければ 17 業種の中央値、
 * それも無ければ市場全体の中央値。どれも無ければ 1（減らさない）
 */
export function stressRatios(
  pool: StressItem[],
  year: number,
  targets: { id: string; s17: string | null }[],
  thisYear = Number.POSITIVE_INFINITY,
): Map<string, { r: number; src: 'own' | 's17' | 'market' | 'none' }> {
  const own = new Map<string, number>()
  const by17 = new Map<string, number[]>()
  const all: number[] = []
  for (const i of pool) {
    const prev = i.years.get(year - 1) ?? 0
    if (!covered(i, year, thisYear) || !(prev > 0)) continue
    const r = (i.years.get(year) ?? 0) / prev
    own.set(i.id, r)
    all.push(r)
    if (i.s17) by17.set(i.s17, [...(by17.get(i.s17) ?? []), r])
  }
  const mkt = median(all)
  const m17 = new Map([...by17].map(([k, v]) => [k, median(v)!]))
  const out = new Map<string, { r: number; src: 'own' | 's17' | 'market' | 'none' }>()
  for (const t of targets) {
    const o = own.get(t.id)
    if (o != null) out.set(t.id, { r: o, src: 'own' })
    else if (t.s17 && m17.has(t.s17)) out.set(t.id, { r: m17.get(t.s17)!, src: 's17' })
    else if (mkt != null) out.set(t.id, { r: mkt, src: 'market' })
    else out.set(t.id, { r: 1, src: 'none' })
  }
  return out
}

// ---------------- 伸びを見込む（§5.2。P2 の最初の切り口） ----------------
/** 伸びを見込むときに、自分の値と業種の値を混ぜる重みの分母（w = n/(n+5)） */
const SHRINK_K = 5
/** 伸びの打ち切り（年率 ±10%） */
const GROWTH_CAP = 0.1
/** 伸びを毎年弱める割合 */
const GROWTH_DECAY = 0.8

/** Theil–Sen の傾き（2 点ずつの傾きの中央値。外れ値（記念配当など）に強い）。横は番号（1 年ずつ）。2 点に満たなければ null */
export function theilSen(ys: number[]): number | null {
  const sl: number[] = []
  for (let i = 0; i < ys.length; i++) for (let j = i + 1; j < ys.length; j++) sl.push((ys[j]! - ys[i]!) / (j - i))
  return median(sl)
}
/** 0 より大きい値が最後まで続く部分（無配の年をはさんだら、その後だけ） */
function trailingPositive(xs: (number | null)[]): number[] {
  const out: number[] = []
  for (let i = xs.length - 1; i >= 0; i--) {
    const v = xs[i]
    if (v == null || !(v > 0)) break
    out.unshift(v)
  }
  return out
}
/**
 * 自分の伸び（年率の対数）: 直近 N 回の権利落ちで区切った年の 1 株配当（最大 10 年）の対数に Theil–Sen を当てる。
 * 0 より大きい年が 4 年に満たなければ null（期間不足）。n は使った年の数
 */
export function ownGrowth(divs: Dividend[], asOf: JstDate): { g: number | null; n: number } {
  const ys = trailingPositive(dpsBlocks(divs, asOf, 10).dps)
  if (ys.length < 4) return { g: null, n: ys.length }
  return { g: theilSen(ys.map(Math.log)), n: ys.length }
}
/** 業種の値を出すための、母集団の銘柄の伸び（暦年の合計。記録の始まりの年と今年は使わない） */
export function poolGrowth(i: StressItem, thisYear: number): number | null {
  const xs: number[] = []
  for (let y = i.from + 1; y < thisYear; y++) xs.push(i.years.get(y) ?? 0)
  const ys = trailingPositive(xs)
  return ys.length < 4 ? null : theilSen(ys.map(Math.log))
}
/** 記録が短いほど業種の値に寄せ（w = n/(n+5)）、±10% で打ち切る。自分の値が無ければ業種の値 */
export function shrinkGrowth(own: number | null, n: number, sector: number): number {
  const w = own == null ? 0 : n / (n + SHRINK_K)
  const g = w * (own ?? 0) + (1 - w) * sector
  return Math.max(-GROWTH_CAP, Math.min(GROWTH_CAP, g))
}
/** t 年目の倍率: exp(g·Σ_{s=1..t} 0.8ˢ)（伸びを毎年 0.8 倍ずつ弱める） */
export function growthFactor(g: number, t: number): number {
  let s = 0
  for (let k = 1; k <= t; k++) s += GROWTH_DECAY ** k
  return Math.exp(g * s)
}
/** 元本に届く年数の上限（これより先は「届かない」） */
const PAYBACK_MAX = 200
/** 毎年の額（t 年目 → 円）の累計が元本に届く最初の年。上限までに届かない・元本が 0 なら null */
export function paybackYears(valueAt: (t: number) => number, amount: number): number | null {
  if (!(amount > 0)) return null
  let cum = 0
  for (let t = 1; t <= PAYBACK_MAX; t++) {
    cum += valueAt(t)
    if (cum >= amount) return t
  }
  return null
}
