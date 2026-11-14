// 楽天証券の保有商品の CSV（FR-H11）: 読み取り・口座区分・対象外の行・差分。値はすべて架空
import { parseRakutenCsv, splitCsvLine } from '@core/brokers/rakuten'
import { previewBrokerCsv } from '@core/holdings'
import type { Holding } from '@shared/types'
import { describe, expect, it } from 'vitest'

const CSV = [
  '"■資産合計欄"',
  '"","時価評価額[円]","前日比[円]","前日比[％]","前月比[円]","前月比[％]","評価損益[円]","評価損益[％]","","実現損益[円]","配当金・分配金・利金[円貨]","配当金・分配金・利金[外貨]"',
  '"資産合計","1,000,000","-1,000","-0.10","0","0.00","+100,000","-","","+5,000","20,000","0.00 USドル"',
  '',
  '"保有商品の評価額合計","1,000,000","-1,000","-0.10","0","0.00","+100,000","-","","","",""',
  '"国内株式","900,000","-1,000","-0.11","0","0.00","+100,000","-","","+5,000","18,000",""',
  '"投資信託","0","0","0.00","0","0.00","0","-","","-","0",""',
  '',
  '"■ 保有商品詳細 (すべて）"',
  '',
  '"種別","銘柄コード・ティッカー","銘柄","口座","保有数量","［単位］","平均取得価額","［単位］","現在値","［単位］","現在値(更新日)","(参考為替)","前日比","［単位］","時価評価額[円]","時価評価額[外貨]","評価損益[円]","評価損益[％]"',
  '"国内株式","7203","トヨタ自動車","特定","200","株","2,500.50","円","3,000.0","円","","","+10.0","円","600,000","-","+99,900","+19.98"',
  '"国内株式","9432","ＮＴＴ","NISA成長投資枠","1,000","株","150.00","円","160.0","円","","","+0.5","円","160,000","-","+10,000","+6.67"',
  '"国内株式","401A","架空ホテルリート","旧NISA","2","口","90,000.00","円","70,000.0","円","","","0.0","円","140,000","-","-40,000","-22.22"',
  '"国内株式","7203","トヨタ自動車","特定","100","株","2,800.00","円","3,000.0","円","","","+10.0","円","300,000","-","+20,000","+7.14"',
  '"国内株式","8306","三菱ＵＦＪ","不明な口座","100","株","1,000.00","円","1,500.0","円","","","0.0","円","150,000","-","+50,000","+50.00"',
  '"楽天・マネーファンド","","楽天・マネーファンド","特定","10,000","口","-","-","-","-","","","-","-","10,000","-","-","-"',
  '',
  '',
  '"■参考為替レート"',
  '"米ドル","150.00","円/USD","(11/14  01:20)"',
].join('\r\n')

describe('楽天証券の CSV（FR-H11）', () => {
  it('囲みの中のカンマを欄の区切りにしない', () => {
    expect(splitCsvLine('"a","1,234","x""y",z')).toEqual(['a', '1,234', 'x"y', 'z'])
  })
  it('国内株式の行だけを読み、口座区分・数量・平均取得価額・現在値・累計を取り出す', () => {
    const p = parseRakutenCsv(CSV, '2026-11-14T00:00:00.000Z')
    expect(p.holdings.map((h) => `${h.code}/${h.account}/${h.quantity}/${h.avgCost}`)).toEqual([
      '7203/tokutei/200/2500.5',
      '9432/nisa_growth/1000/150',
      '401A/nisa_legacy/2/90000',
      '7203/tokutei/100/2800',
    ])
    expect(p.holdings[1]).toMatchObject({ name: 'NTT', price: 160, broker: 'rakuten', importedAt: '2026-11-14T00:00:00.000Z' })
    expect(p.skipped.map((s) => s.reason)).toEqual(['unknown-account', 'out-of-scope'])
    expect(p.summary).toEqual({ realized: 5000, dividends: 18000 })
  })
  it('楽天証券の CSV でなければエラーにする', () => {
    expect(() => parseRakutenCsv('code,date\n7203,2026-01-01')).toThrow()
  })
  it('取り込むと CSV の内容にすべて置き換わる: 同じ銘柄・口座区分は数量で重み付けして 1 つにし、CSV に無い保有は「無くなる」', () => {
    const cur: Holding[] = [
      { code: '9432', account: 'nisa_growth', quantity: 1000, avgCost: 150 },
      { code: '8058', account: 'tokutei', quantity: 100, avgCost: 3000 },
      { code: '7203', account: 'tokutei', quantity: 100, avgCost: 2000 },
    ]
    const p = previewBrokerCsv(CSV, cur, (c) => c !== '401A', new Date('2026-11-14T00:00:00Z'))
    const toyota = p.holdings.find((h) => h.code === '7203')!
    expect(toyota.quantity).toBe(300)
    expect(toyota.avgCost).toBeCloseTo((2500.5 * 200 + 2800 * 100) / 300, 6)
    expect(p.same.map((h) => h.code)).toEqual(['9432'])
    expect(p.update.map((h) => h.code)).toEqual(['7203'])
    expect(p.add.map((h) => h.code)).toEqual(['401A'])
    expect(p.removed.map((h) => h.code)).toEqual(['8058'])
    expect(p.unknown).toEqual(['401A'])
    expect(p.meta).toEqual({ broker: 'rakuten', importedAt: '2026-11-14T00:00:00.000Z', realized: 5000, dividends: 18000 })
  })
})
