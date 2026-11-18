// 配当シミュレータの材料の読み出しとキャッシュ（docs/design-simulator.md §10）。計算は src/shared/sim/run.ts（純粋関数）。
// 取得の完了（data.updated）で clear() する。Electron を import しない（NFR-A1）。
import { addYears } from '@shared/calendar'
import { METRIC_COLUMNS } from '@shared/fields'
import { baseDate, buildPx, type Px, priceAt, tradingOnOrBefore } from '@shared/sim/backtest'
import type { StressItem } from '@shared/sim/forecast'
import { groupKey } from '@shared/sim/peers'
import { splitRescreen, yieldAt } from '@shared/sim/rescreen'
import { type SimStock, simulate } from '@shared/sim/run'
import { SIM_LIMIT, type SimResult, type SimSector, type SimSettings } from '@shared/sim/types'
import type { Condition, Instrument, InstrumentId, JstDate, MetricsRow } from '@shared/types'
import { lastClosedSession, retentionStart, toJstDate } from './calendar'
import { divYears } from './metrics'
import type { Repo } from './repo'
import { runScreen } from './screener'

/**
 * 配当の記録の始まり: 月次系列を取った日の 10 年前から（月次系列の取得で 10 年分を入れるため。取った日が今日より後なら今日の 10 年前）。
 * 取っていない・10 年分の配当を入れる前の版で取った（DIV10_SINCE より前）なら日足の保存期間の始まり
 */
export function divCoverFrom(
  lastMonthly: string | null | undefined,
  today: JstDate,
  retention: JstDate,
  since: string = DIV10_SINCE,
): JstDate {
  if (!lastMonthly || lastMonthly < since) return retention
  const fetched = toJstDate(new Date(lastMonthly))
  return addYears(fetched < today ? fetched : today, -10)
}
/** 月次系列の取得で 10 年分の配当を持つようにした版の日付（これより前に取った銘柄は、取り直すまで日足の保存期間の分しか配当が無い） */
export const DIV10_SINCE = '2026-11-14'
const ETF_ID: InstrumentId = 'JP:1306'
/** 比べる母集団の銘柄（株式・J-REIT。優先株と社債型種類株式（5 桁）・ETF・廃止銘柄は入れない） */
const poolable = (i: Instrument) => i.status === 'active' && (i.kind === 'stock' || i.kind === 'reit') && i.code.length === 4

/** 当時の条件で選び直す入力（スクリーンの条件と、★・ウォッチリスト。今の値のまま使う） */
export interface RescreenInput {
  conditions: Condition[]
  favorites: InstrumentId[]
  watchlists: Record<string, InstrumentId[]>
}

export class SimData {
  /** 選んだ銘柄と 1306（日足 + それより前は月末の終値） */
  private full = new Map<InstrumentId, SimStock | null>()
  /** 同業種の相手（月末の終値だけ。計算の量のため） */
  private lite = new Map<InstrumentId, SimStock | null>()
  private insts: Instrument[] | null = null
  private pool: StressItem[] | null = null
  private divFromCache = new Map<InstrumentId, JstDate>()
  /** 計算中のデータの基準の日（配当の記録の始まりを決める） */
  private today: JstDate = lastClosedSession()

  constructor(
    private repo: Repo,
    private retentionYears: () => number,
    /** 月次系列が無い銘柄（日足より前の価格・10 年分の配当が無い）。取得を頼む */
    private needMonthly: (id: InstrumentId) => void = () => {},
    /** 10 年分の配当を入れた版の日付（スタブは時刻を固定していてこの日より前になるので空にする） */
    private div10Since: string = DIV10_SINCE,
  ) {}

  /** 取得の完了で捨てる */
  clear(): void {
    this.cachedFor = null
    this.full.clear()
    this.lite.clear()
    this.insts = null
    this.pool = null
    this.divFromCache.clear()
  }
  /** キャッシュを作ったデータの基準の日（変わったら作り直す。配当の記録の始まり・ストレスの母集団がこの日で決まるため） */
  cachedFor: JstDate | null = null
  /** キャッシュしている銘柄の数（テスト用） */
  get cached(): number {
    return this.full.size + this.lite.size
  }

  /** held は保有（銘柄 → 株数と税引後の割合）。渡したら、これからは実際の株数で計算する（設計 §23） */
  run(
    ids: InstrumentId[],
    settings: SimSettings,
    held?: Map<InstrumentId, { qty: number; net: number }>,
    rescreen?: RescreenInput,
  ): SimResult {
    const pick = ids.slice(0, SIM_LIMIT)
    // データの基準の日: 選んだ銘柄で終値のある最新の日（仮の足を含む）
    let today: JstDate | null = null
    for (const id of pick) {
      const d = this.repo.lastDaily(id, false)?.d
      if (d && (!today || d > today)) today = d
    }
    today ??= lastClosedSession()
    if (today !== this.cachedFor) {
      this.full.clear()
      this.lite.clear()
      this.pool = null
      this.divFromCache.clear()
      this.cachedFor = today
    }
    this.today = today
    const stocks = pick.map((id) => this.stock(id, true)).filter((s): s is SimStock => !!s)
    const byKey = new Map<string, Instrument[]>()
    const members = (key: string, level: SimSector, market: string): SimStock[] => {
      const k = `${level}|${key}|${market}`
      if (!byKey.has(k))
        byKey.set(
          k,
          this.instruments().filter((i) => poolable(i) && i.market === market && groupKey(this.attrs(i), level) === key),
        )
      const list = byKey.get(k)!
      this.prefetchLite(list)
      return list.flatMap((i) => this.stock(i.id, false) ?? [])
    }
    const universe = (market: string): SimStock[] => {
      const k = `all|${market}`
      if (!byKey.has(k))
        byKey.set(
          k,
          this.instruments().filter((i) => poolable(i) && i.market === market && groupKey(this.attrs(i), 's33') != null),
        )
      const list = byKey.get(k)!
      this.prefetchLite(list)
      return list.flatMap((i) => this.stock(i.id, false) ?? [])
    }
    const re = rescreen
      ? this.rescreenAt(rescreen, settings.from ? tradingOnOrBefore(settings.from) : baseDate(today, settings.years))
      : null
    return simulate({
      today,
      settings,
      stocks,
      total: ids.length,
      etf: this.stock(ETF_ID, true),
      members,
      universe,
      stressPool: this.stressPool(today),
      ...(held ? { held } : {}),
      ...(re ? { rescreen: re } : {}),
    })
  }

  /**
   * 当時の条件で選び直す（P2）: 基準日の値で作り直せる指標（実績利回り・連続増配・連続非減配）だけを入れた指標の表で、スクリーンを走らせ直す。
   * 作り直せない条件は外して返す（ignored）。表示の順は基準日の実績利回りの高い順、先頭 200 銘柄
   */
  private rescreenAt(inp: RescreenInput, base: JstDate): { stocks: SimStock[]; ignored: string[] } {
    const { kept, ignored } = splitRescreen(inp.conditions)
    const insts = this.instruments().filter(poolable)
    this.prefetchLite(insts)
    const template = new Map(this.repo.metrics().map((m) => [m.id, m]))
    const metrics = new Map<InstrumentId, MetricsRow>()
    for (const i of insts) {
      const s = this.stock(i.id, false)
      const t = template.get(i.id)
      const price = s ? priceAt(s.px, base) : null
      if (!s || !t || price == null || !(price > 0)) continue
      const divs = s.divs.filter((d) => d.date <= base)
      const row: Record<string, unknown> = { ...t, asOf: base, stale: false }
      for (const c of METRIC_COLUMNS) row[c] = null
      row.yieldTrailing = yieldAt(divs, price, base, s.divFrom)
      Object.assign(row, divYears(divs, base, s.divFrom))
      metrics.set(i.id, row as unknown as MetricsRow)
    }
    const r = runScreen({
      conditions: kept,
      instruments: insts,
      metrics,
      favorites: new Set(inp.favorites),
      watchlists: inp.watchlists,
    })
    const ids = [...r.ids].sort((a, b) => (metrics.get(b)?.yieldTrailing ?? 0) - (metrics.get(a)?.yieldTrailing ?? 0)).slice(0, SIM_LIMIT)
    return { stocks: ids.map((id) => this.stock(id, true)).filter((s): s is SimStock => !!s), ignored }
  }

  private attrs(i: Instrument) {
    return { kind: i.kind, market: i.market, sector33: i.sectorJa }
  }
  private instruments(): Instrument[] {
    this.insts ??= this.repo.universe()
    return this.insts
  }
  /** 配当の記録の始まり: 月次系列を取っていれば 10 年前から、無ければ日足の保存期間の始まりから */
  private divFrom(id: InstrumentId): JstDate {
    const key = `${id}|${this.today}`
    const hit = this.divFromCache.get(key)
    if (hit) return hit
    const today = this.today
    const d = divCoverFrom(this.repo.fetchState(id).lastMonthly, today, retentionStart(today, this.retentionYears()), this.div10Since)
    this.divFromCache.set(key, d)
    return d
  }

  private stock(id: InstrumentId, full: boolean): SimStock | null {
    const cache = full ? this.full : this.lite
    if (cache.has(id)) return cache.get(id)!
    const i = this.repo.instrument(id)
    let s: SimStock | null = null
    if (i) {
      const px = full ? this.fullPx(id) : this.litePx(id)
      // 上場廃止の銘柄は計算に入れないので、取得も頼まない
      if (full && i.status === 'active' && !this.repo.fetchState(id).lastMonthly && this.repo.yahooOf(id)) this.needMonthly(id)
      s = {
        id,
        ...this.attrs(i),
        px,
        divs: this.repo.dividends(id),
        divFrom: this.divFrom(id),
        ...(i.status === 'delisted' ? { delisted: true } : {}),
      }
    }
    cache.set(id, s)
    return s
  }
  private fullPx(id: InstrumentId): Px {
    return buildPx(
      this.repo.monthly(id).map((b) => ({ d: b.d, c: b.c })),
      this.repo.daily(id).map((b) => ({ d: b.d, c: b.c })),
    )
  }
  /**
   * 同業種の相手をまとめて読む（§10.1）: キャッシュに無い銘柄の月末の終値・月次系列・配当・月次系列を取ったかを、400 銘柄ずつ 1 回の検索で。
   * 1 銘柄ずつ読むと、相手が 1,000 銘柄ほどの初回で 1 秒を超えた（実測。21.11）
   */
  private prefetchLite(list: Instrument[]): void {
    const want = list.filter((i) => !this.lite.has(i.id))
    const group = <T extends { id: string }>(rows: T[]) => {
      const m = new Map<string, T[]>()
      for (const x of rows) {
        const xs = m.get(x.id)
        if (xs) xs.push(x)
        else m.set(x.id, [x])
      }
      return m
    }
    for (let k = 0; k < want.length; k += 400) {
      const part = want.slice(k, k + 400)
      const ids = part.map((i) => i.id)
      const q = ids.map(() => '?').join(',')
      // 月末の終値: 月次系列（Yahoo の月足。月末の終値・分割調整済み）を 11 年前から。月次系列より後の月だけ日足の月末で足す。
      // 日足を全期間グループ化すると、相手が 1,000 銘柄ほどで 1 秒を超えた（21.11）
      const from = `${addYears(this.today, -11).slice(0, 7)}-01`
      const monthly = group(
        this.repo.db.all<{ id: string; m: string; c: number }>(
          `SELECT id, m, c FROM monthly_bars WHERE id IN (${q}) AND m >= ? AND c > 0 ORDER BY id, m`,
          ...ids,
          from,
        ),
      )
      // 月次系列の最後の月より後（月次系列が無い銘柄は 11 年前から）の日足
      const lastM = new Map([...monthly].map(([id, xs]) => [id, xs.at(-1)!.m.slice(0, 7)]))
      // 日付の文字列の最小（YYYY-MM-DD は文字列の順が日付の順）
      const since =
        ids
          .map((id) => {
            const m = lastM.get(id)
            return m ? `${m}-31` : from
          })
          .sort()[0] ?? from
      const recent = group(
        this.repo.db.all<{ id: string; d: string; c: number }>(
          `SELECT id, d, c FROM daily_bars WHERE id IN (${q}) AND d > ? AND c > 0 ORDER BY id, d`,
          ...ids,
          since,
        ),
      )
      const divs = group(
        this.repo.db.all<{ id: string; d: string; value: number }>(
          `SELECT id, d, value FROM actions WHERE type = 'div' AND id IN (${q}) ORDER BY id, d`,
          ...ids,
        ),
      )
      const lm = new Map(
        this.repo.db
          .all<{ id: string; lm: string }>(
            `SELECT id, last_monthly AS lm FROM fetch_state WHERE last_monthly IS NOT NULL AND id IN (${q})`,
            ...ids,
          )
          .map((x) => [x.id, x.lm] as const),
      )
      for (const i of part) {
        const head = (monthly.get(i.id) ?? []).map((x) => ({ d: `${x.m.slice(0, 7)}-01`, c: x.c }))
        const after = lastM.get(i.id) ?? '0000-00'
        const tail = new Map<string, number>()
        for (const x of recent.get(i.id) ?? []) if (x.d.slice(0, 7) > after) tail.set(x.d.slice(0, 7), x.c)
        const pts = [...head, ...[...tail].map(([m, c]) => ({ d: `${m}-01`, c }))]
        const divFrom = divCoverFrom(lm.get(i.id), this.today, retentionStart(this.today, this.retentionYears()), this.div10Since)
        this.lite.set(i.id, {
          id: i.id,
          ...this.attrs(i),
          px: buildPx(pts, []),
          divs: (divs.get(i.id) ?? []).map((x) => ({ date: x.d, amount: x.value })),
          divFrom,
          ...(i.status === 'delisted' ? { delisted: true } : {}),
        })
      }
    }
  }
  /** 月末の終値だけ: 日足の月ごとの最後の終値と、日足より前の月次系列（1 銘柄。まとめて読むのは prefetchLite） */
  private litePx(id: InstrumentId): Px {
    const ends = this.repo.db.all<{ m: string; c: number }>(
      'SELECT substr(d, 1, 7) AS m, MAX(d) AS d, c FROM daily_bars WHERE id = ? AND c > 0 GROUP BY m ORDER BY m',
      id,
    )
    const first = ends[0]?.m ?? '9999-99'
    const head = this.repo
      .monthly(id)
      .filter((b) => b.d.slice(0, 7) < first)
      .map((b) => ({ d: b.d, c: b.c }))
    return buildPx([...head, ...ends.map((e) => ({ d: `${e.m}-01`, c: e.c }))], [])
  }

  /** ストレスの年を選ぶ全銘柄の年ごとの 1 株配当（1 回の検索） */
  private stressPool(today: JstDate): StressItem[] {
    if (this.pool) return this.pool
    const insts = new Map(
      this.instruments()
        .filter(poolable)
        .map((i) => [i.id, i]),
    )
    const by = new Map<string, { y: number; v: number }[]>()
    for (const r of this.repo.db.all<{ id: string; d: string; value: number }>(
      `SELECT id, d, value FROM actions WHERE type = 'div' ORDER BY id, d`,
    )) {
      if (!insts.has(r.id) || r.d > today) continue
      const xs = by.get(r.id) ?? []
      xs.push({ y: Number(r.d.slice(0, 4)), v: r.value })
      by.set(r.id, xs)
    }
    const monthly = new Set(this.repo.db.all<{ id: string }>('SELECT id FROM fetch_state WHERE last_monthly IS NOT NULL').map((r) => r.id))
    const cover10 = Number(addYears(today, -10).slice(0, 4))
    const coverRet = Number(retentionStart(today, this.retentionYears()).slice(0, 4))
    const out: StressItem[] = []
    for (const [id, xs] of by) {
      const years = new Map<number, number>()
      for (const x of xs) years.set(x.y, (years.get(x.y) ?? 0) + x.v)
      const i = insts.get(id)!
      out.push({ id, s17: groupKey(this.attrs(i), 's17'), years, from: Math.max(monthly.has(id) ? cover10 : coverRet, xs[0]!.y) })
    }
    this.pool = out
    return out
  }
}
