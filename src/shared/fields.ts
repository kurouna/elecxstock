// 指標の登録表（§5.3 FR-FD1〜FD5）。画面（条件エディタ・列・並べ替え）はすべてここから作る。
// 指標を足すときは、ここに 1 項目を足し、metrics 由来なら core の metrics 計算と列を足す（FR-FD2）。
import type { CondOp, LocalizedName } from './types'

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

export const FIELD_BY_ID = new Map(FIELDS.map((f) => [f.id, f]))

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
] as const
export type MetricColumn = (typeof METRIC_COLUMNS)[number]
