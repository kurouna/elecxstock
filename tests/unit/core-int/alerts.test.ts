import type { Alert } from '@shared/types'
import { afterAll, describe, expect, it } from 'vitest'
import { makeCore } from '../../support/core'

const core = makeCore()
const { svc, call, idle } = core
const { events } = core
afterAll(() => core.dispose())

const draft = (o: Partial<Alert> = {}) => ({
  id: '',
  target: { kind: 'symbol' as const, id: 'JP:7203' },
  conditions: [{ field: 'price.close', op: '<=' as const, value: 1_000_000 }],
  repeat: true,
  enabled: true,
  ...o,
})

describe('アラートを Core に通して', () => {
  it('作った直後は成り立っていても鳴らず「成立中」。外れてから成り立つと 1 回鳴る', async () => {
    const v = await call('alerts.save', { alert: draft() })
    expect(v.id).toMatch(/^al-/)
    expect(v.state.met).toBe(true)
    expect(events.filter((e) => e.event === 'alerts.fired')).toHaveLength(0)
    // 前の判定で「成り立たない」だったことにして、ジョブの終わりの判定を走らせる
    svc.alertBook.setStates({ [v.id]: { met: false, asOf: '2000-01-04' } })
    const fires = svc.evaluateAlerts()
    expect(fires).toHaveLength(1)
    expect(fires[0]).toMatchObject({ alertId: v.id, instrument: 'JP:7203', read: false })
    const ev = events.filter((e) => e.event === 'alerts.fired').at(-1)?.data as { unread: number }
    expect(ev.unread).toBe(1)
    // 同じ基準日では鳴り直さない
    expect(svc.evaluateAlerts()).toHaveLength(0)
    expect(await call('alerts.unread', {})).toBe(1)
    expect(await call('alerts.markRead', {})).toBe(0)
  })

  it('1 回だけのアラートは鳴ったら止まる', async () => {
    const v = await call('alerts.save', { alert: draft({ repeat: false }) })
    svc.alertBook.setStates({ ...svc.alertBook.states(), [v.id]: { met: false, asOf: '2000-01-04' } })
    expect(svc.evaluateAlerts().some((f) => f.alertId === v.id)).toBe(true)
    const list = await call('alerts.list', {})
    expect(list.find((x) => x.id === v.id)?.enabled).toBe(false)
  })

  it('取得のジョブが終わると判定する（基準日が入る）', async () => {
    const v = await call('alerts.save', { alert: draft({ conditions: [{ field: 'income.yield', op: '>=', value: 99 }] }) })
    svc.alertBook.setStates({ ...svc.alertBook.states(), [v.id]: { met: false } })
    await call('jobs.start', { kind: 'daily' })
    await idle()
    const s = svc.alertBook.states()[v.id]
    expect(s?.met).toBe(false)
    expect(s?.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('使えない条件は保存できない', async () => {
    await expect(
      call('alerts.save', { alert: draft({ conditions: [{ field: 'attr.market', op: 'in', value: ['R'] }] }) }),
    ).rejects.toBeTruthy()
  })

  it('プライム・J-REIT 以外の銘柄に付けたアラートは、その銘柄を取得の対象にする', async () => {
    expect(svc.trackedCodes()).not.toContain('130A')
    await call('alerts.save', { alert: draft({ target: { kind: 'symbol', id: 'JP:130A' } }) })
    expect(svc.trackedCodes()).toContain('130A')
  })

  it('消して、id と状態を保ったまま戻せる（Ctrl+Z）', async () => {
    const v = await call('alerts.save', { alert: draft({ note: '消して戻す' }) })
    const removed = await call('alerts.remove', { id: v.id })
    expect(removed?.alert.id).toBe(v.id)
    expect((await call('alerts.list', {})).some((x) => x.id === v.id)).toBe(false)
    const back = await call('alerts.restore', { alert: removed!.alert, state: removed!.state })
    expect(back.id).toBe(v.id)
    expect(back.state.met).toBe(removed!.state.met)
  })

  it('書き出しと取り込みの対象になる。取り込むと判定の基準を取り直す', async () => {
    const json = await call('user.exportAll', {})
    const o = JSON.parse(json)
    expect(o.alerts.length).toBeGreaterThan(0)
    await call('user.importAll', { json })
    // 取り込んだら、鳴らさずに今の値で基準を取り直す（次の更新で鳴る準備ができている）
    const states = svc.alertBook.states()
    const enabled = (await call('alerts.list', {})).filter((a) => a.enabled)
    expect(enabled.length).toBeGreaterThan(0)
    for (const a of enabled) expect(states[a.id]?.met ?? states[a.id]?.invalid).not.toBeUndefined()
    await call('user.undoImport', {})
    for (const a of enabled) expect(svc.alertBook.states()[a.id]).toBeDefined()
  })

  it('保有を変えたら、保有の条件のアラートは鳴らさずに基準を取り直す', async () => {
    await call('portfolio.save', { holdings: [{ code: '7203', account: 'tokutei', quantity: 100, avgCost: 1_000_000 }] })
    const v = await call('alerts.save', { alert: draft({ conditions: [{ field: 'holding.pnlPct', op: '<=', value: -10 }] }) })
    expect(v.state.met).toBe(true)
    svc.alertBook.setStates({ ...svc.alertBook.states(), [v.id]: { met: false, asOf: '2000-01-04' } })
    const before = events.filter((e) => e.event === 'alerts.fired').length
    await call('portfolio.save', { holdings: [{ code: '7203', account: 'tokutei', quantity: 200, avgCost: 1_000_000 }] })
    expect(events.filter((e) => e.event === 'alerts.fired').length).toBe(before)
    expect(svc.alertBook.states()[v.id]?.met).toBe(true)
  })
})

describe('スクリーンのアラートを Core に通して（FR-AL2）', () => {
  const screenDraft = (screenId: string) => ({
    id: '',
    target: { kind: 'screen' as const, screenId },
    conditions: [],
    repeat: true,
    enabled: true,
  })
  it('作った直後は結果を覚えるだけ。新しく入った銘柄を 1 つの記録で知らせる', async () => {
    const { screens } = await call('user.load', {})
    const s = screens[0]!
    const v = await call('alerts.save', { alert: screenDraft(s.id) })
    const members = svc.alertBook.states()[v.id]?.members ?? []
    expect(members.length).toBeGreaterThan(1)
    expect(v.now).toBe(members.length)
    // 前の結果から 2 銘柄を外しておく → 次の判定でその 2 銘柄が「新しく入った」
    svc.alertBook.setStates({ ...svc.alertBook.states(), [v.id]: { met: true, asOf: '2000-01-04', members: members.slice(2) } })
    const fires = svc.evaluateAlerts().filter((f) => f.alertId === v.id)
    expect(fires).toHaveLength(1)
    expect(fires[0]).toMatchObject({ screenId: s.id, members: members.slice(0, 2), more: 0, instrument: members[0] })
  })
  it('スクリーンの条件を変えたら鳴らさずに基準を取り直す。名前だけの変更では取り直さない', async () => {
    const { screens } = await call('user.load', {})
    const v = (await call('alerts.list', {})).find((a) => a.target.kind === 'screen')!
    const sid = v.target.kind === 'screen' ? v.target.screenId : ''
    const stale = { met: true, asOf: '2000-01-04', members: [] }
    svc.alertBook.setStates({ ...svc.alertBook.states(), [v.id]: stale })
    await call('user.saveScreens', { screens: screens.map((x) => (x.id === sid ? { ...x, name: { ja: '改名', en: 'Renamed' } } : x)) })
    expect(svc.alertBook.states()[v.id]).toEqual(stale)
    const changed = screens.map((x) => (x.id === sid ? { ...x, conditions: [...x.conditions] } : x))
    const target = changed.find((x) => x.id === sid)!
    target.conditions = target.conditions.map((c, i) => (i === 0 && typeof c.value === 'number' ? { ...c, value: c.value - 0.5 } : c))
    await call('user.saveScreens', { screens: changed })
    expect(svc.alertBook.states()[v.id]?.members?.length).toBeGreaterThan(1)
    expect(svc.evaluateAlerts().some((f) => f.alertId === v.id)).toBe(false)
    await call('user.saveScreens', { screens })
  })
  it('スクリーンが無ければ判定できない。条件付き・存在しないスクリーンは保存できない', async () => {
    const { screens } = await call('user.load', {})
    await expect(call('alerts.save', { alert: screenDraft('no-such-screen') })).rejects.toBeTruthy()
    await expect(
      call('alerts.save', { alert: { ...screenDraft(screens[0]!.id), conditions: [{ field: 'price.close', op: '<=', value: 1 }] } }),
    ).rejects.toBeTruthy()
    const v = (await call('alerts.list', {})).find((a) => a.target.kind === 'screen')!
    await call('user.saveScreens', { screens: screens.filter((x) => v.target.kind === 'screen' && x.id !== v.target.screenId) })
    svc.evaluateAlerts()
    expect(svc.alertBook.states()[v.id]?.invalid).toBe('noScreen')
    await call('user.saveScreens', { screens })
  })
  it('銘柄のアラートは条件が無いと保存できない', async () => {
    await expect(call('alerts.save', { alert: { ...draft(), conditions: [] } })).rejects.toBeTruthy()
  })
})
