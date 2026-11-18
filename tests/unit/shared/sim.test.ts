// 配当シミュレータの計算（docs/design-simulator.md §4・§5。L1）。値はすべて架空
import { addDays, isTradingDay } from '@shared/calendar'
import { baseDate, buildPx, cutCount, hold, maxDrawdown, monthEnds, priceAt, ratioOrNull } from '@shared/sim/backtest'
import { annualOf, monthShares, pickStressYear, stressRatios, yearTotals } from '@shared/sim/forecast'
import { groupKey, peerPath, pickPeers, rankIn } from '@shared/sim/peers'
import { type SimStock, simulate } from '@shared/sim/run'
import { DEFAULT_SIM, type SimSettings } from '@shared/sim/types'
import type { Dividend } from '@shared/types'
import { describe, expect, it } from 'vitest'

const TODAY = '2026-11-13'
/** from〜to の営業日の終値（f は日付から） */
function daily(from: string, to: string, f: (d: string) => number = () => 1000): { d: string; c: number }[] {
  const out: { d: string; c: number }[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) if (isTradingDay(d)) out.push({ d, c: f(d) })
  return out
}
/** 年 2 回（3 月・9 月の 27 日以降の最初の営業日）の配当 */
function semi(fromYear: number, toYear: number, amount: number | ((y: number, h: 0 | 1) => number) = 10): Dividend[] {
  const out: Dividend[] = []
  for (let y = fromYear; y <= toYear; y++)
    for (const [h, m] of [
      [0, '03'],
      [1, '09'],
    ] as const) {
      let d = `${y}-${m}-27`
      while (!isTradingDay(d)) d = addDays(d, 1)
      out.push({ date: d, amount: typeof amount === 'number' ? amount : amount(y, h) })
    }
  return out
}
const NET = 1 - 0.20315

describe('FR-SIM2 価格の引き方（日足の範囲と月末の終値）', () => {
  const px = buildPx(
    [
      { d: '2020-01-01', c: 100 },
      { d: '2020-02-01', c: 110 },
      { d: '2020-03-01', c: 999 },
    ],
    [
      { d: '2020-03-10', c: 120 },
      { d: '2020-03-12', c: 125 },
    ],
  )
  it('日足の範囲より前は、その月の月末の終値', () => {
    expect(priceAt(px, '2020-01-15')).toBe(100)
    expect(priceAt(px, '2020-02-03')).toBe(110)
  })
  it('日足の範囲では、その日以前の最後の終値（売買停止の日は前の終値）', () => {
    expect(priceAt(px, '2020-03-10')).toBe(120)
    expect(priceAt(px, '2020-03-11')).toBe(120)
    expect(priceAt(px, '2020-03-31')).toBe(125)
  })
  it('日足の最初の月の、最初の日足より前は月次の値', () => {
    expect(priceAt(px, '2020-03-02')).toBe(999)
  })
  it('記録より前は null', () => {
    expect(priceAt(px, '2019-12-31')).toBeNull()
  })
})

describe('FR-SIM2 基準日と月末の点', () => {
  it('N 年前の同じ日以前の最後の取引日', () => {
    expect(baseDate(TODAY, 3)).toBe('2023-11-13')
    expect(baseDate(TODAY, 5)).toBe('2021-11-12') // 2021-11-13 は土曜
  })
  it('基準日・月末ごと・今日', () => {
    const e = monthEnds('2023-11-13', TODAY)
    expect(e[0]).toBe('2023-11-13')
    expect(e[1]).toBe('2023-11-30')
    expect(e.at(-2)).toBe('2026-10-31')
    expect(e.at(-1)).toBe(TODAY)
    expect(e.length).toBe(38)
  })
})

describe('FR-SIM2 買い持ち（受取・再投資・税）', () => {
  const px = buildPx([], daily('2023-01-04', TODAY))
  const divs = semi(2023, 2026)
  const base = '2023-11-13'
  const ends = monthEnds(base, TODAY)
  it('受け取る・税引前: 元本 ÷ 終値の株数で、基準日より後の権利落ちを受け取る', () => {
    const o = hold({ px, divs, base, amount: 1_000_000, reinvest: false, net: 1 }, ends)!
    expect(o.shares0).toBe(1000)
    expect(o.events.length).toBe(6) // 2024-03 から 2026-09 まで
    expect(o.received).toBeCloseTo(60_000)
    expect(o.path.at(-1)!.v).toBeCloseTo(1_000_000)
    expect(o.path[0]!.r).toBe(0)
  })
  it('税引後 20.315%', () => {
    const o = hold({ px, divs, base, amount: 1_000_000, reinvest: false, net: NET }, ends)!
    expect(o.received).toBeCloseTo(60_000 * NET)
  })
  it('再投資: 税引後の額で権利落ち日の終値で買い増す。増えた株の配当を分けて数える', () => {
    const o = hold({ px, divs, base, amount: 1_000_000, reinvest: true, net: 1 }, ends)!
    expect(o.shares).toBeCloseTo(1000 * 1.01 ** 6)
    expect(o.path.at(-1)!.v).toBeCloseTo(1_000_000 * 1.01 ** 6)
    expect(o.received).toBeCloseTo(o.path.at(-1)!.v - 1_000_000)
    expect(o.events.reduce((s, e) => s + e.extra, 0)).toBeCloseTo(o.received - 60_000)
  })
  it('基準日に権利落ちした配当は受け取らない', () => {
    const o = hold({ px, divs: [{ date: base, amount: 50 }], base, amount: 1_000_000, reinvest: false, net: 1 }, ends)!
    expect(o.received).toBe(0)
  })
  it('基準日に価格が無ければ null', () => {
    expect(hold({ px: buildPx([], daily('2024-01-04', TODAY)), divs, base, amount: 1, reinvest: false, net: 1 }, ends)).toBeNull()
  })
  it('基準日が日足の範囲より前: その月の月末の終値で買い、月末までの権利落ちは受け取らない', () => {
    const pm = buildPx(
      [
        { d: '2021-11-01', c: 500 },
        { d: '2021-12-01', c: 600 },
      ],
      daily('2022-01-04', TODAY, () => 800),
    )
    const o = hold(
      {
        px: pm,
        divs: [
          { date: '2021-11-26', amount: 5 },
          { date: '2021-12-27', amount: 5 },
        ],
        base: '2021-11-12',
        amount: 1_000_000,
        reinvest: false,
        net: 1,
      },
      monthEnds('2021-11-12', TODAY),
    )!
    expect(o.buy).toBe(500)
    expect(o.monthlyBuy).toBe(true)
    expect(o.received).toBeCloseTo(2000 * 5) // 12 月の 1 回だけ
  })
  it('再投資の日に終値が無ければ、その前の最後の終値で買う', () => {
    const gap = daily('2023-01-04', TODAY).filter((b) => b.d !== '2024-03-27')
    const o = hold(
      { px: buildPx([], gap), divs: [{ date: '2024-03-27', amount: 10 }], base, amount: 1_000_000, reinvest: true, net: 1 },
      ends,
    )!
    expect(o.shares).toBeCloseTo(1010)
  })
})

describe('FR-SIM2 最大下落率・減配の回数・0 で割らない', () => {
  it('最大下落率は山からの最大の下げ', () => {
    expect(maxDrawdown([100, 120, 90, 130, 65])).toBeCloseTo(0.5)
    expect(maxDrawdown([100, 110])).toBe(0)
    expect(maxDrawdown([])).toBe(0)
  })
  it('減配の回数: 期間の中で 1 株配当の年（直近 N 回）が前年を下回った回数', () => {
    const d = semi(2019, 2026, (y) => (y === 2023 ? 5 : 10))
    expect(cutCount(d, '2021-11-12', TODAY, 5)).toBe(1)
    expect(cutCount(semi(2019, 2026), '2021-11-12', TODAY, 5)).toBe(0)
  })
  it('分母が 0 なら null', () => {
    expect(ratioOrNull(1, 0)).toBeNull()
    expect(ratioOrNull(3, 2)).toBeCloseTo(1.5)
  })
})

describe('FR-SIM3 同業種の相手', () => {
  const cand = (id: string, key33: string, key17: string, market = 'P', ratio = 1) => ({
    id,
    key33,
    key17,
    market,
    ratio,
    path: [1, ratio],
  })
  it('業種の分け方: J-REIT はまとめて 1 つ、ETF と業種の無い銘柄は比べない', () => {
    expect(groupKey({ kind: 'reit', market: 'R', sector33: '' }, 's33')).toBe('REIT')
    expect(groupKey({ kind: 'etf', market: 'E', sector33: '' }, 's33')).toBeNull()
    expect(groupKey({ kind: 'stock', market: 'P', sector33: '' }, 's33')).toBeNull()
    expect(groupKey({ kind: 'stock', market: 'P', sector33: '銀行業' }, 's33')).toBe('銀行業')
    expect(groupKey({ kind: 'stock', market: 'P', sector33: '保険業' }, 's17')).toBe('金融（除く銀行）')
  })
  it('自分を外し、市場区分をそろえ、5 未満なら 17 業種へ切り替える', () => {
    const all = [
      cand('A', '保険業', '金融（除く銀行）'),
      cand('B', '保険業', '金融（除く銀行）'),
      cand('C', '保険業', '金融（除く銀行）'),
      cand('D', '保険業', '金融（除く銀行）', 'S'),
      cand('E', 'その他金融業', '金融（除く銀行）'),
      cand('F', 'その他金融業', '金融（除く銀行）'),
      cand('G', '証券、商品先物取引業', '金融（除く銀行）'),
    ]
    const sel = { id: 'A', key33: '保険業', key17: '金融（除く銀行）', market: 'P' }
    const r = pickPeers(sel, all, 's33')!
    expect(r.s17).toBe(true)
    expect(r.peers.map((p) => p.id).sort()).toEqual(['B', 'C', 'E', 'F', 'G'])
    expect(pickPeers({ ...sel, key17: '銀行' }, all, 's33')).toBeNull()
    const five = [
      ...all,
      cand('H', '保険業', '金融（除く銀行）'),
      cand('I', '保険業', '金融（除く銀行）'),
      cand('J', '保険業', '金融（除く銀行）'),
    ]
    const r33 = pickPeers(sel, five, 's33')!
    expect(r33.s17).toBe(false)
    expect(r33.peers.map((p) => p.id).sort()).toEqual(['B', 'C', 'H', 'I', 'J'])
  })
  it('比較できない銘柄があるときは、比較できた銘柄の構成比で元本の全額を配り直す', () => {
    const g1 = [cand('x', 'a', 'a', 'P', 1.2), cand('y', 'a', 'a', 'P', 1.4)].map((c) => ({ ...c, path: [1, 1.1, c.ratio] }))
    const p = peerPath(
      [
        { amount: 500, peers: g1 },
        { amount: 500, peers: null },
      ],
      1000,
      3,
    )!
    expect(p[0]).toBeCloseTo(1000)
    expect(p[2]).toBeCloseTo(1300)
    expect(peerPath([{ amount: 500, peers: null }], 1000, 3)).toBeNull()
  })
  it('順位は「k/n」（自分を入れて数える）', () => {
    expect(rankIn(1.2, [1.5, 1.1, 1.0])).toEqual({ k: 2, n: 4 })
    expect(rankIn(2, [1.5])).toEqual({ k: 1, n: 2 })
  })
})

describe('FR-SIM4 1 年の配当と月ごとの配り方', () => {
  it('直近 N 回（年 2 回）の合計', () => {
    const r = annualOf(
      semi(2020, 2026, (_y, h) => (h ? 30 : 10)),
      TODAY,
      false,
    )
    expect(r.d0).toBe(40)
    expect(r.perYear).toBe(2)
    expect(r.years).toBeGreaterThanOrEqual(5)
  })
  it('直近 1 年に権利落ちが無ければ 0（無配）', () => {
    expect(annualOf(semi(2018, 2024), TODAY, false).d0).toBe(0)
    expect(annualOf([], TODAY, false)).toMatchObject({ d0: 0, years: 0 })
  })
  it('J-REIT は回ごとの直近 4 回の中央値 × 年の回数（一時的な増配をならす）', () => {
    const d = semi(2023, 2026, (y, h) => (y === 2026 && h === 0 ? 300 : 100))
    expect(annualOf(d, TODAY, true).d0).toBe(200)
    expect(annualOf(d, TODAY, false).d0).toBe(400)
  })
  it('月ごとの配り方は直近 1 年の回ごとの実績の比', () => {
    const s = monthShares(
      semi(2024, 2026, (_y, h) => (h ? 70 : 30)),
      TODAY,
      false,
    )
    expect(s[2]).toBeCloseTo(0.3)
    expect(s[8]).toBeCloseTo(0.7)
    expect(s.reduce((a, b) => a + b, 0)).toBeCloseTo(1)
    expect(monthShares([], TODAY, false).every((x) => x === 0)).toBe(true)
  })
})

describe('FR-SIM4 減配のストレスの年', () => {
  const yrs = (o: Record<number, number>) => new Map(Object.entries(o).map(([k, v]) => [Number(k), v]))
  const pool = [
    { id: 'A', s17: '銀行', years: yrs({ 2018: 10, 2019: 10, 2020: 6, 2021: 10, 2022: 10 }), from: 2018 },
    { id: 'B', s17: '銀行', years: yrs({ 2018: 10, 2019: 10, 2020: 8, 2021: 10, 2022: 10 }), from: 2018 },
    { id: 'C', s17: '小売', years: yrs({ 2018: 10, 2019: 10, 2020: 10, 2021: 9, 2022: 10 }), from: 2018 },
    { id: 'D', s17: '小売', years: yrs({ 2021: 10, 2022: 10 }), from: 2021 },
  ]
  it('市場全体の前年比がいちばん低い年を選ぶ', () => {
    const y = pickStressYear(pool, 2023)!
    expect(y.year).toBe(2020)
    expect(y.ratio).toBeCloseTo(24 / 30)
  })
  it('両方の年に記録のある銘柄が 50% に満たない年は候補にしない', () => {
    const thin = [
      { id: 'A', s17: null, years: yrs({ 2015: 10, 2016: 1, 2021: 10, 2022: 10 }), from: 2015 },
      { id: 'B', s17: null, years: yrs({ 2021: 10, 2022: 9 }), from: 2020 },
      { id: 'C', s17: null, years: yrs({ 2021: 10, 2022: 9.5 }), from: 2020 },
    ]
    expect(pickStressYear(thin, 2023)!.year).toBe(2022)
  })
  it('同じ前年比なら新しい年', () => {
    const flat = [{ id: 'A', s17: null, years: yrs({ 2019: 10, 2020: 10, 2021: 10, 2022: 10 }), from: 2019 }]
    expect(pickStressYear(flat, 2023)!.year).toBe(2022)
  })
  it('今年と記録の始まりの年は使わない', () => {
    const p = [{ id: 'A', s17: null, years: yrs({ 2024: 10, 2025: 10, 2026: 1 }), from: 2024 }]
    expect(pickStressYear(p, 2026)).toBeNull()
  })
  it('銘柄の r は実績 → 17 業種の中央値 → 市場全体の中央値', () => {
    const r = stressRatios(pool, 2020, [
      { id: 'A', s17: '銀行' },
      { id: 'D', s17: '小売' },
      { id: 'X', s17: '銀行' },
      { id: 'Y', s17: '医薬品' },
    ])
    expect(r.get('A')).toEqual({ r: 0.6, src: 'own' })
    expect(r.get('D')).toEqual({ r: 1, src: 's17' })
    expect(r.get('X')).toEqual({ r: 0.7, src: 's17' })
    expect(r.get('Y')).toEqual({ r: 0.8, src: 'market' })
  })
  it('暦年ごとの合計', () => {
    expect(yearTotals(semi(2024, 2025, 5))).toEqual(
      new Map([
        [2024, 10],
        [2025, 10],
      ]),
    )
  })
})

describe('FR-SIM2 FR-SIM4 FR-SIM5 組み立て（外した銘柄・これからの段・0 の扱い）', () => {
  const stock = (id: string, o: Partial<SimStock> = {}): SimStock => ({
    id,
    kind: 'stock',
    market: 'P',
    sector33: '銀行業',
    px: buildPx([], daily('2023-01-04', TODAY)),
    divs: semi(2023, 2026),
    divFrom: '2016-11-13',
    ...o,
  })
  const settings: SimSettings = { ...DEFAULT_SIM, years: 3, amount: 3_000_000, tax: 'gross' }
  const base = {
    today: TODAY,
    settings,
    total: 3,
    etf: null,
    members: () => [],
    stressPool: [],
  }
  it('上場が基準日より後の銘柄は過去から外し、残りに配り直す。これからの段には入れる', () => {
    const r = simulate({
      ...base,
      stocks: [stock('A'), stock('B'), stock('C', { px: buildPx([], daily('2025-01-06', TODAY)) })],
    })
    expect(r.excluded).toEqual([{ id: 'C', reason: 'noPrice' }])
    expect(r.past!.rows.map((x) => x.id)).toEqual(['A', 'B'])
    expect(r.past!.rows[0]!.shares0).toBeCloseTo(1500)
    expect(r.fwd.rows.map((x) => x.id)).toEqual(['A', 'B', 'C'])
    expect(r.fwd.rows[0]!.shares).toBeCloseTo(1000)
    expect(r.past!.hero.totalPct).toBeCloseTo(0.06)
  })
  it('配当の記録が基準日より後から始まる銘柄は外す', () => {
    const r = simulate({ ...base, stocks: [stock('A'), stock('B', { divFrom: '2024-01-01' })] })
    expect(r.excluded).toEqual([{ id: 'B', reason: 'noDivRecord' }])
  })
  it('全部を外したら過去は null（0 円と計算しない）。これからは計算する', () => {
    const r = simulate({ ...base, stocks: [stock('A', { divFrom: '2024-01-01' })] })
    expect(r.past).toBeNull()
    expect(r.fwd.rows.length).toBe(1)
  })
  it('全銘柄が無配なら、これからの割合は null（0 で割らない）', () => {
    const r = simulate({ ...base, stocks: [stock('A', { divs: [] }), stock('B', { divs: [] })] })
    expect(r.fwd.y1).toBe(0)
    expect(r.fwd.yieldOnPrincipal).toBeNull()
    expect(r.fwd.stressDiff).toBeNull()
    expect(r.fwd.months.every((x) => x === 0)).toBe(true)
  })
  it('これから: 横ばいは毎年同じ、ストレスは 1 年目だけ減らしてあとは横ばい', () => {
    const r = simulate({
      ...base,
      settings: { ...settings, horizon: 5 },
      stocks: [stock('A'), stock('B')],
      stressPool: [
        {
          id: 'A',
          s17: '銀行',
          years: new Map([2019, 2020, 2021, 2022, 2023, 2024, 2025].map((y) => [y, y === 2020 ? 5 : 10])),
          from: 2018,
        },
        { id: 'B', s17: '銀行', years: new Map([2019, 2020, 2021, 2022, 2023, 2024, 2025].map((y) => [y, 10])), from: 2018 },
      ],
    })
    expect(r.fwd.stress).toEqual({ year: 2020, ratio: 0.75 })
    expect(r.fwd.years.length).toBe(5)
    expect(r.fwd.years[0]!.flat).toBeCloseTo(1500 * 20 * 2)
    expect(r.fwd.years[0]!.stress).toBeCloseTo(1500 * 20 * 0.5 + 1500 * 20)
    expect(r.fwd.years[4]!.stress).toBeCloseTo(r.fwd.years[0]!.stress)
    expect(r.fwd.stressDiff).toBeCloseTo(-0.25)
  })
  it('今日の終値が古い銘柄は、最後の終値で評価して印を付ける（外さない）', () => {
    const r = simulate({ ...base, stocks: [stock('A'), stock('B', { px: buildPx([], daily('2023-01-04', '2026-11-12')) })] })
    expect(r.stale).toEqual([{ id: 'B', d: '2026-11-12' }])
    expect(r.past!.rows.length).toBe(2)
  })
  it('1306 は同じルールで回し、差を出す。無ければ線を出さない', () => {
    const etf = stock('JP:1306', { kind: 'etf', market: 'E', sector33: '', divs: [{ date: '2024-07-10', amount: 30 }] })
    const r = simulate({ ...base, stocks: [stock('A')], etf })
    expect(r.past!.etf!.at(-1)).toBeCloseTo(3_000_000 * 1.03)
    expect(r.past!.etfPct).toBeCloseTo(0.03)
    expect(simulate({ ...base, stocks: [stock('A')] }).past!.etf).toBeNull()
  })
  it('同業種の線と順位（相手は members から。自分は入れない）', () => {
    const peers = ['P1', 'P2', 'P3', 'P4', 'P5'].map((id, i) =>
      stock(id, {
        px: buildPx(
          [],
          daily('2023-01-04', TODAY, (d) => (d > '2024-01-01' ? 1000 * (1 + i / 10) : 1000)),
        ),
      }),
    )
    const r = simulate({ ...base, stocks: [stock('A')], members: (key) => (key === '銀行業' ? [stock('A'), ...peers] : []) })
    expect(r.past!.peer).not.toBeNull()
    // 相手のトータルリターン: 6% + 0〜40%。A は 6% なので 5 銘柄のうち 4 銘柄が上
    expect(r.past!.rows[0]!.rank).toEqual({ k: 5, n: 6, s17: false })
    expect(r.past!.peerInfo).toMatchObject({ compared: 1, total: 1, s17: 0 })
  })
})

describe('FR-SIM5 上場廃止と最大下落率の範囲（レビューの反映）', () => {
  const stock = (id: string, o: Partial<SimStock> = {}): SimStock => ({
    id,
    kind: 'stock',
    market: 'P',
    sector33: '銀行業',
    px: buildPx([], daily('2023-01-04', TODAY)),
    divs: semi(2023, 2026),
    divFrom: '2016-11-13',
    ...o,
  })
  const base = { today: TODAY, settings: { ...DEFAULT_SIM, years: 3 as const }, total: 2, etf: null, members: () => [], stressPool: [] }
  it('上場廃止の銘柄は過去からもこれからも外す（前提の「今上場している銘柄だけ」と合わせる）', () => {
    const r = simulate({ ...base, stocks: [stock('A'), stock('B', { delisted: true })] })
    expect(r.excluded).toEqual([{ id: 'B', reason: 'delisted' }])
    expect(r.fwd.rows.map((x) => x.id)).toEqual(['A'])
  })
  it('最大下落率は全銘柄に日足がある日から測る（日足の始まりが銘柄で違うとき）', () => {
    // B は日足が 2024-06 から（それより前は月末の終値）。A は基準日の前から日足がある
    const pb = buildPx(
      [
        { d: '2023-11-01', c: 1000 },
        { d: '2023-12-01', c: 400 },
        { d: '2024-05-01', c: 1000 },
      ],
      daily('2024-06-03', TODAY),
    )
    const r = simulate({ ...base, stocks: [stock('A'), stock('B', { px: pb })] })
    expect(r.past!.dailyFrom).toBe('2024-06-03')
    expect(r.past!.hero.maxDD).toBe(0) // 月次の 400 円の谷は日足の範囲の外
    expect(r.past!.rows.find((x) => x.id === 'B')!.monthly).toBe(true) // B は基準日の月の月末の終値で買う
  })
})

describe('FR-SIM11 保有を出どころに（これからは実際の株数と口座ごとの税）', () => {
  const stock = (id: string, o: Partial<SimStock> = {}): SimStock => ({
    id,
    kind: 'stock',
    market: 'P',
    sector33: '銀行業',
    px: buildPx([], daily('2023-01-04', TODAY)),
    divs: semi(2023, 2026),
    divFrom: '2016-11-13',
    ...o,
  })
  const base = { today: TODAY, settings: { ...DEFAULT_SIM, years: 3 as const }, total: 2, etf: null, members: () => [], stressPool: [] }
  it('株数は保有の株数、税は口座ごと（NISA は非課税）、元本は今の評価額', () => {
    const held = new Map([
      ['A', { qty: 150, net: (100 * 1 + 50 * (1 - 0.20315)) / 150 }],
      ['B', { qty: 200, net: 1 - 0.20315 }],
    ])
    const r = simulate({ ...base, stocks: [stock('A'), stock('B')], held })
    expect(r.fwd.held).toBe(true)
    expect(r.fwd.amount).toBeCloseTo((150 + 200) * 1000)
    const a = r.fwd.rows.find((x) => x.id === 'A')!
    expect(a.shares).toBe(150)
    expect(a.y1).toBeCloseTo(20 * (100 + 50 * (1 - 0.20315)))
    expect(r.fwd.y1).toBeCloseTo(a.y1 + 200 * 20 * (1 - 0.20315))
    // 過去はほかの出どころと同じ（設定の元本を均等に）
    expect(r.past!.principal).toBe(DEFAULT_SIM.amount)
    expect(r.past!.rows[0]!.shares0).toBeCloseTo(DEFAULT_SIM.amount / 2 / 1000)
  })
  it('保有に無い銘柄は株数 0（これからに入れない）', () => {
    const r = simulate({ ...base, stocks: [stock('A'), stock('B')], held: new Map([['A', { qty: 10, net: 1 }]]) })
    expect(r.fwd.rows.map((x) => x.id)).toEqual(['A'])
  })
})
