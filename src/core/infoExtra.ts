// 銘柄情報の追加の値（FR-I6〜I9。表示中の銘柄だけその場で計算する）。純粋関数。
// 配当込みの騰落率・最大下落率・利回りの範囲は、古い日から新しい日へ 1 回なめるだけで同時に求める（O(本数 + 配当の回数)）。
// 配当込みの考え方はチャートの「配当込み」（series.ts の adjust）と同じ: 権利落ち日に (1 − 配当 ÷ 前日終値) の割合で値が落ちたとみなす
import type { Dividend, InfoExtra, InstrumentId, JstDate, MetricsRow } from '@shared/types'
import { addDays, addYears } from './calendar'
import type { DayBar } from './series'

/** 期間の本数（指標の計算 NEED と同じ数え方: 1 年 = 245 営業日） */
const Y = 245
/** 読む日足の本数（5 年 + 余裕） */
export const EXTRA_BARS = Y * 5 + 30

type Bar = Pick<DayBar, 'd' | 'o' | 'h' | 'l' | 'c' | 'v'>

export function computeInfoExtra(
  id: InstrumentId,
  barsAsc: Bar[],
  dividends: Dividend[],
): Omit<InfoExtra, 'sector' | 'earnings' | 'split'> {
  const n = barsAsc.length
  const last = barsAsc[n - 1]
  const prev = barsAsc[n - 2]
  const empty = { id, day: null, hi52d: null, lo52d: null, ret5y: null, tr: { y1: null, y3: null, y5: null }, mdd: null, yieldRange: null }
  if (!last) return empty

  // 5 年の窓（足りなければ、ある分だけ）
  const start = Math.max(0, n - 1 - Y * 5)
  const divs = [...dividends].sort((a, b) => (a.date < b.date ? -1 : 1))
  // 1 回の走査: 配当込みの値 V（落ちた分を戻す）・最大下落・過去 12 か月の配当の移動合計
  const v = new Float64Array(n)
  let g = 1 // 窓の始まりからの「配当で落ちた分を戻す」倍率
  let di = 0 // 次に見る配当（権利落ち）
  while (di < divs.length && divs[di]!.date <= barsAsc[start]!.d) di++
  let peak = 0
  let peakAt = start
  let mdd = 0
  let mddFrom = start
  let mddTo = start
  // 12 か月分の配当がそろう日: 日足の最初の日か、それより前からある配当の記録の古いほうから 1 年
  const known = divs[0] && divs[0].date < barsAsc[0]!.d ? divs[0].date : barsAsc[0]!.d
  // 過去 12 か月の配当: [lo, hi) の配当の合計
  let lo = 0
  let hi = 0
  let ttm = 0
  let yLo = Number.POSITIVE_INFINITY
  let yHi = Number.NEGATIVE_INFINITY
  for (let i = start; i < n; i++) {
    const b = barsAsc[i]!
    // 権利落ち日（その日か、休場なら次の足）に倍率を掛ける
    while (di < divs.length && divs[di]!.date <= b.d) {
      const p = i > 0 ? barsAsc[i - 1]!.c : 0
      if (i > start && p > 0 && divs[di]!.amount < p) g /= 1 - divs[di]!.amount / p
      di++
    }
    const x = b.c * g
    v[i] = x
    if (x > peak) {
      peak = x
      peakAt = i
    } else if (peak > 0 && x / peak - 1 < mdd) {
      mdd = x / peak - 1
      mddFrom = peakAt
      mddTo = i
    }
    // 過去 12 か月の配当（その日を含む 1 年）。利回り = 合計 ÷ 終値
    while (hi < divs.length && divs[hi]!.date <= b.d) ttm += divs[hi++]!.amount
    const from = addYears(b.d, -1)
    while (lo < hi && divs[lo]!.date <= from) ttm -= divs[lo++]!.amount
    // 記録の始まりより 1 年以上あとの日だけ（12 か月分の配当がそろう）
    if (b.c > 0 && known <= from) {
      const y = (ttm / b.c) * 100
      if (y < yLo) yLo = y
      if (y > yHi) yHi = y
    }
  }
  /**
   * y 年前からの騰落率（配当込みは V、値段は終値で）。245 本 × y 本前の足。足りなくても、最初の足が y 年前の日から
   * 10 日以内なら最初の足を使う（保存期間 5 年の日足は約 1,222 本で、1,225 本に少し足りないため）
   */
  const back = (y: number, at: (i: number) => number) => {
    let i = n - 1 - Y * y
    if (i < start && start === 0 && barsAsc[0]!.d <= addDays(addYears(last.d, -y), 10)) i = 0
    return i >= start && at(i) > 0 ? (at(n - 1) / at(i) - 1) * 100 : null
  }
  const tv = (i: number) => v[i]!
  const tc = (i: number) => barsAsc[i]!.c

  // 52 週の高値・安値の日（指標の hi52・lo52 と同じく高値・安値の足で）
  let h52 = -1
  let l52 = -1
  if (n >= Y) {
    for (let i = n - Y; i < n; i++) {
      if (h52 < 0 || barsAsc[i]!.h > barsAsc[h52]!.h) h52 = i
      if (l52 < 0 || barsAsc[i]!.l < barsAsc[l52]!.l) l52 = i
    }
  }
  // 窓の長さ（年）。5 年の保存期間の約 1,222 本も 5 年と数える
  const span = (Date.parse(last.d) - Date.parse(barsAsc[start]!.d)) / (365.25 * 86400000)
  return {
    id,
    day: { o: last.o, h: last.h, l: last.l, v: last.v, prev: prev?.c ?? null },
    hi52d: h52 >= 0 ? barsAsc[h52]!.d : null,
    lo52d: l52 >= 0 ? barsAsc[l52]!.d : null,
    ret5y: back(5, tc),
    tr: { y1: back(1, tv), y3: back(3, tv), y5: back(5, tv) },
    mdd: n - start > 20 ? { pct: mdd * 100, from: barsAsc[mddFrom]!.d, to: barsAsc[mddTo]!.d, years: Math.max(1, Math.round(span)) } : null,
    yieldRange: Number.isFinite(yLo) && yHi > 0 ? { lo: yLo, hi: yHi, years: Math.max(1, Math.round(span)) } : null,
  }
}

/** 業種（REIT はまとめて 1 つ）の中央値: 実績利回り・PER（正のものだけ）・PBR */
export function sectorStats(
  rows: { sector: string; m: Pick<MetricsRow, 'yieldTrailing' | 'per' | 'pbr'> }[],
  sector: string,
): InfoExtra['sector'] {
  const ys: number[] = []
  const ps: number[] = []
  const bs: number[] = []
  let n = 0
  for (const r of rows) {
    if (r.sector !== sector) continue
    n++
    if (r.m.yieldTrailing != null) ys.push(r.m.yieldTrailing)
    if (r.m.per != null && r.m.per > 0) ps.push(r.m.per)
    if (r.m.pbr != null && r.m.pbr > 0) bs.push(r.m.pbr)
  }
  if (n < 5) return null // 少なすぎると中央値の意味が薄い
  const med = (a: number[]) => {
    if (a.length < 3) return null
    a.sort((x, y) => x - y)
    const k = a.length >> 1
    return a.length % 2 ? a[k]! : (a[k - 1]! + a[k]!) / 2
  }
  return { name: sector, n, yield: med(ys), per: med(ps), pbr: med(bs) }
}

/** 次の決算発表（未来のときだけ）と前回 */
export function earningsOf(
  q: { earningsNext?: string | null; earningsLast?: string | null; earningsEst?: boolean | null } | null,
  today: JstDate,
): InfoExtra['earnings'] {
  if (!q) return null
  const next = q.earningsNext && q.earningsNext >= today ? q.earningsNext : null
  const last = q.earningsLast && q.earningsLast < today ? q.earningsLast : null
  if (!next && !last) return null
  return { next, estimate: !!next && !!q.earningsEst, last }
}
