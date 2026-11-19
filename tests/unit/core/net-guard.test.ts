// 外部への通信の制限（NFR-S1）: 許可リストのホストへの https だけ。リダイレクトの行き先も同じ表で確かめる。
// 実際の通信はせず、fetch の偽物で確かめる（偽物は、本物の fetch と同じく redirect の既定で 3xx を自分で追う）
import { ALLOWED_HOSTS, guardFetch, isAllowedUrl } from '@core/netGuard'
import { describe, expect, it } from 'vitest'

type Route = { status: number; location?: string; body?: string }

/** 偽の fetch。届いた URL を hits に残す。redirect が 'manual' でなければ、本物と同じく 3xx を自分で追う */
function fakeFetch(routes: Record<string, Route>) {
  const hits: { url: string; method: string; body: unknown }[] = []
  const auth: (string | null)[] = []
  const heads: Headers[] = []
  const one = async (url: string, init?: RequestInit, depth = 0): Promise<Response> => {
    hits.push({ url, method: init?.method ?? 'GET', body: init?.body ?? null })
    auth.push(new Headers(init?.headers).get('authorization'))
    heads.push(new Headers(init?.headers))
    const r = routes[url] ?? { status: 404 }
    const headers = new Headers(r.location ? { location: r.location } : {})
    const res = new Response(r.status >= 300 && r.status < 400 ? null : (r.body ?? ''), { status: r.status, headers })
    if (r.status >= 300 && r.status < 400 && r.location && init?.redirect !== 'manual') {
      if (depth > 20) throw new TypeError('fetch failed')
      return one(new URL(r.location, url).href, init, depth + 1)
    }
    return res
  }
  const f = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    return one(url, init)
  }) as typeof fetch
  return { f, hits, auth, heads }
}

const Y = 'https://query1.finance.yahoo.com/v8/finance/chart/7203.T'
const EVIL = 'https://evil.example/collect'

describe('NFR-S1 通信の制限（許可リストとリダイレクト）', () => {
  it('許可リストのホストへの https だけを通す', () => {
    expect(isAllowedUrl(new URL(Y), ALLOWED_HOSTS)).toBe(true)
    expect(isAllowedUrl(new URL('https://www.jpx.co.jp/a.xlsx'), ALLOWED_HOSTS)).toBe(true)
    expect(isAllowedUrl(new URL('https://api.github.com/repos/x'), ALLOWED_HOSTS)).toBe(true)
    expect(isAllowedUrl(new URL('http://query1.finance.yahoo.com/'), ALLOWED_HOSTS)).toBe(false)
    expect(isAllowedUrl(new URL('https://yahoo.com.evil.example/'), ALLOWED_HOSTS)).toBe(false)
    expect(isAllowedUrl(new URL('https://jpx.co.jp/'), ALLOWED_HOSTS)).toBe(false)
    expect(isAllowedUrl(new URL(EVIL), ALLOWED_HOSTS)).toBe(false)
  })

  it('許可リストにないホストへは 1 本も出さない', async () => {
    const { f, hits } = fakeFetch({})
    await expect(guardFetch(f, ALLOWED_HOSTS)(EVIL)).rejects.toThrow(/blocked host: evil\.example/)
    expect(hits).toEqual([])
  })

  it('許可したホストから許可していないホストへのリダイレクトは追わない', async () => {
    const { f, hits } = fakeFetch({ [Y]: { status: 302, location: EVIL }, [EVIL]: { status: 200, body: 'x' } })
    await expect(guardFetch(f, ALLOWED_HOSTS)(Y)).rejects.toThrow(/blocked redirect: evil\.example/)
    expect(hits.map((h) => h.url)).toEqual([Y])
  })

  it('https から http へのリダイレクトも追わない', async () => {
    const http = 'http://query2.finance.yahoo.com/x'
    const { f, hits } = fakeFetch({ [Y]: { status: 301, location: http } })
    await expect(guardFetch(f, ALLOWED_HOSTS)(Y)).rejects.toThrow(/blocked redirect/)
    expect(hits.map((h) => h.url)).toEqual([Y])
  })

  it('許可したホストの中のリダイレクトは追い、最後の応答を返す（相対の Location も）', async () => {
    const a = 'https://fc.yahoo.com/'
    const b = 'https://guce.yahoo.com/consent'
    const c = 'https://guce.yahoo.com/done'
    const { f, hits } = fakeFetch({
      [a]: { status: 302, location: b },
      [b]: { status: 307, location: '/done' },
      [c]: { status: 200, body: 'ok' },
    })
    const res = await guardFetch(f, ALLOWED_HOSTS)(a)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ok')
    expect(hits.map((h) => h.url)).toEqual([a, b, c])
  })

  it('303 と、POST の 301・302 は GET に変え、本文を送らない。307・308 は方法と本文をそのまま送る', async () => {
    const p = 'https://query1.finance.yahoo.com/post'
    const g = 'https://query1.finance.yahoo.com/get'
    const k = 'https://query1.finance.yahoo.com/keep'
    for (const [status, method, body] of [
      [303, 'GET', null],
      [302, 'GET', null],
      [301, 'GET', null],
      [307, 'POST', 'q=1'],
      [308, 'POST', 'q=1'],
    ] as const) {
      const to = method === 'GET' ? g : k
      const { f, hits } = fakeFetch({ [p]: { status, location: to }, [to]: { status: 200 } })
      await guardFetch(f, ALLOWED_HOSTS)(p, { method: 'POST', body: 'q=1' })
      expect(hits[1]).toEqual({ url: to, method, body })
    }
  })

  it('呼んだ側が redirect: manual を指定したら、追わずに 3xx を返す（yahoo-finance2 の crumb の取得）', async () => {
    const { f, hits } = fakeFetch({ [Y]: { status: 302, location: EVIL } })
    const res = await guardFetch(f, ALLOWED_HOSTS)(Y, { redirect: 'manual' })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(EVIL)
    expect(hits.map((h) => h.url)).toEqual([Y])
  })

  it('redirect: error なら、リダイレクトは失敗にする', async () => {
    const { f } = fakeFetch({ [Y]: { status: 302, location: 'https://guce.yahoo.com/' } })
    await expect(guardFetch(f, ALLOWED_HOSTS)(Y, { redirect: 'error' })).rejects.toThrow(/redirect/)
  })

  it('リダイレクトが続きすぎたら止める', async () => {
    const a = 'https://a.yahoo.com/'
    const b = 'https://b.yahoo.com/'
    const { f, hits } = fakeFetch({ [a]: { status: 302, location: b }, [b]: { status: 302, location: a } })
    await expect(guardFetch(f, ALLOWED_HOSTS)(a)).rejects.toThrow(/too many redirects/)
    expect(hits.length).toBeLessThanOrEqual(21)
  })

  it('Location の無い 3xx はそのまま返す', async () => {
    const { f } = fakeFetch({ [Y]: { status: 304 } })
    expect((await guardFetch(f, ALLOWED_HOSTS)(Y)).status).toBe(304)
  })
})

describe('NFR-S1 リダイレクトで送る見出し', () => {
  it('別のオリジンへ移るときは Authorization を送らない', async () => {
    const a = 'https://api.github.com/repos/x'
    const b = 'https://objects.github.com/y'
    const allow = [...ALLOWED_HOSTS, /^objects\.github\.com$/]
    const { f, auth } = fakeFetch({ [a]: { status: 302, location: b }, [b]: { status: 200 } })
    await guardFetch(f, allow)(a, { headers: { authorization: 'token x' } })
    expect(auth).toEqual(['token x', null])
  })

  it('別のオリジンへ移るときは Cookie・Proxy-Authorization も送らない（本物の fetch と同じ）', async () => {
    const a = 'https://fc.yahoo.com/'
    const b = 'https://guce.yahoo.com/consent'
    const { f, heads } = fakeFetch({ [a]: { status: 302, location: b }, [b]: { status: 200 } })
    await guardFetch(f, ALLOWED_HOSTS)(a, { headers: { cookie: 'A=1', 'proxy-authorization': 'Basic x', 'x-keep': 'k' } })
    expect(heads.map((h) => [h.get('cookie'), h.get('proxy-authorization'), h.get('x-keep')])).toEqual([
      ['A=1', 'Basic x', 'k'],
      [null, null, 'k'],
    ])
  })

  it('同じオリジンの中のリダイレクトでは見出しをそのまま送る', async () => {
    const a = 'https://query1.finance.yahoo.com/a'
    const b = 'https://query1.finance.yahoo.com/b'
    const { f, heads } = fakeFetch({ [a]: { status: 302, location: b }, [b]: { status: 200 } })
    await guardFetch(f, ALLOWED_HOSTS)(a, { headers: { cookie: 'A=1', authorization: 'token x' } })
    expect(heads.map((h) => [h.get('cookie'), h.get('authorization')])).toEqual([
      ['A=1', 'token x'],
      ['A=1', 'token x'],
    ])
  })
})

describe('NFR-S1 Request で渡した要求のリダイレクト', () => {
  it('Request の本文も 307・308 では送り直す', async () => {
    const p = 'https://query1.finance.yahoo.com/post'
    const k = 'https://query1.finance.yahoo.com/keep'
    for (const status of [307, 308]) {
      const { f, hits } = fakeFetch({ [p]: { status, location: k }, [k]: { status: 200 } })
      await guardFetch(f, ALLOWED_HOSTS)(new Request(p, { method: 'POST', body: 'q=1' }))
      expect(hits[1]?.method).toBe('POST')
      const body = hits[1]?.body
      expect(body == null ? null : new TextDecoder().decode(body as ArrayBuffer)).toBe('q=1')
    }
  })
})

describe('NFR-S1 許可を述語で渡す（ニュースの fetch。docs/design-news.md §4.3）', () => {
  const BOJ = 'https://www.boj.example/rss/whatsnew.xml'
  const onHosts = new Set(['www.boj.example'])
  const allow = (u: URL) => u.protocol === 'https:' && onHosts.has(u.hostname)
  it('述語が許すホストだけに出て、リダイレクトの行き先も述語で確かめる', async () => {
    const { f, hits } = fakeFetch({ [BOJ]: { status: 302, location: EVIL }, [EVIL]: { status: 200 } })
    await expect(guardFetch(f, allow)(BOJ)).rejects.toThrow(/blocked redirect: evil.example/)
    expect(hits.map((h) => h.url)).toEqual([BOJ])
  })
  it('述語は要求のたびに読む（オンのフィードが変われば、次の要求から変わる）', async () => {
    const { f } = fakeFetch({ [BOJ]: { status: 200 } })
    const g = guardFetch(f, allow)
    expect((await g(BOJ)).status).toBe(200)
    onHosts.delete('www.boj.example')
    await expect(g(BOJ)).rejects.toThrow(/blocked host/)
    onHosts.add('www.boj.example')
  })
  it('ニュースの fetch は Yahoo へ、既存の fetch はフィードのホストへ出られない', async () => {
    const { f, hits } = fakeFetch({ [Y]: { status: 200 }, [BOJ]: { status: 200 } })
    await expect(guardFetch(f, allow)(Y)).rejects.toThrow(/blocked host/)
    await expect(guardFetch(f, ALLOWED_HOSTS)(BOJ)).rejects.toThrow(/blocked host/)
    expect(hits).toEqual([])
  })
})
