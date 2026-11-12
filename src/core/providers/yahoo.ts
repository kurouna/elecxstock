// Yahoo Finance（yahoo-finance2）プロバイダ（§3.1）。非公式 API なので、失敗を分類して上に返す（FR-F3）。

import type { InstrumentKind } from '@shared/types'
import YahooFinance from 'yahoo-finance2'
import { toJstDate } from '../calendar'
import { JPX_URL_EN, JPX_URL_JA, parseJpx } from './jpx'
import { type HistoryResult, type Provider, ProviderError, type ProviderQuote, type RawBar } from './types'

const OFFLINE_CODES = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENETUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
])

export function classifyError(e: unknown): ProviderError {
  if (e instanceof ProviderError) return e
  const err = e as { message?: string; code?: string | number; cause?: { code?: string }; name?: string }
  const msg = String(err?.message ?? e)
  const code = String(err?.cause?.code ?? err?.code ?? '')
  if (err?.name === 'AbortError') return new ProviderError('provider', 'aborted')
  if (OFFLINE_CODES.has(code) || /fetch failed|network|getaddrinfo/i.test(msg)) return new ProviderError('offline', msg)
  if (/Too Many Requests|429/.test(msg) || code === '429') return new ProviderError('provider', msg, 429)
  if (/No data found|Not Found|delisted|Quote not found|404/i.test(msg)) return new ProviderError('symbol', msg, 404)
  if (/5\d\d|Internal Server Error|Bad Gateway|Service Unavailable/.test(msg)) return new ProviderError('provider', msg, 500)
  return new ProviderError('symbol', msg)
}

const n = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null)

export function createYahooProvider(): Provider {
  const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] })
  return {
    id: 'yahoo',
    priceBasis: 'split-adjusted',
    quoteBatchSize: 50,
    minIntervalMs: 1000,
    jitterMs: 300,
    toSymbol: (code: string, kind: InstrumentKind) => (kind === 'index' ? `^${code}` : `${code}.T`),
    async fetchHistory(symbol, { from, interval, signal }): Promise<HistoryResult> {
      try {
        const r = await yf.chart(
          symbol,
          { period1: from, interval, events: 'div|split' },
          { validateResult: false, fetchOptions: { signal } },
        )
        const bars: RawBar[] = []
        const res = r as {
          quotes?: {
            date?: Date
            open?: number | null
            high?: number | null
            low?: number | null
            close?: number | null
            volume?: number | null
          }[]
        }
        for (const q of res.quotes ?? []) {
          const c = n(q.close)
          if (c == null || !q.date) continue // 終値の無い足は保存しない（FR-D8）
          const d = toJstDate(new Date(q.date))
          bars.push({
            d: interval === '1mo' ? `${d.slice(0, 7)}-01` : d,
            o: n(q.open) ?? c,
            h: n(q.high) ?? c,
            l: n(q.low) ?? c,
            c,
            v: n(q.volume) ?? 0,
          })
        }
        const ev = (r as { events?: { dividends?: unknown[]; splits?: unknown[] } }).events ?? {}
        const dividends = (ev.dividends ?? []).flatMap((x) => {
          const o = x as { date?: Date; amount?: number }
          return o.date && n(o.amount) != null ? [{ date: toJstDate(new Date(o.date)), amount: o.amount as number }] : []
        })
        const splits = (ev.splits ?? []).flatMap((x) => {
          const o = x as { date?: Date; numerator?: number; denominator?: number }
          const num = n(o.numerator)
          const den = n(o.denominator)
          return o.date && num && den ? [{ date: toJstDate(new Date(o.date)), ratio: num / den }] : []
        })
        return { bars, dividends, splits }
      } catch (e) {
        throw classifyError(e)
      }
    },
    async fetchQuotes(symbols, { signal }): Promise<ProviderQuote[]> {
      try {
        const rs = (await yf.quote(symbols, {}, { validateResult: false, fetchOptions: { signal } })) as unknown as Record<
          string,
          unknown
        >[]
        return (Array.isArray(rs) ? rs : [rs]).map((q) => ({
          symbol: String(q.symbol),
          time: q.regularMarketTime ? new Date(q.regularMarketTime as Date).getTime() : null,
          price: n(q.regularMarketPrice),
          open: n(q.regularMarketOpen),
          high: n(q.regularMarketDayHigh),
          low: n(q.regularMarketDayLow),
          volume: n(q.regularMarketVolume),
          prevClose: n(q.regularMarketPreviousClose),
          per: n(q.trailingPE),
          pbr: n(q.priceToBook),
          marketCap: n(q.marketCap),
          shares: n(q.sharesOutstanding),
          bps: n(q.bookValue),
          eps: n(q.epsTrailingTwelveMonths),
          nameEn: typeof q.longName === 'string' ? q.longName : typeof q.shortName === 'string' ? q.shortName : null,
        }))
      } catch (e) {
        throw classifyError(e)
      }
    },
    async fetchUniverse({ signal }) {
      const get = async (url: string) => {
        const res = await fetch(url, { signal, headers: { 'user-agent': 'Mozilla/5.0 elecxstock' } })
        if (!res.ok) throw new ProviderError(res.status >= 500 ? 'provider' : 'symbol', `JPX ${res.status}`, res.status)
        return new Uint8Array(await res.arrayBuffer())
      }
      try {
        const ja = await get(JPX_URL_JA)
        let en: Uint8Array | undefined
        try {
          en = await get(JPX_URL_EN)
        } catch {
          en = undefined // 英語名は無くても進める（FR-U7 は日本語名で代用）
        }
        return parseJpx(ja, en)
      } catch (e) {
        throw classifyError(e)
      }
    },
  }
}
