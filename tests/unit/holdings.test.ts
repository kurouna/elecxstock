// 保有の記録（FR-H5, H8, H9）: 移動平均法・分割の調整・手数料・JSON の取り込みの差分
import { applyImport, exportHoldings, fromLots, previewImport } from '@core/holdings'
import type { Holding } from '@shared/types'
import { describe, expect, it } from 'vitest'

describe('fromLots（移動平均法、FR-H5）', () => {
  it('買い増しで平均取得単価が動き、売りでは変わらない。手数料は取得価額に含める', () => {
    const r = fromLots([
      { date: '2024-01-10', side: 'buy', quantity: 100, price: 1000, fee: 100 },
      { date: '2024-06-10', side: 'buy', quantity: 100, price: 1200 },
      { date: '2024-09-10', side: 'sell', quantity: 50, price: 1500, fee: 50 },
    ])
    expect(r.quantity).toBe(150)
    expect(r.avgCost).toBeCloseTo((100_000 + 100 + 120_000) / 200, 4)
  })
  it('取引の後の分割は、数量 × 係数・単価 ÷ 係数で今の基準にそろえる', () => {
    const r = fromLots([{ date: '2024-03-01', side: 'buy', quantity: 10, price: 3000 }], [{ date: '2024-09-20', ratio: 10 }])
    expect(r.quantity).toBe(100)
    expect(r.avgCost).toBe(300)
  })
  it('すべて売ったら 0 に戻る', () => {
    const r = fromLots([
      { date: '2024-01-10', side: 'buy', quantity: 100, price: 1000 },
      { date: '2024-02-10', side: 'sell', quantity: 100, price: 1100 },
    ])
    expect(r).toEqual({ quantity: 0, avgCost: 0 })
  })
})

describe('保有の JSON（FR-H8, H9）', () => {
  const cur: Holding[] = [
    { code: '8058', account: 'nisa_growth', quantity: 300, avgCost: 2680.5, price: 3300, broker: 'rakuten' },
    { code: '7203', account: 'tokutei', quantity: 100, avgCost: 2500 },
  ]
  it('書き出しには形式・版・銘柄名が入り、取り込みの差分は追加・更新・同じ・取り込めないに分かれる', () => {
    const json = exportHoldings(cur, (c) => (c === '8058' ? '三菱商事' : ''), 'elecxstock 0.1.0', new Date('2026-11-13T12:00:00Z'))
    const o = JSON.parse(json)
    expect(o.format).toBe('elecxstock.holdings')
    expect(o.holdings[0].name).toBe('三菱商事')
    expect(o.holdings[0]).not.toHaveProperty('price') // 市場データ（CSV の現在値）は書き出さない
    o.holdings[1].quantity = 200
    o.holdings.push({ code: '8951', account: 'tokutei', quantity: 10, avgCost: 118400, broker: '○○証券' })
    o.holdings.push({ code: '9999', account: 'tokutei', quantity: 1, avgCost: 1 })
    o.holdings.push({ code: '8306', account: 'unknown', quantity: 1, avgCost: 1 })
    const p = previewImport(JSON.stringify(o), cur, (c) => c !== '9999')
    expect(p.same.map((h) => h.code)).toEqual(['8058'])
    expect(p.update.map((h) => h.code)).toEqual(['7203'])
    // 一覧に無いコード（別の PC で足した銘柄など）も取り込み、銘柄を足す対象として挙げる
    expect(p.add.map((h) => h.code)).toEqual(['8951', '9999'])
    expect(p.unknown).toEqual(['9999'])
    expect(p.rejected.map((r) => r.code)).toEqual(['8306'])
    expect(p.meta).toBeNull()
    expect(applyImport(cur, p.holdings, 'merge')).toHaveLength(4)
    expect(applyImport([...cur, { code: '9432', account: 'ippan', quantity: 1, avgCost: 1 }], p.holdings, 'replace')).toHaveLength(4)
  })
  it('CSV の累計（実現損益・配当金）も書き出し、別の PC で取り込める', () => {
    const meta = { broker: 'rakuten', importedAt: '2026-11-13T17:42:59.504Z', realized: 1000, dividends: 2000 }
    const json = exportHoldings(cur, () => '', 'elecxstock 0.1.0', new Date('2026-11-13T12:00:00Z'), meta)
    expect(previewImport(json, [], () => true).meta).toEqual(meta)
  })
  it('別の形式・新しすぎる版は取り込まない', () => {
    expect(() => previewImport('{"format":"other","version":1,"holdings":[]}', cur, () => true)).toThrow()
    expect(() => previewImport('{"format":"elecxstock.holdings","version":99,"holdings":[]}', cur, () => true)).toThrow()
  })
})
