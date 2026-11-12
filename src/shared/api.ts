// renderer ⇄ core の API（§8.2）。名前・型・入力の zod スキーマを 1 か所で定義する（NFR-A3）。
// renderer は window.elecxstock.call(method, params) だけで Core に話しかける。
import { z } from 'zod'
import type {
  Adjustment,
  AppInfo,
  Bars,
  DataStatus,
  Dividend,
  FetchFailure,
  Instrument,
  InstrumentId,
  JobProgress,
  MetricsRow,
  Quote,
  RetentionPlan,
  SavedScreen,
  ScreenResult,
  Settings,
  Split,
  Timeframe,
  Watchlist,
} from './types'

const id = z.string().min(3).max(24)
const ids = z.array(id).max(5000)
const tf = z.enum(['D', 'W', 'M'])
const cond = z.object({
  field: z.string().max(64),
  op: z.enum(['>=', '<=', '=', 'in', 'notin']),
  value: z.union([z.number(), z.string(), z.boolean(), z.array(z.string())]),
  includeMissing: z.boolean().optional(),
})
const name = z.object({ ja: z.string().max(80), en: z.string().max(80) })
export const watchlistSchema = z.object({
  id: z.string().max(40),
  builtin: z.enum(['favorites', 'candidates']).optional(),
  name,
  items: z.array(id).max(5000),
})
export const screenSchema = z.object({
  id: z.string().max(40),
  name,
  conditions: z.array(cond).max(40),
  sort: z.object({ field: z.string(), dir: z.union([z.literal(1), z.literal(-1)]) }).optional(),
  created: z.number(),
  updated: z.number(),
})
export const settingsSchema = z.object({
  lang: z.enum(['ja', 'en']),
  candleStyle: z.enum(['jp', 'us']),
  density: z.enum(['normal', 'compact']),
  uiScale: z.number().min(0.8).max(1.5),
  retentionYears: z.number().int().min(1).max(10),
  disclaimerAccepted: z.boolean(),
  firstRunDone: z.boolean(),
  userInstruments: z.array(z.string().max(12)).max(500),
  reduceMotion: z.boolean(),
})

/** メソッドごとの入力スキーマ。Core は受け取ったらまずここで検証する */
export const PARAMS = {
  'app.info': z.object({}),
  'instruments.search': z.object({ q: z.string().max(40), limit: z.number().int().min(1).max(50).optional() }),
  'instruments.get': z.object({ ids }),
  'instruments.all': z.object({}),
  'instruments.addUser': z.object({ code: z.string().min(1).max(12) }),
  'bars.get': z.object({ id, tf, adjustment: z.enum(['split', 'unadjusted', 'total']).optional() }),
  'bars.many': z.object({ ids: z.array(id).max(60), tf, count: z.number().int().min(2).max(3000) }),
  'dividends.get': z.object({ id }),
  'returns.get': z.object({ ids, from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  'metrics.get': z.object({ ids }),
  'quotes.get': z.object({ ids }),
  'screener.run': z.object({ conditions: z.array(cond).max(40), favorites: ids, watchlists: z.record(z.string(), ids) }),
  'user.load': z.object({}),
  'user.saveSettings': z.object({ settings: settingsSchema }),
  'user.saveWatchlists': z.object({ watchlists: z.array(watchlistSchema).max(200) }),
  'user.saveScreens': z.object({ screens: z.array(screenSchema).max(500) }),
  'user.saveLayout': z.object({ layout: z.unknown() }),
  'user.exportAll': z.object({}),
  'user.importAll': z.object({ json: z.string().max(20_000_000) }),
  'jobs.start': z.object({ kind: z.enum(['initial', 'daily', 'universe']) }),
  'jobs.refetch': z.object({ ids }),
  'jobs.reset': z.object({ keepDelisted: z.boolean() }),
  'jobs.planRetention': z.object({ years: z.number().int().min(1).max(10) }),
  'jobs.applyRetention': z.object({ years: z.number().int().min(1).max(10) }),
  'jobs.cancel': z.object({ id: z.number().int() }),
  'jobs.pause': z.object({ id: z.number().int() }),
  'jobs.resume': z.object({ id: z.number().int() }),
  'jobs.list': z.object({}),
  'data.status': z.object({}),
  'data.failures': z.object({}),
  'data.importJpx': z.object({ bytes: z.instanceof(Uint8Array) }),
} as const

export type Method = keyof typeof PARAMS
export type Params<M extends Method> = z.infer<(typeof PARAMS)[M]>

export interface UserData {
  settings: Settings
  watchlists: Watchlist[]
  screens: SavedScreen[]
  layout: unknown
  readOnly: boolean
  error?: string
}

export interface Results {
  'app.info': AppInfo
  'instruments.search': Instrument[]
  'instruments.get': Instrument[]
  'instruments.all': Instrument[]
  'instruments.addUser': Instrument | null
  'bars.get': Bars & { dividends: Dividend[]; splits: Split[]; adjustment: Adjustment }
  'bars.many': Record<InstrumentId, Bars>
  'dividends.get': Dividend[]
  'returns.get': Record<InstrumentId, number>
  'metrics.get': MetricsRow[]
  'quotes.get': Quote[]
  'screener.run': ScreenResult
  'user.load': UserData
  'user.saveSettings': undefined
  'user.saveWatchlists': undefined
  'user.saveScreens': undefined
  'user.saveLayout': undefined
  'user.exportAll': string
  'user.importAll': { watchlists: number; screens: number }
  'jobs.start': number
  'jobs.refetch': number
  'jobs.reset': number
  'jobs.planRetention': RetentionPlan
  'jobs.applyRetention': number
  'jobs.cancel': undefined
  'jobs.pause': undefined
  'jobs.resume': undefined
  'jobs.list': JobProgress[]
  'data.status': DataStatus
  'data.failures': FetchFailure[]
  'data.importJpx': number
}

/** Core から renderer への通知 */
export interface Events {
  'jobs.progress': JobProgress
  'data.updated': { ids: InstrumentId[]; metrics: boolean }
  'user.error': { message: string }
  'provider.state': { offline: boolean; paused: boolean; message?: string }
}
export type EventName = keyof Events

/** Core が返すエラー（文言ではなくコード + 引数。FR-N5） */
export interface CoreError {
  code: 'invalid-params' | 'not-found' | 'read-only' | 'busy' | 'provider' | 'internal' | 'unknown-method'
  args?: Record<string, string | number>
  message?: string
}

export type Timeframes = Timeframe
