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
  ma25: number | null
  ma75: number | null
  ma200: number | null
  /** 配当性向（過去 12 か月の配当 ÷ EPS） */
  payout: number | null
  /** 連続増配・非減配の年数（暦年の合計で比べる。保存期間の範囲内） */
  divUpYears: number | null
  divNoCutYears: number | null
  /** 25 日線と 75 日線のゴールデンクロス・デッドクロスからの取引日数 */
  gcDays: number | null
  dcDays: number | null
  /** 直近 2 期の分配を年換算した利回り（FR-I3） */
  yield2p: number | null
  /** ROE（EPS ÷ BPS、株式だけ） */
  roe: number | null
  /** 年途中を除いた最新の年の配当の前年比・5 年の年率 */
  divYoy: number | null
  divCagr5: number | null
  /** 最低投資金額（終値 × 売買単位。株式 100 株・REIT 1 口、ほかは欠損） */
  minInvest: number | null
  fromLo52: number | null
  /** 年初来（1〜3 月は昨年来）の高値・安値から */
  ytdFromHi: number | null
  ytdFromLo: number | null
  maDev200: number | null
  /** ボラティリティ（60 取引日・年率）・ベータ（1 年・対日経平均）・最大下落率（3 年・配当込み） */
  vol60: number | null
  beta1y: number | null
  mdd3y: number | null
  ret6m: number | null
  retYtd: number | null
  /** 配当込みの騰落率（チャートの「配当込み」と同じ） */
  tr1y: number | null
  tr3y: number | null
  /** 最新の足の売買代金（終値 × 出来高）と、52 週の新高値・新安値（1 / 0。FR-BR5） */
  turnover: number | null
  newHi52: number | null
  newLo52: number | null
  /** 次の決算発表・権利付最終日（1970-01-01 からの日数） */
  earningsDay: number | null
  rightsDay: number | null
  /** 権利確定日の日（0 = 月末、1〜31 = その日） */
  recordDay: number | null
  recordMonths: number[] // 権利確定月（FR-H3）
  gapSuspect: boolean // 分割イベントのない ±50% 超のギャップ（FR-D5）
  /** 高値 < 安値・終値 0 以下などの異常値（FR-D5 の残り） */
  anomaly: boolean
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
  /** 次の決算発表（日本時間の日付）・前回・Yahoo の推定か */
  earningsNext?: JstDate | null
  earningsLast?: JstDate | null
  earningsEst?: boolean | null
}

/** 銘柄情報の追加の値（FR-I6〜I9。表示中の銘柄だけ Core がその場で計算する） */
export interface InfoExtra {
  id: InstrumentId
  /** 最新の足の始値・高値・安値・出来高と前日終値 */
  day: { o: number; h: number; l: number; v: number; prev: number | null } | null
  /** 52 週の高値・安値をつけた日 */
  hi52d: JstDate | null
  lo52d: JstDate | null
  /** 5 年の騰落率（値段） */
  ret5y: number | null
  /** 配当込みの騰落率（チャートの「配当込み」と同じ考え方） */
  tr: { y1: number | null; y3: number | null; y5: number | null }
  /** 最大下落率（配当込み。5 年か、ある分だけ）と、その始まりと底の日 */
  mdd: { pct: number; from: JstDate; to: JstDate; years: number } | null
  /** 実績利回りの範囲（5 年か、ある分だけ。日ごとの「過去 12 か月の配当 ÷ 終値」） */
  yieldRange: { lo: number; hi: number; years: number } | null
  /** 同じ業種（REIT はまとめて）の中央値 */
  sector: { name: string; n: number; yield: number | null; per: number | null; pbr: number | null } | null
  /** 次の決算発表（Yahoo の予定。estimate は Yahoo の推定）と前回 */
  earnings: { next: JstDate | null; estimate: boolean; last: JstDate | null } | null
  /** 直近の株式分割・併合 */
  split: Split | null
}

// ---------------------------------------------------------------- screening（§5.2, §5.3）

export type CondOp = '>=' | '<=' | '=' | 'in' | 'notin'
export interface Condition {
  field: string // FieldDef.id
  op: CondOp
  value: number | string | boolean | string[]
  /** 欠損値を含めるか（FR-SC8）。既定は除外 */
  includeMissing?: boolean
  /** 相対条件（FR-SC5）: 別の指標と比べる。value はその指標からの差（%）。例: 終値 ≥ 75日移動平均 +0% */
  ref?: string
  /** すぐ上の条件と「または」でまとめる（FR-SC5）。「かつ」は「または」のまとまりどうしをつなぐ */
  or?: boolean
  /** 保存したときの指標の版（FR-FD5）。無ければ 1 */
  v?: number
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
  /** 結果表の列（FR-SC14）。列の ID は lib/columns.ts */
  columns?: string[]
  /** 上位 N 件（FR-SC5）。並べ替えの順で上から */
  limit?: number
  created: number
  updated: number
}

// ---------------------------------------------------------------- holdings（§6.9, FR-H7〜H10）

/** NISA 成長投資枠・つみたて投資枠・旧 NISA・特定・一般 */
export type AccountType = 'nisa_growth' | 'nisa_tsumitate' | 'nisa_legacy' | 'tokutei' | 'ippan'
/** 保有の 1 回の取引（FR-H5, H7） */
export interface Lot {
  date: JstDate
  side: 'buy' | 'sell'
  quantity: number
  price: number
  fee?: number
}
/** 銘柄 × 口座区分ごとの保有（FR-H7）。lots があれば数量・平均取得単価は取引から計算する（移動平均法、FR-H5） */
export interface Holding {
  code: string
  account: AccountType
  quantity: number
  avgCost: number
  lots?: Lot[]
  broker?: string
  note?: string
  /** 証券会社の CSV から取り込んだときの銘柄名・現在値・取り込んだ日時（FR-H11） */
  name?: string
  price?: number
  importedAt?: string
}
export type AlertTarget = { kind: 'symbol'; id: InstrumentId } | { kind: 'screen'; screenId: string }
/** アラート（FR-AL1。requirements.md §6.14・design-alerts.md）。定義は利用者のデータ（alerts.json） */
export interface Alert {
  id: string
  /** 銘柄のアラート（FR-AL1）か、スクリーンのアラート（FR-AL2: 結果に新しく入った銘柄を知らせる） */
  target: AlertTarget
  /** 銘柄のアラートの条件（1〜3 個、「かつ」）。数値の市場の指標と保有の損益率、比べ方は >= <= と相対条件だけ。スクリーンのアラートでは空 */
  conditions: Condition[]
  /** 価格のしきい値の基準日（作った日・直した日）。これより後の分割・併合で換算する */
  basis: JstDate
  /** 成り立ち直すたびに鳴る / 1 回だけ（鳴ったら止める） */
  repeat: boolean
  enabled: boolean
  note?: string
  created: string
}
/** 判定できない理由 */
export type AlertInvalid = 'missing' | 'stale' | 'suspect' | 'delisted' | 'noHoldings' | 'loading' | 'condition' | 'noScreen'
/** 判定の状態（Core だけが書く。書き出しの対象外） */
export interface AlertState {
  /** 前の判定で成り立っていたか。null はまだ基準が無い（作った・直した・再開した直後） */
  met: boolean | null
  /** 前に判定した基準日（同じ基準日では判定し直さない） */
  asOf?: JstDate
  lastFired?: string
  invalid?: AlertInvalid
  /** スクリーンのアラート: 前の判定の結果の銘柄 */
  members?: InstrumentId[]
}
/** 一覧に出す形: 定義・状態と、今の値・条件までの距離・換算したしきい値 */
export interface AlertView extends Alert {
  state: AlertState
  /** 1 つめの条件の指標の今の値（スクリーンのアラートは結果の件数） */
  now: number | null
  /** 成り立っていない条件のうちいちばん遠いもの。kind は「あと何 %」か「あと何ポイント」 */
  distance: { kind: 'pct' | 'pt'; value: number } | null
  /** 分割・併合で換算した条件（換算が無ければ無い） */
  adjusted?: Condition[]
}
/** 鳴った記録（最大 500 件。書き出しの対象外） */
export interface AlertFire {
  id: string
  alertId: string
  at: string
  /** 銘柄（スクリーンのアラートは新しく入った最初の銘柄） */
  instrument: InstrumentId
  /** スクリーンのアラート: スクリーンと、新しく入った銘柄（20 件まで）と残りの数 */
  screenId?: string
  members?: InstrumentId[]
  more?: number
  conditions: Condition[]
  /** 判定に使った値（指標 ID → 値） */
  values: Record<string, number | null>
  /** 分割・併合で換算したしきい値で判定した */
  splitAdjusted: boolean
  asOf: JstDate
  /** 大引け後の気配から作った仮の足で判定した（FR-D8） */
  provisional: boolean
  read: boolean
}

/** 最後に取り込んだ証券会社の CSV の情報（FR-H11）。累計の実現損益・配当金は CSV の資産合計欄の「国内株式」の行 */
export interface PortfolioMeta {
  broker: string
  importedAt: string
  realized: number | null
  dividends: number | null
}
/** 証券会社の CSV の取り込み前の確認（FR-H11）。取り込むと保有はすべて CSV の内容に置き換わる */
export interface BrokerCsvPreview {
  add: Holding[]
  update: Holding[]
  same: Holding[]
  removed: Holding[]
  /** 取り込まない行（国内株式以外など） */
  skipped: { kind: string; name: string; reason: string }[]
  /** 銘柄の一覧に無いコード（取り込むと銘柄を足してデータを取りにいく） */
  unknown: string[]
  holdings: Holding[]
  meta: PortfolioMeta
}
export interface HoldingsImportPreview {
  add: Holding[]
  update: Holding[]
  same: Holding[]
  rejected: { index: number; code: string; reason: string }[]
  /** 銘柄の一覧に無いコード（取り込むと銘柄を足してデータを取りにいく。別の PC で足した銘柄など） */
  unknown: string[]
  /** 取り込むもの（検証済み）。applyImport にそのまま渡す */
  holdings: Holding[]
  /** 書き出した PC で最後に取り込んだ証券会社の CSV の情報（あれば） */
  meta: PortfolioMeta | null
  /** 資産推移の記録（あれば。取り込むと日付で混ぜる。FR-PF2） */
  history?: FolioPoint[]
}

/** マイレイアウトのページ（FR-L14。前の版の「名前を付けて保存したレイアウト」と同じファイル・同じ形） */
export interface SavedLayout {
  id: string
  name: LocalizedName
  /** LayoutEntry（renderer の stores/layout.svelte.ts） */
  entry: unknown
  /** 使わない（前の版は必須なので {} を書き続ける） */
  links: Record<string, InstrumentId>
  /** 作ったときの形（`preset:<タブ>`・`free:<形>`。無ければ前の版のもの） */
  shape?: string
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
  /** フォーカスの枠をマウス操作のときも出す（FR-KB3） */
  focusAlways: boolean
  /** テーマ（FR-V8） */
  theme: 'dark' | 'light'
  /** 大引けの 30 分後から、起動時と起動中に自動で更新する（FR-F6） */
  autoUpdate: boolean
  /** 新しい版が GitHub Releases に出たら知らせる（NFR-Q9）。通信は api.github.com だけ */
  checkUpdates: boolean
  /** プライバシーモード: 保有の金額と数量を **** で隠す（FR-H12） */
  privacyMode: boolean
  /** アラートが鳴ったら Windows の通知でも知らせる（FR-AL5） */
  alertNotify: boolean
  /** キーの割り当ての上書き（FR-KB6）。アクションの ID → キー（例 'Ctrl+Shift+K'）。'' は割り当てなし */
  keymap: Record<string, string>
  /** スクリーナーの条件に最近足した指標（条件を選ぶダイアログの「よく使う」。新しい順） */
  recentFields: string[]
  /** チャートの移動平均の期間（FR-C2）。時間軸ごとに 3 本 */
  maPeriods: { D: number[]; W: number[]; M: number[] }
  /** 配当の目標（月あたり・円。0 は無し） */
  divGoal: number
  /** 目標利回りの線をチャートとグリッドのタイルに引く（FR-C12） */
  yieldLine: boolean
  /** 目標の利回り（%。設定の画面では 3 つまで。チャートは全部引く） */
  yieldTargets: number[]
  /** チャートを画像（PNG）で保存できるようにする（FR-C11。既定 OFF。ON にして初めて見出しのボタン・S キー・「⋯」の項目が出る） */
  chartSave: boolean
  /** 1 枚目の × で終わらず、すべての窓を隠して通知領域で動き続ける（FR-BG1。docs/design-background.md） */
  closeToTray: boolean
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

// ---- ポートフォリオ（docs/design-portfolio.md。FR-PF1〜PF8） ----
/** 記録した日の保有（銘柄 × 口座区分）。qty はその日の株数の基準（その後の分割は読むときに換算する） */
export interface FolioPos {
  code: string
  acct: AccountType
  qty: number
  /** 平均取得単価（その日の株数の基準） */
  cost: number
}
/** 資産推移の記録（1 日 1 件。§5.2） */
export interface FolioPoint {
  d: JstDate
  /** 記録 / 起動しなかった日を前の保有 × その日の終値で埋めた補完値 */
  src: 'rec' | 'fill'
  /** その日の終値がすべてそろっているか（そろっていなければ次の記録で書き直す） */
  final: boolean
  /** 取得に失敗した銘柄があり、前の終値で評価した */
  stale?: boolean
  value: number
  cost: number
  pos: FolioPos[]
  /** 実現損益・受取配当の累計（証券会社の CSV。あれば） */
  realized?: number
  received?: number
  /** 書いた時刻（ms） */
  at: number
}
/** 資産推移の系列（保有の明細は含めない）。est は記録の前の試算（参考） */
export interface FolioSeriesPoint {
  d: JstDate
  src: 'rec' | 'fill' | 'est'
  final: boolean
  value: number
  cost: number
  realized?: number
  received?: number
}
export interface FolioSeries {
  points: FolioSeriesPoint[]
  /** 記録の初日（無ければ null） */
  first: JstDate | null
  /** 記録を書けない（利用者のデータが読み取り専用・記録が読めない） */
  readOnly: boolean
  /** 今の保有（分割で換算した株数。CSV を取り込み直す前でも記録と同じ基準） */
  now: FolioPos[]
  error?: string
}
/** ある日の保有と終値（十字線の連動。§8） */
export interface FolioAt {
  d: JstDate
  src: 'rec' | 'fill'
  pos: FolioPos[]
  /** その日の終値と前の取引日の終値（分割調整済み。pos の株数は換算済み） */
  close: Record<string, number | null>
  prev: Record<string, number | null>
}
/** 期間の損益寄与（今月・今年。§6.5）。price は値動き、div はその期間に権利落ちした配当（税引後） */
export interface FolioContribRow {
  code: string
  price: number
  div: number
  /** 期間の途中で売った銘柄: 最後に持っていた日 */
  soldOn?: JstDate
}
export interface FolioContrib {
  from: JstDate
  to: JstDate
  /** 期間の初めが記録より前（その分は現在の株数で計算した） */
  beforeRecords: boolean
  rows: FolioContribRow[]
}
/** 1 株配当の年（直近 N 回の権利落ちの合計。§6.6） */
export interface DpsBlocks {
  /** 5 年分（古い → 新しい）。足りない年は null */
  dps: (number | null)[]
  /** 年あたりの回数 */
  perYear: number
  /** 回数が変わった（年 1 回 → 年 2 回など） */
  regimeChanged: boolean
  /** 前年の同じ回の 1.5 倍を超える回がある（特別配当の可能性） */
  special: boolean
  /** 直近 1 年の権利落ち（月割り・リボンに使う） */
  last: Dividend[]
  /** その前の 1 年の権利落ち（前年同月の棒に使う。今年無配になった銘柄も前年の分を出す） */
  prev: Dividend[]
}
/** 配当の分析の 1 銘柄（§4.2・6.6） */
export interface FolioDivRow extends DpsBlocks {
  code: string
  /** 今の株数（口座ごと。分割で換算済み） */
  now: { acct: AccountType; qty: number }[]
  /** 1 年前の株数（記録から。記録が 1 年に満たなければ null） */
  yearAgo: { acct: AccountType; qty: number }[] | null
}
export interface FolioDividends {
  rows: FolioDivRow[]
  /** 1 年前の数量に使った記録の日（無ければ null） */
  yearAgoDate: JstDate | null
  /** 配当見込みの推移（記録の日ごと。税引後の年額） */
  trend: { d: JstDate; v: number }[]
}
