// 日足の取り直しの幅（FR-D1）: 最終取得日 − 10 暦日から取り直して upsert する（遡及訂正への追従）。
// スタブを包んで、日足を求めた銘柄と開始日を記録する（値はすべて架空）
import { createStubProvider } from '@core/providers/stub'
import type { Provider } from '@core/providers/types'
import { addDays } from '@shared/calendar'
import { afterAll, describe, expect, it } from 'vitest'
import { makeCore, runJob } from '../../support/core'

const stub = createStubProvider()
/** 日足（1d）を求めた記録 */
const asked: { symbol: string; from: string }[] = []
const provider: Provider = {
  ...stub,
  async fetchHistory(symbol, opt) {
    if (opt.interval === '1d') asked.push({ symbol, from: opt.from })
    return stub.fetchHistory(symbol, opt)
  },
}
const core = makeCore({ provider })
const { call } = core
const db = core.svc.repo.db
afterAll(() => core.dispose())

const ID = 'JP:8058'
/** 2 営業日以上取りこぼした状態にする: この日から後の日足を消す */
const CUT = '2026-11-05'

describe('日足の取り直しの幅（FR-D1）', () => {
  it('取りこぼした銘柄は「最終取得日 − 10 暦日」から取り直し、重なる区間は上書き・それより前は触らない', async () => {
    const before = await call('bars.get', { id: ID, tf: 'D' })
    db.run('DELETE FROM daily_bars WHERE id = ? AND d >= ?', ID, CUT)
    const last = db.get<{ d: string }>('SELECT MAX(d) d FROM daily_bars WHERE id = ?', ID)!.d
    const from = addDays(last, -10)
    // 重なる区間（from 以降）の最終日と、区間より前の日の終値を少しだけ変える（0.5% 未満: 分割の疑いにしない）
    const old = db.get<{ d: string }>('SELECT MAX(d) d FROM daily_bars WHERE id = ? AND d < ?', ID, addDays(from, -5))!.d
    db.run('UPDATE daily_bars SET c = c * 1.002 WHERE id = ? AND d IN (?, ?)', ID, last, old)
    const tampered = db.get<{ c: number }>('SELECT c FROM daily_bars WHERE id = ? AND d = ?', ID, old)!.c
    const fetchedBefore = db.get<{ last_daily: string }>('SELECT last_daily FROM fetch_state WHERE id = ?', ID)!.last_daily
    asked.length = 0

    await runJob(core, 'daily')

    // 求めた開始日は「最終取得日 − 10 暦日」（全期間ではない）
    const mine = asked.filter((a) => a.symbol === '8058.T')
    expect(mine.length).toBeGreaterThan(0)
    expect(mine[0]!.from).toBe(from)
    const after = await call('bars.get', { id: ID, tf: 'D' })
    // 消した日足が戻り、重なる区間の値はプロバイダの値に上書きされた（遡及訂正への追従）
    expect(after.time).toEqual(before.time)
    const at = (d: string) => after.close[after.time.indexOf(d)]
    expect(at(last)).toBeCloseTo(before.close[before.time.indexOf(last)]!, 6)
    // 区間より前は取り直していない（変えた値のまま）
    expect(at(old)).toBeCloseTo(tampered, 6)
    // 銘柄ごとの最終取得日が進む
    const fetchedAfter = db.get<{ last_daily: string }>('SELECT last_daily FROM fetch_state WHERE id = ?', ID)!.last_daily
    expect(fetchedAfter > fetchedBefore).toBe(true)
  })
})
