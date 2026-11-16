// ポートフォリオのペインの画面のロジック（FR-PF1・PF4〜PF8。src/renderer/lib/folio.ts。docs/testing.md の L4）。値はすべて架空
import type { FolioAt, FolioDividends, FolioSeriesPoint, Holding, Instrument, MetricsRow } from '@shared/types'
import { describe, expect, it } from 'vitest'
import {
  acctParts,
  allocStats,
  allocTiles,
  benchSeries,
  briefOf,
  byCode,
  CARDS,
  clampIndex,
  contribBars,
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
  eventsOf,
  groupKey,
  heatBg,
  heroNumbers,
  histHead,
  histPoints,
  importedAtText,
  importedNote,
  lastTone,
  manYen,
  moveRow,
  nextCard,
  niceTicks,
  nisaShare,
  reselect,
  rowsAtDay,
  rowsOf,
  signPct,
  spatialNext,
  tableRows,
  tileInk,
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
    expect(viewOf({ period: 99, pct: 'x', group: 2 })).toEqual({ ...DEFAULT_VIEW, group: 2 })
  })
  it('Tab で 7 枚のカードを巡る（Shift+Tab は逆）。選んでいないときは最初・最後から', () => {
    expect(nextCard(null, false)).toBe('hist')
    expect(nextCard(null, true)).toBe('dtab')
    expect(nextCard('dtab', false)).toBe('hist')
    expect(CARDS).toHaveLength(7)
  })
  it('単キーの意味はカードで変えない: G は選んでいるカードの分類、S は表の並べ替え、B はベンチマークで % にする', () => {
    const v = DEFAULT_VIEW
    expect(viewKey(v, 'KeyG', 'alloc')!.group).toBe(1)
    expect(viewKey(v, 'KeyG', null)!.group).toBe(1)
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
    expect(h.twr.at(-1)).toBeCloseTo((((120 / 100) * (230 - 100)) / 120) * 100 - 100)
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
  it('1 株配当の最後の棒の色（増配 = 金・減配・据え置き）', () => {
    expect(lastTone([1, 2])).toBe('gold')
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
