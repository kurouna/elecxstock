// 取得ジョブ（§3.2）: 永続化されたキュー（FR-F1）、レート制御（F2）、失敗の分類とバックオフ（F3）、
// 進捗の通知（F4）、表示中の銘柄を先に（F8）、日々の更新方式（F9）、分割の検知と取り直し（FR-D3, S11）。
import type { InstrumentId, JobKind, JobProgress, JstDate } from '@shared/types'
import { addDays, addYears, CLOSE_MINUTES, isTradingDay, jstNow, lastClosedSession, prevTradingDay, toJstDate } from './calendar'
import { computeMetrics } from './metrics'
import { type Provider, ProviderError, type RawBar } from './providers/types'
import { idOf, type Repo } from './repo'

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((res, rej) => {
    const t = setTimeout(res, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      rej(new Error('aborted'))
    })
  })
const nowIso = () => new Date().toISOString()

export interface JobsHost {
  repo: Repo
  provider: Provider
  retentionYears: () => number
  userCodes: () => string[]
  emitProgress: (p: JobProgress) => void
  emitData: (ids: InstrumentId[]) => void
  emitProvider: (s: { offline: boolean; paused: boolean; message?: string }) => void
  log: (msg: string) => void
}

interface JobRow {
  id: number
  kind: JobKind
  status: JobProgress['status']
  items: string
  pos: number
  failed: number
}

/** 項目: 'U' ユニバース / 'Q:<n>' 一括気配のバッチ / 'H:<id>:<from>' 日足 / 'F:<id>' 全期間取り直し / 'M:<id>' 月次系列 / 'X' 指標の再計算 */
export class JobRunner {
  private running = false
  private abort: AbortController | null = null
  private lastCall = 0
  private priority = new Set<InstrumentId>()
  private consecutiveProviderErrors = 0
  private startedAt = 0
  private doneThisRun = 0
  private pendingData = new Set<InstrumentId>()
  private dataTimer: ReturnType<typeof setTimeout> | null = null
  offline = false

  constructor(private h: JobsHost) {}

  // ---------------------------------------------------------------- queue
  enqueue(kind: JobKind, items: string[]): number {
    const db = this.h.repo.db
    // 同じ種類の未完了ジョブがあれば足さずにそれを返す
    const dup = db.get<{ id: number }>(
      `SELECT id FROM jobs WHERE kind = ? AND status IN ('queued','running','paused','waiting-offline','provider-paused')`,
      kind,
    )
    if (dup && kind !== 'refetch') return dup.id
    db.run(
      `INSERT INTO jobs(kind, status, items, pos, failed, created, updated) VALUES(?, 'queued', ?, 0, 0, ?, ?)`,
      kind,
      JSON.stringify(items),
      nowIso(),
      nowIso(),
    )
    const id = db.get<{ id: number }>('SELECT last_insert_rowid() id')!.id
    this.kick()
    return Number(id)
  }
  list(): JobProgress[] {
    return this.h.repo.db.all<JobRow>(`SELECT * FROM jobs ORDER BY id DESC LIMIT 20`).map((j) => this.progressOf(j))
  }
  cancel(id: number): void {
    this.h.repo.db.run(`UPDATE jobs SET status = 'cancelled', updated = ? WHERE id = ? AND status NOT IN ('done','failed')`, nowIso(), id)
    this.abort?.abort()
  }
  cancelAll(): void {
    this.h.repo.db.run(`UPDATE jobs SET status = 'cancelled', updated = ? WHERE status NOT IN ('done','failed','cancelled')`, nowIso())
    this.abort?.abort()
  }
  prioritize(ids: InstrumentId[]): void {
    this.priority = new Set(ids)
  }
  /** 起動時に、閉じる前に終わっていなかったジョブから再開する（FR-F1） */
  resume(): void {
    this.h.repo.db.run(`UPDATE jobs SET status = 'queued' WHERE status IN ('running','waiting-offline','provider-paused')`)
    this.kick()
  }
  private kick(): void {
    if (this.running) return
    this.running = true
    void this.loop().finally(() => {
      this.running = false
    })
  }

  private progressOf(j: JobRow, msg?: string): JobProgress {
    const items = JSON.parse(j.items) as string[]
    const elapsed = (Date.now() - this.startedAt) / 1000
    const rate = this.doneThisRun > 3 && elapsed > 0 ? this.doneThisRun / elapsed : null
    return {
      id: j.id,
      kind: j.kind,
      status: j.status,
      done: j.pos,
      total: items.length,
      failed: j.failed,
      etaSec: rate ? Math.round((items.length - j.pos) / rate) : null,
      ...(msg ? { message: msg } : {}),
    }
  }

  private async loop(): Promise<void> {
    const db = this.h.repo.db
    for (;;) {
      const j = db.get<JobRow>(`SELECT * FROM jobs WHERE status = 'queued' ORDER BY id LIMIT 1`)
      if (!j) return
      db.run(`UPDATE jobs SET status = 'running', updated = ? WHERE id = ?`, nowIso(), j.id)
      j.status = 'running'
      this.startedAt = Date.now()
      this.doneThisRun = 0
      this.abort = new AbortController()
      const items = JSON.parse(j.items) as string[]
      let lastEmit = 0
      while (j.pos < items.length) {
        const st = db.get<{ status: string }>('SELECT status FROM jobs WHERE id = ?', j.id)?.status
        if (st === 'cancelled') break
        // 表示中の銘柄を先に（FR-F8）
        const pi = this.priority.size
          ? items.findIndex((it, i) => i >= j.pos && it.startsWith('H:') && this.priority.has(it.split(':').slice(1, 3).join(':')))
          : -1
        if (pi > j.pos) {
          const [it] = items.splice(pi, 1)
          items.splice(j.pos, 0, it!)
        }
        const item = items[j.pos]!
        try {
          const extra = await this.runItem(j.kind, item, this.abort.signal)
          if (extra?.length) items.push(...extra)
          this.consecutiveProviderErrors = 0
          if (this.offline) {
            this.offline = false
            this.h.emitProvider({ offline: false, paused: false })
          }
        } catch (e) {
          if (this.abort.signal.aborted) break
          const pe = e instanceof ProviderError ? e : new ProviderError('symbol', String((e as Error)?.message ?? e))
          if (pe.scope === 'offline') {
            // 通信断は失敗に数えず、復帰を待つ（FR-F3）
            this.offline = true
            this.h.emitProvider({ offline: true, paused: false, message: pe.message })
            j.status = 'waiting-offline'
            this.h.emitProgress(this.progressOf({ ...j, items: JSON.stringify(items) }))
            await sleep(30_000, this.abort.signal).catch(() => {})
            j.status = 'running'
            continue
          }
          if (pe.scope === 'provider') {
            this.consecutiveProviderErrors++
            if (this.consecutiveProviderErrors >= 5) {
              j.status = 'provider-paused'
              this.h.emitProvider({ offline: false, paused: true, message: pe.message })
              this.h.emitProgress(this.progressOf({ ...j, items: JSON.stringify(items) }, pe.message))
              await sleep(10 * 60_000, this.abort.signal).catch(() => {})
              this.consecutiveProviderErrors = 0
              this.h.emitProvider({ offline: false, paused: false })
              j.status = 'running'
              continue
            }
            await sleep(Math.min(60_000, 2000 * 2 ** this.consecutiveProviderErrors), this.abort.signal).catch(() => {})
            continue
          }
          // 銘柄単位の失敗は記録して次へ（NFR-R2）。停止の判定には数えない
          j.failed++
          const id = item.split(':').slice(1, 3).join(':')
          if (id.includes(':')) this.h.repo.markFailed(id, pe.message, nowIso())
          this.h.log(`fetch failed ${item}: ${pe.message}`)
        }
        j.pos++
        this.doneThisRun++
        db.run(
          `UPDATE jobs SET pos = ?, failed = ?, items = ?, updated = ? WHERE id = ?`,
          j.pos,
          j.failed,
          JSON.stringify(items),
          nowIso(),
          j.id,
        )
        if (Date.now() - lastEmit > 300 || j.pos === items.length) {
          lastEmit = Date.now()
          this.h.emitProgress(this.progressOf({ ...j, items: JSON.stringify(items) }))
        }
      }
      const st = db.get<{ status: string }>('SELECT status FROM jobs WHERE id = ?', j.id)?.status
      if (st !== 'cancelled') {
        db.run(`UPDATE jobs SET status = 'done', updated = ? WHERE id = ?`, nowIso(), j.id)
        if (j.kind === 'initial' || j.kind === 'daily' || j.kind === 'reset') db.setMeta('lastUpdate', nowIso())
      }
      this.h.emitProgress(this.progressOf({ ...j, status: st === 'cancelled' ? 'cancelled' : 'done', items: JSON.stringify(items) }))
      this.flushData()
    }
  }

  /** 1 リクエストの前に呼ぶ: 最小間隔 + 揺らぎ（FR-F2） */
  private async throttle(signal: AbortSignal): Promise<void> {
    const p = this.h.provider
    const wait = this.lastCall + p.minIntervalMs + Math.random() * p.jitterMs - Date.now()
    if (wait > 0) await sleep(wait, signal)
    this.lastCall = Date.now()
  }

  private dataChanged(id: InstrumentId): void {
    this.pendingData.add(id)
    if (!this.dataTimer) this.dataTimer = setTimeout(() => this.flushData(), 1000)
  }
  private flushData(): void {
    if (this.dataTimer) clearTimeout(this.dataTimer)
    this.dataTimer = null
    if (this.pendingData.size) this.h.emitData([...this.pendingData])
    this.pendingData.clear()
  }

  retentionStart(): JstDate {
    return addYears(jstNow().date, -this.h.retentionYears())
  }

  // ---------------------------------------------------------------- items
  private async runItem(kind: JobKind, item: string, signal: AbortSignal): Promise<string[] | undefined> {
    const [t, ...rest] = item.split(':')
    if (t === 'U') return this.universe(kind, signal)
    if (t === 'Q') return this.quotes(kind, Number(rest[0]), signal)
    if (t === 'H') return this.history(`${rest[0]}:${rest[1]}`, rest[2] ?? this.retentionStart(), signal)
    if (t === 'F') return this.history(`${rest[0]}:${rest[1]}`, this.retentionStart(), signal, true)
    if (t === 'M') return this.monthly(`${rest[0]}:${rest[1]}`, signal)
    if (t === 'X') {
      this.recomputeAll()
      return undefined
    }
    return undefined
  }

  /** ユニバースの取り込み（FR-U1〜U4）。続く項目（気配・日足・月足）をこのジョブに足す */
  private async universe(kind: JobKind, signal: AbortSignal): Promise<string[]> {
    await this.throttle(signal)
    const rows = await this.h.provider.fetchUniverse({ signal })
    if (rows.length < 10) throw new ProviderError('provider', 'universe too small')
    const r = this.h.repo.applyUniverse(rows, this.h.provider.toSymbol, nowIso())
    this.h.repo.setUserAdded(this.h.userCodes())
    this.h.repo.db.setMeta('universeUpdated', nowIso())
    this.h.log(`universe: ${rows.length} rows, +${r.added}, delisted ${r.delisted}`)
    if (kind === 'universe') return []
    return this.planFor(kind)
  }

  /** 初回・全データの取り直し（FR-S6）・日々の更新（FR-F9）の項目を作る */
  planFor(kind: JobKind): string[] {
    const set = this.h.repo.fetchSet()
    const batches = Math.ceil(set.length / this.h.provider.quoteBatchSize)
    const q = Array.from({ length: batches }, (_, i) => `Q:${i}`)
    if (kind === 'daily') return [...q, 'X']
    // 初回: 気配 → 日足（全期間）→ 指標 → 月次系列（低い優先度、FR-D7）
    return [...q, ...set.map((s) => `F:${s.id}`), 'X', ...set.map((s) => `M:${s.id}`)]
  }

  /** 一括気配（FR-F5）。日々の更新では、当日の仮の足を作り、取り直しが要る銘柄を足す（FR-D8, F9） */
  private async quotes(kind: JobKind, batch: number, signal: AbortSignal): Promise<string[]> {
    const set = this.h.repo.fetchSet()
    const size = this.h.provider.quoteBatchSize
    const part = set.slice(batch * size, batch * size + size)
    if (!part.length) return []
    await this.throttle(signal)
    const qs = await this.h.provider.fetchQuotes(
      part.map((p) => p.yahoo),
      { signal },
    )
    const bySym = new Map(qs.map((q) => [q.symbol, q]))
    const extra: string[] = []
    const session = lastClosedSession()
    const today = jstNow()
    const rotation = Math.floor(Date.parse(`${today.date}T00:00:00Z`) / 86400_000) % 20
    const repo = this.h.repo
    repo.db.tx(() => {
      for (const p of part) {
        const q = bySym.get(p.yahoo)
        if (!q) continue
        repo.putQuote(p.id, q, nowIso())
        if (kind !== 'daily') continue
        const last = repo.lastDaily(p.id)
        if (!last) {
          extra.push(`F:${p.id}`)
          continue
        }
        // 仮の足: 気配の時刻が大引け以降のときだけ（FR-D8）
        if (q.time && q.price != null) {
          const qd = toJstDate(q.time)
          const qMin = jstNow(q.time).minutes
          if (qd === session && isTradingDay(qd) && (qMin >= CLOSE_MINUTES || qd < today.date) && qd > last.d) {
            repo.putProvisional(p.id, {
              d: qd,
              o: q.open ?? q.price,
              h: q.high ?? q.price,
              l: q.low ?? q.price,
              c: q.price,
              v: q.volume ?? 0,
            })
          }
          // 分割・併合の疑い: 気配の前日終値と保存済みの終値の食い違い（FR-F9 a）
          const prevDay = qd === session ? prevTradingDay(qd) : qd
          const stored = repo.closeOn(p.id, prevDay)
          if (stored && q.prevClose && Math.abs(q.prevClose / stored - 1) > 0.005) {
            extra.push(`F:${p.id}`)
            continue
          }
        }
        // 2 営業日以上の取りこぼし（FR-F9 b）
        if (last.d < prevTradingDay(session)) {
          extra.push(`H:${p.id}:${addDays(last.d, -10)}`)
          continue
        }
        // 定期照合: 毎日 1/20 ずつ（FR-F9 c）。遅れて載った配当を拾うため 400 日分を取る
        let hsh = 0
        for (const ch of p.id) hsh = (hsh * 31 + ch.charCodeAt(0)) >>> 0
        if (hsh % 20 === rotation) extra.push(`H:${p.id}:${addDays(session, -400)}`)
      }
    })
    for (const p of part) this.dataChanged(p.id)
    return extra
  }

  /** 日足の取得。取得に成功してから置き換える（FR-S11）。分割を見つけたら全期間を取り直す（FR-D3） */
  private async history(id: InstrumentId, from: JstDate, signal: AbortSignal, full = false): Promise<string[] | undefined> {
    const repo = this.h.repo
    const sym = repo.yahooOf(id)
    if (!sym) return undefined
    const start = full ? this.retentionStart() : from
    await this.throttle(signal)
    const r = await this.h.provider.fetchHistory(sym, { from: start, interval: '1d', signal })
    if (!r.bars.length) throw new ProviderError('symbol', 'empty response')
    if (!full) {
      const known = new Set(repo.splits(id).map((s) => s.date))
      const newSplit = r.splits.some((s) => !known.has(s.date))
      // 重ね取り区間で保存済みの終値と食い違えば、分割・併合を疑って全期間を取り直す
      let mismatch = false
      for (const b of r.bars.slice(0, 10)) {
        const c = repo.closeOn(id, b.d)
        if (c && Math.abs(b.c / c - 1) > 0.005) mismatch = true
      }
      if (newSplit || mismatch) return this.history(id, start, signal, true)
    } else {
      const existing = repo.dailyCount(id, start)
      if (existing > 50 && r.bars.length < existing * 0.5)
        throw new ProviderError('symbol', `suspicious response (${r.bars.length} < ${existing})`)
    }
    repo.db.tx(() => {
      repo.replaceDaily(id, start, r.bars)
      repo.replaceActions(id, full ? '0000-00-00' : start, r.dividends, r.splits)
      repo.markFetched(id, full ? 'full' : 'daily', nowIso())
      this.recompute(id)
    })
    this.dataChanged(id)
    return undefined
  }

  /** 月次系列（FR-D7）: 1 銘柄 1 リクエストで上場以来の月足 */
  private async monthly(id: InstrumentId, signal: AbortSignal): Promise<undefined> {
    const repo = this.h.repo
    const sym = repo.yahooOf(id)
    if (!sym) return undefined
    await this.throttle(signal)
    const r = await this.h.provider.fetchHistory(sym, { from: '1999-01-01', interval: '1mo', signal })
    const month = jstNow().date.slice(0, 7)
    repo.db.tx(() => {
      repo.replaceMonthly(id, r.bars as RawBar[], month)
      repo.markFetched(id, 'monthly', nowIso())
    })
    this.dataChanged(id)
    return undefined
  }

  recompute(id: InstrumentId): void {
    const repo = this.h.repo
    const m = computeMetrics(id, repo.daily(id), repo.dividends(id), repo.splits(id), repo.quote(id), lastClosedSession())
    repo.putMetrics(m)
  }
  recomputeAll(): void {
    const repo = this.h.repo
    const ids = [...repo.fetchSet().map((s) => s.id)]
    for (let i = 0; i < ids.length; i += 100) {
      repo.db.tx(() => {
        for (const id of ids.slice(i, i + 100)) this.recompute(id)
      })
    }
    this.h.emitData(['*'])
  }
}

export { idOf }
