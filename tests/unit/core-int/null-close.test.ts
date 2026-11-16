// 終値の無い足（FR-D8）: 大引け後しばらく、Yahoo の最新の日足は終値が空で返る。Yahoo のプロバイダ（yahoo.ts）を Core に通し、
// yahoo-finance2 の chart だけを差し替えて、スタブの架空の系列に「当日の終値が空の足」を足して返す（ネットワークは使わない）
import { createStubProvider } from '@core/providers/stub'
import type { Provider } from '@core/providers/types'
import { createYahooProvider } from '@core/providers/yahoo'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { makeCore, runJob } from '../../support/core'

const h = vi.hoisted(() => ({
  chart: null as null | ((symbol: string, q: { period1: string; interval: '1d' | '1mo' }) => Promise<unknown>),
}))
vi.mock('yahoo-finance2', () => ({
  default: class {
    chart(symbol: string, q: { period1: string; interval: '1d' | '1mo' }) {
      return h.chart!(symbol, q)
    }
  },
}))

/** 基準日時（TEST_NOW）の日。金曜の大引けのあと */
const TODAY = '2026-11-13'
const stub = createStubProvider()
const at = (d: string) => new Date(`${d}T00:00:00Z`) // 日本時間の 9:00
h.chart = async (symbol, q) => {
  const r = await stub.fetchHistory(symbol, { from: q.period1, interval: q.interval, signal: new AbortController().signal })
  return {
    // 当日の足は終値（と高安）が空で返る
    quotes: r.bars.map((b) => ({
      date: at(b.d),
      open: b.o,
      high: b.d === TODAY ? null : b.h,
      low: b.d === TODAY ? null : b.l,
      close: b.d === TODAY ? null : b.c,
      volume: b.v,
    })),
    events: {
      dividends: r.dividends.map((d) => ({ date: at(d.date), amount: d.amount })),
      splits: r.splits.map((s) => ({ date: at(s.date), numerator: s.ratio, denominator: 1 })),
    },
  }
}
const yahoo = createYahooProvider()
// 気配・銘柄一覧はスタブのまま、日足だけ Yahoo のプロバイダを通す
const provider: Provider = { ...stub, fetchHistory: (symbol, opt) => yahoo.fetchHistory(symbol, opt) }
const core = makeCore({ provider })
const { call } = core
afterAll(() => core.dispose())

/** 8058 は定期照合の当番でない銘柄、8053 は基準日時の定期照合（FR-F9 c。1/20 ずつ）の当番の銘柄 */
const IDS = ['JP:8058', 'JP:8053']

describe('終値の無い足と仮の足（FR-D8）', () => {
  it('終値の無い足は保存しない（取り直しても当日の足は入らず、終値はすべて数）', async () => {
    await call('jobs.refetch', { ids: IDS })
    await core.idle()
    for (const id of IDS) {
      const b = await call('bars.get', { id, tf: 'D' })
      expect(b.time.at(-1)).toBe('2026-11-12')
      expect(b.close.every((c) => Number.isFinite(c))).toBe(true)
      const n = core.svc.repo.db.get<{ n: number }>('SELECT COUNT(*) n FROM daily_bars WHERE id = ? AND (c IS NULL OR d >= ?)', id, TODAY)!
      expect(n.n).toBe(0)
    }
  })
  it('日々の更新で、大引け後の気配から当日の仮の足を補う', async () => {
    await runJob(core, 'daily')
    const b = await call('bars.get', { id: 'JP:8058', tf: 'D' })
    const q = (await call('quotes.get', { ids: ['JP:8058'] }))[0]!
    expect(b.time.at(-1)).toBe(TODAY)
    expect(b.provisional).toEqual([b.time.length - 1])
    expect(b.close.at(-1)).toBe(q.price)
  })
  // 回帰（2026-11-17）: 同じ日々の更新の中で、気配で仮の足を作ったあとに日足の取得（定期照合・取りこぼしの取り直し）が走ると、
  // replaceDaily が開始日以降を消してから入れ直していたので、終値の無い当日の足と一緒に仮の足も消えていた
  it('同じ更新で日足を取り直した銘柄（定期照合の当番）でも、気配で補った当日の仮の足が残る', async () => {
    const b = await call('bars.get', { id: 'JP:8053', tf: 'D' })
    expect(b.time.at(-1)).toBe(TODAY)
    expect(b.provisional).toEqual([b.time.length - 1])
  })
})
