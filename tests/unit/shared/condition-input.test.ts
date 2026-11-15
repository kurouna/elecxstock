import { FIELD_BY_ID, moneyScale, parseTyped } from '@shared/fields'
import { describe, expect, it } from 'vitest'

describe('打った値の読み取り（スクリーナーとアラートのダイアログ）', () => {
  it('単位の無い数は表示の単位を掛ける。兆・億・万が付けばその倍率', () => {
    const cap = moneyScale(FIELD_BY_ID.get('value.marketCap')!)
    const inv = moneyScale(FIELD_BY_ID.get('price.minInvest')!)
    expect(parseTyped('100', cap)).toBe(1e10)
    expect(parseTyped('30', inv)).toBe(3e5)
    expect(parseTyped('30万', cap)).toBe(3e5)
    expect(parseTyped('1.5億', inv)).toBe(1.5e8)
    expect(parseTyped('1兆')).toBe(1e12)
    expect(parseTyped('１，２００円')).toBe(1200)
    expect(parseTyped('−5%')).toBe(-5)
    expect(parseTyped('0.1', cap)).toBe(1e7)
  })
  it('画面の表示にならって正の符号を付けても読む（+5・+5%・全角の＋５％）', () => {
    expect(parseTyped('+5')).toBe(5)
    expect(parseTyped('+5%')).toBe(5)
    expect(parseTyped('＋５％')).toBe(5)
    expect(parseTyped('+1.5億')).toBe(1.5e8)
    expect(parseTyped('+-5')).toBeNull()
  })
  it('読めない文字は null（条件を変えない）', () => {
    expect(parseTyped('')).toBeNull()
    expect(parseTyped('abc')).toBeNull()
    expect(parseTyped('1万2')).toBeNull()
  })
})
