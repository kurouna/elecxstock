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
  it('サイズを戻すは木の位置でなく中身で比率を探す（左の列をドロワーに移したあとも、日足と週足・月足の区切りの比率に戻る）', () => {
    L.setPreset('mtf')
    L.resetLayout()
    const col = (L.layout.entry.root as { children: { kind: string }[] }).children[0]!
    // 左の列（ウォッチリスト・スクリーナー）の 2 枚をドロワーへ移すと、根は日足 / 週足・月足の区切りになる
    for (const p of L.allPanes({ root: col as never, docks: {} })) L.moveToDock(p.id, 'left')
    const root = L.layout.entry.root as { dir: string; sizes: number[] }
    expect(root.dir).toBe('col')
    root.sizes = [20, 80]
    L.resetSizes()
    expect(root.sizes).toEqual([50, 50])
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
    const [a, b] = L.allPanes(L.layout.entry, false).filter((p) => p.link === L.MAIN_LINK)
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

describe('スクリーナーのタブの初期の並び（§6.4 Screener・FR-L5・FR-SIM9）', () => {
  it('左から スクリーナー・銘柄情報・右の列（上は日足・下は配当シミュレータ）。すべてリンク 2', () => {
    type N = { kind: string; widget?: string; dir?: string; sizes?: number[]; link?: number; state?: { tf?: string }; children?: N[] }
    const root = L.presetEntry('screener').root as N
    expect(root.dir).toBe('row')
    expect(root.sizes).toEqual([26, 26, 48])
    const [scr, info, charts] = root.children!
    expect(scr!.widget).toBe('screener')
    expect(info!.widget).toBe('info')
    expect(charts!.dir).toBe('col')
    expect(charts!.sizes).toEqual([50, 50])
    expect(charts!.children!.map((c) => [c.widget, c.state?.tf])).toEqual([
      ['chart', 'D'],
      ['divsim', undefined],
    ])
    const panes = L.allPanes(L.presetEntry('screener'), false)
    expect(panes.every((p) => p.link === 2)).toBe(true)
    expect(L.PRESET_FOCUS.screener).toBe('screener')
  })
})

describe('MTF のタブの初期の並び（§6.4 MTF・FR-L5）', () => {
  it('左の列はウォッチリスト（上・お気に入り）とスクリーナー（下）、右は日足（上）と週足・月足（下）を 1:1。すべてリンク 2', () => {
    type N = { kind: string; widget?: string; dir?: string; sizes?: number[]; link?: number; state?: { tf?: string }; children?: N[] }
    const root = L.presetEntry('mtf').root as N
    expect(root.dir).toBe('row')
    const [left, right] = root.children!
    expect(left!.dir).toBe('col')
    expect(left!.children!.map((c) => c.widget)).toEqual(['watchlist', 'screener'])
    expect((left!.children![0] as { state?: { list?: string } }).state?.list).toBe('favorites')
    expect(right!.dir).toBe('col')
    expect(right!.sizes).toEqual([50, 50])
    const [day, lower] = right!.children!
    expect([day!.widget, day!.state?.tf]).toEqual(['chart', 'D'])
    expect(lower!.children!.map((c) => c.state?.tf)).toEqual(['W', 'M'])
    expect(L.allPanes(L.presetEntry('mtf'), false).every((p) => p.link === 2)).toBe(true)
  })
})

describe('すべてのタブのレイアウトを初期状態に戻す（FR-L10）', () => {
  /** ID を除いた形（ペインの種類・リンク・状態・区切りの向きと比率・ドロワー） */
  const shape = (n: unknown): unknown => JSON.parse(JSON.stringify(n, (k, v) => (k === 'id' ? undefined : v)))
  it('すべてのタブの並び・区切り・ドロワーを初期状態にし、表示中のタブとリンクの銘柄は変えない', () => {
    L.layout.doc = L.defaultDoc()
    L.setPreset('screener')
    L.layout.doc.links['1'] = 'JP:7203'
    // 2 つのタブを崩す（ペインを閉じる・区切りを動かす）
    for (const id of ['mtf', 'market'] as const) {
      const e = L.layout.doc.entries[id]!
      const p = L.allPanes(e, false).at(-1)!
      L.layout.doc.active = id
      L.closePane(p.id)
      ;(e.root as { sizes?: number[] }).sizes = [10, 90]
    }
    L.layout.doc.active = 'screener'
    L.resetAllLayouts()
    for (const id of L.PRESET_IDS) expect(shape(L.layout.doc.entries[id]), id).toEqual(shape(L.presetEntry(id)))
    expect(L.layout.doc.active).toBe('screener')
    expect(L.layout.doc.links['1']).toBe('JP:7203')
  })
})

describe('リンク色の初期値はタブの並び（§6.4・FR-K1）', () => {
  // 色の番号はタブの並び（Ctrl+Shift+1〜8）で初めて出てくる順。探して見比べるタブ（スクリーナー・グリッド・MTF・トリプル・フリー）は
  // 同じ色を共有し、スクリーナーで選んだ銘柄が MTF などのチャートにも出る
  const links = (id: Parameters<typeof L.presetEntry>[0]) => {
    const e = L.presetEntry(id)
    const ps = [...L.allPanes(e, false), ...(e.docks.left?.panes ?? [])]
    return [...new Set(ps.map((p) => p.link).filter((n) => n > 0))]
  }
  it('マーケット 1・探して見比べるタブ 2・配当 3・保有とポートフォリオ 4', () => {
    expect(L.PRESET_IDS.map((id) => [id, links(id)])).toEqual([
      ['market', [1]],
      ['screener', [2]],
      ['grid', [2]],
      ['mtf', [2]],
      ['triple', [2]],
      ['income', [3]],
      ['holdings', [4]],
      ['free', [2]],
      ['folio', [4]],
    ])
  })
  it('色の番号はタブの並びで初めて出てくる順（Ctrl+Shift+1・2 はタブの番号と同じ）', () => {
    const seen: number[] = []
    for (const id of L.PRESET_IDS) for (const n of links(id)) if (!seen.includes(n)) seen.push(n)
    expect(seen).toEqual([1, 2, 3, 4])
  })
  it('各色の最初の銘柄は、前の割り当てでそのタブに出ていた銘柄のまま', () => {
    expect(L.defaultDoc().links).toEqual({ '1': 'JP:8306', '2': 'JP:7203', '3': 'JP:2914', '4': 'JP:8951', '5': 'JP:3462' })
  })
})

describe('ポートフォリオのタブ（FR-PF1）', () => {
  it('前の版で保存したレイアウト（ポートフォリオのタブが無い）を読んでも、9 つ目のタブは初期の形で出る', () => {
    const d = L.defaultDoc()
    const old = JSON.parse(JSON.stringify({ ...d, entries: Object.fromEntries(Object.entries(d.entries).filter(([k]) => k !== 'folio')) }))
    const n = L.normalizeDoc(old)
    expect(L.PRESET_IDS.at(-1)).toBe('folio')
    const ps = L.allPanes(n.entries.folio, false)
    expect(ps.map((p) => p.widget)).toEqual(['folio', 'chart', 'info'])
    expect(ps.every((p) => p.link === 4)).toBe(true)
    expect(L.PRESET_FOCUS.folio).toBe('folio')
    // 右の列はチャート 2 : 銘柄情報 3（銘柄情報の配当・保有を広く見せる）
    type Split = { sizes: number[]; children: unknown[] }
    const root = n.entries.folio.root as unknown as Split
    expect(root.sizes).toEqual([62, 38])
    expect((root.children[1] as Split).sizes).toEqual([40, 60])
  })
})

describe('最大化したペインを閉じる・ドロワーへ移す（FR-L3）', () => {
  it('閉じたら最大化の状態も消す（残ると次の Esc が空振りし、サイズを戻すボタンが押せないまま）', async () => {
    const { app } = await import('../../../src/renderer/stores/app.svelte')
    L.layout.doc = L.defaultDoc()
    L.setPreset('mtf')
    const [a] = L.allPanes(L.layout.entry, false)
    app.maximized = a!.id
    L.closePane(a!.id)
    expect(app.maximized).toBeNull()
  })
  it('ドロワーへ移したら最大化の状態も消す', async () => {
    const { app } = await import('../../../src/renderer/stores/app.svelte')
    L.layout.doc = L.defaultDoc()
    L.setPreset('mtf')
    const [a] = L.allPanes(L.layout.entry, false)
    app.maximized = a!.id
    L.moveToDock(a!.id, 'left')
    expect(app.maximized).toBeNull()
  })
  it('ほかのペインを閉じても最大化は解かない', async () => {
    const { app } = await import('../../../src/renderer/stores/app.svelte')
    L.layout.doc = L.defaultDoc()
    L.setPreset('mtf')
    const [a, b] = L.allPanes(L.layout.entry, false)
    app.maximized = a!.id
    L.closePane(b!.id)
    expect(app.maximized).toBe(a!.id)
  })
})

describe('最大化したままレイアウトを初期状態に戻す（FR-L3・FR-L10）', () => {
  it('このタブを戻すと最大化の状態も消す（ペインが無くなり、次の Esc が空振りする）', async () => {
    const { app } = await import('../../../src/renderer/stores/app.svelte')
    L.layout.doc = L.defaultDoc()
    L.setPreset('mtf')
    app.maximized = L.allPanes(L.layout.entry, false)[0]!.id
    L.resetLayout()
    expect(app.maximized).toBeNull()
  })
  it('すべてのタブを戻すと最大化の状態も消す', async () => {
    const { app } = await import('../../../src/renderer/stores/app.svelte')
    L.layout.doc = L.defaultDoc()
    L.setPreset('mtf')
    app.maximized = L.allPanes(L.layout.entry, false)[0]!.id
    L.resetAllLayouts()
    expect(app.maximized).toBeNull()
  })
})

describe('マイレイアウトを表示中にすべてのタブを戻す（FR-L10・FR-L14）', () => {
  it('マイレイアウトのページは書き換えないので、最大化もそのまま', async () => {
    const { app } = await import('../../../src/renderer/stores/app.svelte')
    L.layout.doc = L.defaultDoc()
    L.setPreset('free')
    const id = L.allPanes(L.layout.entry, false)[0]!.id
    app.maximized = id
    L.resetAllLayouts()
    expect(app.maximized).toBe(id)
  })
})
