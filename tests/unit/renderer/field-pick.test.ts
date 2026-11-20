// 条件を選ぶダイアログ（FieldPicker）の当たり方と単位（FR-SC17, FR-FD2）
import { FIELD_BY_ID } from '@shared/fields'
import { describe, expect, it } from 'vitest'
import { fieldMatch, fieldUnit } from '../../../src/renderer/lib/fieldPick'

const f = (id: string) => FIELD_BY_ID.get(id)!

describe('条件を選ぶダイアログの当たり方（FR-SC17）', () => {
  it('名前と同じ 3・名前や別名に含む 2・説明だけ 1・当たらない 0。空の語は 2', () => {
    expect(fieldMatch(f('income.yield'), '')).toBe(2)
    expect(fieldMatch(f('income.yield'), f('income.yield').label.ja)).toBe(3)
    expect(fieldMatch(f('income.yield'), '利回り')).toBe(2)
    expect(fieldMatch(f('income.yield'), 'zzzz')).toBe(0)
  })
  it('全角・大小文字を無視する', () => {
    expect(fieldMatch(f('value.roe'), 'ｒｏｅ')).toBeGreaterThanOrEqual(2)
  })
})
describe('単位（FR-FD2）', () => {
  it('登録表の単位、無ければ種類から（% / 倍 / x）', () => {
    expect(fieldUnit(f('income.yield'), 'ja')).toBe('%')
    const ratio = [...FIELD_BY_ID.values()].find((x) => x.type === 'ratio' && !x.unit)
    if (ratio) {
      expect(fieldUnit(ratio, 'ja')).toBe('倍')
      expect(fieldUnit(ratio, 'en')).toBe('x')
    }
  })
})
