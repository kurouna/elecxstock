import { isTradingDay, japaneseHolidays, lastClosedSession, prevTradingDay, toJstDate } from '@core/calendar'
import { describe, expect, it } from 'vitest'

describe('calendar（FR-T1, T2）', () => {
  it('祝日・振替休日・国民の休日', () => {
    const h = japaneseHolidays(2026)
    for (const d of [
      '2026-01-01',
      '2026-01-12',
      '2026-02-11',
      '2026-02-23',
      '2026-03-20',
      '2026-05-06',
      '2026-07-20',
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-11-23',
    ])
      expect(h.has(d), d).toBe(true)
    expect(japaneseHolidays(2025).has('2025-02-24')).toBe(true) // 振替休日
    expect(h.has('2026-11-12')).toBe(false)
  })
  it('東証の休場日', () => {
    expect(isTradingDay('2026-11-13')).toBe(true)
    expect(isTradingDay('2026-11-14')).toBe(false) // 土曜
    expect(isTradingDay('2026-12-31')).toBe(false)
    expect(isTradingDay('2027-01-04')).toBe(true)
    expect(prevTradingDay('2026-11-24')).toBe('2026-11-20') // 23 日は勤労感謝の日（月）
  })
  it('日本時間で日付を決める', () => {
    expect(toJstDate(Date.parse('2026-11-12T15:30:00Z'))).toBe('2026-11-13')
    // 2026-11-13 金 16:00 JST は大引け後
    expect(lastClosedSession(Date.parse('2026-11-13T07:00:00Z'))).toBe('2026-11-13')
    // 同日 10:00 JST は場中 → 前の取引日
    expect(lastClosedSession(Date.parse('2026-11-13T01:00:00Z'))).toBe('2026-11-12')
  })
})
