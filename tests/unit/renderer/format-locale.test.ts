// 数値・日付・金額の書式を言語に合わせて Intl で書く（format.ts。値はすべて架空）
import { afterEach, describe, expect, it } from 'vitest'
import { stubWindow } from '../../support/window'

stubWindow()
const { cls, date, dateTime, fmt, money, px, sgn } = await import('../../../src/renderer/lib/format')
const { app } = await import('../../../src/renderer/stores/app.svelte')

const joined = (m: { n: string; u: string }) => `${m.n}${m.u}`

afterEach(() => {
  app.settings.lang = 'ja'
})

describe('言語に合わせた書式（FR-N3）', () => {
  it('日本語: 日付は 2026/11/13、金額は兆・億・万', () => {
    app.settings.lang = 'ja'
    expect(date('2026-11-13')).toBe('2026/11/13')
    expect(joined(money(1.2e12))).toBe('1.20兆')
    expect(joined(money(3.45e9))).toBe('34.5億')
    expect(joined(money(5.6e10))).toBe('560億')
    expect(joined(money(1_234_0000))).toBe('1,234万')
  })
  it('英語: 日付は Nov 13, 2026、金額は ¥ と T・B・M', () => {
    app.settings.lang = 'en'
    expect(date('2026-11-13')).toBe('Nov 13, 2026')
    expect(joined(money(1.2e12))).toBe('¥1.20T')
    expect(joined(money(3.45e9))).toBe('¥3.5B')
    expect(joined(money(7.8e7))).toBe('¥78.0M')
  })
  it('数値は桁区切りと桁数を Intl で付ける（日英とも）', () => {
    for (const lang of ['ja', 'en'] as const) {
      app.settings.lang = lang
      expect(fmt(1234567.891)).toBe('1,234,567.89')
      expect(px(2345.6)).toBe('2,346')
      expect(px(987.65)).toBe('987.7')
    }
  })
  it('日時は日本時間で書く（PC の時刻帯によらない）', () => {
    app.settings.lang = 'ja'
    expect(dateTime('2026-11-13T09:00:00Z')).toBe('2026/11/13 18:00')
    app.settings.lang = 'en'
    expect(dateTime('2026-11-13T09:00:00Z')).toBe('Nov 13, 2026, 18:00')
  })
  it('値が無いときは —', () => {
    for (const lang of ['ja', 'en'] as const) {
      app.settings.lang = lang
      expect(date(null)).toBe('—')
      expect(fmt(Number.NaN)).toBe('—')
      expect(money(null)).toEqual({ n: '—', u: '' })
    }
  })
})

describe('書式の境界（FR-N3, FR-V2）', () => {
  it('負の金額も正と同じ桁（100 億円以上は整数）', () => {
    app.settings.lang = 'ja'
    expect(joined(money(-5.6e10))).toBe('-560億')
    expect(joined(money(-3.45e9))).toBe('-34.5億')
  })
  it('丸めて 0 になる負の値は −0 にしない', () => {
    expect(fmt(-0.001, 2)).toBe('0.00')
    expect(fmt(-0, 0)).toBe('0')
    expect(px(-0.01)).toBe('0.0')
    expect(sgn(-0.001, 2, '%')).toBe('±0.00%')
    expect(sgn(0.004, 2)).toBe('±0.00')
    expect(sgn(-0.006, 2)).toBe('−0.01')
  })
  it('数でない値は色を付けない・読めない日時は —', () => {
    expect(cls(Number.NaN)).toBe('')
    expect(cls(Number.POSITIVE_INFINITY)).toBe('')
    expect(cls(0)).toBe('flat')
    expect(cls(-1)).toBe('down')
    expect(dateTime('not a date')).toBe('—')
  })
})
