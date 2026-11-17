// 読んだ項目を見出しに整える（docs/design-news.md §4.4）。リンクの絞り込み・日付・要約の扱い・件数。
import { normalizeLink } from '@shared/news/links'
import { DEFAULT_KEEP_DAYS, type NewsFeed, type NewsItem, PER_FEED } from '@shared/news/schema'
import { type ParsedFeed, parseDate } from './parse'

const DAY = 86_400_000

/** 時刻帯の無い日付の時刻帯（日本語のフィードは日本時間、英語のフィードは UTC） */
export const zoneOf = (f: NewsFeed) => f.zone ?? (f.lang === 'ja' ? '+09:00' : '+00:00')

/**
 * 項目を見出しにする: リンクは linkHosts だけ・未来は今に丸める・日付の無いものは初めて見た時刻（firstSeen。どの見出しも seen に持つ）と「≈」・
 * 要約を許していないフィードは要約を読み捨てる・keepDays より古いものを捨てる・同じリンクは 1 件・新しい順に 30 件まで
 */
export function toItems(p: ParsedFeed, f: NewsFeed, now: number, firstSeen: ReadonlyMap<string, number>): NewsItem[] {
  const out: NewsItem[] = []
  const keys = new Set<string>()
  const oldest = now - (f.keepDays ?? DEFAULT_KEEP_DAYS) * DAY
  for (const r of p.items) {
    const link = normalizeLink(r.link, f.linkHosts)
    const key = `${f.id}|${link ?? r.title}`
    if (keys.has(key)) continue
    keys.add(key)
    const d = f.undated || !r.date ? null : parseDate(r.date, zoneOf(f))
    // 初めて取った時刻（「ここまで見た」の線と比べる。遅れて配信された・日付だけの見出しも、届いたときに新しい）
    const seen = firstSeen.get(key) ?? now
    const it: NewsItem = { key, feed: f.id, at: 0, seen, title: r.title }
    if (d) {
      it.at = Math.min(d.at, now)
      if (d.dateOnly) it.dateOnly = true
    } else {
      it.at = seen
      it.approx = true
    }
    if (it.at < oldest) continue
    if (f.summary && r.summary) it.summary = r.summary
    if (link) it.link = link
    out.push(it)
  }
  return out.sort((a, b) => b.at - a.at).slice(0, PER_FEED)
}
