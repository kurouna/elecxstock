// スクリーニングの判定（§5.2）: 数値の閾値・欠損の扱い・属性（市場・業種・種別）・お気に入り・無効な条件
import { describe, expect, it } from 'vitest'
import { runScreen, screenable } from '../../../src/core/screener'
import type { Instrument, MetricsRow } from '../../../src/shared/types'

const ins = (
  code: string,
  market: Instrument['market'],
  kind: Instrument['kind'],
  sectorJa: string,
  extra: Partial<Instrument> = {},
): Instrument => ({
  id: `JP:${code}`,
  code,
  nameJa: code,
  nameEn: code,
  market,
  kind,
  sectorJa,
  sectorEn: '',
  status: 'active',
  userAdded: false,
  ...extra,
})
const m = (code: string, yieldTrailing: number | null) => ({ id: `JP:${code}`, close: 1000, yieldTrailing }) as unknown as MetricsRow

const instruments = [
  ins('8306', 'P', 'stock', '銀行業'),
  ins('7203', 'P', 'stock', '輸送用機器'),
  ins('8951', 'R', 'reit', ''),
  ins('1306', 'E', 'etf', '', { userAdded: true }), // ETF は利用者が足したときだけデータがある
]
const metrics = new Map([m('8306', 3.6), m('7203', 2.4), m('8951', 4.1), m('1306', null)].map((x) => [x.id, x]))
const run = (conditions: Parameters<typeof runScreen>[0]['conditions'], favorites: string[] = []) =>
  runScreen({ conditions, instruments, metrics, favorites: new Set(favorites), watchlists: {} }).ids

describe('runScreen（FR-SC1, SC2, SC8, SC9, SC10）', () => {
  it('廃止した銘柄と、取得をやめた銘柄（プライム・J-REIT から外れ、ウォッチリストにも無い）は対象にしない（FR-U4, U8）', () => {
    const extra = [
      ins('9999', 'P', 'stock', '銀行業', { status: 'delisted' }),
      ins('8888', 'S', 'stock', '銀行業'),
      ins('7777', 'S', 'stock', '銀行業', { userAdded: true }),
    ]
    const ms = new Map([...metrics, ...[m('9999', 5), m('8888', 5), m('7777', 5)].map((x) => [x.id, x] as const)])
    const r = runScreen({
      conditions: [{ field: 'income.yield', op: '>=', value: 3.5 }],
      instruments: [...instruments, ...extra],
      metrics: ms,
      favorites: new Set(),
      watchlists: {},
    })
    expect(r.ids).toEqual(['JP:8306', 'JP:8951', 'JP:7777'])
    expect(extra.map(screenable)).toEqual([false, false, true])
  })
  it('数値の閾値と、欠損の除外・含める', () => {
    expect(run([{ field: 'income.yield', op: '>=', value: 3.5 }])).toEqual(['JP:8306', 'JP:8951'])
    expect(run([{ field: 'income.yield', op: '>=', value: 3.5, includeMissing: true }])).toEqual(['JP:8306', 'JP:8951', 'JP:1306'])
  })
  it('業種・種別・市場（in / notin）', () => {
    expect(run([{ field: 'attr.sector', op: 'in', value: ['銀行業', '輸送用機器'] }])).toEqual(['JP:8306', 'JP:7203'])
    expect(run([{ field: 'attr.kind', op: 'notin', value: ['stock'] }])).toEqual(['JP:8951', 'JP:1306'])
    expect(run([{ field: 'attr.market', op: 'in', value: ['R'] }])).toEqual(['JP:8951'])
  })
  it('「または」はすぐ上の条件とまとめ、まとまりどうしは「かつ」（FR-SC5）', () => {
    // (業種 = 銀行業 または 種別 = REIT) かつ 利回り ≥ 3.5
    expect(
      run([
        { field: 'attr.sector', op: 'in', value: ['銀行業'] },
        { field: 'attr.kind', op: 'in', value: ['reit'], or: true },
        { field: 'income.yield', op: '>=', value: 3.5 },
      ]),
    ).toEqual(['JP:8306', 'JP:8951'])
  })
  it('相対条件: 終値 ≥ 75日移動平均 +x%（FR-SC5）', () => {
    const mm = new Map(metrics)
    mm.set('JP:8306', { ...mm.get('JP:8306')!, ma75: 900 })
    mm.set('JP:7203', { ...mm.get('JP:7203')!, ma75: 1100 })
    const ids = (value: number) =>
      runScreen({
        conditions: [{ field: 'price.close', op: '>=', value, ref: 'price.ma75' }],
        instruments,
        metrics: mm,
        favorites: new Set(),
        watchlists: {},
      }).ids
    expect(ids(0)).toEqual(['JP:8306'])
    expect(ids(15)).toEqual([]) // 900 × 1.15 = 1035 > 1000
  })
  it('権利確定月のような複数の値を持つ指標は、1 つでも当たれば含まれる', () => {
    const mm = new Map(metrics)
    mm.set('JP:8306', { ...mm.get('JP:8306')!, recordMonths: [3, 9] })
    mm.set('JP:7203', { ...mm.get('JP:7203')!, recordMonths: [6] })
    const r = runScreen({
      conditions: [{ field: 'income.recordMonth', op: 'in', value: ['9', '12'] }],
      instruments,
      metrics: mm,
      favorites: new Set(),
      watchlists: {},
    })
    expect(r.ids).toEqual(['JP:8306'])
  })
  it('お気に入りと、今の版に無い条件は無効として外す', () => {
    const r = runScreen({
      conditions: [
        { field: 'user.favorite', op: '=', value: true },
        { field: 'no.such', op: '>=', value: 0 },
      ],
      instruments,
      metrics,
      favorites: new Set(['JP:7203']),
      watchlists: {},
    })
    expect(r.ids).toEqual(['JP:7203'])
    expect(r.invalid).toEqual([1])
  })
  it('保有: 持っている銘柄と、評価損益率（口座区分をまたいで合計）で絞り込む', () => {
    const close = metrics.get('JP:7203')!.close!
    const holdings = new Map([['JP:7203', { qty: 100, cost: close * 100 * 0.8 }]]) // 取得価額は今の 8 割 → +25%
    const held = runScreen({
      conditions: [{ field: 'user.held', op: '=', value: true }],
      instruments,
      metrics,
      favorites: new Set(),
      watchlists: {},
      holdings,
    })
    expect(held.ids).toEqual(['JP:7203'])
    const notHeld = runScreen({
      conditions: [{ field: 'user.held', op: '=', value: false }],
      instruments,
      metrics,
      favorites: new Set(),
      watchlists: {},
      holdings,
    })
    expect(notHeld.ids).not.toContain('JP:7203')
    const gain = runScreen({
      conditions: [{ field: 'holding.pnlPct', op: '>=', value: 20 }],
      instruments,
      metrics,
      favorites: new Set(),
      watchlists: {},
      holdings,
    })
    expect(gain.ids).toEqual(['JP:7203'])
    const loss = runScreen({
      conditions: [{ field: 'holding.pnlPct', op: '<=', value: 0 }],
      instruments,
      metrics,
      favorites: new Set(),
      watchlists: {},
      holdings,
    })
    expect(loss.ids).toEqual([])
  })
})

describe('無効な条件と「または」（FR-SC5, FR-SC11）', () => {
  const mk = (code: string, yieldTrailing: number, per: number) =>
    ({ id: `JP:${code}`, close: 1000, yieldTrailing, per }) as unknown as MetricsRow
  const ins4 = ['1', '2', '3', '4'].map((code) => ({
    id: `JP:${code}`,
    code,
    nameJa: code,
    nameEn: code,
    market: 'P' as const,
    kind: 'stock' as const,
    sectorJa: '',
    sectorEn: '',
    status: 'active' as const,
    userAdded: false,
  }))
  // 1: 利回り 5・PER 10 / 2: 利回り 5・PER 30 / 3: 利回り 2・PER 10 / 4: 利回り 2・PER 30
  const ms = new Map([mk('1', 5, 10), mk('2', 5, 30), mk('3', 2, 10), mk('4', 2, 30)].map((x) => [x.id, x]))
  const screen = (conditions: Parameters<typeof runScreen>[0]['conditions']) =>
    runScreen({ conditions, instruments: ins4, metrics: ms, favorites: new Set(), watchlists: {} })
  it('無効な条件のすぐ下の「または」は、前の「かつ」のまとまりに入らない（利回り かつ（無効 または PER））', () => {
    const r = screen([
      { field: 'income.yield', op: '>=', value: 4 },
      { field: 'holding.weight', op: '<=', value: 3 }, // 保有の記録が無いので無効
      { field: 'value.per', op: '<=', value: 15, or: true },
    ])
    expect(r.invalid).toEqual([1])
    expect(r.ids).toEqual(['JP:1'])
  })
  it('まとまりの条件がすべて無効なら、そのまとまりだけを外す', () => {
    const r = screen([
      { field: 'income.yield', op: '>=', value: 4 },
      { field: 'holding.weight', op: '<=', value: 3 },
      { field: 'holding.yoc', op: '>=', value: 3, or: true },
    ])
    expect(r.invalid).toEqual([1, 2])
    expect(r.ids.sort()).toEqual(['JP:1', 'JP:2'])
  })
  it('先頭の条件の「または」は無視する（前にまとまりが無い）', () => {
    const r = screen([
      { field: 'income.yield', op: '>=', value: 4, or: true },
      { field: 'value.per', op: '<=', value: 15 },
    ])
    expect(r.ids).toEqual(['JP:1'])
  })
})
