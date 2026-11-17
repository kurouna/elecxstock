// ニュースのフィードの契約テスト（FR-NW2・FR-NW6。docs/design-news.md §10）: 登録表のすべてのフィードを実際に 1 回ずつ取り、
// 200・1 件以上・最新が staleDays 以内・記事のリンクのホストが linkHosts に入ることを確かめる。取った見出しは保存しない。
// 既定では動かさない（LIVE=1 のときだけ）
import { readFileSync } from 'node:fs'
import { guardFetch } from '@core/netGuard'
import { zoneOf } from '@core/news/items'
import { decodeBody, parseDate, parseFeed } from '@core/news/parse'
import { readRegistry } from '@core/news/registry'
import { describe, expect, it } from 'vitest'

const live = process.env.LIVE === '1'
const feeds = readRegistry(JSON.parse(readFileSync('resources/news/feeds.json', 'utf8')))!
const DAY = 86_400_000

describe.skipIf(!live)('ニュースのフィードとの契約（FR-NW2, FR-NW6）', () => {
  for (const f of feeds) {
    it(`${f.id}: 取れて、新しく、リンクが linkHosts の中`, async () => {
      // アプリと同じく、そのフィードのホストだけへ出られる fetch（リダイレクトの行き先も確かめる）
      const host = new URL(f.url).hostname
      const fetch = guardFetch(globalThis.fetch, (u) => u.protocol === 'https:' && u.hostname === host)
      const res = await fetch(f.url, { headers: { 'user-agent': 'elecxstock/contract-test' }, signal: AbortSignal.timeout(20_000) })
      expect(res.status, f.url).toBe(200)
      const p = parseFeed(decodeBody(new Uint8Array(await res.arrayBuffer()), res.headers.get('content-type')))
      expect(p.items.length, f.url).toBeGreaterThan(0)
      if (!f.undated) {
        const newest = Math.max(...p.items.map((x) => (x.date ? (parseDate(x.date, zoneOf(f))?.at ?? 0) : 0)))
        expect(Date.now() - newest, `${f.id} の最新の見出しが ${f.staleDays} 日より古い`).toBeLessThan(f.staleDays * DAY)
      }
      const hosts = p.items.filter((x) => x.link).map((x) => new URL(x.link!, f.url).hostname)
      expect(
        hosts.filter((h) => !f.linkHosts.includes(h)),
        `${f.id} の linkHosts の外のリンク`,
      ).toEqual([])
    }, 30_000)
  }
})
