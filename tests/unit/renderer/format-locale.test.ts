// 数値・日付・金額の書式を言語に合わせて Intl で書く（format.ts。値はすべて架空）
import { afterEach, describe, expect, it } from 'vitest'
import { stubWindow } from '../../support/window'

stubWindow()
const { cls, date, dateTime, fmt, money, moneyCls, ownSignedMoney, px, retCls, retText, sgn } = await import(
  '../../../src/renderer/lib/format'
)
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
  it('英語の負の金額は符号を ¥ の前に置く（¥-5.0B にしない）', () => {
    app.settings.lang = 'en'
    expect(joined(money(-5e9))).toBe('-¥5.0B')
    expect(joined(money(-1.2e12))).toBe('-¥1.20T')
    expect(joined(money(-7.8e7))).toBe('-¥78.0M')
    // 丸めて 0 になる負の値は符号を付けない
    expect(joined(money(-1))).toBe('¥0.0M')
    expect(joined(money(5e9))).toBe('¥5.0B')
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

describe('丸めて 0 になる値の色は「±」と揃える（FR-N3, FR-V2）', () => {
  it('cls に表示の桁を渡すと、丸めて 0 になる値は flat（±0.0% を陽線・陰線の色で塗らない）', () => {
    expect(sgn(0.04, 1, '%')).toBe('±0.0%')
    expect(cls(0.04, 1)).toBe('flat')
    expect(cls(-0.04, 1)).toBe('flat')
    expect(cls(0.05, 1)).toBe('up') // +0.1%
    expect(cls(-0.006, 2)).toBe('down') // −0.01
    expect(cls(0.4, 0)).toBe('flat')
    expect(cls(0.04)).toBe('up') // 桁を渡さなければ今までどおり符号だけ
    expect(cls(Number.NaN, 1)).toBe('')
  })
  it('性質: どの値・桁でも、sgn の符号と cls の色が食い違わない', () => {
    const tone = { '+': 'up', '−': 'down', '±': 'flat' } as Record<string, string>
    for (const d of [0, 1, 2])
      for (const v of [-1.5, -0.6, -0.05, -0.049, -0.004, 0, 0.004, 0.049, 0.05, 0.5, 0.6, 1.5, 123.456]) {
        expect(cls(v, d), `${v} / ${d}`).toBe(tone[sgn(v, d)[0]!])
      }
  })
  it('騰落率の短い書式（retText）の色は retCls', () => {
    for (const v of [-0.04, 0.04, 0.05, -0.05, 150, -150, 0.4])
      expect(retCls(v), String(v)).toBe({ '+': 'up', '−': 'down', '±': 'flat' }[retText(v)[0]!])
  })
  it('個人の金額（ownSignedMoney）の色は moneyCls（「±0万」を陽線の色にしない）', () => {
    for (const lang of ['ja', 'en'] as const) {
      app.settings.lang = lang
      for (const v of [1000, -1000, 4999, 5000, -5000, 1_234_0000, -1_234_0000, 0, 49_999, 50_000]) {
        expect(moneyCls(v), `${lang} ${v}`).toBe({ '+': 'up', '−': 'down', '±': 'flat' }[ownSignedMoney(v).n[0]!])
      }
    }
    expect(moneyCls(null)).toBe('')
  })
})
