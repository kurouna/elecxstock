// 契約テスト（NFR-CI3）: 実際の Yahoo・JPX に数銘柄だけ問い合わせ、応答の形が変わっていないかを確かめる。
// 既定では動かさない（LIVE=1 のときだけ）。CI では毎晩実行する。
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createYahooProvider } from '@core/providers/yahoo'
import { CoreService } from '@core/service'
import { afterAll, describe, expect, it } from 'vitest'

const live = process.env.LIVE === '1'
const dir = mkdtempSync(join(tmpdir(), 'elecxstock-live-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe.skipIf(!live)('実際のプロバイダとの契約', () => {
  const p = createYahooProvider()
  const signal = new AbortController().signal

  it('JPX の上場銘柄一覧を読める（プライム 1,000 社以上・J-REIT 40 以上）', async () => {
    const rows = await p.fetchUniverse({ signal })
    expect(rows.filter((r) => r.market === 'P').length).toBeGreaterThan(1000)
    expect(rows.filter((r) => r.market === 'R').length).toBeGreaterThan(40)
    expect(rows.some((r) => r.nameEn)).toBe(true)
  }, 120_000)

  it('日足・配当・分割が取れ、終値は分割調整済み（7203 の 2021 年 5:1）', async () => {
    const h = await p.fetchHistory('7203.T', { from: '2021-01-01', interval: '1d', signal })
    expect(h.bars.length).toBeGreaterThan(900)
    expect(h.splits.some((s) => s.date.startsWith('2021-09') && s.ratio === 5)).toBe(true)
    expect(h.dividends.length).toBeGreaterThan(6)
    const b = h.bars.find((x) => x.d.startsWith('2021-01'))!
    expect(b.c).toBeLessThan(3000) // 未調整なら 7,000 円台
  }, 60_000)

  it('月次系列と一括気配', async () => {
    const m = await p.fetchHistory('8951.T', { from: '1999-01-01', interval: '1mo', signal })
    expect(m.bars.length).toBeGreaterThan(200)
    const q = await p.fetchQuotes(['7203.T', '8951.T', '94345.T'], { signal })
    expect(q.length).toBe(3)
    expect(q.every((x) => x.price && x.prevClose)).toBe(true)
  }, 60_000)

  it('Core で数銘柄を取り直して指標まで計算できる', async () => {
    const svc = new CoreService(dir, p, () => {}, 'contract')
    svc.repo.applyUniverse(
      [
        { code: '8058', nameJa: '三菱商事', nameEn: '', market: 'P', kind: 'stock', sectorJa: '', sectorEn: '' },
        { code: '8951', nameJa: '日本ビルファンド投資法人', nameEn: '', market: 'R', kind: 'reit', sectorJa: '', sectorEn: '' },
      ],
      p.toSymbol,
      new Date().toISOString(),
    )
    const id = await svc.call('jobs.refetch', { ids: ['JP:8058', 'JP:8951'] })
    for (let i = 0; i < 120; i++) {
      const j = (await svc.call('jobs.list', {})).find((x) => x.id === id)
      if (j?.status === 'done') break
      await new Promise((r) => setTimeout(r, 500))
    }
    const m = await svc.call('metrics.get', { ids: ['JP:8058', 'JP:8951'] })
    expect(m.length).toBe(2)
    expect(m.every((x) => x.close && x.yieldTrailing != null && x.yieldTrailing > 0)).toBe(true)
    svc.close()
  }, 120_000)
})
