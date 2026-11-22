// マーケット一覧の行の純粋な関数（FR-MB1〜MB3。L1）
import { isExternal, isStale, priceDigits, refCode, refOf, refsIn } from '@shared/markets'
import { describe, expect, it } from 'vitest'

describe('マーケット一覧の区分と桁（FR-MB1, FR-MB2）', () => {
  it('区分で絞る。null は全て', () => {
    expect(refsIn(null).length).toBe(20)
    expect(refsIn('fx').map((r) => r.id)).toEqual(['IDX:USDJPY', 'IDX:EURJPY', 'IDX:US10Y'])
    expect(refsIn('crypto').map((r) => r.id)).toEqual(['IDX:BTCJPY'])
    expect(refsIn('cmd').map((r) => r.id)).toEqual(['IDX:CL', 'IDX:GC', 'IDX:SI'])
  })
  it('価格の桁は行ごと。連動 ETF と登録表に無い銘柄は今の表示のまま（undefined）', () => {
    expect(priceDigits('IDX:USDJPY')).toBe(3)
    expect(priceDigits('IDX:US10Y')).toBe(3)
    expect(priceDigits('IDX:BTCJPY')).toBe(0)
    expect(priceDigits('JP:1308')).toBeUndefined()
    expect(priceDigits('JP:7203')).toBeUndefined()
  })
  it('連動 ETF の表示名は「連動ETF」を含む（FR-U6）', () => {
    for (const id of ['JP:1308', 'JP:1591', 'JP:2516', 'JP:1343']) {
      expect(refOf(id)?.name.ja).toContain('連動ETF')
      expect(refOf(id)?.name.en).toContain('ETF')
    }
  })
  it('銘柄の表のコードは ID の後ろ', () => {
    expect(refCode('IDX:USDJPY')).toBe('USDJPY')
    expect(refCode('JP:1308')).toBe('1308')
  })
})

describe('海外の行の「古い」（FR-MB3）', () => {
  it('日経平均と東証の銘柄は、東証の最後の営業日より前なら古い', () => {
    expect(isExternal('IDX:N225')).toBe(false)
    expect(isStale('IDX:N225', '2026-11-12', '2026-11-13')).toBe(true)
    expect(isStale('JP:1308', '2026-11-13', '2026-11-13')).toBe(false)
  })
  it('海外の行は、東証の最後の営業日の 5 日前より前だけ古い（時差・海外の休日）', () => {
    expect(isExternal('IDX:DJI')).toBe(true)
    expect(isStale('IDX:DJI', '2026-11-12', '2026-11-13')).toBe(false)
    expect(isStale('IDX:DJI', '2026-11-08', '2026-11-13')).toBe(false) // ちょうど 5 日前
    expect(isStale('IDX:DJI', '2026-11-07', '2026-11-13')).toBe(true)
    // 東証が休みの日に動いた足（東証の最後の営業日より新しい）も古くない
    expect(isStale('IDX:USDJPY', '2026-11-16', '2026-11-13')).toBe(false)
  })
})
