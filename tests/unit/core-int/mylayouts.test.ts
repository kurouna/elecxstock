// マイレイアウトのデータ（FR-L14, FR-S12。docs/design-mylayouts.md §5.4〜§5.6, §5.8）: レイアウトのファイルを読み損なったら
// 退避して既定で起動し書ける・ページは要素ごとに確かめる・新しい版のファイルは読み取り専用・世代・取り込みの記録・1 枚目だけが書く
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { UserStore } from '@core/userstore'
import type { SavedLayout } from '@shared/types'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { makeCore } from '../../support/core'

const page = (
  id: string,
  name = id,
  entry: unknown = { root: { kind: 'pane', id: `${id}-a`, widget: 'chart' }, docks: {} },
): SavedLayout => ({
  id,
  name: { ja: name, en: name },
  entry,
  links: {},
  created: 1,
  updated: 1,
})
const dirs: string[] = []
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'elecxstock-user-'))
  dirs.push(d)
  return d
}
const write = (d: string, n: string, body: unknown) =>
  writeFileSync(join(d, `${n}.json`), typeof body === 'string' ? body : JSON.stringify({ version: 1, data: body }))
const backups = (d: string) => readdirSync(join(d, 'backups'))
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('レイアウトのファイルを読み損なったとき（FR-S12, FR-L14）', () => {
  it('layout.json が JSON として読めなければ、退避して既定で起動し、書ける', () => {
    const d = tmp()
    write(d, 'layout', '{ broken')
    const s = new UserStore(d)
    expect(s.load('layout')).toBeNull()
    expect(s.readOnly).toBe(false)
    expect(s.recovered).toEqual([{ file: 'layout', backup: expect.stringMatching(/^layout\.broken-\d+\.json$/) }])
    expect(backups(d)).toContain(s.recovered[0]!.backup)
    s.save('layout', { version: 1 })
    expect(existsSync(join(d, 'layout.json'))).toBe(true)
  })
  it('layouts.json が JSON として読めない・配列でなければ、退避して空で起動し、書ける', () => {
    for (const body of ['[{', JSON.stringify({ version: 1, data: { not: 'array' } })]) {
      const d = tmp()
      write(d, 'layouts', body)
      const s = new UserStore(d)
      expect(s.load('layouts')).toEqual([])
      expect(s.readOnly).toBe(false)
      expect(s.recovered[0]).toMatchObject({ file: 'layouts', backup: expect.stringMatching(/^layouts\.broken-/) })
      s.save('layouts', [page('a')])
    }
  })
  it('layouts.json は要素ごとに確かめ、通らない要素だけを除く。元のファイルは間引かれない名前で写す', () => {
    const d = tmp()
    const bad = { id: 'x', name: 'not localized' }
    write(d, 'layouts', [page('a'), bad, page('b')])
    const raw = readFileSync(join(d, 'layouts.json'), 'utf8')
    const s = new UserStore(d)
    expect(s.load('layouts').map((p) => p.id)).toEqual(['a', 'b'])
    expect(s.readOnly).toBe(false)
    expect(s.recovered).toEqual([{ file: 'layouts', backup: expect.stringMatching(/^layouts\.dropped-\d+\.json$/), dropped: 1 }])
    expect(readFileSync(join(d, 'backups', s.recovered[0]!.backup), 'utf8')).toBe(raw)
  })
  it('前の版の形（links あり・shape なし）も、新しい形（shape あり）も読める', () => {
    const d = tmp()
    write(d, 'layouts', [
      { ...page('a'), links: { '1': 'JP:7203' } },
      { ...page('b'), shape: 'free:quad' },
    ])
    const s = new UserStore(d)
    expect(s.load('layouts')).toMatchObject([
      { id: 'a', links: { '1': 'JP:7203' } },
      { id: 'b', shape: 'free:quad' },
    ])
    expect(s.recovered).toEqual([])
  })
  it('退避できない（rename も copy も失敗）ときは、レイアウトでも読み取り専用で起動する', () => {
    const d = tmp()
    write(d, 'layout', '{ broken')
    const s = new UserStore(d)
    // 退避先のフォルダをファイルにして、rename・copy を失敗させる
    rmSync(join(d, 'backups'), { recursive: true })
    writeFileSync(join(d, 'backups'), '')
    s.load('layout')
    expect(s.readOnly).toBe(true)
    expect(s.recovered).toEqual([])
    expect(readFileSync(join(d, 'layout.json'), 'utf8')).toBe('{ broken') // 元を上書きしない
  })
  it('新しい版が書いたファイルは、退避も既定もせずに読み取り専用（どのファイルでも）', () => {
    for (const n of ['layouts', 'watchlists'] as const) {
      const d = tmp()
      writeFileSync(join(d, `${n}.json`), JSON.stringify({ version: 99, data: [] }))
      const s = new UserStore(d)
      s.load(n)
      expect(s.readOnly).toBe(true)
      expect(s.error).toMatch(/version 99/)
      expect(existsSync(join(d, `${n}.json`))).toBe(true)
      expect(backups(d)).toEqual([])
    }
  })
  it('ほかのファイルの読み損ないは今のとおり読み取り専用で、ページも書かない', () => {
    const d = tmp()
    write(d, 'screens', '{ broken')
    const s = new UserStore(d)
    s.load('screens')
    expect(s.readOnly).toBe(true)
    expect(() => s.save('layouts', [page('free')])).toThrow()
  })
  it('退避ファイルも種類ごとに直近 10 個まで残す', () => {
    const d = tmp()
    mkdirSync(join(d, 'backups'))
    for (let i = 0; i < 12; i++) writeFileSync(join(d, 'backups', `layout.broken-${1000 + i}.json`), '')
    write(d, 'layout', '{ broken')
    new UserStore(d).load('layout')
    expect(backups(d).filter((f) => f.startsWith('layout.broken-'))).toHaveLength(10)
  })
})

describe('ページの世代（FR-S4, FR-L14）', () => {
  it('中身だけが変わった保存は間引き、ID・名前・並びが変わった保存は必ず世代を残す', () => {
    const d = tmp()
    const s = new UserStore(d)
    const gens = () => s.generations('layouts').length
    s.load('layouts')
    s.save('layouts', [page('a'), page('b')])
    s.save('layouts', [page('a'), page('b', 'b', { root: { kind: 'pane', id: 'z', widget: 'info' }, docks: {} })])
    expect(gens()).toBe(1) // ファイルがあってから 1 回目
    s.save('layouts', [page('a'), page('b', 'b', { root: { kind: 'pane', id: 'y', widget: 'info' }, docks: {} })])
    expect(gens()).toBe(1) // 中身だけ: 10 分以内は残さない
    s.save('layouts', [page('a', '朝'), page('b')])
    expect(gens()).toBe(2) // 名前
    s.save('layouts', [page('b'), page('a', '朝')])
    expect(gens()).toBe(3) // 並び
    s.save('layouts', [page('b')])
    expect(gens()).toBe(4) // 削除
  })
})

describe('取り込み・1 枚目だけが書く（FR-S3, FR-H9, FR-W, FR-L14）', () => {
  const core = makeCore()
  afterAll(() => core.dispose())
  const { call } = core
  const exportOf = (o: object) => JSON.stringify({ format: 'elecxstock.userdata', version: 1, watchlists: [], screens: [], ...o })

  it('取り込むファイルに layouts が無ければ、元に戻してもページは戻らない（前の取り込みの記録も使わない）', async () => {
    await call('user.saveLayouts', { layouts: [page('old')] })
    await call('user.importAll', { json: exportOf({ layouts: [page('imported')] }) })
    expect((await call('user.load', {})).layouts.map((p) => p.id)).toEqual(['imported'])
    await call('user.importAll', { json: exportOf({}) })
    await call('user.saveLayouts', { layouts: [page('imported'), page('mine')] })
    expect(await call('user.undoImport', {})).toBe(true)
    expect((await call('user.load', {})).layouts.map((p) => p.id)).toEqual(['imported', 'mine'])
  })
  it('フリー N はレイアウトとページを書けない（読むだけ）', async () => {
    await expect(core.callAs('free2', 'user.saveLayouts', { layouts: [] })).rejects.toMatchObject({ code: 'invalid-params' })
    await expect(core.callAs('free3', 'user.saveLayout', { layout: { version: 1 } })).rejects.toMatchObject({ code: 'invalid-params' })
    expect((await core.callAs('free2', 'user.load', {})).layouts.length).toBeGreaterThan(0)
  })
  it('退避したレイアウトのファイルは user.load の recovered で知らせる', async () => {
    const c = makeCore()
    try {
      writeFileSync(join(c.dir, 'user', 'layouts.json'), '{ broken')
      const u = await c.call('user.load', {})
      expect(u.readOnly).toBe(false)
      expect(u.layouts).toEqual([])
      expect(u.recovered).toEqual([{ file: 'layouts', backup: expect.stringMatching(/^layouts\.broken-/) }])
    } finally {
      await c.dispose()
    }
  })
})
