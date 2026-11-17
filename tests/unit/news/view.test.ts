// ニュースのペインの表示の組み立て（L1）: 時刻・日付の見出し・タブ・絞り込み・「ここまで見た」の線。見出しはすべて架空
import type { NewsFeed, NewsItem } from '@shared/news/schema'
import { describe, expect, it } from 'vitest'
import {
  arrivals,
  buttonKey,
  dayLabel,
  errText,
  hm,
  hostOf,
  pageStep,
  previewSummary,
  rowsOf,
  rowTime,
  statusText,
  type Tr,
  tabCounts,
  tagsOf,
  visibleItems,
} from '../../../src/renderer/news/view'

const F = (id: string, group: NewsFeed['group'], short: string): NewsFeed => ({
  id,
  lang: 'ja',
  name: { ja: `架空の${short}`, en: `Fictional ${short}` },
  short,
  url: 'https://feed.example/',
  group,
  linkHosts: ['news.example'],
  defaultOnFor: [],
  summary: true,
  staleDays: 7,
  terms: null,
})
const FEEDS = [F('ja.a', 'market', 'AAA'), F('ja.b', 'official', '日銀')]
const feedOf = (id: string) => FEEDS.find((f) => f.id === id)
const T = Date.UTC(2026, 10, 17, 2, 15) // 11/17 11:15 JST
const mk = (key: string, feed: string, at: number, title: string, o: Partial<NewsItem> = {}): NewsItem => ({ key, feed, at, title, ...o })
const ITEMS = [
  mk('1', 'ja.a', T, '架空の市況　ＲＥＩＴ'),
  mk('2', 'ja.b', T - 3600_000, '架空の公表', { summary: '金融政策の架空の要約' }),
  mk('3', 'ja.a', T - 15 * 3600_000, '前の日の架空の見出し'),
]
const W = { today: '今日', yesterday: '昨日' }

describe('FR-NW1 行の時刻と日付の見出し（日本時間）', () => {
  it('HH:MM。日付だけは月日、日付の無いフィードは ≈', () => {
    expect(hm(T)).toBe('11:15')
    expect(rowTime(mk('x', 'ja.a', T, 'x'))).toBe('11:15')
    expect(rowTime(mk('x', 'ja.a', T, 'x', { dateOnly: true }))).toBe('11/17')
    expect(rowTime(mk('x', 'ja.a', T, 'x', { approx: true }))).toBe('≈11:15')
  })
  it('今日・昨日・それより前（曜日つき）', () => {
    expect(dayLabel('2026-11-17', '2026-11-17', 'ja', W)).toBe('今日 · 11/17（火）')
    expect(dayLabel('2026-11-16', '2026-11-17', 'ja', W)).toBe('昨日 · 11/16（月）')
    expect(dayLabel('2026-11-15', '2026-11-17', 'en', { today: 'Today', yesterday: 'Yesterday' })).toBe('Sun 11/15')
    expect(dayLabel('2026-12-31', '2027-01-01', 'ja', W)).toBe('昨日 · 12/31（木）')
  })
})

describe('FR-NW1 タブと絞り込み', () => {
  it('分類のタブで絞り、件数を数える', () => {
    expect(visibleItems(ITEMS, feedOf, 'official', '', 'ja').map((x) => x.key)).toEqual(['2'])
    expect(tabCounts(ITEMS, feedOf)).toEqual({ all: 3, market: 2, reading: 0, official: 1 })
  })
  it('絞り込みは見出し・要約・出所を見て、全角半角・大文字小文字を区別しない。語はすべて含むもの', () => {
    expect(visibleItems(ITEMS, feedOf, 'all', 'reit', 'ja').map((x) => x.key)).toEqual(['1'])
    expect(visibleItems(ITEMS, feedOf, 'all', '金融政策', 'ja').map((x) => x.key)).toEqual(['2'])
    expect(visibleItems(ITEMS, feedOf, 'all', '日銀', 'ja').map((x) => x.key)).toEqual(['2'])
    expect(visibleItems(ITEMS, feedOf, 'all', '架空 前の日', 'ja').map((x) => x.key)).toEqual(['3'])
    expect(visibleItems(ITEMS, feedOf, 'market', '公表', 'ja')).toEqual([])
  })
})

describe('FR-NW1・FR-NW8 日付の見出しと「ここまで見た」の線', () => {
  it('線は、線より新しい見出しと古い見出しの両方があるときだけ、その境に出す', () => {
    const rows = rowsOf(ITEMS, T - 1800_000)
    expect(rows.map((r) => (r.kind === 'item' ? r.item.key : r.kind === 'day' ? `day:${r.day}` : 'seen'))).toEqual([
      'day:2026-11-17',
      '1',
      'seen',
      '2',
      'day:2026-11-16',
      '3',
    ])
  })
  it('初回（すべて線より下）と、すべて新しいときは線を出さない', () => {
    expect(rowsOf(ITEMS, T).some((r) => r.kind === 'seen')).toBe(false)
    expect(rowsOf(ITEMS, 0).some((r) => r.kind === 'seen')).toBe(false)
  })
  it('最後に一番上を見たときに無かった見出しの数（新しい見出しの帯）', () => {
    expect(arrivals(ITEMS, new Set(['3']))).toBe(2)
    expect(arrivals(ITEMS, new Set(['1', '2', '3']))).toBe(0)
  })
  it('線は取った時刻（seen）で比べる。掲載の時刻が古く線より下に並ぶ新しい見出しには late の印', () => {
    const seenAt = T - 1800_000
    const items = [
      mk('1', 'ja.a', T, '新しい', { seen: T }),
      mk('2', 'ja.b', T - 3600_000, '前から', { seen: T - 3600_000 }),
      mk('3', 'ja.a', T - 7200_000, '遅れて届いた', { seen: T }),
    ]
    const rows = rowsOf(items, seenAt)
    expect(rows.map((r) => (r.kind === 'item' ? `${r.item.key}${r.late ? '*' : ''}` : r.kind))).toEqual(['day', '1', 'seen', '2', '3*'])
  })
})

describe('FR-NW1 状態の文字・印・失敗の理由', () => {
  const t: Tr = (k, a) => (a ? `${k}${JSON.stringify(a)}` : k)
  it('見出しの右: 確認中 → オフライン → 確認・次 → 起動時に確認', () => {
    expect(statusText({ running: true, done: 1, total: 3, offline: false }, 10, t)).toBe('news.checking{"done":1,"total":3}')
    expect(statusText({ last: T, running: false, done: 0, total: 0, offline: true }, 10, t)).toBe('news.offline{"t":"11:15"}')
    expect(statusText({ last: T, next: T + 600_000, running: false, done: 0, total: 0, offline: false }, 10, t)).toBe(
      'news.checked{"t":"11:15"} · news.next{"t":"11:25"}',
    )
    expect(statusText({ last: T, running: false, done: 0, total: 0, offline: false }, 0, t)).toBe(
      'news.checked{"t":"11:15"} · news.startup',
    )
    expect(statusText(undefined, 10, t)).toBe('')
  })
  it('行の印: 線より下の新着・表示言語と違う言語・有料・リンクなし', () => {
    const en: NewsFeed = { ...F('en.x', 'market', 'X'), lang: 'en', paywall: true }
    expect(tagsOf(mk('x', 'en.x', T, 'x'), en, 'ja', true, t)).toEqual(['news.tag.late', 'news.tag.en', 'news.tag.pay', 'news.tag.nolink'])
    expect(tagsOf(mk('x', 'ja.a', T, 'x', { link: 'https://news.example/a' }), FEEDS[0], 'ja', false, t)).toEqual([])
  })
  it('ホスト・失敗の理由・ページ送りの行数', () => {
    expect(hostOf('https://news.example/a?b')).toBe('news.example')
    expect(hostOf(undefined)).toBe('')
    expect(errText('http-503', t)).toBe('HTTP 503')
    expect(errText('timeout', t)).toBe('news.err.timeout')
    expect(errText(undefined, t)).toBe('')
    expect(pageStep(240)).toBe(9)
    expect(pageStep(10)).toBe(1)
  })
})

describe('FR-NW1 本文の中のボタンのキー', () => {
  // DOM の代わり: ボタンかどうかと、本文の中かどうかだけを持つ
  const el = (button: boolean) => ({ closest: (s: string) => (s === 'button' && button ? {} : null) })
  const btn = el(true)
  const row = el(false)
  const root = { contains: (t: unknown) => t === btn || t === row } as unknown as Element
  const ev = (code: string, target: unknown, mods: Partial<KeyboardEvent> = {}) =>
    ({ code, target, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods }) as KeyboardEvent
  it('本文の中のボタンで押した Enter・Space はボタンに任せる', () => {
    expect(buttonKey(ev('Enter', btn), root)).toBe(true)
    expect(buttonKey(ev('Space', btn), root)).toBe(true)
    expect(buttonKey(ev('NumpadEnter', btn), root)).toBe(true)
  })
  it('行の上・修飾キー付き・ほかのキー・本文の外（見出しのボタン）はペインのキー', () => {
    expect(buttonKey(ev('Enter', row), root)).toBe(false)
    expect(buttonKey(ev('Enter', btn, { ctrlKey: true }), root)).toBe(false)
    expect(buttonKey(ev('KeyN', btn), root)).toBe(false)
    expect(buttonKey(ev('Enter', el(true)), root)).toBe(false)
    expect(buttonKey(ev('Enter', btn), undefined)).toBe(false)
  })
})

describe('FR-NW9 プレビューの要約の段', () => {
  const t: Tr = (k) => k
  const f = FEEDS[1]!
  it('要約を許しているフィードは要約を出し、空なら「要約はありません」', () => {
    expect(previewSummary(mk('x', f.id, T, 'x', { summary: '架空の要約' }), f, t)).toBe('架空の要約')
    expect(previewSummary(mk('x', f.id, T, 'x'), f, t)).toBe('news.summaryNone')
    expect(previewSummary(mk('x', f.id, T, 'x', { summary: '' }), f, t)).toBe('news.summaryNone')
  })
  it('要約を許していないフィードは「要約は出しません（配信元の条件）」', () => {
    expect(previewSummary(mk('x', f.id, T, 'x', { summary: '架空の要約' }), { ...f, summary: false }, t)).toBe('news.noSummary')
  })
})
