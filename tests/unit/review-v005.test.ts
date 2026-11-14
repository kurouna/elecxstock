// v0.0.5 のレビューで見つかった問題の回帰テスト: 保有の銘柄の取得、月足の配当込み、楽天証券の 5 桁のコード、窓への変更の知らせ
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseRakutenCsv } from '@core/brokers/rakuten'
import { CHANGES } from '@core/changes'
import { createStubProvider } from '@core/providers/stub'
import { adjustMonthly, type DayBar, mergeMonthly } from '@core/series'
import { CoreService } from '@core/service'
import { CODE_RE } from '@shared/code'
import { afterAll, describe, expect, it } from 'vitest'

const dir = mkdtempSync(join(tmpdir(), 'elecxstock-review5-'))
const svc = new CoreService(dir, createStubProvider(), () => {}, 'test')
afterAll(() => {
  svc.close()
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    /* Windows では閉じた直後に消せないことがある */
  }
})
const meta = { broker: 'rakuten', importedAt: '2026-11-14T00:00:00Z', realized: null, dividends: null }
const h = (code: string) => ({ code, account: 'tokutei' as const, quantity: 100, avgCost: 1000 })
const tracked = async (code: string) => (await svc.call('instruments.get', { ids: [`JP:${code}`] }))[0]?.userAdded

describe('保有の銘柄は市場によらず取得する（スタンダード・グロース・ETF）', () => {
  it('一覧にある銘柄でも、保有に入れたら取得の対象になり、外したら戻る', async () => {
    await svc.call('jobs.start', { kind: 'universe' })
    for (let i = 0; i < 300 && (await svc.call('jobs.list', {})).some((j) => j.status !== 'done'); i++)
      await new Promise((r) => setTimeout(r, 20))
    // 130A はグロース、1306 は ETF（スタブの一覧にある）
    expect(await tracked('130A')).toBe(false)
    await svc.call('portfolio.applyCsv', { holdings: [h('130A')], meta })
    expect(await tracked('130A')).toBe(true)
    const jobs = await svc.call('jobs.list', {})
    expect(jobs[0]!.kind).toBe('refetch')
    // 保有のフォーム（portfolio.save）でも同じ
    await svc.call('portfolio.save', { holdings: [h('130A'), h('1306')] })
    expect(await tracked('1306')).toBe(true)
    // JSON の取り込みでも同じ
    await svc.call('portfolio.save', { holdings: [] })
    expect(await tracked('130A')).toBe(false)
    await svc.call('portfolio.applyImport', { holdings: [h('130A')], mode: 'replace' })
    expect(await tracked('130A')).toBe(true)
    // 利用者が足した銘柄には数えない（設定の上限・一覧に出さない）
    expect((await svc.call('user.load', {})).settings.userInstruments).not.toContain('130A')
  })
})

describe('ウォッチリストの一括の取り込み・フリー N の★でも、その銘柄を取得の対象にする', () => {
  it('user.importAll と watchlists.toggleItem のあとすぐに対象になる', async () => {
    expect(await tracked('1306')).toBe(false)
    const all = JSON.parse(await svc.call('user.exportAll', {}))
    all.watchlists[0].items.push('JP:1306')
    await svc.call('user.importAll', { json: JSON.stringify(all) })
    expect(await tracked('1306')).toBe(true)
    expect(await tracked('9282')).toBe(false)
    const list = all.watchlists[0].builtin ?? all.watchlists[0].id
    await svc.call('watchlists.toggleItem', { list, id: 'JP:9282' })
    expect(await tracked('9282')).toBe(true)
  })
})

describe('月足の配当込み（FR-C4）: 日足の期間より前の月足も配当で調整する', () => {
  const bar = (d: string, c: number): DayBar => ({ d, o: c, h: c, l: c, c, v: 1 })
  // 月足は 1〜6 月（終値 100）、日足は 4 月から（終値 100）。5 月 1 日に配当 10、2 月 1 日に配当 5
  const monthly = ['2026-01-30', '2026-02-27', '2026-03-31', '2026-04-30', '2026-05-29', '2026-06-30'].map((d) => bar(d, 100))
  const daily = ['2026-04-01', '2026-04-30', '2026-05-01', '2026-05-29', '2026-06-30'].map((d) => bar(d, 100))
  const dividends = [
    { date: '2026-02-02', amount: 5 },
    { date: '2026-05-01', amount: 10 },
  ]
  it('境目で段差が出ない', () => {
    const adjDaily = daily.map((b, i) => (i < 2 ? { ...b, c: 90 } : b)) // 日足の配当込み（5 月より前は 0.9 倍）
    const m = adjustMonthly(monthly, 'total', [], dividends, daily, adjDaily)
    const { bars } = mergeMonthly(m, adjDaily)
    const close = (d: string) => bars.find((b) => b.d.startsWith(d))!.c
    expect(close('2026-03')).toBeCloseTo(90) // 5 月の配当で 0.9 倍
    expect(close('2026-04')).toBeCloseTo(90)
    expect(close('2026-05')).toBeCloseTo(100)
    // 2 月の配当は前の月の終値で割る（1 − 5 / 100）。1 月はさらに 0.95 倍
    expect(close('2026-01')).toBeCloseTo(90 * 0.95)
    expect(close('2026-02')).toBeCloseTo(90)
  })
  it('日足の最初の月の中（日足の始まりより後）に権利落ちがあっても、その月の月足を調整しすぎない', () => {
    // 日足は 4 月 1 日から。4 月 27 日に配当 10（権利落ち）。4 月の月足の終値は落ちたあとの値なので調整しない
    const d2 = ['2026-04-01', '2026-04-24', '2026-04-27', '2026-04-30', '2026-05-29'].map((d) => bar(d, 100))
    const adj2 = d2.map((b, i) => (i < 2 ? { ...b, c: 90 } : b))
    const m = adjustMonthly(monthly, 'total', [], [{ date: '2026-04-27', amount: 10 }], d2, adj2)
    const { bars } = mergeMonthly(m, adj2)
    const close = (d: string) => bars.find((b) => b.d.startsWith(d))!.c
    expect(close('2026-04')).toBeCloseTo(100)
    expect(close('2026-03')).toBeCloseTo(90) // 3 月末は権利落ちの前（1 − 10 / 100）
    expect(close('2026-01')).toBeCloseTo(90)
  })
  it('分割調整（既定）・未調整はこれまでどおり', () => {
    expect(adjustMonthly(monthly, 'split', [], dividends, daily, daily)).toEqual(monthly)
    const un = adjustMonthly(monthly, 'unadjusted', [{ date: '2026-03-02', ratio: 2 }], [], daily, daily)
    expect(un[0]!.c).toBe(200)
    expect(un[3]!.c).toBe(100)
  })
})

describe('楽天証券の CSV: 5 桁のコード（優先株）も読む（FR-U5）', () => {
  it('94345 を保有として取り込む', () => {
    const csv = [
      '"種別","銘柄コード・ティッカー","銘柄","口座","保有数量","［単位］","平均取得価額","［単位］","現在値","［単位］","現在値(更新日)","(参考為替)","前日比","［単位］","時価評価額[円]","時価評価額[外貨]","評価損益[円]","評価損益[％]"',
      '"国内株式","94345","架空の優先株","特定","100","株","1,000.00","円","1,100.0","円","","","0.0","円","110,000","-","+10,000","+10.00"',
    ].join('\r\n')
    const p = parseRakutenCsv(csv, '2026-11-14T00:00:00.000Z')
    expect(p.holdings.map((x) => x.code)).toEqual(['94345'])
    expect(p.skipped).toEqual([])
  })
  it('銘柄コードの形は 1 か所で決める', () => {
    for (const c of ['7203', '130A', '94345', '25935']) expect(CODE_RE.test(c)).toBe(true)
    for (const c of ['123', '723456', '72-3', 'abcd']) expect(CODE_RE.test(c)).toBe(false)
  })
})

describe('利用者のデータを変えるメソッドは、ほかの窓に知らせる（マルチモニタ）', () => {
  it('取り込み・元に戻す・銘柄の追加と削除・保存期間・スクリーンを含む', () => {
    expect(CHANGES['user.importAll']).toBe('all')
    expect(CHANGES['user.undoImport']).toBe('all')
    expect(CHANGES['instruments.addUser']).toBe('settings')
    expect(CHANGES['instruments.removeUser']).toBe('settings')
    expect(CHANGES['jobs.applyRetention']).toBe('settings')
    expect(CHANGES['user.saveScreens']).toBe('screens')
  })
})
