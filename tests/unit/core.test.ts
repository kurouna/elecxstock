import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStubProvider } from '@core/providers/stub'
import { CoreService } from '@core/service'
import { UserStore } from '@core/userstore'
import { afterAll, describe, expect, it } from 'vitest'

const dir = mkdtempSync(join(tmpdir(), 'elecxstock-test-'))
const events: { event: string; data: unknown }[] = []
const svc = new CoreService(dir, createStubProvider(), (event, data) => events.push({ event, data }), 'test')
afterAll(() => {
  svc.close()
  rmSync(dir, { recursive: true, force: true })
})

async function waitJob(id: number, ms = 60_000) {
  const t0 = Date.now()
  for (;;) {
    const j = (await svc.call('jobs.list', {})).find((x) => x.id === id)
    if (j && (j.status === 'done' || j.status === 'cancelled' || j.status === 'failed')) return j
    if (Date.now() - t0 > ms) throw new Error(`timeout ${JSON.stringify(j)}`)
    await new Promise((r) => setTimeout(r, 50))
  }
}

describe('Core（スタブのプロバイダで端から端まで）', () => {
  it('初回取得: ユニバース → 気配 → 日足 → 指標 → 月次系列', async () => {
    const id = await svc.call('jobs.start', { kind: 'initial' })
    const j = await waitJob(id)
    expect(j.status).toBe('done')
    expect(j.failed).toBe(0)
    const st = await svc.call('data.status', {})
    expect(st.instruments).toBeGreaterThan(25) // プライム・REIT・指数（グロース・その他は除く）
    expect(st.withBars).toBe(st.instruments)
    const all = await svc.call('instruments.all', {})
    expect(all.find((i) => i.code === '9282')).toBeUndefined() // インフラファンドは J-REIT にしない（取得対象外）
    expect(all.find((i) => i.code === '94345')?.kind).toBe('pref')
  }, 120_000)

  it('週足・月足（月次系列で長期を補う）と価格の調整', async () => {
    const w = await svc.call('bars.get', { id: 'JP:7203', tf: 'W' })
    expect(w.time.length).toBeGreaterThan(200)
    const m = await svc.call('bars.get', { id: 'JP:7203', tf: 'M' })
    expect(m.time[0]! < '2010-01-01').toBe(true) // 5 年より前は月次系列
    expect(m.monthlyUntil).toBeGreaterThan(0)
    const un = await svc.call('bars.get', { id: 'JP:7203', tf: 'D', adjustment: 'unadjusted' })
    const sp = await svc.call('bars.get', { id: 'JP:7203', tf: 'D' })
    const i = sp.time.findIndex((t) => t < '2021-09-29')
    if (i >= 0) expect(un.close[i]! / sp.close[i]!).toBeCloseTo(5)
  })

  it('スクリーニング: 既定の条件・無効な条件・欠損', async () => {
    const r = await svc.call('screener.run', {
      conditions: [
        { field: 'income.yield', op: '>=', value: 3.5 },
        { field: 'attr.market', op: 'in', value: ['P', 'R'] },
        { field: 'no.such', op: '>=', value: 1 },
      ],
      favorites: [],
      watchlists: {},
    })
    expect(r.ids.length).toBeGreaterThan(3)
    expect(r.invalid).toEqual([2])
    expect(r.rows.every((x) => (x.yieldTrailing ?? 0) >= 3.5)).toBe(true)
    const fav = await svc.call('screener.run', {
      conditions: [{ field: 'user.favorite', op: '=', value: true }],
      favorites: ['JP:8058'],
      watchlists: {},
    })
    expect(fav.ids).toEqual(['JP:8058'])
  })

  it('日々の更新は一括気配が中心で、すぐ終わる（FR-F9）', async () => {
    const id = await svc.call('jobs.start', { kind: 'daily' })
    const j = await waitJob(id)
    expect(j.status).toBe('done')
    expect(j.total).toBeLessThan(40) // 気配のバッチ + 照合 + 指標
  })

  it('保存期間の短縮は計画を示してから削除する（FR-D6）', async () => {
    const plan = await svc.call('jobs.planRetention', { years: 2 })
    expect(plan.rows).toBeGreaterThan(0)
    await svc.call('jobs.applyRetention', { years: 2 })
    const st = await svc.call('data.status', {})
    expect(st.retentionYears).toBe(2)
    expect(st.oldestBar! >= plan.deleteBefore!).toBe(true)
  })

  it('全データの削除と取り直しで、利用者のデータは残る（FR-S6）', async () => {
    const wl = (await svc.call('user.load', {})).watchlists
    wl[0]!.items = ['JP:8058']
    await svc.call('user.saveWatchlists', { watchlists: wl })
    const id = await svc.call('jobs.reset', { keepDelisted: true })
    await waitJob(id)
    const u = await svc.call('user.load', {})
    expect(u.watchlists[0]!.items).toEqual(['JP:8058'])
    expect((await svc.call('data.status', {})).withBars).toBeGreaterThan(20)
  }, 120_000)
})

describe('利用者のデータの保護（FR-S12）', () => {
  it('壊れたファイルは退避し、読み取り専用で起動する', () => {
    const d = mkdtempSync(join(tmpdir(), 'elecxstock-user-'))
    writeFileSync(join(d, 'watchlists.json'), '{ broken')
    const s = new UserStore(d)
    const w = s.load('watchlists')
    expect(s.readOnly).toBe(true)
    expect(w.some((x) => x.builtin === 'favorites')).toBe(true)
    expect(readdirSync(join(d, 'backups')).some((f) => f.startsWith('watchlists.broken'))).toBe(true)
    expect(() => s.save('watchlists', w)).toThrow()
    rmSync(d, { recursive: true, force: true })
  })
  it('一時ファイルに書いてから置き換え、世代を残す', () => {
    const d = mkdtempSync(join(tmpdir(), 'elecxstock-user-'))
    const s = new UserStore(d)
    const w = s.load('watchlists')
    for (let i = 0; i < 13; i++)
      s.save(
        'watchlists',
        w.map((x) => ({ ...x, items: [`JP:${1000 + i}`] })),
      )
    expect(existsSync(join(d, 'watchlists.json'))).toBe(true)
    expect(readdirSync(join(d, 'backups')).filter((f) => /^watchlists\.\d+\.json$/.test(f)).length).toBeLessThanOrEqual(10)
    rmSync(d, { recursive: true, force: true })
  })
})
