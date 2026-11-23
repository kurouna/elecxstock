// 取得ジョブ（§3.2）: 永続化されたキュー（FR-F1）、レート制御（F2）、失敗の分類とバックオフ（F3）、
// 進捗の通知（F4）、表示中の銘柄を先に（F8）、日々の更新方式（F9）、分割の検知と取り直し（FR-D3, S11）。
import { isExternal } from '@shared/markets'
import type { InstrumentId, InstrumentKind, JobKind, JobProgress, JstDate } from '@shared/types'
import {
  addDays,
  addYears,
  CLOSE_MINUTES,
  isTradingDay,
  jstNow,
  lastClosedSession,
  prevTradingDay,
  retentionStart,
  toJstDate,
} from './calendar'
import { computeMetrics, METRIC_BARS } from './metrics'
import { type Provider, ProviderError, type RawBar } from './providers/types'
import { idOf, N225, type Repo } from './repo'

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((res, rej) => {
    const onAbort = () => {
      clearTimeout(t)
      rej(new Error('aborted'))
    }
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort) // ジョブの間に聞き手が溜まらないように
      res()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
const nowIso = () => new Date().toISOString()

export interface JobsHost {
  repo: Repo
  provider: Provider
  retentionYears: () => number
  userCodes: () => string[]
  /** ウォッチリストと保有の銘柄（取得の順位を上げる。FR-F8） */
  listed: () => Set<InstrumentId>
  emitProgress: (p: JobProgress) => void
  emitData: (ids: InstrumentId[]) => void
  emitProvider: (s: { offline: boolean; paused: boolean; message?: string }) => void
  log: (msg: string) => void
  /** ジョブが終わった（done）とき。アラートの判定に使う（FR-AL3）。例外は投げない */
  jobDone?: (kind: JobKind) => void
}

interface JobRow {
  id: number
  kind: JobKind
  status: JobProgress['status']
  items: string
  pos: number
  failed: number
  created: string
}

/**
 * 項目: 'U' ユニバース / 'Q:<n>' 一括気配のバッチ / 'R:<id>,<id>…' 銘柄を指定した気配 / 'H:<id>:<from>' 日足 /
 * 'F:<id>' 全期間取り直し / 'M:<id>' 月次系列 / 'X' 指標の再計算 / 'C' 取りこぼしの確認（初回・日々の更新の最後に 1 回）
 */
/** 参照の行（指数・為替など。市場 I）。気配の取り直し・日足の取りこぼしの確認の対象にしない */
const isIndex = (id: InstrumentId) => id.startsWith('IDX:')
/** 遅い間隔を使う長さの既定（プロバイダが slowForMs を持たないとき。24 時間） */
const DEFAULT_SLOW_FOR_MS = 24 * 60 * 60 * 1000

/**
 * リクエストの間隔と揺らぎ（FR-F2）。slowed（429 を受けた）なら遅い間隔を使う。
 * 遅い間隔が無い・最小間隔より短いプロバイダは、遅くしない（速くもしない）
 */
export function paceOf(
  p: Pick<Provider, 'minIntervalMs' | 'jitterMs' | 'slowIntervalMs' | 'slowJitterMs'>,
  slowed: boolean,
): { intervalMs: number; jitterMs: number } {
  if (slowed && p.slowIntervalMs != null && p.slowIntervalMs > p.minIntervalMs)
    return { intervalMs: p.slowIntervalMs, jitterMs: p.slowJitterMs ?? p.jitterMs }
  return { intervalMs: p.minIntervalMs, jitterMs: p.jitterMs }
}

export class JobRunner {
  private running = false
  /** 閉じる途中（新しいジョブ・項目を始めない） */
  private stopping = false
  private abort: AbortController | null = null
  /** 実行中のジョブの ID（止めるのはこのジョブだけ） */
  private currentId: number | null = null
  private lastCall = 0
  /** 429 を受けて遅い間隔にした時刻（ms。0 は遅くしていない。FR-F2） */
  private slowedAt = 0
  /** 429 を受けて遅い間隔にしているか。24 時間たったら元の間隔から試し直す（常駐で Core が長く動き続けても戻るように） */
  get slowed(): boolean {
    return this.slowedAt > 0 && Date.now() - this.slowedAt < (this.h.provider.slowForMs ?? DEFAULT_SLOW_FOR_MS)
  }
  private priority = new Set<InstrumentId>()
  /** 実行中のジョブを作った時刻（取りこぼしの確認で、このジョブで取った気配かを見分ける） */
  private jobSince = ''
  private consecutiveProviderErrors = 0
  private startedAt = 0
  private doneThisRun = 0
  private pendingData = new Set<InstrumentId>()
  private dataTimer: ReturnType<typeof setTimeout> | null = null
  offline = false

  constructor(private h: JobsHost) {}

  // ---------------------------------------------------------------- queue
  /** 未完了のその種類のジョブに残っている項目と、いちばん新しいジョブの ID */
  private pendingOf(kind: JobKind): { items: Set<string>; last: number | null } {
    const items = new Set<string>()
    let last: number | null = null
    for (const r of this.h.repo.db.all<{ id: number; items: string; pos: number }>(
      `SELECT id, items, pos FROM jobs WHERE kind = ? AND status IN ('queued','running','paused','waiting-offline','provider-paused')`,
      kind,
    )) {
      for (const it of (JSON.parse(r.items) as string[]).slice(r.pos)) items.add(it)
      last = r.id
    }
    return { items, last }
  }
  /** その項目が未完了のその種類のジョブに残っているか（同じ取得を別の種類で重ねないため） */
  isPending(kind: JobKind, item: string): boolean {
    return this.pendingOf(kind).items.has(item)
  }
  enqueue(kind: JobKind, itemsIn: string[]): number {
    let items = itemsIn
    const db = this.h.repo.db
    // 同じ種類の未完了ジョブがあれば足さずにそれを返す
    const dup = db.get<{ id: number }>(
      `SELECT id FROM jobs WHERE kind = ? AND status IN ('queued','running','paused','waiting-offline','provider-paused')`,
      kind,
    )
    if (dup && kind !== 'refetch') {
      this.resumeJob(dup.id) // 一時停止中なら再開する
      return dup.id
    }
    if (kind === 'refetch') {
      // 待っている・実行中の取り直しに同じ項目があれば重ねない（ウォッチリストの保存のたびに増えないように）
      const { items: pending, last } = this.pendingOf('refetch')
      items = items.filter((it) => !pending.has(it))
      if (!items.length && last != null) return last
    }
    db.run(
      `INSERT INTO jobs(kind, status, items, pos, failed, created, updated) VALUES(?, 'queued', ?, 0, 0, ?, ?)`,
      kind,
      JSON.stringify(items),
      nowIso(),
      nowIso(),
    )
    const id = db.get<{ id: number }>('SELECT last_insert_rowid() id')!.id
    // 積んだらすぐ知らせる（最初の項目が終わるまで、状態の帯が「待機中」のままにならないように）
    const row = db.get<JobRow>('SELECT * FROM jobs WHERE id = ?', id)
    if (row) this.h.emitProgress(this.progressOf(row))
    this.kick()
    return Number(id)
  }
  list(): JobProgress[] {
    return this.h.repo.db.all<JobRow>(`SELECT * FROM jobs ORDER BY id DESC LIMIT 20`).map((j) => this.progressOf(j))
  }
  cancel(id: number): void {
    this.h.repo.db.run(`UPDATE jobs SET status = 'cancelled', updated = ? WHERE id = ? AND status NOT IN ('done','failed')`, nowIso(), id)
    if (this.currentId === id) this.abort?.abort() // 実行中のジョブだけを止める（待っているジョブの取り消しで、実行中のものを止めない）
  }
  cancelAll(): void {
    this.h.repo.db.run(`UPDATE jobs SET status = 'cancelled', updated = ? WHERE status NOT IN ('done','failed','cancelled')`, nowIso())
    this.abort?.abort()
  }
  /** 一時停止と再開（FR-F4） */
  pause(id: number): void {
    this.h.repo.db.run(
      `UPDATE jobs SET status = 'paused', updated = ? WHERE id = ? AND status IN ('queued','running','waiting-offline','provider-paused')`,
      nowIso(),
      id,
    )
    if (this.currentId === id) this.abort?.abort()
  }
  resumeJob(id: number): void {
    this.h.repo.db.run(`UPDATE jobs SET status = 'queued', updated = ? WHERE id = ? AND status = 'paused'`, nowIso(), id)
    this.kick()
  }
  prioritize(ids: InstrumentId[]): void {
    this.priority = new Set(ids)
  }
  /**
   * アプリを閉じるとき（FR-F1）: 実行中の項目を止め、ループが抜けるのを待つ。実行中のジョブは「待ち」に戻して、
   * 次の起動で続きから再開する（項目の書き込みは 1 つのトランザクションなので、途中で止めても半端な状態は残らない）
   */
  async stop(timeoutMs = 2000): Promise<void> {
    this.stopping = true
    this.abort?.abort()
    const until = Date.now() + timeoutMs
    while (this.running && Date.now() < until) await sleep(20)
    this.h.repo.db.run(`UPDATE jobs SET status = 'queued' WHERE status IN ('running','waiting-offline','provider-paused')`)
    this.flushData()
  }
  /** 起動時に、閉じる前に終わっていなかったジョブから再開する（FR-F1） */
  resume(): void {
    this.h.repo.db.run(`UPDATE jobs SET status = 'queued' WHERE status IN ('running','waiting-offline','provider-paused')`)
    this.kick()
  }
  /**
   * 実行中のジョブの待ち（通信断・プロバイダの停止）と、待ちから戻ったことを DB にも書く（jobs.list で読み直しても待ちに見える）。
   * 待っている間に一時停止・取り消し・閉じる（待ちに戻す）で変わった状態は上書きしない
   */
  private setWaiting(j: JobRow, status: 'waiting-offline' | 'provider-paused' | 'running'): void {
    const from = status === 'running' ? j.status : 'running'
    j.status = status
    this.h.repo.db.run(`UPDATE jobs SET status = ?, updated = ? WHERE id = ? AND status = ?`, status, nowIso(), j.id, from)
  }
  private kick(): void {
    if (this.running || this.stopping) return
    this.running = true
    void this.loop().finally(() => {
      this.running = false
    })
  }

  /**
   * ジョブの進み具合。total は項目の数で、実行中のジョブは手元の項目の列の長さを渡す
   * （進捗を知らせるたびに数千項目の JSON を作って読み直さない）。渡さなければ保存した列から数える
   */
  private progressOf(j: JobRow, msg?: string, total: number = (JSON.parse(j.items) as string[]).length): JobProgress {
    const elapsed = (Date.now() - this.startedAt) / 1000
    const rate = this.doneThisRun > 3 && elapsed > 0 ? this.doneThisRun / elapsed : null
    return {
      id: j.id,
      kind: j.kind,
      status: j.status,
      done: j.pos,
      total,
      failed: j.failed,
      etaSec: rate ? Math.round((total - j.pos) / rate) : null,
      ...(msg ? { message: msg } : {}),
    }
  }

  private async loop(): Promise<void> {
    const db = this.h.repo.db
    for (;;) {
      if (this.stopping) return
      const j = db.get<JobRow>(`SELECT * FROM jobs WHERE status = 'queued' ORDER BY id LIMIT 1`)
      if (!j) return
      db.run(`UPDATE jobs SET status = 'running', updated = ? WHERE id = ?`, nowIso(), j.id)
      j.status = 'running'
      this.startedAt = Date.now()
      this.doneThisRun = 0
      this.abort = new AbortController()
      this.currentId = j.id
      const items = JSON.parse(j.items) as string[]
      let itemsDirty = false
      let lastEmit = 0
      let failMsg: string | null = null
      this.jobSince = j.created
      for (;;) {
        if (j.pos >= items.length) {
          // 初回・日々の更新は、最後に 1 回だけ取りこぼしを確かめる（その確認から出た項目のあとには、もう確かめない）
          if ((j.kind === 'daily' || j.kind === 'initial') && !items.includes('C')) {
            items.push('C')
            itemsDirty = true
          } else break
        }
        const st = db.get<{ status: string }>('SELECT status FROM jobs WHERE id = ?', j.id)?.status
        if (st === 'cancelled' || st === 'paused' || this.stopping) break
        // 表示中の銘柄を先に（FR-F8）。日足（H・F）と月次系列（M）のどちらも
        const pi = this.priority.size
          ? items.findIndex((it, i) => i >= j.pos && /^[HFM]:/.test(it) && this.priority.has(it.split(':').slice(1, 3).join(':')))
          : -1
        if (pi > j.pos) {
          const [it] = items.splice(pi, 1)
          items.splice(j.pos, 0, it!)
          itemsDirty = true
        }
        const item = items[j.pos]!
        try {
          const extra = await this.runItem(j.kind, item, this.abort.signal)
          if (extra?.length) {
            // ウォッチリスト・保有の銘柄の取り直しは、この項目のすぐあとに（次の気配のバッチより先。FR-F8）。ほかは最後に
            const first = this.h.listed()
            const idOfItem = (it: string) => it.split(':').slice(1, 3).join(':')
            items.splice(j.pos + 1, 0, ...extra.filter((it) => first.has(idOfItem(it))))
            items.push(...extra.filter((it) => !first.has(idOfItem(it))))
            itemsDirty = true
          }
          this.consecutiveProviderErrors = 0
          if (this.offline) {
            this.offline = false
            this.h.log('online again')
            this.h.emitProvider({ offline: false, paused: false })
          }
        } catch (e) {
          if (this.abort.signal.aborted) break
          const pe0 = e instanceof ProviderError ? e : null
          if (item === 'U' && pe0?.scope !== 'offline' && pe0?.scope !== 'provider') {
            // 銘柄一覧が取れなければ続けられない（FR-FR3）: 理由を残してジョブを失敗にする
            failMsg = String((e as Error)?.message ?? e)
            break
          }
          const pe = e instanceof ProviderError ? e : new ProviderError('symbol', String((e as Error)?.message ?? e))
          if (pe.scope === 'offline') {
            // 通信断は失敗に数えず、復帰を待つ（FR-F3）。ログには切れたときに 1 回だけ書く（NFR-R3）
            if (!this.offline) this.h.log(`offline ${item}: ${pe.message}`)
            this.offline = true
            this.h.emitProvider({ offline: true, paused: false, message: pe.message })
            this.setWaiting(j, 'waiting-offline')
            this.h.emitProgress(this.progressOf(j, undefined, items.length))
            await sleep(30_000, this.abort.signal).catch(() => {})
            this.setWaiting(j, 'running')
            continue
          }
          if (pe.scope === 'provider') {
            // 回数の制限（429）を受けたら、24 時間は遅い間隔に落とす（FR-F2。再起動しても元の間隔から試し直す）
            if (pe.status === 429) {
              const slow = paceOf(this.h.provider, true)
              if (slow.intervalMs > this.h.provider.minIntervalMs) {
                // 遅くしている間にまた 429 を受けたら、その時刻から数え直す（ログは遅くしたときに 1 回だけ。NFR-R3）
                if (!this.slowed)
                  this.h.log(
                    `rate limited: interval ${slow.intervalMs}+${slow.jitterMs}ms for ${Math.round((this.h.provider.slowForMs ?? DEFAULT_SLOW_FOR_MS) / 3_600_000)}h`,
                  )
                this.slowedAt = Date.now()
              }
            }
            this.consecutiveProviderErrors++
            this.h.log(`provider error ${item} (${this.consecutiveProviderErrors}): ${pe.message}`) // NFR-R3
            if (this.consecutiveProviderErrors >= 5) {
              this.setWaiting(j, 'provider-paused')
              this.h.log(`provider paused for 10 min: ${pe.message}`)
              this.h.emitProvider({ offline: false, paused: true, message: pe.message })
              this.h.emitProgress(this.progressOf(j, pe.message, items.length))
              await sleep(10 * 60_000, this.abort.signal).catch(() => {})
              this.consecutiveProviderErrors = 0
              this.h.emitProvider({ offline: false, paused: false })
              this.setWaiting(j, 'running')
              continue
            }
            await sleep(Math.min(60_000, 2000 * 2 ** this.consecutiveProviderErrors), this.abort.signal).catch(() => {})
            continue
          }
          // 銘柄単位の失敗は記録して次へ（NFR-R2）。停止の判定には数えない
          j.failed++
          const id = item.split(':').slice(1, 3).join(':')
          if (/^[HFM]:/.test(item)) this.h.repo.markFailed(id, pe.message, nowIso())
          this.h.log(`fetch failed ${item}: ${pe.message}`)
        }
        j.pos++
        this.doneThisRun++
        // 項目の列は、並べ替え・追加があったときだけ書き直す（数千項目の JSON を毎回書かない）
        if (itemsDirty) {
          db.run(
            `UPDATE jobs SET pos = ?, failed = ?, items = ?, updated = ? WHERE id = ?`,
            j.pos,
            j.failed,
            JSON.stringify(items),
            nowIso(),
            j.id,
          )
          itemsDirty = false
        } else db.run(`UPDATE jobs SET pos = ?, failed = ?, updated = ? WHERE id = ?`, j.pos, j.failed, nowIso(), j.id)
        if (Date.now() - lastEmit > 300 || j.pos === items.length) {
          lastEmit = Date.now()
          this.h.emitProgress(this.progressOf(j, undefined, items.length))
        }
        // 項目のあとで処理を譲る。通信の間隔が 0 のプロバイダ（スタブ）でも、ジョブの途中で画面からの呼び出しに答える
        await new Promise<void>((r) => setImmediate(r))
      }
      this.currentId = null
      if (itemsDirty) db.run(`UPDATE jobs SET items = ? WHERE id = ?`, JSON.stringify(items), j.id)
      const st = db.get<{ status: string }>('SELECT status FROM jobs WHERE id = ?', j.id)?.status
      let final: JobProgress['status'] = 'done'
      if (st === 'cancelled' || st === 'paused') final = st
      else if (j.pos < items.length && !failMsg) {
        // 止められたが、このジョブ自身は取り消し・一時停止されていない（閉じるときも）: 完了にせず待ちに戻す
        db.run(`UPDATE jobs SET status = 'queued', updated = ? WHERE id = ?`, nowIso(), j.id)
        if (this.stopping) return
        this.h.emitProgress(this.progressOf({ ...j, status: 'queued' }, undefined, items.length))
        continue
      } else if (failMsg) {
        final = 'failed'
        db.run(`UPDATE jobs SET status = 'failed', updated = ? WHERE id = ?`, nowIso(), j.id)
        this.h.log(`job ${j.id} failed: ${failMsg}`)
      } else {
        db.run(`UPDATE jobs SET status = 'done', updated = ? WHERE id = ?`, nowIso(), j.id)
        if (j.kind === 'initial' || j.kind === 'daily' || j.kind === 'reset') db.setMeta('lastUpdate', nowIso())
        try {
          this.h.jobDone?.(j.kind)
        } catch (e) {
          this.h.log(`jobDone: ${String((e as Error)?.message ?? e)}`)
        }
      }
      this.h.emitProgress(this.progressOf({ ...j, status: final }, failMsg ?? undefined, items.length))
      this.flushData()
    }
  }

  /** 1 リクエストの前に呼ぶ: 最小間隔 + 揺らぎ（FR-F2）。429 を受けたあとは遅い間隔 */
  private async throttle(signal: AbortSignal): Promise<void> {
    const { intervalMs, jitterMs } = paceOf(this.h.provider, this.slowed)
    const wait = this.lastCall + intervalMs + Math.random() * jitterMs - Date.now()
    if (wait > 0) await sleep(wait, signal)
    this.lastCall = Date.now()
  }

  private dataChanged(id: InstrumentId): void {
    if (id === N225) this.indexCloses = null
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
    return retentionStart(jstNow().date, this.h.retentionYears())
  }

  // ---------------------------------------------------------------- items
  private async runItem(kind: JobKind, item: string, signal: AbortSignal): Promise<string[] | undefined> {
    const [t, ...rest] = item.split(':')
    if (t === 'U') return this.universe(kind, signal)
    if (t === 'Q') {
      const size = this.h.provider.quoteBatchSize
      const b = Number(rest[0])
      return this.quotes(kind, this.fetchOrder().slice(b * size, b * size + size), signal)
    }
    if (t === 'R') {
      const want = new Set(item.slice(2).split(','))
      return this.quotes(
        kind,
        this.h.repo.fetchSet().filter((s) => want.has(s.id)),
        signal,
      )
    }
    if (t === 'C') return this.check()
    if (t === 'H') return this.history(`${rest[0]}:${rest[1]}`, rest[2] ?? this.retentionStart(), signal)
    if (t === 'F') return this.history(`${rest[0]}:${rest[1]}`, this.retentionStart(), signal, true)
    if (t === 'M') return this.monthly(`${rest[0]}:${rest[1]}`, signal)
    if (t === 'X') {
      await this.recomputeAll(signal)
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
    const set = this.fetchOrder()
    const batches = Math.ceil(set.length / this.h.provider.quoteBatchSize)
    const q = Array.from({ length: batches }, (_, i) => `Q:${i}`)
    if (kind === 'daily') {
      // 月次系列が無い・取り直しが要る銘柄（分割のあとに閉じた、取得に失敗したなど）も拾う。
      // 初回・全データの取り直しが終わっていないうちは、そちらが月次系列を取るので足さない
      const big = this.h.repo.db.get(
        `SELECT 1 FROM jobs WHERE kind IN ('initial','reset') AND status NOT IN ('done','failed','cancelled') LIMIT 1`,
      )
      const months = big ? [] : this.h.repo.missingMonthly().map((id) => `M:${id}`)
      return [...q, 'X', ...months]
    }
    // 初回: 気配 → 日足（全期間）→ 指標 → 月次系列（低い優先度、FR-D7）
    return [...q, ...set.map((s) => `F:${s.id}`), 'X', ...set.map((s) => `M:${s.id}`)]
  }

  /**
   * 取得の順番（FR-F8）: 指数 → ウォッチリストと保有の銘柄 → そのほか（それぞれコード順）。
   * 一括気配のバッチ（Q:n）はこの順に切るので、日々の更新でも利用者が見ている銘柄から新しくなる。
   * 計画と実行で同じ順を使う（途中でリストを変えると、その回だけ取り漏れる銘柄が出うるが、翌日の取りこぼしの照合で拾う）
   */
  private fetchOrder(): { id: string; yahoo: string }[] {
    const first = this.h.listed()
    const rank = (s: { id: string; yahoo: string }) => (isIndex(s.id) ? 0 : first.has(s.id) ? 1 : 2)
    return [...this.h.repo.fetchSet()].sort((a, b) => rank(a) - rank(b))
  }

  /**
   * 取りこぼしの確認（FR-F9）: このジョブで気配を取れなかった銘柄（バッチの失敗・応答に無い）は気配を、
   * 日足が欠けたままの銘柄（取り直しの失敗）は日足を、もう 1 回だけ取る。何か取り直したら指標も計算し直す
   */
  private check(): string[] {
    const repo = this.h.repo
    const fetched = repo.quoteFetched()
    const set = this.fetchOrder()
    const since = this.jobSince
    const noQuote = set.filter((s) => !isIndex(s.id) && !((fetched.get(s.id) ?? '') >= since)).map((s) => s.id)
    const size = this.h.provider.quoteBatchSize
    const out: string[] = []
    for (let i = 0; i < noQuote.length; i += size) out.push(`R:${noQuote.slice(i, i + size).join(',')}`)
    const skip = new Set(noQuote) // 気配を取り直す銘柄は、その結果で日足の取り直しが決まる
    const lim = prevTradingDay(lastClosedSession())
    for (const s of set) {
      if (skip.has(s.id) || isIndex(s.id)) continue
      const last = repo.lastDaily(s.id, false)
      if (!last) out.push(`F:${s.id}`)
      else if (last.d < lim) out.push(`H:${s.id}:${addDays(last.d, -10)}`)
    }
    if (out.length) {
      this.h.log(`check: requote ${noQuote.length}, refetch ${out.length - Math.ceil(noQuote.length / size)}`)
      out.push('X')
    }
    return out
  }

  /** 一括気配（FR-F5）。日々の更新では、当日の仮の足を作り、取り直しが要る銘柄を足す（FR-D8, F9） */
  private async quotes(kind: JobKind, part: { id: string; yahoo: string }[], signal: AbortSignal): Promise<string[]> {
    if (!part.length) return []
    await this.throttle(signal)
    const qs = await this.h.provider.fetchQuotes(
      part.map((p) => p.yahoo),
      { signal },
    )
    if (signal.aborted) throw new Error('aborted') // 取り消したあとに古い結果を書かない
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
        const last = repo.lastDaily(p.id, false) // 仮の足も含めた最終日（仮の足を取りこぼしと数えない）
        if (!last) {
          extra.push(`F:${p.id}`)
          continue
        }
        // 海外の行（FR-MB3）: 東証の営業日・大引けで判断せず、毎回 10 日前から取り直す（時差・海外の休日・24 時間の市場）
        if (isExternal(p.id)) {
          extra.push(`H:${p.id}:${addDays(last.d, -10)}`)
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
          // 前の日の仮の足は、気配の前日終値と一致すれば確定し、違えば日足を取り直す（FR-D8）
          const prov = repo.provisionalClose(p.id, prevDay)
          if (prov != null && q.prevClose) {
            if (Math.abs(q.prevClose / prov - 1) <= 0.001) repo.confirmProvisional(p.id, prevDay)
            else {
              extra.push(`H:${p.id}:${addDays(prevDay, -10)}`)
              continue
            }
          }
        }
        // 分割イベントの無い大きなギャップ（FR-D5）は全期間を取り直して照合する（同じ銘柄は 7 日に 1 回まで）
        const lf = repo.fetchState(p.id).lastFull
        if ((!lf || Date.now() - Date.parse(lf) > 7 * 86400_000) && repo.gapSuspect(p.id)) {
          extra.push(`F:${p.id}`)
          continue
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
  private async history(
    id: InstrumentId,
    from: JstDate,
    signal: AbortSignal,
    full = false,
    afterSplit = false,
  ): Promise<string[] | undefined> {
    const repo = this.h.repo
    const sym = repo.yahooOf(id)
    if (!sym) return undefined
    const start = full ? this.retentionStart() : from
    await this.throttle(signal)
    const r = await this.h.provider.fetchHistory(sym, { from: start, interval: '1d', signal })
    if (signal.aborted) throw new Error('aborted')
    if (!r.bars.length) throw new ProviderError('symbol', 'empty response')
    // 保存済みの分割（取り直しで新しい分割が見つかったかを見る）
    const known = new Set(repo.splits(id).map((s) => s.date))
    const newSplit = r.splits.some((s) => !known.has(s.date))
    if (!full) {
      // 重ね取り区間で保存済みの終値と食い違えば、分割・併合を疑って全期間を取り直す
      let mismatch = false
      // 海外の行の最後の足は、前に取ったときに取引の途中だったことがある（24 時間の市場・時差）。食い違いの照合から外す（FR-MB3）
      const open = isExternal(id) ? (repo.lastDaily(id, false)?.d ?? null) : null
      for (const b of r.bars.slice(0, 10)) {
        if (open && b.d >= open) continue
        const c = repo.closeOn(id, b.d)
        if (c && Math.abs(b.c / c - 1) > 0.005) mismatch = true
      }
      if (newSplit || mismatch) {
        // 分割・併合: 全期間と月次系列を取り直す（FR-D3）。月次系列は古い基準のままなので、日足と同じトランザクションで
        // 「月次系列の取り直しが要る」と記録する（ここで閉じても、次の日々の更新で取り直す）
        return (await this.history(id, start, signal, true, true)) ?? [`M:${id}`]
      }
    } else {
      const existing = repo.dailyCount(id, start)
      if (existing > 50 && r.bars.length < existing * 0.5)
        throw new ProviderError('symbol', `suspicious response (${r.bars.length} < ${existing})`)
    }
    // 全期間の取り直し（気配の照合・ギャップ・利用者の取り直しから）でも、前に日足があって新しい分割が見つかれば、
    // 月次系列は古い基準のままなので取り直す（FR-D3）。初めての取得は月次系列を別に取るので除く
    const split = afterSplit || (full && newSplit && repo.fetchState(id).lastFull != null)
    repo.db.tx(() => {
      repo.replaceDaily(id, start, r.bars)
      // 日足の保存期間より前の配当（月次の系列の取得で入る 10 年分）は、新しい分割で基準が変わるときだけ消す
      // （そのときは続けて月次の系列を取り直し、新しい基準で入れ直す）。それ以外の全期間の取り直しでは残す
      repo.replaceActions(id, split ? '0000-00-00' : start, r.dividends, r.splits)
      repo.markFetched(id, full ? 'full' : 'daily', nowIso())
      if (split) repo.needMonthly(id)
      this.recompute(id)
    })
    this.dataChanged(id)
    return split ? [`M:${id}`] : undefined
  }

  /** 月次系列（FR-D7）: 1 銘柄 1 リクエストで上場以来の月足 */
  private async monthly(id: InstrumentId, signal: AbortSignal): Promise<undefined> {
    const repo = this.h.repo
    const sym = repo.yahooOf(id)
    if (!sym) return undefined
    await this.throttle(signal)
    const r = await this.h.provider.fetchHistory(sym, { from: '1999-01-01', interval: '1mo', signal })
    if (signal.aborted) throw new Error('aborted')
    if (!r.bars.length) throw new ProviderError('symbol', 'empty monthly response')
    const month = jstNow().date.slice(0, 7)
    repo.db.tx(() => {
      repo.replaceMonthly(id, r.bars as RawBar[], month)
      // 日足の保存期間より前の配当・分配金も、月次系列の取得で 10 年分まで持つ（銘柄情報の配当の推移、FR-I1）
      repo.replaceOldDividends(id, this.retentionStart(), addYears(jstNow().date, -10), r.dividends)
      repo.markFetched(id, 'monthly', nowIso())
      // 古い配当が入ったので、連続増配の年数などの指標を作り直す（初回の取得では指標の再計算 X のあとに動くため）
      this.recompute(id)
    })
    this.dataChanged(id)
    return undefined
  }

  /** 1 銘柄の指標を作り直す。日足は直近 METRIC_BARS 本と最初の日付だけを読む（全期間は読まない） */
  recompute(id: InstrumentId, kind?: InstrumentKind): void {
    const repo = this.h.repo
    const bars = repo.recentDaily(id, METRIC_BARS)
    const first = bars.length === METRIC_BARS ? (repo.firstDaily(id) ?? undefined) : bars[0]?.d
    const { dividends, splits } = repo.actions(id)
    const m = computeMetrics(id, bars, dividends, splits, repo.quote(id), lastClosedSession(), first, {
      kind: kind ?? repo.kindOf(id),
      index: this.index(),
    })
    repo.putMetrics(m)
  }
  /**
   * 日経平均の終値（日付 → 終値。ベータ）。1 回読んだら持っておき、日経平均の日足を書いたとき（dataChanged）と
   * 全銘柄の作り直しの始めに読み直す
   */
  private indexCloses: Map<JstDate, number> | null = null
  private index(): Map<JstDate, number> {
    this.indexCloses ??= this.h.repo.recentCloses(N225, 260)
    return this.indexCloses
  }
  /**
   * 全銘柄の指標を作り直す。100 銘柄ごとに 1 つのトランザクションで書き、その合間に処理を譲って
   * チャート・スクリーナーなどの呼び出しを待たせない
   */
  async recomputeAll(signal?: AbortSignal): Promise<void> {
    const repo = this.h.repo
    // 種別も一緒に読む（銘柄ごとに instruments を引かない）
    const ids = repo.fetchSet()
    this.indexCloses = null // 全データの削除のあとなどに古い値を使わない
    for (let i = 0; i < ids.length; i += 100) {
      // 閉じる・全データの削除・取り消しのときは、残りのバッチを書かずに止める（項目は待ちに戻る）
      if (signal?.aborted || this.stopping) throw new Error('aborted')
      repo.db.tx(() => {
        for (const s of ids.slice(i, i + 100)) this.recompute(s.id, s.kind)
      })
      await new Promise<void>((r) => setImmediate(r))
    }
    this.h.emitData(['*'])
  }
}

export { idOf }
