// ニュースのペインの表示の組み立て（docs/design-news.md §7）。コンポーネントに計算を書かないため、純粋な関数にしてテストする。
import type { NewsFeed, NewsFeedStatus, NewsGroup, NewsItem, NewsLang, NewsRound } from '@shared/news/schema'

/** 文言の関数（stores/app.svelte.ts の t。テストでは置き換える） */
export type Tr = (key: string, args?: Record<string, string | number>) => string

export type NewsTab = 'all' | NewsGroup
export const NEWS_TABS: readonly NewsTab[] = ['all', 'market', 'reading', 'official']

const JST = 9 * 3600_000
const pad = (n: number) => String(n).padStart(2, '0')
/** 日本時間の YYYY-MM-DD */
export const jstDay = (at: number) => new Date(at + JST).toISOString().slice(0, 10)
/** 日本時間の HH:MM */
export function hm(at: number): string {
  const d = new Date(at + JST)
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}
/** 行の時刻（日付だけの見出しは月日。日付の無いフィードは ≈） */
export function rowTime(it: NewsItem): string {
  const d = new Date(it.at + JST)
  const t = it.dateOnly ? `${d.getUTCMonth() + 1}/${d.getUTCDate()}` : hm(it.at)
  return it.approx ? `≈${t}` : t
}
const WD = { ja: ['日', '月', '火', '水', '木', '金', '土'], en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] }
/** 日付の見出し: 今日 · 11/17（火）／昨日 · 11/16（月）／11/15（日） */
export function dayLabel(day: string, today: string, lang: NewsLang, words: { today: string; yesterday: string }): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  const wd = WD[lang][new Date(Date.UTC(y, m - 1, d)).getUTCDay()]!
  const md = lang === 'ja' ? `${m}/${d}（${wd}）` : `${wd} ${m}/${d}`
  const yest = jstDay(Date.parse(`${today}T12:00:00+09:00`) - 86_400_000)
  if (day === today) return `${words.today} · ${md}`
  if (day === yest) return `${words.yesterday} · ${md}`
  return md
}

/** タブと絞り込みで見えている見出し（絞り込みは見出し・要約・出所の名前と印。大文字小文字・全角半角を区別しない） */
export function visibleItems(
  items: readonly NewsItem[],
  feedOf: (id: string) => NewsFeed | undefined,
  tab: NewsTab,
  q: string,
  lang: NewsLang,
): NewsItem[] {
  const words = norm(q).split(/\s+/).filter(Boolean)
  return items.filter((it) => {
    const f = feedOf(it.feed)
    if (tab !== 'all' && f?.group !== tab) return false
    if (!words.length) return true
    const hay = norm([it.title, it.summary ?? '', f?.name[lang] ?? '', f?.short ?? ''].join(' '))
    return words.every((w) => hay.includes(w))
  })
}
const norm = (s: string) => s.normalize('NFKC').toLowerCase()

/** タブごとの件数（0 件のタブは出さない） */
export function tabCounts(items: readonly NewsItem[], feedOf: (id: string) => NewsFeed | undefined): Record<NewsTab, number> {
  const c: Record<NewsTab, number> = { all: items.length, market: 0, reading: 0, official: 0 }
  for (const it of items) {
    const g = feedOf(it.feed)?.group
    if (g) c[g]++
  }
  return c
}

export type NewsRow = { kind: 'day'; day: string } | { kind: 'seen' } | { kind: 'item'; item: NewsItem; index: number; late?: boolean }
/** 「ここまで見た」より後に初めて取った見出しか（掲載の時刻ではなく、取った時刻で比べる） */
export const isNew = (x: NewsItem, seenAt: number) => (x.seen ?? x.at) > seenAt
/**
 * 行の並び: 日付の見出しと「ここまで見た」の線を挟む。線は新しい見出しと前からある見出しの両方があるとき、
 * 前からある見出しの 1 件目の上に引く（初回に取った分はすべて線より下なので、線は出ない）。
 * 掲載の時刻が古くて線より下に並ぶ新しい見出し（遅れて配信された・日付だけ）は late にする（印を付ける）
 */
export function rowsOf(items: readonly NewsItem[], seenAt: number): NewsRow[] {
  const out: NewsRow[] = []
  let day = ''
  const hasNew = items.some((x) => isNew(x, seenAt))
  const hasOld = items.some((x) => !isNew(x, seenAt))
  const lining = hasNew && hasOld
  let lined = false
  items.forEach((item, index) => {
    const d = jstDay(item.at)
    const fresh = isNew(item, seenAt)
    if (lining && !lined && !fresh) {
      out.push({ kind: 'seen' })
      lined = true
    }
    if (d !== day) {
      out.push({ kind: 'day', day: d })
      day = d
    }
    out.push(lined && fresh ? { kind: 'item', item, index, late: true } : { kind: 'item', item, index })
  })
  return out
}

/** 見出しの右の状態の文字の材料: 失敗したオンのフィードの数 */
export const failedCount = (feeds: readonly NewsFeedStatus[]) => feeds.filter((f) => f.on && f.error).length

/** 新しく届いた見出しの数（帯「↑ 新しい見出し N 件」）: 最後に一番上を見たときに無かった見出し */
export function arrivals(items: readonly NewsItem[], known: ReadonlySet<string>): number {
  return items.filter((x) => !known.has(x.key)).length
}

/** 見出しの右の状態: 確認中 3/9・オフライン · HH:MM 時点・HH:MM 確認 · 次 HH:MM・起動時に確認 */
export function statusText(r: NewsRound | undefined, interval: number | undefined, t: Tr): string {
  if (!r) return ''
  if (r.running && r.total) return t('news.checking', { done: r.done, total: r.total })
  if (r.offline && r.last) return t('news.offline', { t: hm(r.last) })
  const parts: string[] = []
  if (r.last) parts.push(t('news.checked', { t: hm(r.last) }))
  if (r.next) parts.push(t('news.next', { t: hm(r.next) }))
  else if (r.last && interval === 0) parts.push(t('news.startup'))
  return parts.join(' · ')
}
/** 行の印（表示言語と違う言語・有料・リンクなし・線より下の新着） */
export function tagsOf(it: NewsItem, f: NewsFeed | undefined, lang: NewsLang, late: boolean, t: Tr): string[] {
  const out: string[] = []
  if (late) out.push(t('news.tag.late'))
  if (f && f.lang !== lang) out.push(t(`news.tag.${f.lang}`))
  if (f?.paywall) out.push(t('news.tag.pay'))
  if (!it.link) out.push(t('news.tag.nolink'))
  return out
}
/** 開く先のホスト（詳細の行・プレビュー） */
export const hostOf = (u?: string) => (u ? new URL(u).hostname : '')
/** フィードの失敗の理由（http-503 → HTTP 503） */
export const errText = (e: string | undefined, t: Tr) => (e ? (e.startsWith('http-') ? `HTTP ${e.slice(5)}` : t(`news.err.${e}`)) : '')
/** PgUp・PgDn で動かす行の数（見えている行の数 − 1） */
export const pageStep = (height: number | undefined, row = 24) => Math.max(1, Math.floor((height ?? 240) / row) - 1)
