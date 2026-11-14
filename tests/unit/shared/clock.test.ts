// テストの時刻（ELECXSTOCK_NOW。docs/testing.md §時刻）。スタブのときだけ効き、引数なしの Date だけをずらす

import { jstNow } from '@shared/calendar'
import { clockOffsetFrom, shiftClock, TEST_NOW } from '@shared/clock'
import { describe, expect, it } from 'vitest'

describe('テストの時刻（ELECXSTOCK_NOW）', () => {
  it('スタブのプロバイダのときだけ使う。渡されたずれが優先、読めない日時は使わない', () => {
    const now = Date.parse('2026-01-01T00:00:00Z')
    expect(clockOffsetFrom({ ELECXSTOCK_NOW: TEST_NOW }, now)).toBeNull()
    expect(clockOffsetFrom({ ELECXSTOCK_PROVIDER: 'yahoo', ELECXSTOCK_NOW: TEST_NOW }, now)).toBeNull()
    expect(clockOffsetFrom({ ELECXSTOCK_PROVIDER: 'stub', ELECXSTOCK_NOW: TEST_NOW }, now)).toBe(Date.parse(TEST_NOW) - now)
    expect(clockOffsetFrom({ ELECXSTOCK_PROVIDER: 'stub', ELECXSTOCK_NOW: TEST_NOW, ELECXSTOCK_CLOCK_OFFSET: '-5000' }, now)).toBe(-5000)
    expect(clockOffsetFrom({ ELECXSTOCK_PROVIDER: 'stub', ELECXSTOCK_NOW: 'あした' }, now)).toBeNull()
    expect(clockOffsetFrom({ ELECXSTOCK_PROVIDER: 'stub' }, now)).toBeNull()
  })
  it('単体テストは基準日時で動く（tests/support/setup.ts）。時刻は止まらずに進む', async () => {
    expect(jstNow().date).toBe('2026-11-13')
    expect(Math.abs(Date.now() - Date.parse(TEST_NOW))).toBeLessThan(120_000)
    const t = Date.now()
    await new Promise((r) => setTimeout(r, 15))
    expect(Date.now()).toBeGreaterThan(t)
  })
  it('引数なしの new Date()・Date()・Date.now() だけずれ、日時を渡した Date と Date.parse はずれない', () => {
    expect(Math.abs(Date.now() - Date.now())).toBeLessThan(50)
    expect(new Date(2020, 0, 2).getDate()).toBe(2)
    expect(new Date('2020-01-02T00:00:00Z').toISOString()).toBe('2020-01-02T00:00:00.000Z')
    expect(Date.parse('2020-01-02T00:00:00Z')).toBe(1577923200000)
    expect(Date.UTC(2020, 0, 2)).toBe(1577923200000)
    expect(typeof (Date as unknown as () => string)()).toBe('string')
    expect(new Date() instanceof Date).toBe(true)
  })
  it('2 回目のずらしは効かない（二重にずれない）', () => {
    const before = Date.now()
    shiftClock(10 * 365 * 86400_000)
    expect(Math.abs(Date.now() - before)).toBeLessThan(1000)
  })
})
