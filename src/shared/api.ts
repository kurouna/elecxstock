// renderer ⇄ core の API（§8.2）。名前・型・入力の zod スキーマを 1 か所で定義する（NFR-A3）。
// renderer は window.elecxstock.call(method, params) だけで Core に話しかける。
import { z } from 'zod'
import type {
  Adjustment,
  Alert,
  AlertFire,
  AlertView,
  AppInfo,
  Bars,
  BrokerCsvPreview,
  DataStatus,
  Dividend,
  FetchFailure,
  FolioAt,
  FolioContrib,
  FolioDividends,
  FolioSeries,
  Holding,
  HoldingsImportPreview,
  InfoExtra,
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
const alertDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
/** アラート（FR-AL1）。条件の中身（使える指標・比べ方）は Core が登録表と照らして確かめる */
export const alertSchema = z.object({
  id: z.string().min(1).max(40),
  target: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('symbol'), id }),
    z.object({ kind: z.literal('screen'), screenId: z.string().min(1).max(40) }),
  ]),
  /** 銘柄は 1〜3 個、スクリーンは 0 個（Core が確かめる） */
  conditions: z.array(cond).max(3),
  basis: alertDay,
  repeat: z.boolean(),
  enabled: z.boolean(),
  note: z.string().max(200).optional(),
  created: z.string().max(40),
})
const alertState = z.object({
  met: z.boolean().nullable(),
  asOf: alertDay.optional(),
  lastFired: z.string().max(40).optional(),
  invalid: z.enum(['missing', 'stale', 'suspect', 'delisted', 'noHoldings', 'loading', 'condition', 'noScreen']).optional(),
  members: z.array(id).max(5000).optional(),
})
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
  alertNotify: z.boolean(),
  /** 配当の目標（月あたり・円。0 は無し。FR-PF7） */
  divGoal: z.number().min(0).max(1e10),
  /** 目標利回りの線（FR-C12）。目標は % で、設定の画面では 3 つまで（保存は広めに受ける） */
  yieldLine: z.boolean(),
  yieldTargets: z.array(z.number().min(0.1).max(30)).max(20),
  /** チャートの画像の保存（FR-C11。既定 OFF のオプトイン） */
  chartSave: z.boolean(),
  /** 閉じても通知領域に残す（FR-BG1） */
  closeToTray: z.boolean(),
  keymap: z.record(z.string().max(40), z.string().max(40)),
  recentFields: z.array(z.string().max(40)).max(12),
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
  // 保存済みのファイルを読めなくしないよう、検証は CODE_RE より広い（取り込む側で CODE_RE を当てる）
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
const folioPosSchema = z.object({
  code: z.string().min(1).max(12),
  acct: z.enum(ACCOUNT_TYPES),
  qty: z.number().nonnegative().max(1e12),
  cost: z.number().nonnegative().max(1e12),
})
/** 資産推移の記録の 1 日（portfolioHistory.json と保有の JSON の history。FR-PF2） */
export const folioPointSchema = z.object({
  d: jstDate,
  src: z.enum(['rec', 'fill']),
  final: z.boolean(),
  stale: z.boolean().optional(),
  value: z.number().finite(),
  cost: z.number().finite(),
  pos: z.array(folioPosSchema).max(5000),
  realized: z.number().finite().optional(),
  received: z.number().finite().optional(),
  at: z.number(),
})
export const savedLayoutSchema = z.object({
  id: z.string().max(40),
  name,
  entry: z.unknown(),
  links: z.record(z.string(), id),
  /** 作ったときの形（FR-L14。初期状態に戻す先）。前の版は知らないキーを捨てるので読める */
  shape: z.string().max(60).optional(),
  created: z.number(),
  updated: z.number(),
})
/**
 * マイレイアウトのページの数の上限（保存・取り込み・ファイルの読み込みで同じ値。FR-L14）。画面で足せるのは 30 枚までで、
 * これは取り込みや手で書いたファイルの歯止め。超えた分はファイルの読み込みでは除き（元を写しておく）、取り込みでは断る
 */
export const PAGES_LIMIT = 200

/**
 * 利用者のデータのファイル（data/user/<name>.json）ごとのスキーマ。Core の UserStore が読むときに検証し、通らなければ退避して
 * 読み取り専用で起動する（FR-S12）。E2E のフィクスチャ（tests/e2e/support の writeUser）も同じスキーマで書く前に確かめる
 */
export const USER_FILE_SCHEMAS = {
  settings: settingsSchema,
  watchlists: z.array(watchlistSchema),
  screens: z.array(screenSchema),
  layout: z.unknown(),
  layouts: z.array(savedLayoutSchema).max(PAGES_LIMIT),
  holdings: z.array(holdingSchema),
  portfolioMeta: portfolioMetaSchema.nullable(),
  /** アラートの定義（FR-AL10）。判定の状態と履歴は alerts.ts の AlertBook（世代なし） */
  alerts: z.array(alertSchema).max(500),
} as const

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
  /** 銘柄情報の追加の値（FR-I6〜I9）。表示中の銘柄だけ */
  'info.extra': z.object({ id }),
  'returns.get': z.object({ ids, from: jstDate }),
  'metrics.get': z.object({ ids }),
  'quotes.get': z.object({ ids }),
  'screener.run': z.object({ conditions: z.array(cond).max(40), favorites: ids, watchlists: z.record(z.string(), ids) }),
  'user.load': z.object({}),
  'user.saveSettings': z.object({ settings: settingsSchema }),
  'user.saveWatchlists': z.object({ watchlists: z.array(watchlistSchema).max(200) }),
  'user.saveScreens': z.object({ screens: z.array(screenSchema).max(500) }),
  'user.saveLayout': z.object({ layout: z.unknown() }),
  'user.saveLayouts': z.object({ layouts: z.array(savedLayoutSchema).max(PAGES_LIMIT) }),
  'user.defaultScreens': z.object({}),
  'user.undoImport': z.object({}),
  'portfolio.list': z.object({}),
  'alerts.list': z.object({}),
  /** 新規は id を空にする（Core が付ける） */
  'alerts.save': z.object({
    alert: alertSchema.extend({ id: z.string().max(40), basis: jstDate.optional(), created: z.string().max(40).optional() }),
  }),
  'alerts.remove': z.object({ id: z.string().max(40) }),
  'alerts.restore': z.object({ alert: alertSchema, state: alertState }),
  'alerts.setEnabled': z.object({ id: z.string().max(40), enabled: z.boolean() }),
  'alerts.history': z.object({ limit: z.number().int().min(1).max(500).optional() }),
  'alerts.markRead': z.object({ ids: z.array(z.string().max(40)).max(500).optional() }),
  'alerts.unread': z.object({}),
  'portfolio.save': z.object({ holdings: z.array(holdingSchema).max(5000) }),
  'portfolio.export': z.object({}),
  'portfolio.previewImport': z.object({ json: z.string().max(20_000_000) }),
  'portfolio.applyImport': z.object({
    holdings: z.array(holdingSchema).max(5000),
    mode: z.enum(['merge', 'replace']),
    meta: portfolioMetaSchema.nullable().optional(),
    /** 保有の JSON に入っていた資産推移の記録（日付で混ぜる） */
    history: z.array(folioPointSchema).max(100_000).optional(),
  }),
  'portfolio.undoImport': z.object({}),
  'portfolio.meta': z.object({}),
  // フリー N の配置（レイアウトの木の 1 つ。読むときに renderer の normalizeEntry が形を直す）
  'user.saveWindowLayout': z.object({ slot: z.enum(['free2', 'free3', 'free4']), entry: z.record(z.string(), z.unknown()) }),
  'watchlists.toggleItem': z.object({ list: z.string().max(40), id }),
  'portfolio.previewCsv': z.object({ text: z.string().max(20_000_000) }),
  'portfolio.applyCsv': z.object({ holdings: z.array(holdingSchema).max(5000), meta: portfolioMetaSchema }),
  // ポートフォリオ（FR-PF1〜PF8）
  'folio.series': z.object({ est: z.boolean().optional() }),
  'folio.at': z.object({ d: jstDate }),
  'folio.contrib': z.object({ period: z.enum(['month', 'year']) }),
  'folio.dividends': z.object({}),
  'folio.clear': z.object({}),
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
  /** 読み損なって退避したレイアウトのファイル（FR-S12。既定に戻した・通らない要素を除いた）。1 枚目がトーストで知らせる */
  recovered?: RecoveredFile[]
}
export interface RecoveredFile {
  file: 'layout' | 'layouts'
  /** 退避した先（data/user/backups の中のファイル名） */
  backup: string
  /** 要素ごとの検証で除いた件数（ファイルごと既定に戻したときは無い） */
  dropped?: number
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
  'info.extra': InfoExtra
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
  'alerts.list': AlertView[]
  'alerts.save': AlertView
  'alerts.remove': { alert: Alert; state: AlertView['state'] } | null
  'alerts.restore': AlertView
  'alerts.setEnabled': AlertView | null
  'alerts.history': AlertFire[]
  'alerts.markRead': number
  'alerts.unread': number
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
  'folio.series': FolioSeries
  'folio.at': FolioAt | null
  'folio.contrib': FolioContrib
  'folio.dividends': FolioDividends
  'folio.clear': boolean
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
  'user.changed': {
    kind: 'settings' | 'watchlists' | 'holdings' | 'screens' | 'alerts' | 'all'
    from: string
    op?: { list: string; id: string }
  }
  /** アラートが鳴った（FR-AL5）。1 回の判定で 1 回。unread は未読の数 */
  'alerts.fired': { fires: AlertFire[]; unread: number }
}
export type EventName = keyof Events

/** Core が返すエラー（文言ではなくコード + 引数。FR-N5） */
export interface CoreError {
  code: 'invalid-params' | 'not-found' | 'read-only' | 'busy' | 'provider' | 'internal' | 'unknown-method'
  args?: Record<string, string | number>
  message?: string
}

export type Timeframes = Timeframe
