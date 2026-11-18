// 配当シミュレータの材料の読み出しとキャッシュ（docs/design-simulator.md §10）。計算は src/shared/sim/run.ts（純粋関数）。
// 取得の完了（data.updated）で clear() する。Electron を import しない（NFR-A1）。
import { addYears } from '@shared/calendar'
import { buildPx, type Px } from '@shared/sim/backtest'
import type { StressItem } from '@shared/sim/forecast'
import { groupKey } from '@shared/sim/peers'
import { type SimStock, simulate } from '@shared/sim/run'
import { SIM_LIMIT, type SimResult, type SimSector, type SimSettings } from '@shared/sim/types'
import type { Instrument, InstrumentId, JstDate } from '@shared/types'
import { lastClosedSession, retentionStart } from './calendar'
import type { Repo } from './repo'

export const ETF_ID: InstrumentId = 'JP:1306'
/** 比べる母集団の銘柄（株式・J-REIT。優先株と社債型種類株式（5 桁）・ETF・廃止銘柄は入れない） */
const poolable = (i: Instrument) => i.status === 'active' && (i.kind === 'stock' || i.kind === 'reit') && i.code.length === 4

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
  ) {}

  /** 取得の完了で捨てる */
  clear(): void {
    this.full.clear()
    this.lite.clear()
    this.insts = null
    this.pool = null
    this.divFromCache.clear()
  }
  /** キャッシュしている銘柄の数（テスト用） */
  get cached(): number {
    return this.full.size + this.lite.size
  }

  run(ids: InstrumentId[], settings: SimSettings): SimResult {
    const pick = ids.slice(0, SIM_LIMIT)
    // データの基準の日: 選んだ銘柄で終値のある最新の日（仮の足を含む）
    let today: JstDate | null = null
    for (const id of pick) {
      const d = this.repo.lastDaily(id, false)?.d
      if (d && (!today || d > today)) today = d
    }
    today ??= lastClosedSession()
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
      return byKey.get(k)!.flatMap((i) => this.stock(i.id, false) ?? [])
    }
    return simulate({
      today,
      settings,
      stocks,
      total: ids.length,
      etf: this.stock(ETF_ID, true),
      members,
      stressPool: this.stressPool(today),
    })
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
    const d = this.repo.fetchState(id).lastMonthly ? addYears(today, -10) : retentionStart(today, this.retentionYears())
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
      if (full && !this.repo.fetchState(id).lastMonthly && this.repo.yahooOf(id)) this.needMonthly(id)
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
  /** 月末の終値だけ: 日足の月ごとの最後の終値と、日足より前の月次系列（1 回の検索ずつ。日足は読み込まない） */
  private litePx(id: InstrumentId): Px {
    const ends = this.repo.db.all<{ m: string; c: number }>(
      'SELECT substr(d, 1, 7) AS m, MAX(d) AS d, c FROM daily_bars WHERE id = ? GROUP BY m ORDER BY m',
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
