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

describe('符号つきの % の列の色は「±」と揃える（FR-SC6, FR-V2）', () => {
  it('丸めて 0 になる値は ± で、色は flat', () => {
    const col = COLUMN_BY_ID.get('price.chgPct')!
    const at = (v: number) => {
      app.metrics.set('JP:9001' as InstrumentId, row('9001', { chgPct: v }))
      return col.cell('JP:9001' as InstrumentId)
    }
    const d = at(0.004).t.length - at(0.004).t.indexOf('.') - 1 // 列の桁
    expect(at(0.4 / 10 ** d)).toMatchObject({ t: expect.stringMatching(/^±/), c: 'flat' })
    expect(at(-0.4 / 10 ** d)).toMatchObject({ t: expect.stringMatching(/^±/), c: 'flat' })
    expect(at(1)).toMatchObject({ c: 'up' })
  })
})

describe('前日比の円の列（FR-SC3, FR-V2）', () => {
  const col = () => COLUMN_BY_ID.get('price.chg')!
  const at = (close: number, chg: number) => {
    app.metrics.set('JP:9001' as InstrumentId, row('9001', { close, chg }))
    return col().cell('JP:9001' as InstrumentId)
  }
  it('符号と上げ下げの色を付け、桁は値段にそろえる', () => {
    expect(at(3000, 12)).toEqual({ t: '+12', c: 'up' })
    expect(at(800, -1.5)).toEqual({ t: '−1.5', c: 'down' })
    expect(at(3000, 0.4)).toEqual({ t: '±0', c: 'flat' })
  })
  it('値が無ければ —。並べ替えは円の値で、率の列とは別', () => {
    app.metrics.set('JP:9001' as InstrumentId, row('9001', { chg: null, chgPct: 1 }))
    expect(col().cell('JP:9001' as InstrumentId).t).toBe('—')
    app.metrics.set('JP:9001' as InstrumentId, row('9001', { chg: -30, chgPct: 1 }))
    expect(col().sort!('JP:9001' as InstrumentId)).toBe(-30)
    expect(COLUMN_BY_ID.get('price.chgPct')!.sort!('JP:9001' as InstrumentId)).toBe(1)
  })
  it('見出しは 前日比（円）と 前日比率（%）', () => {
    expect(col().label()).toBe('前日比')
    expect(COLUMN_BY_ID.get('price.chgPct')!.label()).toBe('前日比率')
  })
})

describe('まとめた前日比の率（保有の合計・小計。FR-H7）', () => {
  it('前日比の額 ÷ 前日の評価額。前日の評価額が 0 以下なら欠損', async () => {
    const { dayChangePct } = await import('../../../src/renderer/lib/portfolio')
    expect(dayChangePct({ value: 102_000, dayPnl: 2_000 })).toBeCloseTo(2, 9)
    expect(dayChangePct({ value: 98_000, dayPnl: -2_000 })).toBeCloseTo(-2, 9)
    expect(dayChangePct({ value: 0, dayPnl: 0 })).toBeNull()
  })
})
