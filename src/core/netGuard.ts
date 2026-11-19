// 外部への通信の制限（NFR-S1）。Core の fetch を、許可リストのホストへの https だけに絞る。
// worker.ts が globalThis.fetch を差し替えるときに使う（Electron に依存しない純 TS。単体テストで確かめる）

/** 許可するホスト。api.github.com は新しい版の確認だけ（NFR-Q9。設定で切れる） */
export const ALLOWED_HOSTS: readonly RegExp[] = [/(^|\.)yahoo\.com$/, /^www\.jpx\.co\.jp$/, /^api\.github\.com$/]

/** 設定の「このアプリの通信先」に出す名前（ALLOWED_HOSTS と同じ並び） */
export const ALLOWED_HOST_NAMES: readonly string[] = ['*.yahoo.com', 'www.jpx.co.jp', 'api.github.com']

/**
 * 許可。ホストの表か、要求のたびに判断する述語（ニュースの fetch。オンのフィードは設定で変わる。docs/design-news.md §4.3）。
 * 述語は https かどうかも自分で判断する
 */
export type Allow = readonly RegExp[] | ((url: URL) => boolean)

/** https・既定のポート・認証情報なしで、ホストが許可リストに入るか（ニュースの NewsService.allowed と同じ条件） */
export function isAllowedUrl(url: URL, allow: Allow): boolean {
  if (typeof allow === 'function') return allow(url)
  if (url.protocol !== 'https:' || url.port !== '' || url.username || url.password) return false
  return allow.some((r) => r.test(url.hostname))
}

const urlOf = (input: RequestInfo | URL): URL => new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)

/** 追うリダイレクトの数の上限（本物の fetch の既定は 20） */
export const MAX_REDIRECTS = 20
const REDIRECT = new Set([301, 302, 303, 307, 308])
/** 別のオリジンへのリダイレクトで落とす見出し */
const CROSS_ORIGIN_DROP = ['authorization', 'proxy-authorization', 'cookie'] as const

/**
 * 許可リストで絞った fetch。
 *
 * 本物の fetch は既定（redirect: 'follow'）で 3xx を自分で追い、行き先を確かめない。最初の URL だけを見ると、許可したホストから
 * 許可していないホストへ転送されたとき通ってしまう。そこで、追うのはこちらで行う: 本物には redirect: 'manual' で渡し、Location を
 * 許可リストで確かめてから次を送る（方法と本文の扱いは Fetch の仕様と同じ: 303 と、POST の 301・302 は GET にして本文を落とす）。
 * 呼んだ側が 'manual' を指定したら 3xx をそのまま返す（次の要求もこの関数を通るので確かめられる）。'error' ならリダイレクトを失敗にする。
 */
export function guardFetch(realFetch: typeof fetch, allow: Allow): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    let url = urlOf(input)
    if (!isAllowedUrl(url, allow)) throw new Error(`blocked host: ${url.hostname}`)
    const mode = init?.redirect ?? (input instanceof Request ? input.redirect : 'follow')
    if (mode === 'manual') return realFetch(input, init)

    let method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    // Request の本文は 1 回送ると送り直せないので、写し（tee）を取っておき、本文ごと送り直すリダイレクトのときだけ読む。
    // 送る前に読み切らない（終わらない本文でも送り出す）。GET・HEAD と、リダイレクトを追わない 'error' では写さない
    const spare =
      mode === 'follow' &&
      init?.body === undefined &&
      input instanceof Request &&
      input.body !== null &&
      method !== 'GET' &&
      method !== 'HEAD'
        ? input.clone()
        : null
    /** 本文を落とした（GET にした）あとは、写しを読まない */
    let useSpare = spare !== null
    /** 今のリダイレクトの応答（断って投げるときに本文を取りやめる） */
    let res: Response | undefined
    try {
      res = await realFetch(input, { ...init, redirect: 'manual' })
      // 2 回目からは Request ではなく URL と init で送る（本文はリダイレクトで送り直せる形のときだけ。下）
      let body: BodyInit | null = init?.body ?? null
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
      const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined)
      for (let hops = 0; REDIRECT.has(res.status); hops++) {
        const location = res.headers.get('location')
        if (location === null) return res
        if (mode === 'error') throw new TypeError(`redirect not allowed: ${url.hostname}`)
        if (hops >= MAX_REDIRECTS) throw new TypeError('too many redirects')
        const next = new URL(location, url)
        if (!isAllowedUrl(next, allow)) throw new Error(`blocked redirect: ${next.hostname}`)
        if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === 'POST')) {
          if (method !== 'HEAD') method = 'GET'
          body = null
          useSpare = false
          for (const h of ['content-type', 'content-length', 'content-encoding', 'content-language', 'content-location']) headers.delete(h)
        } else if (useSpare && spare) {
          body = await spare.arrayBuffer()
          useSpare = false
        } else if (body instanceof ReadableStream) {
          // 読み終えたストリームは送り直せない（本物の fetch も同じく失敗にする）
          throw new TypeError('cannot follow redirect with a streamed body')
        }
        // 別のオリジンへは資格情報を送らない（本物の fetch〔undici〕と同じ見出し）
        if (next.origin !== url.origin) for (const h of CROSS_ORIGIN_DROP) headers.delete(h)
        await res.body?.cancel().catch(() => {})
        url = next
        res = await realFetch(url.href, { ...init, method, body, headers, signal, redirect: 'manual' })
      }
      return res
    } catch (e) {
      // 断ったリダイレクトの本文を読まずに捨てる（接続を握ったままにしない）
      if (res && !res.bodyUsed) void res.body?.cancel().catch(() => {})
      throw e
    } finally {
      // 読まなかった写しは捨てる（tee の片方に溜まり続けないように）
      if (spare && !spare.bodyUsed) void spare.body?.cancel().catch(() => {})
    }
  }
}
