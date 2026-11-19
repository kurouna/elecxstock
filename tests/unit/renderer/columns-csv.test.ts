// 一覧の CSV（FR-SC6, FR-W8）と保有の列の作り直し（FR-H4）。値はすべて架空
import type { Instrument, InstrumentId, MetricsRow } from '@shared/types'
import { afterEach, describe, expect, it } from 'vitest'
import { stubWindow } from '../../support/window'

stubWindow()
const { COLUMN_BY_ID, toCsv } = await import('../../../src/renderer/lib/columns')
const { app } = await import('../../../src/renderer/stores/app.svelte')

const ins = (code: string, sectorJa: string): Instrument =>
  ({
    id: `JP:${code}`,
    code,
    nameJa: code,
    nameEn: code,
    market: 'P',
    kind: 'stock',
    sectorJa,
    sectorEn: '',
    status: 'active',
    userAdded: false,
  }) as Instrument
const row = (code: string, o: Partial<MetricsRow> = {}): MetricsRow =>
  ({ id: `JP:${code}`, asOf: '2026-11-13', close: 1000, recordMonths: [], ...o }) as unknown as MetricsRow

afterEach(() => {
  app.metrics.clear()
  app.instruments.clear()
  app.holdings = []
})

describe('CSV の書き出し（FR-SC6, FR-W8）', () => {
  it('権利確定月はすべての月を書く（並べ替えの値の先頭の月だけにしない）', () => {
    app.instruments.set('JP:9001', ins('9001', '陸運業'))
    app.metrics.set('JP:9001', row('9001', { recordMonths: [3, 9] }))
    app.instruments.set('JP:9002', ins('9002', '陸運業'))
    app.metrics.set('JP:9002', row('9002', { recordMonths: [] }))
    const csv = toCsv(['JP:9001', 'JP:9002'] as InstrumentId[], [COLUMN_BY_ID.get('code')!, COLUMN_BY_ID.get('recordMonths')!], (id) => id)
    expect(csv.split('\r\n').slice(0, 3)).toEqual(['﻿code,recordMonths', '9001,3 9', '9002,'])
  })
})

describe('保有の列の作り直し（FR-H4）', () => {
  it('保有の銘柄の業種が遅れて届いたら、業種の保有割合を出し直す', () => {
    app.holdings = [
      { code: '9001', account: 'tokutei', quantity: 100, avgCost: 900 },
      { code: '9002', account: 'tokutei', quantity: 100, avgCost: 900 },
    ] as typeof app.holdings
    app.metrics.set('JP:9001', row('9001'))
    app.metrics.set('JP:9002', row('9002'))
    app.instruments.set('JP:9001', ins('9001', '陸運業'))
    const col = COLUMN_BY_ID.get('holding.sectorWeight')!
    expect(col.sort!('JP:9001')).toBeCloseTo(50, 6) // 9002 の業種はまだ分からない
    app.instruments.set('JP:9002', ins('9002', '陸運業'))
    expect(col.sort!('JP:9001')).toBeCloseTo(100, 6)
  })
})
