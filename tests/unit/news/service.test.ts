// ニュースの取得の結合（L3）: 注入した時計・タイマー・fetch で、予定・下限・0 の 1 回・Retry-After・304・失敗・オフライン・
// 未回答 / オフ / ポリシーで fetch が 1 回も呼ばれない・見えていないと取らない・要約を持たない・既読と「ここまで見た」。見出しはすべて架空
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NewsService } from '@core/news/service'
import type { NewsFeed } from '@shared/news/schema'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const MIN = 60_000
const T0 = Date.UTC(2026, 10, 17, 3, 0) // 2026-11-17 12:00 JST

const feed = (id: string, o: Partial<NewsFeed> = {}): NewsFeed => ({
  id,
  lang: id.startsWith('en') ? 'en' : 'ja',
  name: { ja: `架空 ${id}`, en: `Fictional ${id}` },
  short: 'TST',
  url: `https://${id.replace('.', '-')}.feed.example/rss.xml`,
  group: 'market',
  linkHosts: ['news.example'],
  defaultOnFor: ['ja'],
  summary: true,
  staleDays: 7,
  terms: { url: 'https://feed.example/terms', checked: '2026-11-17' },
  ...o,
})
const A = feed('ja.a')
const B = feed('ja.b', { summary: false, copyright: '© 架空' })
const C = feed('ja.c', { defaultOnFor: [] })
const E = feed('en.e', { defaultOnFor: ['en'] })

const rss = (items: { t: string; at?: string; link?: string; d?: string }[]) =>
  `<rss><channel>${items
    .map(
      (i) =>
        `<item><title>${i.t}</title><link>${i.link ?? `https://news.example/${encodeURIComponent(i.t)}`}</link>${i.at ? `<pubDate>${i.at}</pubDate>` : ''}${i.d ? `<description>${i.d}</description>` : ''}</item>`,
    )
    .join('')}</channel></rss>`

type Reply = { status: number; body?: string; headers?: Record<string, string> } | 'offline' | 'timeout' | 'broken'
/** 偽の時計・タイマー・fetch。タイマーは時計を進めたときに期限の来たものを回す */
function harness(registry: NewsFeed[] | null = [A, B, C], opts: { policyOff?: boolean; canFetch?: () => boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'news-'))
  let now = T0
  let seq = 0
  const timers = new Map<number, { at: number; fn: () => void }>()
  const calls: { url: string; headers: Headers }[] = []
  const routes = new Map<string, Reply[]>()
  const events: { event: string; data: unknown }[] = []
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, headers: new Headers(init?.headers) })
    const q = routes.get(url)
    const r = (q && q.length > 1 ? q.shift() : q?.[0]) ?? { status: 404 }
    if (r === 'offline') throw new TypeError('fetch failed')
    if (r === 'timeout') throw Object.assign(new Error('timeout'), { name: 'TimeoutError' })
    if (r === 'broken') {
      // 見出し（200）のあと、本文の途中で接続が切れる
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new TextEncoder().encode('<rss><channel>'))
          c.error(new TypeError('terminated'))
        },
      })
      return new Response(body, { status: 200 })
    }
    return new Response(r.status === 304 ? null : (r.body ?? ''), { status: r.status, headers: r.headers })
  }) as typeof globalThis.fetch
  const make = (reg: NewsFeed[] | null = registry) =>
    new NewsService({
      dir,
      registry: reg,
      fetch: opts.policyOff ? null : fetch,
      now: () => now,
      setTimer: (fn, ms) => {
        const id = ++seq
        timers.set(id, { at: now + ms, fn })
        return id
      },
      clearTimer: (id) => void timers.delete(id as number),
      emit: (event, data) => events.push({ event, data }),
      log: () => {},
      version: '9.9.9',
      canFetch: opts.canFetch ?? (() => true),
    })
  let svc = make()
  /** 時計を進め、期限の来たタイマーを順に回す（回した中の非同期の取得も待つ） */
  async function advance(ms: number) {
    const end = now + ms
    for (;;) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
      if (!due) break
      timers.delete(due[0])
      now = Math.max(now, due[1].at)
      due[1].fn()
      await svc.idle()
    }
    now = end
  }
  return {
    dir,
    get svc() {
      return svc
    },
    calls,
    routes,
    events,
    advance,
    restart(reg?: NewsFeed[]) {
      svc = make(reg)
      return svc
    },
    set(url: string, ...r: Reply[]) {
      routes.set(url, r)
    },
    get now() {
      return now
    },
  }
}

let h: ReturnType<typeof harness>
const ok = (t: string, at = 'Tue, 17 Nov 2026 11:00:00 +0900', d?: string): Reply => ({ status: 200, body: rss([{ t, at, d }]) })
async function answer(on = true) {
  await h.svc.call('news.settings.set', { enabled: on }, 'main')
}
async function show(on = true, slot = 'main') {
  await h.svc.call('news.watch', { on, lang: 'ja' }, slot)
  await h.svc.idle()
}
beforeEach(() => {
  h = harness()
  h.set(A.url, ok('架空の見出し A'))
  h.set(B.url, ok('架空の見出し B', undefined, '持たない要約'))
})
afterEach(() => rmSync(h.dir, { recursive: true, force: true }))

describe('FR-NW3 答えるまで・切っている・管理者の停止では通信しない', () => {
  it('未回答では、ペインが見えていても fetch を 1 回も呼ばない', async () => {
    await show()
    await h.advance(60 * MIN)
    expect(h.calls).toEqual([])
    expect((await h.svc.call('news.list', {}, 'main')).state).toBe('unanswered')
  })
  it('切っているときは、手動の確かめでも呼ばない', async () => {
    await answer(false)
    await show()
    await h.svc.call('news.refresh', {}, 'main')
    await h.advance(60 * MIN)
    expect(h.calls).toEqual([])
    expect((await h.svc.call('news.list', {}, 'main')).state).toBe('off')
  })
  it('管理者が止めているときは fetch を作らず、設定でも取るにできない', async () => {
    h = harness([A], { policyOff: true })
    await answer(true)
    await show()
    expect((await h.svc.call('news.list', {}, 'main')).state).toBe('policy-off')
    expect((await h.svc.call('news.settings.get', {}, 'main')).state).toBe('policy-off')
  })
  it('登録表を読めないときは「使えない」', async () => {
    h = harness(null)
    await answer(true)
    await show()
    expect(h.calls).toEqual([])
    expect((await h.svc.call('news.list', {}, 'main')).state).toBe('unavailable')
  })
  it('二重起動の読み取り専用では取らない', async () => {
    h = harness([A], { canFetch: () => false })
    await answer(true)
    await show()
    expect(h.calls).toEqual([])
  })
})

describe('FR-NW4 見えている間だけ・利用者の間隔で取る', () => {
  it('答えても、ペインが見えるまでは取らない。見えたらオンのフィードだけ 1 回', async () => {
    await answer()
    await h.advance(30 * MIN)
    expect(h.calls).toEqual([])
    await show()
    expect(h.calls.map((c) => c.url).sort()).toEqual([A.url, B.url].sort())
    expect(h.calls[0]!.headers.get('user-agent')).toBe('elecxstock/9.9.9')
  })
  it('既定の 10 分ごとに回し、見えなくなったら止める', async () => {
    await answer()
    await show()
    expect(h.calls).toHaveLength(2)
    await h.advance(9 * MIN)
    expect(h.calls).toHaveLength(2)
    await h.advance(1 * MIN)
    expect(h.calls).toHaveLength(4)
    await show(false)
    await h.advance(60 * MIN)
    expect(h.calls).toHaveLength(4)
  })
  it('見えるようになったとき、最後の巡回から間隔が過ぎていれば 1 回取る（過ぎていなければ待つ）', async () => {
    await answer()
    await show()
    await show(false)
    await h.advance(3 * MIN)
    await show()
    expect(h.calls).toHaveLength(2)
    await h.advance(7 * MIN)
    expect(h.calls).toHaveLength(4)
  })
  it('どれか 1 つの窓で見えていれば取る（窓ごとの和）。窓を外すと止める', async () => {
    await answer()
    await show(true, 'free2')
    await show(false, 'main')
    expect(h.calls).toHaveLength(2)
    h.svc.unwatch('free2')
    await h.advance(30 * MIN)
    expect(h.calls).toHaveLength(2)
  })
  it('0 は起動してペインが初めて見えたときに 1 回だけ', async () => {
    await h.svc.call('news.settings.set', { enabled: true, interval: 0 }, 'main')
    await show()
    await h.advance(120 * MIN)
    await show(false)
    await show()
    expect(h.calls).toHaveLength(2)
    expect((await h.svc.call('news.list', {}, 'main')).round.next).toBeUndefined()
  })
  it('間隔を変えたら次の巡回の時刻を直す', async () => {
    await answer()
    await show()
    await h.svc.call('news.settings.set', { interval: 30 }, 'main')
    await h.advance(20 * MIN)
    expect(h.calls).toHaveLength(2)
    await h.advance(10 * MIN)
    expect(h.calls).toHaveLength(4)
  })
  it('配信元の ttl で間隔を延ばさない', async () => {
    h.set(A.url, { status: 200, body: rss([{ t: '架空' }]).replace('<channel>', '<channel><ttl>600</ttl>') })
    await answer()
    await show()
    await h.advance(10 * MIN)
    expect(h.calls.filter((c) => c.url === A.url)).toHaveLength(2)
    const st = (await h.svc.call('news.list', {}, 'main')).feeds.find((f) => f.id === A.id)
    expect(st?.ttl).toBe(600)
  })
})

describe('FR-NW5 条件付きの要求・失敗・429・オフライン・手動', () => {
  it('ETag と Last-Modified を次の要求に付け、304 なら前の見出しのまま', async () => {
    h.set(
      A.url,
      { status: 200, body: rss([{ t: '架空の見出し A' }]), headers: { etag: '"v1"', 'last-modified': 'Tue, 17 Nov 2026 02:00:00 GMT' } },
      { status: 304 },
    )
    await answer()
    await show()
    await h.advance(10 * MIN)
    const second = h.calls.filter((c) => c.url === A.url)[1]!
    expect(second.headers.get('if-none-match')).toBe('"v1"')
    expect(second.headers.get('if-modified-since')).toBe('Tue, 17 Nov 2026 02:00:00 GMT')
    const list = await h.svc.call('news.list', {}, 'main')
    expect(list.items.map((x) => x.title)).toContain('架空の見出し A')
  })
  it('失敗は前の見出しを出したまま、5・15 分で取り直し、成功で戻る', async () => {
    h.set(A.url, ok('架空の見出し A'), { status: 500 }, { status: 500 }, ok('架空の見出し A2'))
    await answer()
    await show()
    await h.advance(10 * MIN) // 2 回目: 500
    let st = (await h.svc.call('news.list', {}, 'main')).feeds.find((f) => f.id === A.id)!
    expect(st.error).toBe('http-500')
    expect(st.retryAt).toBe(T0 + 15 * MIN)
    expect((await h.svc.call('news.list', {}, 'main')).items.map((x) => x.title)).toContain('架空の見出し A')
    await h.advance(5 * MIN) // 3 回目: 500 → 15 分
    st = (await h.svc.call('news.list', {}, 'main')).feeds.find((f) => f.id === A.id)!
    expect(st.retryAt).toBe(T0 + 30 * MIN)
    await h.advance(15 * MIN)
    st = (await h.svc.call('news.list', {}, 'main')).feeds.find((f) => f.id === A.id)!
    expect(st.error).toBeUndefined()
    expect((await h.svc.call('news.list', {}, 'main')).items.map((x) => x.title)).toContain('架空の見出し A2')
  })
  it('429 は Retry-After まで飛ばす（上限 24 時間）', async () => {
    h.set(A.url, { status: 429, headers: { 'retry-after': '3600' } }, ok('架空の見出し A'))
    await answer()
    await show()
    await h.advance(50 * MIN)
    expect(h.calls.filter((c) => c.url === A.url)).toHaveLength(1)
    await h.advance(10 * MIN)
    expect(h.calls.filter((c) => c.url === A.url)).toHaveLength(2)
    h.set(B.url, { status: 503, headers: { 'retry-after': String(7 * 86400) } })
    await h.advance(2 * MIN)
    await h.svc.call('news.refresh', {}, 'main')
    await h.svc.idle()
    const st = (await h.svc.call('news.list', {}, 'main')).feeds.find((f) => f.id === B.id)!
    expect(st.error).toBe('http-503')
    expect(st.retryAt! - h.now).toBeLessThanOrEqual(24 * 60 * MIN)
  })
  it('オフラインの間は失敗に数えず、「オフライン」と出す', async () => {
    h.set(A.url, 'offline')
    h.set(B.url, 'offline')
    await answer()
    await show()
    const l = await h.svc.call('news.list', {}, 'main')
    expect(l.round.offline).toBe(true)
    expect(l.feeds.find((f) => f.id === A.id)!.error).toBeUndefined()
  })
  it('ほかのフィードが取れているときの通信の失敗は、そのフィードの失敗に数える', async () => {
    h.set(A.url, 'offline')
    await answer()
    await show()
    const l = await h.svc.call('news.list', {}, 'main')
    expect(l.round.offline).toBe(false)
    expect(l.feeds.find((f) => f.id === A.id)!.error).toBe('network')
  })
  it('時間切れは失敗に数える', async () => {
    h.set(A.url, 'timeout')
    await answer()
    await show()
    expect((await h.svc.call('news.list', {}, 'main')).feeds.find((f) => f.id === A.id)!.error).toBe('timeout')
  })
  it('2 MB を超える本文は読まない', async () => {
    h.set(A.url, { status: 200, body: `<rss><channel>${' '.repeat(2 * 1024 * 1024 + 10)}</channel></rss>` })
    await answer()
    await show()
    expect((await h.svc.call('news.list', {}, 'main')).feeds.find((f) => f.id === A.id)!.error).toBe('too-large')
  })
  it('手動（R）は同じフィードを 60 秒以内には取り直さない', async () => {
    await answer()
    await show()
    await h.svc.call('news.refresh', {}, 'main')
    await h.svc.idle()
    expect(h.calls).toHaveLength(2)
    await h.advance(61_000)
    await h.svc.call('news.refresh', {}, 'main')
    await h.svc.idle()
    expect(h.calls).toHaveLength(4)
  })
  it('フィードをオンにしたら、次の巡回を待たずにそのフィードを取る', async () => {
    h.set(C.url, ok('架空の見出し C'))
    await answer()
    await show()
    await h.svc.call('news.settings.set', { feeds: { [C.id]: true } }, 'main')
    await h.svc.idle()
    expect(h.calls.filter((c) => c.url === C.url)).toHaveLength(1)
  })
})

describe('FR-NW9 配信元の条件・保存', () => {
  it('要約を許していないフィードは要約をキャッシュにも持たない', async () => {
    await answer()
    await show()
    const l = await h.svc.call('news.list', {}, 'main')
    expect(l.items.find((x) => x.feed === B.id)!.summary).toBeUndefined()
    expect(readFileSync(join(h.dir, 'cache.json'), 'utf8')).not.toContain('持たない要約')
  })
  it('設定とキャッシュは data/news に置き、起動し直しても残る（キャッシュを消せる）', async () => {
    await answer()
    await show()
    const s = h.restart()
    expect((await s.call('news.list', {}, 'main')).items.length).toBe(2)
    expect((await s.call('news.settings.get', {}, 'main')).settings.enabled).toBe(true)
    await s.call('news.clearCache', {}, 'main')
    expect((await s.call('news.list', {}, 'main')).items).toEqual([])
  })
  it('keepDays を過ぎた見出しは出さない', async () => {
    await answer()
    await show()
    await show(false)
    await h.advance(31 * 24 * 60 * MIN)
    expect((await h.svc.call('news.list', {}, 'main')).items).toEqual([])
  })
})

describe('FR-NW8 既読と「ここまで見た」', () => {
  it('初回に取った分はすべて線より下。見えなくなった時点が次の線', async () => {
    await answer()
    await show()
    let l = await h.svc.call('news.list', {}, 'main')
    expect(l.items.every((x) => x.at <= l.seenAt)).toBe(true)
    await show(false)
    const hidden = h.now
    await h.advance(10 * MIN)
    await show()
    l = await h.svc.call('news.list', {}, 'main')
    expect(l.seenAt).toBe(hidden)
  })
  it('開いた見出しは既読。全窓に知らせる', async () => {
    await answer()
    await show()
    const key = (await h.svc.call('news.list', {}, 'main')).items[0]!.key
    await h.svc.call('news.markRead', { key }, 'main')
    expect((await h.svc.call('news.list', {}, 'main')).read).toEqual([key])
    expect(h.events.some((e) => e.event === 'news.changed' && (e.data as { kind: string }).kind === 'read')).toBe(true)
  })
  it('まだ答えていない既存の利用者に、ペインの案内を一度だけ出す', async () => {
    expect((await h.svc.call('news.list', {}, 'main')).intro).toBe(true)
    await h.svc.call('news.noticed', {}, 'main')
    expect((await h.restart().call('news.list', {}, 'main')).intro).toBe(false)
  })
  it('答えたら、ペインの案内は出さない', async () => {
    await answer(false)
    expect((await h.svc.call('news.list', {}, 'main')).intro).toBe(false)
  })
  it('後の版で既定オンが増えたら案内し、見たら出さない', async () => {
    await answer()
    const s = h.restart([A, B, C, feed('ja.d')])
    await s.call('news.watch', { on: false, lang: 'ja' }, 'main')
    expect((await s.call('news.list', {}, 'main')).notice).toEqual(['ja.d'])
    await s.call('news.noticed', {}, 'main')
    expect((await s.call('news.list', {}, 'main')).notice).toEqual([])
  })
})

describe('FR-NW2 通信先', () => {
  it('ニュースの通信先はオンのフィードのホストの完全一致だけ', async () => {
    await answer()
    expect(h.svc.allowed(new URL(A.url))).toBe(true)
    expect(h.svc.allowed(new URL(C.url))).toBe(false)
    expect(h.svc.allowed(new URL(A.url.replace('https:', 'http:')))).toBe(false)
    expect(h.svc.allowed(new URL('https://query1.finance.yahoo.com/'))).toBe(false)
    await answer(false)
    expect(h.svc.allowed(new URL(A.url))).toBe(false)
  })
  it('記事を開いてよいホストは全フィードの linkHosts', () => {
    expect(h.svc.linkHosts()).toEqual(['news.example'])
  })
})

describe('FR-NW5 巡回の頑健さ（レビューの指摘）', () => {
  it('本文の途中で切れたら、そのフィードの失敗（通信）にして、巡回は最後まで終える', async () => {
    h.set(A.url, 'broken')
    await answer()
    await show()
    const l = await h.svc.call('news.list', {}, 'main')
    const st = l.feeds.find((f) => f.id === A.id)!
    expect(st.error).toBe('network')
    expect(st.retryAt).toBe(T0 + 5 * MIN)
    expect(l.items.map((x) => x.feed)).toEqual([B.id])
    expect(l.round.running).toBe(false)
  })
  it('Retry-After: 0 や過去の日付でも、すぐには取り直さない（少なくとも 1 分）', async () => {
    h.set(A.url, { status: 429, headers: { 'retry-after': '0' } })
    h.set(B.url, { status: 503, headers: { 'retry-after': 'Tue, 01 Sep 2026 00:00:00 GMT' } })
    await answer()
    await show()
    const l = await h.svc.call('news.list', {}, 'main')
    for (const id of [A.id, B.id]) expect(l.feeds.find((f) => f.id === id)!.retryAt! - T0).toBeGreaterThanOrEqual(MIN)
    await h.advance(30_000)
    expect(h.calls).toHaveLength(2)
  })
  it('巡回の最中にフィードをオンにしても、巡回のあとで取る', async () => {
    h.set(C.url, ok('架空の見出し C'))
    await answer()
    await h.svc.call('news.watch', { on: true, lang: 'ja' }, 'main') // 巡回が始まる（まだ終わっていない）
    await h.svc.call('news.settings.set', { feeds: { [C.id]: true } }, 'main')
    await h.svc.idle()
    expect(h.calls.filter((c) => c.url === C.url)).toHaveLength(1)
  })
  it('ペインを隠している間にオンにしたフィードは、次に見えたときに取る（巡回の時刻の前でも）', async () => {
    h.set(C.url, ok('架空の見出し C'))
    await answer()
    await show()
    await show(false)
    await h.svc.call('news.settings.set', { feeds: { [C.id]: true } }, 'main')
    await h.advance(MIN)
    await show()
    expect(h.calls.filter((c) => c.url === C.url)).toHaveLength(1)
  })
  it('表示言語は、ペインが見えていなくても Core に伝わる（通信先の一覧が表示言語に合う）', async () => {
    h = harness([A, E])
    await answer()
    await h.svc.call('news.watch', { on: false, lang: 'en' }, 'main')
    expect(h.svc.hosts()).toEqual([new URL(E.url).hostname])
  })
  it('手動で取るものが無いときは「確認」の時刻を進めない', async () => {
    await answer()
    await show()
    await h.advance(30_000)
    await h.svc.call('news.refresh', {}, 'main')
    await h.svc.idle()
    expect((await h.svc.call('news.list', {}, 'main')).round.last).toBe(T0)
  })
  it('巡回の進み具合を 1 本ごとに知らせる', async () => {
    await answer()
    await show()
    const done = h.events.filter((e) => e.event === 'news.updated').map((e) => (e.data as { round: { done: number } }).round.done)
    expect(done).toContain(1)
  })
  it('キャッシュを消したら知らせて、見えていれば取り直す', async () => {
    await answer()
    await show()
    h.events.length = 0
    await h.svc.call('news.clearCache', {}, 'main')
    await h.svc.idle()
    expect(h.events.some((e) => e.event === 'news.changed')).toBe(true)
    expect(h.calls).toHaveLength(4)
    expect((await h.svc.call('news.list', {}, 'main')).items).toHaveLength(2)
  })
  it('全データの削除（removeAll）も知らせる。読み取り専用では消さない', async () => {
    await answer()
    await show()
    h.events.length = 0
    h.svc.removeAll()
    await h.svc.idle()
    expect(h.events.some((e) => e.event === 'news.changed')).toBe(true)
    const keep = readFileSync(join(h.dir, 'cache.json'), 'utf8')
    const ro = new NewsService({ ...roDeps(h.dir), canFetch: () => false })
    ro.removeAll()
    expect(readFileSync(join(h.dir, 'cache.json'), 'utf8')).toBe(keep)
  })
})

describe('FR-NW8 「ここまで見た」（レビューの指摘）', () => {
  it('見えたまま終了しても、終了の時点を線にする', async () => {
    await answer()
    await show()
    await h.advance(20 * MIN)
    h.svc.shutdown()
    expect((await h.restart().call('news.list', {}, 'main')).seenAt).toBe(h.now)
  })
  it('見出しは初めて取った時刻（seen）を持つ。掲載の時刻が古くても、後から届いたものは線より上に出せる', async () => {
    h.set(A.url, ok('架空 1'), {
      status: 200,
      body: rss([
        { t: '架空 1', at: 'Tue, 17 Nov 2026 11:00:00 +0900' },
        { t: '遅れて届いた架空', at: 'Tue, 17 Nov 2026 10:00:00 +0900' },
      ]),
    })
    await answer()
    await show()
    await show(false)
    const seenAt = h.now
    await h.advance(10 * MIN)
    await show()
    const l = await h.svc.call('news.list', {}, 'main')
    expect(l.seenAt).toBe(seenAt)
    const late = l.items.find((x) => x.title === '遅れて届いた架空')!
    expect(late.at).toBeLessThan(seenAt)
    expect(late.seen).toBe(T0 + 10 * MIN)
    expect(l.items.find((x) => x.title === '架空 1')!.seen).toBe(T0)
  })
})

/** 読み取り専用の確かめ用（通信しない） */
const roDeps = (dir: string) => ({
  dir,
  registry: [A, B],
  fetch: null,
  now: () => T0,
  setTimer: () => 0,
  clearTimer: () => {},
  emit: () => {},
  log: () => {},
  version: '0',
  canFetch: () => true,
})
