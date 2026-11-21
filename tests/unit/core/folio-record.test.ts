// 資産推移の記録と計算（FR-PF2・PF7・PF8。src/core/folio.ts）。市場データは架空の値の差し替え
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { atOf, contribOf, dividendsOf, FolioBook, type Market, periodFrom, recordPoint, seriesOf, seriesResult } from '@core/folio'
import { normalize } from '@core/holdings'
import type { Dividend, FolioPoint, Holding, Split } from '@shared/types'
import { afterEach, describe, expect, it } from 'vitest'

type Bars = Record<string, [string, number, boolean?][]>
function market(bars: Bars, splits: Record<string, Split[]> = {}, divs: Record<string, Dividend[]> = {}): Market {
  const xs = (code: string) => (bars[code] ?? []).map(([d, c, prov]) => ({ d, c, ...(prov ? { prov } : {}) }))
  return {
    closeOn: (code, d) =>
      xs(code)
        .filter((x) => x.d <= d)
        .at(-1) ?? null,
    closes: (code, from) => xs(code).filter((x) => x.d >= from),
    firstBar: (code) => xs(code)[0]?.d,
    splits: (code) => splits[code] ?? [],
    dividends: (code) => divs[code] ?? [],
  }
}
const H = (code: string, quantity: number, avgCost: number, o: Partial<Holding> = {}): Holding => ({
  code,
  account: 'tokutei',
  quantity,
  avgCost,
  ...o,
})
const rec = (points: FolioPoint[], d: string, holdings: Holding[], m: Market, o: { now?: number; jobDone?: boolean } = {}) =>
  recordPoint(points, { d, holdings, meta: null, market: m, now: o.now ?? 1, ...(o.jobDone ? { jobDone: true } : {}) })

describe('資産推移の記録（FR-PF2）', () => {
  const m = market({
    A: [
      ['2026-11-09', 100],
      ['2026-11-10', 110],
      ['2026-11-11', 120],
      ['2026-11-12', 130],
      ['2026-11-13', 140],
    ],
  })
  it('その日の評価額・取得額・保有を 1 件。終値がそろっていれば確定', () => {
    const p = rec([], '2026-11-09', [H('A', 10, 90)], m)!
    expect(p).toHaveLength(1)
    expect(p[0]).toMatchObject({ d: '2026-11-09', src: 'rec', final: true, value: 1000, cost: 900 })
    expect(p[0]!.pos).toEqual([{ code: 'A', acct: 'tokutei', qty: 10, cost: 90 }])
  })
  it('起動しなかった日は前の保有 × その日の終値で補完する（週末は飛ばす）', () => {
    const a = rec([], '2026-11-09', [H('A', 10, 90)], m)!
    const b = rec(a, '2026-11-12', [H('A', 20, 100)], m)!
    expect(b.map((x) => [x.d, x.src, x.value])).toEqual([
      ['2026-11-09', 'rec', 1000],
      ['2026-11-10', 'fill', 1100],
      ['2026-11-11', 'fill', 1200],
      ['2026-11-12', 'rec', 2600],
    ])
  })
  it('確定した点は保有が同じなら書き直さない（null）。保有を変えたらその日を書き直す', () => {
    const a = rec([], '2026-11-13', [H('A', 10, 90)], m)!
    expect(rec(a, '2026-11-13', [H('A', 10, 90)], m, { now: 9 })).toBeNull()
    const b = rec(a, '2026-11-13', [H('A', 15, 90)], m, { now: 9 })!
    expect(b).toHaveLength(1)
    expect(b[0]).toMatchObject({ value: 2100, at: 9 })
  })
  it('その日の終値が無い（取得の前）・暫定の足なら暫定。次の記録で確定に書き直す。ジョブの終わりなら取得失敗の印', () => {
    const m2 = market({ A: [['2026-11-12', 130]] })
    const a = rec([], '2026-11-13', [H('A', 10, 90)], m2, { jobDone: true })!
    expect(a[0]).toMatchObject({ final: false, stale: true, value: 1300 })
    const m3 = market({ A: [['2026-11-13', 141, true]] })
    expect(rec([], '2026-11-13', [H('A', 10, 90)], m3)![0]!.final).toBe(false)
    const b = rec(a, '2026-11-13', [H('A', 10, 90)], m)!
    expect(b[0]).toMatchObject({ final: true, value: 1400 })
    expect(b[0]!.stale).toBeUndefined()
  })
  it('終値の無い銘柄（新しく足したばかり）は取得単価で数え、暫定にする', () => {
    const p = rec([], '2026-11-13', [H('A', 10, 90), H('B', 5, 200)], m)!
    expect(p[0]).toMatchObject({ final: false, value: 1400 + 1000, cost: 900 + 1000 })
  })
  it('保有が無くなったら評価額 0 の点を残す（前の保有で補完し続けない）。取引日でない日は記録しない', () => {
    const a = rec([], '2026-11-12', [H('A', 10, 90)], m)!
    const b = rec(a, '2026-11-13', [], m)!
    expect(b.at(-1)).toMatchObject({ d: '2026-11-13', value: 0, pos: [] })
    expect(rec([], '2026-11-14', [H('A', 1, 1)], m)).toBeNull()
    expect(rec([], '2026-11-13', [], m)).toBeNull()
  })
  it('分割: 取り込んだ日のあとの分割は株数を換算して評価する（CSV を取り込み直す前でも正しい）', () => {
    // 11/11 に 1:2 の分割。終値は分割調整済み（分割の前の日も半分の値）
    const ms = market({ A: [['2026-11-13', 70]] }, { A: [{ date: '2026-11-11', ratio: 2 }] })
    const p = rec([], '2026-11-13', [H('A', 10, 180, { importedAt: '2026-11-01T00:00:00Z' })], ms)!
    expect(p[0]).toMatchObject({ value: 1400, cost: 1800 })
    expect(p[0]!.pos[0]).toMatchObject({ qty: 20, cost: 90 })
  })
  it('実現損益と受取配当の累計を CSV の情報から残す', () => {
    const p = recordPoint([], {
      d: '2026-11-13',
      holdings: [H('A', 1, 1)],
      meta: { broker: 'rakuten', importedAt: '', realized: 300, dividends: 50 },
      market: m,
      now: 1,
    })!
    expect(p[0]).toMatchObject({ realized: 300, received: 50 })
  })
})

describe('記録の保存（FR-PF2: 作り直せないデータ）', () => {
  let dir = ''
  afterEach(() => rmSync(dir, { recursive: true, force: true }))
  const pt = (d: string): FolioPoint => ({ d, src: 'rec', final: true, value: 1, cost: 1, pos: [], at: 1 })
  it('書くたびに直前の版を .bak に残す。本体が壊れたら .bak を読む', () => {
    dir = mkdtempSync(join(tmpdir(), 'folio-'))
    const b = new FolioBook(dir)
    b.save([pt('2026-11-12')])
    b.save([pt('2026-11-12'), pt('2026-11-13')])
    expect(JSON.parse(readFileSync(join(dir, 'portfolioHistory.json.bak'), 'utf8')).data).toHaveLength(1)
    writeFileSync(join(dir, 'portfolioHistory.json'), '{broken')
    const c = new FolioBook(dir)
    expect(c.load()).toHaveLength(1)
    expect(c.broken).toBeUndefined()
  })
  it('本体も .bak も読めなければ上書きしない（消さない）。読み取り専用のときも書かない', () => {
    dir = mkdtempSync(join(tmpdir(), 'folio-'))
    writeFileSync(join(dir, 'portfolioHistory.json'), '{broken')
    const b = new FolioBook(dir)
    expect(b.load()).toEqual([])
    expect(b.broken).toMatch(/portfolioHistory/)
    expect(b.save([pt('2026-11-13')])).toBe(false)
    // 読めない本体は日時付きのファイルに退避して残す
    const kept = readdirSync(dir).filter((f) => f.startsWith('portfolioHistory.broken-'))
    expect(readFileSync(join(dir, kept[0]!), 'utf8')).toBe('{broken')
    const ro = new FolioBook(mkdtempSync(join(tmpdir(), 'folio-')), () => true)
    expect(ro.save([pt('2026-11-13')])).toBe(false)
    expect(ro.clear()).toBe(false)
  })
  it('消すときも日時付きのファイルに残す', () => {
    dir = mkdtempSync(join(tmpdir(), 'folio-'))
    const b = new FolioBook(dir)
    b.save([pt('2026-11-13')])
    expect(b.clear()).toBe(true)
    expect(b.load()).toEqual([])
    expect(new FolioBook(dir).load()).toEqual([])
    const kept = readdirSync(dir).filter((f) => f.startsWith('portfolioHistory.cleared-'))
    expect(JSON.parse(readFileSync(join(dir, kept[0]!), 'utf8')).data).toHaveLength(1)
  })
})

describe('系列・ある日の値・期間（FR-PF3・PF5・PF8）', () => {
  const m = market(
    {
      A: [
        ['2026-11-04', 90],
        ['2026-11-05', 95],
        ['2026-11-06', 100],
        ['2026-11-09', 110],
        ['2026-11-10', 120],
      ],
      B: [
        ['2026-11-05', 10],
        ['2026-11-06', 11],
        ['2026-11-09', 12],
        ['2026-11-10', 13],
      ],
    },
    { A: [{ date: '2026-11-10', ratio: 2 }] },
  )
  const pts = rec([], '2026-11-09', [H('A', 10, 50), H('B', 100, 10)], m)!
  it('系列は保有の明細を除く。記録の前の試算はすべての銘柄の終値がそろう日から、最初の記録の保有で', () => {
    const s = seriesOf(pts, m, false)
    expect(s).toHaveLength(1)
    expect(s[0]).not.toHaveProperty('pos')
    const e = seriesOf(pts, m, true)
    // A は 11/04 から、B は 11/05 から → 11/05 から
    expect(e.map((x) => [x.d, x.src])).toEqual([
      ['2026-11-05', 'est'],
      ['2026-11-06', 'est'],
      ['2026-11-09', 'rec'],
    ])
    // 最初の記録（11/09）の後に分割があるので、試算も今の基準の終値 × 換算した株数
    expect(e[0]!.value).toBe(10 * 95 * 2 + 100 * 10)
    expect(e[0]!.cost).toBe(pts[0]!.cost)
  })
  it('ある日の保有と終値: 株数は今の基準に換算し、前の取引日の終値を添える。記録の前は null', () => {
    const a = atOf(pts, '2026-11-10', m)!
    expect(a.d).toBe('2026-11-09')
    expect(a.pos.find((x) => x.code === 'A')).toMatchObject({ qty: 20, cost: 25 })
    expect(a.close).toEqual({ A: 110, B: 12 })
    expect(a.prev).toEqual({ A: 100, B: 11 })
    expect(atOf(pts, '2026-11-01', m)).toBeNull()
  })
  it('今月・今年の初めは前の期間の最後の日', () => {
    expect(periodFrom('month', '2026-11-13')).toBe('2026-10-31')
    expect(periodFrom('year', '2026-11-13')).toBe('2025-12-31')
    const c = contribOf(pts, [H('A', 10, 50), H('B', 100, 10)], 'month', '2026-11-10', m)
    expect(c.from).toBe('2026-10-31')
    expect(c.beforeRecords).toBe(true)
    expect(c.rows.map((r) => r.code).sort()).toEqual(['A', 'B'])
  })
})

describe('配当の分析の材料（FR-PF7）', () => {
  const m = market(
    { A: [['2026-11-13', 100]] },
    {},
    {
      A: [
        { date: '2025-03-28', amount: 10 },
        { date: '2025-09-29', amount: 10 },
        { date: '2026-03-30', amount: 12 },
        { date: '2026-09-29', amount: 12 },
      ],
    },
  )
  it('記録が 1 年に満たなければ 1 年前の株数は null（増配・減配の分だけになる）', () => {
    const pts = rec([], '2026-11-13', [H('A', 100, 50)], m)!
    const d = dividendsOf(pts, [H('A', 100, 50)], '2026-11-13', m)
    expect(d.yearAgoDate).toBeNull()
    expect(d.rows[0]).toMatchObject({ code: 'A', yearAgo: null, now: [{ acct: 'tokutei', qty: 100 }] })
    expect(d.rows[0]!.dps.slice(-2)).toEqual([20, 24])
  })
  it('1 年前の記録があれば、その日の株数（口座ごと）。売った銘柄も行に残る。推移は記録の日ごと', () => {
    const old: FolioPoint = {
      d: '2025-11-12',
      src: 'rec',
      final: true,
      value: 0,
      cost: 0,
      pos: [
        { code: 'A', acct: 'nisa_growth', qty: 50, cost: 40 },
        { code: 'S', acct: 'tokutei', qty: 10, cost: 1 },
      ],
      at: 1,
    }
    const pts = rec([old], '2026-11-13', [H('A', 100, 50)], m)!
    const d = dividendsOf(pts, [H('A', 100, 50)], '2026-11-13', m)
    // 間の日は補完される（1 年前の日 11/13 の補完値）
    expect(d.yearAgoDate).toBe('2025-11-13')
    expect(d.rows.find((r) => r.code === 'A')!.yearAgo).toEqual([{ acct: 'nisa_growth', qty: 50 }])
    expect(d.rows.find((r) => r.code === 'S')).toMatchObject({ now: [], yearAgo: [{ acct: 'tokutei', qty: 10 }] })
    expect(d.trend.at(-1)!.d).toBe('2026-11-13')
    expect(d.trend.at(-1)!.v).toBeCloseTo(100 * 24 * (1 - 0.20315))
    // 1 年前の点の見込みは、その日までの直近 1 年（2024-11〜2025-11 の 20 円）× NISA（非課税）
    expect(d.trend[0]!.v).toBe(50 * 20)
  })
})

// 回帰（2026-11-15 のレビューで見つけた不具合）
describe('暫定の点の書き直し・保存の世代・取引時間中の保有の変更（FR-PF2）', () => {
  it('補完した日の足が後から入ったら、次の記録で確定の値に書き直す', () => {
    const early = market({ A: [['2026-11-09', 100]] })
    const a = rec([], '2026-11-09', [H('A', 10, 90)], early)!
    // 11/12 の記録の時点では 11/10・11/11 の足が無い（起動の直後）
    const b = rec(
      a,
      '2026-11-12',
      [H('A', 10, 90)],
      market({
        A: [
          ['2026-11-09', 100],
          ['2026-11-12', 130],
        ],
      }),
    )!
    expect(b.find((p) => p.d === '2026-11-10')).toMatchObject({ src: 'fill', final: false, value: 1000 })
    // 足がそろってから同じ日をもう一度記録すると、補完した日も確定になる
    const full = market({
      A: [
        ['2026-11-09', 100],
        ['2026-11-10', 110],
        ['2026-11-11', 120],
        ['2026-11-12', 130],
      ],
    })
    const c = rec(b, '2026-11-12', [H('A', 10, 90)], full)!
    expect(c.find((p) => p.d === '2026-11-10')).toMatchObject({ src: 'fill', final: true, value: 1100 })
    expect(c.find((p) => p.d === '2026-11-11')).toMatchObject({ final: true, value: 1200 })
  })
  it('前の日の暫定の記録も、次の日の記録で確定の値に書き直す（保有はその日のまま）', () => {
    const a = rec([], '2026-11-12', [H('A', 10, 90)], market({ A: [['2026-11-11', 120]] }))!
    expect(a[0]!.final).toBe(false)
    const full = market({
      A: [
        ['2026-11-11', 120],
        ['2026-11-12', 130],
        ['2026-11-13', 140],
      ],
    })
    const b = rec(a, '2026-11-13', [H('A', 20, 90)], full)!
    expect(b[0]).toMatchObject({ d: '2026-11-12', final: true, value: 1300 })
    expect(b[0]!.pos[0]!.qty).toBe(10)
  })
  it('取引時間中に保有を変えても、前の取引日の確定した点は書き換えない', () => {
    const m = market({ A: [['2026-11-12', 130]] })
    const a = rec([], '2026-11-12', [H('A', 10, 90)], m)!
    const b = recordPoint(a, { d: '2026-11-12', holdings: [], meta: null, market: m, now: 2, keepFinal: true })
    expect(b).toBeNull()
  })
  it('補完は銘柄ごとに日足を 1 回だけ読む（長く起動しなかった後でも止まらない）', () => {
    const bars: Bars = { A: [], B: [] }
    for (let d = '2025-01-06', i = 0; d <= '2026-11-13'; i++) {
      bars.A!.push([d, 100 + i])
      bars.B!.push([d, 50 + i])
      const x = new Date(`${d}T00:00:00Z`)
      x.setUTCDate(x.getUTCDate() + 1)
      d = x.toISOString().slice(0, 10)
    }
    const m = market(bars)
    let calls = 0
    const counted: Market = {
      ...m,
      closeOn: (c, d) => {
        calls++
        return m.closeOn(c, d)
      },
      closes: (c, f) => {
        calls++
        return m.closes(c, f)
      },
    }
    const a = rec([], '2025-06-02', [H('A', 1, 1), H('B', 1, 1)], m)!
    rec(a, '2026-11-13', [H('A', 1, 1), H('B', 1, 1)], counted)
    expect(calls).toBeLessThan(20)
  })
})

describe('記録の保存の世代（FR-PF2。レビューで見つけた不具合）', () => {
  let dir = ''
  afterEach(() => rmSync(dir, { recursive: true, force: true }))
  const pt = (d: string): FolioPoint => ({ d, src: 'rec', final: true, value: 1, cost: 1, pos: [], at: 1 })
  it('消した記録は、その後に何度書いても別のファイルに残る', () => {
    dir = mkdtempSync(join(tmpdir(), 'folio-'))
    const b = new FolioBook(dir)
    b.save([pt('2026-11-10'), pt('2026-11-11')])
    b.clear()
    b.save([pt('2026-11-12')])
    b.save([pt('2026-11-12'), pt('2026-11-13')])
    const kept = readdirSync(dir).filter((f) => f.startsWith('portfolioHistory.cleared-'))
    expect(kept).toHaveLength(1)
    expect(JSON.parse(readFileSync(join(dir, kept[0]!), 'utf8')).data).toHaveLength(2)
  })
  it('本体が読めないときは別のファイルに退避して知らせ、.bak を上書きしない', () => {
    dir = mkdtempSync(join(tmpdir(), 'folio-'))
    const b = new FolioBook(dir)
    b.save([pt('2026-11-12')])
    b.save([pt('2026-11-12'), pt('2026-11-13')])
    writeFileSync(join(dir, 'portfolioHistory.json'), '{broken')
    const c = new FolioBook(dir)
    expect(c.load()).toHaveLength(1)
    expect(c.warning).toMatch(/portfolioHistory/)
    expect(readdirSync(dir).some((f) => f.startsWith('portfolioHistory.broken-'))).toBe(true)
    c.save([pt('2026-11-12'), pt('2026-11-14')])
    expect(JSON.parse(readFileSync(join(dir, 'portfolioHistory.json.bak'), 'utf8')).data).toHaveLength(1)
  })
})

describe('記録の実現損益・受取配当（FR-PF2。レビューで見つけた不具合）', () => {
  const m = market({ A: [['2026-11-12', 130]] })
  const meta = (realized: number, dividends: number) => ({ broker: 'rakuten', importedAt: '', realized, dividends })
  it('保有が同じでも、実現損益・受取配当が変わったら同じ日の記録を書き直す', () => {
    const a = recordPoint([], { d: '2026-11-12', holdings: [H('A', 10, 90)], meta: meta(100, 10), market: m, now: 1 })!
    expect(a[0]).toMatchObject({ final: true, realized: 100, received: 10 })
    const b = recordPoint(a, { d: '2026-11-12', holdings: [H('A', 10, 90)], meta: meta(100, 25), market: m, now: 2 })
    expect(b?.[0]).toMatchObject({ realized: 100, received: 25 })
    // 何も変わらなければ書き直さない
    expect(recordPoint(a, { d: '2026-11-12', holdings: [H('A', 10, 90)], meta: meta(100, 10), market: m, now: 3 })).toBeNull()
  })
  it('取引時間中・休日に保有を変えたとき（keepFinal）、前の取引日の暫定の点は保有と一緒に実現損益・受取配当もその日のまま', () => {
    // 11/12 の足がまだ無い（暫定の点）
    const early = market({ A: [['2026-11-11', 120]] })
    const a = recordPoint([], { d: '2026-11-12', holdings: [H('A', 10, 90)], meta: meta(100, 10), market: early, now: 1 })!
    expect(a[0]).toMatchObject({ final: false, realized: 100 })
    // 翌朝に売って実現損益が増えた（keepFinal）。11/12 の点に翌日の売却の実現損益を入れない
    const b = recordPoint(a, { d: '2026-11-12', holdings: [], meta: meta(900, 10), market: m, now: 2, keepFinal: true })!
    expect(b[0]).toMatchObject({ d: '2026-11-12', realized: 100, received: 10 })
    expect(b[0]!.pos[0]!.qty).toBe(10)
  })
})

describe('今の株数・前の取引日の点（FR-PF1・PF2。全体のレビューで見つけた不具合）', () => {
  let dir = ''
  afterEach(() => rmSync(dir, { recursive: true, force: true }))
  // 11/16（月）が 1:2 の分割。日足は分割で調整済み（11/13 の終値も半分）
  const sp = { A: [{ date: '2026-11-16', ratio: 2 }] }
  const m = market({ A: [['2026-11-13', 500]] }, sp)
  const mon10 = Date.parse('2026-11-16T10:00:00+09:00')
  const nowQty = (h: Holding) => {
    dir = mkdtempSync(join(tmpdir(), 'folio-'))
    return seriesResult(new FolioBook(dir), m, false, false, [normalize(h, sp.A)], mon10).now[0]!.qty
  }
  it('分割の日の場中でも、今の株数は今日の基準（調整済みの終値と掛けて評価額が半分にならない）', () => {
    // 木曜に取り込んだ 100 株も、月曜の朝に取り込んだ分割後の 200 株も、今は 200 株
    expect(nowQty(H('A', 100, 1000, { importedAt: '2026-11-12T08:00:00Z' }))).toBe(200)
    expect(nowQty(H('A', 200, 500, { importedAt: '2026-11-16T00:30:00Z' }))).toBe(200)
  })
  it('記録の日が今日でなければ（取引時間中・休日）、保有を変えたあとの素の記録（起動・日々の更新）でも前の取引日の確定した点を変えない', () => {
    const m2 = market({ A: [['2026-11-13', 130]] })
    const meta = (realized: number) => ({ broker: 'rakuten', importedAt: '', realized, dividends: 0 })
    const a = recordPoint([], { d: '2026-11-13', today: '2026-11-13', holdings: [H('A', 10, 90)], meta: meta(100), market: m2, now: 1 })!
    expect(a[0]).toMatchObject({ final: true, realized: 100 })
    // 土曜に売って取り込み、そのあと起動し直した（keepFinal を渡さない呼び出し）
    expect(recordPoint(a, { d: '2026-11-13', today: '2026-11-14', holdings: [], meta: meta(900), market: m2, now: 2 })).toBeNull()
    // 金曜の大引けのあと（今日が記録の日）なら書き直す
    expect(recordPoint(a, { d: '2026-11-13', today: '2026-11-13', holdings: [], meta: meta(900), market: m2, now: 3 })?.[0]).toMatchObject({
      realized: 900,
    })
  })
})
