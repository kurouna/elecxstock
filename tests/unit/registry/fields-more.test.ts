import { COMPUTE_KEYS } from '@shared/compute'
import { FIELD_BY_ID, FIELD_GROUPS, FIELDS, moneyScale, refFields, usable } from '@shared/fields'
import { describe, expect, it } from 'vitest'

describe('相対条件の相手は同じ種類だけ', () => {
  it('終値の相手は価格（時価総額・利回りは出ない）', () => {
    const r = refFields(FIELD_BY_ID.get('price.close')!).map((f) => f.id)
    expect(r).toContain('price.ma200')
    expect(r).not.toContain('value.marketCap')
    expect(r).not.toContain('income.yield')
    expect(refFields(FIELD_BY_ID.get('value.marketCap')!)).toEqual([])
  })
})

// ---------------------------------------------------------------- レビューの指摘（境界値・無効な条件・登録表の整合）

describe('登録表の整合（条件を選ぶダイアログ・実行時の計算）', () => {
  it('使える指標はすべて分類と日英の説明を持つ（分類が無いとダイアログに出ない）', () => {
    const groups = new Set(FIELD_GROUPS.map((g) => g.id))
    for (const f of FIELDS.filter((x) => usable(x))) {
      expect(!!f.group && groups.has(f.group), f.id).toBe(true)
      expect(f.description?.ja && f.description.en, f.id).toBeTruthy()
    }
  })
  it('実行時に計算する指標のキーは、すべて computeValue が知っている', () => {
    for (const f of FIELDS.filter((x) => usable(x) && x.source.kind === 'compute'))
      expect(COMPUTE_KEYS.has((f.source as { key: string }).key), f.id).toBe(true)
  })
  it('金額を打つ単位は表示の単位と同じ（円・万円・億円）', () => {
    const scale: Record<string, number> = { 円: 1, 万円: 1e4, 億円: 1e8 }
    for (const f of FIELDS.filter((x) => usable(x) && x.type === 'money')) expect(moneyScale(f), f.id).toBe(scale[f.unit?.ja ?? ''])
  })
})
