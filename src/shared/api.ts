// renderer ⇄ core の API（§8.2）。名前・型・入力の zod スキーマを 1 か所で定義する（NFR-A3）。
// renderer は window.elecxstock.call(method, params) だけで Core に話しかける。
import { z } from 'zod'
import type {
  Adjustment,
  AppInfo,
  Bars,
  BrokerCsvPreview,
  DataStatus,
  Dividend,
  FetchFailure,
  Holding,
  HoldingsImportPreview,
  Instrument,
  InstrumentId,
  JobProgress,
  MetricsRow,
  PortfolioMeta,
  Quote,
  RetentionPlan,
  SavedLayout,
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
  ref: z.string().max(64).optional(),
  or: z.boolean().optional(),
  v: z.number().int().min(1).max(1000).optional(),
})
const name = z.object({ ja: z.string().max(80), en: z.string().max(80) })
const periods = z.array(z.number().int().min(2).max(400)).length(3)
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
  columns: z.array(z.string().max(40)).max(60).optional(),
  limit: z.number().int().min(1).max(5000).optional(),
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
  focusAlways: z.boolean(),
  theme: z.enum(['dark', 'light']),
  autoUpdate: z.boolean(),
  checkUpdates: z.boolean(),
  keymap: z.record(z.string().max(40), z.string().max(40)),
  maPeriods: z.object({ D: periods, W: periods, M: periods }),
})

export const ACCOUNT_TYPES = ['nisa_growth', 'nisa_tsumitate', 'nisa_legacy', 'tokutei', 'ippan'] as const
const jstDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
export const lotSchema = z.object({
  date: jstDate,
  side: z.enum(['buy', 'sell']),
  quantity: z.number().positive().max(1e9),
  price: z.number().nonnegative().max(1e9),
  fee: z.number().nonnegative().max(1e9).optional(),
})
export const holdingSchema = z.object({
  code: z.string().regex(/^[0-9A-Z]{4,5}$/),
  account: z.enum(ACCOUNT_TYPES),
  quantity: z.number().nonnegative().max(1e9),
  avgCost: z.number().nonnegative().max(1e9),
  lots: z.array(lotSchema).max(2000).optional(),
  broker: z.string().max(80).optional(),
  note: z.string().max(400).optional(),
  name: z.string().max(120).optional(),
  price: z.number().nonnegative().max(1e9).optional(),
  importedAt: z.string().max(40).optional(),
})
export const portfolioMetaSchema = z.object({
  broker: z.string().max(80),
  importedAt: z.string().max(40),
  realized: z.number().nullable(),
  dividends: z.number().nullable(),
})
export const savedLayoutSchema = z.object({
  id: z.string().max(40),
  name,
  entry: z.unknown(),
  links: z.record(z.string(), id),
  created: z.number(),
  updated: z.number(),
})

/** メソッドごとの入力スキーマ。Core は受け取ったらまずここで検証する */
export const PARAMS = {
  'app.info': z.object({}),
  'instruments.search': z.object({ q: z.string().max(40), limit: z.number().int().min(1).max(50).optional() }),
  'instruments.get': z.object({ ids }),
  'instruments.all': z.object({}),
  'instruments.addUser': z.object({ code: z.string().min(1).max(12) }),
  'instruments.removeUser': z.object({ code: z.string().min(1).max(12) }),
  'bars.get': z.object({ id, tf, adjustment: z.enum(['split', 'unadjusted', 'total']).optional() }),
  'bars.many': z.object({ ids: z.array(id).max(60), tf, count: z.number().int().min(2).max(3000) }),
  'dividends.get': z.object({ id }),
  'returns.get': z.object({ ids, from: jstDate }),
  'metrics.get': z.object({ ids }),
  'quotes.get': z.object({ ids }),
  'screener.run': z.object({ conditions: z.array(cond).max(40), favorites: ids, watchlists: z.record(z.string(), ids) }),
  'user.load': z.object({}),
  'user.saveSettings': z.object({ settings: settingsSchema }),
  'user.saveWatchlists': z.object({ watchlists: z.array(watchlistSchema).max(200) }),
  'user.saveScreens': z.object({ screens: z.array(screenSchema).max(500) }),
  'user.saveLayout': z.object({ layout: z.unknown() }),
  'user.saveLayouts': z.object({ layouts: z.array(savedLayoutSchema).max(200) }),
  'user.defaultScreens': z.object({}),
  'user.undoImport': z.object({}),
  'portfolio.list': z.object({}),
  'portfolio.save': z.object({ holdings: z.array(holdingSchema).max(5000) }),
  'portfolio.export': z.object({}),
  'portfolio.previewImport': z.object({ json: z.string().max(20_000_000) }),
  'portfolio.applyImport': z.object({
    holdings: z.array(holdingSchema).max(5000),
    mode: z.enum(['merge', 'replace']),
    meta: portfolioMetaSchema.nullable().optional(),
  }),
  'portfolio.undoImport': z.object({}),
  'portfolio.meta': z.object({}),
  'user.saveWindowLayout': z.object({ slot: z.enum(['free2', 'free3', 'free4']), entry: z.unknown() }),
  'watchlists.toggleItem': z.object({ list: z.string().max(40), id }),
  'portfolio.previewCsv': z.object({ text: z.string().max(20_000_000) }),
  'portfolio.applyCsv': z.object({ holdings: z.array(holdingSchema).max(5000), meta: portfolioMetaSchema }),
  'bars.csv': z.object({ ids: z.array(id).max(500), from: jstDate.optional(), to: jstDate.optional() }),
  'data.backup': z.object({}),
  'app.checkUpdate': z.object({}),
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
  layouts: SavedLayout[]
  readOnly: boolean
  error?: string
}

export interface Results {
  'app.info': AppInfo
  'instruments.search': Instrument[]
  'instruments.get': Instrument[]
  'instruments.all': Instrument[]
  'instruments.addUser': Instrument | null
  'instruments.removeUser': undefined
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
  'user.saveLayouts': undefined
  'user.defaultScreens': SavedScreen[]
  /** 取り込む前の状態に戻せたか */
  'user.undoImport': boolean
  'portfolio.list': Holding[]
  'portfolio.save': Holding[]
  'portfolio.export': string
  'portfolio.previewImport': HoldingsImportPreview
  'portfolio.applyImport': Holding[]
  'portfolio.undoImport': Holding[] | null
  'portfolio.meta': PortfolioMeta | null
  'user.saveWindowLayout': undefined
  'watchlists.toggleItem': Watchlist[]
  'portfolio.previewCsv': BrokerCsvPreview
  'portfolio.applyCsv': Holding[]
  'bars.csv': string
  /** 書き出した DB のファイル名（data/backups の中） */
  'data.backup': string
  'app.checkUpdate': { version: string; url: string; newer: boolean } | null
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
  /** 利用者のデータが変わった（マルチモニタ）。from は変えたウィンドウ。op は★・◆の切り替え */
  'user.changed': { kind: 'settings' | 'watchlists' | 'holdings'; from: string; op?: { list: string; id: string } }
}
export type EventName = keyof Events

/** Core が返すエラー（文言ではなくコード + 引数。FR-N5） */
export interface CoreError {
  code: 'invalid-params' | 'not-found' | 'read-only' | 'busy' | 'provider' | 'internal' | 'unknown-method'
  args?: Record<string, string | number>
  message?: string
}

export type Timeframes = Timeframe
