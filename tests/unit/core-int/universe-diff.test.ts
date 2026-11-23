// ユニバースの差分の反映（FR-U4, U8。L3）: 新規上場・上場廃止・市場変更・社名変更・再上場。値はスタブの架空の値
import { createStubProvider } from '@core/providers/stub'
import type { Provider, UniverseRow } from '@core/providers/types'
import { REF_INDEX_ROWS } from '@shared/markets'
import { afterAll, beforeEach, describe, expect, it, onTestFinished } from 'vitest'
import { makeCore, runJob } from '../../support/core'

const stub = createStubProvider()
/** JPX の一覧を書き換える（既定は書き換えない） */
let edit: (rows: UniverseRow[]) => UniverseRow[] = (rows) => rows
/** 日足の呼び出し（記号 → from）・気配を頼んだ記号 */
const hist: { symbol: string; from: string }[] = []
const quoted = new Set<string>()
const provider: Provider = {
  ...stub,
  async fetchUniverse(o) {
    return edit(await stub.fetchUniverse(o))
  },
  fetchHistory(symbol, o) {
    if (o.interval === '1d') hist.push({ symbol, from: o.from })
    return stub.fetchHistory(symbol, o)
  },
  fetchQuotes(symbols, o) {
    for (const s of symbols) quoted.add(s)
    return stub.fetchQuotes(symbols, o)
  },
}
const core = makeCore({ provider })
const { call } = core
const repo = core.svc.repo
afterAll(() => core.dispose())
beforeEach(() => {
  edit = (rows) => rows
})

const get = async (code: string) => (await call('instruments.get', { ids: [`JP:${code}`] }))[0]!
const fetched = (code: string) => repo.fetchSet().some((s) => s.id === `JP:${code}`)
const bars = (code: string) => repo.daily(`JP:${code}`).length
const setRow = (code: string, patch: Partial<UniverseRow>) => (rows: UniverseRow[]) =>
  rows.map((r) => (r.code === code ? { ...r, ...patch } : r))
const without = (code: string) => (rows: UniverseRow[]) => rows.filter((r) => r.code !== code)
const watch = async (code: string) => {
  const list = (await call('user.load', {})).watchlists[0]!.id
  await call('watchlists.toggleItem', { list, id: `JP:${code}` })
}

describe('プライム・J-REIT から外れた銘柄（市場変更。FR-U4）', () => {
  it('ウォッチリストに無ければ、取得を止めてデータを残す', async () => {
    expect((await get('8053')).userAdded).toBe(false)
    const n = bars('8053')
    expect(n).toBeGreaterThan(0)
    edit = setRow('8053', { market: 'S' })
    await runJob(core, 'universe')
    const ins = await get('8053')
    expect(ins.market).toBe('S')
    expect(ins.status).toBe('active')
    expect(fetched('8053')).toBe(false)
    // 日々の更新でも気配を頼まない。日足は残る
    quoted.clear()
    await runJob(core, 'daily')
    expect(quoted.has('8053.T')).toBe(false)
    expect(bars('8053')).toBe(n)
  })
  it('ウォッチリストにあれば、利用者の追加として取得を続ける', async () => {
    edit = setRow('8001', { market: 'S' })
    await watch('8001')
    await runJob(core, 'universe')
    const ins = await get('8001')
    expect(ins.market).toBe('S')
    expect(ins.userAdded).toBe(true)
    expect(fetched('8001')).toBe(true)
  })
  it('J-REIT から外れた銘柄も同じ（取得を止めてデータを残す）', async () => {
    const n = bars('8953')
    edit = setRow('8953', { market: 'X', kind: 'other' })
    await runJob(core, 'universe')
    expect(fetched('8953')).toBe(false)
    expect(bars('8953')).toBe(n)
  })
})

describe('プライムに入った銘柄（新規上場・市場変更。FR-U4）', () => {
  it('グロースからプライムに移った銘柄は取得の対象になり、日々の更新で全期間を取る', async () => {
    expect(fetched('130A')).toBe(false)
    expect(bars('130A')).toBe(0)
    edit = setRow('130A', { market: 'P' })
    await runJob(core, 'universe')
    expect(fetched('130A')).toBe(true)
    hist.length = 0
    await runJob(core, 'daily')
    expect(hist.some((h) => h.symbol === '130A.T')).toBe(true)
    expect(bars('130A')).toBeGreaterThan(0)
  })
  it('一覧に初めて出た銘柄は active で入り、追加の数に数える', () => {
    const rows: UniverseRow[] = [
      { code: '999A', nameJa: '架空の新規上場', nameEn: 'Fictional IPO', market: 'P', kind: 'stock', sectorJa: '', sectorEn: '' },
    ]
    // 既存の銘柄は全部ある前提で、1 行だけ足す（廃止の数を 0 にする）
    const all = repo.db.all<{ code: string }>(`SELECT code FROM instruments WHERE id LIKE 'JP:%' AND status = 'active'`)
    const keep: UniverseRow[] = all.map((r) => {
      const i = repo.instrument(`JP:${r.code}`)!
      return {
        code: r.code,
        nameJa: i.nameJa,
        nameEn: i.nameEn,
        market: i.market,
        kind: i.kind,
        sectorJa: i.sectorJa,
        sectorEn: i.sectorEn,
      }
    })
    const r = repo.applyUniverse([...keep, ...rows], stub.toSymbol, new Date().toISOString())
    expect(r).toEqual({ added: 1, delisted: 0 })
    const ins = repo.instrument('JP:999A')!
    expect(ins.status).toBe('active')
    expect(ins.market).toBe('P')
    expect(fetched('999A')).toBe(true)
    // 足した架空の銘柄を後のテストの DB に残さない（日足は取っていない）
    onTestFinished(() => void repo.db.run(`DELETE FROM instruments WHERE id = 'JP:999A'`))
  })
})

describe('上場廃止（一覧から消えた銘柄。FR-U4, U8）', () => {
  it('delisted にして取得を止め、データを残す。ウォッチリストにあっても取らない', async () => {
    await watch('8031')
    const n = bars('8031')
    expect(n).toBeGreaterThan(0)
    edit = without('8031')
    await runJob(core, 'universe')
    const ins = await get('8031')
    expect(ins.status).toBe('delisted')
    expect(fetched('8031')).toBe(false)
    quoted.clear()
    await runJob(core, 'daily')
    expect(quoted.has('8031.T')).toBe(false)
    expect(bars('8031')).toBe(n)
    // 銘柄は表に残り、検索で見つかる
    expect((await call('instruments.search', { q: '8031' })).some((x) => x.id === 'JP:8031')).toBe(true)
  })
  it('一覧に戻れば active に戻り、取得を続ける', async () => {
    // 前のテストに頼らず、ここで廃止にしてから戻す（単独で流しても・順を変えても同じ）
    edit = without('8031')
    await runJob(core, 'universe')
    expect((await get('8031')).status).toBe('delisted')
    edit = (rows) => rows
    await runJob(core, 'universe')
    expect((await get('8031')).status).toBe('active')
    expect(fetched('8031')).toBe(true)
  })
  it('参照の行（指数・為替など。JPX の一覧に無い）は廃止にしない', async () => {
    edit = without('8031')
    await runJob(core, 'universe')
    const refs = await call('instruments.get', { ids: REF_INDEX_ROWS.map((r) => r.id) })
    for (const r of refs) expect(r.status, r.id).toBe('active')
    edit = (rows) => rows
    await runJob(core, 'universe')
  })
})

describe('社名の変更（FR-U4, U7）', () => {
  it('日本語名を書き換え、英語名が空なら前の名前を残す', async () => {
    const before = await get('8058')
    edit = setRow('8058', { nameJa: '架空商事', nameEn: '' })
    await runJob(core, 'universe')
    const ins = await get('8058')
    expect(ins.nameJa).toBe('架空商事')
    expect(ins.nameEn).toBe(before.nameEn)
  })
})
