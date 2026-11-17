// チャートの描画の保存と窓の同期（FR-C13・C16・C17。docs/design-drawings.md §7）。値はすべて架空
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { dispatch } from '@core/dispatch'
import type { Drawing } from '@shared/drawings'
import { afterAll, describe, expect, it } from 'vitest'
import { makeCore } from '../../support/core'

const core = makeCore()
const { call } = core
afterAll(() => core.dispose())

const ID = 'JP:7203'
const line = (o: Partial<Drawing> = {}) =>
  ({
    id: 'line-1',
    kind: 'trend',
    a: { date: '2026-09-01', raw: 3000 },
    b: { date: '2026-11-02', raw: 3300 },
    extend: 'none',
    priceLabel: true,
    log: false,
    ...o,
  }) as Drawing

describe('描画の保存（FR-C13）', () => {
  it('足す・読む。作った時刻と更新の時刻は Core が付ける', async () => {
    const r = await call('drawings.create', { id: ID, drawing: line() })
    expect(r.ok).toBe(true)
    const all = await call('drawings.all', {})
    expect(all[ID]).toHaveLength(1)
    expect(all[ID]![0]!.created).toMatch(/^\d{4}-/)
    expect(all[ID]![0]!.updated).toBe(all[ID]![0]!.created)
  })
  it('同じ ID は足せない。2 点が同じ日付の線は足せない', async () => {
    await expect(call('drawings.create', { id: ID, drawing: line() })).rejects.toMatchObject({ code: 'invalid-params' })
    await expect(
      call('drawings.create', { id: ID, drawing: line({ id: 'same', b: { date: '2026-09-01', raw: 1 } }) }),
    ).rejects.toMatchObject({ code: 'invalid-params' })
  })
  it('点は日付の順にそろえて保存する', async () => {
    await call('drawings.create', {
      id: ID,
      drawing: line({ id: 'rev', a: { date: '2026-11-02', raw: 1 }, b: { date: '2026-10-01', raw: 2 } }),
    })
    const d = (await call('drawings.all', {}))[ID]!.find((x) => x.id === 'rev')!
    expect(d.a.date).toBe('2026-10-01')
    await call('drawings.remove', { id: ID, drawingId: 'rev', expected: d.updated })
  })
  it('直すときは、読んだときの更新の時刻が今と同じでなければ断り、今の値を返す（FR-C17）', async () => {
    const cur = (await call('drawings.all', {}))[ID]![0]!
    const ok = await call('drawings.update', { id: ID, drawing: { ...cur, extend: 'right' }, expected: cur.updated })
    expect(ok.ok).toBe(true)
    if (!ok.ok) return
    expect(ok.drawing.extend).toBe('right')
    expect(ok.drawing.updated > cur.updated || ok.drawing.updated !== cur.updated).toBe(true)
    // 古い時刻で直そうとすると断られる（ほかの窓で直された）
    const ng = await call('drawings.update', { id: ID, drawing: { ...cur, extend: 'both' }, expected: cur.updated })
    expect(ng).toEqual({ ok: false, current: ok.drawing })
  })
  it('消すときも確かめる。ほかの窓で消された図形を直そうとすると、無いと返す', async () => {
    const cur = (await call('drawings.all', {}))[ID]![0]!
    expect((await call('drawings.remove', { id: ID, drawingId: cur.id, expected: 'old' })).ok).toBe(false)
    expect((await call('drawings.remove', { id: ID, drawingId: cur.id, expected: cur.updated })).ok).toBe(true)
    expect(await call('drawings.update', { id: ID, drawing: cur, expected: cur.updated })).toEqual({ ok: false, current: null })
    expect((await call('drawings.all', {}))[ID] ?? []).toHaveLength(0)
  })
  it('すべて消すと消したものを返し、同じ ID で足し直せる（取り消し）', async () => {
    await call('drawings.create', { id: ID, drawing: line({ id: 'x1' }) })
    await call('drawings.create', { id: ID, drawing: line({ id: 'x2' }) })
    const removed = await call('drawings.clear', { id: ID })
    expect(removed.map((d) => d.id).sort()).toEqual(['x1', 'x2'])
    for (const d of removed) await call('drawings.create', { id: ID, drawing: d })
    const back = (await call('drawings.all', {}))[ID]!
    expect(back.map((d) => d.id).sort()).toEqual(['x1', 'x2'])
    expect(back.find((d) => d.id === 'x1')!.created).toBe(removed.find((d) => d.id === 'x1')!.created)
    await call('drawings.clear', { id: ID })
  })
  it('銘柄ごとの上限（100 本）', async () => {
    const id = 'JP:8058'
    for (let i = 0; i < 100; i++) await call('drawings.create', { id, drawing: line({ id: `m${i}` }) })
    await expect(call('drawings.create', { id, drawing: line({ id: 'over' }) })).rejects.toMatchObject({ code: 'invalid-params' })
    await call('drawings.clear', { id })
  })
})

describe('窓の同期（FR-C17）', () => {
  it('フリー 2〜4 でも書け、全窓に銘柄の ID 付きで知らせる', async () => {
    const r = await dispatch(core.svc, { prioritize: () => {} }, 'free2', {
      id: 1,
      method: 'drawings.create',
      params: { id: ID, drawing: line({ id: 'free' }) },
    })
    expect('result' in r.reply && (r.reply.result as { ok: boolean }).ok).toBe(true)
    expect(r.notice).toEqual({ event: 'user.changed', data: { kind: 'drawings', from: 'free2', id: ID } })
    const cur = (await call('drawings.all', {}))[ID]!.find((d) => d.id === 'free')!
    expect(
      (await core.callAs('free3', 'drawings.update', { id: ID, drawing: { ...cur, priceLabel: false }, expected: cur.updated })).ok,
    ).toBe(true)
    expect((await core.callAs('free4', 'drawings.clear', { id: ID })).length).toBe(1)
  })
})

describe('タイル用の換算（FR-C18）', () => {
  it('分割調整の表示の価格にした点を返す', async () => {
    await call('drawings.create', { id: ID, drawing: line({ id: 't1' }) })
    const r = await call('drawings.shown', { ids: [ID, 'JP:9999'] })
    expect(r[ID]).toHaveLength(1)
    expect(r[ID]![0]).toMatchObject({ id: 't1', extend: 'none', a: { date: '2026-09-01' }, b: { date: '2026-11-02' } })
    expect(r[ID]![0]!.a.price).toBeGreaterThan(0)
    expect(r['JP:9999']).toBeUndefined()
    await call('drawings.clear', { id: ID })
  })
})

describe('ファイル（FR-C13）', () => {
  it('知らない kind の図形は読み飛ばし、書き直してもファイルに残す', async () => {
    const c2 = makeCore()
    const p = join(c2.dir, 'user', 'drawings.json')
    writeFileSync(
      p,
      JSON.stringify({
        version: 1,
        data: { [ID]: [{ id: 'future', kind: 'fib', levels: [0.5] }, line({ id: 'ok', created: 'c', updated: 'u' } as Partial<Drawing>)] },
      }),
    )
    const all = await c2.call('drawings.all', {})
    expect(all[ID]!.map((d) => d.id)).toEqual(['ok'])
    await c2.call('drawings.create', { id: ID, drawing: line({ id: 'new' }) })
    const saved = JSON.parse(readFileSync(p, 'utf8')).data[ID] as { id: string }[]
    expect(saved.map((x) => x.id)).toEqual(['future', 'ok', 'new'])
    await c2.dispose()
  })
  it('書き出し・取り込みに入る', async () => {
    await call('drawings.create', { id: ID, drawing: line({ id: 'ex' }) })
    const json = await call('user.exportAll', {})
    expect(JSON.parse(json).drawings[ID][0].id).toBe('ex')
    await call('drawings.clear', { id: ID })
    await call('user.importAll', { json })
    expect((await call('drawings.all', {}))[ID]!.map((d) => d.id)).toEqual(['ex'])
    // 取り込みを元に戻すと、取り込む前（空）に戻る
    await call('user.undoImport', {})
    expect((await call('drawings.all', {}))[ID] ?? []).toHaveLength(0)
  })
})

describe('作った時刻（レビューの指摘）', () => {
  it('created が空なら Core の時刻を付ける', async () => {
    const r = await call('drawings.create', { id: 'JP:8058', drawing: { ...line({ id: 'empty' }), created: '', updated: '' } })
    expect(r.ok && r.drawing.created).toMatch(/^\d{4}-/)
    await call('drawings.clear', { id: 'JP:8058' })
  })
})
