// 数字の書式（FR-V2, FR-V12）
import { describe, expect, it } from 'vitest'
import { stubWindow } from '../../support/window'

stubWindow()
const { retText } = await import('../../../src/renderer/lib/format')

describe('騰落率の短い書式（銘柄情報の値動き。FR-V12）', () => {
  it('100% 未満は小数 1 桁、100% 以上は整数（狭いカードでも 3 桁の % が収まる）', () => {
    expect(retText(5.25)).toBe('+5.3%')
    expect(retText(-45.2)).toBe('−45.2%')
    expect(retText(264.04)).toBe('+264%')
    expect(retText(-100)).toBe('−100%')
    expect(retText(1234.5)).toBe('+1,235%')
    expect(retText(0)).toBe('±0.0%')
    expect(retText(null)).toBe('—')
  })
})
