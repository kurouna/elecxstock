// renderer からの要求の処理（§8.1, FR-W, NFR-A1）: 窓ごとの制限・zod の検証・利用者のデータの変更の通知。worker と同じ dispatch を通す
import { CHANGES, FREE_WRITES } from '@core/changes'
import { dispatch } from '@core/dispatch'
import { PARAMS } from '@shared/api'
import { afterAll, describe, expect, it } from 'vitest'
import { makeCore } from '../../support/core'

const core = makeCore()
afterAll(() => core.dispose())
let seq = 0
const shown: Record<string, string[]> = {}
const call = (slot: string, method: string, params: unknown) =>
  dispatch(core.svc, { prioritize: (s, ids) => (shown[s] = ids) }, slot, { id: ++seq, method, params })

describe('要求の検証（NFR-A3, FR-N5）', () => {
  it('知らないメソッド・形の違う引数はエラーで返し、Core を呼ばない', async () => {
    expect((await call('main', 'nope.nope', {})).reply).toMatchObject({ error: { code: 'unknown-method' } })
    expect((await call('main', 'metrics.get', { ids: 'JP:7203' })).reply).toMatchObject({ error: { code: 'invalid-params' } })
    expect((await call('main', 'metrics.get', { ids: ['JP:7203'] })).reply).toMatchObject({ result: [{ id: 'JP:7203' }] })
  })
  it('表示中の銘柄は窓ごとに受け、長すぎる ID と 200 件を超える分は捨てる（FR-F8）', async () => {
    await call('free2', 'jobs.prioritize', ['JP:7203', 'x'.repeat(30), ...Array.from({ length: 300 }, (_, i) => `JP:${i}`)])
    expect(shown.free2?.[0]).toBe('JP:7203')
    expect(shown.free2?.length).toBe(200)
  })
})

describe('フリー N は読むだけ（FR-W）', () => {
  it('アラートは新しく作ることだけでき、直す・消す・止めるは 1 枚目だけ', async () => {
    const alert = {
      id: '',
      target: { kind: 'symbol', id: 'JP:7203' },
      conditions: [{ field: 'price.close', op: '<=', value: 1 }],
      repeat: true,
      enabled: true,
    }
    const made = await call('free2', 'alerts.save', { alert })
    expect(made.reply).toHaveProperty('result')
    const id = (made.reply as { result: { id: string } }).result.id
    for (const [m, p] of [
      ['alerts.save', { alert: { ...alert, id } }],
      ['alerts.remove', { id }],
      ['alerts.setEnabled', { id, enabled: false }],
    ] as const)
      expect((await call('free2', m, p)).reply, m).toMatchObject({ error: { code: 'invalid-params', message: 'main window only' } })
    expect((await call('main', 'alerts.remove', { id })).reply).toHaveProperty('result')
  })
  it('利用者のデータを書くメソッドは、許可したもの（FREE_WRITES）のほかは 1 枚目だけ。全データの削除・銘柄一覧の取り込みも', async () => {
    // 引数は検証で落ちる形（{}）で送る: 窓の制限が先に効くなら「main window only」、効かなければ zod のエラーになる（Core は呼ばれない）
    for (const m of Object.keys(CHANGES).filter((x) => !FREE_WRITES.has(x)))
      expect((await call('free2', m, { __: 1 })).reply, m).toMatchObject({ error: { code: 'invalid-params', message: 'main window only' } })
    for (const m of ['user.saveLayout', 'user.saveLayouts', 'alerts.markRead', 'jobs.reset', 'data.importJpx'])
      expect((await call('free3', m, { __: 1 })).reply, m).toMatchObject({ error: { code: 'invalid-params', message: 'main window only' } })
    // 1 枚目は同じ要求を検証まで通す
    expect((await call('main', 'user.saveWatchlists', { __: 1 })).reply).toMatchObject({ error: { code: 'invalid-params' } })
    expect((await call('main', 'user.saveWatchlists', { __: 1 })).reply).not.toMatchObject({ error: { message: 'main window only' } })
  })
  it('フリー N が使う書き込み（★・◆・移動平均の期間などの設定・一覧に無い銘柄へのジャンプ・描画）は通る', async () => {
    const u = await core.call('user.load', {})
    expect((await call('free2', 'user.saveSettings', { settings: u.settings })).reply).toHaveProperty('result')
    expect((await call('free2', 'watchlists.toggleItem', { list: 'favorites', id: 'JP:8306' })).reply).toHaveProperty('result')
    expect((await call('free2', 'watchlists.toggleItem', { list: 'favorites', id: 'JP:8306' })).reply).toHaveProperty('result')
    expect((await call('free2', 'instruments.addUser', { code: '7203' })).reply).toHaveProperty('result')
    // 読むメソッドは窓を問わない
    for (const [m, p] of [
      ['user.load', {}],
      ['metrics.get', { ids: ['JP:7203'] }],
      ['bars.get', { id: 'JP:7203', tf: 'D' }],
      ['portfolio.list', {}],
      ['jobs.list', {}],
    ] as const)
      expect((await call('free4', m, p)).reply, m).toHaveProperty('result')
  })
  it('窓の配置は自分の分だけ書ける。配置の無い要求は検証で弾く', async () => {
    const entry = { root: { kind: 'pane', id: 'p1', widget: 'chart', state: {} } }
    expect((await call('free2', 'user.saveWindowLayout', { slot: 'free3', entry })).reply).toMatchObject({ error: { message: 'slot' } })
    expect((await call('free2', 'user.saveWindowLayout', { slot: 'free2', entry })).reply).toHaveProperty('result')
    const saved = (await core.call('user.load', {})).layout as { windows?: Record<string, unknown> } | null
    expect(saved?.windows?.free2).toEqual(entry)
    // 配置が無い・形が違う（1 枚目の保存と取り違えた layout キーなど）は、Core を呼ぶ前に弾く
    expect((await call('free2', 'user.saveWindowLayout', { slot: 'free2', layout: entry })).reply).toMatchObject({
      error: { code: 'invalid-params' },
    })
    expect((await call('free2', 'user.saveWindowLayout', { slot: 'free2', entry: 'x' })).reply).toMatchObject({
      error: { code: 'invalid-params' },
    })
    // 弾くのは窓口の検証（zod）。Core の中の確かめに頼らない
    const schema = PARAMS['user.saveWindowLayout']
    expect(schema.safeParse({ slot: 'free2' }).success).toBe(false)
    expect(schema.safeParse({ slot: 'free2', entry: 'x' }).success).toBe(false)
    expect(schema.safeParse({ slot: 'free2', entry }).success).toBe(true)
  })
})

describe('利用者のデータの変更をほかの窓に知らせる（FR-W）', () => {
  it('★の切り替えは、どの窓から何を変えたかを添えて知らせる。読むだけのメソッドは知らせない', async () => {
    const u = await core.call('user.load', {})
    const fav = u.watchlists.find((w) => w.builtin === 'favorites')!
    const r = await call('free2', 'watchlists.toggleItem', { list: fav.id, id: 'JP:8058' })
    expect(r.notice).toEqual({ event: 'user.changed', data: { kind: 'watchlists', from: 'free2', op: { list: fav.id, id: 'JP:8058' } } })
    expect((await call('main', 'user.load', {})).notice).toBeUndefined()
  })
  it('失敗した書き込みは知らせない', async () => {
    expect((await call('main', 'user.saveScreens', { screens: 'x' })).notice).toBeUndefined()
  })
})
