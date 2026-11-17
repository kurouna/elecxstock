// フィードの読み取り（L1）: 形式・日付の揺れ・エンティティ・CDATA・文字コード・リンク・要約の扱い。フィクスチャの見出しはすべて架空

import { toItems } from '@core/news/items'
import { decodeBody, parseDate, parseFeed } from '@core/news/parse'
import type { NewsFeed } from '@shared/news/schema'
import { describe, expect, it } from 'vitest'

const FEED: NewsFeed = {
  id: 'ja.test',
  lang: 'ja',
  name: { ja: '架空の配信元', en: 'Fictional source' },
  short: 'TST',
  url: 'https://feed.example/rss.xml',
  group: 'market',
  linkHosts: ['news.example'],
  defaultOnFor: [],
  summary: true,
  staleDays: 7,
  terms: null,
}
const NOW = Date.UTC(2026, 10, 17, 3, 0) // 2026-11-17 12:00 JST

const rss2 = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>架空</title><ttl>60</ttl>
<item><title>架空の見出し &amp; その 1</title><link>http://news.example/a?utm_source=rss&amp;id=1</link>
<pubDate>Tue, 17 Nov 2026 11:15:00 +0900</pubDate><description><![CDATA[<p>架空の<b>要約</b> &amp; 本文</p>]]></description></item>
<item><title><![CDATA[CDATA の <b>見出し</b>]]></title><link>https://evil.example/x</link><pubDate>Tue, 17 Nov 2026 10:00:00 JST</pubDate></item>
<item><title></title><link>https://news.example/empty</link></item>
</channel></rss>`

const rdf = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel rdf:about="https://feed.example/"><title>架空 RDF</title></channel>
<item rdf:about="https://news.example/r1"><title>RDF の架空の見出し</title><link>https://news.example/r1</link><dc:date>2026-11-17T09:30:00+09:00</dc:date></item>
</rdf:RDF>`

const atom = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>Fictional</title>
<entry><title type="html">Fictional &lt;i&gt;headline&lt;/i&gt;</title><link rel="self" href="https://feed.example/self"/><link rel="alternate" href="https://news.example/e1"/>
<updated>2026-11-17T01:00:00Z</updated><summary>Fictional summary</summary></entry>
</feed>`

describe('FR-NW6 フィードの読み取り（RSS 2.0・RDF・Atom）', () => {
  it('RSS 2.0: 見出し・リンク・日付・要約（HTML は文字にする）・ttl。空の見出しは捨てる', () => {
    const p = parseFeed(rss2)
    expect(p.ttl).toBe(60)
    expect(p.items).toHaveLength(2)
    expect(p.items[0]).toMatchObject({
      title: '架空の見出し & その 1',
      link: 'http://news.example/a?utm_source=rss&id=1',
      summary: '架空の 要約 & 本文',
    })
    expect(p.items[1]!.title).toBe('CDATA の 見出し')
  })
  it('RDF: 項目は channel の外。dc:date を読む', () => {
    const p = parseFeed(rdf)
    expect(p.items).toEqual([
      expect.objectContaining({ title: 'RDF の架空の見出し', link: 'https://news.example/r1', date: '2026-11-17T09:30:00+09:00' }),
    ])
  })
  it('Atom: alternate のリンクを選び、エスケープされた HTML を文字にする', () => {
    const p = parseFeed(atom)
    expect(p.items[0]).toMatchObject({ title: 'Fictional headline', link: 'https://news.example/e1', summary: 'Fictional summary' })
  })
  it('DOCTYPE で定義したエンティティは展開しない（指数的に膨らむ文書で止まらない）', () => {
    const bomb = `<?xml version="1.0"?><!DOCTYPE r [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;"><!ENTITY c "&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;">]>
<rss><channel><item><title>&c; 架空</title><link>https://news.example/b</link></item></channel></rss>`
    const p = parseFeed(bomb)
    expect(p.items[0]!.title).toBe('&c; 架空')
  })
  it('フィードでない文書は失敗にする', () => {
    expect(() => parseFeed('<html><body>not a feed</body></html>')).toThrow()
    expect(() => parseFeed('not xml at all')).toThrow()
  })
})

describe('FR-NW6 日付の揺れ', () => {
  const JST = '+09:00'
  it('RFC 822 と ISO 8601（時刻帯あり）', () => {
    expect(parseDate('Tue, 17 Nov 2026 11:15:00 +0900', JST)).toEqual({ at: Date.UTC(2026, 10, 17, 2, 15), dateOnly: false })
    expect(parseDate('2026-11-17T02:15:00Z', JST)).toEqual({ at: Date.UTC(2026, 10, 17, 2, 15), dateOnly: false })
  })
  it('JST などの略号は置き換えの表で読む', () => {
    expect(parseDate('Tue, 17 Nov 2026 11:15:00 JST', JST)!.at).toBe(Date.UTC(2026, 10, 17, 2, 15))
    expect(parseDate('Tue, 17 Nov 2026 06:15:00 EST', JST)!.at).toBe(Date.UTC(2026, 10, 17, 11, 15))
    expect(parseDate('Tue, 17 Nov 2026 02:15:00 GMT', JST)!.at).toBe(Date.UTC(2026, 10, 17, 2, 15))
  })
  it('時刻帯の無い日付はフィードの時刻帯（PC の時刻帯に依らない）', () => {
    expect(parseDate('2026-11-17T11:15:00', JST)!.at).toBe(Date.UTC(2026, 10, 17, 2, 15))
    expect(parseDate('2026-11-17 11:15', '+00:00')!.at).toBe(Date.UTC(2026, 10, 17, 11, 15))
    expect(parseDate('Tue, 17 Nov 2026 11:15:00', JST)!.at).toBe(Date.UTC(2026, 10, 17, 2, 15))
  })
  it('日付だけは時刻を出さない（その日の 0 時）', () => {
    expect(parseDate('2026-11-17', JST)).toEqual({ at: Date.UTC(2026, 10, 16, 15, 0), dateOnly: true })
  })
  it('曜日と月の名前の形で時刻の無いもの（Tue, 17 Nov 2026）も、フィードの時刻帯の日付だけ', () => {
    expect(parseDate('Tue, 17 Nov 2026', JST)).toEqual({ at: Date.UTC(2026, 10, 16, 15, 0), dateOnly: true })
    expect(parseDate('17 Nov 2026', '+00:00')).toEqual({ at: Date.UTC(2026, 10, 17, 0, 0), dateOnly: true })
  })
  it('読めないものは null', () => {
    expect(parseDate('someday', JST)).toBeNull()
    expect(parseDate('', JST)).toBeNull()
  })
})

describe('FR-NW6 文字コード', () => {
  it('Content-Type の charset → XML 宣言 → UTF-8 の順で決める。Shift_JIS も解ける', () => {
    const sjis = new Uint8Array([0x93, 0xfa, 0x96, 0x7b]) // 「日本」
    expect(decodeBody(sjis, 'text/xml; charset=Shift_JIS')).toBe('日本')
    const decl = new Uint8Array([...new TextEncoder().encode('<?xml version="1.0" encoding="Shift_JIS"?>'), ...sjis])
    expect(decodeBody(decl, 'text/xml')).toContain('日本')
    expect(decodeBody(new TextEncoder().encode('架空'), null)).toBe('架空')
    expect(decodeBody(new TextEncoder().encode('架空'), 'text/xml; charset=unknown-x')).toBe('架空')
  })
})

describe('FR-NW6・FR-NW9 見出しに整える', () => {
  it('リンクは https に上げて linkHosts だけ残し、未来の日付は今に丸める。新しい順', () => {
    const items = toItems(parseFeed(rss2), FEED, NOW, new Map())
    expect(items.map((x) => x.title)).toEqual(['架空の見出し & その 1', 'CDATA の 見出し'])
    expect(items[0]!.link).toBe('https://news.example/a?id=1')
    expect(items[1]!.link).toBeUndefined()
    const future = toItems(
      parseFeed(rss2.replace('Tue, 17 Nov 2026 11:15:00 +0900', 'Tue, 17 Nov 2026 23:00:00 +0900')),
      FEED,
      NOW,
      new Map(),
    )
    expect(future[0]!.at).toBe(NOW)
  })
  it('要約を許していないフィードは要約を持たない', () => {
    const items = toItems(parseFeed(rss2), { ...FEED, summary: false }, NOW, new Map())
    expect(items.every((x) => x.summary === undefined)).toBe(true)
  })
  it('日付の無いフィードは初めて見た時刻と ≈。2 回目も最初の時刻のまま', () => {
    const undated = { ...FEED, undated: true }
    const first = toItems(parseFeed(rdf), undated, NOW, new Map())
    expect(first[0]).toMatchObject({ at: NOW, approx: true })
    const again = toItems(parseFeed(rdf), undated, NOW + 600_000, new Map(first.map((x) => [x.key, x.at])))
    expect(again[0]!.at).toBe(NOW)
  })
  it('keepDays より古い見出しは捨て、1 フィード 30 件まで', () => {
    const old = rss2.replace('Tue, 17 Nov 2026 10:00:00 JST', 'Tue, 01 Sep 2026 10:00:00 JST')
    expect(toItems(parseFeed(old), { ...FEED, keepDays: 7 }, NOW, new Map())).toHaveLength(1)
    const many = `<rss><channel>${Array.from({ length: 40 }, (_, i) => `<item><title>架空 ${i}</title><link>https://news.example/${i}</link><pubDate>Tue, 17 Nov 2026 ${String(i % 12).padStart(2, '0')}:00:00 +0900</pubDate></item>`).join('')}</channel></rss>`
    expect(toItems(parseFeed(many), FEED, NOW, new Map())).toHaveLength(30)
  })
  it('同じリンクの見出しは 1 件にする', () => {
    const dup = rss2.replace('https://evil.example/x', 'https://news.example/a?id=1')
    expect(toItems(parseFeed(dup), FEED, NOW, new Map())).toHaveLength(1)
  })
})
