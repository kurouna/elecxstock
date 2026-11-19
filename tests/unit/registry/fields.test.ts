import { FIELDS, METRIC_COLUMNS, migrateConditions, usable } from '@shared/fields'
import { describe, expect, it } from 'vitest'

describe('指標の登録表の整合（FR-FD4）', () => {
  it('ID が重複せず、日英の表示名があり、metrics の列が実在する', () => {
    const ids = new Set<string>()
    for (const f of FIELDS) {
      expect(ids.has(f.id), f.id).toBe(false)
      ids.add(f.id)
      expect(f.label.ja && f.label.en, f.id).toBeTruthy()
      expect(f.operators.length, f.id).toBeGreaterThan(0)
      // recordMonths は metrics 表の record_months（配列）
      if (f.source.kind === 'metrics' && f.source.column !== 'recordMonths')
        expect(METRIC_COLUMNS as readonly string[]).toContain(f.source.column)
      if (f.type === 'enum' && f.source.kind === 'attr') expect(f.choices?.length).toBeGreaterThan(0)
      if (f.type === 'bool') expect(f.operators).toEqual(['='])
    }
  })
})

describe('指標の版と移行（FR-FD5）', () => {
  it('版の古い条件は移行し、移行できない条件は failed に入る', () => {
    const byId = new Map(FIELDS.map((f) => [f.id, f]))
    byId.set('x.old', { ...FIELDS[0]!, id: 'x.old', version: 3 })
    const r = migrateConditions(
      [
        { field: 'x.old', op: '>=', value: 1, v: 1 }, // 1→2 は単位を 100 倍、2→3 は無い
        { field: 'x.old', op: '>=', value: 1, v: 3 },
        { field: 'income.yield', op: '>=', value: 3 },
      ],
      byId,
      { 'x.old@1': (c) => ({ ...c, value: Number(c.value) * 100 }) },
    )
    expect(r.failed).toEqual([0])
    expect(r.conditions[1]!.v).toBe(3)
    const ok = migrateConditions([{ field: 'x.old', op: '>=', value: 1, v: 2 }], byId, {
      'x.old@2': (c) => ({ ...c, value: Number(c.value) + 1 }),
    })
    expect(ok.failed).toEqual([])
    expect(ok.conditions[0]).toMatchObject({ value: 2, v: 3 })
  })
  it('保有の条件（保有している・損益率）は今の版で使える', () => {
    expect(usable(FIELDS.find((f) => f.id === 'holding.pnlPct'))).toBe(true)
    expect(usable(FIELDS.find((f) => f.id === 'user.held'))).toBe(true)
  })
})

describe('指標の表し方（FR-FD4, FR-SC18, FR-H4）', () => {
  const f = (id: string) => FIELDS.find((x) => x.id === id)!
  it('損益率は符号と増減の色を付ける（ほかの騰落率と同じ）', () => {
    expect(f('holding.pnlPct').signed).toBe(true)
  })
  it('ベータは係数で、倍（×）を付けない。小数 2 桁', () => {
    expect(f('risk.beta').type).not.toBe('ratio')
    expect(f('risk.beta').unit).toBeUndefined()
    expect(f('risk.beta').digits).toBe(2)
  })
})
