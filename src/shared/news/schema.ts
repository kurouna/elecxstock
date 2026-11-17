// ニュースの登録表と設定の形（docs/design-news.md §2・§3）。Core（読み込み・検証）と renderer（表示）が共有する。
import { z } from 'zod'

export type NewsLang = 'ja' | 'en'
export type NewsGroup = 'market' | 'reading' | 'official'
export const NEWS_GROUPS: readonly NewsGroup[] = ['market', 'reading', 'official']

/** 出所の印の幅（全角 2・半角 1）。6 まで・5 字まで（全角 3 字・半角 5 字） */
export function shortWidth(s: string): number {
  let w = 0
  for (const ch of s) w += (ch.codePointAt(0) ?? 0) <= 0xff ? 1 : 2
  return w
}
const host = z.string().regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/)
const lang = z.enum(['ja', 'en'])

export const feedSchema = z.object({
  id: z.string().regex(/^(ja|en)\.[a-z0-9]{1,16}$/),
  lang,
  name: z.object({ ja: z.string().min(1).max(60), en: z.string().min(1).max(60) }),
  short: z
    .string()
    .min(1)
    .refine((s) => [...s].length <= 5 && shortWidth(s) <= 6, 'short is too wide'),
  url: z.url({ protocol: /^https$/ }),
  group: z.enum(['market', 'reading', 'official']),
  linkHosts: z.array(host).min(1).max(8),
  defaultOnFor: z.array(lang).max(2),
  listFor: z.array(lang).min(1).max(2).optional(),
  summary: z.boolean(),
  copyright: z.string().max(60).optional(),
  keepDays: z.number().int().min(1).max(90).optional(),
  paywall: z.boolean().optional(),
  undated: z.boolean().optional(),
  /** 時刻帯の無い日付の時刻帯（既定は日本語のフィードが +09:00、英語のフィードが UTC） */
  zone: z
    .string()
    .regex(/^[+-]\d{2}:\d{2}$/)
    .optional(),
  staleDays: z.number().int().min(1).max(365),
  terms: z.object({ url: z.url({ protocol: /^https$/ }), checked: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).nullable(),
})
export type NewsFeed = z.infer<typeof feedSchema>
export const NEWS_SCHEMA_VERSION = 1

export const DEFAULT_KEEP_DAYS = 30
/** 1 フィードから持つ・出す見出しの数 */
export const PER_FEED = 30

/** ニュースの設定（data/news/settings.json。アプリの Settings とは別。§3.1） */
export interface NewsSettings {
  /** null は未回答（取らない） */
  enabled: boolean | null
  /** 分。0 は起動してペインが初めて見えたときに 1 回 */
  interval: number
  /** 利用者が変えたフィードだけ */
  feeds: Record<string, boolean>
  /** 答えたときに既定でオンだったフィード（後の版で既定オンが増えても黙ってオンにしない） */
  acceptedDefaults: string[]
}
export const DEFAULT_NEWS_SETTINGS: NewsSettings = { enabled: null, interval: 10, feeds: {}, acceptedDefaults: [] }
export const INTERVAL_MIN = 5
export const INTERVAL_MAX = 1440

export const newsSettingsSchema = z.object({
  enabled: z.boolean().nullable(),
  interval: z.number().int().min(0).max(INTERVAL_MAX),
  feeds: z.record(z.string().max(40), z.boolean()),
  acceptedDefaults: z.array(z.string().max(40)).max(200),
})

/** ペインの状態（§5） */
export type NewsState = 'unanswered' | 'off' | 'policy-off' | 'unavailable' | 'on'

/** 見出し 1 件（§5） */
export interface NewsItem {
  /** 既読・選択のキー（フィードの ID と、正規化したリンクか見出し） */
  key: string
  feed: string
  /** ms。掲載の時刻（日付の無いフィードは初めて見た時刻） */
  at: number
  /** 初めて取った時刻（「ここまで見た」の線と比べる） */
  seen?: number
  /** 日付の無いフィード（初めて見た時刻。「≈」を付ける） */
  approx?: boolean
  /** 日付だけで時刻の無い見出し */
  dateOnly?: boolean
  title: string
  summary?: string
  link?: string
}

/** フィードごとの状態（設定の行・⚠ の数） */
export interface NewsFeedStatus {
  id: string
  on: boolean
  /** 最後に取れた時刻 */
  okAt?: number
  /** 最後の失敗の理由（http-404・timeout・parse など） */
  error?: string
  /** 次に試す時刻（失敗・429・503 のとき） */
  retryAt?: number
  count: number
  /** 配信元が示す間隔（分。参考） */
  ttl?: number
}

export interface NewsRound {
  last?: number
  next?: number
  running: boolean
  done: number
  total: number
  offline: boolean
}
