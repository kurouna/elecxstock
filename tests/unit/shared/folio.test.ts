import {
  bridge,
  byMonth,
  concentration,
  cyclicalShare,
  decompose,
  donutSlices,
  dpsBlocks,
  dpsCagr,
  dpsStreak,
  estStart,
  flipMask,
  gapDays,
  heatMix,
  heatStep,
  mergePoints,
  netRate,
  nextMonths,
  payoutRatio,
  periodContrib,
  pointOn,
  posOf,
  samePos,
  splitFactor,
  twr,
  valuePos,
} from '@shared/folio'
import { CYCLICALITY, SECTOR17, sector17Of } from '@shared/sectors'
import type { Dividend, FolioPoint, Holding } from '@shared/types'
import { describe, expect, it } from 'vitest'

// 値はすべて架空（テストのための数）
const pt = (d: string, o: Partial<FolioPoint> = {}): FolioPoint => ({
  d,
  src: 'rec',
  final: true,
  value: 100,
  cost: 100,
  pos: [],
  at: 1,
  ...o,
})

describe('分割と記録の保有（FR-PF2）', () => {
  it('分割の倍率は after より後・upTo まで', () => {
    const sp = [
      { date: '2024-04-01', ratio: 5 },
      { date: '2025-10-01', ratio: 2 },
    ]
    expect(splitFactor(sp, '2024-01-01')).toBe(10)
    expect(splitFactor(sp, '2024-04-01')).toBe(2)
    expect(splitFactor(sp, '2024-01-01', '2025-01-01')).toBe(5)
    expect(splitFactor([], '2024-01-01')).toBe(1)
  })
  it('保有は取り込んだ日の株数とみなし、その日から記録の日までの分割で換算する。取得単価は割る', () => {
    const h: Holding = { code: '7203', account: 'tokutei', quantity: 100, avgCost: 3000, importedAt: '2025-09-01T10:00:00Z' }
    const sp = { '7203': [{ date: '2025-10-01', ratio: 5 }] } as Record<string, { date: string; ratio: number }[]>
    const [p] = posOf([h], '2025-11-13', (c) => sp[c] ?? [])
    expect(p).toEqual({ code: '7203', acct: 'tokutei', qty: 500, cost: 600 })
    // 分割の前の日の記録では換算しない
    expect(posOf([h], '2025-09-30', (c) => sp[c] ?? [])[0]?.qty).toBe(100)
    // 数量 0 の保有は入れない
    expect(posOf([{ ...h, quantity: 0 }], '2025-11-13', () => [])).toEqual([])
  })
  it('保有が同じかは銘柄・口座・株数・単価で比べ、並びは問わない', () => {
    const a = [
      { code: '1', acct: 'tokutei' as const, qty: 1, cost: 2 },
      { code: '2', acct: 'nisa_growth' as const, qty: 3, cost: 4 },
    ]
    expect(samePos(a, [...a].reverse())).toBe(true)
    expect(samePos(a, [{ ...a[0]!, qty: 2 }, a[1]!])).toBe(false)
  })
  it('起動しなかった日は間の取引日だけ（週末・祝日を除く）。多すぎるときは新しい側から', () => {
    expect(gapDays('2026-11-06', '2026-11-11')).toEqual(['2026-11-09', '2026-11-10'])
    expect(gapDays('2026-11-10', '2026-11-11')).toEqual([])
    expect(gapDays('2026-01-01', '2026-11-13', 3)).toEqual(['2026-11-10', '2026-11-11', '2026-11-12'])
  })
  it('評価: 終値の無い銘柄は取得単価で数え、missing に入れる', () => {
    const pos = [
      { code: 'A', acct: 'tokutei' as const, qty: 10, cost: 100 },
      { code: 'B', acct: 'tokutei' as const, qty: 5, cost: 200 },
    ]
    expect(valuePos(pos, (c) => (c === 'A' ? 150 : null))).toEqual({ value: 1500 + 1000, cost: 2000, missing: ['B'] })
  })
  it('読み込みは日付で混ぜる: 記録が補完値に勝ち、同じ種類なら新しく書いたほう。昇順', () => {
    const a = [pt('2026-01-02', { src: 'fill', at: 9 }), pt('2026-01-05', { at: 1, value: 1 })]
    const b = [pt('2026-01-02', { src: 'rec', at: 1 }), pt('2026-01-05', { at: 2, value: 2 }), pt('2026-01-01')]
    const m = mergePoints(a, b)
    expect(m.map((p) => p.d)).toEqual(['2026-01-01', '2026-01-02', '2026-01-05'])
    expect(m[1]!.src).toBe('rec')
    expect(m[2]!.value).toBe(2)
  })
  it('ある日の点は、その日以前で最も近い点', () => {
    const ps = [pt('2026-01-05'), pt('2026-01-07'), pt('2026-01-09')]
    expect(pointOn(ps, '2026-01-08')?.d).toBe('2026-01-07')
    expect(pointOn(ps, '2026-01-09')?.d).toBe('2026-01-09')
    expect(pointOn(ps, '2026-01-04')).toBeUndefined()
  })
})

describe('資産推移の数（FR-PF4）', () => {
  it('期間の内訳は足すと期末と一致する。受取配当は内訳に入れず別に返す', () => {
    const a = { value: 1000, cost: 800, realized: 10, received: 5 }
    const b = { value: 1500, cost: 1100, realized: 60, received: 25 }
    const x = bridge(a, b)
    expect(x.start + x.flow + x.move).toBeCloseTo(x.end)
    // 入出金 = 取得額の増減 − 実現損益の増減
    expect(x.flow).toBe(300 - 50)
    expect(x.received).toBe(20)
  })
  it('時間加重: 買い増し（入金）は成績に数えない', () => {
    const r = twr([
      { value: 100, cost: 100 },
      { value: 110, cost: 100 },
      { value: 210, cost: 200 }, // 100 入れただけ
    ])
    expect(r[1]).toBeCloseTo(10)
    expect(r[2]).toBeCloseTo(10)
  })
  it('時間加重: 売って利益を確定しても損と数えない（取得額は減るが実現損益が増える）', () => {
    // 110 の評価のうち取得 50・含み益 5 の分を売り、55 を受け取る（実現損益 +5、取得額 −50）
    const r = twr([
      { value: 110, cost: 100, realized: 0 },
      { value: 55, cost: 50, realized: 5 },
    ])
    expect(r[1]).toBeCloseTo(0)
  })
  it('時間加重: 実現損益が片方にしか無い点・評価額 0 の点では鎖を切る（その区間は動かさない）', () => {
    const r = twr([
      { value: 100, cost: 100 },
      { value: 120, cost: 100, realized: 3 },
      { value: 0, cost: 0 },
      { value: 50, cost: 50 },
    ])
    expect(r).toEqual([0, 0, 0, 0])
    expect(twr([])).toEqual([])
  })
})

describe('資産構成（FR-PF5）', () => {
  it('集中度: 1 銘柄・同じ比率・0 件', () => {
    expect(concentration([100])).toEqual({ max: 1, top5: 1, effective: 1 })
    const eq = concentration([1, 1, 1, 1])
    expect(eq.max).toBe(0.25)
    expect(eq.effective).toBeCloseTo(4)
    expect(concentration([])).toEqual({ max: 0, top5: 0, effective: 0 })
    expect(concentration([3, 1, 1, 1, 1, 1, 1, 1]).top5).toBeCloseTo(7 / 10)
  })
  it('色の段は 5 段。中央は ±15% の幅、欠損は中央。混ぜる割合は 12〜55%', () => {
    expect([-30, -10, 0, 10, 30].map((v) => heatStep(v, 30))).toEqual([0, 1, 2, 3, 4])
    expect(heatStep(4, 30)).toBe(2)
    expect(heatStep(null, 30)).toBe(2)
    expect(heatStep(Number.NaN, 30)).toBe(2)
    expect([0, 1, 2, 3, 4].map(heatMix)).toEqual([0.55, 0.31, 0, 0.31, 0.55])
  })
  it('17 業種は 33 業種から決まる。33 業種はすべてどれかに入り、REIT・業種の無い銘柄は null', () => {
    const s33 = [
      '水産・農林業',
      '鉱業',
      '建設業',
      '食料品',
      '繊維製品',
      'パルプ・紙',
      '化学',
      '医薬品',
      '石油・石炭製品',
      'ゴム製品',
      'ガラス・土石製品',
      '鉄鋼',
      '非鉄金属',
      '金属製品',
      '機械',
      '電気機器',
      '輸送用機器',
      '精密機器',
      'その他製品',
      '電気・ガス業',
      '陸運業',
      '海運業',
      '空運業',
      '倉庫・運輸関連業',
      '情報・通信業',
      '卸売業',
      '小売業',
      '銀行業',
      '証券、商品先物取引業',
      '保険業',
      'その他金融業',
      '不動産業',
      'サービス業',
    ]
    expect(s33).toHaveLength(33)
    const got = new Set(s33.map((s) => sector17Of(s)))
    expect(got.has(null)).toBe(false)
    expect(got.size).toBe(17)
    expect(sector17Of('輸送用機器')).toBe('自動車・輸送機')
    expect(sector17Of('')).toBeNull()
    for (const s of SECTOR17) expect(CYCLICALITY[s]).toMatch(/cyclical|defensive/)
  })
  it('景気敏感・ディフェンシブの割合（REIT・ETF はその他）', () => {
    const r = cyclicalShare([
      { sector: '輸送用機器', kind: 'stock', value: 50 },
      { sector: '食料品', kind: 'stock', value: 30 },
      { sector: '', kind: 'reit', value: 20 },
    ])
    expect(r).toEqual({ cyclical: 0.5, defensive: 0.3, other: 0.2 })
    expect(cyclicalShare([])).toEqual({ cyclical: 0, defensive: 0, other: 0 })
  })
})

describe('損益寄与の期間（FR-PF5・§6.5）', () => {
  const bars = (xs: [string, number][]) => xs.map(([d, c]) => ({ d, c }))
  const closes: Record<string, { d: string; c: number }[]> = {
    A: bars([
      ['2026-10-30', 100],
      ['2026-11-02', 110],
      ['2026-11-04', 120],
      ['2026-11-05', 115],
    ]),
    B: bars([
      ['2026-10-30', 50],
      ['2026-11-02', 55],
      ['2026-11-04', 60],
    ]),
  }
  const pos = (code: string, qty: number) => ({ code, acct: 'tokutei' as const, qty, cost: 1 })
  it('期間の初めの終値から測り、日ごとの株数 × 終値の差を足す。途中で買った分は買った日から', () => {
    const r = periodContrib({
      from: '2026-10-30',
      to: '2026-11-05',
      points: [
        { d: '2026-11-02', pos: [pos('A', 10)] },
        { d: '2026-11-04', pos: [pos('A', 20)] },
      ],
      fallback: [pos('A', 20)],
      closes: (c) => closes[c] ?? [],
      dividends: () => [],
      splits: () => [],
    })
    const a = r.rows.find((x) => x.code === 'A')!
    // 10/30→11/02 は記録の前（今の株数 20）: 20×10、11/02→11/04 は 10 株: 10×10、11/04→11/05 は 20 株: 20×(−5)
    expect(a.price).toBe(200 + 100 - 100)
    expect(r.beforeRecords).toBe(true)
  })
  it('売った銘柄は最後に持っていた日まで（soldOn）。配当は権利落ちの前日の株数 × 1 株配当（税引後）', () => {
    const r = periodContrib({
      from: '2026-10-30',
      to: '2026-11-05',
      points: [
        { d: '2026-10-30', pos: [pos('A', 10), pos('B', 100)] },
        { d: '2026-11-04', pos: [pos('A', 10)] },
      ],
      fallback: [pos('A', 10)],
      closes: (c) => closes[c] ?? [],
      dividends: (c) => (c === 'A' ? [{ date: '2026-11-04', amount: 10 }] : []),
      splits: () => [],
    })
    const b = r.rows.find((x) => x.code === 'B')!
    expect(b.price).toBe(100 * 5 + 100 * 5)
    expect(b.soldOn).toBe('2026-11-04')
    const a = r.rows.find((x) => x.code === 'A')!
    expect(a.div).toBeCloseTo(10 * 10 * (1 - 0.20315))
    expect(r.beforeRecords).toBe(false)
  })
  it('同じ銘柄を複数の口座で持つと、口座ごとの値動きと配当（税引後は口座ごと）も返し、足すと銘柄の値と一致する', () => {
    const r = periodContrib({
      from: '2026-10-30',
      to: '2026-11-05',
      points: [{ d: '2026-10-30', pos: [pos('A', 10), { code: 'A', acct: 'nisa_growth', qty: 5, cost: 1 }] }],
      fallback: [pos('A', 10), { code: 'A', acct: 'nisa_growth', qty: 5, cost: 1 }],
      closes: (c) => closes[c] ?? [],
      dividends: (c) => (c === 'A' ? [{ date: '2026-11-04', amount: 10 }] : []),
      splits: () => [],
    })
    const a = r.rows.find((x) => x.code === 'A')!
    expect(a.accts).toHaveLength(2)
    const tk = a.accts!.find((x) => x.acct === 'tokutei')!
    const ns = a.accts!.find((x) => x.acct === 'nisa_growth')!
    // 10/30→11/05 は 100 → 115: 特定 10 株 × 15、NISA 5 株 × 15
    expect(tk.price).toBe(150)
    expect(ns.price).toBe(75)
    expect(tk.div).toBeCloseTo(10 * 10 * (1 - 0.20315))
    expect(ns.div).toBe(5 * 10)
    expect(a.price).toBe(tk.price + ns.price)
    expect(a.div).toBeCloseTo(tk.div + ns.div)
  })
  it('記録の後に分割があれば、記録の株数を換算して今の基準の終値に合わせる', () => {
    const r = periodContrib({
      from: '2026-10-30',
      to: '2026-11-04',
      points: [{ d: '2026-10-30', pos: [pos('A', 10)] }],
      fallback: [pos('A', 20)],
      closes: (c) => closes[c] ?? [],
      dividends: () => [],
      splits: () => [{ date: '2026-11-01', ratio: 2 }],
    })
    expect(r.rows[0]!.price).toBe(20 * 20)
  })
})

describe('配当の分析（FR-PF7・§6.6）', () => {
  const ds = (xs: [string, number][]): Dividend[] => xs.map(([date, amount]) => ({ date, amount }))
  it('1 株配当の年は直近 N 回の合計。権利落ちの日が数日ずれても増減しない', () => {
    const divs = ds([
      ['2022-03-30', 10],
      ['2022-09-29', 10],
      ['2023-03-30', 11],
      ['2023-09-28', 11],
      ['2024-03-28', 12],
      ['2024-09-27', 12],
      ['2025-03-28', 13],
      ['2025-09-29', 13],
      ['2026-03-30', 14],
      // 今年の中間は 11/14 にずれた（12 か月で切ると 1 回抜けて減配に見える）
      ['2026-11-14', 14],
    ])
    const b = dpsBlocks(divs, '2026-11-20')
    expect(b.perYear).toBe(2)
    expect(b.dps).toEqual([20, 22, 24, 26, 28])
    expect(b.special).toBe(false)
    expect(b.last.map((d) => d.date)).toEqual(['2026-03-30', '2026-11-14'])
    // 前の 1 年の権利落ち（前年同月の棒に使う）
    expect(b.prev.map((d) => d.date)).toEqual(['2025-03-28', '2025-09-29'])
  })
  it('履歴の始まり（前の年に権利落ちが無い）は、ある年の回数で区切る', () => {
    const b = dpsBlocks(
      ds([
        ['2025-03-28', 10],
        ['2025-09-29', 10],
      ]),
      '2025-11-12',
    )
    expect(b.perYear).toBe(2)
    expect(b.dps.at(-1)).toBe(20)
    expect(b.regimeChanged).toBe(false)
  })
  it('足りない年は null。直近 1 年に権利落ちが無ければ 0（無配）', () => {
    const b = dpsBlocks(ds([['2025-06-27', 50]]), '2026-11-13')
    // 1 年前は最後の配当（50）、今は 0
    expect(b.dps).toEqual([null, null, null, 50, 0])
    expect(dpsBlocks([], '2026-11-13').dps).toEqual([null, null, null, null, 0])
  })
  it('回数が変わったら知らせる・前年の同じ回の 1.5 倍を超えたら特別配当の可能性', () => {
    const b = dpsBlocks(
      ds([
        ['2024-12-27', 40],
        ['2025-12-26', 20],
        ['2026-06-26', 70],
      ]),
      '2026-11-13',
    )
    expect(b.regimeChanged).toBe(true)
    expect(b.special).toBe(true)
  })
  it('増配率（年率）・連続増配・非減配', () => {
    expect(dpsCagr([10, null, null, null, 20])).toBeCloseTo((2 ** (1 / 4) - 1) * 100)
    expect(dpsCagr([null, null, null, null, 20])).toBeNull()
    expect(dpsStreak([10, 11, 12, 13, 14])).toEqual({ streak: 4, noCut: true })
    expect(dpsStreak([10, 10, 12, 13, 13])).toEqual({ streak: 0, noCut: true })
    expect(dpsStreak([10, 9, 12, 13, 14])).toEqual({ streak: 3, noCut: false })
  })
  it('前年比の分解: 足すと一致。新規・買い増し・一部売却・売却・据え置き。NISA は非課税', () => {
    const t = 1 - 0.20315
    const add = decompose([{ acct: 'tokutei', qty: 200 }], [{ acct: 'tokutei', qty: 100 }], 12, 10)
    expect(add.raise).toBeCloseTo(100 * 2 * t)
    expect(add.qty).toBeCloseTo(100 * 12 * t)
    expect(add.annual - add.annualPrev).toBeCloseTo(add.raise + add.qty)
    expect(add.factor).toBe('add')
    expect(decompose([{ acct: 'nisa_growth', qty: 10 }], [], 5, 0).factor).toBe('new')
    expect(decompose([{ acct: 'nisa_growth', qty: 10 }], [], 5, 0).annual).toBe(50)
    expect(decompose([], [{ acct: 'tokutei', qty: 10 }], 5, 5).factor).toBe('sold')
    expect(decompose([{ acct: 'tokutei', qty: 5 }], [{ acct: 'tokutei', qty: 10 }], 5, 5).factor).toBe('trim')
    expect(decompose([{ acct: 'tokutei', qty: 10 }], [{ acct: 'tokutei', qty: 10 }], 5, 5).factor).toBe('')
    expect(netRate('nisa_tsumitate')).toBe(1)
    expect(netRate('ippan')).toBeCloseTo(t)
  })
  it('配当性向の概算・今後 12 か月の月・月ごとの額', () => {
    expect(payoutRatio(3, 15)).toBe(45)
    expect(payoutRatio(null, 15)).toBeNull()
    expect(payoutRatio(3, -2)).toBeNull()
    expect(nextMonths(11).slice(0, 3)).toEqual([11, 12, 1])
    expect(nextMonths(11)).toHaveLength(12)
    const m = byMonth(
      ds([
        ['2026-03-30', 10],
        ['2026-03-31', 5],
        ['2026-09-29', 12],
      ]),
      100,
    )
    expect(m.get(3)).toBe(1500)
    expect(m.get(9)).toBe(1200)
  })
})

describe('表示の計算（FR-PF7・PF8）', () => {
  it('ドーナツは大きい順に 5 つ＋その他。1 つだけ余るならその他にしない。角度は 1 周', () => {
    const items = [1, 2, 3, 4, 5, 6, 7].map((v) => ({ value: v }))
    const s = donutSlices(items)
    expect(s).toHaveLength(6)
    expect(s[0]!.item?.value).toBe(7)
    expect(s.at(-1)!.item).toBeNull()
    expect(s.at(-1)!.value).toBe(3)
    expect(s.at(-1)!.a1 - s[0]!.a0).toBeCloseTo(Math.PI * 2)
    expect(donutSlices([1, 2, 3, 4, 5, 6].map((v) => ({ value: v })))).toHaveLength(6)
    expect(donutSlices([{ value: 0 }])).toEqual([])
  })
  it('めくり表示は変わった数字だけ（右詰めで比べる。記号は除く）', () => {
    expect(flipMask('¥14,997,330', '¥14,988,908')).toEqual([false, false, false, false, false, true, true, false, true, true, true])
    expect(flipMask('¥999', '¥1,000')).toEqual([false, true, false, true, true, true])
    expect(flipMask('', '12')).toEqual([true, true])
  })
  it('試算の始まりは、すべての銘柄の終値がそろう日。無い銘柄があれば試算しない', () => {
    expect(estStart(['2022-01-04', '2023-05-01', '2021-01-04'])).toBe('2023-05-01')
    expect(estStart(['2022-01-04', undefined])).toBeNull()
    expect(estStart([])).toBeNull()
  })
})

// 回帰（2026-11-15 のレビューで見つけた不具合）
describe('日付・無配・口座の移動・内訳の端（FR-PF2・PF4・PF7）', () => {
  it('取り込んだ日時は日本時間の日付で数える（UTC で切ると朝の取り込みが前の日になり、分割を 2 回かける）', () => {
    // 3/2 07:00 JST に分割後の株数で取り込んだ（UTC では 3/1）
    const h: Holding = { code: 'A', account: 'tokutei', quantity: 200, avgCost: 50, importedAt: '2026-03-01T22:00:00Z' }
    expect(posOf([h], '2026-03-10', () => [{ date: '2026-03-02', ratio: 2 }])[0]!.qty).toBe(200)
  })
  it('直近 1 年に権利落ちが無い（無配になった）とき、1 年前は最後の配当の年', () => {
    const ds: Dividend[] = ['2021', '2022', '2023', '2024'].map((y, i) => ({ date: `${y}-03-30`, amount: (i + 1) * 10 }))
    const b = dpsBlocks(ds, '2025-11-13')
    expect(b.dps.slice(-2)).toEqual([40, 0])
    expect(b.dps[0]).toBe(10)
  })
  it('株数が同じで口座を移した（特定 → NISA）増減も要因に入り、足すと一致する', () => {
    const d = decompose([{ acct: 'nisa_growth', qty: 100 }], [{ acct: 'tokutei', qty: 100 }], 50, 50)
    expect(d.factor).toBe('acct')
    expect(d.annual - d.annualPrev).toBeCloseTo(d.raise + d.qty)
    expect(d.qty).toBeCloseTo(100 * 50 * 0.20315)
  })
  it('期間の内訳: 実現損益・受取配当が片方の点に無ければ、その差は 0（累計の全額を入れない）', () => {
    const x = bridge({ value: 100, cost: 100 }, { value: 150, cost: 100, realized: 500_000, received: 200_000 })
    expect(x.flow).toBe(0)
    expect(x.move).toBe(50)
    expect(x.received).toBe(0)
  })
})

describe('分割・時間加重のレビューの直し（FR-PF2・PF4）', () => {
  it('取り込んだ日が記録の日より後（分割の日の場中に取り込んだ）なら、分割を戻して記録の日の株数にする', () => {
    // 10/1（分割の日）の 12 時に取り込んだ 200 株は、分割の前の 9/30 では 100 株・取得単価は 2 倍
    const h: Holding = { code: '7203', account: 'tokutei', quantity: 200, avgCost: 1500, importedAt: '2025-10-01T03:00:00Z' }
    const sp = () => [{ date: '2025-10-01', ratio: 2 }]
    expect(posOf([h], '2025-09-30', sp)[0]).toEqual({ code: '7203', acct: 'tokutei', qty: 100, cost: 3000 })
    // 取り込んだ日のあとの記録の日では、そのまま
    expect(posOf([h], '2025-10-02', sp)[0]!.qty).toBe(200)
  })
  it('時間加重: 買いは日の初めに入れたとみなす（小さな元手に大きく買い増した日に少し下がっても、大きく下げた・反転したと数えない）', () => {
    const r = twr([
      { value: 10, cost: 10 },
      { value: 1000, cost: 1010 }, // 1000 を買い、合わせて 1% 下がった
      { value: 1010, cost: 1010 },
    ])
    expect(r[1]).toBeCloseTo((1000 / 1010 - 1) * 100)
    // 翌日に 1000 → 1010 と戻せば、通しで ±0
    expect(r[2]).toBeCloseTo(0)
    expect(r.every((x) => x > -100)).toBe(true)
    // b.value − flow が小さな正の値でも、−95% のように飛ばない（実際はおよそ −0.9%）
    const s = twr([
      { value: 10, cost: 10 },
      { value: 1000.5, cost: 1010 },
    ])
    expect(s[1]).toBeCloseTo((1000.5 / 1010 - 1) * 100)
  })
})
