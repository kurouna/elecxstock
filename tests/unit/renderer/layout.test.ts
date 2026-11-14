// レイアウトの木の操作（FR-L1, L6, L9, L10）。window が要るので、Core の単体テストとは別に最小の窓口だけ用意する。
import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { elecxstock: { call: async () => undefined, on: () => () => {}, prioritize: () => {} } })

const L = await import('../../../src/renderer/stores/layout.svelte')

describe('レイアウト', () => {
  it('壊れた・重複した ID の木を正規化する', () => {
    const d = L.defaultDoc()
    const raw = JSON.parse(JSON.stringify(d))
    raw.entries.mtf.root.children[1].id = raw.entries.mtf.root.children[0].id // ID の重複
    raw.entries.grid = { root: { kind: 'pane', widget: 'nope' } } // 知らないウィジェット
    const n = L.normalizeDoc(raw)
    const ids = L.allPanes(n.entries.mtf).map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(n.entries.grid.root.kind).toBe('pane') // 既定に戻る
    expect(L.normalizeDoc(null).active).toBe('mtf')
  })
  it('分割・閉じる・サイズのリセットと取り消し', () => {
    L.layout.doc = L.defaultDoc()
    const first = L.allPanes(L.layout.entry, false)[0]!
    const id = L.splitPane(first.id, 'col', 'info')!
    expect(L.findPane(id)?.widget).toBe('info')
    L.closePane(id)
    expect(L.findPane(id)).toBeUndefined()
    const root = L.layout.entry.root as { sizes: number[] }
    root.sizes = [50, 50]
    L.resetSizes()
    expect(root.sizes).toEqual([30, 70])
    expect(L.undoResetSizes()).toBe(true)
    expect(root.sizes).toEqual([50, 50])
    L.resetLayout()
    expect((L.layout.entry.root as { sizes: number[] }).sizes).toEqual([30, 70])
  })
  it('サイズを戻すは木の位置でなく中身で比率を探す（左の列をドロワーに移したあとも日足は大きいまま）', () => {
    L.setPreset('mtf')
    L.resetLayout()
    const col = (L.layout.entry.root as { children: { kind: string }[] }).children[0]!
    // 左の列（ウォッチリスト・スクリーナー）の 2 枚をドロワーへ移すと、根は日足 / 週足・月足の区切りになる
    for (const p of L.allPanes({ root: col as never, docks: {} })) L.moveToDock(p.id, 'left')
    const root = L.layout.entry.root as { dir: string; sizes: number[] }
    expect(root.dir).toBe('col')
    root.sizes = [20, 80]
    L.resetSizes()
    expect(root.sizes).toEqual([62, 38])
    expect(L.sizesAtDefault()).toBe(true)
  })
  it('前の版の形（左の列がウォッチリストだけ）でも、いちばん似た区切りの比率に戻る', () => {
    L.setPreset('mtf')
    L.resetLayout()
    const root = L.layout.entry.root as { children: { kind: string; id: string }[]; sizes: number[] }
    const scr = L.allPanes(L.layout.entry, false).find((p) => p.widget === 'screener')!
    L.closePane(scr.id)
    root.sizes = [50, 50]
    L.resetSizes()
    expect((L.layout.entry.root as { sizes: number[] }).sizes).toEqual([30, 70])
  })
  it('区切り線をキーで動かす（Alt+Shift+矢印）', () => {
    L.layout.doc = L.defaultDoc()
    const wl = L.allPanes(L.layout.entry, false)[0]!
    L.nudgeDivider(wl.id, 'right')
    expect((L.layout.entry.root as { sizes: number[] }).sizes[0]).toBeGreaterThan(26)
  })
})

describe('ペインの移動とドロワー（FR-L2, DR6）', () => {
  it('タイトルのドラッグ: 端に落とすと分割、真ん中で入れ替え', () => {
    L.layout.doc = L.defaultDoc()
    const [wl, d] = L.allPanes(L.layout.entry, false)
    expect(L.movePane(wl!.id, d!.id, 'bottom')).toBe(true)
    const ids = L.allPanes(L.layout.entry, false).map((p) => p.id)
    expect(ids.indexOf(wl!.id)).toBe(ids.indexOf(d!.id) + 1)
    expect(L.movePane(wl!.id, wl!.id, 'left')).toBe(false)
  })
  it('ペインを右のドロワーへ移し、本体に戻す', () => {
    L.layout.doc = L.defaultDoc()
    const p = L.allPanes(L.layout.entry, false)[1]!
    expect(L.moveToDock(p.id, 'right')).toBe(true)
    expect(L.dockOf(p.id)).toBe('right')
    expect(L.moveFromDock(p.id)).toBe(true)
    expect(L.dockOf(p.id)).toBeNull()
    expect(L.layout.entry.docks.right).toBeUndefined()
  })
  it('右のドロワーと新しいペインの種類も正規化で残る', () => {
    const d = L.defaultDoc()
    d.entries.market.docks.right = {
      panes: [{ kind: 'pane', id: 'pf', widget: 'portfolio', link: 4, state: {} }],
      active: 0,
      pinned: false,
      width: 600,
    }
    const n = L.normalizeDoc(JSON.parse(JSON.stringify(d)))
    expect(n.entries.market.docks.right?.panes[0]?.widget).toBe('portfolio')
    expect(L.allPanes(n.entries.market).map((p) => p.widget)).toContain('heatmap')
    expect(L.allPanes(n.entries.holdings).map((p) => p.widget)).toEqual(['portfolio', 'chart', 'info'])
  })
  it('銘柄を選ぶ一覧はどのタブも左の列か左のドロワーにあり、右のドロワーは使わない（FR-L12）', () => {
    const LISTS = ['watchlist', 'screener', 'ranking', 'divcal', 'portfolio']
    for (const id of L.PRESET_IDS) {
      const e = L.presetEntry(id)
      expect(e.docks.right, id).toBeUndefined()
      const left = e.docks.left ? e.docks.left.panes : e.root.kind === 'split' ? L.allPanes({ root: e.root.children[0]!, docks: {} }) : []
      const lists = L.allPanes(e).filter((p) => LISTS.includes(p.widget))
      // 一覧はすべて左（左のドロワーか、いちばん左の列）にある
      for (const p of lists)
        expect(
          left.map((x) => x.id),
          `${id}: ${p.widget}`,
        ).toContain(p.id)
      // ウォッチリストがあるタブは、それが左の一番上
      if (left.some((p) => p.widget === 'watchlist')) expect(left[0]?.widget, id).toBe('watchlist')
    }
  })
})

describe('画面の外側の端へ移す（FR-L2）', () => {
  type S = { kind: string; dir?: string; sizes?: number[]; children?: { kind: string; id: string }[] }
  const fresh = () => {
    L.layout.doc = L.defaultDoc()
    L.setPreset('free')
    L.resetLayout()
  }
  it('一番右の列が上下に分かれていても、右端に新しい列を足す（大きさは等分）', () => {
    fresh()
    const right = (L.layout.entry.root as S).children![1] as S
    const top = right.children![0]!.id
    expect(L.moveToEdge(top, 'right')).toBe(true)
    const root = L.layout.entry.root as S
    expect(root.dir).toBe('row')
    expect(root.children!.map((c) => c.kind)).toEqual(['pane', 'split', 'pane'])
    expect(root.children![2]!.id).toBe(top)
    expect(root.sizes!.map((v) => Math.round(v))).toEqual([33, 33, 33])
    expect((root.children![1] as S).children).toHaveLength(2)
  })
  it('下端は全幅の新しい行（いちばん外の区切りを包む）。左端は先頭に足す', () => {
    fresh()
    const first = L.allPanes(L.layout.entry, false)[0]!.id
    expect(L.moveToEdge(first, 'bottom')).toBe(true)
    // 左の 1 枚が抜けると根は右の列（縦の区切り）だけになるので、その最後に全幅の行として足す
    let root = L.layout.entry.root as S
    expect(root.dir).toBe('col')
    expect(root.children!.at(-1)!.id).toBe(first)
    expect(root.children).toHaveLength(4)
    expect(root.sizes!.at(-1)).toBe(25) // 4 行なら新しい行は 1/4、残りは元の比率のまま縮める
    expect(root.sizes!.reduce((a, b) => a + b, 0)).toBeCloseTo(100)
    // 根が横の区切りのときに下端へ移すと、根を包んで全幅の行にする
    fresh()
    const top = ((L.layout.entry.root as S).children![1] as S).children![0]!.id
    expect(L.moveToEdge(top, 'bottom')).toBe(true)
    root = L.layout.entry.root as S
    expect(root.dir).toBe('col')
    expect(root.sizes).toEqual([50, 50])
    expect((root.children![0] as S).dir).toBe('row')
    expect(root.children![1]!.id).toBe(top)
    const other = L.allPanes(L.layout.entry, false)[0]!.id
    expect(L.moveToEdge(other, 'top')).toBe(true)
    root = L.layout.entry.root as S
    expect(root.children![0]!.id).toBe(other)
    expect(root.children).toHaveLength(3)
  })
  it('すでにその端にあるペイン・本体の最後の 1 枚は動かさない。ドロワーのペインは移せる', () => {
    fresh()
    const left = L.allPanes(L.layout.entry, false)[0]!.id
    expect(L.moveToEdge(left, 'left')).toBe(false)
    const wl = L.layout.entry.docks.left!.panes[0]!.id
    expect(L.moveToEdge(wl, 'right')).toBe(true)
    expect(L.dockOf(wl)).toBeNull()
    expect((L.layout.entry.root as S).children!.at(-1)!.id).toBe(wl)
    L.layout.doc = L.defaultDoc()
    L.setPreset('grid')
    L.resetLayout()
    const only = L.allPanes(L.layout.entry, false)[0]!.id
    expect(L.moveToEdge(only, 'right')).toBe(false)
  })
})

describe('フリーのレイアウトとペインごとの銘柄（FR-L11）', () => {
  it('フリーは 2 列（左 1 枚・右 3 枚）で、リンク色の無いチャートはそれぞれの銘柄を持つ', () => {
    L.layout.doc = L.defaultDoc()
    L.layout.doc.active = 'free'
    const panes = L.allPanes(L.layout.entry, false)
    expect(panes.map((p) => L.paneSymbol(p))).toEqual(['JP:7203', 'JP:8306', 'JP:8058', 'JP:9434'])
    const root = L.layout.entry.root as { dir: string; children: { kind: string; children?: unknown[] }[] }
    expect(root.dir).toBe('row')
    expect(root.children[1]!.children).toHaveLength(3)
  })
  it('リンク色の無いペインの銘柄はそのペインだけ変わり、分割すると引き継ぐ', () => {
    L.layout.doc = L.defaultDoc()
    L.layout.doc.active = 'free'
    const [a, b] = L.allPanes(L.layout.entry, false)
    L.setPaneSymbol(a!, 'JP:8001')
    expect(L.paneSymbol(a!)).toBe('JP:8001')
    expect(L.paneSymbol(b!)).toBe('JP:8306')
    const id = L.splitPane(a!.id, 'col')!
    expect(L.paneSymbol(L.findPane(id)!)).toBe('JP:8001')
  })
  it('リンク色のあるペインはグループの銘柄を共有する', () => {
    L.layout.doc = L.defaultDoc()
    const [a, b] = L.allPanes(L.layout.entry, false).filter((p) => p.link === 1)
    L.setPaneSymbol(a!, 'JP:2914')
    expect(L.paneSymbol(b!)).toBe('JP:2914')
  })
})

describe('種類の変更（レビューの修正）', () => {
  it('リンク色の無いペインは、種類を変えても自分の銘柄を引き継ぐ', () => {
    L.layout.doc = L.defaultDoc()
    L.setPreset('free')
    L.resetLayout()
    const own = L.allPanes(L.layout.entry, false).find((p) => p.link === 0)!
    const sym = own.state.sym
    expect(sym).toBeTruthy()
    L.changeWidget(own.id, 'info')
    expect(L.findPane(own.id)?.widget).toBe('info')
    expect(L.findPane(own.id)?.state.sym).toBe(sym)
  })
})

describe('フリー N（マルチモニタ）', () => {
  it('初期の形と前回の配置。置けるのはチャートを並べるペインだけ、ドロワーは持たない', () => {
    const g = L.freeDoc(null, 'free2', null)
    expect(g.active).toBe('free')
    expect(L.allPanes(g.entries.free).map((p) => p.widget)).toEqual(['grid'])
    expect(L.allPanes(L.freeDoc(null, 'free2', 'quad').entries.free).map((p) => [p.widget, p.link])).toEqual([
      ['chart', 0],
      ['chart', 0],
      ['chart', 0],
      ['chart', 0],
    ])
    expect(L.allPanes(L.freeDoc(null, 'free2', 'detail').entries.free).map((p) => p.widget)).toEqual(['mtf', 'info'])
    // 前回の配置: 一覧のペインやドロワーが紛れていたら、チャートにしてドロワーを外す
    const saved = {
      windows: {
        free2: {
          root: {
            kind: 'split',
            id: 's',
            dir: 'row',
            sizes: [50, 50],
            children: [
              { kind: 'pane', id: 'a', widget: 'watchlist', link: 1, state: {} },
              { kind: 'pane', id: 'b', widget: 'mtf', link: 0, state: {} },
            ],
          },
          docks: {
            left: { panes: [{ kind: 'pane', id: 'd', widget: 'screener', link: 1, state: {} }], active: 0, pinned: false, width: 600 },
          },
        },
      },
    }
    const d = L.freeDoc(saved, 'free2', null)
    expect(L.allPanes(d.entries.free, false).map((p) => p.widget)).toEqual(['chart', 'mtf'])
    expect(d.entries.free.docks).toEqual({})
    // 形を選んで開いたら、前回の配置より形が勝つ
    expect(L.allPanes(L.freeDoc(saved, 'free2', 'empty').entries.free).map((p) => p.widget)).toEqual(['chart'])
  })
})
