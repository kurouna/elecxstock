// ニュースの取得と保存（docs/design-news.md §4・§5）。Core の中で動くが、CoreService と DB には触れない。
// 時計・タイマー・通信・知らせは注入する（予定を単体テストで確かめる）。globalThis.fetch に触れない（worker.ts が専用の fetch を渡す）。
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { NewsEvents, NewsList, NewsResults, NewsSettingsView } from '@shared/news/api'
import {
  DEFAULT_KEEP_DAYS,
  type NewsFeed,
  type NewsFeedStatus,
  type NewsItem,
  type NewsLang,
  type NewsRound,
  type NewsSettings,
  type NewsState,
} from '@shared/news/schema'
import { applyNewsPatch, feedOn, newDefaults, readNewsSettings } from '@shared/news/settings'
import { toItems } from './items'
import { decodeBody, parseFeed } from './parse'

const MIN = 60_000
const DAY = 86_400_000
/** 失敗のあとに取り直すまで（5・15・30・60 分） */
const BACKOFF = [5, 15, 30, 60].map((m) => m * MIN)
const RETRY_AFTER_MAX = DAY
/** Retry-After が 0・過去の日付でも、これより早くは取り直さない */
const RETRY_AFTER_MIN = MIN
const MAX_BYTES = 2 * 1024 * 1024
const TIMEOUT = 20_000
const PARALLEL = 2
/** 手動の確かめで、同じフィードを取り直さない間 */
const MANUAL_GAP = 60_000
const READ_DAYS = 30
const READ_MAX = 5000

export interface NewsDeps {
  /** data/news */
  dir: string
  /** 登録表（読めないときは null） */
  registry: NewsFeed[] | null
  /** ニュースの専用の fetch（管理者が止めているときは null。作らない） */
  fetch: typeof fetch | null
  now: () => number
  setTimer: (fn: () => void, ms: number) => unknown
  clearTimer: (h: unknown) => void
  emit: <E extends keyof NewsEvents>(event: E, data: NewsEvents[E]) => void
  log: (msg: string) => void
  version: string
  /** 取ってよいか（二重起動の読み取り専用では取らない・書かない） */
  canFetch: () => boolean
}

interface FeedCache {
  etag?: string
  lastModified?: string
  okAt?: number
  ttl?: number
  items: NewsItem[]
}
interface Cache {
  v: 1
  feeds: Record<string, FeedCache>
  read: Record<string, number>
  seenAt: number
  noticed: string[]
  /** ニュースのペインの案内を出した */
  intro?: boolean
}
interface FeedRun {
  error?: string
  retryAt?: number
  fails: number
  lastTry?: number
}
type Outcome = 'ok' | 'offline' | 'fail'
type Why = 'show' | 'timer' | 'manual' | 'new'
type Method = keyof NewsResults

export class NewsService {
  private settings: NewsSettings
  private cache: Cache
  private runs = new Map<string, FeedRun>()
  private watch = new Map<string, boolean>()
  private lang: NewsLang = 'ja'
  private lastRound?: number
  private startupDone = false
  private timer: unknown = null
  private running: Promise<void> | null = null
  /** 巡回の最中に来た要求（巡回のあとで回す。manual は new を含む） */
  private pending: Why | null = null
  private progress = { done: 0, total: 0 }
  private offline = false

  constructor(private d: NewsDeps) {
    this.settings = readNewsSettings(this.readJson('settings.json'))
    this.cache = this.readCache()
  }

  // ---------------------------------------------------------------- 状態
  state(): NewsState {
    if (!this.d.fetch) return 'policy-off'
    if (!this.d.registry) return 'unavailable'
    if (this.settings.enabled == null) return 'unanswered'
    return this.settings.enabled ? 'on' : 'off'
  }
  private feeds(): NewsFeed[] {
    return this.d.registry ?? []
  }
  private onFeeds(): NewsFeed[] {
    return this.state() === 'on' ? this.feeds().filter((f) => feedOn(f, this.settings, this.lang)) : []
  }
  private visible(): boolean {
    return [...this.watch.values()].some(Boolean)
  }
  private active(): boolean {
    return this.state() === 'on' && this.visible() && this.d.canFetch()
  }
  /** ニュースの fetch が出てよい URL: https・オンのフィードのホストの完全一致（毎回の要求で判断する） */
  allowed(url: URL): boolean {
    return url.protocol === 'https:' && this.onFeeds().some((f) => new URL(f.url).hostname === url.hostname)
  }
  /** オンのフィードのホスト（設定の「このアプリの通信先」） */
  hosts(): string[] {
    return [...new Set(this.onFeeds().map((f) => new URL(f.url).hostname))].sort()
  }
  /** 記事を開いてよいホスト（全フィードの linkHosts。main に渡す。main は設定を知らずに済む） */
  linkHosts(): string[] {
    return [...new Set(this.feeds().flatMap((f) => f.linkHosts))].sort()
  }
  /** 取得が終わるまで待つ（テスト・終了の前） */
  async idle(): Promise<void> {
    while (this.running) await this.running
  }

  // ---------------------------------------------------------------- API
  async call<M extends Method>(method: M, p: unknown, slot: string): Promise<NewsResults[M]> {
    const P = (p ?? {}) as Record<string, unknown>
    switch (method) {
      case 'news.list':
        return this.list() as NewsResults[M]
      case 'news.watch':
        this.setWatch(slot, Boolean(P.on), P.lang === 'en' ? 'en' : 'ja')
        return undefined as NewsResults[M]
      case 'news.refresh':
        this.start('manual')
        return undefined as NewsResults[M]
      case 'news.markRead': {
        const now = this.d.now()
        this.cache.read[String(P.key)] = now
        this.pruneRead(now)
        this.saveCache()
        this.d.emit('news.changed', { kind: 'read' })
        return undefined as NewsResults[M]
      }
      case 'news.settings.get':
        return this.settingsView() as NewsResults[M]
      case 'news.settings.set': {
        if (this.state() === 'policy-off' || this.state() === 'unavailable') return this.settingsView() as NewsResults[M]
        const before = new Set(this.onFeeds().map((f) => f.id))
        this.settings = applyNewsPatch(this.settings, P as Parameters<typeof applyNewsPatch>[1], this.feeds())
        this.writeJson('settings.json', this.settings)
        this.d.emit('news.changed', { kind: 'settings' })
        // オンにしたフィードは次の巡回を待たずに取る
        if (this.onFeeds().some((f) => !before.has(f.id))) this.start('new')
        else this.schedule()
        return this.settingsView() as NewsResults[M]
      }
      case 'news.clearCache':
        this.cache = { ...emptyCache(), noticed: this.cache.noticed, ...(this.cache.intro ? { intro: true } : {}) }
        this.runs.clear()
        this.saveCache()
        this.d.emit('news.changed', { kind: 'cache' })
        this.start('new')
        return undefined as NewsResults[M]
      case 'news.noticed':
        this.cache.noticed = [...new Set([...this.cache.noticed, ...newDefaults(this.feeds(), this.settings, this.lang)])]
        this.cache.intro = true
        this.saveCache()
        this.d.emit('news.changed', { kind: 'settings' })
        return undefined as NewsResults[M]
      default:
        throw { code: 'unknown-method', args: { method } }
    }
  }
  /** 窓が閉じた（ポートが閉じた） */
  unwatch(slot: string): void {
    this.setWatch(slot, false, this.lang)
    this.watch.delete(slot)
  }

  private setWatch(slot: string, on: boolean, lang: NewsLang): void {
    const was = this.visible()
    const langChanged = lang !== this.lang
    this.watch.set(slot, on)
    // 表示言語は見えていなくても受け取る（オンのフィード・通信先・案内が表示言語に合うように）
    this.lang = lang
    const now = this.visible()
    // 「ここまで見た」はペインが最後に見えていた時点
    if (was && !now) {
      this.cache.seenAt = this.d.now()
      this.saveCache()
      this.d.emit('news.changed', { kind: 'seen' })
    }
    if (!was && now) this.start('show')
    else if (langChanged && now) this.start('new')
    else this.schedule()
    // 表示言語が変わると、オンのフィード・一覧・案内が変わる（取るものが無く巡回が走らなくても、画面に読み直させる）
    if (langChanged) this.d.emit('news.changed', { kind: 'settings' })
  }

  private list(): NewsList {
    const now = this.d.now()
    const on = this.onFeeds()
    const items: NewsItem[] = []
    const links = new Set<string>()
    for (const f of on) {
      const oldest = now - (f.keepDays ?? DEFAULT_KEEP_DAYS) * DAY
      for (const it of this.cache.feeds[f.id]?.items ?? []) {
        if (it.at < oldest) continue
        if (it.link && links.has(it.link)) continue
        if (it.link) links.add(it.link)
        items.push(it)
      }
    }
    items.sort((a, b) => b.at - a.at)
    const keys = new Set(items.map((x) => x.key))
    return {
      state: this.state(),
      items,
      feeds: this.status(),
      round: this.round(),
      seenAt: this.cache.seenAt,
      read: Object.keys(this.cache.read).filter((k) => keys.has(k)),
      notice: newDefaults(this.feeds(), this.settings, this.lang).filter((id) => !this.cache.noticed.includes(id)),
      intro: this.state() === 'unanswered' && !this.cache.intro,
    }
  }
  private settingsView(): NewsSettingsView {
    return { state: this.state(), settings: this.settings, registry: this.feeds(), feeds: this.status() }
  }
  private status(): NewsFeedStatus[] {
    return this.feeds().map((f) => {
      const c = this.cache.feeds[f.id]
      const r = this.runs.get(f.id)
      const s: NewsFeedStatus = { id: f.id, on: feedOn(f, this.settings, this.lang), count: c?.items.length ?? 0 }
      if (c?.okAt) s.okAt = c.okAt
      if (c?.ttl) s.ttl = c.ttl
      if (r?.error) s.error = r.error
      if (r?.retryAt) s.retryAt = r.retryAt
      return s
    })
  }
  private nextRound(): number | undefined {
    if (!this.active()) return undefined
    const iv = this.settings.interval
    if (iv === 0) return this.startupDone ? undefined : this.d.now()
    return this.lastRound == null ? this.d.now() : this.lastRound + iv * MIN
  }
  private round(): NewsRound {
    const next = this.running ? undefined : this.nextRound()
    return {
      ...(this.lastRound != null ? { last: this.lastRound } : {}),
      ...(next != null ? { next } : {}),
      running: !!this.running,
      done: this.progress.done,
      total: this.progress.total,
      offline: this.offline,
    }
  }

  // ---------------------------------------------------------------- 予定
  private schedule(): void {
    if (this.timer != null) this.d.clearTimer(this.timer)
    this.timer = null
    if (!this.active() || this.running) return
    const now = this.d.now()
    const at = [this.nextRound(), ...this.onFeeds().map((f) => this.runs.get(f.id)?.retryAt)].filter((x): x is number => x != null)
    if (!at.length) return
    this.timer = this.d.setTimer(
      () => {
        this.timer = null
        this.start('timer')
      },
      Math.max(0, Math.min(...at) - now),
    )
  }
  /**
   * 取得を始める。show・timer: 巡回の時刻が来ていれば全部（429・失敗の待ちの間のものを除く）、来ていなければ待ちの明けたものだけ。
   * manual: 60 秒以内に取ったものを除いて全部。new: まだ取っていないものだけ
   */
  private start(why: Why): void {
    if (!this.active()) {
      this.schedule()
      return
    }
    if (this.running) {
      if (why === 'manual' || why === 'new') this.pending = this.pending === 'manual' ? 'manual' : why
      return
    }
    const now = this.d.now()
    const feeds = this.onFeeds()
    const roundDue = why === 'manual' || (this.nextRound() ?? Number.POSITIVE_INFINITY) <= now
    const due = feeds.filter((f) => {
      const r = this.runs.get(f.id)
      if (why === 'manual')
        return !(r?.lastTry && now - r.lastTry < MANUAL_GAP) && !(r?.retryAt && r.retryAt > now && r.error?.match(/^http-(429|503)$/))
      const never = !r?.lastTry && !this.cache.feeds[f.id]
      if (why === 'new') return never
      if (r?.retryAt && r.retryAt > now) return false
      // まだ取っていないフィード（隠している間にオンにした）は巡回の時刻を待たない
      return roundDue || never || (r?.retryAt != null && r.retryAt <= now)
    })
    // 手動で取るものが無いときは「確認」の時刻を進めない
    if (roundDue && why !== 'new' && (why !== 'manual' || due.length)) {
      this.lastRound = now
      if (this.settings.interval === 0) this.startupDone = true
    }
    if (!due.length) {
      this.schedule()
      // 巡回を走らせなくても、見せたとき（隠していた間は「次」が無い）と、巡回の時刻を進めたとき（全部が失敗の待ちの最中）は
      // 「確認」「次 HH:MM」が変わるので知らせる。表示言語の切り替え（new）は news.changed で読み直させる
      if (why === 'show' || this.lastRound === now) this.d.emit('news.updated', { round: this.round() })
      return
    }
    this.running = this.runRound(due).finally(() => {
      this.running = null
      const p = this.pending
      this.pending = null
      if (p) this.start(p)
      else this.schedule()
      this.d.emit('news.updated', { round: this.round() })
    })
  }
  private async runRound(feeds: NewsFeed[]): Promise<void> {
    this.progress = { done: 0, total: feeds.length }
    this.d.emit('news.updated', { round: { ...this.round(), running: true } })
    const queue = [...feeds]
    const out: { f: NewsFeed; o: Outcome }[] = []
    const worker = async () => {
      for (let f = queue.shift(); f; f = queue.shift()) {
        // 1 本の思わぬ例外で巡回を止めない（そのフィードの失敗にする）
        out.push({ f, o: await this.fetchOne(f).catch(() => this.fail(f, 'network')) })
        this.progress.done++
        this.d.emit('news.updated', { round: { ...this.round(), running: true } })
      }
    }
    await Promise.all(Array.from({ length: PARALLEL }, worker))
    // どれも通信の段で失敗したらオフライン（失敗に数えない）。ほかが取れていれば、そのフィードの失敗
    this.offline = out.every((x) => x.o === 'offline')
    if (!this.offline) for (const x of out) if (x.o === 'offline') this.fail(x.f, 'network')
    if (!this.cache.seenAt) this.cache.seenAt = this.d.now() // 初回に取った分はすべて線より下
    this.saveCache()
  }
  private async fetchOne(f: NewsFeed): Promise<Outcome> {
    const now = this.d.now()
    const run = this.runs.get(f.id) ?? { fails: 0 }
    this.runs.set(f.id, run)
    run.lastTry = now
    const c = this.cache.feeds[f.id]
    const headers: Record<string, string> = {
      'user-agent': `elecxstock/${this.d.version}`,
      accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5',
    }
    if (c?.etag) headers['if-none-match'] = c.etag
    if (c?.lastModified) headers['if-modified-since'] = c.lastModified
    const fail = (error: string, retryAt?: number) => this.fail(f, error, retryAt)
    let res: Response
    try {
      res = await this.d.fetch!(f.url, {
        headers,
        redirect: 'follow',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(TIMEOUT),
      })
    } catch (e) {
      const err = e as Error
      if (err.name === 'TimeoutError' || err.name === 'AbortError') return fail('timeout')
      if (/^blocked/.test(err.message)) return fail('blocked')
      // 通信の段の失敗は、巡回の全部がそうならオフライン（失敗に数えない）。ほかが取れていれば失敗に数える（runRound）
      if (err instanceof TypeError) return 'offline'
      return fail('network')
    }
    if (res.status === 304) {
      this.ok(f, run, c ?? { items: [] }, now)
      return 'ok'
    }
    if (res.status === 429 || res.status === 503) {
      await res.body?.cancel().catch(() => {})
      const ra = retryAfter(res.headers.get('retry-after'), now)
      return fail(`http-${res.status}`, ra != null ? now + Math.max(RETRY_AFTER_MIN, Math.min(RETRY_AFTER_MAX, ra)) : undefined)
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => {})
      return fail(`http-${res.status}`)
    }
    // 見出し（200）のあと、本文の途中で時間切れ・接続が切れることがある
    let bytes: Uint8Array | null
    try {
      bytes = await readCapped(res, MAX_BYTES)
    } catch (e) {
      const name = (e as Error).name
      return fail(name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network')
    }
    if (!bytes) return fail('too-large')
    let items: NewsItem[]
    let ttl: number | null
    try {
      const parsed = parseFeed(decodeBody(bytes, res.headers.get('content-type')))
      const seen = new Map((c?.items ?? []).map((x) => [x.key, x.seen ?? x.at] as const))
      items = toItems(parsed, f, now, seen)
      ttl = parsed.ttl
    } catch {
      return fail('parse')
    }
    const next: FeedCache = { items }
    const etag = res.headers.get('etag')
    const lm = res.headers.get('last-modified')
    if (etag) next.etag = etag
    if (lm) next.lastModified = lm
    if (ttl) next.ttl = ttl
    this.ok(f, run, next, now)
    return 'ok'
  }
  private fail(f: NewsFeed, error: string, retryAt?: number): Outcome {
    const run = this.runs.get(f.id) ?? { fails: 0 }
    this.runs.set(f.id, run)
    run.fails++
    run.error = error
    run.retryAt = retryAt ?? this.d.now() + BACKOFF[Math.min(run.fails, BACKOFF.length) - 1]!
    this.d.log(`news ${f.id}: ${error}`)
    return 'fail'
  }
  private ok(f: NewsFeed, run: FeedRun, c: FeedCache, now: number): void {
    run.fails = 0
    delete run.error
    delete run.retryAt
    this.cache.feeds[f.id] = { ...c, okAt: now }
  }

  // ---------------------------------------------------------------- 保存
  private pruneRead(now: number): void {
    const keep = Object.entries(this.cache.read)
      .filter(([, t]) => now - t < READ_DAYS * DAY)
      .sort((a, b) => b[1] - a[1])
      .slice(0, READ_MAX)
    this.cache.read = Object.fromEntries(keep)
  }
  private readJson(name: string): unknown {
    try {
      return JSON.parse(readFileSync(join(this.d.dir, name), 'utf8'))
    } catch {
      return null
    }
  }
  private writeJson(name: string, data: unknown): void {
    if (!this.d.canFetch()) return
    try {
      mkdirSync(this.d.dir, { recursive: true })
      const p = join(this.d.dir, name)
      writeFileSync(`${p}.tmp`, JSON.stringify(data))
      renameSync(`${p}.tmp`, p)
    } catch (e) {
      this.d.log(`news save ${name}: ${String(e)}`)
    }
  }
  private readCache(): Cache {
    const raw = this.readJson('cache.json') as Partial<Cache> | null
    if (raw?.v !== 1 || typeof raw.feeds !== 'object') return emptyCache()
    // 登録表に無くなったフィード・要約を許さなくなったフィードの要約は持たない
    const feeds: Record<string, FeedCache> = {}
    for (const f of this.feeds()) {
      const c = raw.feeds?.[f.id]
      if (!c || !Array.isArray(c.items)) continue
      feeds[f.id] = { ...c, items: c.items.map((x) => (f.summary ? x : { ...x, summary: undefined })) }
    }
    return {
      v: 1,
      feeds,
      read: raw.read && typeof raw.read === 'object' ? raw.read : {},
      seenAt: typeof raw.seenAt === 'number' ? raw.seenAt : 0,
      noticed: Array.isArray(raw.noticed) ? raw.noticed.filter((x) => typeof x === 'string') : [],
      ...(raw.intro === true ? { intro: true } : {}),
    }
  }
  private saveCache(): void {
    this.writeJson('cache.json', this.cache)
  }
  /** 全データの削除のとき（取った見出しのキャッシュを消す。設定は残す）。二重起動の読み取り専用では消さない */
  removeAll(): void {
    if (!this.d.canFetch()) return
    this.cache = emptyCache()
    this.runs.clear()
    rmSync(join(this.d.dir, 'cache.json'), { force: true })
    this.d.emit('news.changed', { kind: 'cache' })
    this.start('new')
  }
  /** 終了の前: ペインが見えたまま終わるときも、終了の時点を「ここまで見た」にする */
  shutdown(): void {
    if (!this.visible()) return
    this.cache.seenAt = this.d.now()
    this.saveCache()
  }
}

const emptyCache = (): Cache => ({ v: 1, feeds: {}, read: {}, seenAt: 0, noticed: [] })

/** Retry-After（秒か HTTP の日付）。ms。読めなければ null */
function retryAfter(h: string | null, now: number): number | null {
  if (!h) return null
  if (/^\d+$/.test(h.trim())) return Number(h) * 1000
  const at = Date.parse(h)
  return Number.isFinite(at) ? Math.max(0, at - now) : null
}
/** 本文を max バイトまで読む（超えたら null） */
async function readCapped(res: Response, max: number): Promise<Uint8Array | null> {
  const len = Number(res.headers.get('content-length'))
  if (len > max) {
    await res.body?.cancel().catch(() => {})
    return null
  }
  if (!res.body) return new Uint8Array()
  const reader = res.body.getReader()
  const parts: Uint8Array[] = []
  let n = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    n += value.byteLength
    if (n > max) {
      await reader.cancel().catch(() => {})
      return null
    }
    parts.push(value)
  }
  const out = new Uint8Array(n)
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.byteLength
  }
  return out
}
