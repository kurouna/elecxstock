// マーケット一覧の行（FR-U6, FR-MB1。設計: docs/design-market-board.md）。
// Yahoo で日足と気配の前日終値が取れると確かめた記号だけを置く（2026-11-16）。
// 海外の行（IDX:）は市場 'I'・種別 'index' で銘柄の表に入れ、表示だけに使う（スクリーナー・ヒートマップ・ランキングの対象外）。
// TOPIX・JPX日経400・グロース250・東証REIT指数は Yahoo で取れないため、連動 ETF（JP:）で代える。
import { addDays } from './calendar'
import type { InstrumentId, JstDate } from './types'

export type BoardGroup = 'jp' | 'us' | 'asia' | 'fx' | 'cmd' | 'crypto'
/** 区分のタブの並び（全ての次） */
export const BOARD_GROUPS: BoardGroup[] = ['jp', 'us', 'asia', 'fx', 'cmd', 'crypto']

export interface MarketRef {
  id: InstrumentId
  /** Yahoo の記号（instruments.yahoo にそのまま入れる） */
  yahoo: string
  group: BoardGroup
  /** 一覧の表示名。連動 ETF は「〇〇 連動ETF」（ETF の正式な名前は銘柄名から出す） */
  name: { ja: string; en: string }
  /** 価格の小数の桁。無ければ今の価格の表示のまま */
  digits?: number
}

const R = (id: string, yahoo: string, group: BoardGroup, ja: string, en: string, digits?: number): MarketRef => ({
  id,
  yahoo,
  group,
  name: { ja, en },
  ...(digits == null ? {} : { digits }),
})

export const MARKET_REFS: MarketRef[] = [
  R('IDX:N225', '^N225', 'jp', '日経平均', 'Nikkei 225', 2),
  R('JP:1306', '1306.T', 'jp', 'TOPIX 連動ETF', 'TOPIX (ETF)'),
  R('JP:1591', '1591.T', 'jp', 'JPX日経400 連動ETF', 'JPX-Nikkei 400 (ETF)'),
  R('JP:2516', '2516.T', 'jp', 'グロース250 連動ETF', 'Growth 250 (ETF)'),
  R('JP:1343', '1343.T', 'jp', '東証REIT 連動ETF', 'TSE REIT (ETF)'),
  R('IDX:NIY', 'NIY=F', 'jp', '日経平均先物（CME 円建て）', 'Nikkei 225 futures (CME, yen)', 0),
  R('IDX:DJI', '^DJI', 'us', 'NYダウ', 'Dow Jones', 2),
  R('IDX:GSPC', '^GSPC', 'us', 'S&P500', 'S&P 500', 2),
  R('IDX:IXIC', '^IXIC', 'us', 'NASDAQ総合', 'NASDAQ Composite', 2),
  R('IDX:SOX', '^SOX', 'us', 'SOX指数', 'PHLX Semiconductor', 2),
  R('IDX:VIX', '^VIX', 'us', 'VIX指数', 'VIX', 2),
  R('IDX:HSI', '^HSI', 'asia', '香港ハンセン', 'Hang Seng', 2),
  R('IDX:SSEC', '000001.SS', 'asia', '上海総合', 'SSE Composite', 2),
  R('IDX:USDJPY', 'JPY=X', 'fx', 'ドル/円', 'USD/JPY', 3),
  R('IDX:EURJPY', 'EURJPY=X', 'fx', 'ユーロ/円', 'EUR/JPY', 3),
  R('IDX:US10Y', '^TNX', 'fx', '米国債10年利回り', 'US 10Y yield', 3),
  R('IDX:CL', 'CL=F', 'cmd', '原油（WTI）', 'Crude oil (WTI)', 2),
  R('IDX:GC', 'GC=F', 'cmd', '金', 'Gold', 1),
  R('IDX:SI', 'SI=F', 'cmd', '銀', 'Silver', 3),
  R('IDX:BTCJPY', 'BTC-JPY', 'crypto', 'ビットコイン/円', 'Bitcoin/JPY', 0),
]
export const MARKET_REF_IDS: InstrumentId[] = MARKET_REFS.map((r) => r.id)
const BY_ID = new Map(MARKET_REFS.map((r) => [r.id, r]))
export const refOf = (id: InstrumentId): MarketRef | undefined => BY_ID.get(id)
/** 連動 ETF（東証の銘柄。取得の対象に足す） */
export const REF_ETF_IDS: InstrumentId[] = MARKET_REF_IDS.filter((id) => id.startsWith('JP:'))
/** 銘柄の表に入れる参照の行（IDX:。日経平均も含む） */
export const REF_INDEX_ROWS: MarketRef[] = MARKET_REFS.filter((r) => r.id.startsWith('IDX:'))
/**
 * 海外の行（東証の営業日で取得を判断しない行）。日経平均は東証の指数なので含めない（FR-MB3）。
 * 登録表に無い IDX: も海外として扱う（今は無いが、東証の判断を当てない方が安全）
 */
export const isExternal = (id: InstrumentId): boolean => id.startsWith('IDX:') && id !== 'IDX:N225'
/** 区分で絞る（null は全て） */
export const refsIn = (group: BoardGroup | null): MarketRef[] => (group ? MARKET_REFS.filter((r) => r.group === group) : MARKET_REFS)
/** 価格の桁（登録表の行だけ。無ければ undefined = 今の表示） */
export const priceDigits = (id: InstrumentId): number | undefined => BY_ID.get(id)?.digits
/** 銘柄の表のコード（IDX:USDJPY → USDJPY） */
export const refCode = (id: InstrumentId): string => id.slice(id.indexOf(':') + 1)
/**
 * 値が古いか（一覧の行を薄くする）。東証の銘柄は最後の東証の営業日より前の足なら古い。海外の行は時差と海外の休日があるので、
 * 最後の東証の営業日の 5 日前より前の足だけを古いとする（国ごとの休日の表は持たない。FR-MB3）
 */
export function isStale(id: InstrumentId, asOf: JstDate, lastSession: JstDate): boolean {
  return isExternal(id) ? asOf < addDays(lastSession, -5) : asOf < lastSession
}
