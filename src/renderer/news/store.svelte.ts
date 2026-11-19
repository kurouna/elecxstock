// ニュースの画面の状態（docs/design-news.md §5・§7）。ペインと設定が共有する。Core の news.* を呼び、知らせで読み直す。
import type { NewsList, NewsSettingsView } from '@shared/news/api'
import type { NewsFeed } from '@shared/news/schema'
import { app, bridge } from '../stores/app.svelte'

export const news = $state<{ list: NewsList | null; view: NewsSettingsView | null }>({ list: null, view: null })

let registry = new Map<string, NewsFeed>()
export const feedOf = (id: string): NewsFeed | undefined => registry.get(id)

let seq = 0
/** 一覧と登録表を読み直す（続けて届いた知らせでは、最後の応答だけを使う） */
export async function loadNews(): Promise<void> {
  // 表示言語は先に伝える（ペインを開いていないときに言語を変えても、設定の「ニュース」が新しい言語のオンのフィード・通信先を読む）。
  // 同じ値なら送らない。同じポートで送るので、Core は読む前に言語を受け取る
  sendWatch()
  const n = ++seq
  const [list, view] = await Promise.all([bridge.call('news.list', {}), bridge.call('news.settings.get', {})])
  if (n !== seq) return
  registry = new Map(view.registry.map((f) => [f.id, f]))
  news.view = view
  news.list = list
}

let subscribed = false
/** Core の知らせを 1 回だけ購読する（ペイン・設定・初回起動のどれが先に開いても） */
export function initNews(): void {
  if (subscribed) return
  subscribed = true
  // 巡回の途中の進み具合（1 本ごと）は状態の文字だけを直す。一覧は巡回が終わったときに読み直す
  bridge.on('news.updated', (d) => {
    if (d.round.running && news.list) news.list = { ...news.list, round: d.round }
    else void loadNews()
  })
  bridge.on('news.changed', () => void loadNews())
  bridge.on('core.ready', () => {
    sent = null
    sendWatch()
    void loadNews()
  })
  document.addEventListener('visibilitychange', sendWatch)
  void loadNews()
}

/** 見えているニュースのペイン（窓が隠れている・最小化しているときは数えない） */
const visible = new Set<string>()
let sent: string | null = null
function sendWatch(): void {
  const on = visible.size > 0 && document.visibilityState === 'visible'
  const lang = app.settings.lang === 'en' ? 'en' : 'ja'
  const k = `${on}:${lang}`
  if (k === sent) return
  sent = k
  void bridge.call('news.watch', { on, lang }).catch(() => (sent = null))
}
/** ペインが見えた・隠れた（IntersectionObserver）。表示言語が変わったときも呼ぶ */
export function setPaneVisible(id: string, on: boolean): void {
  if (on) visible.add(id)
  else visible.delete(id)
  sendWatch()
}
export function langChanged(): void {
  sendWatch()
}

export async function setNews(p: { enabled?: boolean; interval?: number; feeds?: Record<string, boolean | null> }): Promise<void> {
  news.view = await bridge.call('news.settings.set', p)
  void loadNews()
}
