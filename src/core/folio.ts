// ポートフォリオの記録と計算（docs/design-portfolio.md §5。FR-PF2〜PF8）。
// 資産推移の記録（portfolioHistory.json）は作り直せない利用者のデータなので、直前の版（.bak）を残し、読めないときも消さない。
// 計算は src/shared/folio.ts の純粋な関数を使い、ここでは市場データ（日足・配当・分割）と記録を組み合わせるだけ。
import { copyFileSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { folioPointSchema } from '@shared/api'
import { addDays, addYears, isTradingDay } from '@shared/calendar'
import { dpsBlocks, estStart, gapDays, mergePoints, netRate, periodContrib, pointOn, posOf, samePos, splitFactor } from '@shared/folio'
import type {
  AccountType,
  Dividend,
  FolioAt,
  FolioContrib,
  FolioDividends,
  FolioPoint,
  FolioPos,
  FolioSeries,
  FolioSeriesPoint,
  Holding,
  JstDate,
  PortfolioMeta,
  Split,
} from '@shared/types'
import { z } from 'zod'

const FILE = 'portfolioHistory.json'

/**
 * 資産推移の記録の保存（世代なし・直前の版を .bak に残す。§5.2）。作り直せないデータなので消さない:
 * 読めない本体は日時付きのファイルに退避して知らせ（.bak から読み直す）、記録を消すときも日時付きのファイルに残す
 */
export class FolioBook {
  private points: FolioPoint[] | null = null
  /** 本体も .bak も読めなかった（書かない） */
  broken: string | undefined
  /** 本体が読めず、退避して .bak から読んだ（知らせる） */
  warning: string | undefined
  constructor(
    private dir: string,
    private readOnly: () => boolean = () => false,
  ) {}
  private path(bak = false) {
    return join(this.dir, bak ? `${FILE}.bak` : FILE)
  }
  private aside(tag: string): string {
    return join(this.dir, `portfolioHistory.${tag}-${Date.now()}.json`)
  }
  private read(p: string): FolioPoint[] {
    const raw = JSON.parse(readFileSync(p, 'utf8')) as { data?: unknown }
    return z.array(folioPointSchema).parse(raw?.data ?? raw) as FolioPoint[]
  }
  load(): FolioPoint[] {
    if (this.points) return this.points
    let pts: FolioPoint[] = []
    if (existsSync(this.path())) {
      try {
        pts = this.read(this.path())
      } catch (e) {
        const msg = `${FILE}: ${(e as Error).message}`
        // 読めない本体は退避して残す（.bak に写さない）。直前の版が読めればそれを使い、読めなければ書かない
        if (this.readOnly()) this.broken = msg
        else {
          try {
            renameSync(this.path(), this.aside('broken'))
          } catch {
            this.broken = msg
          }
        }
        if (!this.broken) {
          try {
            if (!existsSync(this.path(true))) throw e
            pts = this.read(this.path(true))
            this.warning = msg
          } catch {
            this.broken = msg
            pts = []
          }
        }
      }
    }
    this.points = mergePoints([], pts)
    return this.points
  }
  /** 書けない（読み取り専用・記録が壊れている） */
  get locked(): boolean {
    return this.readOnly() || !!this.broken
  }
  save(next: FolioPoint[]): boolean {
    if (this.locked) return false
    const p = this.path()
    if (existsSync(p)) copyFileSync(p, this.path(true))
    writeFileSync(`${p}.tmp`, JSON.stringify({ version: 1, data: next }))
    renameSync(`${p}.tmp`, p)
    this.points = next
    return true
  }
  /** 記録を消す（日時付きのファイルに残す。その後の書き込みで .bak が押し流されても消えない） */
  clear(): boolean {
    if (this.locked) return false
    if (existsSync(this.path())) renameSync(this.path(), this.aside('cleared'))
    this.points = []
    return true
  }
  /** 取り込む前の記録を残す（保有の取り込みの「元に戻す」で戻す） */
  keepBefore(): void {
    if (this.locked) return
    writeFileSync(join(this.dir, 'portfolioHistory.preimport.json'), JSON.stringify({ version: 1, data: this.load() }))
  }
  restoreBefore(): boolean {
    const q = join(this.dir, 'portfolioHistory.preimport.json')
    if (this.locked || !existsSync(q)) return false
    this.save(this.read(q))
    rmSync(q, { force: true })
    return true
  }
}

/** 記録・計算に使う市場データ（Core の Repo から作る。テストでは差し替える） */
export interface Market {
  /** d 以前で最も新しい終値（分割調整済み）と、その日 */
  closeOn(code: string, d: JstDate): Bar | null
  /** from 以降の日足の終値（分割調整済み。昇順） */
  closes(code: string, from: JstDate): Bar[]
  firstBar(code: string): JstDate | undefined
  splits(code: string): Split[]
  dividends(code: string): Dividend[]
}
type Bar = { d: JstDate; c: number; prov?: boolean }

/** 銘柄ごとに from から先の日足を 1 回だけ読む（補完が長くても、SQL を日数 × 銘柄の数だけ出さない） */
function barsOf(m: Market, from: JstDate) {
  const cache = new Map<string, Bar[]>()
  return (code: string, x: JstDate): Bar | null => {
    if (!cache.has(code)) {
      const before = m.closeOn(code, addDays(from, -1))
      cache.set(code, [...(before ? [before] : []), ...m.closes(code, from)])
    }
    return pointOn(cache.get(code)!, x) ?? null
  }
}
/** 記録の株数（基準の日 b）で x の日を評価する: 株数 × x の日の調整済み終値 × b より後の分割の倍率 */
function valueAt(pos: FolioPos[], basis: JstDate, x: JstDate, m: Market, close: (code: string, x: JstDate) => Bar | null) {
  let value = 0
  let cost = 0
  let exact = true
  for (const p of pos) {
    cost += p.qty * p.cost
    const c = close(p.code, x)
    if (!c) {
      exact = false
      value += p.qty * p.cost
      continue
    }
    if (c.d !== x || c.prov) exact = false
    value += p.qty * c.c * splitFactor(m.splits(p.code), basis)
  }
  return { value, cost, exact }
}

/**
 * d の日を記録する（§5.1）。前の記録から d までの間の取引日は前の保有で補完する。
 * 前の日までの暫定の点（足がそろっていなかった記録・補完値）は、その点の保有のまま確定の値に書き直す。
 * 同じ日の点は、確定していて保有も同じなら書き直さない（保有を変えた日だけ書き直す）。keepFinal（取引時間中・休日に保有を変えた）なら
 * 前の取引日の点の保有は変えない（その日の実際の保有を残す）。変わらなければ null
 */
export function recordPoint(
  points: FolioPoint[],
  inp: { d: JstDate; holdings: Holding[]; meta: PortfolioMeta | null; market: Market; now: number; jobDone?: boolean; keepFinal?: boolean },
): FolioPoint[] | null {
  const { d, market: m } = inp
  if (!isTradingDay(d)) return null
  const pos = posOf(inp.holdings, d, (c) => m.splits(c))
  const out = [...points]
  let changed = false
  const last = out.filter((p) => p.d < d).at(-1)
  const gaps = last?.pos.length ? gapDays(last.d, d).filter((g) => !out.some((p) => p.d === g)) : []
  const firstOpen = out.find((p) => p.d < d && !p.final)?.d
  const from = [d, gaps[0], firstOpen].filter((x): x is JstDate => !!x).sort()[0]!
  const close = barsOf(m, from)
  // 前の日までの暫定の点を、その点の保有のまま書き直す
  out.forEach((p, i) => {
    if (p.d >= d || p.final) return
    const v = valueAt(p.pos, p.d, p.d, m, close)
    if (v.exact || v.value !== p.value) {
      const { stale: _s, ...rest } = p
      out[i] = { ...rest, value: v.value, final: v.exact, ...(!v.exact && p.stale ? { stale: true } : {}) }
      changed = true
    }
  })
  if (last?.pos.length) {
    for (const g of gaps) {
      const v = valueAt(last.pos, last.d, g, m, close)
      const f = (c: string) => splitFactor(m.splits(c), last.d, g)
      out.push({
        d: g,
        src: 'fill',
        final: v.exact,
        value: v.value,
        cost: v.cost,
        pos: last.pos.map((p) => ({ ...p, qty: p.qty * f(p.code), cost: p.cost / f(p.code) })),
        ...(last.realized != null ? { realized: last.realized } : {}),
        ...(last.received != null ? { received: last.received } : {}),
        at: inp.now,
      })
      changed = true
    }
  }
  const was = out.find((p) => p.d === d)
  const keep = was && was.src === 'rec' && was.final && (samePos(was.pos, pos) || inp.keepFinal)
  if (!keep && (pos.length || was || last?.pos.length)) {
    const use = inp.keepFinal && was ? was.pos : pos
    const v = valueAt(use, d, d, m, close)
    const point: FolioPoint = {
      d,
      src: 'rec',
      final: v.exact,
      ...(!v.exact && inp.jobDone ? { stale: true } : {}),
      value: v.value,
      cost: v.cost,
      pos: use,
      ...(inp.meta?.realized != null ? { realized: inp.meta.realized } : {}),
      ...(inp.meta?.dividends != null ? { received: inp.meta.dividends } : {}),
      at: inp.now,
    }
    if (was) out.splice(out.indexOf(was), 1, point)
    else out.push(point)
    changed = true
  }
  return changed ? mergePoints([], out) : null
}

/** 資産推移の系列（保有の明細を除く）。est なら記録の前を最初の記録の保有で試算した点を前に付ける（§6.1） */
export function seriesOf(points: FolioPoint[], m: Market, est: boolean, from?: JstDate): FolioSeriesPoint[] {
  const strip = (p: FolioPoint): FolioSeriesPoint => ({
    d: p.d,
    src: p.src,
    final: p.final,
    value: p.value,
    cost: p.cost,
    ...(p.realized != null ? { realized: p.realized } : {}),
    ...(p.received != null ? { received: p.received } : {}),
  })
  const recs = points.map(strip)
  const first = points[0]
  if (!est || !first?.pos.length) return recs
  const start = estStart(first.pos.map((p) => m.firstBar(p.code)))
  if (!start) return recs
  const begin = from && from > start ? from : start
  const out: FolioSeriesPoint[] = []
  const bars = new Map(first.pos.map((p) => [p.code, m.closes(p.code, addDays(begin, -1))]))
  const days = [...new Set([...bars.values()].flatMap((b) => b.map((x) => x.d)))].filter((x) => x >= begin && x < first.d).sort()
  for (const x of days) {
    let value = 0
    for (const p of first.pos) {
      const c = pointOn(bars.get(p.code)!, x)
      if (!c) continue
      value += p.qty * c.c * splitFactor(m.splits(p.code), first.d)
    }
    out.push({ d: x, src: 'est', final: true, value, cost: first.cost })
  }
  return [...out, ...recs]
}

export function seriesResult(
  book: FolioBook,
  m: Market,
  est: boolean,
  readOnly: boolean,
  holdings: Holding[],
  today: JstDate,
): FolioSeries {
  const pts = book.load()
  const err = book.broken ?? book.warning
  return {
    points: seriesOf(pts, m, est),
    first: pts[0]?.d ?? null,
    readOnly: readOnly || book.locked,
    // 今の株数（分割で換算済み。CSV を取り込み直す前でも、記録と同じ株数で画面を出す）
    now: posOf(holdings, today, (c) => m.splits(c)),
    ...(err ? { error: err } : {}),
  }
}

/** ある日の保有と終値（十字線の連動。株数は今の基準に換算） */
export function atOf(points: FolioPoint[], d: JstDate, m: Market): FolioAt | null {
  const p = pointOn(points, d)
  if (!p) return null
  const pos = p.pos.map((x) => {
    const f = splitFactor(m.splits(x.code), p.d)
    return { ...x, qty: x.qty * f, cost: x.cost / f }
  })
  const close: Record<string, number | null> = {}
  const prev: Record<string, number | null> = {}
  for (const x of pos) {
    const c = m.closeOn(x.code, p.d)
    close[x.code] = c?.c ?? null
    prev[x.code] = c ? (m.closeOn(x.code, addDays(c.d, -1))?.c ?? null) : null
  }
  return { d: p.d, src: p.src, pos, close, prev }
}

/** 期間の初め（今月・今年）。前の期間の最後の日（その日の終値から測る） */
export function periodFrom(period: 'month' | 'year', to: JstDate): JstDate {
  const start = period === 'month' ? `${to.slice(0, 7)}-01` : `${to.slice(0, 4)}-01-01`
  return addDays(start, -1)
}
export function contribOf(points: FolioPoint[], holdings: Holding[], period: 'month' | 'year', to: JstDate, m: Market): FolioContrib {
  const from = periodFrom(period, to)
  const r = periodContrib({
    from,
    to,
    points,
    fallback: posOf(holdings, to, (c) => m.splits(c)),
    closes: (c) => m.closes(c, addDays(from, -10)),
    dividends: (c) => m.dividends(c),
    splits: (c) => m.splits(c),
  })
  return { from, to, ...r }
}

/** 配当の分析（§6.6）: 銘柄ごとの 1 株配当の 5 年・今と 1 年前の株数（記録から）・配当見込みの推移 */
export function dividendsOf(points: FolioPoint[], holdings: Holding[], asOf: JstDate, m: Market): FolioDividends {
  const now = posOf(holdings, asOf, (c) => m.splits(c))
  const ago = pointOn(points, addYears(asOf, -1))
  const conv = (pos: FolioPos[], basis: JstDate) => {
    const out = new Map<string, { acct: AccountType; qty: number }[]>()
    for (const p of pos) {
      const f = splitFactor(m.splits(p.code), basis)
      out.set(p.code, [...(out.get(p.code) ?? []), { acct: p.acct, qty: p.qty * f }])
    }
    return out
  }
  const nowBy = conv(now, asOf)
  const agoBy = ago ? conv(ago.pos, ago.d) : null
  const codes = [...new Set([...nowBy.keys(), ...(agoBy?.keys() ?? [])])]
  const blocks = new Map(codes.map((c) => [c, dpsBlocks(m.dividends(c), asOf)]))
  const rows = codes.map((code) => ({
    code,
    ...blocks.get(code)!,
    now: nowBy.get(code) ?? [],
    yearAgo: agoBy ? (agoBy.get(code) ?? []) : null,
  }))
  // 配当見込みの推移: 記録の日ごとに「その日の株数 × その日までの直近 1 年の 1 株配当」（税引後）。多すぎるときは間引く
  const step = Math.max(1, Math.ceil(points.length / 400))
  const trend: { d: JstDate; v: number }[] = []
  points.forEach((p, i) => {
    if (i % step && i !== points.length - 1) return
    let v = 0
    for (const x of p.pos) {
      const dps = dpsBlocks(m.dividends(x.code), p.d).dps.at(-1) ?? 0
      v += x.qty * splitFactor(m.splits(x.code), p.d) * dps * netRate(x.acct)
    }
    trend.push({ d: p.d, v })
  })
  return { rows, yearAgoDate: ago?.d ?? null, trend }
}
