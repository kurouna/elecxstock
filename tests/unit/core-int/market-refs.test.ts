// マーケット一覧の行の取り込みと取得（FR-U6, FR-MB3。L3）。値はスタブの架空の値
import { createStubProvider } from '@core/providers/stub'
import type { Provider } from '@core/providers/types'
import { isExternal, MARKET_REFS, REF_ETF_IDS, REF_INDEX_ROWS } from '@shared/markets'
import { afterAll, describe, expect, it } from 'vitest'
import { makeCore, runJob } from '../../support/core'

const stub = createStubProvider()
/** 日足の呼び出し（記号 → from） */
const hist: { symbol: string; from: string }[] = []
const provider: Provider = {
  ...stub,
  fetchHistory(symbol, o) {
    if (o.interval === '1d') hist.push({ symbol, from: o.from })
    return stub.fetchHistory(symbol, o)
  },
}
const core = makeCore({ provider })
const { call } = core
afterAll(() => core.dispose())
const EXT = REF_INDEX_ROWS.filter((r) => isExternal(r.id))

describe('参照の行の取り込み（FR-U6, FR-MB3）', () => {
  it('起動で参照の行が銘柄の表に入り、開き直しても増えない', async () => {
    const all = await call('instruments.all', {})
    for (const r of REF_INDEX_ROWS) {
      const i = all.find((x) => x.id === r.id)
      expect(i?.market).toBe('I')
      expect(i?.kind).toBe('index')
    }
    // 次の起動と同じ（もう一度入れる）
    core.svc.repo.ensureRefs(new Date().toISOString())
    const n = (await call('instruments.all', {})).filter((x) => x.id.startsWith('IDX:')).length
    expect(n).toBe(REF_INDEX_ROWS.length)
  })
  it('種の初回取得で、参照の行と連動 ETF の日足・指標がある', async () => {
    const ms = await call('metrics.get', { ids: MARKET_REFS.map((r) => r.id) })
    for (const r of MARKET_REFS) expect(ms.find((m) => m.id === r.id)?.close, r.id).not.toBeNull()
  })
  it('連動 ETF は取得の対象だが、利用者の追加にはしない', async () => {
    const all = await call('instruments.all', {})
    for (const id of REF_ETF_IDS) expect(all.find((x) => x.id === id)?.userAdded).toBe(false)
  })
})

describe('海外の行の日々の更新（FR-MB3）', () => {
  it('毎回、最後の足の 10 日前から取り直す（東証の営業日で判断しない）', async () => {
    hist.length = 0
    await runJob(core, 'daily')
    for (const r of EXT) {
      const h = hist.find((x) => x.symbol === r.yahoo)
      expect(h, r.yahoo).toBeTruthy()
    }
    // 全期間の取り直しにはならない（取引の途中だった足の食い違いで、分割を疑わない）
    const ms = await call('metrics.get', { ids: EXT.map((r) => r.id) })
    for (const r of EXT) {
      const h = hist.filter((x) => x.symbol === r.yahoo)
      expect(h.length, r.yahoo).toBe(1)
      expect(h[0]!.from > '2026-10-01').toBe(true)
      expect(ms.find((m) => m.id === r.id)?.stale, r.id).toBe(false)
    }
  })
})

describe('参照の行はスクリーナーに出ない・連動 ETF は出る（FR-U6）', () => {
  it('市場を選ばない条件では海外の行が出ず、ETF を選ぶと連動 ETF が出る', async () => {
    const all = await call('screener.run', { conditions: [], favorites: [], watchlists: {} })
    expect(all.ids.some((id) => id.startsWith('IDX:'))).toBe(false)
    const etf = await call('screener.run', {
      conditions: [{ field: 'attr.market', op: 'in', value: ['E'] }],
      favorites: [],
      watchlists: {},
    })
    for (const id of REF_ETF_IDS) expect(etf.ids).toContain(id)
  })
})

describe('連動 ETF の月次系列の取り直し（FR-D7, FR-MB3）', () => {
  it('連動 ETF（東証の ETF。プライム・REIT ではない）の月次系列が無ければ、日々の更新が拾う', () => {
    for (const id of REF_ETF_IDS) core.svc.repo.needMonthly(id)
    const missing = core.svc.repo.missingMonthly()
    for (const id of REF_ETF_IDS) expect(missing, id).toContain(id)
    // 指数（月次系列を使わない）は含めない
    for (const r of REF_INDEX_ROWS) expect(missing).not.toContain(r.id)
  })
})
