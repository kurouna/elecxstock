// 騰落の表の列（FR-BR2, FR-BR3。L2）: 列の登録・既定・並べ替え・セルの書式
import type { BreadthRow } from '@shared/breadth'
import { describe, expect, it } from 'vitest'
import { stubWindow } from '../../support/window'

stubWindow()
const { BREADTH_COLUMNS, DEFAULT_BREADTH_COLUMNS, resolveBreadthColumns, sortBreadth } = await import(
  '../../../src/renderer/lib/breadthColumns'
)
const { ja, en } = await import('../../../src/renderer/lib/i18n')

const row = (key: string, o: Partial<BreadthRow> = {}): BreadthRow => ({
  key,
  n: 10,
  up: 6,
  down: 3,
  flat: 1,
  newHi: 2,
  newLo: 0,
  turnover: 3.2e11,
  ret: { d1: 1.234, m1: -2, m3: null, ytd: 5, y1: 12 },
  asOf: '2026-11-13',
  ids: [],
  ...o,
})

describe('騰落の表の列（FR-BR2, FR-BR3）', () => {
  it('列の ID は表ごとに重ならず、既定の列はすべて登録されている。見出しの文言は ja と en にある', () => {
    for (const tab of ['market', 'sector'] as const) {
      const ids = BREADTH_COLUMNS[tab].map((c) => c.id)
      expect(new Set(ids).size).toBe(ids.length)
      for (const id of DEFAULT_BREADTH_COLUMNS[tab]) expect(ids).toContain(id)
    }
    const keys = Object.keys(ja).filter((k) => k.startsWith('br.'))
    expect(keys.length).toBeGreaterThan(10)
    for (const k of keys) expect(en).toHaveProperty(k)
  })
  it('名前の列は必ず先頭。知らない ID は捨てる', () => {
    expect(resolveBreadthColumns('sector', ['d1', 'nope', 'up']).map((c) => c.id)).toEqual(['name', 'd1', 'up'])
    expect(resolveBreadthColumns('market', undefined).map((c) => c.id)).toEqual(DEFAULT_BREADTH_COLUMNS.market)
  })
  it('並べ替えは欠損を最後にする', () => {
    const rows = [row('a', { ret: { ...row('a').ret, m3: 1 } }), row('b'), row('c', { ret: { ...row('c').ret, m3: 3 } })]
    const m3 = BREADTH_COLUMNS.sector.find((c) => c.id === 'm3')
    expect(sortBreadth(rows, m3, -1).map((r) => r.key)).toEqual(['c', 'a', 'b'])
    expect(sortBreadth(rows, m3, 1).map((r) => r.key)).toEqual(['a', 'c', 'b'])
  })
  it('セル: 騰落率は符号と色、値上がりは上げの色、売買代金は単位を添える', () => {
    const c = (id: string) => BREADTH_COLUMNS.sector.find((x) => x.id === id)!.cell(row('銀行業'), (k) => k)
    expect(c('d1')).toMatchObject({ t: '+1.23', u: '%', c: 'up' })
    expect(c('m1')).toMatchObject({ c: 'down' })
    expect(c('m3')).toEqual({ t: '—' })
    expect(c('up')).toMatchObject({ t: '6', c: 'up' })
    expect(c('turnover').u).toBeTruthy()
    expect(c('name').t).toBe('銀行業')
  })
})

describe('騰落率のセルの色は「±」と揃える（FR-BR2, FR-V2）', () => {
  it('丸めて 0 になる騰落率は ±0.00 で、色は flat', () => {
    const r = row('銀行業', { ret: { d1: 0.004, m1: -0.004, m3: 0.006, ytd: 5, y1: 12 } })
    const c = (id: string) => BREADTH_COLUMNS.sector.find((x) => x.id === id)!.cell(r, (k) => k)
    expect(c('d1')).toMatchObject({ t: '±0.00', c: 'flat' })
    expect(c('m1')).toMatchObject({ t: '±0.00', c: 'flat' })
    expect(c('m3')).toMatchObject({ t: '+0.01', c: 'up' })
  })
})
