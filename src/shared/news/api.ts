// ニュースの API（docs/design-news.md §5）。src/shared/api.ts は取り込むだけ。
import { z } from 'zod'
import type { NewsFeed, NewsFeedStatus, NewsItem, NewsRound, NewsSettings, NewsState } from './schema'

const lang = z.enum(['ja', 'en'])
export const NEWS_PARAMS = {
  'news.list': z.object({}),
  /** 窓ごと。ペインが見えているか（和で判断）と、その窓の表示言語 */
  'news.watch': z.object({ on: z.boolean(), lang }),
  'news.refresh': z.object({}),
  'news.markRead': z.object({ key: z.string().min(1).max(2200) }),
  'news.settings.get': z.object({}),
  'news.settings.set': z.object({
    enabled: z.boolean().optional(),
    interval: z.number().int().min(0).max(1440).optional(),
    feeds: z.record(z.string().max(40), z.boolean().nullable()).optional(),
  }),
  'news.clearCache': z.object({}),
  /** 案内（後の版で増えた既定オンのフィード・ニュースのペインの案内）を見た */
  'news.noticed': z.object({}),
  /** このアプリの通信先（設定の「このアプリの通信先」。企業の PC で通信の許可を申請するとき写す） */
  'app.endpoints': z.object({}),
} as const

export interface NewsList {
  state: NewsState
  items: NewsItem[]
  feeds: NewsFeedStatus[]
  round: NewsRound
  /** 「ここまで見た」の線の時刻（ms） */
  seenAt: number
  read: string[]
  /** 後の版で既定オンになったが、まだ答えていないフィード */
  notice: string[]
  /** まだ答えていない既存の利用者に、ニュースのペインを一度だけ案内するか（§7.1） */
  intro: boolean
}
export interface NewsSettingsView {
  state: NewsState
  settings: NewsSettings
  /** 登録表のフィード（使えないときは空） */
  registry: NewsFeed[]
  feeds: NewsFeedStatus[]
}

export interface NewsResults {
  'news.list': NewsList
  'news.watch': undefined
  'news.refresh': undefined
  'news.markRead': undefined
  'news.settings.get': NewsSettingsView
  'news.settings.set': NewsSettingsView
  'news.clearCache': undefined
  'news.noticed': undefined
  'app.endpoints': { app: string[]; news: string[] }
}

export interface NewsEvents {
  /** 見出しが届いた・巡回の状態が変わった */
  'news.updated': { round: NewsRound }
  /** 設定・既読・「ここまで見た」が変わった */
  'news.changed': { kind: 'settings' | 'read' | 'seen' | 'cache' }
}
