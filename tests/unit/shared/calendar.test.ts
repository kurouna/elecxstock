import { NEED } from '@core/metrics'
import {
  addDays,
  isTradingDay,
  japaneseHolidays,
  lastClosedSession,
  prevTradingDay,
  RETENTION_MARGIN_DAYS,
  retentionStart,
  toJstDate,
} from '@shared/calendar'
import { DEFAULT_SETTINGS } from '@shared/settings'
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

describe('日足の保存期間の始まり（FR-D6）', () => {
  it('N 年に余裕を足した日から。境は年と日の計算だけで決まる', () => {
    expect(retentionStart('2026-11-13', 3)).toBe(addDays('2023-11-13', -RETENTION_MARGIN_DAYS))
  })
  it('既定の 3 年でも、3 年の指標に要る本数（NEED.ret3y + 1）の営業日がある', () => {
    for (const today of ['2026-11-13', '2026-01-05', '2027-05-07'] as const) {
      let n = 0
      for (let d = retentionStart(today, DEFAULT_SETTINGS.retentionYears); d <= today; d = addDays(d, 1)) if (isTradingDay(d)) n++
      expect(n).toBeGreaterThan(NEED.ret3y)
    }
  })
})
