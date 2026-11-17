// 描画の書き込みのまとめ・取り消し・窓をまたいだ競合（FR-C14・C17。docs/design-drawings.md §7.3・§7.4）。値はすべて架空
import type { Drawing, DrawingWrite } from '@shared/drawings'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DrawingEdits, type DrawingIO } from '../../../src/renderer/lib/drawings/edits'

const ID = 'JP:7203'
let clock = 0
const stamp = () => `t${String(++clock).padStart(4, '0')}`
const line = (id: string, raw = 1000): Drawing => ({
  id,
  kind: 'trend',
  a: { date: '2026-10-01', raw },
  b: { date: '2026-11-02', raw: raw + 100 },
  extend: 'none',
  priceLabel: true,
  log: false,
  created: '',
  updated: '',
})

/** Core（DrawingBook）と同じ確かめ方をする偽物 */
function fakeCore() {
  const db = new Map<string, Drawing[]>()
  const get = (id: string) => db.get(id) ?? []
  const calls: string[] = []
  const io: DrawingIO = {
    async create(id, d) {
      calls.push(`create ${d.id}`)
      if (get(id).some((x) => x.id === d.id)) throw new Error('exists')
      const t = stamp()
      const v = { ...d, created: d.created || t, updated: t }
      db.set(id, [...get(id), v])
      return { ok: true, drawing: v }
    },
    async update(id, d, expected): Promise<DrawingWrite> {
      calls.push(`update ${d.id}`)
      const cur = get(id).find((x) => x.id === d.id) ?? null
      if (!cur || cur.updated !== expected) return { ok: false, current: cur }
      const v = { ...d, created: cur.created, updated: stamp() }
      db.set(
        id,
        get(id).map((x) => (x.id === d.id ? v : x)),
      )
      return { ok: true, drawing: v }
    },
    async remove(id, drawingId, expected): Promise<DrawingWrite> {
      calls.push(`remove ${drawingId}`)
      const cur = get(id).find((x) => x.id === drawingId) ?? null
      if (!cur || cur.updated !== expected) return { ok: false, current: cur }
      db.set(
        id,
        get(id).filter((x) => x.id !== drawingId),
      )
      return { ok: true, drawing: cur }
    },
    async clear(id) {
      calls.push('clear')
      const all = get(id)
      db.set(id, [])
      return all
    },
  }
  return { db, io, calls }
}

let core: ReturnType<typeof fakeCore>
let local: Map<string, Drawing[]>
let notices: string[]
let edits: DrawingEdits
const store = {
  list: (id: string) => local.get(id) ?? [],
  put: (id: string, l: Drawing[]) => void local.set(id, l),
}
const ids = () => store.list(ID).map((d) => d.id)
beforeEach(() => {
  vi.useFakeTimers()
  core = fakeCore()
  local = new Map()
  notices = []
  edits = new DrawingEdits(core.io, store, (k) => notices.push(k), 300)
})
afterEach(() => vi.useRealTimers())

describe('書き込み（FR-C17）', () => {
  it('足すと手元にすぐ出て、Core の時刻に置き換わる', async () => {
    const p = edits.create('p1', ID, line('a'))
    expect(ids()).toEqual(['a'])
    await p
    expect(store.list(ID)[0]!.updated).toMatch(/^t/)
  })
  it('動かす操作は手元を先に変え、最後の操作から 300ms 後に 1 回だけ書く', async () => {
    await edits.create('p1', ID, line('a'))
    core.calls.length = 0
    for (let i = 1; i <= 5; i++) edits.edit('p1', ID, { ...store.list(ID)[0]!, a: { date: '2026-10-01', raw: 1000 + i } })
    expect(store.list(ID)[0]!.a.raw).toBe(1005)
    expect(core.calls).toEqual([])
    await vi.advanceTimersByTimeAsync(299)
    expect(core.calls).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    expect(core.calls).toEqual(['update a'])
    expect(core.db.get(ID)![0]!.a.raw).toBe(1005)
  })
  it('flush ですぐ書く（選択を外した・ドラッグを離した）', async () => {
    await edits.create('p1', ID, line('a'))
    edits.edit('p1', ID, { ...store.list(ID)[0]!, extend: 'right' })
    await edits.flush()
    expect(core.db.get(ID)![0]!.extend).toBe('right')
    expect(edits.editing('a')).toBe(false)
  })
  it('ほかの窓で直されていたら、手元の変更を捨てて今の値にし、知らせる', async () => {
    await edits.create('p1', ID, line('a'))
    const other = core.db.get(ID)![0]!
    await core.io.update(ID, { ...other, extend: 'both' }, other.updated) // ほかの窓
    edits.edit('p1', ID, { ...store.list(ID)[0]!, extend: 'right' })
    await edits.flush()
    expect(store.list(ID)[0]!.extend).toBe('both')
    expect(notices).toEqual(['conflict'])
  })
  it('ほかの窓で消されていたら、手元からも消して知らせる', async () => {
    await edits.create('p1', ID, line('a'))
    const cur = core.db.get(ID)![0]!
    await core.io.remove(ID, 'a', cur.updated)
    edits.edit('p1', ID, { ...store.list(ID)[0]!, extend: 'right' })
    await edits.flush()
    expect(ids()).toEqual([])
    expect(notices).toEqual(['conflict'])
  })
  it('ほかの窓からの読み直しは、編集中の図形を手元の値のまま残す', async () => {
    await edits.create('p1', ID, line('a'))
    await edits.create('p1', ID, line('b'))
    edits.edit('p1', ID, { ...store.list(ID)[0]!, extend: 'right' })
    edits.merge(ID, core.db.get(ID)!)
    expect(store.list(ID).find((d) => d.id === 'a')!.extend).toBe('right')
    // 編集中でない図形は新しい値にする・消えた図形は消す
    edits.merge(ID, [core.db.get(ID)![0]!])
    expect(ids()).toEqual(['a'])
  })
})

describe('取り消し・やり直し（FR-C14）', () => {
  it('引く → 戻すで消え、やり直すで戻る', async () => {
    await edits.create('p1', ID, line('a'))
    expect(await edits.undo('p1')).toBe(true)
    expect(ids()).toEqual([])
    expect(core.db.get(ID)).toEqual([])
    expect(await edits.redo('p1')).toBe(true)
    expect(ids()).toEqual(['a'])
    expect(core.db.get(ID)!.map((d) => d.id)).toEqual(['a'])
  })
  it('矢印の連打 1 回が 1 段（まとめた単位で戻る）', async () => {
    await edits.create('p1', ID, line('a'))
    for (let i = 1; i <= 3; i++) edits.edit('p1', ID, { ...store.list(ID)[0]!, a: { date: '2026-10-01', raw: 1000 + i } })
    await vi.advanceTimersByTimeAsync(300)
    expect(await edits.undo('p1')).toBe(true)
    expect(store.list(ID)[0]!.a.raw).toBe(1000)
    expect(core.db.get(ID)![0]!.a.raw).toBe(1000)
    expect(await edits.redo('p1')).toBe(true)
    expect(core.db.get(ID)![0]!.a.raw).toBe(1003)
  })
  it('戻すの前に、書いていない変更を書く', async () => {
    await edits.create('p1', ID, line('a'))
    edits.edit('p1', ID, { ...store.list(ID)[0]!, extend: 'right' })
    await edits.undo('p1')
    expect(store.list(ID)[0]!.extend).toBe('none')
  })
  it('消す → 戻すで同じ ID・作った時刻のまま戻る', async () => {
    await edits.create('p1', ID, line('a'))
    const created = store.list(ID)[0]!.created
    await edits.remove('p1', ID, 'a')
    expect(ids()).toEqual([])
    await edits.undo('p1')
    expect(store.list(ID)[0]).toMatchObject({ id: 'a', created })
  })
  it('すべて消す → 戻すで全部戻る', async () => {
    await edits.create('p1', ID, line('a'))
    await edits.create('p1', ID, line('b'))
    await edits.clear('p1', ID)
    expect(ids()).toEqual([])
    await edits.undo('p1')
    expect(ids().sort()).toEqual(['a', 'b'])
  })
  it('ペインと銘柄ごとの履歴。ほかのペインの操作は戻さない', async () => {
    await edits.create('p1', ID, line('a'))
    await edits.create('p2', ID, line('b'))
    await edits.undo('p1')
    expect(ids()).toEqual(['b'])
    expect(await edits.undo('p1')).toBe(false)
    expect(edits.canUndo('p2')).toBe(true)
  })
  it('ほかの窓で変えられた図形は戻さず、知らせて履歴から外す', async () => {
    await edits.create('p1', ID, line('a'))
    const cur = core.db.get(ID)![0]!
    await core.io.update(ID, { ...cur, extend: 'both' }, cur.updated)
    expect(await edits.undo('p1')).toBe(true)
    expect(notices).toEqual(['conflict'])
    expect(core.db.get(ID)![0]!.extend).toBe('both')
    expect(edits.canUndo('p1')).toBe(false)
  })
  it('新しい操作をするとやり直しは消える', async () => {
    await edits.create('p1', ID, line('a'))
    await edits.undo('p1')
    await edits.create('p1', ID, line('b'))
    expect(await edits.redo('p1')).toBe(false)
  })
})

describe('失敗', () => {
  it('足すのに失敗したら手元から外して知らせる', async () => {
    await edits.create('p1', ID, line('a'))
    core.io.create = async () => {
      throw new Error('limit')
    }
    await edits.create('p1', ID, line('z'))
    expect(ids()).toEqual(['a'])
    expect(edits.canUndo('p1')).toBe(true)
    await edits.undo('p1')
    expect(ids()).toEqual([])
    expect(notices).toEqual(['failed'])
  })
})

describe('操作の順（返事を待たずに続けて押す）', () => {
  it('消してすぐ戻す: 消す返事より先に Ctrl+Z を押しても、消したものが戻る', async () => {
    await edits.create('p1', ID, line('a'))
    edits.edit('p1', ID, { ...store.list(ID)[0]!, extend: 'right' })
    const r = edits.remove('p1', ID, 'a')
    // 返事を待たずに戻す（キーの連打）
    expect(edits.canUndo('p1')).toBe(true)
    const u = edits.undo('p1')
    await Promise.all([r, u])
    expect(ids()).toEqual(['a'])
    expect(store.list(ID)[0]!.extend).toBe('right')
    expect(core.db.get(ID)!.map((d) => d.id)).toEqual(['a'])
  })
  it('引いてすぐ戻す', async () => {
    const c = edits.create('p1', ID, line('a'))
    const u = edits.undo('p1')
    await Promise.all([c, u])
    expect(ids()).toEqual([])
    expect(core.db.get(ID)).toEqual([])
  })
})

describe('取り消しを続ける・引いた直後の編集・スコープ（レビューの指摘）', () => {
  it('2 段以上戻せる（戻した書き込みの時刻で、前の段が断られない）', async () => {
    await edits.create('p1', ID, line('a'))
    edits.edit('p1', ID, { ...store.list(ID)[0]!, extend: 'right' })
    await edits.flush()
    expect(await edits.undo('p1')).toBe(true)
    expect(store.list(ID)[0]!.extend).toBe('none')
    expect(await edits.undo('p1')).toBe(true)
    expect(ids()).toEqual([])
    expect(notices).toEqual([])
    // やり直しも 2 段
    await edits.redo('p1')
    await edits.redo('p1')
    expect(store.list(ID)[0]!.extend).toBe('right')
    expect(notices).toEqual([])
  })
  it('消す → 戻す → さらに戻す（引く前へ）', async () => {
    await edits.create('p1', ID, line('a'))
    await edits.remove('p1', ID, 'a')
    await edits.undo('p1')
    await edits.undo('p1')
    expect(ids()).toEqual([])
    expect(notices).toEqual([])
  })
  it('引いた返事の前に動かしても、競合にせず書く', async () => {
    const c = edits.create('p1', ID, line('a'))
    edits.edit('p1', ID, { ...store.list(ID)[0]!, extend: 'right' })
    await c
    await edits.flush()
    expect(notices).toEqual([])
    expect(core.db.get(ID)![0]!.extend).toBe('right')
    expect(store.list(ID)[0]!.updated).toBe(core.db.get(ID)![0]!.updated)
  })
  it('ドラッグの間（hold）はタイマーで書かず、離したときに 1 回', async () => {
    await edits.create('p1', ID, line('a'))
    core.calls.length = 0
    edits.edit('p1', ID, { ...store.list(ID)[0]!, extend: 'right' }, { hold: true })
    await vi.advanceTimersByTimeAsync(1000)
    expect(core.calls).toEqual([])
    await edits.flush('a')
    expect(core.calls).toEqual(['update a'])
  })
  it('中身の変わらない編集は書かず、取り消しの段にもしない', async () => {
    await edits.create('p1', ID, line('a'))
    core.calls.length = 0
    edits.edit('p1', ID, { ...store.list(ID)[0]! })
    await edits.flush()
    expect(core.calls).toEqual([])
    await edits.undo('p1')
    expect(ids()).toEqual([])
  })
  it('戻せるかはスコープごと（ほかのペインの書き込み中でも、このペインに無ければ false）', async () => {
    await edits.create('p2', ID, line('b'))
    edits.edit('p2', ID, { ...store.list(ID)[0]!, extend: 'right' })
    expect(edits.canUndo('p1')).toBe(false)
    expect(edits.canUndo('p2')).toBe(true)
  })
})

describe('読み直しと消す操作が重なる（レビューの指摘）', () => {
  it('消している途中に古い一覧を読み直しても、消した線は手元に戻らない', async () => {
    await edits.create('p1', ID, line('a'))
    const stale = [...core.db.get(ID)!]
    // Core の返事を遅らせ、手元から消したあと・返事の前に読み直しが届く
    const orig = core.io.remove
    let go: () => void = () => {}
    const gate = new Promise<void>((res) => {
      go = res
    })
    core.io.remove = async (...a) => {
      await gate
      return orig(...a)
    }
    const r = edits.remove('p1', ID, 'a')
    await vi.waitFor(() => expect(ids()).toEqual([]))
    edits.merge(ID, stale)
    go()
    await r
    expect(ids()).toEqual([])
  })
})

describe('まとめて書く間の「戻せるか」（レビュー 2 回目）', () => {
  it('すべてを書く flush の返事を待つ間も、そのペインは戻せる（Ctrl+Z を全体に回さない）', async () => {
    const c = edits.create('p1', ID, line('a'))
    await c
    // p1 の履歴を空にしてから、書きかけを作る
    ;(edits as unknown as { hist: Map<string, unknown> }).hist.clear()
    edits.edit('p1', ID, { ...store.list(ID)[0]!, extend: 'right' })
    // Core の返事を遅らせ、書きかけを外したあと・返事の前を見る
    const orig = core.io.update
    let go: () => void = () => {}
    const gate = new Promise<void>((res) => {
      go = res
    })
    let asked = false
    core.io.update = async (...a) => {
      asked = true
      await gate
      return orig(...a)
    }
    const f = edits.flush()
    await vi.waitFor(() => expect(asked).toBe(true))
    expect(edits.canUndo('p1')).toBe(true)
    go()
    await f
  })
})

describe('レビュー 2 回目（Fable）', () => {
  it('消す操作が列で待つ間に読み直しで手元から消えても、Core から消す', async () => {
    await edits.create('p1', ID, line('a'))
    await edits.create('p1', ID, line('b'))
    // 先に別の書き込みを遅らせて並べる
    const orig = core.io.update
    let go: () => void = () => {}
    const gate = new Promise<void>((res) => {
      go = res
    })
    core.io.update = async (...a) => {
      await gate
      return orig(...a)
    }
    edits.edit('p1', ID, { ...store.list(ID).find((d) => d.id === 'b')!, extend: 'right' })
    const f = edits.flush('b')
    const r = edits.remove('p1', ID, 'a')
    edits.merge(
      ID,
      core.db.get(ID)!.filter((d) => d.id !== 'a'),
    )
    go()
    await Promise.all([f, r])
    expect(core.db.get(ID)!.map((d) => d.id)).toEqual(['b'])
  })
  it('ほかの窓の変更をまたいだ取り消しは、黙って通さず知らせる', async () => {
    await edits.create('p1', ID, line('a'))
    edits.edit('p1', ID, { ...store.list(ID)[0]!, extend: 'right' }) // A→B
    await edits.flush()
    const cur = core.db.get(ID)![0]!
    await core.io.update(ID, { ...cur, extend: 'left' }, cur.updated) // ほかの窓: C
    edits.merge(ID, core.db.get(ID)!)
    edits.edit('p1', ID, { ...store.list(ID)[0]!, priceLabel: false }) // C→D
    await edits.flush()
    await edits.undo('p1') // D→C
    expect(store.list(ID)[0]!.extend).toBe('left')
    await edits.undo('p1') // B→A は、ほかの窓の C をまたぐので断る
    expect(notices).toEqual(['conflict'])
    expect(core.db.get(ID)![0]!.extend).toBe('left')
  })
})

describe('レビュー（消す操作の画面への反映・やり直せるか）', () => {
  it('消すと、前の書き込みの返事を待たずに手元からすぐ消える', async () => {
    await edits.create('p1', ID, line('a'))
    await edits.create('p1', ID, line('b'))
    const orig = core.io.update
    let go: () => void = () => {}
    const gate = new Promise<void>((res) => {
      go = res
    })
    core.io.update = async (...a) => {
      await gate
      return orig(...a)
    }
    edits.edit('p1', ID, { ...store.list(ID).find((d) => d.id === 'b')!, extend: 'right' })
    const f = edits.flush('b')
    const r = edits.remove('p1', ID, 'a')
    expect(ids()).toEqual(['b'])
    go()
    await Promise.all([f, r])
    expect(core.db.get(ID)!.map((d) => d.id)).toEqual(['b'])
  })
  it('書きかけの線を消しても、書きかけの変更は書いてから消す（戻すと変更のある線が戻る）', async () => {
    await edits.create('p1', ID, line('a'))
    edits.edit('p1', ID, { ...store.list(ID)[0]!, extend: 'right' })
    const r = edits.remove('p1', ID, 'a')
    expect(ids()).toEqual([])
    await r
    expect(core.db.get(ID)).toEqual([])
    expect(notices).toEqual([])
    await edits.undo('p1')
    expect(store.list(ID)[0]!.extend).toBe('right')
  })
  it('やり直せるかは、やり直しの段か書き込み中だけで決める（書きかけは数えない）', async () => {
    await edits.create('p1', ID, line('a'))
    edits.edit('p1', ID, { ...store.list(ID)[0]!, extend: 'right' })
    expect(edits.canRedo('p1')).toBe(false)
    expect(edits.canUndo('p1')).toBe(true)
  })
})
