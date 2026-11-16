// マイレイアウトのページ（FR-L14。docs/design-mylayouts.md §3.5, §5.2〜§5.7）: 読み込みの決まり・写すときの ID・ページの切り替えと
// 作業用の写し・足す／消す／並べ替え・保存の順と停止・すべてのタブを戻すとき。window が要るので、Core への窓口だけを用意する
import type { SavedLayout } from '@shared/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls: { method: string; params: unknown }[] = []
let fail = false
vi.stubGlobal('window', {
  elecxstock: {
    call: async (method: string, params: unknown) => {
      calls.push({ method, params })
      if (fail) throw { code: 'read-only' }
      return undefined
    },
    on: () => () => {},
    prioritize: () => {},
  },
})

const L = await import('../../../src/renderer/stores/layout.svelte')
const { app } = await import('../../../src/renderer/stores/app.svelte')
type Entry = import('../../../src/renderer/stores/layout.svelte').LayoutEntry

const chart = (id: string, extra: object = {}) => ({ kind: 'pane', id, widget: 'chart', link: 0, state: { tf: 'D', ...extra } })
const page = (id: string, entry: unknown = { root: chart(`${id}-c`), docks: {} }, extra: Partial<SavedLayout> = {}): SavedLayout => ({
  id,
  name: { ja: id, en: id },
  entry,
  links: {},
  created: 1,
  updated: 1,
  ...extra,
})
/** 新しい版で作った、この版では開けないページ（知らないペインだけ） */
const future = (id: string) => page(id, { root: { kind: 'pane', id: `${id}-x`, widget: 'hologram', link: 0, state: {} }, docks: {} })
const paneIds = (e: unknown) => L.allPanes(e as Entry).map((p) => p.id)
const rootId = (e: unknown) => (e as Entry).root.id
const flush = async () => {
  L.saveLayout()
  await L.flushLayoutSave()
}

describe('読み込みの決まり（FR-L14, §5.4）', () => {
  it('開けるページが 0 枚なら、今のフリーのタブから ID が free のページを作り、表示する', () => {
    const doc = L.defaultDoc()
    doc.entries.free = { root: chart('mine') as never, docks: {} }
    const r = L.resolvePages(doc, [], 5)
    expect(r.created).toBe(true)
    expect(r.pages).toHaveLength(1)
    expect(r.pages[0]).toMatchObject({ id: 'free', name: { ja: 'フリー', en: 'Free' }, links: {}, created: 5 })
    expect(r.pages[0]!.shape).toBeUndefined()
    expect(rootId(r.pages[0]!.entry)).toBe('mine')
    expect(r.doc.page).toBe('free')
    expect(rootId(r.doc.entries.free)).toBe('mine')
  })
  it('何度通しても同じ結果になる（作ったページを読み直しても、もう作らない）', () => {
    const first = L.resolvePages(L.defaultDoc(), [])
    const again = L.resolvePages(JSON.parse(JSON.stringify(first.doc)), JSON.parse(JSON.stringify(first.pages)))
    expect(again.created).toBe(false)
    expect(again.pages).toEqual(first.pages)
    expect(again.doc.page).toBe(first.doc.page)
    expect(paneIds(again.doc.entries.free)).toEqual(paneIds(first.doc.entries.free))
  })
  it('名前付きのレイアウト（前の版）はそのままページ。layout.json のフリーのタブは採らない（正は layouts.json）', () => {
    const doc = L.defaultDoc()
    doc.entries.free = { root: chart('stale') as never, docks: {} }
    const r = L.resolvePages(doc, [page('a', undefined, { links: { '1': 'JP:7203' } }), page('b')])
    expect(r.created).toBe(false)
    expect(r.pages.map((p) => p.id)).toEqual(['a', 'b'])
    expect(r.pages[0]!.links).toEqual({ '1': 'JP:7203' }) // 前の版の links はそのまま持つ
    expect(r.doc.page).toBe('a')
    expect(rootId(r.doc.entries.free)).toBe('a-c')
  })
  it('表示中のページは doc.page。無い・開けないときは先頭の開けるページ', () => {
    expect(L.resolvePages({ ...L.defaultDoc(), page: 'b' }, [page('a'), page('b')]).doc.page).toBe('b')
    expect(L.resolvePages({ ...L.defaultDoc(), page: 'gone' }, [page('a'), page('b')]).doc.page).toBe('a')
    expect(L.resolvePages({ ...L.defaultDoc(), page: 'x' }, [future('x'), page('b')]).doc.page).toBe('b')
  })
  it('開けないページは隠して、中身のまま持つ（書き戻す）。数の判定は開けるページだけ', () => {
    const x = future('x')
    const r = L.resolvePages(L.defaultDoc(), [x, page('a')])
    expect(r.hidden).toBe(1)
    expect(r.pages[0]).toEqual(x)
    expect(L.pageOpenable(r.pages[0]!)).toBe(false)
    // 開けないページだけなら、0 枚として 1 枚作る（隠したページは残す）
    const only = L.resolvePages(L.defaultDoc(), [future('free')])
    expect(only.created).toBe(true)
    expect(only.pages.map((p) => p.id)).toEqual(['free', expect.stringMatching(/^p/)]) // free は使われているので別の ID
  })
  it('ページの ID が重なれば振り直し、ペインの ID はページとタブをまたいで一意にする', () => {
    const doc = L.defaultDoc()
    const tabPane = L.allPanes(doc.entries.mtf)[0]!.id
    const r = L.resolvePages(doc, [page('a', { root: chart(tabPane), docks: {} }), page('a', { root: chart(tabPane), docks: {} })])
    expect(new Set(r.pages.map((p) => p.id)).size).toBe(2)
    const all = [
      ...r.pages.flatMap((p) => paneIds(p.entry)),
      ...(['mtf', 'grid', 'screener', 'income', 'triple', 'market', 'holdings', 'folio'] as const).flatMap((k) =>
        paneIds(r.doc.entries[k]),
      ),
    ]
    expect(new Set(all).size).toBe(all.length)
    expect(paneIds(r.pages[0]!.entry)).toEqual([tabPane]) // ページが先（タブの側を振り直す）
  })
  it('古い保存（links あり・shape なし・リンクの銘柄）の normalizeEntry: 根が残らなければ開けない', () => {
    expect(L.normalizeEntry({ root: {} })).toBeNull()
    expect(L.normalizeEntry(null)).toBeNull()
    expect(L.normalizeEntry({ root: chart('c'), docks: {} })?.root.id).toBe('c')
  })
})

describe('写す・形（FR-L14, §3.4, §5.3）', () => {
  it('cloneEntry はペインと区切りの ID を振り直し、ドロワーへ移す前の位置（_home.sib）も新しい ID に直す', () => {
    const e = {
      root: { kind: 'split', id: 's', dir: 'row', sizes: [50, 50], children: [chart('a'), chart('b')] },
      docks: {
        left: {
          panes: [chart('d', { _home: { sib: 'a', dir: 'row', before: true, share: 30 } }), chart('e', { _home: { sib: 'gone' } })],
          active: 0,
          pinned: false,
          width: 600,
        },
      },
    } as unknown as Entry
    const c = L.cloneEntry(e)
    const ids = [rootId(c), ...paneIds(c)]
    expect(ids.some((x) => ['s', 'a', 'b', 'd', 'e'].includes(x))).toBe(false)
    expect(new Set(ids).size).toBe(ids.length)
    const [d, eh] = c.docks.left!.panes
    expect((d!.state._home as { sib: string }).sib).toBe(paneIds(c)[0]) // a の新しい ID
    expect(eh!.state._home).toBeUndefined() // 指す先が無い位置は捨てる
    expect(paneIds(e)).toEqual(['a', 'b', 'd', 'e']) // 元は変えない
  })
  it('shapeEntry: free:<形>・preset:<タブ>・無し（フリーのプリセット）', () => {
    expect(L.shapeEntry('free:empty').root.kind).toBe('pane')
    expect(L.allPanes(L.shapeEntry('free:quad'), false)).toHaveLength(4)
    expect(L.allPanes(L.shapeEntry('preset:mtf'), false).map((p) => p.widget)).toEqual(
      L.allPanes(L.presetEntry('mtf'), false).map((p) => p.widget),
    )
    const free = L.allPanes(L.presetEntry('free')).map((p) => p.widget)
    expect(L.allPanes(L.shapeEntry(undefined)).map((p) => p.widget)).toEqual(free)
    expect(L.allPanes(L.shapeEntry('preset:nope')).map((p) => p.widget)).toEqual(free)
  })
})

describe('ページの操作（FR-L14, §3.2, §3.5, §5.2）', () => {
  beforeEach(() => {
    L.useLoadedLayout({ ...L.defaultDoc(), active: 'mtf' }, [page('a'), future('x'), page('b'), page('c')])
    calls.length = 0
    fail = false
  })
  it('ページを替えると、作業用の写しを元のページに書き戻し、新しいページを写す。後始末をする', () => {
    L.setPage('a')
    const a0 = L.layout.doc.entries.free.root.id
    L.splitPane(a0, 'row', 'info')
    app.focus = a0
    app.maximized = a0
    L.layout.dockOpen = 'left'
    const keyA = L.viewKey()
    expect(L.setPage('b')).toBe(true)
    expect(L.viewKey()).not.toBe(keyA) // Workspace が木を作り直す
    expect(L.layout.doc.active).toBe('free')
    expect(L.layout.doc.page).toBe('b')
    expect(rootId(L.layout.doc.entries.free)).toBe('b-c')
    expect([app.focus, app.maximized, L.layout.dockOpen]).toEqual([null, null, null])
    // 分割は a のページに入り、b には効かない
    expect(L.allPanes(L.currentPage()!.entry as Entry).map((p) => p.widget)).toEqual(['chart'])
    L.setPage('a')
    expect(L.allPanes(L.layout.entry).map((p) => p.widget)).toEqual(['chart', 'info'])
  })
  it('開けないページ・無いページは開かない', () => {
    expect(L.setPage('x')).toBe(false)
    expect(L.setPage('nope')).toBe(false)
    expect(L.layout.doc.active).toBe('mtf')
  })
  it('一覧は開けるページだけ。並べ替えは開けるページの上下と入れ替え、隠したページの位置は動かさない', () => {
    expect(L.openablePages().map((p) => p.id)).toEqual(['a', 'b', 'c'])
    expect(L.movePage('a', 1)).toBe(true)
    expect(L.layout.pages.map((p) => p.id)).toEqual(['b', 'x', 'a', 'c'])
    expect(L.movePage('b', -1)).toBe(false)
  })
  it('今のタブを写してページに足す（形は写した元）。上限 30 枚・2MB を超えるなら足さない', () => {
    L.setPreset('mtf')
    const p = L.copyToPage('朝')
    expect(typeof p).toBe('object')
    const np = p as SavedLayout
    expect(np).toMatchObject({ name: { ja: '朝', en: '朝' }, shape: 'preset:mtf', links: {} })
    expect(paneIds(np.entry).some((id) => paneIds(L.layout.doc.entries.mtf).includes(id))).toBe(false)
    // ページを写すと、そのページの形を引き継ぐ
    L.setPage(np.id)
    expect((L.copyToPage('朝 2') as SavedLayout).shape).toBe('preset:mtf')
    while (L.openablePages().length < L.PAGES_MAX) L.addPage('n', L.presetEntry('free'))
    expect(L.addPage('over', L.presetEntry('free'))).toBe('limit')
    L.useLoadedLayout(L.defaultDoc(), [page('a')])
    const big = { root: chart('big', { blob: 'x'.repeat(L.PAGES_MAX_BYTES) }), docks: {} } as unknown as Entry
    expect(L.addPage('big', big)).toBe('size')
    expect(L.layout.pages).toHaveLength(1)
  })
  it('最後の開けるページは消さない。表示中のページを消すと、となりのページを写す', () => {
    L.setPage('b')
    expect(L.removePage('b')).toBe(true)
    expect(L.layout.doc.page).toBe('c')
    expect(rootId(L.layout.doc.entries.free)).toBe('c-c')
    expect(L.removePage('c')).toBe(true)
    expect(L.layout.doc.page).toBe('a')
    expect(L.removePage('a')).toBe(false) // 隠したページ x はあるが、開けるのは a だけ
    expect(L.removePage('x')).toBe(true) // 隠したページは消せる
  })
  it('名前を変える', () => {
    L.renamePage('a', '決算')
    expect(L.layout.pages[0]!.name).toEqual({ ja: '決算', en: '決算' })
  })
  it('entries を回る処理（allEntries）は、表示中でない開けるページにも効く。表示中のページは作業用の写しで', () => {
    L.setPage('a')
    const all = L.allEntries()
    expect(all).toHaveLength(9 + 2) // 9 つのタブ（free は a の写し）+ b・c
    const bPane = L.allPanes(all[9]!)[0]!
    L.patchState(bPane, { tf: 'W' })
    expect((L.layout.pages.find((p) => p.id === 'b')!.entry as Entry).root).toMatchObject({ state: { tf: 'W' } })
  })
  it('サイズを戻すの取り消し（Ctrl+Z）はページをまたがない', () => {
    L.useLoadedLayout(L.defaultDoc(), [page('a', L.presetEntry('mtf')), page('b', L.presetEntry('mtf'))])
    L.setPage('a')
    L.resetSizes()
    expect(L.canUndoReset()).toBe(true)
    L.setPage('b')
    expect(L.canUndoReset()).toBe(false)
  })
  it('初期状態に戻すは表示中のページだけを作ったときの形に。すべてのタブを戻すはページに触らない', () => {
    L.useLoadedLayout(L.defaultDoc(), [page('a', undefined, { shape: 'free:quad' }), page('b')])
    L.setPage('a')
    L.resetLayout()
    expect(L.allPanes(L.layout.entry, false)).toHaveLength(4)
    L.setPage('b')
    L.layout.doc.entries.mtf = { root: chart('m') as never, docks: {} }
    L.resetAllLayouts()
    expect(rootId(L.layout.doc.entries.free)).toBe('b-c')
    expect(L.allPanes(L.layout.doc.entries.mtf, false).length).toBeGreaterThan(1)
  })
})

describe('保存（FR-L4, FR-L14, §5.2, §5.5, §5.6）', () => {
  beforeEach(() => {
    L.useLoadedLayout(L.defaultDoc(), [page('a'), page('b')])
    calls.length = 0
    fail = false
  })
  it('保存はページ（layouts）を先に、毎回送る。表示中のページは作業用の写しから写す', async () => {
    L.setPage('a')
    L.splitPane(L.layout.entry.root.id, 'col', 'info')
    await flush()
    expect(calls.map((c) => c.method)).toEqual(['user.saveLayouts', 'user.saveLayout'])
    const sent = (calls[0]!.params as { layouts: SavedLayout[] }).layouts
    expect(paneIds(sent[0]!.entry)).toHaveLength(2)
    expect(sent[0]!.updated).toBeGreaterThan(1)
    expect(sent[1]!.updated).toBe(1) // 変えていないページは updated を変えない
    expect((calls[1]!.params as { layout: { page: string } }).layout.page).toBe('a')
  })
  it('取り込みの間は保存を止め、読み直すと戻す', async () => {
    await L.suspendLayoutSave()
    calls.length = 0
    await flush()
    expect(calls).toEqual([])
    L.reloadPages([page('imported')])
    expect(L.layout.doc.page).toBe('imported')
    await L.flushLayoutSave()
    expect(calls.map((c) => c.method)).toEqual(['user.saveLayouts', 'user.saveLayout'])
  })
  it('読み直すと、フォーカス・最大化・ドロワーを空にする', () => {
    app.focus = 'x'
    app.maximized = 'x'
    L.layout.dockOpen = 'left'
    L.reloadPages([page('a')])
    expect([app.focus, app.maximized, L.layout.dockOpen]).toEqual([null, null, null])
  })
  it('保存の失敗は 1 回だけ知らせる', async () => {
    fail = true
    app.toasts = []
    await flush()
    await flush()
    expect(app.toasts.filter((x) => x.msg.includes('保存できません'))).toHaveLength(1)
  })
})

describe('メニューの操作（FR-L14, §3.2〜§3.4）', () => {
  beforeEach(() => {
    L.useLoadedLayout({ ...L.defaultDoc(), active: 'mtf' }, [page('a'), page('b', undefined, { shape: 'free:quad' }), page('c')])
  })
  it('消したページは Ctrl+Z で元の位置に、最後の変更まで戻る。表示中だったならまた表示する', () => {
    L.setPage('b')
    L.splitPane(L.layout.entry.root.id, 'row', 'info')
    expect(L.removePage('b')).toBe(true)
    expect(L.layout.doc.page).toBe('c')
    expect(L.canUndoRemovePage()).toBe(true)
    const back = L.undoRemovePage()!
    expect(back.id).toBe('b')
    expect(L.layout.pages.map((p) => p.id)).toEqual(['a', 'b', 'c'])
    expect(L.layout.doc.page).toBe('b')
    expect(L.allPanes(L.layout.entry).map((p) => p.widget)).toEqual(['chart', 'info'])
    expect(L.canUndoRemovePage()).toBe(false)
  })
  it('元に戻すは 1 つだけ: サイズを戻すとページの削除は同じ枠で、あとから行ったほうが残る。読み直しで消える', () => {
    L.setPage('a')
    L.removePage('c')
    L.resetSizes()
    expect(L.canUndoRemovePage()).toBe(false)
    expect(L.canUndoReset()).toBe(true)
    L.removePage('b')
    expect(L.canUndoReset()).toBe(false)
    expect(L.canUndoRemovePage()).toBe(true)
    L.reloadPages([page('a'), page('c')])
    expect(L.canUndoRemovePage()).toBe(false)
  })
  it('複製は中身（表示中なら作業用の写し）と形を写し、ペインの ID を振り直す', () => {
    L.setPage('b')
    L.splitPane(L.layout.entry.root.id, 'col', 'info')
    const d = L.duplicatePage('b', 'b2') as SavedLayout
    expect(d.shape).toBe('free:quad')
    expect(L.allPanes(d.entry as Entry).map((p) => p.widget)).toEqual(['chart', 'info'])
    expect(paneIds(d.entry).some((id) => paneIds(L.layout.entry).includes(id))).toBe(false)
    expect(L.duplicatePage('nope', 'x')).toBeNull()
  })
  it('メニューの行: ページ（番号は 9 まで）と操作。「今のタブを写して足す」はマイレイアウト以外のタブで', async () => {
    const { menuRows } = await import('../../../src/renderer/lib/pages')
    const many = Array.from({ length: 11 }, (_, i) => page(`p${i}`))
    const rows = menuRows(many, 'mtf')
    expect(rows.filter((r) => r.kind === 'page').map((r) => (r as { n: number | null }).n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, null, null])
    expect(rows.slice(11).map((r) => r.kind)).toEqual(['new', 'duplicate', 'rename', 'copyTab', 'delete'])
    expect(menuRows(many, 'free').some((r) => r.kind === 'copyTab')).toBe(false)
  })
  it('コマンドバーの項目は、開けるページごとに「マイレイアウト: <名前> を開く」', async () => {
    const { pageCommands } = await import('../../../src/renderer/lib/pages')
    L.useLoadedLayout(L.defaultDoc(), [page('a'), future('x')])
    const cs = pageCommands()
    expect(cs.map((c) => c.label)).toEqual(['マイレイアウト: a を開く'])
    cs[0]!.run()
    expect(L.layout.doc.active).toBe('free')
  })
})

describe('サイズを元に戻す（FR-L9, FR-L14 §3.5）', () => {
  const sizes = () => (L.layout.entry.root as { sizes: number[] }).sizes
  it('タブを写したページは、写した元のタブの比率に戻る', () => {
    L.useLoadedLayout(L.defaultDoc(), [page('m', L.presetEntry('mtf'), { shape: 'preset:mtf' })])
    L.setPage('m')
    ;(L.layout.entry.root as { sizes: number[] }).sizes = [50, 50]
    L.resetSizes()
    expect(sizes()).toEqual([30, 70])
    expect(L.sizesAtDefault()).toBe(true)
  })
  it('形の無い（前の版の）ページは、すべてのプリセットからいちばん似た区切りを探す', () => {
    L.useLoadedLayout(L.defaultDoc(), [page('i', L.presetEntry('income'))])
    L.setPage('i')
    ;(L.layout.entry.root as { sizes: number[] }).sizes = [50, 50]
    L.resetSizes()
    expect(sizes()).toEqual([40, 60]) // フリーのプリセットだけなら等分のまま
  })
  it('フリーの形のページは、フリーのプリセットから（似た区切りが無ければ等分）', () => {
    L.useLoadedLayout(L.defaultDoc(), [page('i', L.presetEntry('income'), { shape: 'free:empty' })])
    L.setPage('i')
    ;(L.layout.entry.root as { sizes: number[] }).sizes = [30, 70]
    L.resetSizes()
    expect(sizes()).toEqual([50, 50])
  })
})
