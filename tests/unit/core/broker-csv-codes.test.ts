import { parseRakutenCsv } from '@core/brokers/rakuten'
import { CODE_RE } from '@shared/code'
import { describe, expect, it } from 'vitest'

describe('楽天証券の CSV: 5 桁のコード（優先株）も読む（FR-U5）', () => {
  it('94345 を保有として取り込む', () => {
    const csv = [
      '"種別","銘柄コード・ティッカー","銘柄","口座","保有数量","［単位］","平均取得価額","［単位］","現在値","［単位］","現在値(更新日)","(参考為替)","前日比","［単位］","時価評価額[円]","時価評価額[外貨]","評価損益[円]","評価損益[％]"',
      '"国内株式","94345","架空の優先株","特定","100","株","1,000.00","円","1,100.0","円","","","0.0","円","110,000","-","+10,000","+10.00"',
    ].join('\r\n')
    const p = parseRakutenCsv(csv, '2026-11-14T00:00:00.000Z')
    expect(p.holdings.map((x) => x.code)).toEqual(['94345'])
    expect(p.skipped).toEqual([])
  })
  it('銘柄コードの形は 1 か所で決める', () => {
    for (const c of ['7203', '130A', '94345', '25935']) expect(CODE_RE.test(c)).toBe(true)
    for (const c of ['123', '723456', '72-3', 'abcd']) expect(CODE_RE.test(c)).toBe(false)
  })
})
