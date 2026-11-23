// ポートフォリオのペインの画面のロジック（FR-PF1・PF4〜PF8。src/renderer/lib/folio.ts。docs/testing.md の L4）。値はすべて架空
import type { AccountType, FolioAt, FolioDividends, FolioSeriesPoint, Holding, Instrument, MetricsRow } from '@shared/types'
import { describe, expect, it } from 'vitest'
import {
  ALLOC_GROUPS,
  ASSET_SORTS,
  acctOfKey,
  acctParts,
  allocStats,
  allocTiles,
  assetGroups,
  assetRowKey,
  assetScale,
  assetTable,
  barPct,
  benchSeries,
  briefOf,
  byCode,
  CARDS,
  cardOrder,
  clampIndex,
  compOf,
  compShade,
  contribBars,
  contribKey,
  contribNoteDay,
  contribRows,
  contribSummary,
  DEFAULT_VIEW,
  DIV_GROUPS,
  DIV_SORTS,
  divBridgeSteps,
  divFactors,
  divGroups,
  divMonths,
  divRows,
  divSummary,
  divYields,
  eventKey,
  eventLifts,
  eventStep,
  eventsOf,
  type FRow,
  firstOpen,
  folioWidth,
  groupKey,
  heatBg,
  heroNumbers,
  histGeom,
  histHead,
  histPoints,
  importedAtText,
  importedNote,
  keepRow,
  lastTone,
  lotCount,
  manYen,
  markLift,
  mergeLocked,
  monthTip,
  moveRow,
  multiAcct,
  nextCard,
  niceTicks,
  nisaShare,
  openKey,
  pctGeom,
  pnlBar,
  pnlScale,
  posRows,
  reselect,
  rowsAtDay,
  rowsOf,
  signPct,
  sortTo,
  spatialNext,
  splitOf,
  tableRows,
  tileInk,
  toggleAsset,
  toggleOpen,
  totalsOf,
  viewKey,
  viewOf,
  waterfall,
  yenFull,
} from '../../../src/renderer/lib/folio'

const M = (o: Partial<MetricsRow>): MetricsRow =>
  ({
    close: null,
    chg: null,
    chgPct: null,
    per: null,
    beta1y: null,
    div12: null,
    yieldTrailing: null,
    rightsDay: null,
    earningsDay: null,
    ...o,
  }) as MetricsRow
const I = (o: Partial<Instrument>): Instrument => ({
  id: 'JP:0',
  code: '0',
  nameJa: '',
  nameEn: '',
  market: 'P',
  kind: 'stock',
  sectorJa: '',
  sectorEn: '',
  status: 'active',
  userAdded: false,
  ...o,
})
const DB: Record<string, { m: MetricsRow; ins: Instrument; name: string }> = {
  'JP:7203': { m: M({ close: 3000, chg: 30, chgPct: 1, per: 10, beta1y: 1.2 }), ins: I({ sectorJa: '輸送用機器' }), name: 'トヨタ' },
  'JP:2914': { m: M({ close: 4000, chg: -40, chgPct: -1, per: 20, beta1y: 0.5 }), ins: I({ sectorJa: '食料品' }), name: 'JT' },
  'JP:8951': { m: M({ close: 100000, chg: 0, chgPct: 0 }), ins: I({ kind: 'reit', market: 'R' }), name: 'ビルファンド' },
  // 売った銘柄（保有には無い）
  'JP:9433': { m: M({ close: 4000 }), ins: I({ sectorJa: '情報・通信業' }), name: 'KDDI' },
}
const get = (id: string) => DB[id] ?? { name: '' }
const H: Holding[] = [
  { code: '7203', account: 'tokutei', quantity: 100, avgCost: 2500 },
  { code: '7203', account: 'nisa_growth', quantity: 50, avgCost: 2800 },
  { code: '2914', account: 'tokutei', quantity: 100, avgCost: 4500 },
  { code: '8951', account: 'nisa_growth', quantity: 2, avgCost: 90000 },
  { code: '9999', account: 'tokutei', quantity: 10, avgCost: 1000 }, // 終値の無い銘柄
]
const rows = rowsOf(H, get)

describe('表示の状態とキー（FR-PF6）', () => {
  it('壊れた状態は既定に直す', () => {
    expect(viewOf(undefined)).toEqual(DEFAULT_VIEW)
    // 分類の並びを配当とそろえる前（gv なし）の保存は読み替える: 旧 2 = 口座 → 5
    expect(viewOf({ period: 99, pct: 'x', group: 2 })).toEqual({ ...DEFAULT_VIEW, group: 5 })
    expect(viewOf({ gv: 2, group: 2 })).toEqual({ ...DEFAULT_VIEW, group: 2 })
  })
  it('Tab で 8 枚のカードを巡る（Shift+Tab は逆）。選んでいないときは最初・最後から。分類ごとの資産は予定の次', () => {
    expect(nextCard(null, false)).toBe('hist')
    expect(nextCard(null, true)).toBe('dtab')
    expect(nextCard('dtab', false)).toBe('hist')
    expect(CARDS).toHaveLength(8)
    expect(nextCard('events', false)).toBe('ptab')
    expect(nextCard('ptab', false)).toBe('div')
  })
  it('Tab の順はペインの幅の並びに合わせる（狭い: 縦 1 列・中: 2 段目の次に表・L: 2 段目に予定）', () => {
    expect(folioWidth(500)).toBe('s')
    expect(folioWidth(759)).toBe('s')
    expect(folioWidth(760)).toBe('m')
    expect(folioWidth(1179)).toBe('m')
    expect(folioWidth(1180)).toBe('l')
    // 幅がまだ分からない（0）ときは L の並び
    expect(folioWidth(0)).toBe('l')
    expect(cardOrder('s')).toEqual(['hist', 'alloc', 'ptab', 'contrib', 'div', 'events', 'dshare', 'dtab'])
    expect(cardOrder('m')).toEqual(['hist', 'alloc', 'contrib', 'ptab', 'div', 'events', 'dshare', 'dtab'])
    expect(cardOrder('l')).toEqual([...CARDS])
    for (const w of ['s', 'm', 'l'] as const) expect([...cardOrder(w)].sort()).toEqual([...CARDS].sort())
    expect(nextCard('alloc', false, cardOrder('s'))).toBe('ptab')
    expect(nextCard('events', false, cardOrder('m'))).toBe('dshare')
    expect(nextCard('contrib', true, cardOrder('m'))).toBe('alloc')
    expect(nextCard(null, true, cardOrder('s'))).toBe('dtab')
  })
  it('単キーの意味はカードで変えない: G は選んでいるカードの分類、S は表の並べ替え、B はベンチマークで % にする', () => {
    const v = DEFAULT_VIEW
    expect(viewKey(v, 'KeyG', 'alloc')!.group).toBe(v.group + 1)
    expect(viewKey(v, 'KeyG', null)!.group).toBe(v.group + 1)
    // 資産構成と分類ごとの資産は同じ分類（G でどちらからでも替わる）
    expect(viewKey(v, 'KeyG', 'ptab')!.group).toBe(v.group + 1)
    expect(viewKey(v, 'KeyG', 'dtab')!.dgroup).toBe(1)
    expect(viewKey(v, 'KeyG', 'dshare')!.dgroup).toBe(1)
    expect(viewKey(v, 'KeyS', 'dtab')!.dsort).toBe(1)
    expect(viewKey(v, 'KeyS', 'alloc')).toBeNull()
    expect(viewKey(v, 'KeyB', null)).toMatchObject({ bench: 1, pct: true })
    expect(viewKey(v, 'KeyT', null)!.contrib).toBe(1)
    expect(viewKey({ ...v, contrib: 3 }, 'KeyT', null)!.contrib).toBe(0)
    // E で試算を出すと、「記録」の期間なら全期間にする
    expect(viewKey(v, 'KeyE', null)).toMatchObject({ est: true, period: 5 })
    expect(viewKey(v, 'KeyZ', null)).toBeNull()
  })
  it('一覧の行は ↑ ↓ PgUp PgDn Home End で端に止まる', () => {
    expect(moveRow(0, 5, 'ArrowUp')).toBe(0)
    expect(moveRow(0, 5, 'PageDown')).toBe(4)
    expect(moveRow(3, 5, 'Home')).toBe(0)
    expect(moveRow(1, 5, 'End')).toBe(4)
    expect(moveRow(1, 5, 'KeyA')).toBeNull()
    expect(moveRow(0, 0, 'ArrowDown')).toBeNull()
  })
})

describe('保有の行と数（FR-PF1）', () => {
  it('終値の無い銘柄は取得単価で数える。銘柄ごとにまとめると口座をまたいで足す', () => {
    const r = rows.find((x) => x.code === '9999')!
    expect(r.value).toBe(10_000)
    expect(r.pnl).toBe(0)
    expect(byCode(rows).find((x) => x.code === '7203')).toMatchObject({ qty: 150, value: 450_000, cost: 250_000 + 140_000 })
  })
  it('合計: 評価額・取得額・今日・PER の調和平均・β の加重平均', () => {
    const t = totalsOf(rows)
    expect(t.value).toBe(450_000 + 400_000 + 200_000 + 10_000)
    expect(t.day).toBe(150 * 30 - 100 * 40)
    expect(t.per).toBeCloseTo((450_000 + 400_000) / (450_000 / 10 + 400_000 / 20))
    expect(t.beta).toBeCloseTo((450_000 * 1.2 + 400_000 * 0.5) / 850_000)
  })
  it('分類の鍵: 17 業種の無い REIT・ETF は種別の名前', () => {
    const toyota = rows[0]!
    const reit = rows.find((x) => x.code === '8951')!
    expect(groupKey('sector', toyota)).toBe('輸送用機器')
    expect(groupKey('sector17', toyota)).toBe('自動車・輸送機')
    expect(groupKey('sector17', reit)).toBe('kind:reit')
    expect(groupKey('acct', reit)).toBe('acct:nisa_growth')
    expect(groupKey('market', reit)).toBe('market:R')
    expect(groupKey('code', reit)).toBe('8951')
  })
  it('十字線の日の行は、その日の保有 × 終値。前日比はその日と前の日の差。売った銘柄も名前を引く', () => {
    const at: FolioAt = {
      d: '2026-10-01',
      src: 'rec',
      pos: [
        { code: '7203', acct: 'tokutei', qty: 80, cost: 2500 },
        { code: '5555', acct: 'tokutei', qty: 10, cost: 100 },
      ],
      close: { '7203': 2800, '5555': null },
      prev: { '7203': 2700, '5555': null },
    }
    const r = rowsAtDay(at, rows, (c) => `名前${c}`)
    expect(r[0]).toMatchObject({ code: '7203', value: 224_000, dayPnl: 8_000, name: 'トヨタ', sector: '輸送用機器' })
    expect(r[1]).toMatchObject({ code: '5555', value: 1_000, dayPnl: 0, name: '名前5555' })
  })
})

describe('資産推移（FR-PF3・PF4）', () => {
  const pts: FolioSeriesPoint[] = [
    { d: '2026-01-05', src: 'est', final: true, value: 50, cost: 100 },
    { d: '2026-01-06', src: 'rec', final: true, value: 100, cost: 100, realized: 0 },
    { d: '2026-01-07', src: 'fill', final: true, value: 120, cost: 100, realized: 0 },
    { d: '2026-01-08', src: 'rec', final: true, value: 230, cost: 200, realized: 0 },
  ]
  it('「記録」は試算を含めない。E のときだけ試算を前に付ける。点が足りなければ記録の最後の 2 点', () => {
    expect(histPoints(pts, { period: 0, est: true }).map((p) => p.src)).toEqual(['rec', 'fill', 'rec'])
    expect(histPoints(pts, { period: 5, est: true })).toHaveLength(4)
    expect(histPoints(pts, { period: 5, est: false })).toHaveLength(3)
    expect(histPoints(pts.slice(0, 2), { period: 1, est: false })).toHaveLength(1)
  })
  it('見出しの増減と内訳は試算の点を数に入れない。内訳は足すと期末', () => {
    const h = histHead(pts)
    expect(h.from).toBe('2026-01-06')
    expect(h.move).toBe(230 - 100 - 100)
    expect(h.pnl).toBe(30)
    const b = h.bridge!
    expect(b.start + b.flow + b.move).toBe(b.end)
    // 買い（入金 100）は日の初めに入れたとみなす: 120 + 100 → 230
    expect(h.twr.at(-1)).toBeCloseTo((120 / 100) * (230 / (120 + 100)) * 100 - 100)
  })
  it('ベンチマークは記録が 20 日たまってから。記録の初日を 0% として測る', () => {
    expect(benchSeries(pts, [{ d: '2026-01-06', c: 100 }])).toBeNull()
    const many = Array.from({ length: 20 }, (_, i) => ({
      d: `2026-02-${String(i + 1).padStart(2, '0')}`,
      src: 'rec' as const,
      final: true,
      value: 1,
      cost: 1,
    }))
    const b = benchSeries(many, [
      { d: '2026-01-30', c: 100 },
      { d: '2026-02-10', c: 110 },
    ])!
    expect(b[0]).toBe(0)
    expect(b.at(-1)).toBeCloseTo(10)
  })
  it('目盛りは切りのよい値', () => {
    expect(niceTicks(0, 100)).toEqual([0, 25, 50, 75, 100])
    expect(niceTicks(1_234_000, 1_567_000)[0]! % 50_000).toBe(0)
    expect(niceTicks(5, 5)).toEqual([5])
  })
})

describe('図の計算（FR-PF4・PF5・PF7）', () => {
  it('ウォーターフォール: 合計の棒は下から、増減は前の終わりから。つなぐ線は棒の終わりの高さ', () => {
    const bars = waterfall(
      [
        { key: 'a', v: 100, total: true },
        { key: 'b', v: 20 },
        { key: 'c', v: -30 },
        { key: 'd', v: 90, total: true },
      ],
      400,
      200,
    )
    expect(bars).toHaveLength(4)
    expect(bars[0]!.top + bars[0]!.h).toBeCloseTo(200 - 30)
    expect(bars[1]!.top).toBeLessThan(bars[0]!.top)
    expect(bars[2]!.link).toBeCloseTo(bars[3]!.top)
  })
  it('資産推移（円）: 縦軸は 0 円から。評価額・取得額が 0 円の高さより上に来て、目盛りに 0 がある', () => {
    const p = (d: string, value: number, cost: number) =>
      ({ d, src: 'rec', final: true, value, cost, pos: [], at: 1 }) as unknown as FolioSeriesPoint
    const g = histGeom([p('2026-11-12', 43_000_000, 17_500_000), p('2026-11-13', 42_800_000, 17_500_000)], 600, 200)
    expect(g.ticks[0]!.v).toBe(0)
    expect(g.y(0)).toBeCloseTo(200 - 18)
    expect(g.y(43_000_000)).toBeGreaterThan(6) // 上は少し空ける
    expect(g.ticks.at(-1)!.v).toBeGreaterThanOrEqual(40_000_000)
    // 取得額から 0 円までの面（中立の色で塗る）は 0 円の高さまで下りる
    expect(g.clipDown).toContain(`V${(200 - 18).toFixed(1)}`)
  })
  it('資産推移・%: 余白より狭い枠でも左右・上下が入れ替わらない（幅・高さが負にならない）', () => {
    const p = (d: string, value: number, cost: number) =>
      ({ d, src: 'rec', final: true, value, cost, pos: [], at: 1 }) as unknown as FolioSeriesPoint
    const g = histGeom([p('2026-11-12', 100, 50), p('2026-11-13', 200, 50)], 30, 20)
    expect(g.x(1)).toBeGreaterThanOrEqual(g.x(0))
    expect(g.y(0)).toBeGreaterThanOrEqual(g.y(200))
    const q = pctGeom([[0, 5, 10]], 3, 30, 20)
    expect(q.x(2)).toBeGreaterThanOrEqual(q.x(0))
    expect(q.y(0)).toBeGreaterThanOrEqual(q.y(10))
  })
  it('ツリーマップ: 分類の見出しと銘柄のタイル。口座で分けると銘柄 × 口座、銘柄だけなら見出しなし', () => {
    const t = allocTiles(rows, 'sector', 0, 600, 300)
    expect(t.filter((x) => !x.group)).toHaveLength(4)
    expect(allocTiles(rows, 'acct', 0, 600, 300).filter((x) => !x.group)).toHaveLength(5)
    expect(allocTiles(rows, 'code', 1, 600, 300).every((x) => !x.group)).toBe(true)
    const st = allocStats(rows)
    expect(st.cyclical + st.defensive + st.other).toBeCloseTo(1)
  })
  it('タイルは矢印の向きでいちばん近いもの（その向きに無ければそのまま）', () => {
    const ts = [
      { x: 0, y: 0, w: 10, h: 10 },
      { x: 20, y: 0, w: 10, h: 10 },
      { x: 0, y: 20, w: 10, h: 10 },
    ]
    expect(spatialNext(ts, 0, 'ArrowRight')).toBe(1)
    expect(spatialNext(ts, 0, 'ArrowDown')).toBe(2)
    expect(spatialNext(ts, 0, 'ArrowLeft')).toBe(0)
  })
  it('色: 中央はパネルの色。ライトでは濃い段だけ白い文字', () => {
    expect(heatBg(2)).toBe('var(--panel-3)')
    expect(heatBg(0)).toContain('var(--down) 55%')
    expect(heatBg(3)).toContain('var(--up) 31%')
    expect(tileInk(4, true)).toBe('#ffffff')
    expect(tileInk(3, true)).toBe('var(--text)')
    expect(tileInk(4, false)).toBe('var(--text)')
  })
})

describe('損益寄与（FR-PF5）', () => {
  it('今日は前日比、取得来は含み損益、今月・今年は Core の値（値動き＋配当・売った銘柄）。大きい順', () => {
    const name = (c: string) => `n${c}`
    expect(contribRows('day', rows, null, name).map((r) => r.code)).toEqual(['7203', '8951', '9999', '2914'])
    expect(contribRows('all', rows, null, name)[0]).toMatchObject({ code: '7203', v: 60_000 })
    const y = contribRows(
      'year',
      rows,
      {
        from: '2025-12-31',
        to: '2026-11-13',
        beforeRecords: false,
        rows: [
          { code: 'S', price: -5, div: 3, soldOn: '2026-05-01' },
          { code: 'A', price: 10, div: 2 },
        ],
      },
      name,
    )
    expect(y.map((r) => [r.code, r.v])).toEqual([
      ['A', 12],
      ['S', -2],
    ])
    expect(y[1]!.soldOn).toBe('2026-05-01')
    expect(contribRows('month', rows, null, name)).toEqual([])
  })
  it('棒: 0 を中心に左右。配当は値動きの先に続ける（値動きが負なら 0 から右へ）', () => {
    const b = contribBars([
      { code: 'A', name: '', price: 50, div: 50, v: 100 },
      { code: 'B', name: '', price: -100, div: 20, v: -80 },
    ])
    expect(b[0]).toEqual({ pl: 50, pw: 25, dl: 75, dw: 25 })
    expect(b[1]).toEqual({ pl: 0, pw: 50, dl: 50, dw: 10 })
  })
})

describe('配当の分析（FR-PF7）', () => {
  const D: FolioDividends = {
    yearAgoDate: '2025-11-13',
    trend: [],
    rows: [
      // トヨタ: 1 年前 100 株（特定）→ 今 150 株（特定 100・NISA 50）。1 株配当 50 → 60
      {
        code: '7203',
        dps: [40, 45, 45, 50, 60],
        perYear: 2,
        regimeChanged: false,
        special: false,
        last: [
          { date: '2026-03-30', amount: 30 },
          { date: '2026-09-29', amount: 30 },
        ],
        prev: [
          { date: '2025-03-28', amount: 25 },
          { date: '2025-09-29', amount: 25 },
        ],
        now: [
          { acct: 'tokutei', qty: 100 },
          { acct: 'nisa_growth', qty: 50 },
        ],
        yearAgo: [{ acct: 'tokutei', qty: 100 }],
      },
      // JT: 新規
      {
        code: '2914',
        dps: [null, null, 150, 180, 190],
        perYear: 2,
        regimeChanged: false,
        special: false,
        last: [
          { date: '2026-06-29', amount: 95 },
          { date: '2026-12-29', amount: 95 },
        ],
        prev: [],
        now: [{ acct: 'tokutei', qty: 100 }],
        yearAgo: [],
      },
      // 売った銘柄
      {
        code: '9433',
        dps: [100, 110, 120, 130, 140],
        perYear: 2,
        regimeChanged: false,
        special: false,
        last: [{ date: '2026-03-30', amount: 70 }],
        prev: [{ date: '2025-03-28', amount: 65 }],
        now: [],
        yearAgo: [{ acct: 'tokutei', qty: 100 }],
      },
    ],
  }
  const info = (c: string) => ({ name: `n${c}`, ins: DB[`JP:${c}`]?.ins, m: DB[`JP:${c}`]?.m })
  const dr = divRows(D, rows, info)
  const sum = divSummary(
    dr,
    true,
    rows.map((r) => ({ code: r.code, acct: r.acct, qty: r.qty })),
  )
  it('銘柄ごと: 増配と株数の要因、新規・売却。売った銘柄は利回りを出さない', () => {
    const t = dr.find((r) => r.code === '7203')!
    expect(t.factor).toBe('add')
    expect(t.raise).toBeCloseTo(100 * 10 * (1 - 0.20315))
    expect(dr.find((r) => r.code === '2914')!.factor).toBe('new')
    const s = dr.find((r) => r.code === '9433')!
    expect(s).toMatchObject({ factor: 'sold', sold: true, yld: null })
    expect(divFactors(s).map((x) => x.k)).toEqual(['raise', 'sold'])
    expect(divFactors({ raise: 0, qty: 0, factor: '', sold: false }).map((x) => x.k)).toEqual(['flat'])
  })
  it('合計: 増減要因を足すと前年 → 現在と一致する（ウォーターフォール）', () => {
    const steps = divBridgeSteps(sum)
    const mid = steps.filter((s) => !s.total).reduce((a, s) => a + s.v, 0)
    expect(sum.prev + mid).toBeCloseTo(sum.now)
    expect(steps.at(-1)!.v).toBeCloseTo(sum.now)
    // NISA の分の非課税額
    expect(sum.nisaSaved).toBeCloseTo(50 * 60 * 0.20315)
    expect(sum.raised).toBe(1)
  })
  it('今後 12 か月: 権利落ちの月に積み、前年同月を並べる。売った銘柄は今後に入らない', () => {
    const m = divMonths(dr, 11)
    expect(m.map((x) => x.m).slice(0, 3)).toEqual([11, 12, 1])
    const mar = m.find((x) => x.m === 3)!
    expect(mar.codes.map((c) => c.code)).toEqual(['7203'])
    expect(mar.prev).toBeGreaterThan(0) // 売った銘柄も前年の 3 月には入る
    expect(m.reduce((s, x) => s + x.now, 0)).toBeCloseTo(sum.now)
  })
  it('分類ごとの表はアコーディオン: はじめは分類の行だけ。→ で開き、子の行で ← を押すと閉じて分類の行に戻る', () => {
    const g = divGroups(dr, 'sector17')
    expect(g.map((x) => x.key).sort()).toEqual(['自動車・輸送機', '食品', '情報通信・サービスその他'].sort())
    let open = new Set<string>()
    let rs = tableRows(dr, 'sector17', 'annual', open)
    expect(rs.every((r) => r.type === 'g')).toBe(true)
    let t = toggleOpen(rs, 0, open, true, 'sector17')
    open = t.open
    rs = tableRows(dr, 'sector17', 'annual', open)
    expect(rs[1]!.type).toBe('m')
    t = toggleOpen(rs, 1, open, false, 'sector17')
    expect(t.open.size).toBe(0)
    expect(t.sel).toBe(0)
    // 銘柄で分けると行だけ（開け閉めしない）
    expect(tableRows(dr, 'code', 'delta', new Set()).every((r) => r.type === 'm')).toBe(true)
  })
  it('表の初期値は分類が銘柄・並べ替えが銘柄コードの昇順。分類で分けても分類の名前の順・中はコードの順', () => {
    expect(DEFAULT_VIEW).toMatchObject({ dgroup: 0, dsort: 0 })
    expect(DIV_GROUPS[0]).toBe('code')
    expect(DIV_SORTS[0]).toBe('code')
    expect(tableRows(dr, 'code', 'code', new Set()).map((r) => (r.type === 'm' ? r.r.code : ''))).toEqual(['2914', '7203', '9433'])
    const g = tableRows(dr, 'sector17', 'code', new Set())
    const keys = g.map((r) => (r.type === 'g' ? r.g.key : ''))
    expect(keys).toEqual([...keys].sort((a, b) => a.localeCompare(b, 'ja')))
    expect(keys).toHaveLength(3)
  })
  it('口座ごとに分けると、同じ銘柄の行が口座ごとになり、年間・前年・要因は口座ごと（足すとまとめた行と一致）', () => {
    const sp = divRows(D, rows, info, true)
    const t = sp.filter((r) => r.code === '7203')
    expect(t.map((r) => r.acct).sort()).toEqual(['nisa_growth', 'tokutei'])
    const merged = dr.find((r) => r.code === '7203')!
    expect(t.reduce((s, r) => s + r.annual, 0)).toBeCloseTo(merged.annual)
    expect(t.reduce((s, r) => s + r.annualPrev, 0)).toBeCloseTo(merged.annualPrev)
    // 特定は 1 年前から同じ株数（増配だけ）、NISA は今年の新規
    expect(t.find((r) => r.acct === 'tokutei')!.factor).toBe('')
    expect(t.find((r) => r.acct === 'nisa_growth')!.factor).toBe('new')
    // 口座ごとの評価額・取得額（取得利回りは口座ごとの取得単価で割る）
    expect(t.find((r) => r.acct === 'nisa_growth')!.cost).toBe(50 * 2800)
    expect(t.find((r) => r.acct === 'nisa_growth')!.yoc).toBeCloseTo((60 / 2800) * 100)
    // まとめた行は持っている口座をすべて持つ（口座の印に使う）。分けた行は自分の口座だけ
    expect(merged.accts).toEqual(['nisa_growth', 'tokutei'])
    expect(t.find((r) => r.acct === 'tokutei')!.accts).toEqual(['tokutei'])
    // 売った銘柄は 1 年前の口座の行で残る
    expect(sp.find((r) => r.code === '9433')).toMatchObject({ acct: 'tokutei', sold: true })
  })
  it('1 株配当の最後の棒の色（増配 = 金・減配・据え置き）', () => {
    expect(lastTone([1, 2])).toBe('up')
    expect(lastTone([2, 1])).toBe('down')
    expect(lastTone([2, 2])).toBe('flat')
    expect(lastTone([null, 2])).toBe('flat')
  })
  it('予定: 30 日以内の権利付き最終日（その月の見込みの額）・決算・成立中のアラート。日付順', () => {
    const day = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / 86400_000)
    const rs = rowsOf(H, (id) =>
      id === 'JP:7203' ? { ...DB[id]!, m: M({ ...DB[id]!.m, rightsDay: day('2026-11-26'), earningsDay: day('2027-02-01') }) } : get(id),
    )
    const ev = eventsOf(rs, dr, [{ code: '2914', name: 'JT', text: '終値 ≥ 1' }], '2026-11-13')
    expect(ev.map((e) => [e.type, e.day])).toEqual([
      ['alert', 0],
      ['rights', 13],
    ])
  })
  it('1 行の要約の材料: 今年の合計・うち配当・最も効いた銘柄・年間配当の前年比（1 年前の記録が無ければ出さない）', () => {
    const y = [
      { code: 'A', name: 'a', price: 10, div: 5, v: 15 },
      { code: 'B', name: 'b', price: -3, div: 0, v: -3 },
    ]
    const b = briefOf(y, sum)!
    expect(b).toMatchObject({ total: 12, div: 5 })
    expect(b.top?.code).toBe('A')
    expect(briefOf(y, { ...sum, hasYearAgo: false })!.divPct).toBeNull()
    expect(briefOf([], sum)).toBeNull()
  })
})

// 回帰（2026-11-15 のレビューで見つけた不具合）
describe('分割の後の株数・口座の移動（FR-PF1・PF7）', () => {
  it('Core が換算した今の株数があれば、行はそれを使う（分割の後、CSV を取り込み直す前も記録と合う）', () => {
    const r = rowsOf([{ code: '7203', account: 'tokutei', quantity: 100, avgCost: 2500 }], get, [
      { code: '7203', acct: 'tokutei', qty: 200, cost: 1250 },
    ])
    expect(r[0]).toMatchObject({ qty: 200, value: 600_000, cost: 250_000 })
  })
  it('口座を移しただけの銘柄も増減要因に入り、橋の合計が現在と一致する', () => {
    const D2: FolioDividends = {
      yearAgoDate: '2025-11-13',
      trend: [],
      rows: [
        {
          code: '7203',
          dps: [50, 50, 50, 50, 50],
          perYear: 1,
          regimeChanged: false,
          special: false,
          last: [{ date: '2026-03-30', amount: 50 }],
          prev: [{ date: '2025-03-28', amount: 50 }],
          now: [{ acct: 'nisa_growth', qty: 100 }],
          yearAgo: [{ acct: 'tokutei', qty: 100 }],
        },
      ],
    }
    const dr2 = divRows(D2, rows, (c) => ({ name: c }))
    const s = divSummary(dr2, true, [])
    const steps = divBridgeSteps(s)
    expect(s.prev + steps.filter((x) => !x.total).reduce((a, x) => a + x.v, 0)).toBeCloseTo(s.now)
    expect(steps.find((x) => x.key === 'acct')!.v).toBeGreaterThan(0)
  })
})

describe('口座区分の構成比（FR-PF1）', () => {
  it('決まった順（NISA 成長 → つみたて → 旧 NISA → 特定 → 一般）で、割合は足すと 1、角度は 1 周', () => {
    const p = acctParts(rows)
    expect(p.map((x) => x.acct)).toEqual(['nisa_growth', 'tokutei'])
    expect(p.reduce((a, x) => a + x.share, 0)).toBeCloseTo(1)
    expect(p.at(-1)!.a1 - p[0]!.a0).toBeCloseTo(Math.PI * 2)
    expect(p[0]!.value).toBe(150_000 + 200_000)
    expect(acctParts([])).toEqual([])
    expect(nisaShare(p)).toBeCloseTo(350_000 / 1_060_000)
  })
})

// 回帰（2026-11-15 のレビューで見つけた不具合）
describe('十字線の日の数・口座をまたぐ取得単価・無配になった前年同月・選択の範囲（FR-PF1・PF7・PF8）', () => {
  const pts: FolioSeriesPoint[] = [
    { d: '2026-11-04', src: 'rec', final: true, value: 900, cost: 800, realized: 10, received: 5 },
    { d: '2026-11-05', src: 'rec', final: true, value: 1200, cost: 800, realized: 10, received: 5 },
    { d: '2026-11-06', src: 'fill', final: true, value: 1000, cost: 800, realized: 10, received: 5 },
    { d: '2026-11-09', src: 'rec', final: true, value: 1100, cost: 900, realized: 50, received: 30 },
  ]
  it('十字線の日は、その日までの最高値・その日の前回比・その日の実現損益と受取配当で数える', () => {
    const h = heroNumbers(pts, '2026-11-06', { value: 1000, pnl: 200 }, { realized: 50, dividends: 30 })
    expect(h.total).toBe(200 + 10 + 5)
    expect(h.fromPeak).toBeCloseTo((1000 / 1200 - 1) * 100)
    expect(h.prevRec).toBe(1000 - 1200)
    // 十字線が無ければ今の値・CSV の累計・記録の最後の 2 点
    const n = heroNumbers(pts, null, { value: 1100, pnl: 200 }, { realized: 50, dividends: 30 })
    expect(n).toMatchObject({ total: 280, prevRec: 100 })
    expect(heroNumbers([], null, { value: 1, pnl: 0 }, null)).toMatchObject({ fromPeak: null, prevRec: null, total: 0 })
  })
  it('配当の利回りは十字線の日ではなく今の評価額・取得額で割る', () => {
    expect(divYields(30, { value: 1000, cost: 600 })).toEqual({ yld: 3, yoc: 5 })
    expect(divYields(30, { value: 0, cost: 0 })).toEqual({ yld: null, yoc: null })
  })
  it('銘柄ごとにまとめると、平均取得単価も口座をまたいで加重平均にする', () => {
    const r = byCode(
      rowsOf(
        [
          { code: '7203', account: 'nisa_growth', quantity: 100, avgCost: 0 },
          { code: '7203', account: 'tokutei', quantity: 100, avgCost: 3000 },
        ],
        get,
      ),
    )
    expect(r[0]!.avgCost).toBe(1500)
  })
  it('今年無配になった銘柄も、前年同月の棒には前年の配当を入れる', () => {
    const D3: FolioDividends = {
      yearAgoDate: '2025-11-13',
      trend: [],
      rows: [
        {
          code: '7203',
          dps: [50, 50, 50, 50, 0],
          perYear: 1,
          regimeChanged: false,
          special: false,
          last: [],
          prev: [{ date: '2025-03-28', amount: 50 }],
          now: [{ acct: 'nisa_growth', qty: 100 }],
          yearAgo: [{ acct: 'nisa_growth', qty: 100 }],
        },
      ],
    }
    const m = divMonths(
      divRows(D3, rows, (c) => ({ name: c })),
      11,
    )
    expect(m.find((x) => x.m === 3)!.prev).toBe(5000)
    expect(m.reduce((a, x) => a + x.now, 0)).toBe(0)
  })
  it('並びが変わっても、選んでいた銘柄の位置を選び直す（無くなったらそのまま）', () => {
    const xs = [{ code: 'B' }, { code: 'A' }, { code: 'C' }]
    expect(reselect(xs, 'A', (x) => x.code, 0)).toBe(1)
    expect(reselect(xs, 'Z', (x) => x.code, 2)).toBe(2)
    expect(reselect(xs, null, (x) => x.code, 1)).toBe(1)
  })
  it('選んでいる位置は一覧が短くなったら最後に寄せる', () => {
    expect(clampIndex(5, 3)).toBe(2)
    expect(clampIndex(1, 3)).toBe(1)
    expect(clampIndex(4, 0)).toBe(0)
  })
  it('損益寄与の上の行（合計・うち配当・値上がりと値下がりの数）は 1 回で数える', () => {
    expect(
      contribSummary([
        { code: 'A', name: '', price: 5, div: 2, v: 7 },
        { code: 'B', name: '', price: -3, div: 0, v: -3 },
        { code: 'C', name: '', price: 0, div: 0, v: 0 },
      ]),
    ).toEqual({ total: 4, div: 2, up: 1, down: 2 })
  })
  it('記録だけの保有の JSON を取り込んだら、その日数を知らせる', () => {
    expect(importedNote(0, 120)).toEqual({ key: 'hold.importedHistory', n: 120 })
    expect(importedNote(3, 120)).toEqual({ key: 'hold.imported', n: 3 })
  })
  it('配当見込みの月の棒のツールチップ: 合計・前年同月と銘柄の内訳。多ければ残りをまとめ、無ければその旨', () => {
    const tr = (k: string, v?: Record<string, string | number>) => `${k}${v ? JSON.stringify(v) : ''}`
    const codes = [
      { code: 'A', name: 'あ', amt: 3000 },
      { code: 'B', name: 'い', amt: 2000 },
      { code: 'C', name: 'う', amt: 1000 },
    ]
    expect(monthTip({ m: 3, now: 6000, prev: 5000, codes }, tr, 2).split('\n')).toEqual([
      'folio.monthAmt{"m":3,"now":"6,000","prev":"5,000"}',
      'A あ  ¥3,000',
      'B い  ¥2,000',
      'folio.monthMore{"n":1,"amt":"1,000"}',
    ])
    expect(monthTip({ m: 3, now: 6000, prev: 0, codes }, tr).split('\n')).toHaveLength(4)
    expect(monthTip({ m: 4, now: 0, prev: 0, codes: [] }, tr).split('\n')[1]).toBe('folio.noRights')
  })
  it('CSV を取り込んだ日時は日本時間で出す（PC の時刻帯によらない）。無い・読めないときは null', () => {
    expect(importedAtText('2026-11-12T16:30:00.000Z', 'ja')).toBe('2026/11/13 1:30')
    expect(importedAtText('2026-11-12T16:30:00.000Z', 'en')).toMatch(/^11\/13\/26,? 1:30\sAM$/)
    expect(importedAtText(undefined, 'ja')).toBeNull()
    expect(importedAtText('bad', 'ja')).toBeNull()
  })
})

describe('書式（▲▼ を使わない。§4.3）', () => {
  it('符号は − と +。万・億で短く', () => {
    expect(manYen(-1_876_494, true)).toBe('−188万')
    expect(manYen(12_345, true)).toBe('+1.2万')
    expect(manYen(1.5e8)).toBe('1.50億')
    expect(yenFull(-1234)).toBe('−1,234')
    expect(signPct(0)).toBe('±0.0%')
    expect(signPct(null)).toBe('—')
  })
})

describe('分類ごとの資産と、同じ銘柄をまとめる（FR-PF5・PF6・PF9）', () => {
  it('同じ銘柄をまとめるはカードごと（A）。分類が口座のときは分ける（A は効かない）', () => {
    const v = DEFAULT_VIEW
    expect(v).toMatchObject({ amerge: true, pmerge: true, cmerge: true, dmerge: true, psort: 0, pasc: false })
    expect(viewKey(v, 'KeyA', 'alloc')).toMatchObject({ amerge: false, pmerge: true })
    expect(viewKey(v, 'KeyA', 'ptab')).toMatchObject({ pmerge: false, amerge: true })
    expect(viewKey(v, 'KeyA', null)).toMatchObject({ pmerge: false })
    expect(viewKey(v, 'KeyA', 'contrib')).toMatchObject({ cmerge: false })
    expect(viewKey(v, 'KeyA', 'dtab')).toMatchObject({ dmerge: false })
    const byAcct = { ...v, group: ALLOC_GROUPS.indexOf('acct'), dgroup: DIV_GROUPS.indexOf('acct') }
    expect(viewKey(byAcct, 'KeyA', 'alloc')).toBeNull()
    expect(viewKey(byAcct, 'KeyA', 'ptab')).toBeNull()
    expect(viewKey(byAcct, 'KeyA', 'dtab')).toBeNull()
    expect(viewKey(byAcct, 'KeyA', 'contrib')).toMatchObject({ cmerge: false })
    expect(splitOf(byAcct, 'ptab')).toBe(true)
    expect(splitOf(v, 'ptab')).toBe(false)
    expect(splitOf({ ...v, cmerge: false }, 'contrib')).toBe(true)
    expect(mergeLocked(byAcct, 'alloc')).toBe(true)
    expect(mergeLocked(byAcct, 'contrib')).toBe(false)
  })
  it('並べ替えは S で評価額 → 評価損益 → 損益率 → 前日比 → 取得利回り。Shift+S で逆順', () => {
    const v = DEFAULT_VIEW
    expect(ASSET_SORTS).toEqual(['value', 'pnl', 'rate', 'day', 'yoc'])
    expect(viewKey(v, 'KeyS', 'ptab')).toMatchObject({ psort: 1, pasc: false })
    expect(viewKey({ ...v, psort: 4, pasc: true }, 'KeyS', 'ptab')).toMatchObject({ psort: 0, pasc: false })
    expect(viewKey(v, 'KeyS', 'ptab', true)).toMatchObject({ psort: 0, pasc: true })
    expect(viewKey(v, 'KeyS', 'dtab', true)!.dsort).toBe(1)
  })
  it('資産構成と配当の分類は同じ並び（銘柄・業種・17 業種・市場区分・種別・口座）。既定は業種', () => {
    expect(ALLOC_GROUPS).toEqual(DIV_GROUPS)
    expect(ALLOC_GROUPS[DEFAULT_VIEW.group]).toBe('sector')
  })
  it('まとめると同じ銘柄を 1 行に（数量・取得額・評価額を足し、取得単価は取得額 ÷ 数量）。分けると口座ごと', () => {
    const m = posRows(rows, false)
    const t = m.filter((r) => r.code === '7203')
    expect(t).toHaveLength(1)
    expect(t[0]).toMatchObject({ key: '7203', qty: 150, cost: 390_000, avgCost: 2600, value: 450_000, accts: ['nisa_growth', 'tokutei'] })
    const s = posRows(rows, true).filter((r) => r.code === '7203')
    expect(s.map((r) => r.key).sort()).toEqual(['7203/nisa_growth', '7203/tokutei'])
    expect(s.find((r) => r.acct === 'nisa_growth')!.accts).toEqual(['nisa_growth'])
    expect([...multiAcct(rows)]).toEqual(['7203'])
  })
  it('取得利回りは直近 1 年の 1 株配当 ÷ 取得単価（保有のペインと同じ）。配当が無ければ null', () => {
    const rs = rowsOf(H, (id) => (id === 'JP:2914' ? { ...DB[id]!, m: M({ ...DB[id]!.m, div12: 225 }) } : get(id)))
    expect(posRows(rs, false).find((r) => r.code === '2914')!.yoc).toBeCloseTo(5)
    expect(posRows(rs, false).find((r) => r.code === '7203')!.yoc).toBeNull()
  })
  it('分類の行は中の合計。銘柄の数は銘柄コードで数え、口座で分けたときは口座の数も出す', () => {
    const g = assetGroups(posRows(rows, true), 'sector').find((x) => x.key === '輸送用機器')!
    expect(g).toMatchObject({ value: 450_000, cost: 390_000, pnl: 60_000 })
    expect(g.rate).toBeCloseTo((60_000 / 390_000) * 100)
    expect(lotCount(g.rows)).toEqual({ n: 1, lots: 2, accts: 2 })
    expect(lotCount(posRows(rows, false).filter((r) => r.code === '7203'))).toEqual({ n: 1, lots: 1, accts: 1 })
  })
  it('表: 銘柄で分けると銘柄の行だけ（評価額の大きい順・逆順も）。分類で分けると開いた分類だけ中の銘柄', () => {
    const pr = posRows(rows, false)
    const codes = (xs: ReturnType<typeof assetTable>) => xs.map((r) => (r.type === 'm' ? r.r.code : `g:${r.g.key}`))
    expect(codes(assetTable(pr, 'code', 0, false, new Set()))).toEqual(['7203', '2914', '8951', '9999'])
    expect(codes(assetTable(pr, 'code', 0, true, new Set()))).toEqual(['9999', '8951', '2914', '7203'])
    const open = new Set([openKey('sector', '輸送用機器')])
    const t = assetTable(pr, 'sector', 0, false, open)
    expect(t[0]).toMatchObject({ type: 'g', open: true })
    expect(t[1]).toMatchObject({ type: 'm', child: true })
    expect(t.filter((r) => r.type === 'm')).toHaveLength(1)
    // 開いた状態は分類ごと（17 業種で同じ名前を開いても業種には効かない）
    expect(assetTable(pr, 'sector17', 0, false, open).every((r) => r.type === 'g')).toBe(true)
    // 損益率で並べる
    const byRate = assetTable(pr, 'code', 2, false, new Set()).map((r) => (r.type === 'm' ? r.r.code : ''))
    expect(byRate[0]).toBe('7203')
    expect(byRate.at(-1)).toBe('2914')
  })
  it('はじめて見る分類は評価額の大きい上位 2 つを開く', () => {
    expect(firstOpen(posRows(rows, false), 'sector', 2)).toEqual([openKey('sector', '輸送用機器'), openKey('sector', '食料品')])
  })
  it('→ ← で開け閉め。子の行で閉じると分類の行に戻る。Shift+→ ← ですべて', () => {
    const pr = posRows(rows, false)
    let open = new Set<string>()
    let t = assetTable(pr, 'sector', 0, false, open)
    let r = toggleAsset(t, 0, open, true, 'sector')
    open = r.open
    t = assetTable(pr, 'sector', 0, false, open)
    expect(t[1]!.type).toBe('m')
    r = toggleAsset(t, 1, open, false, 'sector')
    expect(r.open.size).toBe(0)
    expect(r.sel).toBe(0)
    r = toggleAsset(t, 1, new Set(), true, 'sector', true)
    expect(r.open.size).toBe(assetGroups(pr, 'sector').length)
    r = toggleAsset(assetTable(pr, 'sector', 0, false, r.open), 1, r.open, false, 'sector', true)
    expect(r.open.size).toBe(0)
    expect(r.sel).toBe(0)
    // 銘柄で分けたときは開け閉めしない
    expect(toggleAsset(t, 0, open, true, 'code').open).toBe(open)
  })
  it('閉じた分類の行の構成: 中の銘柄の評価額の割合（大きい順・足すと 1）', () => {
    const g = assetGroups(posRows(rows, true), 'sector').find((x) => x.key === '輸送用機器')!
    const c = compOf(g)
    expect(c).toHaveLength(2)
    expect(c.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1)
    expect(c[0]!.share).toBeGreaterThanOrEqual(c[1]!.share)
  })
  it('評価損益の棒: 0 の線は損の最大と益の最大の比の位置（益だけなら左端）', () => {
    const sc = pnlScale([{ pnl: 100 }, { pnl: -50 }])
    expect(sc.z).toBeCloseTo(100 / 3)
    expect(pnlBar(100, sc)).toEqual({ left: sc.z, width: (100 / 150) * 100 })
    expect(pnlBar(-50, sc).left).toBeCloseTo(0)
    expect(pnlScale([{ pnl: 10 }]).z).toBe(0)
  })
  it('資産構成のタイル: 分けると同じ銘柄が口座ごとのタイルになる（市場区分でも分けられる）', () => {
    const m = allocTiles(rows, 'sector', 0, 400, 300).filter((x) => !x.group && x.item.rows[0]!.code === '7203')
    expect(m).toHaveLength(1)
    const s = allocTiles(rows, 'sector', 0, 400, 300, true).filter((x) => !x.group && x.item.rows[0]!.code === '7203')
    expect(s.map((x) => x.item.key).sort()).toEqual(['7203/nisa_growth', '7203/tokutei'])
    expect(
      allocTiles(rows, 'market', 0, 400, 300)
        .filter((x) => x.group)
        .map((x) => x.item.key)
        .sort(),
    ).toEqual(['market:P', 'market:R', 'market:X'])
  })
  it('損益寄与を口座ごとに分ける: 今日・取得来は保有の行、今月・今年は Core の口座ごとの値（無ければ銘柄の行）', () => {
    const name = (c: string) => `n${c}`
    const d = contribRows('day', rows, null, name, true).filter((r) => r.code === '7203')
    expect(d.map((r) => r.acct).sort()).toEqual(['nisa_growth', 'tokutei'])
    expect(d.reduce((s, r) => s + r.v, 0)).toBe(150 * 30)
    const core = {
      from: '2025-12-31',
      to: '2026-11-13',
      beforeRecords: false,
      rows: [
        {
          code: 'A',
          price: 10,
          div: 3,
          accts: [
            { acct: 'tokutei' as const, price: 6, div: 1 },
            { acct: 'nisa_growth' as const, price: 4, div: 2 },
          ],
        },
        { code: 'B', price: 5, div: 0 },
      ],
    }
    const y = contribRows('year', rows, core, name, true)
    expect(y.map((r) => [r.code, r.acct ?? null, r.v])).toEqual([
      ['A', 'tokutei', 7],
      ['A', 'nisa_growth', 6],
      ['B', null, 5],
    ])
    expect(contribRows('year', rows, core, name, false).map((r) => r.code)).toEqual(['A', 'B'])
    expect(contribKey(y[0]!)).toBe('A/tokutei')
    expect(contribKey(y[2]!)).toBe('B')
  })
})

// 回帰（2026-11-21 のレビューで見つけた不具合と直し）
describe('分類ごとの資産のレビューの直し（FR-PF6・PF9）', () => {
  it('Shift+→ ですべて開いても、選んでいた行（子の銘柄）のまま。閉じると分類の行', () => {
    const pr = posRows(rows, false)
    // 輸送用機器だけ開き、その子の行（トヨタ）を選ぶ。上に閉じた分類があっても、開いたあとはトヨタを選ぶ
    const open = new Set([openKey('sector', '輸送用機器')])
    const t = assetTable(pr, 'sector', 2, false, open) // 損益率の順: 輸送用機器が先頭とは限らない
    const i = t.findIndex((r) => r.type === 'm' && r.r.code === '7203')
    const r = toggleAsset(t, i, open, true, 'sector', true)
    const after = assetTable(pr, 'sector', 2, false, r.open)
    expect(r.key).toBe(assetRowKey(t[i]!))
    expect(after[after.findIndex((x) => assetRowKey(x) === r.key)]).toMatchObject({ type: 'm', r: { code: '7203' } })
    const c = toggleAsset(
      after,
      after.findIndex((x) => assetRowKey(x) === r.key),
      r.open,
      false,
      'sector',
      true,
    )
    expect(c.key).toBe('g:輸送用機器')
  })
  it('配当の表もすべて開け閉めでき（Shift+→ ←）、閉じると選んでいた銘柄の分類の行', () => {
    const D: FolioDividends = {
      yearAgoDate: null,
      trend: [],
      rows: ['7203', '2914', '8951'].map((code) => ({
        code,
        dps: [1, 1, 1, 1, 1],
        perYear: 1,
        regimeChanged: false,
        special: false,
        last: [],
        prev: [],
        now: [{ acct: 'tokutei' as const, qty: 1 }],
        yearAgo: null,
      })),
    }
    const dr = divRows(D, rows, (c) => ({ name: c, ins: DB[`JP:${c}`]?.ins }))
    const t = tableRows(dr, 'sector', 'annual', new Set())
    const all = toggleOpen(t, 0, new Set(), true, 'sector', true)
    expect(all.open.size).toBe(divGroups(dr, 'sector').length)
    const t2 = tableRows(dr, 'sector', 'annual', all.open)
    const child = t2.findIndex((r) => r.type === 'm' && r.r.code === '2914')
    const shut = toggleOpen(t2, child, all.open, false, 'sector', true)
    expect(shut.open.size).toBe(0)
    expect(shut.key).toBe('g:食料品')
  })
  it('Tab の順は L の並び（資産推移 → 資産構成 → 損益寄与 → 予定 → 分類ごとの資産 → 配当見込み）', () => {
    expect(CARDS.slice(0, 6)).toEqual(['hist', 'alloc', 'contrib', 'events', 'ptab', 'div'])
  })
  it('A は 4 枚のカード（と、カードを選んでいないときの分類ごとの資産）だけ。ほかのカードでは何もしない', () => {
    expect(viewKey(DEFAULT_VIEW, 'KeyA', 'hist')).toBeNull()
    expect(viewKey(DEFAULT_VIEW, 'KeyA', 'events')).toBeNull()
    expect(viewKey(DEFAULT_VIEW, 'KeyA', 'dshare')).toBeNull()
    expect(viewKey(DEFAULT_VIEW, 'KeyA', null)).toMatchObject({ pmerge: false })
  })
  it('列名を押したとき: 今の列ならもう一度で逆順、別の列なら大きい順から', () => {
    expect(sortTo({ ...DEFAULT_VIEW, psort: 1, pasc: false }, 1)).toMatchObject({ psort: 1, pasc: true })
    expect(sortTo({ ...DEFAULT_VIEW, psort: 1, pasc: true }, 2)).toMatchObject({ psort: 2, pasc: false })
  })
  it('口座ごとの配当の行: その口座で売っても、ほかの口座でまだ持っていれば「この口座で売却」', () => {
    const D: FolioDividends = {
      yearAgoDate: '2025-11-13',
      trend: [],
      rows: [
        {
          code: '7203',
          dps: [1, 1, 1, 1, 1],
          perYear: 1,
          regimeChanged: false,
          special: false,
          last: [],
          prev: [],
          now: [{ acct: 'nisa_growth', qty: 50 }],
          yearAgo: [{ acct: 'tokutei', qty: 50 }],
        },
      ],
    }
    const sp = divRows(D, rows, (c) => ({ name: c }), true)
    expect(sp.find((r) => r.acct === 'tokutei')).toMatchObject({ sold: true, soldHere: true })
    expect(sp.find((r) => r.acct === 'nisa_growth')).toMatchObject({ sold: false, soldHere: false })
    expect(divRows(D, rows, (c) => ({ name: c }))[0]).toMatchObject({ sold: false, soldHere: false })
  })
  it('表の棒の目盛り: 分類で分けたら分類の行、銘柄で分けたら銘柄の行。構成比の棒は最大の行を満たす', () => {
    const pr = posRows(rows, false)
    const s = assetScale(assetTable(pr, 'sector', 0, false, new Set([openKey('sector', '輸送用機器')])), 'sector')
    expect(s.maxValue).toBe(450_000) // 分類の行の最大（輸送用機器）。開いた子の行は数えない
    expect(barPct(225_000, s.maxValue)).toBe(50)
    expect(barPct(900_000, s.maxValue)).toBe(100)
    expect(assetScale(assetTable(pr, 'code', 0, false, new Set()), 'code').maxValue).toBe(450_000)
  })
  it('損益の棒の目盛りは開いた子の行も含める（分類の合計と逆の符号の銘柄の棒が消えない・はみ出さない）', () => {
    const mk = (code: string, sector: string, value: number, cost: number): FRow => ({
      ...rows[0]!,
      code,
      name: code,
      sector,
      kind: 'stock',
      acct: 'tokutei',
      qty: 1,
      value,
      cost,
      pnl: value - cost,
      avgCost: cost,
    })
    // 分類 A は合計で含み益（+90）だが中に含み損（-10）、分類 B は含み益
    const pr = posRows([mk('1001', 'A', 200, 100), mk('1002', 'A', 90, 100), mk('1003', 'B', 150, 100)], false)
    const t = assetTable(pr, 'sector', 0, false, new Set([openKey('sector', 'A'), openKey('sector', 'B')]))
    const { sc } = assetScale(t, 'sector')
    for (const r of t) {
      const b = pnlBar(r.type === 'g' ? r.g.pnl : r.r.pnl, sc)
      expect(b.left).toBeGreaterThanOrEqual(0)
      expect(b.left + b.width).toBeLessThanOrEqual(100 + 1e-9)
      expect(b.width).toBeGreaterThan(0)
    }
  })
  it('まとめる・分けるのあとに選び直す: 分類の行は同じ分類の行、銘柄の行は同じ銘柄の最初の行、無ければ今の位置', () => {
    const list = [
      { key: 'g:A', code: undefined },
      { key: 'm:7203/tokutei', code: '7203' },
      { key: 'm:7203/nisa_growth', code: '7203' },
      { key: 'g:B', code: undefined },
    ]
    const keyOf = (x: (typeof list)[number]) => x.key
    const codeOf = (x: (typeof list)[number]) => x.code
    expect(keepRow(list, { key: 'g:B' }, keyOf, codeOf, 1)).toBe(3)
    expect(keepRow(list, { key: 'm:7203', code: '7203' }, keyOf, codeOf, 0)).toBe(1)
    expect(keepRow(list, { key: 'g:Z' }, keyOf, codeOf, 9)).toBe(3)
    expect(keepRow(list, { key: null }, keyOf, codeOf, 2)).toBe(2)
  })
  it('構成の段の濃さは大きい順に薄く（最も薄くて 0.3）。口座の分類の鍵から口座', () => {
    expect(compShade(0)).toBe(1)
    expect(compShade(10)).toBe(0.3)
    expect(acctOfKey('acct:nisa_growth')).toBe('nisa_growth')
    expect(acctOfKey('輸送用機器')).toBeNull()
  })
})

describe('分類ごとの資産のレビューの直し 2（FR-PF5・PF9）', () => {
  it('口座の数は口座の種類で数える（2 銘柄をそれぞれ 2 口座で持っても「2 口座」）', () => {
    const xs = [
      { code: 'A', acct: 'tokutei' as const },
      { code: 'A', acct: 'nisa_growth' as const },
      { code: 'B', acct: 'tokutei' as const },
      { code: 'B', acct: 'nisa_growth' as const },
    ]
    expect(lotCount(xs)).toEqual({ n: 2, lots: 4, accts: 2 })
  })
  it('損益寄与の値上がり・値下がりの数は銘柄で数える（口座ごとに分けても同じ銘柄を 2 回数えない）', () => {
    const rs = [
      { code: 'A', name: '', price: 5, div: 0, v: 5, acct: 'tokutei' as const },
      { code: 'A', name: '', price: -1, div: 0, v: -1, acct: 'nisa_growth' as const },
      { code: 'B', name: '', price: -3, div: 0, v: -3 },
    ]
    expect(contribSummary(rs)).toEqual({ total: 1, div: 0, up: 1, down: 1 })
  })
  it('損益率・取得利回りの無い行は、並べ替えの向きによらず最後', () => {
    const rs = rowsOf(H, (id) => (id === 'JP:2914' ? { ...DB[id]!, m: M({ ...DB[id]!.m, div12: 225 }) } : get(id)))
    const pr = posRows(rs, false)
    const yoc = ASSET_SORTS.indexOf('yoc')
    const last = (asc: boolean) => assetTable(pr, 'code', yoc, asc, new Set()).map((r) => (r.type === 'm' ? r.r.yoc : 0))
    expect(last(false)[0]).not.toBeNull()
    expect(last(true)[0]).not.toBeNull()
    expect(last(true).at(-1)).toBeNull()
  })
})

describe('ポートフォリオの全体のレビューの直し（FR-PF1・PF5・PF7）', () => {
  const D1: FolioDividends = {
    yearAgoDate: '2025-11-13',
    trend: [],
    rows: [
      // 今年無配に転じた（1 株配当 50 → 0）
      {
        code: '7203',
        dps: [40, 45, 50, 50, 0],
        perYear: 2,
        regimeChanged: false,
        special: false,
        last: [],
        prev: [
          { date: '2025-03-28', amount: 25 },
          { date: '2025-09-29', amount: 25 },
        ],
        now: [{ acct: 'tokutei', qty: 100 }],
        yearAgo: [{ acct: 'tokutei', qty: 100 }],
      },
    ],
  }
  it('無配に転じた銘柄も、分類の行の 1 株配当の 5 年は今の株数で数える（全期間 0 にしない）', () => {
    const dr = divRows(D1, rows, (c) => ({ name: c, ins: DB[`JP:${c}`]?.ins, m: DB[`JP:${c}`]?.m }))
    const g = divGroups(dr, 'sector')[0]!
    expect(g.dps).toEqual([4000, 4500, 5000, 5000, 0])
  })
  it('優先株も配当性向を出す（株と同じ扱い）', () => {
    const D2: FolioDividends = { ...D1, rows: [{ ...D1.rows[0]!, dps: [40, 45, 50, 50, 60] }] }
    const pref = divRows(D2, rows, (c) => ({ name: c, ins: { ...DB[`JP:${c}`]!.ins, kind: 'pref' }, m: DB[`JP:${c}`]?.m }))
    expect(pref[0]!.payout).not.toBeNull()
  })
  it('資産推移の帯の取得額の側も階段（斜めに結ばない）', () => {
    const p = (d: string, value: number, cost: number) =>
      ({ d, src: 'rec', final: true, value, cost, pos: [], at: 1 }) as unknown as FolioSeriesPoint
    const g = histGeom([p('2026-11-11', 100, 100), p('2026-11-12', 300, 250), p('2026-11-13', 320, 250)], 600, 200)
    const cmds = g.band.match(/[A-Z][^A-Z]*/g)!
    const lineTo = cmds.filter((c) => c.startsWith('L'))
    // 評価額の線（2 本）と、取得額へ戻る 1 本だけが L。ほかの取得額の側は H・V
    expect(lineTo).toHaveLength(3)
    expect(cmds.some((c) => c.startsWith('V'))).toBe(true)
  })
  it('銘柄をまとめた行の代表の口座は、評価額が最も大きい口座（3 口座以上でも）', () => {
    const r = (acct: AccountType, value: number) => ({ ...rows[0]!, code: '9999', acct, value })
    expect(byCode([r('tokutei', 10), r('nisa_growth', 30), r('nisa_tsumitate', 35)])[0]!.acct).toBe('nisa_tsumitate')
  })
  it('同じ日の予定の印は、何件でも帯の高さに収める', () => {
    for (const n of [1, 2, 3, 6, 12]) {
      for (let k = 0; k < n; k++) {
        expect(markLift(k, n)).toBeGreaterThanOrEqual(12)
        expect(markLift(k, n)).toBeLessThanOrEqual(22)
      }
    }
    expect(markLift(1, 2) - markLift(0, 2)).toBe(9)
  })
})

describe('予定のキー（FR-PF6。縦の一覧）', () => {
  it('← ↑ で前、→ ↓ で次。端で止まる。ほかのキーは動かさない（null）', () => {
    expect(eventStep(2, 5, 'ArrowUp')).toBe(1)
    expect(eventStep(2, 5, 'ArrowLeft')).toBe(1)
    expect(eventStep(2, 5, 'ArrowDown')).toBe(3)
    expect(eventStep(2, 5, 'ArrowRight')).toBe(3)
    expect(eventStep(0, 5, 'ArrowUp')).toBe(0)
    expect(eventStep(4, 5, 'ArrowDown')).toBe(4)
    expect(eventStep(2, 5, 'Enter')).toBeNull()
  })
})

describe('予定の印と鍵（FR-PF6。全体のレビューで見つけた不具合）', () => {
  const e = (day: number, code: string, type: 'rights' | 'earnings' | 'alert' = 'rights', text?: string) =>
    ({ day, date: '2026-11-13', type, code, name: code, ...(text ? { text } : {}) }) as Parameters<typeof eventKey>[0]
  it('同じ日の印の高さは 1 回の数え上げで（同じ日の何件目か・何件あるか）', () => {
    const xs = [e(3, 'A'), e(5, 'B'), e(3, 'C'), e(3, 'D')]
    expect(eventLifts(xs)).toEqual([markLift(0, 3), markLift(0, 1), markLift(1, 3), markLift(2, 3)])
  })
  it('同じ銘柄のアラートが 2 件あっても鍵がぶつからない', () => {
    expect(eventKey(e(0, 'A', 'alert', '終値 ≥ 100'))).not.toBe(eventKey(e(0, 'A', 'alert', '終値 ≤ 50')))
    expect(eventKey(e(3, 'A'))).toBe(eventKey(e(3, 'A')))
  })
})

describe('損益寄与の注記の日付（FR-PF5・PF8。十字線の日を見出しの外に出す）', () => {
  it('今日・取得来は十字線の日（無ければ前の取引日）。今月・今年は前の取引日。十字線の日なら印を付ける', () => {
    expect(contribNoteDay('day', '2026-11-10', '2026-11-13')).toEqual({ d: '11/10', at: true })
    expect(contribNoteDay('all', '2026-11-10', '2026-11-13')).toEqual({ d: '11/10', at: true })
    expect(contribNoteDay('day', null, '2026-11-13')).toEqual({ d: '11/13', at: false })
    expect(contribNoteDay('month', '2026-11-10', '2026-11-13')).toEqual({ d: '11/13', at: false })
  })
})
