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
