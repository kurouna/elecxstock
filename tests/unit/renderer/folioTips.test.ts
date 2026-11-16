// ポートフォリオのグラフのツールチップの文言（FR-PF1・PF5・PF7）。値は架空
import { describe, expect, it } from 'vitest'
import type { DivGroupRow, DivRow, FRow, Tile } from '../../../src/renderer/lib/folio'
import {
  contribTip,
  divStepTip,
  donutOtherTip,
  donutTip,
  dpsTip,
  eventTip,
  histStepTip,
  tileTip,
  trendIndexAt,
  trendLabel,
  yen,
} from '../../../src/renderer/lib/folioTips'

const tr = (k: string, v?: Record<string, string | number>) => (v ? `${k}${JSON.stringify(v)}` : k)
const row = (code: string, x: Partial<DivRow>) =>
  ({ code, name: `n${code}`, annual: 0, annualPrev: 0, raise: 0, qty: 0, factor: '', ...x }) as DivRow
const group = (key: string, rows: DivRow[], x: Partial<DivGroupRow> = {}) =>
  ({
    key,
    rows,
    annual: rows.reduce((s, r) => s + r.annual, 0),
    annualPrev: rows.reduce((s, r) => s + r.annualPrev, 0),
    raise: rows.reduce((s, r) => s + r.raise, 0),
    qty: rows.reduce((s, r) => s + r.qty, 0),
    yld: 3.21,
    yoc: null,
    ...x,
  }) as DivGroupRow

describe('ポートフォリオのツールチップ（FR-PF7）', () => {
  it('円は桁区切り。符号は + − ±', () => {
    expect(yen(1234567)).toBe('¥1,234,567')
    expect(yen(-1200, true)).toBe('−¥1,200')
    expect(yen(0.2, true)).toBe('±¥0')
  })
  it('配当の内訳のスライス: 額と割合・前年比の内訳・利回り。分類なら銘柄を額の順に（多ければまとめる）', () => {
    const rs = [row('A', { annual: 3000, annualPrev: 2000, raise: 600, qty: 400 }), row('B', { annual: 1000 }), row('C', { annual: 500 })]
    const lines = donutTip(group('食品', rs), 10000, '食品', false, tr, 2).split('\n')
    expect(lines[0]).toBe('食品')
    expect(lines[1]).toBe('folio.annualNet ¥4,500（45.0%）')
    expect(lines[2]).toBe('folio.yoy +¥2,500（folio.fx.raise +¥600・folio.fx.qty +¥400）')
    expect(lines[3]).toBe('folio.yieldYoc 3.21% / —')
    expect(lines.slice(4)).toEqual(['folio.tip.count{"n":3}', '  A nA  ¥3,000', '  B nB  ¥1,000', 'folio.tip.more{"n":1,"amt":"¥500"}'])
    // 銘柄で分けたときは銘柄の一覧を出さない
    expect(donutTip(group('A', rs.slice(0, 1)), 10000, 'A nA', true, tr).split('\n')).toHaveLength(4)
  })
  it('配当の内訳の「その他」: まとめた分類の数・合計と分類ごとの額', () => {
    const gs = [group('x', [row('X', { annual: 300 })]), group('y', [row('Y', { annual: 200 })])]
    expect(donutOtherTip(gs, 1000, (g) => g.key, tr).split('\n')).toEqual([
      'folio.other（2）',
      'folio.annualNet ¥500（50.0%）',
      '  x  ¥300',
      '  y  ¥200',
    ])
  })
  it('増減要因の棒: その要因の銘柄を額の大きい順に。一部売却は印を付ける。無ければ該当なし。両端は銘柄の数', () => {
    const rs = [
      row('A', { annual: 900, annualPrev: 800, raise: 100 }),
      row('B', { annual: 0, annualPrev: 500, qty: -500, factor: 'sold' }),
      row('C', { annual: 200, annualPrev: 400, qty: -200, factor: 'trim' }),
      row('D', { annual: 300, qty: 300, factor: 'new' }),
    ]
    expect(divStepTip('sold', -700, rs, tr).split('\n')).toEqual([
      'folio.dwf.sold −¥700',
      '  B nB  −¥500',
      '  C nC（folio.fx.trim）  −¥200',
    ])
    expect(divStepTip('raise', 100, rs, tr).split('\n')).toEqual(['folio.dwf.raise +¥100', '  A nA  +¥100'])
    expect(divStepTip('cut', 0, rs, tr).split('\n')).toEqual(['folio.dwf.cut ±¥0', 'folio.tip.none'])
    expect(divStepTip('prev', 1700, rs, tr).split('\n')).toEqual(['folio.dwf.prev ¥1,700', 'folio.tip.count{"n":3}'])
    expect(divStepTip('now', 1400, rs, tr).split('\n')).toEqual(['folio.dwf.now ¥1,400', 'folio.tip.count{"n":3}'])
  })
})

describe('ポートフォリオのツールチップ（FR-PF5）', () => {
  it('資産構成のタイル: 口座をまたいで足した評価額・割合・含み損益・前日比', () => {
    const r = (x: Partial<FRow>) => ({ code: '7203', name: 'n7203', value: 0, cost: 0, pnl: 0, dayPnl: 0, ...x }) as FRow
    const t = {
      item: {
        key: '7203',
        rows: [r({ value: 60000, cost: 50000, pnl: 10000, dayPnl: 1000 }), r({ value: 40000, cost: 50000, pnl: -10000, dayPnl: 1000 })],
      },
    } as Tile
    expect(tileTip(t, 400000, tr).split('\n')).toEqual([
      '7203 n7203',
      'folio.value ¥100,000（25.0%）',
      'folio.pnl ±¥0（±0.0%）',
      'folio.heatDay +¥2,000（+2.0%）',
    ])
  })
  it('損益寄与の行: 値動き・配当・計。売った銘柄はその旨', () => {
    expect(contribTip({ code: 'A', name: 'nA', price: -3000, div: 500 }, tr).split('\n')).toEqual([
      'A nA',
      'folio.tip.price −¥3,000',
      'folio.tip.div +¥500',
      'folio.tip.total −¥2,500',
    ])
    expect(contribTip({ code: 'A', name: 'nA', price: 0, div: 0, soldOn: '2026-10-01' }, tr).split('\n').at(-1)).toBe(
      'folio.soldTip{"d":"2026-10-01"}',
    )
  })
})

describe('ポートフォリオのツールチップ（FR-PF7）: 1 株配当（5 年）と年間配当の推移', () => {
  it('1 株配当（5 年）: 年ごとの値（古い順）と右端の色の意味。増配・減配は増減率も', () => {
    expect(dpsTip([40, 45, null, 50, 60], false, tr).split('\n')).toEqual([
      'folio.dps.head',
      '  folio.dps.ago{"n":4}  40',
      '  folio.dps.ago{"n":3}  45',
      '  folio.dps.ago{"n":2}  —',
      '  folio.dps.ago{"n":1}  50',
      '  folio.dps.last  60',
      'folio.dps.gold（+20.0%）',
    ])
    expect(dpsTip([50, 40], false, tr).split('\n').at(-1)).toBe('folio.dps.down（−20.0%）')
    expect(dpsTip([null, 40], false, tr).split('\n').at(-1)).toBe('folio.dps.flat')
    // 分類の行は 1 株配当 × 今の株数（円）。0 の年は —
    expect(dpsTip([0, 12000], true, tr).split('\n')).toEqual([
      'folio.dps.group',
      '  folio.dps.ago{"n":1}  —',
      '  folio.dps.last  ¥12,000',
      'folio.dps.gold',
    ])
  })
  it('年間配当の推移: マウスの位置に近い記録（図の右 50px は値の文字。端は寄せる）と、その日の値・最初からの増減', () => {
    expect(trendIndexAt(0, 250, 5)).toBe(0)
    expect(trendIndexAt(100, 250, 5)).toBe(2)
    expect(trendIndexAt(240, 250, 5)).toBe(4)
    expect(trendIndexAt(-5, 250, 5)).toBe(0)
    expect(trendIndexAt(10, 250, 1)).toBe(0)
    const tr2 = [
      { d: '2026-01-05', v: 100000 },
      { d: '2026-02-02', v: 98000 },
    ]
    expect(trendLabel(tr2, 1, tr)).toBe('folio.trendAt{"d":"2026/02/02","v":"¥98,000","dv":"−¥2,000"}')
    expect(trendLabel(tr2, 5, tr)).toBe('')
  })
})

describe('ポートフォリオのツールチップ（FR-PF3・PF6）: 期間の内訳と今後 30 日の予定', () => {
  it('期間の内訳: 期首・期末は日付、入出金・評価損益の増減は意味を添える', () => {
    expect(histStepTip('start', 1000000, '2026-05-01', '2026-11-13', tr)).toBe('folio.wf.start ¥1,000,000（2026/05/01）')
    expect(histStepTip('end', 1200000, '2026-05-01', '2026-11-13', tr)).toBe('folio.wf.end ¥1,200,000（2026/11/13）')
    expect(histStepTip('flow', 50000, null, null, tr).split('\n')).toEqual(['folio.wf.flow +¥50,000', 'folio.wfTip.flow'])
    expect(histStepTip('move', -3000, null, null, tr).split('\n')).toEqual(['folio.wf.move −¥3,000', 'folio.wfTip.move'])
  })
  it('予定の印: 日付・あと何日・種類・銘柄と、種類ごとの値（権利は配当見込み・決算は株数・アラートは条件）', () => {
    const e = { day: 3, date: '2026-11-16', code: '8058', name: 'n8058' }
    expect(eventTip({ ...e, type: 'rights', amount: 12000 }, tr).split('\n')).toEqual([
      '2026/11/16（folio.inDays{"n":3}）folio.ev.rightsLong',
      '8058 n8058',
      'folio.ev.amount{"v":"12,000"}',
    ])
    expect(
      eventTip({ ...e, type: 'earnings', qty: 1200 }, tr)
        .split('\n')
        .at(-1),
    ).toBe('folio.ev.qty{"n":"1,200"}')
    expect(eventTip({ ...e, day: 0, type: 'alert', text: '終値 ≥ 5,000' }, tr).split('\n')).toEqual([
      '2026/11/16（folio.ev.met）folio.ev.alertLong',
      '8058 n8058',
      '終値 ≥ 5,000',
    ])
    expect(eventTip({ ...e, day: 0, type: 'rights' }, tr).split('\n')).toEqual([
      '2026/11/16（folio.today）folio.ev.rightsLong',
      '8058 n8058',
    ])
  })
})
