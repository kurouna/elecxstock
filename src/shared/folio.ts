// ポートフォリオの計算（docs/design-portfolio.md）。純粋な関数だけ（Core と画面が共有し、L1 のテストで確かめる）。
import { addDays, addYears, isTradingDay, toJstDate } from './calendar'
import { CYCLICALITY, type Cyclicality, sector17Of } from './sectors'
import type { AccountType, Dividend, DpsBlocks, FolioPoint, FolioPos, FolioSeriesPoint, Holding, JstDate, Split } from './types'

/** 配当にかかる税（所得税・住民税・復興特別所得税） */
export const DIVIDEND_TAX = 0.20315
/** NISA の口座区分は配当が非課税 */
export const netRate = (a: AccountType) => (a.startsWith('nisa') ? 1 : 1 - DIVIDEND_TAX)

// ---------------- 分割 ----------------
/** after より後（upTo まで）の分割の倍率。after の日の株数 × これ = upTo の日の株数 */
export function splitFactor(splits: Split[], after: JstDate, upTo?: JstDate): number {
  return splits.filter((s) => s.date > after && (!upTo || s.date <= upTo)).reduce((p, s) => p * s.ratio, 1)
}

/**
 * 保有を d の日の株数の基準にする（記録の pos）。保有の株数は取り込んだ日（無ければ asOf）の基準とみなし、
 * その日から d までの分割で換算する（分割の日から CSV を取り込み直すまでの間も正しく評価する。§5.1）
 */
export function posOf(holdings: Holding[], d: JstDate, splitsOf: (code: string) => Split[], asOf: JstDate = d): FolioPos[] {
  const out: FolioPos[] = []
  for (const h of holdings) {
    if (!(h.quantity > 0)) continue
    const t = h.importedAt ? Date.parse(h.importedAt) : Number.NaN
    const base = Number.isFinite(t) ? toJstDate(t) : asOf
    const f = base < d ? splitFactor(splitsOf(h.code), base, d) : 1
    out.push({ code: h.code, acct: h.account, qty: h.quantity * f, cost: h.avgCost / f })
  }
  return out
}
/** 2 つの保有が同じか（記録を書き直すか決める） */
export function samePos(a: FolioPos[], b: FolioPos[]): boolean {
  const k = (p: FolioPos[]) =>
    p
      .map((x) => `${x.code}/${x.acct}/${+x.qty.toFixed(6)}/${+x.cost.toFixed(4)}`)
      .sort()
      .join('|')
  return k(a) === k(b)
}

// ---------------- 記録 ----------------
/** a より後、b より前の取引日（起動しなかった日を埋める。多すぎるときは新しい側から limit 日まで） */
export function gapDays(a: JstDate, b: JstDate, limit = 400): JstDate[] {
  const out: JstDate[] = []
  for (let x = addDays(a, 1); x < b; x = addDays(x, 1)) if (isTradingDay(x)) out.push(x)
  return out.slice(-limit)
}
/** 評価: Σ 株数 × 終値（終値が無い銘柄は取得単価で数え、missing に入れる） */
export function valuePos(pos: FolioPos[], close: (code: string) => number | null): { value: number; cost: number; missing: string[] } {
  let value = 0
  let cost = 0
  const missing: string[] = []
  for (const p of pos) {
    const c = close(p.code)
    cost += p.qty * p.cost
    if (c == null) {
      missing.push(p.code)
      value += p.qty * p.cost
    } else value += p.qty * c
  }
  return { value, cost, missing }
}
/** 記録を日付で混ぜる（読み込み。記録 > 補完値、同じ種類なら新しく書いたほう）。日付の昇順 */
export function mergePoints(a: FolioPoint[], b: FolioPoint[]): FolioPoint[] {
  const m = new Map<JstDate, FolioPoint>()
  for (const p of [...a, ...b]) {
    const was = m.get(p.d)
    if (!was) m.set(p.d, p)
    else if (was.src !== p.src) m.set(p.d, was.src === 'rec' ? was : p)
    else if (p.at > was.at) m.set(p.d, p)
  }
  return [...m.values()].sort((x, y) => (x.d < y.d ? -1 : x.d > y.d ? 1 : 0))
}
/** d に最も近い、d 以前の点 */
export function pointOn<T extends { d: JstDate }>(points: T[], d: JstDate): T | undefined {
  let lo = 0
  let hi = points.length - 1
  let ans: T | undefined
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (points[mid]!.d <= d) {
      ans = points[mid]
      lo = mid + 1
    } else hi = mid - 1
  }
  return ans
}

// ---------------- 資産推移（§6.2） ----------------
/**
 * 時間加重収益率の概算（%）。入出金 = 取得額の増減 − 実現損益の増減（売った利益を損と数えない）。配当は含まない。
 * 実現損益が片方に無い点・評価額が 0 の点では鎖を切る（そこから 0 に戻さず、その区間は動かさない）
 */
export function twr(points: Pick<FolioSeriesPoint, 'value' | 'cost' | 'realized'>[]): number[] {
  const out: number[] = points.length ? [0] : []
  let g = 1
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    const realizedOk = (a.realized == null) === (b.realized == null)
    if (a.value > 0 && b.value > 0 && realizedOk) {
      const flow = b.cost - a.cost - ((b.realized ?? 0) - (a.realized ?? 0))
      g *= (b.value - flow) / a.value
    }
    out.push((g - 1) * 100)
  }
  return out
}
/**
 * 期間の内訳（期首 → 入出金 → 評価損益の増減 → 期末）。足すと期末と一致する。
 * 受取配当は評価額（現金を含まない）に入らないので、内訳には入れず別に返す
 */
export function bridge(a: Pick<FolioSeriesPoint, 'value' | 'cost' | 'realized' | 'received'>, b: typeof a) {
  // 実現損益・受取配当の累計が片方の点にしか無い（記録の途中で CSV を取り込んだ）ときは、その差を 0 とみなす（累計の全額を入れない）
  const diff = (x?: number, y?: number) => (x != null && y != null ? y - x : 0)
  const flow = b.cost - a.cost - diff(a.realized, b.realized)
  return { start: a.value, flow, move: b.value - a.value - flow, end: b.value, received: diff(a.received, b.received) }
}

// ---------------- 資産構成 ----------------
/** 集中度: 最大保有比率・上位 5 銘柄・実効銘柄数（1 ÷ Σ比率²） */
export function concentration(values: number[]): { max: number; top5: number; effective: number } {
  const total = values.reduce((s, v) => s + Math.max(0, v), 0)
  if (!total) return { max: 0, top5: 0, effective: 0 }
  const w = values.map((v) => Math.max(0, v) / total).sort((a, b) => b - a)
  return { max: w[0]!, top5: w.slice(0, 5).reduce((s, v) => s + v, 0), effective: 1 / w.reduce((s, v) => s + v * v, 0) }
}
/** 損益の色の段（5 段の発散。0 = 大きく下げ … 4 = 大きく上げ）。span はおよそ「大きい」と見なす幅 */
export function heatStep(v: number | null, span: number): 0 | 1 | 2 | 3 | 4 {
  if (v == null || !Number.isFinite(v)) return 2
  const t = v / span
  return t <= -0.6 ? 0 : t <= -0.15 ? 1 : t < 0.15 ? 2 : t < 0.6 ? 3 : 4
}
/** 段の色の混ぜる割合（12〜55%。長く持つ保有は含み益が多く、濃いと一面が警告の色に見えるため） */
export const heatMix = (step: number) => (step === 2 ? 0 : step === 1 || step === 3 ? 0.31 : 0.55)
/** 景気敏感・ディフェンシブの割合（17 業種から。REIT・ETF・業種の無い銘柄は other） */
export function cyclicalShare(rows: { sector: string; kind: string; value: number }[]): Record<Cyclicality | 'other', number> {
  const out = { cyclical: 0, defensive: 0, other: 0 }
  const total = rows.reduce((s, r) => s + Math.max(0, r.value), 0)
  if (!total) return out
  for (const r of rows) {
    const s17 = r.kind === 'stock' || r.kind === 'pref' ? sector17Of(r.sector) : null
    out[s17 ? CYCLICALITY[s17] : 'other'] += Math.max(0, r.value) / total
  }
  return out
}

// ---------------- 損益寄与（§6.5） ----------------
export interface ContribInput {
  /** 期間の初め（この日の終値から測る。前の期間の最後の取引日） */
  from: JstDate
  to: JstDate
  /** 記録の点（日付の昇順）。無い日は直前の点の保有、記録の前は firstPos */
  points: Pick<FolioPoint, 'd' | 'pos'>[]
  /** 記録が無いとき・記録より前に使う保有（現在の保有） */
  fallback: FolioPos[]
  /** 銘柄の日足の終値（分割調整済み。日付の昇順） */
  closes: (code: string) => { d: JstDate; c: number }[]
  dividends: (code: string) => Dividend[]
  splits: (code: string) => Split[]
}
/**
 * 期間の値動き＋その期間に権利落ちした配当（権利落ちの前日に持っていた株数 × 1 株配当・税引後）。
 * 値動きは日ごとの「その日の株数 × 終値の差」の合計（途中で買った分は買った日から、売った分は売った日まで）
 */
export function periodContrib(inp: ContribInput): {
  rows: { code: string; price: number; div: number; soldOn?: JstDate }[]
  beforeRecords: boolean
} {
  const firstRec = inp.points[0]?.d
  const beforeRecords = !firstRec || inp.from < firstRec
  const posOn = (d: JstDate): FolioPos[] => (firstRec && d >= firstRec ? pointOn(inp.points, d)!.pos : inp.fallback)
  const codes = new Set<string>()
  for (const p of inp.fallback) codes.add(p.code)
  for (const x of pointOn(inp.points, inp.from)?.pos ?? []) codes.add(x.code)
  for (const p of inp.points) if (p.d > inp.from && p.d <= inp.to) for (const x of p.pos) codes.add(x.code)
  const held = new Set(inp.fallback.map((p) => p.code))
  const rows: { code: string; price: number; div: number; soldOn?: JstDate }[] = []
  for (const code of codes) {
    const bars = inp.closes(code)
    const sp = inp.splits(code)
    // その日の保有を、終値（今の基準）に合わせて換算した株数と、税引後の割合
    const at = (d: JstDate) => {
      const ps = posOn(d).filter((p) => p.code === code)
      const base = firstRec && d >= firstRec ? pointOn(inp.points, d)!.d : inp.to
      const f = splitFactor(sp, base)
      return { qty: ps.reduce((s, p) => s + p.qty * f, 0), net: ps.reduce((s, p) => s + p.qty * f * netRate(p.acct), 0) }
    }
    let price = 0
    let lastHeld: JstDate | undefined
    let prev = pointOn(bars, inp.from)
    for (const b of bars) {
      if (b.d <= inp.from || b.d > inp.to) continue
      const h = at(prev?.d ?? inp.from)
      if (prev && h.qty) {
        price += h.qty * (b.c - prev.c)
        lastHeld = b.d
      }
      prev = b
    }
    let div = 0
    for (const x of inp.dividends(code)) {
      if (x.date <= inp.from || x.date > inp.to) continue
      const before = pointOn(bars, addDays(x.date, -1))
      div += at(before?.d ?? addDays(x.date, -1)).net * x.amount
    }
    if (!price && !div && !held.has(code)) continue
    rows.push({ code, price, div, ...(!held.has(code) && lastHeld ? { soldOn: lastHeld } : {}) })
  }
  return { rows, beforeRecords }
}

// ---------------- 配当（§6.6） ----------------
/**
 * 1 株配当の年（直近 N 回の権利落ちの合計）を 5 年分。カレンダーの 12 か月で切ると、権利落ちの日のずれで
 * 回数が増減して偽の増配・減配が出るため、回数で区切る。N は直近 2 年の年あたりの回数
 */
export function dpsBlocks(divs: Dividend[], asOf: JstDate, years = 5): DpsBlocks {
  const xs = divs.filter((d) => d.date <= asOf && d.amount > 0).sort((a, b) => (a.date < b.date ? -1 : 1))
  const y1 = addYears(asOf, -1)
  const y2 = addYears(asOf, -2)
  const lastYear = xs.filter((d) => d.date > y1).length
  const prevYear = xs.filter((d) => d.date > y2 && d.date <= y1).length
  // 片方の年にしか権利落ちが無い（履歴の始まり・無配になった）ときは、ある年の回数を使う
  const perYear = lastYear && prevYear ? Math.max(1, Math.round((lastYear + prevYear) / 2)) : lastYear || prevYear || 1
  // 直近 1 年に権利落ちが無ければ（無配・止まった）0
  // 直近 1 年に権利落ちが無ければ（無配になった）今の年は 0、その前の年が最後の配当
  const shift = lastYear ? 0 : 1
  const dps: (number | null)[] = []
  for (let k = years - 1; k >= 0; k--) {
    if (k < shift) {
      dps.push(0)
      continue
    }
    const end = xs.length - (k - shift) * perYear
    const block = end - perYear >= 0 ? xs.slice(end - perYear, end) : null
    dps.push(block ? block.reduce((s, d) => s + d.amount, 0) : null)
  }
  let special = false
  for (let i = xs.length - perYear; i < xs.length; i++) {
    const a = xs[i]
    const b = xs[i - perYear]
    if (a && b && a.date > y1 && a.amount > b.amount * 1.5) special = true
  }
  return {
    dps,
    perYear,
    regimeChanged: lastYear > 0 && prevYear > 0 && lastYear !== prevYear,
    special,
    last: xs.filter((d) => d.date > y1),
  }
}
/** 1 株配当の増配率（年率。古いほうから新しいほうへ。値が足りなければ null） */
export function dpsCagr(dps: (number | null)[]): number | null {
  const xs = dps.map((v, i) => [v, i] as const).filter(([v]) => v != null && v > 0)
  if (xs.length < 2) return null
  const [a, i] = xs[0]!
  const [b, j] = xs.at(-1)!
  return ((b! / a!) ** (1 / (j - i)) - 1) * 100
}
/** 連続増配の年数（据え置きで止まる）と、減っていないか（非減配） */
export function dpsStreak(dps: (number | null)[]): { streak: number; noCut: boolean } {
  let streak = 0
  for (let i = dps.length - 1; i > 0; i--) {
    const a = dps[i]
    const b = dps[i - 1]
    if (a == null || b == null || !(a > b + 1e-9)) break
    streak++
  }
  const xs = dps.filter((v): v is number => v != null)
  return { streak, noCut: xs.length >= 2 && xs.every((v, i) => !i || v >= xs[i - 1]! - 1e-9) }
}
export type DivFactor = 'new' | 'add' | 'trim' | 'sold' | 'acct' | ''
/**
 * 前年比の分解（足すと全体の増減と一致する）。
 * 増配・減配 = 1 年前の株数 × 1 株配当の増減、数量 = 株数の増減 × 今の 1 株配当。口座ごとに税引後で数える
 */
export function decompose(
  now: { acct: AccountType; qty: number }[],
  yearAgo: { acct: AccountType; qty: number }[],
  dpsNow: number,
  dpsPrev: number,
) {
  const q = (xs: typeof now) => xs.reduce((s, x) => s + x.qty, 0)
  const net = (xs: typeof now) => xs.reduce((s, x) => s + x.qty * netRate(x.acct), 0)
  const annual = net(now) * dpsNow
  const annualPrev = net(yearAgo) * dpsPrev
  const raise = net(yearAgo) * (dpsNow - dpsPrev)
  const qty = annual - annualPrev - raise
  const qn = q(now)
  const qp = q(yearAgo)
  // 株数が同じでも口座を移せば（特定 → NISA）税引後の額が変わる: 口座の移動
  const factor: DivFactor =
    qn === 0 && qp > 0
      ? 'sold'
      : qp === 0 && qn > 0
        ? 'new'
        : qn > qp + 1e-9
          ? 'add'
          : qn < qp - 1e-9
            ? 'trim'
            : Math.abs(qty) > 1e-6
              ? 'acct'
              : ''
  return { annual, annualPrev, raise, qty, factor }
}
/** 配当性向の概算（%）: 利回り（実績）× PER（実績）。株以外・値が無ければ null */
export function payoutRatio(yieldPct: number | null, per: number | null): number | null {
  return yieldPct != null && per != null && per > 0 ? yieldPct * per : null
}
/** 今の月から 12 か月の月（1〜12） */
export function nextMonths(month: number): number[] {
  return Array.from({ length: 12 }, (_, i) => ((month - 1 + i) % 12) + 1)
}
/** 権利落ちの月ごとの額（直近 1 年の権利落ち × 株数）。月は 1〜12 */
export function byMonth(last: Dividend[], net: number): Map<number, number> {
  const m = new Map<number, number>()
  for (const d of last) {
    const k = Number(d.date.slice(5, 7))
    m.set(k, (m.get(k) ?? 0) + d.amount * net)
  }
  return m
}

// ---------------- 表示 ----------------
/** ドーナツ: 大きい順に k 個と「その他」。角度はラジアン（12 時から時計回り） */
export function donutSlices<T extends { value: number }>(
  items: T[],
  k = 5,
): { item: T | null; value: number; a0: number; a1: number; rest: T[] }[] {
  const xs = items.filter((x) => x.value > 0).sort((a, b) => b.value - a.value)
  const total = xs.reduce((s, x) => s + x.value, 0)
  if (!total) return []
  const head = xs.slice(0, xs.length > k + 1 ? k : xs.length)
  const rest = xs.slice(head.length)
  const parts = [...head.map((x) => ({ item: x as T | null, value: x.value, rest: [] as T[] }))]
  if (rest.length) parts.push({ item: null, value: rest.reduce((s, x) => s + x.value, 0), rest })
  let a = -Math.PI / 2
  return parts.map((p) => {
    const a0 = a
    a += (p.value / total) * Math.PI * 2
    return { ...p, a0, a1: a }
  })
}
/** めくり表示: 新しい文字列のうち、前と違う数字の位置（右詰めで比べる。桁が増えても下の桁がそろう） */
export function flipMask(before: string, after: string): boolean[] {
  const a = [...after]
  const b = [...before]
  return a.map((ch, i) => {
    const j = b.length - (a.length - i)
    return /\d/.test(ch) && (j < 0 || b[j] !== ch)
  })
}
/** 記録の前の試算に使う最初の日: すべての銘柄の終値がそろう日 */
export function estStart(firsts: (JstDate | undefined)[]): JstDate | null {
  if (!firsts.length || firsts.some((d) => !d)) return null
  return [...(firsts as JstDate[])].sort().at(-1)!
}
