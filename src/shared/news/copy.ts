// 見出しのコピー（docs/design-news.md §7.4）。利用者が別のアプリ（翻訳・メモなど）で使うための、プレーンテキストを組み立てる。
// 時刻は日本時間（FR-T1）。PC の時刻帯に依存させない。
import type { NewsFeed, NewsItem, NewsLang } from './schema'

/** まとめてコピーする件数の上限 */
export const COPY_LIST_MAX = 100

const JST = 9 * 3600_000
const pad = (n: number) => String(n).padStart(2, '0')
function parts(at: number) {
  const d = new Date(at + JST)
  return {
    y: d.getUTCFullYear(),
    mo: pad(d.getUTCMonth() + 1),
    d: pad(d.getUTCDate()),
    h: pad(d.getUTCHours()),
    mi: pad(d.getUTCMinutes()),
  }
}
/** 1 件の時刻: 2026-11-17 11:15 JST（日付だけ: 2026-11-17。日付の無いフィード: ≈2026-11-17 11:15 JST） */
export function fullTime(it: Pick<NewsItem, 'at' | 'approx' | 'dateOnly'>): string {
  const p = parts(it.at)
  const day = `${p.y}-${p.mo}-${p.d}`
  return `${it.approx ? '≈' : ''}${it.dateOnly ? day : `${day} ${p.h}:${p.mi} JST`}`
}
/** まとめての時刻: 11/17 11:15（日付だけ: 11/17。日付の無いフィード: ≈11/17 11:15） */
export function shortTime(it: Pick<NewsItem, 'at' | 'approx' | 'dateOnly'>): string {
  const p = parts(it.at)
  return `${it.approx ? '≈' : ''}${p.mo}/${p.d}${it.dateOnly ? '' : ` ${p.h}:${p.mi}`}`
}

/** 改行・タブ以外の制御文字を除き、1 行にする */
const oneLine = (s: string) =>
  s
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** 選んだ見出し 1 件（Ctrl+C）。要約は出してよいフィードだけ。権利の表記があれば添える */
export function copyOne(it: NewsItem, feed: NewsFeed | undefined, lang: NewsLang): string {
  const lines = [oneLine(it.title)]
  if (it.summary && feed?.summary) lines.push(oneLine(it.summary))
  lines.push(`${feed ? feed.name[lang] : it.feed} · ${fullTime(it)}`)
  if (it.link) lines.push(it.link)
  if (feed?.copyright) lines.push(feed.copyright)
  return lines.join('\n')
}

/** 表示中の見出し（Ctrl+Alt+C）。1 行 1 件で上から最大 100 件。最後に出所と権利の表記をまとめて添える。リンクは付けない */
export function copyList(
  items: readonly NewsItem[],
  feedOf: (id: string) => NewsFeed | undefined,
  lang: NewsLang,
): { text: string; count: number; capped: boolean } {
  const list = items.slice(0, COPY_LIST_MAX)
  const lines = list.map((it) => `${shortTime(it)}  ${feedOf(it.feed)?.short ?? it.feed}  ${oneLine(it.title)}`)
  const used = [...new Set(list.map((it) => it.feed))].map(feedOf).filter((f): f is NewsFeed => !!f)
  const foot: string[] = []
  // 同じ印のフィード（JPX の 2 本など）は 1 つにまとめる
  const byShort = new Map<string, string[]>()
  for (const f of used) byShort.set(f.short, [...(byShort.get(f.short) ?? []), f.name[lang]])
  if (used.length) foot.push([...byShort].map(([s, names]) => `${s} = ${names.join('・')}`).join(' / '))
  const rights = [...new Set(used.map((f) => f.copyright).filter((c): c is string => !!c))]
  if (rights.length) foot.push(rights.join(' / '))
  return { text: [...lines, ...(foot.length ? ['', ...foot] : [])].join('\n'), count: list.length, capped: items.length > COPY_LIST_MAX }
}
