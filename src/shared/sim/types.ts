// 配当シミュレータ（docs/design-simulator.md）の設定と結果の型。Core（sim.run）と画面が共有する。
import { DIVIDEND_TAX } from '../folio'
import type { InstrumentId, JstDate } from '../types'
import type { Band } from './forecast'
import type { Luck } from './peers'

/** 税: 税引前 ／ 20.315% ／ 非課税（計算は税引前と同じで、名前と前提の文だけ違う。§5.1） */
export type SimTax = 'gross' | 'taxed' | 'nisa'
/** 同業種の粒度（33 業種。足りなければ 17 業種へ切り替える ／ 17 業種） */
export type SimSector = 's33' | 's17'
/** これからの試算の方式（横ばい ／ 伸びを見込む ／ 直線トレンド試算（参考）。§5.2） */
export type SimMethod = 'flat' | 'growth' | 'trend'
export const SIM_METHODS: SimMethod[] = ['flat', 'growth', 'trend']
export const SIM_YEARS = [1, 3, 5, 10] as const
export const SIM_HORIZONS = [5, 10, 20, 30] as const
export type SimYears = (typeof SIM_YEARS)[number]
export type SimHorizon = (typeof SIM_HORIZONS)[number]
/** 計算する銘柄数の上限（出どころの表示順の先頭から。§8） */
export const SIM_LIMIT = 200

/** 配分（均等の金額 ／ 利回りに比例。P2） */
export type SimWeight = 'equal' | 'yield'
/** 計算の入力になる設定（変えたら計算し直す。§7.6） */
export interface SimSettings {
  years: SimYears
  /** 基準日を日付で指定（null なら years 年前） */
  from: JstDate | null
  /** 積立（毎月末に足す額・円。0 は一括） */
  monthly: number
  weight: SimWeight
  /** 元本（円） */
  amount: number
  reinvest: boolean
  tax: SimTax
  sector: SimSector
  horizon: SimHorizon
  method: SimMethod
}
export const DEFAULT_SIM: SimSettings = {
  years: 3,
  amount: 3_000_000,
  reinvest: false,
  tax: 'taxed',
  sector: 's33',
  horizon: 20,
  method: 'flat',
  from: null,
  monthly: 0,
  weight: 'equal',
}
export const netRate = (tax: SimTax): number => (tax === 'taxed' ? 1 - DIVIDEND_TAX : 1)

/** 過去の段から外した理由（基準日に価格が無い ／ 配当の記録が基準日より後から ／ 上場廃止（これからの段にも入れない）） */
export type SimExcludeReason = 'noPrice' | 'noDivRecord' | 'delisted'

export interface SimPastRow {
  id: InstrumentId
  /** 取得単価（基準日の終値。分割調整済み） */
  buy: number
  /** 買った株数（端株を認める）と、再投資を含む今の株数 */
  shares0: number
  shares: number
  /** 今の評価額 */
  value: number
  /** 含み損益（キャピタル）= 評価額 + 受け取った配当 − 元本 − 受け取った配当（インカム）の残り */
  gain: number
  /** 受け取った配当（税は設定どおり。再投資のときは再投資の前の額） */
  received: number
  /** トータルリターン（比） */
  totalPct: number
  /** 群への寄与（円。今の価値 − 入れた金額） */
  contrib: number
  /** 同業種の中の順位（自分を入れて k/n）。比べられないときは null */
  rank: { k: number; n: number; s17: boolean } | null
  /** 取得利回り（直近 1 年の 1 株配当 ÷ 取得単価） */
  yoc: number
  /** 期間の中の減配の回数 */
  cuts: number
  /** 基準日が日足の範囲より前（月末の終値で買った） */
  monthly: boolean
}

export interface SimPast {
  base: JstDate
  /** 基準日が日足の範囲より前の銘柄がある（月次の精度） */
  monthly: boolean
  /** 日足の範囲の始まり（最大下落率を測った範囲） */
  dailyFrom: JstDate | null
  principal: number
  /** 推移の点ごとの入れた元本（積立のとき階段。一括なら一定） */
  principalPath: number[]
  /** 推移の点の日付（基準日・月末ごと・今日） */
  dates: JstDate[]
  /** 今の価値（評価額 + 受け取った配当（再投資しないとき）） */
  port: number[]
  value: number[]
  /** 受け取った配当の累計 */
  received: number[]
  etf: number[] | null
  peer: number[] | null
  etfPct: number | null
  peerPct: number | null
  /** 全銘柄の均等の群（選んだ銘柄の市場区分。§4.3）の推移とトータルリターン */
  allEq: number[] | null
  allEqPct: number | null
  /** 超過分の分解（§4.3）: TOPIX 連動 ETF → 規模（全銘柄の均等 − TOPIX）→ 業種の配分（同業種 − 全銘柄の均等）→ 銘柄選び（選んだ群 − 同業種。参考）。足すと選んだ群 */
  decomp: { etf: number; size: number; sector: number; pick: number } | null
  /** 偶然との比較（§4.4） */
  luck: Luck | null
  /** 当時の条件で選び直した（過去の銘柄は基準日の値で条件を当て直した結果）。ignored は使えなかった条件の指標 */
  rescreen: { count: number; ignored: string[] } | null
  hero: {
    wealth: number
    value: number
    received: number
    gain: number
    totalPct: number
    /** 入れた元本の合計（積立を含む） */
    invested: number
    /** 年率（「N 年前」は N 年で、日付の指定は実際の年数で数える。1 年に満たない・積立では null） */
    annual: number | null
    yoc: number
    /** 直近 1 年に受け取った配当 ÷ 元本 */
    yieldOnPrincipal: number
    /** 日足の範囲の中の最大下落率（配当込み） */
    maxDD: number
  }
  /** 年ごとの受け取った配当（extra は再投資で増えた株の分）。partial は基準日の年と今年 */
  years: { year: number; received: number; extra: number; partial: boolean }[]
  rows: SimPastRow[]
  /** 同業種と比べた銘柄の数・17 業種で比べた数 */
  peerInfo: { compared: number; total: number; s17: number }
}

export interface SimFwdRow {
  id: InstrumentId
  price: number
  shares: number
  /** 1 年の 1 株配当（直近 N 回の合計。J-REIT は回ごとの中央値 × 回数） */
  d0: number
  /** 記録の年数（直近 N 回で区切った年の数） */
  years: number
  /** 5 年の 1 株配当の伸び（年率 %。値が足りなければ null） */
  growth5: number | null
  /** 1 年目の配当（税は設定どおり。伸びを見込むときは 1 年目の伸びを含む） */
  y1: number
  /** 試算に使った伸び（年率の対数。業種の値に寄せ、打ち切ったあと。横ばい・期間不足は 0） */
  g: number
  /** ストレスの年の前年比と、その出どころ（実績 ／ 17 業種の中央値 ／ 市場全体の中央値） */
  r: number
  rSrc: 'own' | 's17' | 'market' | 'none'
  /** 直近 1 年の権利落ちの月（1〜12） */
  exMonths: number[]
  /** 月ごとの配当（権利確定月。0 が 1 月） */
  months: number[]
  /** 記録が 4 年に満たない・無配（伸びを見込まない） */
  short: boolean
}

export interface SimFwd {
  /** 元本（保有のときは今の評価額） */
  amount: number
  /** 保有の株数と口座ごとの税で計算した（設計 §23） */
  held: boolean
  rows: SimFwdRow[]
  /** 1 年目の配当の合計と、元本に対する利回り（合計が 0 なら null） */
  y1: number
  yieldOnPrincipal: number | null
  /** 試算の期間の累計（選んだ方式） */
  cum: number
  stress: { year: number; ratio: number } | null
  stressY1: number
  /** 選んだ方式の累計が元本（保有のときは評価額）に届く年（200 年までに届かなければ null） */
  paybackYears: number | null
  /** ストレスの 1 年目 ÷ 横ばいの 1 年目 − 1（横ばいが 0 なら null） */
  stressDiff: number | null
  /** 年ごと（1 年目から）: value は選んだ方式の配当、stress はストレス、cum は value の累計 */
  years: { year: number; value: number; stress: number; cum: number }[]
  /** 月ごとの配当の合計（権利確定月。0 が 1 月） */
  months: number[]
  /** 帯（10・50・90%。年ごとと累計。引ける年が無ければ null） */
  band: Band | null
}

export interface SimResult {
  asOf: JstDate
  /** 過去の段の基準日（過去が null でも出す） */
  base: JstDate
  settings: SimSettings
  /** 計算した銘柄（上限で切ったあと）と、出どころの全体の数 */
  ids: InstrumentId[]
  total: number
  excluded: { id: InstrumentId; reason: SimExcludeReason }[]
  /** 今日の終値が無い銘柄（最後の終値の日） */
  stale: { id: InstrumentId; d: JstDate }[]
  past: SimPast | null
  fwd: SimFwd
  /** J-REIT の割合（銘柄数で） */
  reitShare: number
  /** TOPIX 連動 ETF を比べられなかった（基準日に価格が無いなど） */
  etfMissing: boolean
  /** データの誤りと見られる値を飛ばした銘柄（選んだ銘柄と TOPIX 連動 ETF）の数と点の数。無ければ null */
  glitch: { stocks: number; points: number } | null
}
