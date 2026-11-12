import type { Dividend, InstrumentKind, JstDate, Market, Split } from '@shared/types'

export interface RawBar {
  d: JstDate // 日足は日付、月足は月初の日付
  o: number
  h: number
  l: number
  c: number
  v: number
}
export interface HistoryResult {
  bars: RawBar[]
  dividends: Dividend[]
  splits: Split[]
}
export interface ProviderQuote {
  symbol: string
  time: number | null // ms
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
  nameEn: string | null
}
export interface UniverseRow {
  code: string
  nameJa: string
  nameEn: string
  market: Market
  kind: InstrumentKind
  sectorJa: string
  sectorEn: string
}

/** 失敗の分類（FR-F3）: 銘柄単位・プロバイダ単位・通信断 */
export class ProviderError extends Error {
  constructor(
    readonly scope: 'symbol' | 'provider' | 'offline',
    message: string,
    readonly status?: number,
  ) {
    super(message)
  }
}

export interface Provider {
  id: string
  priceBasis: 'split-adjusted' | 'unadjusted'
  quoteBatchSize: number
  /** 1 リクエストの最小間隔（ms）と揺らぎ（FR-F2） */
  minIntervalMs: number
  jitterMs: number
  toSymbol(code: string, kind: InstrumentKind): string
  fetchHistory(symbol: string, opt: { from: JstDate; interval: '1d' | '1mo'; signal: AbortSignal }): Promise<HistoryResult>
  fetchQuotes(symbols: string[], opt: { signal: AbortSignal }): Promise<ProviderQuote[]>
  fetchUniverse(opt: { signal: AbortSignal }): Promise<UniverseRow[]>
}
