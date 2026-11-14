// Core の API の実装（§8.2）。入力は zod で検証済みのものを受け取る。Electron を import しない（NFR-A1）。
import { mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { CoreError, Events, Method, Params, Results } from '@shared/api'
import type { Adjustment, Holding, InstrumentId, MetricsRow, Timeframe } from '@shared/types'
import { addYears, jstNow, lastClosedSession } from './calendar'
import { Db } from './db'
import { applyImport, exportHoldings, normalize, previewBrokerCsv, previewImport } from './holdings'
import { JobRunner } from './jobs'
import { parseJpx } from './providers/jpx'
import type { Provider } from './providers/types'
import { idOf, Repo } from './repo'
import { runScreen } from './screener'
import { adjust, aggregate, mergeMonthly, toBars } from './series'
import { defaultScreens, UserStore } from './userstore'

const RELEASES = 'https://api.github.com/repos/kurouna/elecxstock/releases/latest'
/** 'v0.1.2' と '0.1.10' を数で比べる */
export function newerVersion(latest: string, current: string): boolean {
  const p = (s: string) =>
    s
      .replace(/^v/, '')
      .split(/[.-]/)
      .slice(0, 3)
      .map((x) => Number.parseInt(x, 10) || 0)
  const a = p(latest)
  const b = p(current)
  for (let i = 0; i < 3; i++) if (a[i]! !== b[i]!) return a[i]! > b[i]!
  return false
}

export type Emit = <E extends keyof Events>(event: E, data: Events[E]) => void

/** 月次系列の取得で 10 年分の配当を持つようにした版の日付（これより前に取った銘柄は取り直す） */
const DIV10_SINCE = '2026-11-14'

export class CoreService {
  /** この起動で配当の取り直しを頼んだ銘柄 */
  private divAsked = new Set<InstrumentId>()
  readonly db: Db
  readonly repo: Repo
  readonly user: UserStore
  readonly jobs: JobRunner
  private metricsCache: Map<InstrumentId, MetricsRow> | null = null

  constructor(
    dataDir: string,
    readonly provider: Provider,
    private emit: Emit,
    private version: string,
    readonly log: (msg: string) => void = () => {},
  ) {
    mkdirSync(dataDir, { recursive: true })
    this.db = new Db(join(dataDir, 'market.db'))
    this.repo = new Repo(this.db)
    this.user = new UserStore(join(dataDir, 'user'))
    if (this.user.readOnly || this.user.load('settings') == null) {
      /* settings を最初に読んで読み取り専用かを決める */
    }
    this.jobs = new JobRunner({
      repo: this.repo,
      provider,
      retentionYears: () => this.user.load('settings').retentionYears,
      userCodes: () => this.trackedCodes(),
      listed: () => new Set(this.user.load('watchlists').flatMap((w) => w.items)),
      emitProgress: (p) => emit('jobs.progress', p),
      emitData: (ids) => {
        this.metricsCache = null
        emit('data.updated', { ids, metrics: true })
      },
      emitProvider: (s) => emit('provider.state', s),
      log,
    })
  }

  /** アプリを閉じるとき: 取得を止めて続きを次の起動に回し、DB を閉じる（WAL を書き戻す） */
  async shutdown(): Promise<void> {
    await this.jobs.stop()
    try {
      this.db.raw.exec('PRAGMA optimize; PRAGMA wal_checkpoint(TRUNCATE);')
    } catch {
      /* 閉じられれば十分 */
    }
    this.db.close()
  }
  start(): void {
    this.user.load('settings')
    if (this.user.error) this.emit('user.error', { message: this.user.error })
    // 指標の列を足した版に上げたら、日足から作り直す（DB の移行 v2）
    if (this.db.meta('metricsStale') === '1') {
      setTimeout(async () => {
        await this.jobs.recomputeAll()
        this.db.setMeta('metricsStale', '0')
        this.metricsCache = null
      }, 50)
    }
    this.jobs.resume()
  }

  /**
   * 一覧に無い銘柄を利用者の銘柄として足し、データを取りにいく（銘柄の追加と、保有の CSV・JSON の取り込みで使う）。
   * 何銘柄でも設定の保存・取得対象の更新・取得のジョブは 1 回ずつ（設定の世代を押し流さない）。上限（500）を超える分は足さない
   */
  private addUserInstruments(list: { code: string; name?: string }[]): InstrumentId[] {
    const r = this.repo
    const s = this.user.load('settings')
    const have = new Set(s.userInstruments)
    const room = Math.max(0, 500 - have.size)
    const add = list.filter((x) => !have.has(x.code)).slice(0, room)
    const ids: InstrumentId[] = []
    for (const x of list) {
      const id = idOf(x.code)
      if (!r.instrument(id)) {
        if (!have.has(x.code) && !add.some((y) => y.code === x.code)) continue
        r.db.run(
          `INSERT INTO instruments(id, code, name_ja, name_en, market, kind, status, yahoo, updated) VALUES(?, ?, ?, '', 'X', 'other', 'active', ?, ?)`,
          id,
          x.code,
          x.name || x.code,
          this.provider.toSymbol(x.code, 'other'),
          new Date().toISOString(),
        )
      }
      ids.push(id)
    }
    if (add.length) this.user.save('settings', { ...s, userInstruments: [...s.userInstruments, ...add.map((x) => x.code)] })
    r.setUserAdded(this.trackedCodes())
    const fetch = ids.filter((id) => !r.fetchState(id).lastFull)
    if (fetch.length) this.jobs.enqueue('refetch', [...fetch.map((id) => `F:${id}`), ...fetch.map((id) => `M:${id}`)])
    return ids
  }

  /** 銘柄ごとの保有（口座区分をまたいで数量と取得価額を合計）。スクリーナーの保有の条件に使う */
  private heldMap(): Map<InstrumentId, { qty: number; cost: number }> {
    const out = new Map<InstrumentId, { qty: number; cost: number }>()
    for (const h of this.holdings()) {
      if (!(h.quantity > 0)) continue
      const id = idOf(h.code)
      const v = out.get(id) ?? { qty: 0, cost: 0 }
      v.qty += h.quantity
      v.cost += h.quantity * h.avgCost
      out.set(id, v)
    }
    return out
  }
  private holdings() {
    return this.user.load('holdings').map((h) => normalize(h, this.repo.splits(`JP:${h.code}`)))
  }

  private metricsMap(): Map<InstrumentId, MetricsRow> {
    if (!this.metricsCache) {
      const session = lastClosedSession()
      this.metricsCache = new Map(this.repo.metrics().map((m) => [m.id, { ...m, stale: !m.asOf || m.asOf < session }]))
    }
    return this.metricsCache
  }

  private bars(id: InstrumentId, tf: Timeframe, adj: Adjustment) {
    const repo = this.repo
    const today = jstNow().date
    const daily = repo.daily(id)
    const splits = repo.splits(id)
    const dividends = repo.dividends(id)
    const adjusted = adjust(daily, adj, splits, dividends)
    if (tf === 'M') {
      let monthly = repo.monthly(id)
      if (!monthly.length && !repo.fetchState(id).lastMonthly && repo.yahooOf(id)) this.jobs.enqueue('monthly', [`M:${id}`])
      if (adj === 'unadjusted') monthly = adjust(monthly, 'unadjusted', splits, [])
      const { bars, monthlyUntil } = mergeMonthly(monthly, adjusted)
      return { ...toBars(id, 'M', bars, today, monthlyUntil), dividends, splits, adjustment: adj }
    }
    return { ...toBars(id, tf, aggregate(adjusted, tf), today), dividends, splits, adjustment: adj }
  }

  /** メソッドの実行。エラーは CoreError（コード + 引数）で返す（FR-N5） */
  async call<M extends Method>(method: M, p: Params<M>): Promise<Results[M]> {
    const r = this.repo
    const P = p as Record<string, unknown>
    switch (method) {
      case 'app.info':
        return {
          version: this.version,
          provider: this.provider.id,
          userReadOnly: this.user.readOnly,
          ...(this.user.error ? { userDataError: this.user.error } : {}),
        } as Results[M]
      case 'instruments.search':
        return r.search(String(P.q), Number(P.limit ?? 12)) as Results[M]
      case 'instruments.get':
        return r.instruments(P.ids as string[]) as Results[M]
      case 'instruments.all':
        return r.universe() as Results[M]
      case 'instruments.addUser': {
        const code = String(P.code).toUpperCase()
        const id = idOf(code)
        const known = !!r.instrument(id)
        this.addUserInstruments([{ code }])
        // すでに一覧にあった銘柄も、明示して足したら取り直す
        if (known) this.jobs.enqueue('refetch', [`F:${id}`, `M:${id}`])
        return r.instrument(id) as Results[M]
      }
      case 'instruments.removeUser': {
        const code = String(P.code).toUpperCase()
        const s = this.user.load('settings')
        this.user.save('settings', { ...s, userInstruments: s.userInstruments.filter((c) => c !== code) })
        r.setUserAdded(this.trackedCodes())
        return undefined as Results[M]
      }
      case 'bars.csv': {
        // 銘柄・期間を指定した CSV 書き出し（FR-S3）。分割調整済みの日足
        const lines = ['code,date,open,high,low,close,volume']
        for (const id of P.ids as string[]) {
          const code = id.replace(/^\w+:/, '')
          for (const b of r.daily(id)) {
            if ((P.from && b.d < String(P.from)) || (P.to && b.d > String(P.to))) continue
            lines.push([code, b.d, b.o, b.h, b.l, b.c, b.v].join(','))
          }
        }
        return `${lines.join('\r\n')}\r\n` as Results[M]
      }
      case 'data.backup': {
        // 市場データの DB のバックアップ（FR-S3）。data/backups に VACUUM INTO で書き、直近 3 つを残す
        const dir = join(this.user.dir, '..', 'backups')
        mkdirSync(dir, { recursive: true })
        const name = `market-${jstNow().date}-${Date.now().toString(36)}.db`
        this.db.raw.exec(`VACUUM INTO '${join(dir, name).replaceAll("'", "''")}'`)
        const old = readdirSync(dir)
          .filter((x) => /^market-.*\.db$/.test(x))
          .sort()
        for (const x of old.slice(0, Math.max(0, old.length - 3))) rmSync(join(dir, x), { force: true })
        return name as Results[M]
      }
      case 'app.checkUpdate': {
        // 新しい版の通知（NFR-Q9）。GitHub Releases の最新版を見るだけ（利用者の情報は送らない）
        if (this.provider.id === 'stub') return null as Results[M]
        const res = await fetch(RELEASES, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'elecxstock' } })
        if (!res.ok) return null as Results[M]
        const j = (await res.json()) as { tag_name?: string; html_url?: string }
        if (!j.tag_name) return null as Results[M]
        return {
          version: j.tag_name.replace(/^v/, ''),
          url: j.html_url ?? 'https://github.com/kurouna/elecxstock/releases',
          newer: newerVersion(j.tag_name, this.version),
        } as Results[M]
      }
      case 'bars.get':
        return this.bars(String(P.id), P.tf as Timeframe, (P.adjustment as Adjustment) ?? 'split') as Results[M]
      case 'bars.many': {
        const out: Record<string, unknown> = {}
        const today = jstNow().date
        // タイルは最後の count 本だけ出すので、日足もその分だけ読む（週足は 1 本 5 日、月足は古い月を月次系列で補う）
        const tf = P.tf as Timeframe
        const need = tf === 'D' ? Number(P.count) : tf === 'W' ? Number(P.count) * 5 + 5 : Number(P.count) * 23 + 23
        for (const id of P.ids as string[]) {
          const daily = r.recentDaily(id, need)
          const all = tf === 'M' ? mergeMonthly(r.monthly(id), daily).bars : aggregate(daily, tf)
          out[id] = toBars(id, tf, all.slice(-Number(P.count)), today)
        }
        return out as Results[M]
      }
      case 'returns.get': {
        // chart-grid の「期間騰落率」の並べ替え用（FR-G4）: 期間の始めの終値から最新の終値までの騰落率
        const out: Record<string, number> = {}
        for (const id of P.ids as string[]) {
          const a = r.db.get<{ c: number }>('SELECT c FROM daily_bars WHERE id = ? AND d >= ? ORDER BY d LIMIT 1', id, String(P.from))
          const b = r.db.get<{ c: number }>('SELECT c FROM daily_bars WHERE id = ? ORDER BY d DESC LIMIT 1', id)
          if (a?.c && b?.c) out[id] = (b.c / a.c - 1) * 100
        }
        return out as Results[M]
      }
      case 'dividends.get': {
        const id = String(P.id)
        // 10 年分の配当は月次系列の取得で入る。この版より前に月次系列を取った銘柄は、見たときに一度だけ取り直す
        const lm = r.fetchState(id).lastMonthly
        if (lm && lm < DIV10_SINCE && !this.divAsked.has(id) && r.fetchSet().some((x) => x.id === id)) {
          this.divAsked.add(id)
          this.jobs.enqueue('refetch', [`M:${id}`])
        }
        return r.dividends(id) as Results[M]
      }
      case 'metrics.get': {
        const map = this.metricsMap()
        return (P.ids as string[]).flatMap((id) => {
          const m = map.get(id)
          return m ? [m] : []
        }) as Results[M]
      }
      case 'quotes.get':
        return (P.ids as string[]).flatMap((id) => {
          const q = r.quote(id)
          return q ? [q] : []
        }) as Results[M]
      case 'screener.run':
        return runScreen({
          conditions: P.conditions as never,
          instruments: r.universe(),
          metrics: this.metricsMap(),
          favorites: new Set(P.favorites as string[]),
          watchlists: P.watchlists as Record<string, string[]>,
          holdings: this.heldMap(),
        }) as Results[M]
      case 'user.load':
        return {
          settings: this.user.load('settings'),
          watchlists: this.user.load('watchlists'),
          screens: this.user.load('screens'),
          layout: this.user.load('layout'),
          layouts: this.user.load('layouts'),
          readOnly: this.user.readOnly,
          ...(this.user.error ? { error: this.user.error } : {}),
        } as Results[M]
      case 'user.saveSettings': {
        const prev = this.user.load('settings')
        // 利用者の銘柄は Core が持つ（取り込み・追加は Core で行い、外すのは instruments.removeUser）。
        // renderer の設定の写しは古いことがあるので、その userInstruments では上書きしない
        this.user.save('settings', { ...(P.settings as object), userInstruments: prev.userInstruments } as never)
        const next = this.user.load('settings')
        if (prev.userInstruments.join() !== next.userInstruments.join()) r.setUserAdded(this.trackedCodes())
        return undefined as Results[M]
      }
      case 'user.saveWatchlists': {
        this.user.save('watchlists', P.watchlists as never)
        // ウォッチリストに入れたプライム・REIT 以外の銘柄も取得を続ける（FR-U3, U4）。まだデータが無ければすぐ取りに行く
        r.setUserAdded(this.trackedCodes())
        const ids = [...new Set((P.watchlists as { items: string[] }[]).flatMap((w) => w.items))]
        const missing = ids.filter((id) => r.yahooOf(id) && !r.fetchState(id).lastFull)
        if (missing.length) this.jobs.enqueue('refetch', [...missing.map((id) => `F:${id}`), ...missing.map((id) => `M:${id}`)])
        return undefined as Results[M]
      }
      case 'user.saveScreens':
        this.user.save('screens', P.screens as never)
        return undefined as Results[M]
      case 'user.saveLayout': {
        // 1 枚目の保存は、フリー N の配置（windows）を残したまま置き換える（マルチモニタ）
        const prev = this.user.load('layout') as { windows?: unknown } | null
        const next = P.layout as Record<string, unknown> | null
        this.user.save('layout', (next && prev?.windows ? { ...next, windows: prev.windows } : next) as never)
        return undefined as Results[M]
      }
      case 'user.saveWindowLayout': {
        // フリー N は自分の分だけを保存する（1 枚目のレイアウトに触らない）
        const prev = (this.user.load('layout') as Record<string, unknown> | null) ?? {}
        const windows = { ...((prev.windows as Record<string, unknown> | undefined) ?? {}), [String(P.slot)]: P.entry }
        this.user.save('layout', { ...prev, windows } as never)
        return undefined as Results[M]
      }
      case 'watchlists.toggleItem': {
        // フリー N の★・◆: Core で入れ・外しして保存する（ほかの窓には worker が知らせる）
        const lists = this.user.load('watchlists')
        const w = lists.find((x) => x.id === P.list || x.builtin === P.list)
        if (!w) throw Object.assign(new Error('no such list'), { code: 'not-found' })
        const id = String(P.id)
        w.items = w.items.includes(id) ? w.items.filter((x) => x !== id) : [...w.items, id]
        this.user.save('watchlists', lists)
        return lists as Results[M]
      }
      case 'user.saveLayouts':
        this.user.save('layouts', P.layouts as never)
        return undefined as Results[M]
      case 'user.undoImport': {
        let any = false
        for (const n of ['watchlists', 'screens', 'layouts', 'settings'] as const) if (this.user.restoreBefore(n, 'preimport')) any = true
        if (any) r.setUserAdded(this.trackedCodes())
        return any as Results[M]
      }
      case 'user.defaultScreens':
        return defaultScreens() as Results[M]
      case 'portfolio.list':
        return this.holdings() as Results[M]
      case 'portfolio.save':
        this.user.save('holdings', P.holdings as never)
        return this.holdings() as Results[M]
      case 'portfolio.export':
        return exportHoldings(
          this.user.load('holdings'),
          (code) => r.instrument(`JP:${code}`)?.nameJa ?? '',
          `elecxstock ${this.version}`,
          new Date(),
          this.user.load('portfolioMeta'),
        ) as Results[M]
      case 'portfolio.previewImport':
        return previewImport(String(P.json), this.user.load('holdings'), (code) => !!r.instrument(`JP:${code}`)) as Results[M]
      case 'portfolio.applyImport': {
        this.user.keepBefore('holdings', 'preimport') // 取り込む前の記録を残し、元に戻せるようにする（FR-H9）
        this.user.keepBefore('portfolioMeta', 'preimport')
        const hs = P.holdings as Holding[]
        // 別の PC で足した銘柄など、一覧に無いコードは銘柄として足してデータを取りにいく
        this.addUserInstruments(hs.filter((h) => !r.instrument(`JP:${h.code}`)).map((h) => ({ code: h.code, name: h.name })))
        this.user.save('holdings', applyImport(this.user.load('holdings'), hs, P.mode as 'merge' | 'replace'))
        if (P.meta) this.user.save('portfolioMeta', P.meta as never)
        return this.holdings() as Results[M]
      }
      case 'portfolio.undoImport':
        if (!this.user.restoreBefore('holdings', 'preimport')) return null as Results[M]
        this.user.restoreBefore('portfolioMeta', 'preimport')
        return this.holdings() as Results[M]
      case 'portfolio.meta':
        return this.user.load('portfolioMeta') as Results[M]
      case 'portfolio.previewCsv':
        return previewBrokerCsv(String(P.text), this.holdings(), (code) => !!r.instrument(`JP:${code}`)) as Results[M]
      case 'portfolio.applyCsv': {
        // 取り込むたびに、保有は CSV の内容にすべて置き換える（FR-H11）。前の記録は世代に残して元に戻せる
        this.user.keepBefore('holdings', 'preimport')
        this.user.keepBefore('portfolioMeta', 'preimport')
        const hs = P.holdings as Holding[]
        this.addUserInstruments(hs.filter((h) => !r.instrument(`JP:${h.code}`)).map((h) => ({ code: h.code, name: h.name })))
        this.user.save('holdings', hs)
        this.user.save('portfolioMeta', P.meta as never)
        return this.holdings() as Results[M]
      }
      case 'user.exportAll':
        return this.user.exportAll() as Results[M]
      case 'user.importAll':
        return this.user.importAll(String(P.json)) as Results[M]
      case 'jobs.start': {
        const kind = P.kind as 'initial' | 'daily' | 'universe'
        if (kind === 'universe') return this.jobs.enqueue('universe', ['U']) as Results[M]
        if (kind === 'initial') return this.jobs.enqueue('initial', ['U']) as Results[M]
        const u = this.db.meta('universeUpdated')
        const stale = !u || Date.now() - Date.parse(u) > 7 * 86400_000 // 7 日以上経っていればユニバースも更新（FR-U4）
        return this.jobs.enqueue('daily', stale ? ['U'] : this.jobs.planFor('daily')) as Results[M]
      }
      case 'jobs.refetch':
        return this.jobs.enqueue(
          'refetch',
          (P.ids as string[]).map((id) => `F:${id}`),
        ) as Results[M]
      case 'jobs.reset': {
        this.jobs.cancelAll()
        r.resetMarketData(Boolean(P.keepDelisted))
        this.db.vacuum()
        this.metricsCache = null
        this.emit('data.updated', { ids: ['*'], metrics: true })
        return this.jobs.enqueue('reset', ['U']) as Results[M]
      }
      case 'jobs.planRetention': {
        const years = Number(P.years)
        const cur = this.user.load('settings').retentionYears
        const cutoff = addYears(jstNow().date, -years)
        const rows = years < cur ? r.countDailyBefore(cutoff) : 0
        return { years, deleteBefore: years < cur ? cutoff : null, rows, approxBytes: rows * 60 } as Results[M]
      }
      case 'jobs.applyRetention': {
        const years = Number(P.years)
        const s = this.user.load('settings')
        const cur = s.retentionYears
        this.user.save('settings', { ...s, retentionYears: years })
        if (years < cur) {
          // 確認のあと、範囲外の日足を削除して空き領域を回収する（FR-D6）
          r.deleteDailyBefore(addYears(jstNow().date, -years))
          this.db.vacuum()
          await this.jobs.recomputeAll()
          return 0 as Results[M]
        }
        if (years > cur)
          return this.jobs.enqueue(
            'retention',
            r.fetchSet().map((x) => `F:${x.id}`),
          ) as Results[M]
        return 0 as Results[M]
      }
      case 'jobs.pause':
        this.jobs.pause(Number(P.id))
        return undefined as Results[M]
      case 'jobs.resume':
        this.jobs.resumeJob(Number(P.id))
        return undefined as Results[M]
      case 'jobs.cancel':
        this.jobs.cancel(Number(P.id))
        return undefined as Results[M]
      case 'jobs.list':
        return this.jobs.list() as Results[M]
      case 'data.status': {
        const c = r.counts()
        const range = r.barRange()
        return {
          dbBytes: this.db.bytes(),
          instruments: c.instruments,
          withBars: c.withBars,
          failures: r.failures().length,
          lastUpdate: this.db.meta('lastUpdate'),
          oldestBar: range.oldest,
          newestBar: range.newest,
          retentionYears: this.user.load('settings').retentionYears,
          provider: this.provider.id,
          offline: this.jobs.offline,
          universeUpdated: this.db.meta('universeUpdated'),
        } as Results[M]
      }
      case 'data.failures':
        return r.failures() as Results[M]
      case 'data.importJpx': {
        const rows = parseJpx(P.bytes as Uint8Array)
        r.applyUniverse(rows, this.provider.toSymbol, new Date().toISOString())
        r.setUserAdded(this.trackedCodes())
        this.db.setMeta('universeUpdated', new Date().toISOString())
        this.jobs.enqueue('initial', this.jobs.planFor('initial'))
        return rows.length as Results[M]
      }
      default:
        throw { code: 'unknown-method', args: { method } } satisfies CoreError
    }
  }

  /** chart-grid などで表示中の銘柄を先に取得する（FR-F8） */
  /** 取得を続ける銘柄の証券コード: 設定で足した銘柄 + ウォッチリストにある銘柄（FR-U3, U4） */
  trackedCodes(): string[] {
    const fromLists = this.user
      .load('watchlists')
      .flatMap((w) => w.items)
      .filter((id) => id.startsWith('JP:'))
      .map((id) => id.slice(3))
    return [...new Set([...this.user.load('settings').userInstruments, ...fromLists])]
  }
  prioritize(ids: InstrumentId[]): void {
    this.jobs.prioritize(ids)
  }
  close(): void {
    this.db.close()
  }
}
