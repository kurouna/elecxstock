// DB の読み書き（リポジトリ層）。SQL はここに閉じ込める。
import { METRIC_COLUMNS } from '@shared/fields'
import type { Dividend, Instrument, InstrumentId, InstrumentKind, JstDate, Market, MetricsRow, Quote, Split } from '@shared/types'
import type { Db } from './db'
import type { ProviderQuote, RawBar, UniverseRow } from './providers/types'
import type { DayBar } from './series'

export const N225: InstrumentId = 'IDX:N225'
export const idOf = (code: string) => `JP:${code}`

interface InstRow {
  id: string
  code: string
  name_ja: string
  name_en: string
  market: string
  kind: string
  sector_ja: string
  sector_en: string
  status: string
  user_added: number
  yahoo: string
}
const toInst = (r: InstRow): Instrument => ({
  id: r.id,
  code: r.code,
  nameJa: r.name_ja,
  nameEn: r.name_en,
  market: r.market as Market,
  kind: r.kind as InstrumentKind,
  sectorJa: r.sector_ja,
  sectorEn: r.sector_en,
  status: r.status as 'active' | 'delisted',
  userAdded: !!r.user_added,
})

export class Repo {
  constructor(readonly db: Db) {}

  // ---------------------------------------------------------------- instruments
  /** ユニバースを差分で反映する（FR-U4）。一覧から消えた銘柄は delisted にしてデータを残す（FR-U8） */
  applyUniverse(
    rows: UniverseRow[],
    toSymbol: (code: string, kind: InstrumentKind) => string,
    now: string,
  ): { added: number; delisted: number } {
    let added = 0
    let delisted = 0
    this.db.tx(() => {
      const seen = new Set<string>()
      const exists = new Set(this.db.all<{ id: string }>('SELECT id FROM instruments').map((r) => r.id))
      for (const r of rows) {
        const id = idOf(r.code)
        seen.add(id)
        if (!exists.has(id)) added++
        this.db.run(
          `INSERT INTO instruments(id, code, name_ja, name_en, market, kind, sector_ja, sector_en, status, yahoo, updated)
           VALUES(?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
           ON CONFLICT(id) DO UPDATE SET name_ja = excluded.name_ja,
             name_en = CASE WHEN excluded.name_en <> '' THEN excluded.name_en ELSE instruments.name_en END,
             market = excluded.market, kind = excluded.kind, sector_ja = excluded.sector_ja, sector_en = excluded.sector_en,
             status = 'active', updated = excluded.updated`,
          id,
          r.code,
          r.nameJa,
          r.nameEn,
          r.market,
          r.kind,
          r.sectorJa,
          r.sectorEn,
          toSymbol(r.code, r.kind),
          now,
        )
      }
      for (const id of exists) {
        if (seen.has(id) || !id.startsWith('JP:')) continue
        const r = this.db.get<{ status: string }>('SELECT status FROM instruments WHERE id = ?', id)
        if (r?.status === 'active') {
          this.db.run(`UPDATE instruments SET status = 'delisted', updated = ? WHERE id = ?`, now, id)
          delisted++
        }
      }
      this.db.run(
        `INSERT INTO instruments(id, code, name_ja, name_en, market, kind, status, yahoo, updated)
         VALUES(?, 'N225', '日経平均株価', 'Nikkei 225', 'I', 'index', 'active', '^N225', ?) ON CONFLICT(id) DO NOTHING`,
        N225,
        now,
      )
    })
    return { added, delisted }
  }
  setUserAdded(codes: string[]): void {
    const set = new Set(codes.map((c) => idOf(c.toUpperCase())))
    this.db.tx(() => {
      this.db.run('UPDATE instruments SET user_added = 0')
      for (const id of set) this.db.run('UPDATE instruments SET user_added = 1 WHERE id = ?', id)
    })
  }
  /** 取得する銘柄: プライム・J-REIT と利用者の追加、指数（FR-U1〜U3）。廃止銘柄は取らない（FR-U8） */
  fetchSet(): { id: string; yahoo: string }[] {
    return this.db.all<{ id: string; yahoo: string }>(
      `SELECT id, yahoo FROM instruments WHERE status = 'active' AND (market IN ('P', 'R', 'I') OR user_added = 1) ORDER BY
         CASE WHEN market = 'I' THEN 0 ELSE 1 END, code`,
    )
  }
  instrument(id: InstrumentId): Instrument | null {
    const r = this.db.get<InstRow>('SELECT * FROM instruments WHERE id = ?', id)
    return r ? toInst(r) : null
  }
  yahooOf(id: InstrumentId): string | null {
    return this.db.get<{ yahoo: string }>('SELECT yahoo FROM instruments WHERE id = ?', id)?.yahoo ?? null
  }
  instruments(ids: InstrumentId[]): Instrument[] {
    if (!ids.length) return []
    const out: Instrument[] = []
    for (let i = 0; i < ids.length; i += 400) {
      const part = ids.slice(i, i + 400)
      out.push(...this.db.all<InstRow>(`SELECT * FROM instruments WHERE id IN (${part.map(() => '?').join(',')})`, ...part).map(toInst))
    }
    const order = new Map(ids.map((x, i) => [x, i]))
    return out.sort((a, b) => order.get(a.id)! - order.get(b.id)!)
  }
  /** 取得対象と、データを持っている銘柄（スクリーニングと一覧の対象） */
  universe(): Instrument[] {
    return this.db
      .all<InstRow>(
        `SELECT * FROM instruments WHERE (status = 'active' AND (market IN ('P', 'R', 'I') OR user_added = 1)) OR id IN (SELECT id FROM metrics) ORDER BY code`,
      )
      .map(toInst)
  }
  search(q: string, limit: number): Instrument[] {
    const s = q.normalize('NFKC').trim().toUpperCase()
    if (!s) return []
    const like = `%${s}%`
    return this.db
      .all<InstRow>(
        `SELECT * FROM instruments WHERE code LIKE ? OR UPPER(name_ja) LIKE ? OR UPPER(name_en) LIKE ?
         ORDER BY CASE WHEN code = ? THEN 0 WHEN code LIKE ? THEN 1 WHEN market IN ('P','R') THEN 2 ELSE 3 END, code LIMIT ?`,
        `${s}%`,
        like,
        like,
        s,
        `${s}%`,
        limit,
      )
      .map(toInst)
  }
  counts(): { instruments: number; withBars: number } {
    const a = this.db.get<{ n: number }>(
      `SELECT COUNT(*) n FROM instruments WHERE status = 'active' AND (market IN ('P','R','I') OR user_added = 1)`,
    )!.n
    const b = this.db.get<{ n: number }>('SELECT COUNT(*) n FROM fetch_state WHERE last_full IS NOT NULL')!.n
    return { instruments: Number(a), withBars: Number(b) }
  }

  // ---------------------------------------------------------------- bars
  daily(id: InstrumentId, from?: JstDate): DayBar[] {
    const rows = from
      ? this.db.all<{ d: string; o: number; h: number; l: number; c: number; v: number; prov: number }>(
          'SELECT d, o, h, l, c, v, prov FROM daily_bars WHERE id = ? AND d >= ? ORDER BY d',
          id,
          from,
        )
      : this.db.all<{ d: string; o: number; h: number; l: number; c: number; v: number; prov: number }>(
          'SELECT d, o, h, l, c, v, prov FROM daily_bars WHERE id = ? ORDER BY d',
          id,
        )
    return rows.map((r) => ({ d: r.d, o: r.o, h: r.h, l: r.l, c: r.c, v: r.v, ...(r.prov ? { prov: true } : {}) }))
  }
  dailyCount(id: InstrumentId, from: JstDate): number {
    return Number(this.db.get<{ n: number }>('SELECT COUNT(*) n FROM daily_bars WHERE id = ? AND d >= ? AND prov = 0', id, from)!.n)
  }
  lastDaily(id: InstrumentId, real = true): DayBar | null {
    const r = this.db.get<{ d: string; o: number; h: number; l: number; c: number; v: number }>(
      `SELECT d, o, h, l, c, v FROM daily_bars WHERE id = ? ${real ? 'AND prov = 0' : ''} ORDER BY d DESC LIMIT 1`,
      id,
    )
    return r ? { d: r.d, o: r.o, h: r.h, l: r.l, c: r.c, v: r.v } : null
  }
  closeOn(id: InstrumentId, d: JstDate): number | null {
    return this.db.get<{ c: number }>('SELECT c FROM daily_bars WHERE id = ? AND d = ? AND prov = 0', id, d)?.c ?? null
  }
  /** 日足を置き換える（from 以降）。取得に成功してから呼ぶ（FR-S11） */
  replaceDaily(id: InstrumentId, from: JstDate, bars: RawBar[]): void {
    this.db.run('DELETE FROM daily_bars WHERE id = ? AND d >= ?', id, from)
    const st = this.db.raw.prepare('INSERT OR REPLACE INTO daily_bars(id, d, o, h, l, c, v, prov) VALUES(?, ?, ?, ?, ?, ?, ?, 0)')
    for (const b of bars) if (b.d >= from) st.run(id, b.d, b.o, b.h, b.l, b.c, b.v)
  }
  /** 一括気配で当日の「仮」の足を補う（FR-D8）。本物の足があれば触らない */
  putProvisional(id: InstrumentId, b: RawBar): void {
    this.db.run(
      `INSERT INTO daily_bars(id, d, o, h, l, c, v, prov) VALUES(?, ?, ?, ?, ?, ?, ?, 1)
       ON CONFLICT(id, d) DO UPDATE SET o = excluded.o, h = excluded.h, l = excluded.l, c = excluded.c, v = excluded.v WHERE daily_bars.prov = 1`,
      id,
      b.d,
      b.o,
      b.h,
      b.l,
      b.c,
      b.v,
    )
  }
  deleteDailyBefore(d: JstDate): number {
    const n = Number(this.db.get<{ n: number }>('SELECT COUNT(*) n FROM daily_bars WHERE d < ?', d)!.n)
    this.db.run('DELETE FROM daily_bars WHERE d < ?', d)
    return n
  }
  countDailyBefore(d: JstDate): number {
    return Number(this.db.get<{ n: number }>('SELECT COUNT(*) n FROM daily_bars WHERE d < ?', d)!.n)
  }
  barRange(): { oldest: string | null; newest: string | null } {
    const r = this.db.get<{ a: string | null; b: string | null }>('SELECT MIN(d) a, MAX(d) b FROM daily_bars')
    return { oldest: r?.a ?? null, newest: r?.b ?? null }
  }
  monthly(id: InstrumentId): DayBar[] {
    return this.db
      .all<{ m: string; o: number; h: number; l: number; c: number; v: number }>(
        'SELECT m, o, h, l, c, v FROM monthly_bars WHERE id = ? ORDER BY m',
        id,
      )
      .map((r) => ({ d: r.m, o: r.o, h: r.h, l: r.l, c: r.c, v: r.v }))
  }
  replaceMonthly(id: InstrumentId, bars: RawBar[], currentMonth: string): void {
    this.db.run('DELETE FROM monthly_bars WHERE id = ?', id)
    const st = this.db.raw.prepare('INSERT OR REPLACE INTO monthly_bars(id, m, o, h, l, c, v) VALUES(?, ?, ?, ?, ?, ?, ?)')
    // 当月の足は途中の値なので使わない（FR-D7）
    for (const b of bars) if (b.d.slice(0, 7) < currentMonth) st.run(id, b.d, b.o, b.h, b.l, b.c, b.v)
  }

  // ---------------------------------------------------------------- actions
  dividends(id: InstrumentId): Dividend[] {
    return this.db
      .all<{ d: string; value: number }>(`SELECT d, value FROM actions WHERE id = ? AND type = 'div' ORDER BY d`, id)
      .map((r) => ({ date: r.d, amount: r.value }))
  }
  splits(id: InstrumentId): Split[] {
    return this.db
      .all<{ d: string; value: number }>(`SELECT d, value FROM actions WHERE id = ? AND type = 'split' ORDER BY d`, id)
      .map((r) => ({ date: r.d, ratio: r.value }))
  }
  /** from 以降の配当・分割を置き換える（取得に成功してから） */
  replaceActions(id: InstrumentId, from: JstDate, dividends: Dividend[], splits: Split[]): void {
    this.db.run('DELETE FROM actions WHERE id = ? AND d >= ?', id, from)
    const st = this.db.raw.prepare('INSERT OR REPLACE INTO actions(id, d, type, value) VALUES(?, ?, ?, ?)')
    for (const d of dividends) if (d.date >= from) st.run(id, d.date, 'div', d.amount)
    for (const s of splits) if (s.date >= from) st.run(id, s.date, 'split', s.ratio)
  }

  // ---------------------------------------------------------------- quotes
  putQuote(id: InstrumentId, q: ProviderQuote, fetched: string): void {
    this.db.run(
      `INSERT OR REPLACE INTO quotes(id, t, price, open, high, low, volume, prev_close, per, pbr, market_cap, shares, bps, eps, fetched)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      q.time ? new Date(q.time).toISOString() : null,
      q.price,
      q.open,
      q.high,
      q.low,
      q.volume,
      q.prevClose,
      q.per,
      q.pbr,
      q.marketCap,
      q.shares,
      q.bps,
      q.eps,
      fetched,
    )
    if (q.nameEn) this.db.run(`UPDATE instruments SET name_en = ? WHERE id = ? AND name_en = ''`, q.nameEn, id)
  }
  quote(id: InstrumentId): Quote | null {
    const r = this.db.get<Record<string, number | string | null>>('SELECT * FROM quotes WHERE id = ?', id)
    if (!r) return null
    const n = (k: string) => (typeof r[k] === 'number' ? (r[k] as number) : null)
    return {
      id,
      time: (r.t as string) ?? null,
      price: n('price'),
      open: n('open'),
      high: n('high'),
      low: n('low'),
      volume: n('volume'),
      prevClose: n('prev_close'),
      per: n('per'),
      pbr: n('pbr'),
      marketCap: n('market_cap'),
      shares: n('shares'),
      bps: n('bps'),
      eps: n('eps'),
    }
  }

  // ---------------------------------------------------------------- metrics
  putMetrics(m: MetricsRow): void {
    const cols = ['id', 'as_of', 'prov', 'record_months', 'gap_suspect', ...METRIC_COLUMNS]
    this.db.run(
      `INSERT OR REPLACE INTO metrics(${cols.join(',')}) VALUES(${cols.map(() => '?').join(',')})`,
      m.id,
      m.asOf,
      m.provisional ? 1 : 0,
      m.recordMonths.join(','),
      m.gapSuspect ? 1 : 0,
      ...METRIC_COLUMNS.map((c) => m[c] as number | null),
    )
  }
  metrics(ids?: InstrumentId[]): MetricsRow[] {
    const rows = ids
      ? ids.length
        ? this.db.all<Record<string, number | string | null>>(`SELECT * FROM metrics WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids)
        : []
      : this.db.all<Record<string, number | string | null>>('SELECT * FROM metrics')
    return rows.map((r) => {
      const out: Record<string, unknown> = {
        id: r.id,
        asOf: r.as_of,
        provisional: !!r.prov,
        stale: false,
        recordMonths: r.record_months ? String(r.record_months).split(',').map(Number) : [],
        gapSuspect: !!r.gap_suspect,
      }
      for (const c of METRIC_COLUMNS) out[c] = typeof r[c] === 'number' ? r[c] : null
      return out as unknown as MetricsRow
    })
  }

  // ---------------------------------------------------------------- fetch state
  markFetched(id: InstrumentId, kind: 'full' | 'daily' | 'monthly', at: string): void {
    const col = kind === 'full' ? 'last_full' : kind === 'monthly' ? 'last_monthly' : 'last_daily'
    this.db.run(
      `INSERT INTO fetch_state(id, ${col}, last_daily, fails) VALUES(?, ?, ?, 0)
       ON CONFLICT(id) DO UPDATE SET ${col} = excluded.${col}, last_daily = excluded.last_daily, fails = 0`,
      id,
      at,
      at,
    )
  }
  markFailed(id: InstrumentId, reason: string, at: string): void {
    this.db.run(
      `INSERT INTO fetch_state(id, fails, last_error, last_error_at) VALUES(?, 1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET fails = fails + 1, last_error = excluded.last_error, last_error_at = excluded.last_error_at`,
      id,
      reason.slice(0, 300),
      at,
    )
  }
  fetchState(id: InstrumentId): { lastFull: string | null; lastMonthly: string | null } {
    const r = this.db.get<{ last_full: string | null; last_monthly: string | null }>(
      'SELECT last_full, last_monthly FROM fetch_state WHERE id = ?',
      id,
    )
    return { lastFull: r?.last_full ?? null, lastMonthly: r?.last_monthly ?? null }
  }
  failures(): { id: string; at: string; reason: string }[] {
    return this.db
      .all<{ id: string; last_error_at: string; last_error: string }>(
        'SELECT id, last_error_at, last_error FROM fetch_state WHERE fails > 0 AND last_error IS NOT NULL ORDER BY last_error_at DESC LIMIT 500',
      )
      .map((r) => ({ id: r.id, at: r.last_error_at, reason: r.last_error }))
  }

  /** 全データの削除（FR-S6）。廃止銘柄は既定で残す */
  resetMarketData(keepDelisted: boolean): void {
    this.db.tx(() => {
      const keep = keepDelisted ? `WHERE id NOT IN (SELECT id FROM instruments WHERE status = 'delisted')` : ''
      for (const t of ['daily_bars', 'monthly_bars', 'actions', 'quotes', 'metrics', 'fetch_state']) this.db.run(`DELETE FROM ${t} ${keep}`)
      this.db.run(`DELETE FROM meta WHERE key IN ('universeUpdated', 'lastUpdate')`)
    })
  }
}
