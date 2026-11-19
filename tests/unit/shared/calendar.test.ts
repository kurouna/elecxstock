import { NEED } from '@core/metrics'
import {
  addDays,
  addYears,
  isTradingDay,
  japaneseHolidays,
  jstDateTimeText,
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

describe('日本時間の日時の文字（FR-T1）', () => {
  it('ISO 8601 の時刻を、PC の時刻帯によらず日本時間の YYYY-MM-DD HH:MM にする', () => {
    expect(jstDateTimeText('2026-11-12T15:30:00Z')).toBe('2026-11-13 00:30')
    expect(jstDateTimeText('2026-11-13T18:05:00+09:00')).toBe('2026-11-13 18:05')
    expect(jstDateTimeText('2026-12-31T15:00:00.000Z')).toBe('2027-01-01 00:00')
  })
  it('読めない時刻は空', () => {
    expect(jstDateTimeText('')).toBe('')
    expect(jstDateTimeText('not a date')).toBe('')
  })
})

describe('年の足し引き（FR-T1）', () => {
  it('うるう日（2/29）から平年へは 2/28 にする（実在しない日付を作らない）', () => {
    expect(addYears('2028-02-29', -1)).toBe('2027-02-28')
    expect(addYears('2024-02-29', 1)).toBe('2025-02-28')
    expect(addYears('2024-02-29', 4)).toBe('2028-02-29')
    expect(addYears('2026-11-13', -3)).toBe('2023-11-13')
    expect(addYears('2026-03-01', -2)).toBe('2024-03-01')
  })
  it('うるう日からの保存期間の始まりも N 年前の 2/28 から数える', () => {
    expect(retentionStart('2028-02-29', 3)).toBe(addDays('2025-02-28', -RETENTION_MARGIN_DAYS))
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
