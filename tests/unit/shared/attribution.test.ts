// Lightweight Charts の帰属表示（§10）: 画面に出す NOTICE の 2 行が、配布物に入れる NOTICE・README と同じ文言か
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LWC_NOTICE, LWC_NOTICE_PARTS, splitToken, TRADINGVIEW_URL, yahooQuoteUrl, yahooUrl } from '@shared/attribution'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')

describe('Lightweight Charts の帰属表示（§10）', () => {
  it('画面の 2 行は scripts/notices の NOTICE（THIRD_PARTY_NOTICES.txt に入る）と同じ', () => {
    expect(read('scripts/notices/lightweight-charts.NOTICE').trim().split(/\r?\n/)).toEqual([...LWC_NOTICE])
  })

  it('上流のとおり著作権の行を持ち、リンク先は tradingview.com', () => {
    expect(LWC_NOTICE[0]).toBe('TradingView Lightweight Charts™')
    expect(LWC_NOTICE[1]).toMatch(/^Copyright \(с\) 2025 TradingView, Inc\. https:\/\/www\.tradingview\.com\/$/)
    expect(LWC_NOTICE[1]).toContain(TRADINGVIEW_URL)
  })

  it('README の日英のライセンスの節に 2 行を載せている', () => {
    const readme = read('README.md')
    for (const line of LWC_NOTICE) expect(readme.split(line).length - 1).toBe(2)
  })

  it('2 行目は URL の文字だけをリンクにし、つなぐと元の文言に戻る', () => {
    expect(LWC_NOTICE_PARTS.token).toBe(TRADINGVIEW_URL)
    expect(LWC_NOTICE_PARTS.before + LWC_NOTICE_PARTS.token + LWC_NOTICE_PARTS.after).toBe(LWC_NOTICE[1])
    expect(LWC_NOTICE_PARTS.before.endsWith(' ')).toBe(true)
  })
})

describe('データ源のリンク（§10）', () => {
  it('splitToken は token の前後に分け、無ければ全体を before にする', () => {
    expect(splitToken('Yahoo Finance（非公式）と JPX', 'Yahoo Finance')).toEqual({
      before: '',
      token: 'Yahoo Finance',
      after: '（非公式）と JPX',
    })
    expect(splitToken('スタブ', 'Yahoo Finance')).toEqual({ before: 'スタブ', token: '', after: '' })
  })

  it('日本語の画面は Yahoo!ファイナンス、英語は Yahoo Finance へ', () => {
    expect(yahooUrl('ja')).toBe('https://finance.yahoo.co.jp/')
    expect(yahooUrl('en')).toBe('https://finance.yahoo.com/')
  })
})

describe('銘柄の Yahoo Finance のページ（FR-I10）', () => {
  it('日本語の画面は Yahoo!ファイナンス、それ以外は Yahoo Finance（末尾の / あり）', () => {
    expect(yahooQuoteUrl('ja', '8053', 'stock')).toBe('https://finance.yahoo.co.jp/quote/8053.T')
    expect(yahooQuoteUrl('en', '8053', 'stock')).toBe('https://finance.yahoo.com/quote/8053.T/')
  })

  it('REIT・ETF と英字を含むコードも .T で開く', () => {
    expect(yahooQuoteUrl('ja', '8951', 'reit')).toBe('https://finance.yahoo.co.jp/quote/8951.T')
    expect(yahooQuoteUrl('en', '1306', 'etf')).toBe('https://finance.yahoo.com/quote/1306.T/')
    expect(yahooQuoteUrl('ja', '130A', 'stock')).toBe('https://finance.yahoo.co.jp/quote/130A.T')
  })

  it('指数と、コードの形でないものは出さない', () => {
    expect(yahooQuoteUrl('ja', 'N225', 'index')).toBeNull()
    expect(yahooQuoteUrl('en', '', 'stock')).toBeNull()
    expect(yahooQuoteUrl('en', '8053/../x', 'stock')).toBeNull()
    // コードの形は取り込み・フォームと同じ（src/shared/code.ts の CODE_RE。先頭は数字）
    expect(yahooQuoteUrl('ja', 'N225', 'stock')).toBeNull()
    expect(yahooQuoteUrl('ja', '94345', 'stock')).toBe('https://finance.yahoo.co.jp/quote/94345.T')
  })

  it('main の外部リンクの許可リスト（finance.yahoo.co(m|.jp)）に入る', () => {
    const allow = /^https:\/\/finance\.yahoo\.co(m|\.jp)\//
    for (const lang of ['ja', 'en']) expect(yahooQuoteUrl(lang, '7203', 'stock')).toMatch(allow)
  })
})
