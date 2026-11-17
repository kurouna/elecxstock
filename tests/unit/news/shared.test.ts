// ニュースの純粋な関数（L1）: 間隔の読み取り・フィードのオン・設定の変更・リンク・コピー。見出しはすべて架空
import { COPY_LIST_MAX, copyList, copyOne, fullTime, shortTime } from '@shared/news/copy'
import { isNewsLink, normalizeLink } from '@shared/news/links'
import type { NewsFeed, NewsItem } from '@shared/news/schema'
import { DEFAULT_NEWS_SETTINGS } from '@shared/news/schema'
import { applyNewsPatch, feedOn, intervalFromInput, listedFor, newDefaults, readNewsSettings } from '@shared/news/settings'
import { describe, expect, it } from 'vitest'

const feed = (o: Partial<NewsFeed> & { id: string }): NewsFeed => ({
  lang: o.id.startsWith('en') ? 'en' : 'ja',
  name: { ja: `名前 ${o.id}`, en: `Name ${o.id}` },
  short: 'XX',
  url: 'https://feed.example/rss',
  group: 'market',
  linkHosts: ['news.example'],
  defaultOnFor: [],
  summary: true,
  staleDays: 7,
  terms: null,
  ...o,
})
const BBG = feed({
  id: 'en.bbg',
  short: 'BBG',
  name: { ja: 'Bloomberg Markets', en: 'Bloomberg Markets' },
  summary: false,
  copyright: '© Bloomberg L.P.',
  defaultOnFor: ['ja', 'en'],
  listFor: ['ja', 'en'],
})
const BOJ = feed({
  id: 'ja.boj',
  short: '日銀',
  name: { ja: '日本銀行 新着情報', en: 'Bank of Japan' },
  defaultOnFor: ['ja'],
  group: 'official',
})
const NHK = feed({ id: 'ja.nhk', short: 'NHK' })
const FEEDS = [BBG, BOJ, NHK]
// 2026-11-17 11:15 JST
const AT = Date.UTC(2026, 10, 17, 2, 15)

describe('FR-NW4 間隔の読み取り', () => {
  it('空欄と 0 は起動時に 1 回（0）', () => {
    expect(intervalFromInput('')).toEqual({ value: 0, clamped: false })
    expect(intervalFromInput(' 0 ')).toEqual({ value: 0, clamped: false })
  })
  it('1〜4 は下限の 5 に丸め、1440 を超えたら 1440', () => {
    expect(intervalFromInput('3')).toEqual({ value: 5, clamped: true })
    expect(intervalFromInput('5')).toEqual({ value: 5, clamped: false })
    expect(intervalFromInput('10')).toEqual({ value: 10, clamped: false })
    expect(intervalFromInput('9999')).toEqual({ value: 1440, clamped: true })
  })
  it('全角の数字も読み、数でないものは null', () => {
    expect(intervalFromInput('１５')).toEqual({ value: 15, clamped: false })
    expect(intervalFromInput('10分')).toBeNull()
    expect(intervalFromInput('-5')).toBeNull()
    expect(intervalFromInput('2.5')).toBeNull()
  })
})

describe('FR-NW3 フィードのオンと答え', () => {
  it('答えるまではどのフィードも既定でオンにならない', () => {
    for (const f of FEEDS) expect(feedOn(f, DEFAULT_NEWS_SETTINGS, 'ja')).toBe(false)
  })
  it('取ると答えたら、その時の既定オン（どちらかの言語）を覚え、表示言語の分だけオン', () => {
    const s = applyNewsPatch(DEFAULT_NEWS_SETTINGS, { enabled: true }, FEEDS)
    expect(s.acceptedDefaults.sort()).toEqual(['en.bbg', 'ja.boj'])
    expect(feedOn(BBG, s, 'ja')).toBe(true)
    expect(feedOn(BOJ, s, 'ja')).toBe(true)
    expect(feedOn(BOJ, s, 'en')).toBe(false)
    expect(feedOn(NHK, s, 'ja')).toBe(false)
  })
  it('利用者の選択が既定より先。null で既定に戻す。登録表に無い ID は無視する', () => {
    let s = applyNewsPatch(DEFAULT_NEWS_SETTINGS, { enabled: true, feeds: { 'ja.nhk': true, 'en.bbg': false, 'xx.none': true } }, FEEDS)
    expect(feedOn(NHK, s, 'ja')).toBe(true)
    expect(feedOn(BBG, s, 'ja')).toBe(false)
    expect(s.feeds).toEqual({ 'ja.nhk': true, 'en.bbg': false })
    s = applyNewsPatch(s, { feeds: { 'en.bbg': null } }, FEEDS)
    expect(feedOn(BBG, s, 'ja')).toBe(true)
  })
  it('後の版で既定オンが増えても黙ってオンにせず、案内の対象にする', () => {
    const s = applyNewsPatch(DEFAULT_NEWS_SETTINGS, { enabled: true }, FEEDS)
    const NEW = feed({ id: 'ja.new', defaultOnFor: ['ja'] })
    expect(feedOn(NEW, s, 'ja')).toBe(false)
    expect(newDefaults([...FEEDS, NEW], s, 'ja')).toEqual(['ja.new'])
    expect(newDefaults([...FEEDS, NEW], applyNewsPatch(s, { feeds: { 'ja.new': false } }, [...FEEDS, NEW]), 'ja')).toEqual([])
    expect(newDefaults([...FEEDS, NEW], DEFAULT_NEWS_SETTINGS, 'ja')).toEqual([])
  })
  it('切ってから取り直しても、最初に覚えた既定オンは変えない', () => {
    const a = applyNewsPatch(DEFAULT_NEWS_SETTINGS, { enabled: true }, [BOJ])
    const b = applyNewsPatch(applyNewsPatch(a, { enabled: false }, FEEDS), { enabled: true }, FEEDS)
    expect(b.acceptedDefaults).toEqual(['ja.boj'])
  })
  it('間隔の変更は下限と上限に丸め、0 はそのまま', () => {
    expect(applyNewsPatch(DEFAULT_NEWS_SETTINGS, { interval: 2 }, FEEDS).interval).toBe(5)
    expect(applyNewsPatch(DEFAULT_NEWS_SETTINGS, { interval: 0 }, FEEDS).interval).toBe(0)
  })
  it('設定の一覧: Bloomberg は日本語の一覧にも出る', () => {
    expect(listedFor(BBG, 'ja')).toBe(true)
    expect(listedFor(BOJ, 'en')).toBe(false)
    expect(listedFor(NHK, 'ja')).toBe(true)
  })
  it('保存したファイルは既定値と浅くマージし、合わない項目は既定値', () => {
    expect(readNewsSettings(null)).toEqual(DEFAULT_NEWS_SETTINGS)
    expect(readNewsSettings({ enabled: true, interval: 'x', feeds: { 'ja.nhk': true } })).toEqual({
      ...DEFAULT_NEWS_SETTINGS,
      enabled: true,
      feeds: { 'ja.nhk': true },
    })
  })
})

describe('FR-NW6 記事のリンク', () => {
  it('http は https に上げ、utm_* とフラグメントを外す', () => {
    expect(normalizeLink('http://news.example/a?id=1&utm_source=rss#x', ['news.example'])).toBe('https://news.example/a?id=1')
  })
  it('linkHosts に完全一致しないホスト・資格情報・ポート・http(s) 以外は捨てる', () => {
    const h = ['news.example']
    expect(normalizeLink('https://evil.example/a', h)).toBeUndefined()
    expect(normalizeLink('https://sub.news.example/a', h)).toBeUndefined()
    expect(normalizeLink('https://news.example.evil/a', h)).toBeUndefined()
    expect(normalizeLink('https://u:p@news.example/a', h)).toBeUndefined()
    expect(normalizeLink('https://news.example:8443/a', h)).toBeUndefined()
    expect(normalizeLink('javascript:alert(1)', h)).toBeUndefined()
    // 2048 字を超えるリンクは持たない（既読のキー・main の確認の上限に収める）
    expect(normalizeLink(`https://news.example/${'a'.repeat(2100)}`, h)).toBeUndefined()
    expect(normalizeLink('not a url', h)).toBeUndefined()
    expect(normalizeLink(undefined, h)).toBeUndefined()
  })
  it('main が開いてよいのは https で、ホストが全フィードの linkHosts にあるものだけ', () => {
    const hosts = new Set(['news.example'])
    expect(isNewsLink('https://news.example/a', hosts)).toBe(true)
    expect(isNewsLink('http://news.example/a', hosts)).toBe(false)
    expect(isNewsLink('https://news.example.evil/a', hosts)).toBe(false)
    expect(isNewsLink('file:///c:/x', hosts)).toBe(false)
    expect(isNewsLink(42, hosts)).toBe(false)
    expect(isNewsLink(`https://news.example/${'a'.repeat(3000)}`, hosts)).toBe(false)
  })
})

const item = (o: Partial<NewsItem> = {}): NewsItem => ({
  key: 'k',
  feed: 'en.bbg',
  at: AT,
  title: 'Fictional stocks drift as traders weigh outlook',
  summary: 'A fictional summary.',
  link: 'https://news.example/a',
  ...o,
})
const feedOf = (id: string) => FEEDS.find((f) => f.id === id)

describe('FR-NW7 コピーの文字', () => {
  it('時刻は日本時間（PC の時刻帯に依らない）。日付だけ・日付の無いフィードの書き方', () => {
    expect(fullTime({ at: AT })).toBe('2026-11-17 11:15 JST')
    expect(shortTime({ at: AT })).toBe('11/17 11:15')
    expect(fullTime({ at: AT, dateOnly: true })).toBe('2026-11-17')
    expect(shortTime({ at: AT, dateOnly: true })).toBe('11/17')
    expect(fullTime({ at: AT, approx: true })).toBe('≈2026-11-17 11:15 JST')
    expect(shortTime({ at: AT, approx: true })).toBe('≈11/17 11:15')
    // 日をまたぐ: 2026-11-17 23:30 UTC は 11/18 08:30 JST
    expect(shortTime({ at: Date.UTC(2026, 10, 17, 23, 30) })).toBe('11/18 08:30')
  })
  it('1 件: 要約を出さないフィードは要約を入れず、権利の表記を添える', () => {
    expect(copyOne(item(), BBG, 'ja')).toBe(
      [
        'Fictional stocks drift as traders weigh outlook',
        'Bloomberg Markets · 2026-11-17 11:15 JST',
        'https://news.example/a',
        '© Bloomberg L.P.',
      ].join('\n'),
    )
  })
  it('1 件: 要約を出してよいフィードは要約を入れる。リンクが無ければ URL の行を出さない', () => {
    const t = copyOne(item({ feed: 'ja.boj', title: '架空の公表', summary: '架空の要約', link: undefined }), BOJ, 'ja')
    expect(t).toBe(['架空の公表', '架空の要約', '日本銀行 新着情報 · 2026-11-17 11:15 JST'].join('\n'))
  })
  it('1 件: 見出しの改行・制御文字は 1 つの空白にする', () => {
    expect(copyOne(item({ title: 'A\u0007\nB\u2028C', link: undefined }), NHK, 'en').split('\n')[0]).toBe('A B C')
  })
  it('まとめて: 1 行 1 件で、出所の一覧と権利の表記を最後に添える', () => {
    const r = copyList([item(), item({ key: 'b', feed: 'ja.boj', title: '架空の公表', at: AT - 3600_000 })], feedOf, 'ja')
    expect(r.text).toBe(
      [
        '11/17 11:15  BBG  Fictional stocks drift as traders weigh outlook',
        '11/17 10:15  日銀  架空の公表',
        '',
        'BBG = Bloomberg Markets / 日銀 = 日本銀行 新着情報',
        '© Bloomberg L.P.',
      ].join('\n'),
    )
    expect(r).toMatchObject({ count: 2, capped: false })
    expect(r.text).not.toContain('https://')
  })
  it('まとめて: 上から 100 件まで。切ったことを返す', () => {
    const many = Array.from({ length: 130 }, (_, i) => item({ key: String(i), feed: 'ja.nhk', title: `架空の見出し ${i}` }))
    const r = copyList(many, feedOf, 'ja')
    expect(r.count).toBe(COPY_LIST_MAX)
    expect(r.capped).toBe(true)
    expect(r.text.split('\n').filter((l) => l.includes('架空の見出し')).length).toBe(100)
    expect(r.text).not.toContain('架空の見出し 100')
  })
  it('まとめて: 同じ印のフィードは出所の一覧で 1 つにまとめる', () => {
    const JPX1 = feed({ id: 'ja.j1', short: 'JPX', name: { ja: '架空の取引所 A', en: 'A' } })
    const JPX2 = feed({ id: 'ja.j2', short: 'JPX', name: { ja: '架空の取引所 B', en: 'B' } })
    const of = (id: string) => [JPX1, JPX2].find((f) => f.id === id)
    const r = copyList([item({ feed: 'ja.j1' }), item({ key: 'b', feed: 'ja.j2' })], of, 'ja')
    expect(r.text.split('\n').at(-1)).toBe('JPX = 架空の取引所 A・架空の取引所 B')
  })
  it('まとめて: 0 件は空', () => {
    expect(copyList([], feedOf, 'ja')).toEqual({ text: '', count: 0, capped: false })
  })
})
