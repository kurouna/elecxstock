// 利用者のデータの保護（FR-S12, FR-H9）: 壊れた設定を見逃さない・読み取り専用のときに取り込みの記録（退避）を壊さない・
// 保存に失敗したときに手元の写し（キャッシュ）だけが変わらない
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStubProvider } from '@core/providers/stub'
import { CoreService } from '@core/service'
import { UserStore } from '@core/userstore'
import { afterAll, describe, expect, it } from 'vitest'

const dirs: string[] = []
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'elecxstock-guard-'))
  dirs.push(d)
  return d
}
afterAll(() => {
  for (const d of dirs)
    try {
      rmSync(d, { recursive: true, force: true })
    } catch {
      /* Windows では閉じた直後に消せないことがある */
    }
})

describe('壊れた設定のファイル（FR-S12）', () => {
  // JSON としては読めるが、設定（オブジェクト）ではないもの。既定値で黙って通すと、次の保存で元のファイルを上書きしてしまう
  for (const body of [
    'null',
    '42',
    '"dark"',
    'true',
    '[]',
    '[1,2]',
    '{"version":1,"data":null}',
    '{"version":1,"data":[]}',
    '{"version":1,"data":7}',
  ])
    it(`${body} は退避して読み取り専用で起動する`, () => {
      const d = tmp()
      writeFileSync(join(d, 'settings.json'), body)
      const s = new UserStore(d)
      s.load('settings')
      expect(s.readOnly).toBe(true)
      expect(s.error).toMatch(/^settings\.json/)
      expect(readdirSync(join(d, 'backups')).some((f) => f.startsWith('settings.broken-'))).toBe(true)
    })
  it('版を持たない素のオブジェクト（版 0）と、版 1 の形は読める', () => {
    for (const body of ['{"theme":"light"}', '{"version":1,"data":{"theme":"light"}}']) {
      const d = tmp()
      writeFileSync(join(d, 'settings.json'), body)
      const s = new UserStore(d)
      expect(s.load('settings').theme).toBe('light')
      expect(s.readOnly).toBe(false)
    }
  })
})

/** 設定のファイルを壊して、読み取り専用の Core を作る */
function readOnlyCore() {
  const d = tmp()
  const u = join(d, 'user')
  const b = join(u, 'backups')
  mkdirSync(b, { recursive: true })
  writeFileSync(join(u, 'settings.json'), '{ broken')
  // 前の取り込みの記録（元に戻すで戻る先）
  const pre = {
    holdings: JSON.stringify({ version: 1, data: [{ code: '7203', account: 'tokutei', quantity: 100, avgCost: 1500 }] }),
    portfolioMeta: JSON.stringify({ version: 1, data: null }),
    watchlists: JSON.stringify({ version: 1, data: [] }),
    alerts: JSON.stringify({ version: 1, data: [] }),
  }
  for (const [n, body] of Object.entries(pre)) writeFileSync(join(b, `${n}.preimport.json`), body)
  const svc = new CoreService(d, createStubProvider(), () => {}, 'test')
  svc.user.load('settings')
  const kept = () => Object.fromEntries(Object.keys(pre).map((n) => [n, readFileSync(join(b, `${n}.preimport.json`), 'utf8')]))
  return { svc, pre, kept, b }
}

describe('読み取り専用のときの取り込み（FR-S12, FR-H9）', () => {
  it('保有の JSON・証券会社の CSV の取り込みは書かずに断り、前の取り込みの記録を残す', async () => {
    const { svc, pre, kept } = readOnlyCore()
    expect(svc.user.readOnly).toBe(true)
    const holdings = [{ code: '8058', account: 'tokutei' as const, quantity: 10, avgCost: 2000 }]
    await expect(svc.call('portfolio.applyImport', { holdings, mode: 'replace' })).rejects.toMatchObject({ code: 'read-only' })
    await expect(
      svc.call('portfolio.applyCsv', { holdings, meta: { source: 'sbi', importedAt: '2026-11-13T09:00:00.000Z' } as never }),
    ).rejects.toMatchObject({
      code: 'read-only',
    })
    expect(kept()).toEqual(pre)
    await svc.shutdown()
  })
  it('利用者のデータの一括の取り込みは書かずに断り、前の取り込みの記録を消さない', async () => {
    const { svc, pre, kept } = readOnlyCore()
    const json = JSON.stringify({ format: 'elecxstock.userdata', version: 1, watchlists: [], screens: [] })
    await expect(svc.call('user.importAll', { json })).rejects.toMatchObject({ code: 'read-only' })
    expect(kept()).toEqual(pre)
    await svc.shutdown()
  })
  it('★・◆の切り替えが保存できなければ、手元の写しも変えない', async () => {
    const { svc } = readOnlyCore()
    const before = structuredClone(svc.user.load('watchlists'))
    await expect(svc.call('watchlists.toggleItem', { list: 'favorites', id: 'JP:7203' })).rejects.toMatchObject({ code: 'read-only' })
    expect(svc.user.load('watchlists')).toEqual(before)
    await svc.shutdown()
  })
})

describe('★・◆の切り替え（FR-W）', () => {
  it('前に読んだ一覧（Core の外に渡したもの）を書き換えない', async () => {
    const d = tmp()
    const svc = new CoreService(d, createStubProvider(), () => {}, 'test')
    const before = svc.user.load('watchlists')
    const snap = structuredClone(before)
    const after = await svc.call('watchlists.toggleItem', { list: 'favorites', id: 'JP:7203' })
    expect(before).toEqual(snap)
    expect(after.find((w) => w.builtin === 'favorites')?.items).toEqual(['JP:7203'])
    expect(existsSync(join(d, 'user', 'watchlists.json'))).toBe(true)
    await svc.shutdown()
  })
})
