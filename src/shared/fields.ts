// 指標の登録表（§5.3 FR-FD1〜FD5）。画面（条件エディタ・列・並べ替え）はすべてここから作る。
// 指標を足すときは、ここに 1 項目を足し、metrics 由来なら core の metrics 計算と列を足す（FR-FD2）。
import type { Condition, CondOp, LocalizedName } from './types'

export type FieldCategory = 'price' | 'value' | 'income' | 'technical' | 'return' | 'attr' | 'user' | 'holding'
export type FieldType = 'number' | 'percent' | 'money' | 'ratio' | 'bool' | 'enum'
/** 条件を選ぶダイアログの分類（表示用。docs/mock/fields.html） */
export type FieldGroup = 'attr' | 'income' | 'value' | 'price' | 'level' | 'event' | 'tech' | 'risk' | 'ret' | 'mine'
/** 相対条件の相手にできるまとまり（同じまとまりの中だけで比べる。終値 ≥ 時価総額 のような比べ方を作らない） */
export type RefGroup = 'px' | 'ret' | 'dev' | 'yield'

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
    | { kind: 'user'; key: 'favorite' | 'watchlist' | 'held' }
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
  /** 条件を選ぶダイアログの分類（下の GROUP_OF で全部に付ける） */
  group?: FieldGroup
  /** 表示の単位（ダイアログ。無ければ種類から） */
  unit?: LocalizedName
  /** 検索の別名（例: MA・GC・配当利回り） */
  alias?: string
  /** 相対条件の相手にできるまとまり */
  refGroup?: RefGroup
  /** 一覧で符号を付けて上げ下げの色を付ける */
  signed?: boolean
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
  num('income.yield2p', '利回り(直近2期の年換算)', 'Yield (last 2 periods)', 'income', 'percent', 'yield2p', {
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
  num('tech.gcDays', 'ゴールデンクロスから', 'Days since golden cross', 'technical', 'number', 'gcDays', {
    description: L(
      '25 日線が 75 日線を上に抜けてからの取引日数（直近 1 年）',
      'Trading days since the 25D MA crossed above the 75D MA (past year)',
    ),
    operators: ['<=', '>='],
    default: 10,
    step: 5,
    availableFrom: 'P2',
  }),
  num('tech.dcDays', 'デッドクロスから', 'Days since dead cross', 'technical', 'number', 'dcDays', {
    description: L(
      '25 日線が 75 日線を下に抜けてからの取引日数（直近 1 年）',
      'Trading days since the 25D MA crossed below the 75D MA (past year)',
    ),
    operators: ['<=', '>='],
    default: 10,
    step: 5,
    availableFrom: 'P2',
  }),
  // ---- 条件を選ぶダイアログの見直しで足した指標（P3。docs/mock/fields.html）
  num('value.roe', 'ROE(実績・近似)', 'ROE (trailing, approx.)', 'value', 'percent', 'roe', {
    description: L(
      'EPS ÷ BPS（期末の BPS で割る近似。どちらも Yahoo の実績）。EPS・BPS が 0 以下、REIT・ETF は欠損',
      'EPS ÷ BPS (approximation with period-end BPS). Missing when EPS or BPS ≤ 0, and for REITs and ETFs',
    ),
    default: 8,
    digits: 1,
    requires: ['fundamentals'],
  }),
  num('value.eps', 'EPS', 'EPS', 'price', 'money', 'eps', {
    description: L(
      '1 株あたり利益（Yahoo の実績）。円の絶対値で、主に一覧の列に',
      'Earnings per share (Yahoo trailing), mainly as a column',
    ),
    default: 100,
    step: 10,
    requires: ['fundamentals'],
  }),
  num('value.bps', 'BPS', 'BPS', 'price', 'money', 'bps', {
    description: L('1 株あたり純資産（Yahoo の実績）。円の絶対値で、主に一覧の列に', 'Book value per share (Yahoo), mainly as a column'),
    default: 1000,
    step: 100,
    requires: ['fundamentals'],
  }),
  num('income.div12', '1株配当・分配金', 'Dividend per share', 'price', 'money', 'div12', {
    description: L('過去 12 か月の配当・分配金の合計（円の絶対値。主に一覧の列に）', 'Dividends in the past 12 months, mainly as a column'),
    default: 50,
    step: 5,
    requires: ['dividends'],
  }),
  num('income.divYoy', '増減配率(前年比)', 'Dividend change (YoY)', 'income', 'percent', 'divYoy', {
    description: L(
      '年途中を除いた最新の年の配当合計の前年比。直近の減配が分かる',
      'YoY change of the latest full-year dividend total (shows recent cuts)',
    ),
    default: 0,
    digits: 1,
    requires: ['dividends'],
  }),
  num('income.divCagr5', '5年の増配率', '5-year dividend growth', 'income', 'percent', 'divCagr5', {
    description: L(
      '年途中を除いた最新の年と 5 年前の年の配当合計から求めた年率',
      'Annual rate from the latest full year and the year five years before',
    ),
    default: 3,
    digits: 1,
    requires: ['dividends'],
  }),
  num('price.minInvest', '最低投資金額', 'Minimum investment', 'value', 'money', 'minInvest', {
    description: L(
      '終値 × 売買単位（株式は 100 株、REIT は 1 口）。ETF・ETN・その他は単位が分からないので欠損',
      'Last × trading unit (100 shares for stocks, 1 unit for REITs). Missing for ETFs and others (unit unknown)',
    ),
    operators: ['<=', '>='],
    default: 200000,
    step: 10000,
  }),
  num('tech.fromLo52', '52週安値から', 'From 52W low', 'technical', 'percent', 'fromLo52', {
    description: L('終値 ÷ 52 週安値 − 1（安値からどれだけ戻したか）', 'Last ÷ 52-week low − 1'),
    default: 10,
    digits: 1,
    step: 1,
  }),
  num('tech.ytdFromHi', '年初来高値から', 'From YTD high', 'technical', 'percent', 'ytdFromHi', {
    description: L(
      '終値 ÷ 年初来の高値 − 1。1〜3 月は昨年来（前年 1 月から）',
      'Last ÷ year-to-date high − 1 (from last January in Jan–Mar)',
    ),
    default: -5,
    digits: 1,
    step: 1,
  }),
  num('tech.ytdFromLo', '年初来安値から', 'From YTD low', 'technical', 'percent', 'ytdFromLo', {
    description: L(
      '終値 ÷ 年初来の安値 − 1。1〜3 月は昨年来（前年 1 月から）',
      'Last ÷ year-to-date low − 1 (from last January in Jan–Mar)',
    ),
    default: 10,
    digits: 1,
    step: 1,
  }),
  num('tech.maDev200', '200日線乖離', 'vs 200D MA', 'technical', 'percent', 'maDev200', {
    description: L('終値 ÷ 200 日移動平均 − 1（長期の傾向からの離れ）', 'Last ÷ 200-day moving average − 1'),
    default: 0,
    digits: 1,
    step: 1,
  }),
  num('risk.vol60', 'ボラティリティ(年率)', 'Volatility (annualized)', 'value', 'percent', 'vol60', {
    description: L('日々の騰落率の標準偏差（60 取引日）× √245。61 本未満は欠損', 'Std. dev. of daily returns over 60 trading days × √245'),
    operators: ['<=', '>='],
    default: 30,
    digits: 1,
    step: 5,
  }),
  num('risk.beta', 'ベータ(対日経平均)', 'Beta (vs Nikkei 225)', 'value', 'ratio', 'beta1y', {
    description: L(
      '日経平均と日付で突き合わせた 1 年の日次の騰落率から。120 日未満は欠損。薄商いの銘柄は低く出やすい',
      'From one year of daily returns matched by date with the Nikkei 225. Missing under 120 days',
    ),
    operators: ['<=', '>='],
    default: 1,
    step: 0.1,
  }),
  num('risk.mdd3y', '最大下落率(3年)', 'Max drawdown (3Y)', 'return', 'percent', 'mdd3y', {
    description: L('3 年の中で高値からいちばん下げた割合（配当込み）', 'Largest fall from a high within three years (total return)'),
    operators: ['>=', '<='],
    default: -30,
    digits: 1,
    step: 5,
  }),
  num('ret.6m', '6か月騰落率', '6M return', 'return', 'percent', 'ret6m', {
    description: L('123 取引日前の終値から', 'From the close 123 trading days ago'),
    digits: 1,
    default: 0,
  }),
  num('ret.ytd', '年初来騰落率', 'YTD return', 'return', 'percent', 'retYtd', {
    description: L('前年最後の終値から', 'From the last close of the previous year'),
    digits: 1,
    default: 0,
  }),
  num('ret.tr1y', '1年騰落率(配当込み)', '1Y total return', 'return', 'percent', 'tr1y', {
    description: L(
      '配当で下がった分を戻した騰落率（チャートの「配当込み」と同じ）',
      "Return with dividends added back (same as the chart's total return)",
    ),
    digits: 1,
    default: 0,
    step: 5,
  }),
  num('ret.tr3y', '3年騰落率(配当込み)', '3Y total return', 'return', 'percent', 'tr3y', {
    description: L('配当で下がった分を戻した 3 年の騰落率', 'Three-year return with dividends added back'),
    digits: 1,
    default: 0,
    step: 5,
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
    label: L('業種(33業種)', 'Sector (TSE 33)'),
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
  {
    id: 'user.held',
    version: 1,
    label: L('保有', 'Held'),
    description: L('保有タブに記録した銘柄（どの口座区分でも）', 'Symbols recorded in the Holdings tab (any account)'),
    category: 'user',
    type: 'bool',
    source: { kind: 'user', key: 'held' },
    operators: ['='],
    default: true,
    requires: ['holdings'],
    availableFrom: 'P2',
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
  description: L(
    '保有の評価損益率（最新の終値 ÷ 平均取得単価 − 1。口座区分をまたいで合計）',
    'Holding P/L % (latest close ÷ average cost − 1, across accounts)',
  ),
  availableFrom: 'P2',
})

// 予定（日付から今日までの日数）と保有に基づく指標。スクリーナーが実行時に計算する（metrics の列に日数を持つと、更新しない日に古くなる）
const compute = (
  id: string,
  ja: string,
  en: string,
  key: string,
  unit: 'days' | 'percent',
  desc: LocalizedName,
  o: Partial<FieldDef> = {},
): FieldDef => ({
  id,
  version: 1,
  label: L(ja, en),
  description: desc,
  category: unit === 'days' ? 'value' : 'holding',
  type: unit === 'days' ? 'number' : 'percent',
  source: { kind: 'compute', key },
  operators: ['<=', '>='],
  default: unit === 'days' ? 30 : 3,
  step: unit === 'days' ? 5 : 1,
  digits: unit === 'days' ? 0 : 1,
  availableFrom: 'P2',
  ...o,
})
FIELDS.push(
  compute(
    'event.earningsDays',
    '決算発表まで',
    'Days to earnings',
    'earningsDays',
    'days',
    L(
      '次の決算発表（Yahoo の予定・推定）までの暦日数。過ぎた予定・予定の無い銘柄は欠損',
      'Calendar days to the next earnings date (Yahoo schedule or estimate). Missing when none',
    ),
    { requires: ['fundamentals'] },
  ),
  compute(
    'event.rightsDays',
    '権利付最終日まで',
    'Days to last cum-rights day',
    'rightsDays',
    'days',
    L(
      '次の権利付最終日（過去の権利落ち日から推定した権利確定日の 2 営業日前）までの暦日数',
      'Calendar days to the next last cum-rights day (estimated from past ex-dates)',
    ),
    { requires: ['dividends'] },
  ),
  compute(
    'holding.weight',
    '保有割合',
    'Holding weight',
    'weight',
    'percent',
    L(
      '保有全体の評価額に占める割合。保有していない銘柄は 0%（「≤ 3%」では未保有の銘柄もすべて通る）',
      'Share of the total holdings value. 0% when not held (so "≤ 3%" includes every unheld symbol)',
    ),
    { requires: ['holdings'], operators: ['<=', '>='] },
  ),
  compute(
    'holding.sectorWeight',
    '業種の保有割合',
    'Sector holding weight',
    'sectorWeight',
    'percent',
    L(
      'その銘柄の業種（J-REIT はまとめて）が保有全体の評価額に占める割合。分散のため、手薄な業種の銘柄を探す',
      "Share of the symbol's sector in the total holdings value (to find under-weighted sectors)",
    ),
    { requires: ['holdings'], default: 10 },
  ),
  compute(
    'holding.yoc',
    '取得利回り',
    'Yield on cost',
    'yoc',
    'percent',
    L('過去 12 か月の配当 ÷ 平均取得単価。保有していない銘柄は欠損', 'Past 12 months of dividends ÷ average cost. Missing when not held'),
    { requires: ['holdings', 'dividends'], operators: ['>=', '<='], default: 4 },
  ),
)

/** 分類・単位・別名・相対条件のまとまり・符号（条件を選ぶダイアログと一覧の表示。docs/mock/fields.html） */
const GROUP_OF: Record<string, FieldGroup> = {
  'attr.market': 'attr',
  'attr.sector': 'attr',
  'attr.kind': 'attr',
  'income.yield': 'income',
  'income.yield2p': 'income',
  'income.payout': 'income',
  'income.divUpYears': 'income',
  'income.divNoCutYears': 'income',
  'income.divYoy': 'income',
  'income.divCagr5': 'income',
  'income.recordMonth': 'income',
  'income.div12': 'income',
  'value.per': 'value',
  'value.pbr': 'value',
  'value.roe': 'value',
  'value.eps': 'value',
  'value.bps': 'value',
  'price.close': 'price',
  'price.chgPct': 'price',
  'value.marketCap': 'price',
  'liq.turnover20': 'price',
  'price.minInvest': 'price',
  'price.ma25': 'level',
  'price.ma75': 'level',
  'price.ma200': 'level',
  'price.hi52': 'level',
  'price.lo52': 'level',
  'event.earningsDays': 'event',
  'event.rightsDays': 'event',
  'tech.fromHi52': 'tech',
  'tech.fromLo52': 'tech',
  'tech.ytdFromHi': 'tech',
  'tech.ytdFromLo': 'tech',
  'tech.maDev25': 'tech',
  'tech.maDev75': 'tech',
  'tech.maDev200': 'tech',
  'tech.rsi14': 'tech',
  'tech.volRatio': 'tech',
  'tech.gcDays': 'tech',
  'tech.dcDays': 'tech',
  'risk.vol60': 'risk',
  'risk.beta': 'risk',
  'risk.mdd3y': 'risk',
  'ret.1m': 'ret',
  'ret.3m': 'ret',
  'ret.6m': 'ret',
  'ret.1y': 'ret',
  'ret.3y': 'ret',
  'ret.ytd': 'ret',
  'ret.tr1y': 'ret',
  'ret.tr3y': 'ret',
  'user.favorite': 'mine',
  'user.watchlist': 'mine',
  'user.held': 'mine',
  'holding.pnlPct': 'mine',
  'holding.weight': 'mine',
  'holding.sectorWeight': 'mine',
  'holding.yoc': 'mine',
}
const REF_OF: Record<string, RefGroup> = {
  'price.close': 'px',
  'price.ma25': 'px',
  'price.ma75': 'px',
  'price.ma200': 'px',
  'price.hi52': 'px',
  'price.lo52': 'px',
  'ret.1m': 'ret',
  'ret.3m': 'ret',
  'ret.6m': 'ret',
  'ret.1y': 'ret',
  'ret.3y': 'ret',
  'ret.ytd': 'ret',
  'ret.tr1y': 'ret',
  'ret.tr3y': 'ret',
  'tech.maDev25': 'dev',
  'tech.maDev75': 'dev',
  'tech.maDev200': 'dev',
  'income.yield': 'yield',
  'income.yield2p': 'yield',
}
const UNIT_OF: Record<string, LocalizedName> = {
  'price.close': L('円', 'JPY'),
  'price.ma25': L('円', 'JPY'),
  'price.ma75': L('円', 'JPY'),
  'price.ma200': L('円', 'JPY'),
  'price.hi52': L('円', 'JPY'),
  'price.lo52': L('円', 'JPY'),
  'value.eps': L('円', 'JPY'),
  'value.bps': L('円', 'JPY'),
  'income.div12': L('円', 'JPY'),
  'value.marketCap': L('億円', '¥100M'),
  'liq.turnover20': L('億円', '¥100M'),
  'price.minInvest': L('万円', '¥10k'),
  'value.per': L('倍', 'x'),
  'value.pbr': L('倍', 'x'),
  'tech.volRatio': L('倍', 'x'),
  'income.divUpYears': L('年', 'y'),
  'income.divNoCutYears': L('年', 'y'),
  'income.divCagr5': L('%/年', '%/y'),
  'income.recordMonth': L('月', 'month'),
  'tech.gcDays': L('取引日', 'trading days'),
  'tech.dcDays': L('取引日', 'trading days'),
  'event.earningsDays': L('日', 'days'),
  'event.rightsDays': L('日', 'days'),
}
const ALIAS_OF: Record<string, string> = {
  'income.yield': '配当利回り yield',
  'income.yield2p': '配当利回り yield',
  'income.divYoy': '減配 増配',
  'income.divCagr5': '増配',
  'tech.maDev25': 'MA 移動平均',
  'tech.maDev75': 'MA 移動平均',
  'tech.maDev200': 'MA 移動平均',
  'price.ma25': 'MA',
  'price.ma75': 'MA',
  'price.ma200': 'MA',
  'tech.gcDays': 'GC ゴールデンクロス',
  'tech.dcDays': 'DC デッドクロス',
  'tech.ytdFromHi': '昨年来',
  'tech.ytdFromLo': '昨年来',
  'ret.tr1y': 'トータルリターン',
  'ret.tr3y': 'トータルリターン',
  'holding.sectorWeight': '分散',
  'holding.weight': '分散',
  'liq.turnover20': '出来高',
  'value.marketCap': '時価',
}
const SIGNED = new Set(['price.chgPct', 'income.divYoy', 'income.divCagr5', 'risk.mdd3y'])
/** 説明の無い既存の指標に説明を足す（ダイアログの下の段と ⓘ に出す） */
const DESC_OF: Record<string, LocalizedName> = {
  'price.close': L('最新の終値（分割調整済み）', 'Latest close (split-adjusted)'),
  'price.chgPct': L('前日の終値からの騰落率', 'Change from the previous close'),
  'value.marketCap': L('終値 × 発行済株式数（Yahoo）', 'Last × shares outstanding (Yahoo)'),
  'value.per': L('終値 ÷ EPS（Yahoo の実績 EPS）', 'Last ÷ EPS (Yahoo trailing)'),
  'tech.fromHi52': L('終値 ÷ 52 週高値 − 1', 'Last ÷ 52-week high − 1'),
  'tech.maDev25': L('終値 ÷ 25 日移動平均 − 1', 'Last ÷ 25-day MA − 1'),
  'tech.maDev75': L('終値 ÷ 75 日移動平均 − 1', 'Last ÷ 75-day MA − 1'),
  'tech.rsi14': L('14 日の RSI（Wilder の平滑化）', '14-day RSI (Wilder smoothing)'),
  'tech.volRatio': L('最新の出来高 ÷ 直近 20 日の平均', 'Latest volume ÷ 20-day average'),
  'ret.1m': L('21 取引日前の終値から', 'From the close 21 trading days ago'),
  'ret.3m': L('63 取引日前の終値から', 'From the close 63 trading days ago'),
  'ret.1y': L('245 取引日前の終値から', 'From the close 245 trading days ago'),
  'ret.3y': L('735 取引日前の終値から', 'From the close 735 trading days ago'),
  'price.ma25': L(
    '終値の 25 取引日の平均。主に相対条件の相手（終値 ≥ 25 日移動平均）',
    '25-day average of closes (mainly as a relative target)',
  ),
  'price.ma75': L('終値の 75 取引日の平均', '75-day average of closes'),
  'price.ma200': L('終値の 200 取引日の平均', '200-day average of closes'),
  'price.hi52': L('直近 245 取引日の高値', 'High of the past 245 trading days'),
  'price.lo52': L('直近 245 取引日の安値', 'Low of the past 245 trading days'),
  'attr.market': L('プライム・スタンダード・グロース・REIT・ETF', 'Prime, Standard, Growth, REIT, ETF'),
  'attr.kind': L('株式・J-REIT・ETF・優先株など', 'Stock, J-REIT, ETF, preferred and others'),
  'user.favorite': L('★を付けた銘柄', 'Symbols marked with ★'),
  'user.watchlist': L('選んだウォッチリストにある銘柄', 'Symbols in the chosen watchlists'),
}
for (const f of FIELDS) {
  f.group = GROUP_OF[f.id]
  if (UNIT_OF[f.id]) f.unit = UNIT_OF[f.id]
  if (ALIAS_OF[f.id]) f.alias = ALIAS_OF[f.id]
  if (REF_OF[f.id]) f.refGroup = REF_OF[f.id]
  if (SIGNED.has(f.id) || f.category === 'return' || f.category === 'technical') f.signed = f.type === 'percent'
  if (!f.description && DESC_OF[f.id]) f.description = DESC_OF[f.id]
}

/** 条件を選ぶダイアログの分類（並ぶ順と段。段は幅で 4 → 2 → 1 になっても動かない） */
export const FIELD_GROUPS: { id: FieldGroup; label: LocalizedName; col: number }[] = [
  { id: 'attr', label: L('銘柄の属性', 'Attributes'), col: 0 },
  { id: 'income', label: L('配当', 'Dividends'), col: 0 },
  { id: 'value', label: L('割安・財務', 'Valuation'), col: 1 },
  { id: 'price', label: L('価格・規模', 'Price & size'), col: 1 },
  { id: 'level', label: L('価格の水準', 'Price levels'), col: 1 },
  { id: 'tech', label: L('テクニカル', 'Technical'), col: 2 },
  { id: 'risk', label: L('リスク', 'Risk'), col: 2 },
  { id: 'event', label: L('予定', 'Schedule'), col: 2 },
  { id: 'ret', label: L('騰落率', 'Returns'), col: 3 },
  { id: 'mine', label: L('リスト・保有', 'Lists & holdings'), col: 3 },
]

/** 条件を選ぶダイアログの見直しで足した指標（「新」の札。使ったら消す） */
export const NEW_FIELD_IDS = new Set([
  'value.roe',
  'value.eps',
  'value.bps',
  'income.div12',
  'income.divYoy',
  'income.divCagr5',
  'price.minInvest',
  'tech.fromLo52',
  'tech.ytdFromHi',
  'tech.ytdFromLo',
  'tech.maDev200',
  'risk.vol60',
  'risk.beta',
  'risk.mdd3y',
  'ret.6m',
  'ret.ytd',
  'ret.tr1y',
  'ret.tr3y',
  'event.earningsDays',
  'event.rightsDays',
  'holding.weight',
  'holding.sectorWeight',
  'holding.yoc',
])
/** 条件を選ぶダイアログの「よく使う」の既定（まだ足したことが無いとき） */
export const DEFAULT_RECENT_FIELDS = ['income.yield', 'value.per', 'liq.turnover20', 'attr.market', 'income.divUpYears', 'tech.maDev25']
/** データが無くて持たない項目（条件を選ぶダイアログの検索が 0 件のとき、理由を出す） */
export const MISSING_FIELDS: { label: LocalizedName; why: LocalizedName; words: string }[] = [
  {
    label: L('売上高・営業利益・自己資本比率', 'Sales, operating profit, equity ratio'),
    why: L('財務諸表は取っていない（Yahoo の一括気配は EPS・BPS まで）', 'Financial statements are not fetched (only EPS and BPS)'),
    words: '売上 営業利益 経常 自己資本 負債 ROA PSR EV sales profit equity',
  },
  {
    label: L('予想 PER・予想配当', 'Forecast P/E and dividends'),
    why: L('予想の値は取っていない（実績だけ）', 'Forecasts are not fetched (trailing only)'),
    words: '予想 コンセンサス PEG forecast',
  },
  {
    label: L('信用残・信用倍率・貸借', 'Margin balances'),
    why: L('Yahoo にも JPX の銘柄一覧にも無い', 'Not in Yahoo or the JPX list'),
    words: '信用 貸借 空売り margin short',
  },
  { label: L('株主優待', 'Shareholder perks'), why: L('取り先が無い', 'No data source'), words: '優待 perk' },
  {
    label: L('上場日・決算月', 'Listing date, fiscal month'),
    why: L('JPX の銘柄一覧に無い（決算発表の予定は「予定」にある）', 'Not in the JPX list (see Schedule for earnings dates)'),
    words: '上場 決算月 listing fiscal',
  },
  { label: L('信託報酬（ETF）', 'ETF expense ratio'), why: L('取り先が無い', 'No data source'), words: '信託報酬 expense' },
]

export const FIELD_BY_ID = new Map(FIELDS.map((f) => [f.id, f]))

/** 今の版で使える指標か（P3 の予約は出さない） */
export const usable = (f: FieldDef | undefined): f is FieldDef => !!f && f.availableFrom !== 'P3'

/**
 * 比べる相手にできる指標（相対条件 FR-SC5。例: 終値 ≥ 75日移動平均）: 同じまとまり（refGroup）の市場データの指標だけ。
 * 種類（金額・率）だけで選ぶと、終値 ≥ 時価総額 のような意味の無い比べ方ができてしまう
 */
/**
 * 金額の指標を打つときの単位: 1 株あたり（価格・EPS・BPS・1 株配当）は円、最低投資金額は万円、
 * それ以外（時価総額・売買代金）は億円。表示の単位（UNIT_OF）と合わせる
 */
export function moneyScale(f: Pick<FieldDef, 'id' | 'type' | 'unit'>): number {
  if (perShare(f)) return 1
  return f.id === 'price.minInvest' ? 1e4 : 1e8
}
/**
 * 打った値を数にする。単位の無い数は `scale`（表示の単位。金額なら moneyScale）を掛ける。「兆」「億」「万」が付いていれば
 * その倍率（「30万」「1.5億」）。円・%・桁区切り・空白は読み飛ばす。読めなければ null
 */
export function parseTyped(s: string, scale = 1): number | null {
  const t = s
    .normalize('NFKC')
    .replace(/[,円¥%\s]/g, '')
    .replace(/[−–]/g, '-')
  const m = /^(-?(?:\d+\.?\d*|\.\d+))(兆|億|万)?$/.exec(t)
  if (!m) return null
  const mul = m[2] === '兆' ? 1e12 : m[2] === '億' ? 1e8 : m[2] === '万' ? 1e4 : scale
  return Math.round(Number(m[1]) * mul * 1e6) / 1e6
}
/**
 * 1 株あたりの金額（終値・移動平均・52 週高値・EPS・BPS・1 株配当）か。円で表し、分割で換算する。売買代金は category が
 * 'price' でも 1 株あたりではない（億円。分割で変わらない）ので、単位で見分ける
 */
export function perShare(f: Pick<FieldDef, 'type' | 'unit'>): boolean {
  return f.type === 'money' && f.unit?.ja === '円'
}

export function refFields(f: FieldDef): FieldDef[] {
  if (f.source.kind !== 'metrics' || !f.refGroup) return []
  return FIELDS.filter((g) => usable(g) && g.id !== f.id && g.source.kind === 'metrics' && g.refGroup === f.refGroup)
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
  'roe',
  'divYoy',
  'divCagr5',
  'minInvest',
  'fromLo52',
  'ytdFromHi',
  'ytdFromLo',
  'maDev200',
  'vol60',
  'beta1y',
  'mdd3y',
  'ret6m',
  'retYtd',
  'tr1y',
  'tr3y',
  /** 次の決算発表・権利付最終日（1970-01-01 からの日数。スクリーナーが今日からの日数にする） */
  'earningsDay',
  'rightsDay',
  /** 権利確定日の日（0 = 月末、1〜31 = その日）。権利付最終日が過ぎたら実行時に次を出す */
  'recordDay',
] as const
export type MetricColumn = (typeof METRIC_COLUMNS)[number]
