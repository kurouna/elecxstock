import { FIELDS, METRIC_COLUMNS } from '@shared/fields'
import { describe, expect, it } from 'vitest'

describe('指標の登録表の整合（FR-FD4）', () => {
  it('ID が重複せず、日英の表示名があり、metrics の列が実在する', () => {
    const ids = new Set<string>()
    for (const f of FIELDS) {
      expect(ids.has(f.id), f.id).toBe(false)
      ids.add(f.id)
      expect(f.label.ja && f.label.en, f.id).toBeTruthy()
      expect(f.operators.length, f.id).toBeGreaterThan(0)
      if (f.source.kind === 'metrics') expect(METRIC_COLUMNS as readonly string[]).toContain(f.source.column)
      if (f.type === 'enum' && f.source.kind === 'attr') expect(f.choices?.length).toBeGreaterThan(0)
      if (f.type === 'bool') expect(f.operators).toEqual(['='])
    }
  })
})
