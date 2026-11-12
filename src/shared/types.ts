// renderer・preload・main・core が共有する型（NFR-A3）。ここには実行コードを置かない。

/** 日本時間の日付 'YYYY-MM-DD'（FR-T1） */
export type JstDate = string
/** 不透明な銘柄 ID（FR-U5）: 'JP:7203' | 'JP:25935' | 'IDX:N225' */
export type InstrumentId = string
export type Lang = 'ja' | 'en'
export type Timeframe = 'D' | 'W' | 'M'
export type Adjustment = 'split' | 'unadjusted' | 'total'

/** P プライム / S スタンダード / G グロース / R J-REIT / E ETF・ETN / I 指数 / X その他 */
export type Market = 'P' | 'S' | 'G' | 'R' | 'E' | 'I' | 'X'
export type InstrumentKind = 'stock' | 'reit' | 'etf' | 'index' | 'pref' | 'other'

export interface Instrument {
  id: InstrumentId
  code: string
  nameJa: string
  nameEn: string
  market: Market
  kind: InstrumentKind
  sectorJa: string
  sectorEn: string
  status: 'active' | 'delisted'
  userAdded: boolean
}

export interface Bars {
  id: InstrumentId
  tf: Timeframe
  time: JstDate[]
  open: number[]
  high: number[]
  low: number[]
  close: number[]
  volume: number[]
  /** 大引け後に一括気配で補った「仮」の足のインデックス（FR-D8） */
  provisional: number[]
  /** 形成途中の週足・月足のインデックス（FR-T3） */
  forming: number[]
  /** 最初の足が月次系列（FR-D7）から来た区間の終わり（ここより前は月次系列） */
  monthlyUntil?: number
}

export interface Dividend {
  date: JstDate
  amount: number
}
export interface Split {
  date: JstDate
  ratio: number // 新株数 / 旧株数（5:1 なら 5）
}

/** 銘柄ごとの指標（FR-S10, S13）。null は欠損（FR-D9） */
export interface MetricsRow {
  id: InstrumentId
  asOf: JstDate | null
  provisional: boolean
  stale: boolean
  close: number | null
  chg: number | null
  chgPct: number | null
  yieldTrailing: number | null
  div12: number | null
  per: number | null
  pbr: number | null
  eps: number | null
  bps: number | null
  marketCap: number | null
  turnover20: number | null
  hi52: number | null
  lo52: number | null
  fromHi52: number | null
  maDev25: number | null
  maDev75: number | null
  ret1m: number | null
  ret3m: number | null
  ret1y: number | null
  ret3y: number | null
  rsi14: number | null
  volRatio: number | null
  recordMonths: number[] // 権利確定月（FR-H3）
  gapSuspect: boolean // 分割イベントのない ±50% 超のギャップ（FR-D5）
}

export interface Quote {
  id: InstrumentId
  time: string | null
  price: number | null
  open: number | null
  high: number | null
  low: number | null
  volume: number | null
  prevClose: number | null
  per: number | null
  pbr: number | null
  marketCap: number | null
  shares: number | null
  bps: number | null
  eps: number | null
}

// ---------------------------------------------------------------- screening（§5.2, §5.3）

export type CondOp = '>=' | '<=' | '=' | 'in' | 'notin'
export interface Condition {
  field: string // FieldDef.id
  op: CondOp
  value: number | string | boolean | string[]
  /** 欠損値を含めるか（FR-SC8）。既定は除外 */
  includeMissing?: boolean
}
export interface LocalizedName {
  ja: string
  en: string
}
export interface SavedScreen {
  id: string
  name: LocalizedName
  conditions: Condition[]
  sort?: { field: string; dir: 1 | -1 }
  created: number
  updated: number
}
export interface ScreenResult {
  ids: InstrumentId[]
  rows: MetricsRow[]
  invalid: number[] // 無効な条件のインデックス（FR-SC11）
  ms: number
}

// ---------------------------------------------------------------- user data（FR-S4, S12）

export interface Watchlist {
  id: string
  builtin?: 'favorites' | 'candidates'
  name: LocalizedName
  items: InstrumentId[]
}

export interface Settings {
  lang: Lang
  candleStyle: 'jp' | 'us'
  density: 'normal' | 'compact'
  uiScale: number
  retentionYears: number
  disclaimerAccepted: boolean
  firstRunDone: boolean
  /** 設定ファイルで追加する銘柄のコード（FR-U3） */
  userInstruments: string[]
  reduceMotion: boolean
}

export type JobKind = 'universe' | 'initial' | 'daily' | 'refetch' | 'monthly' | 'reset' | 'retention'
export interface JobProgress {
  id: number
  kind: JobKind
  status: 'queued' | 'running' | 'paused' | 'done' | 'failed' | 'cancelled' | 'waiting-offline' | 'provider-paused'
  done: number
  total: number
  failed: number
  etaSec: number | null
  message?: string
}
export interface DataStatus {
  dbBytes: number
  instruments: number
  withBars: number
  failures: number
  lastUpdate: string | null
  oldestBar: JstDate | null
  newestBar: JstDate | null
  retentionYears: number
  provider: string
  offline: boolean
  universeUpdated: string | null
}
export interface RetentionPlan {
  years: number
  deleteBefore: JstDate | null
  rows: number
  approxBytes: number
}
export interface FetchFailure {
  id: InstrumentId
  at: string
  reason: string
}

export interface AppInfo {
  version: string
  provider: string
  userReadOnly: boolean
  userDataError?: string
}
