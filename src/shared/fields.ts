// 指標の登録表（§5.3 FR-FD1〜FD5）。画面（条件エディタ・列・並べ替え）はすべてここから作る。
// 指標を足すときは、ここに 1 項目を足し、metrics 由来なら core の metrics 計算と列を足す（FR-FD2）。
import type { Condition, CondOp, LocalizedName } from './types'

export type FieldCategory = 'price' | 'value' | 'income' | 'technical' | 'return' | 'attr' | 'user' | 'holding'
export type FieldType = 'number' | 'percent' | 'money' | 'ratio' | 'bool' | 'enum'

export interface FieldDef {
  id: string
  version: number
  label: LocalizedName
  description?: LocalizedName
  category: FieldCategory
  type: FieldType
  /** metrics: MetricsRow の列 / attr: Instrument の属性 / user: 利用者のデータから実行時に計算（FR-FD3） */
  source:
    | { kind: 'metrics'; column: string }
    | { kind: 'attr'; key: 'market' | 'kind' | 'sectorJa' }
    | { kind: 'user'; key: 'favorite' | 'watchlist' }
    /** 保有に基づく指標（P3、FR-H2・H4）。実行時に保有の記録から計算する。今は予約のみ */
    | { kind: 'compute'; key: string }
  operators: CondOp[]
  /** 数値の既定値・刻み・小数桁 */
  default?: number | string | boolean | string[]
  step?: number
  digits?: number
  /** enum の選択肢 */
  choices?: { value: string; label: LocalizedName }[]
  requires?: Array<'daily' | 'dividends' | 'fundamentals' | 'holdings'>
  availableFrom: 'P1' | 'P2' | 'P3'
}

const L = (ja: string, en: string): LocalizedName => ({ ja, en })
const num = (
  id: string,
  ja: string,
  en: string,
  category: FieldCategory,
  type: FieldType,
  column: string,
  o: Partial<FieldDef> = {},
): FieldDef => ({
  id,
  version: 1,
  label: L(ja, en),
  category,
  type,
  source: { kind: 'metrics', column },
  operators: ['>=', '<='],
  step: type === 'percent' ? 0.5 : 1,
  digits: type === 'percent' ? 2 : type === 'ratio' ? 2 : 0,
  availableFrom: 'P1',
  ...o,
})

export const MARKET_CHOICES = [
  { value: 'P', label: L('プライム', 'Prime') },
  { value: 'S', label: L('スタンダード', 'Standard') },
  { value: 'G', label: L('グロース', 'Growth') },
  { value: 'R', label: L('REIT', 'REIT') },
  { value: 'E', label: L('ETF', 'ETF') },
  { value: 'I', label: L('指数', 'Index') },
  { value: 'X', label: L('その他', 'Other') },
]

/** 東証の 33 業種（JPX の一覧の表記。J-REIT・ETF は業種なし） */
export const SECTOR_CHOICES = (
  [
    ['水産・農林業', 'Fishery, Agriculture & Forestry'],
    ['鉱業', 'Mining'],
    ['建設業', 'Construction'],
    ['食料品', 'Foods'],
    ['繊維製品', 'Textiles & Apparels'],
    ['パルプ・紙', 'Pulp & Paper'],
    ['化学', 'Chemicals'],
    ['医薬品', 'Pharmaceutical'],
    ['石油・石炭製品', 'Oil & Coal Products'],
    ['ゴム製品', 'Rubber Products'],
    ['ガラス・土石製品', 'Glass & Ceramics Products'],
    ['鉄鋼', 'Iron & Steel'],
    ['非鉄金属', 'Nonferrous Metals'],
    ['金属製品', 'Metal Products'],
    ['機械', 'Machinery'],
    ['電気機器', 'Electric Appliances'],
    ['輸送用機器', 'Transportation Equipment'],
    ['精密機器', 'Precision Instruments'],
    ['その他製品', 'Other Products'],
    ['電気・ガス業', 'Electric Power & Gas'],
    ['陸運業', 'Land Transportation'],
    ['海運業', 'Marine Transportation'],
    ['空運業', 'Air Transportation'],
    ['倉庫・運輸関連業', 'Warehousing & Harbor Transportation'],
    ['情報・通信業', 'Information & Communication'],
    ['卸売業', 'Wholesale Trade'],
    ['小売業', 'Retail Trade'],
    ['銀行業', 'Banks'],
    ['証券、商品先物取引業', 'Securities & Commodity Futures'],
    ['保険業', 'Insurance'],
    ['その他金融業', 'Other Financing Business'],
    ['不動産業', 'Real Estate'],
    ['サービス業', 'Services'],
  ] as const
).map(([ja, en]) => ({ value: ja as string, label: L(ja, en) }))

export const KIND_CHOICES = [
  { value: 'stock', label: L('株式', 'Stock') },
  { value: 'reit', label: L('J-REIT', 'J-REIT') },
  { value: 'etf', label: L('ETF・ETN', 'ETF/ETN') },
  { value: 'pref', label: L('優先株・社債型', 'Preferred') },
  { value: 'other', label: L('その他', 'Other') },
]

export const FIELDS: FieldDef[] = [
  num('price.close', '終値', 'Last', 'price', 'money', 'close', { step: 100, default: 1000 }),
  num('price.chgPct', '前日比', 'Change', 'price', 'percent', 'chgPct'),
  num('liq.turnover20', '売買代金(20日平均)', 'Turnover (20D avg)', 'price', 'money', 'turnover20', {
    description: L(
      'Yahoo に売買代金は無いため、終値 × 出来高の近似（20 取引日の平均）',
      'Approximated as close × volume (20 trading-day average)',
    ),
    step: 1e8,
    default: 1e9,
  }),
  num('value.marketCap', '時価総額', 'Market cap', 'value', 'money', 'marketCap', { step: 1e10, default: 1e11 }),
  num('income.yield', '実績利回り', 'Trailing yield', 'income', 'percent', 'yieldTrailing', {
    description: L(
      '過去12か月の権利落ち日ベースの配当合計 ÷ 終値（ローカルの配当履歴から計算）',
      'Dividends with ex-dates in the past 12 months ÷ last (from local history)',
    ),
    default: 3.5,
    requires: ['daily', 'dividends'],
  }),
  num('value.per', 'PER', 'P/E', 'value', 'ratio', 'per', {
    operators: ['<=', '>='],
    default: 15,
    step: 1,
    digits: 1,
    requires: ['fundamentals'],
  }),
  num('value.pbr', 'PBR', 'P/B', 'value', 'ratio', 'pbr', {
    operators: ['<=', '>='],
    default: 1,
    step: 0.1,
    description: L('J-REIT は簿価ベース（NAV 倍率ではない）', 'Book value basis for J-REITs (not NAV)'),
    requires: ['fundamentals'],
  }),
  num('tech.fromHi52', '52週高値から', 'From 52W high', 'technical', 'percent', 'fromHi52', { default: -5, digits: 1, step: 1 }),
  num('tech.maDev25', '25日線乖離', 'vs 25D MA', 'technical', 'percent', 'maDev25', { default: 0, digits: 1, step: 1 }),
  num('tech.maDev75', '75日線乖離', 'vs 75D MA', 'technical', 'percent', 'maDev75', { default: 0, digits: 1, step: 1 }),
  num('tech.rsi14', 'RSI(14)', 'RSI(14)', 'technical', 'number', 'rsi14', { default: 30, digits: 1, step: 5 }),
  num('tech.volRatio', '出来高倍率(20日比)', 'Volume vs 20D avg', 'technical', 'ratio', 'volRatio', { default: 2, step: 0.5 }),
  num('ret.1m', '1か月騰落率', '1M return', 'return', 'percent', 'ret1m', { digits: 1, default: 0 }),
  num('ret.3m', '3か月騰落率', '3M return', 'return', 'percent', 'ret3m', { digits: 1, default: 0 }),
  num('ret.1y', '1年騰落率', '1Y return', 'return', 'percent', 'ret1y', { digits: 1, default: 0, step: 5 }),
  num('ret.3y', '3年騰落率', '3Y return', 'return', 'percent', 'ret3y', { digits: 1, default: 0, step: 5 }),
  num('price.ma25', '25日移動平均', '25D MA', 'price', 'money', 'ma25', { step: 100, default: 1000, availableFrom: 'P2' }),
  num('price.ma75', '75日移動平均', '75D MA', 'price', 'money', 'ma75', { step: 100, default: 1000, availableFrom: 'P2' }),
  num('price.ma200', '200日移動平均', '200D MA', 'price', 'money', 'ma200', { step: 100, default: 1000, availableFrom: 'P2' }),
  num('price.hi52', '52週高値', '52W high', 'price', 'money', 'hi52', { step: 100, default: 1000, availableFrom: 'P2' }),
  num('price.lo52', '52週安値', '52W low', 'price', 'money', 'lo52', { step: 100, default: 1000, availableFrom: 'P2' }),
  num('income.yield2p', '利回り（直近2期の年換算）', 'Yield (last 2 periods)', 'income', 'percent', 'yield2p', {
    description: L(
      '直近の決算期 2 回分の配当・分配金を年換算 ÷ 終値。決算期を変えた J-REIT 向け（FR-I3）',
      'Last two distributions annualized ÷ last. For J-REITs that changed their fiscal period',
    ),
    default: 4,
    requires: ['daily', 'dividends'],
    availableFrom: 'P2',
  }),
  num('income.payout', '配当性向', 'Payout ratio', 'income', 'percent', 'payout', {
    description: L('過去12か月の配当 ÷ EPS（Yahoo の実績 EPS）', 'Trailing 12M dividends ÷ EPS (Yahoo trailing EPS)'),
    operators: ['<=', '>='],
    default: 50,
    step: 5,
    digits: 0,
    requires: ['dividends', 'fundamentals'],
    availableFrom: 'P2',
  }),
  num('income.divUpYears', '連続増配年数', 'Dividend growth streak', 'income', 'number', 'divUpYears', {
    description: L(
      '暦年の配当合計で比べた連続増配の年数（保存期間の範囲内で数える）',
      'Consecutive calendar years of higher dividends (within the retention period)',
    ),
    default: 3,
    requires: ['dividends'],
    availableFrom: 'P2',
  }),
  num('income.divNoCutYears', '連続非減配年数', 'No-cut streak', 'income', 'number', 'divNoCutYears', {
    description: L(
      '暦年の配当合計が前年を下回らなかった年数（保存期間の範囲内）',
      'Consecutive calendar years without a cut (within the retention period)',
    ),
    default: 3,
    requires: ['dividends'],
    availableFrom: 'P2',
  }),
  {
    id: 'income.recordMonth',
    version: 1,
    label: L('権利確定月', 'Record month'),
    description: L('権利落ち日の翌営業日の月（過去 2 年の配当から）', 'Month after the ex-date (from the past two years)'),
    category: 'income',
    type: 'enum',
    source: { kind: 'metrics', column: 'recordMonths' },
    operators: ['in', 'notin'],
    choices: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((en, i) => ({
      value: String(i + 1),
      label: L(`${i + 1}月`, en),
    })),
    default: ['3'],
    requires: ['dividends'],
    availableFrom: 'P2',
  },
  num('tech.gcDays', 'ゴールデンクロスからの日数', 'Days since golden cross', 'technical', 'number', 'gcDays', {
    description: L(
      '25 日線が 75 日線を上に抜けてからの取引日数（直近 1 年）',
      'Trading days since the 25D MA crossed above the 75D MA (past year)',
    ),
    operators: ['<=', '>='],
    default: 10,
    step: 5,
    availableFrom: 'P2',
  }),
  num('tech.dcDays', 'デッドクロスからの日数', 'Days since dead cross', 'technical', 'number', 'dcDays', {
    description: L(
      '25 日線が 75 日線を下に抜けてからの取引日数（直近 1 年）',
      'Trading days since the 25D MA crossed below the 75D MA (past year)',
    ),
    operators: ['<=', '>='],
    default: 10,
    step: 5,
    availableFrom: 'P2',
  }),
  {
    id: 'attr.market',
    version: 1,
    label: L('市場区分', 'Market'),
    category: 'attr',
    type: 'enum',
    source: { kind: 'attr', key: 'market' },
    operators: ['in', 'notin'],
    choices: MARKET_CHOICES,
    default: ['P', 'R'],
    availableFrom: 'P1',
  },
  {
    id: 'attr.sector',
    version: 1,
    label: L('業種（33業種）', 'Sector (TSE 33)'),
    description: L('Enter で業種を足す・外す、←→ で 1 業種ずつ切り替え', 'Enter adds or removes a sector; ←→ cycles one'),
    category: 'attr',
    type: 'enum',
    source: { kind: 'attr', key: 'sectorJa' },
    operators: ['in', 'notin'],
    choices: SECTOR_CHOICES,
    default: ['銀行業'],
    availableFrom: 'P1',
  },
  {
    id: 'attr.kind',
    version: 1,
    label: L('種別', 'Type'),
    category: 'attr',
    type: 'enum',
    source: { kind: 'attr', key: 'kind' },
    operators: ['in', 'notin'],
    choices: KIND_CHOICES,
    default: ['stock'],
    availableFrom: 'P1',
  },
  {
    id: 'user.favorite',
    version: 1,
    label: L('お気に入り', 'Favorite'),
    category: 'user',
    type: 'bool',
    source: { kind: 'user', key: 'favorite' },
    operators: ['='],
    default: true,
    availableFrom: 'P1',
  },
  {
    id: 'user.watchlist',
    version: 1,
    label: L('ウォッチリスト', 'Watchlist'),
    category: 'user',
    type: 'enum',
    source: { kind: 'user', key: 'watchlist' },
    operators: ['in', 'notin'],
    default: [],
    availableFrom: 'P1',
  },
]

// 保有に基づく指標（P3、FR-H4）。登録表に足すだけで条件エディタ・列に出せるよう、形だけ予約しておく（FR-H2）
FIELDS.push({
  id: 'holding.pnlPct',
  version: 1,
  label: L('損益率', 'P/L %'),
  category: 'holding',
  type: 'percent',
  source: { kind: 'compute', key: 'pnlPct' },
  operators: ['<=', '>='],
  default: -10,
  requires: ['holdings'],
  availableFrom: 'P3',
})

export const FIELD_BY_ID = new Map(FIELDS.map((f) => [f.id, f]))

/** 今の版で使える指標か（P3 の予約は出さない） */
export const usable = (f: FieldDef | undefined): f is FieldDef => !!f && f.availableFrom !== 'P3'

/** 比べる相手にできる指標（相対条件 FR-SC5。例: 終値 ≥ 75日移動平均）: 同じ単位の市場データの指標 */
export function refFields(f: FieldDef): FieldDef[] {
  if (f.source.kind !== 'metrics' || f.type === 'enum') return []
  return FIELDS.filter((g) => usable(g) && g.id !== f.id && g.source.kind === 'metrics' && g.type === f.type)
}

/**
 * 指標の定義を変えたときの、保存した条件の移行（FR-FD5）。キーは「指標の ID@移行前の版」。
 * 移行できない条件は null を返し、FR-SC11 のとおり無効として残す。今は移行なし（すべて版 1）
 */
export type CondMigration = (c: Condition) => Condition | null
export const FIELD_MIGRATIONS: Record<string, CondMigration> = {}

/** 保存した条件を今の版にそろえる（版の無い条件は版 1 とみなす）。移行できなかった条件のインデックスを failed に返す */
export function migrateConditions(
  conds: Condition[],
  byId: Map<string, FieldDef> = FIELD_BY_ID,
  migrations: Record<string, CondMigration> = FIELD_MIGRATIONS,
): { conditions: Condition[]; failed: number[] } {
  const failed: number[] = []
  const conditions = conds.map((c, i) => {
    let cur = c
    for (let guard = 0; guard < 20; guard++) {
      const f = byId.get(cur.field)
      const v = cur.v ?? 1
      if (!f || v >= f.version) break
      const m = migrations[`${cur.field}@${v}`]
      const next = m ? m(cur) : null
      if (!next) {
        failed.push(i)
        return c
      }
      cur = { ...next, v: next.field === cur.field ? v + 1 : (next.v ?? 1) }
    }
    return cur
  })
  return { conditions, failed }
}

/** metrics 表の列（core の計算と migration が揃っているかを単体テストで確かめる。FR-FD4） */
export const METRIC_COLUMNS = [
  'close',
  'chg',
  'chgPct',
  'yieldTrailing',
  'div12',
  'per',
  'pbr',
  'eps',
  'bps',
  'marketCap',
  'turnover20',
  'hi52',
  'lo52',
  'fromHi52',
  'maDev25',
  'maDev75',
  'ret1m',
  'ret3m',
  'ret1y',
  'ret3y',
  'rsi14',
  'volRatio',
  'ma25',
  'ma75',
  'ma200',
  'payout',
  'divUpYears',
  'divNoCutYears',
  'gcDays',
  'dcDays',
  'yield2p',
] as const
export type MetricColumn = (typeof METRIC_COLUMNS)[number]
