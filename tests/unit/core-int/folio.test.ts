// ポートフォリオを Core に通して（FR-PF2・PF7・PF8）: 保有を書くたび・ジョブの終わりに記録する・書き出しと日付で混ぜる取り込み・
// 全データの削除で消えない・消すのは 1 枚目だけ・読み取り専用では書かない
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { lastClosedSession } from '@shared/calendar'
import type { Holding } from '@shared/types'
import { afterAll, describe, expect, it } from 'vitest'
import { makeCore } from '../../support/core'

const core = makeCore()
const { svc, call, callAs, idle, dir } = core
afterAll(() => core.dispose())

const holdings: Holding[] = [
  { code: '7203', account: 'tokutei', quantity: 100, avgCost: 2000 },
  { code: '8951', account: 'nisa_growth', quantity: 2, avgCost: 90000 },
]
const today = lastClosedSession()

describe('ポートフォリオの記録（FR-PF2）', () => {
  it('保有を保存すると、取引の終わった最新の日を記録する（明細つき）。系列には明細を含めない', async () => {
    await call('portfolio.save', { holdings })
    const s = await call('folio.series', {})
    expect(s.first).toBe(today)
    expect(s.readOnly).toBe(false)
    const p = s.points.at(-1)!
    expect(p).toMatchObject({ d: today, src: 'rec' })
    expect(p.value).toBeGreaterThan(0)
    expect(p.cost).toBe(100 * 2000 + 2 * 90000)
    expect(p).not.toHaveProperty('pos')
    expect(
      svc.folio
        .load()
        .at(-1)!
        .pos.map((x) => x.code)
        .sort(),
    ).toEqual(['7203', '8951'])
    expect(existsSync(join(dir, 'user', 'portfolioHistory.json'))).toBe(true)
  })
  it('保有を変えるとその日を書き直す（1 日 1 件）', async () => {
    await call('portfolio.save', { holdings: [...holdings, { code: '9432', account: 'tokutei', quantity: 1000, avgCost: 150 }] })
    const pts = svc.folio.load()
    expect(pts.filter((p) => p.d === today)).toHaveLength(1)
    expect(pts.at(-1)!.pos).toHaveLength(3)
    await call('portfolio.save', { holdings })
  })
  it('日々の更新が終わると記録する（失敗しても取得は止めない）', async () => {
    const before = svc.folio.load().at(-1)!.at
    await new Promise((r) => setTimeout(r, 5))
    // 確定の点は保有が同じなら書き直さないので、暫定にしてから更新を走らせる
    svc.folio.save(svc.folio.load().map((p) => ({ ...p, final: false })))
    await call('jobs.start', { kind: 'daily' })
    await idle()
    const p = svc.folio.load().at(-1)!
    expect(p.at).toBeGreaterThan(before)
  })
  it('記録の前の試算（E）は est の点を前に付ける。ある日の値・期間の寄与・配当の材料を返す', async () => {
    const s = await call('folio.series', { est: true })
    expect(s.points.some((p) => p.src === 'est')).toBe(true)
    expect(s.points.filter((p) => p.src === 'est').every((p) => p.d < today)).toBe(true)
    const at = await call('folio.at', { d: today })
    expect(at?.pos.map((x) => x.code).sort()).toEqual(['7203', '8951'])
    expect(at?.close['7203']).toBeGreaterThan(0)
    const c = await call('folio.contrib', { period: 'year' })
    expect(c.rows.map((r) => r.code).sort()).toEqual(['7203', '8951'])
    const d = await call('folio.dividends', {})
    expect(d.rows.find((r) => r.code === '7203')!.dps).toHaveLength(5)
    expect(d.yearAgoDate).toBeNull()
  })
  it('保有の JSON に記録を入れて書き出し、取り込むと日付で混ぜる（今の記録は消えない）', async () => {
    const json = await call('portfolio.export', {})
    const o = JSON.parse(json) as { history: { d: string }[] }
    expect(o.history.map((p) => p.d)).toContain(today)
    // 別の PC の記録（架空）: 前の日の点を足す
    const old = { ...(o.history.at(-1) as object), d: '2026-10-01', at: 1 }
    const p = await call('portfolio.previewImport', { json: JSON.stringify({ ...o, history: [old] }) })
    expect(p.history).toHaveLength(1)
    await call('portfolio.applyImport', { holdings: p.holdings, mode: 'replace', meta: p.meta, history: p.history })
    const ds = svc.folio.load().map((x) => x.d)
    expect(ds).toContain('2026-10-01')
    expect(ds).toContain(today)
    // 読めない記録は取り込まないが、保有の取り込みは止めない
    const bad = await call('portfolio.previewImport', { json: JSON.stringify({ ...o, history: [{ d: 'x' }] }) })
    expect(bad.history).toBeUndefined()
    expect(bad.holdings).toHaveLength(2)
  })
  it('保有の取り込みを元に戻すと、混ぜた記録も戻る（レビューで見つけた不具合）', async () => {
    const before = svc.folio.load().map((p) => p.d)
    const o = JSON.parse(await call('portfolio.export', {})) as { history: object[] }
    const p = await call('portfolio.previewImport', {
      json: JSON.stringify({ ...o, history: [{ ...(o.history.at(-1) as object), d: '2026-09-01', at: 2 }] }),
    })
    await call('portfolio.applyImport', { holdings: p.holdings, mode: 'replace', meta: p.meta, history: p.history })
    expect(svc.folio.load().map((x) => x.d)).toContain('2026-09-01')
    await call('portfolio.undoImport', {})
    expect(svc.folio.load().map((x) => x.d)).toEqual(before)
  })
  it('全データの削除（市場データ）では消えない', async () => {
    const n = svc.folio.load().length
    await call('jobs.reset', { keepDelisted: false })
    await idle()
    expect(svc.folio.load().length).toBeGreaterThanOrEqual(n)
  })
  it('記録を消すのは 1 枚目だけ。消したら空になる', async () => {
    await expect(callAs('free2', 'folio.clear', {})).rejects.toMatchObject({ code: 'invalid-params' })
    expect(await call('folio.clear', {})).toBe(true)
    expect((await call('folio.series', {})).points).toEqual([])
  })
  it('読み取り専用のときは書かず、系列にそう出す。消すこともできない', async () => {
    svc.user.readOnly = true
    try {
      await svc.call('portfolio.list', {})
      svc.recordFolio()
      expect(svc.folio.load()).toEqual([])
      expect((await call('folio.series', {})).readOnly).toBe(true)
      await expect(call('folio.clear', {})).rejects.toMatchObject({ code: 'read-only' })
    } finally {
      svc.user.readOnly = false
    }
  })
})
