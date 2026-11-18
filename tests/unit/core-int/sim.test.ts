// 配当シミュレータの sim.run（docs/design-simulator.md §10。L3）。値はスタブの架空の値
import { DEFAULT_SIM } from '@shared/sim/types'
import { afterAll, describe, expect, it } from 'vitest'
import { makeCore, runJob } from '../../support/core'

const core = makeCore()
const { call } = core
afterAll(() => core.dispose())
const S = { ...DEFAULT_SIM, years: 3 as const }
const IDS = ['JP:8058', 'JP:8001', 'JP:8031', 'JP:8053', 'JP:8002', 'JP:8951', 'JP:8952', 'JP:1605']

describe('FR-SIM2 FR-SIM4 sim.run（スタブ）', () => {
  it('過去とこれからを 1 回で返す。基準日・推移・銘柄ごとの行がそろう', async () => {
    const r = await call('sim.run', { ids: IDS, settings: S })
    expect(r.ids).toEqual(IDS)
    expect(r.total).toBe(IDS.length)
    expect(r.past).not.toBeNull()
    const p = r.past!
    expect(p.dates[0]).toBe(p.base)
    expect(p.dates.at(-1)).toBe(r.asOf)
    expect(p.port.length).toBe(p.dates.length)
    expect(p.port[0]).toBeCloseTo(S.amount)
    expect(p.hero.wealth).toBeCloseTo(p.port.at(-1)!)
    expect(p.hero.received).toBeGreaterThan(0)
    // 1306 も同じルールで回す
    expect(p.etf?.length ?? p.dates.length).toBe(p.dates.length)
    expect(r.fwd.rows.length).toBe(IDS.length)
    expect(r.fwd.y1).toBeGreaterThan(0)
  })
  it('1605（上場 12 か月未満）は過去から外し、これからには入れる', async () => {
    const r = await call('sim.run', { ids: IDS, settings: { ...S, years: 1 } })
    expect(r.excluded).toContainEqual({ id: 'JP:1605', reason: 'noPrice' })
    expect(r.past!.rows.some((x) => x.id === 'JP:1605')).toBe(false)
    expect(r.fwd.rows.some((x) => x.id === 'JP:1605')).toBe(true)
  })
  it('8002（無配に転じた）は D₀ = 0 で期間不足の印。外さない', async () => {
    const r = await call('sim.run', { ids: IDS, settings: S })
    const m = r.fwd.rows.find((x) => x.id === 'JP:8002')!
    expect(m.d0).toBe(0)
    expect(m.y1).toBe(0)
    expect(m.short).toBe(true)
  })
  it('J-REIT は同業種（まとめて 1 つ）で比べ、順位が付く。卸売業は相手が 5 に満たず比べない', async () => {
    const r = await call('sim.run', { ids: IDS, settings: S })
    const rows = r.past!.rows
    expect(rows.find((x) => x.id === 'JP:8951')!.rank).toMatchObject({ n: 8 })
    expect(rows.find((x) => x.id === 'JP:8058')!.rank).toBeNull()
    expect(r.past!.peer).not.toBeNull()
    expect(r.reitShare).toBeCloseTo(2 / IDS.length)
  })
  it('同じ入力なら同じ結果。設定（再投資・税）で値が変わる', async () => {
    const a = await call('sim.run', { ids: IDS, settings: S })
    const b = await call('sim.run', { ids: IDS, settings: S })
    expect(b).toEqual(a)
    const g = await call('sim.run', { ids: IDS, settings: { ...S, tax: 'gross' } })
    expect(g.past!.hero.received).toBeGreaterThan(a.past!.hero.received)
    const re = await call('sim.run', { ids: IDS, settings: { ...S, reinvest: true } })
    expect(re.past!.hero.wealth).not.toBeCloseTo(a.past!.hero.wealth)
  })
  it('上限: 出どころの先頭 200 銘柄で計算し、全体の数を返す', async () => {
    const all = (await call('instruments.all', {})).filter((i) => i.kind === 'stock').map((i) => i.id)
    const many = Array.from({ length: 230 }, (_, i) => all[i % all.length]!)
    const r = await call('sim.run', { ids: many, settings: S })
    expect(r.ids.length).toBe(200)
    expect(r.total).toBe(230)
  })
  it('入力は zod で確かめる（元本の範囲）', async () => {
    await expect(call('sim.run', { ids: IDS, settings: { ...S, amount: 1 } })).rejects.toMatchObject({ code: 'invalid-params' })
  })
  it('キャッシュは取得の完了で捨てる', async () => {
    await call('sim.run', { ids: IDS, settings: S })
    expect(core.svc.sim.cached).toBeGreaterThan(0)
    await runJob(core, 'daily')
    expect(core.svc.sim.cached).toBe(0)
  })
})

describe('FR-SIM5 上場廃止の銘柄（sim.run）', () => {
  it('ウォッチリストに残った上場廃止の銘柄は、過去にもこれからにも入れない', async () => {
    core.svc.repo.db.run(`UPDATE instruments SET status = 'delisted' WHERE id = 'JP:8053'`)
    core.svc.sim.clear()
    const r = await call('sim.run', { ids: ['JP:8058', 'JP:8053'], settings: S })
    expect(r.excluded).toContainEqual({ id: 'JP:8053', reason: 'delisted' })
    expect(r.fwd.rows.map((x) => x.id)).toEqual(['JP:8058'])
    core.svc.repo.db.run(`UPDATE instruments SET status = 'active' WHERE id = 'JP:8053'`)
    core.svc.sim.clear()
  })
})

describe('FR-SIM2 2 回目のレビューの反映（Core）', () => {
  it('上場廃止の銘柄には月次系列の取得を頼まない', async () => {
    const { SimData } = await import('@core/sim')
    const asked: string[] = []
    const db = core.svc.repo.db
    db.run(`UPDATE instruments SET status = 'delisted' WHERE id = 'JP:8031'`)
    db.run(`UPDATE fetch_state SET last_monthly = NULL WHERE id IN ('JP:8031', 'JP:8001')`)
    const sd = new SimData(
      core.svc.repo,
      () => 3,
      (id) => asked.push(id),
    )
    sd.run(['JP:8031', 'JP:8001'], S)
    expect(asked).toContain('JP:8001')
    expect(asked).not.toContain('JP:8031')
    db.run(`UPDATE instruments SET status = 'active' WHERE id = 'JP:8031'`)
  })
  it('データの基準の日が変わったら、配当の記録の始まり・ストレスの母集団のキャッシュを作り直す', async () => {
    const { SimData } = await import('@core/sim')
    const db = core.svc.repo.db
    const sd = new SimData(core.svc.repo, () => 3)
    const last = db.get<{ d: string }>(`SELECT MAX(d) d FROM daily_bars WHERE id = 'JP:8058'`)!.d
    const saved = db.all<{ id: string; d: string; o: number; h: number; l: number; c: number; v: number; prov: number }>(
      `SELECT * FROM daily_bars WHERE id = 'JP:8058' AND d = ?`,
      last,
    )
    db.run(`DELETE FROM daily_bars WHERE id = 'JP:8058' AND d = ?`, last)
    const a = sd.run(['JP:8058'], S)
    expect(a.asOf < last).toBe(true)
    const b = sd.run(['JP:8001'], S)
    expect(b.asOf).toBe(last)
    expect(sd.cachedFor).toBe(last)
    for (const r of saved)
      db.run(
        `INSERT INTO daily_bars(id, d, o, h, l, c, v, prov) VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
        r.id,
        r.d,
        r.o,
        r.h,
        r.l,
        r.c,
        r.v,
        r.prov,
      )
  })
  it('同業種の相手の月末の終値は、0 以下の終値を飛ばしてその月の最後の有効な終値', async () => {
    const { SimData } = await import('@core/sim')
    const db = core.svc.repo.db
    const sd = new SimData(core.svc.repo, () => 3)
    const end = db.get<{ d: string }>(`SELECT MAX(d) d FROM daily_bars WHERE id = 'JP:8001' AND d < '2026-10-01'`)!.d
    const prev = db.get<{ c: number }>(`SELECT c FROM daily_bars WHERE id = 'JP:8001' AND d < ? ORDER BY d DESC LIMIT 1`, end)!.c
    const orig = db.get<{ c: number }>(`SELECT c FROM daily_bars WHERE id = 'JP:8001' AND d = ?`, end)!.c
    db.run(`UPDATE daily_bars SET c = 0 WHERE id = 'JP:8001' AND d = ?`, end)
    const px = (sd as unknown as { litePx: (id: string) => { d: string[]; c: number[] } }).litePx('JP:8001')
    const i = px.d.indexOf(`${end.slice(0, 7)}-01`)
    expect(i).toBeGreaterThanOrEqual(0)
    expect(px.c[i]).toBe(prev)
    db.run(`UPDATE daily_bars SET c = ? WHERE id = 'JP:8001' AND d = ?`, orig, end)
  })
})

describe('FR-SIM11 保有を出どころに（sim.run）', () => {
  it('Core が保有の株数と口座を読んで、これからを実際の株数と口座ごとの税で計算する', async () => {
    const before = await call('portfolio.list', {})
    await call('portfolio.save', {
      holdings: [
        { code: '8058', account: 'nisa_growth', quantity: 100, avgCost: 10000 },
        { code: '8058', account: 'tokutei', quantity: 50, avgCost: 10000 },
        { code: '8001', account: 'tokutei', quantity: 200, avgCost: 3000 },
      ],
    })
    const g = await call('sim.run', { ids: ['JP:8058', 'JP:8001'], settings: { ...S, tax: 'gross' } })
    const r = await call('sim.run', { ids: ['JP:8058', 'JP:8001'], settings: S, held: true })
    expect(r.fwd.held).toBe(true)
    const a = r.fwd.rows.find((x) => x.id === 'JP:8058')!
    const b = r.fwd.rows.find((x) => x.id === 'JP:8001')!
    expect(a.shares).toBe(150)
    expect(b.shares).toBe(200)
    const d0a = g.fwd.rows.find((x) => x.id === 'JP:8058')!.d0
    expect(a.y1).toBeCloseTo(d0a * (100 + 50 * (1 - 0.20315)))
    expect(r.fwd.amount).toBeCloseTo(a.price * 150 + b.price * 200)
    await call('portfolio.save', { holdings: before })
  })
})

describe('FR-SIM7 同業種の相手をまとめて読む（性能。21.11）', () => {
  it('まとめて読んだ月末の終値・配当は、1 銘柄ずつ読んだものと同じ（11 年前から）', async () => {
    const { SimData } = await import('@core/sim')
    const sd = new SimData(core.svc.repo, () => 3) as unknown as {
      run: (ids: string[], s: typeof S) => unknown
      prefetchLite: (xs: { id: string }[]) => void
      litePx: (id: string) => { d: string[]; c: number[] }
      lite: Map<string, { px: { d: string[]; c: number[] }; divs: unknown[] } | null>
      instruments: () => { id: string }[]
    }
    sd.run(['JP:8058'], S)
    const ids = ['JP:8001', 'JP:8031', 'JP:8951']
    sd.prefetchLite(sd.instruments().filter((i) => ids.includes(i.id)))
    for (const id of ids) {
      const a = sd.lite.get(id)!.px
      const b = sd.litePx(id)
      const from = a.d[0]!
      const bi = b.d.indexOf(from)
      expect(bi, id).toBeGreaterThanOrEqual(0)
      expect(a.d, id).toEqual(b.d.slice(bi))
      expect(a.c, id).toEqual(b.c.slice(bi))
      expect(sd.lite.get(id)!.divs, id).toEqual(core.svc.repo.dividends(id))
    }
  })
})

describe('FR-SIM8 配当の記録の始まり（10 年の基準日のため）', () => {
  it('月次系列を取った日の 10 年前から（今日より後の日付なら今日の 10 年前）。取っていなければ日足の保存期間の始まり', async () => {
    const { divCoverFrom } = await import('@core/sim')
    expect(divCoverFrom('2026-11-15T03:00:00.000Z', '2026-11-20', '2023-10-13')).toBe('2016-11-15')
    expect(divCoverFrom('2027-01-01T03:00:00.000Z', '2026-11-20', '2023-10-13')).toBe('2016-11-20')
    // 10 年分の配当を入れる前の版で月次系列を取った銘柄は、日足の保存期間の分しか配当を持たない
    expect(divCoverFrom('2026-11-01T03:00:00.000Z', '2026-11-13', '2023-10-13')).toBe('2023-10-13')
    expect(divCoverFrom(null, '2026-11-13', '2023-10-13')).toBe('2023-10-13')
  })
})

describe('FR-SIM8 10 年分の配当を入れる前の版で取った銘柄（レビューの反映）', () => {
  it('計算した銘柄の月次系列が古い版なら取り直しを頼む（新しい版・廃止の銘柄は頼まない）', async () => {
    const { SimData, DIV10_SINCE } = await import('@core/sim')
    const db = core.svc.repo.db
    const keep = db.all<{ id: string; m: string | null }>(
      `SELECT id, last_monthly m FROM fetch_state WHERE id IN ('JP:8058','JP:8001','JP:8031')`,
    )
    db.run(`UPDATE fetch_state SET last_monthly = '2026-11-01T03:00:00.000Z' WHERE id IN ('JP:8058', 'JP:8031')`)
    db.run(`UPDATE fetch_state SET last_monthly = '2026-11-15T03:00:00.000Z' WHERE id = 'JP:8001'`)
    db.run(`UPDATE instruments SET status = 'delisted' WHERE id = 'JP:8031'`)
    const asked: string[] = []
    const sd = new SimData(
      core.svc.repo,
      () => 3,
      () => {},
      DIV10_SINCE,
      (id) => asked.push(id),
    )
    sd.run(['JP:8058', 'JP:8001', 'JP:8031'], S)
    // 比べる 1306 も同じ（スタブの取得の日付は版より前）
    expect(asked).toContain('JP:8058')
    expect(asked).not.toContain('JP:8001')
    expect(asked).not.toContain('JP:8031')
    db.run(`UPDATE instruments SET status = 'active' WHERE id = 'JP:8031'`)
    for (const k of keep) db.run('UPDATE fetch_state SET last_monthly = ? WHERE id = ?', k.m, k.id)
  })
})

describe('FR-SIM8 当時の条件で選び直す（sim.run）', () => {
  it('過去は基準日の値で条件を当て直した銘柄で計算し、これからは今の銘柄のまま。使えなかった条件を返す', async () => {
    const now = await call('sim.run', { ids: IDS, settings: S })
    const r = await call('sim.run', {
      ids: IDS,
      settings: S,
      rescreen: {
        conditions: [
          { field: 'income.yield', op: '>=', value: 3 },
          { field: 'attr.market', op: 'in', value: ['P', 'R'] },
          { field: 'value.per', op: '<=', value: 99 },
        ],
        favorites: [],
        watchlists: {},
      },
    })
    expect(r.past!.rescreen).toMatchObject({ ignored: ['value.per'] })
    expect(r.past!.rescreen!.count).toBe(r.past!.rows.length + r.excluded.length)
    expect(r.fwd.rows.map((x) => x.id)).toEqual(now.fwd.rows.map((x) => x.id))
    // 基準日に利回り 3% 以上だった銘柄だけ（今の銘柄とは違ってよい）
    expect(r.past!.rows.length).toBeGreaterThan(0)
  })
})
