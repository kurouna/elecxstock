// レイアウト（§6.1, FR-L1〜L10, FR-DR1〜DR5）。木構造の変更はすべてこのモジュールの関数で行う（FR-L6）。
// 今のレイアウトは作業に追従して自動保存する（FR-L4）。プリセットの初期値は残し、FR-L9 / L10 で戻せる。
import type { InstrumentId } from '@shared/types'
import { FREE_WIDGETS, IS_FREE, SHAPE, SLOT } from '../lib/windowSlot'
import { app, rpc } from './app.svelte'

export type WidgetId =
  | 'watchlist'
  | 'chart'
  | 'mtf'
  | 'info'
  | 'screener'
  | 'grid'
  | 'jobs'
  | 'divcal'
  | 'portfolio'
  | 'heatmap'
  | 'ranking'
  | 'market'
  | 'board'
  | 'breadth'
  | 'folio'
export const WIDGETS: WidgetId[] = [
  'chart',
  'mtf',
  'watchlist',
  'screener',
  'info',
  'grid',
  'divcal',
  'portfolio',
  'folio',
  'heatmap',
  'ranking',
  'board',
  'breadth',
  'market',
  'jobs',
]
export type DockSide = 'left' | 'right'
export interface PaneNode {
  kind: 'pane'
  id: string
  widget: WidgetId
  link: number
  state: Record<string, unknown>
}
export interface SplitNode {
  kind: 'split'
  id: string
  dir: 'row' | 'col'
  sizes: number[]
  children: LNode[]
}
export type LNode = PaneNode | SplitNode
export interface Dock {
  panes: PaneNode[]
  active: number
  pinned: boolean
  width: number
}
export interface LayoutEntry {
  root: LNode
  docks: { left?: Dock; right?: Dock }
}
export type PresetId = 'mtf' | 'grid' | 'screener' | 'income' | 'triple' | 'market' | 'free' | 'holdings' | 'folio'
/** タブの並び（Ctrl+Shift+1〜9 の順）: 市場全体 → 探す → 見比べる → 1 銘柄を深く → 配当 → 保有 → 自由に組む → 資産全体（後から足したので最後） */
export const PRESET_IDS: PresetId[] = ['market', 'screener', 'grid', 'mtf', 'triple', 'income', 'holdings', 'free', 'folio']
export interface LayoutDoc {
  version: 1
  active: PresetId
  entries: Record<PresetId, LayoutEntry>
  links: Record<string, InstrumentId>
}

let uid = 0
const nid = () => `n${Date.now().toString(36)}${(++uid).toString(36)}`
/**
 * リンク色の初期値はタブの並び（Ctrl+Shift+1〜9）で初めて出てくる順: マーケット 1・探して見比べるタブ 2・配当 3・保有とポートフォリオ 4。
 * 探して見比べるタブ（スクリーナー・グリッド・MTF・トリプル・フリー）は同じ色を共有し、スクリーナーで選んだ銘柄が MTF などのチャートにも出る
 */
export const MAIN_LINK = 2
const P = (widget: WidgetId, link = MAIN_LINK, state: Record<string, unknown> = {}): PaneNode => ({
  kind: 'pane',
  id: nid(),
  widget,
  link,
  state,
})
const R = (sizes: number[], ...children: LNode[]): SplitNode => ({ kind: 'split', id: nid(), dir: 'row', sizes, children })
const C = (sizes: number[], ...children: LNode[]): SplitNode => ({ kind: 'split', id: nid(), dir: 'col', sizes, children })

/**
 * プリセット（§6.4）。選ぶとこの初期状態から始まり、変更はそのプリセットの「今のレイアウト」になる。
 * 並べ方の決まり（FR-L12）: 銘柄を選ぶ一覧（ウォッチリスト・スクリーナー・そのタブの一覧）は、どのタブも**左の 1 列**に置き、
 * 上にウォッチリスト、下にスクリーナー（またはタブの一覧）。チャートと銘柄情報は右。
 * 画面いっぱいにチャートを見せるタブ（グリッド・フリー）は、同じ並びを**左のドロワー**に入れる。右のドロワーはプリセットでは使わない
 */
const DOCK_WIDTH = 620
const selectCol = (link: number, below: PaneNode = P('screener', link), split = [55, 45]) =>
  C(split, P('watchlist', link, { list: 'favorites' }), below)
const selectDock = (link: number, active: number): Dock => ({
  panes: [P('watchlist', link, { list: 'favorites' }), P('screener', link)],
  active,
  pinned: false,
  width: DOCK_WIDTH,
})
/** タブを開いたときに最初にフォーカスするペイン（無ければ木の最初のペイン） */
export const PRESET_FOCUS: Partial<Record<PresetId, WidgetId>> = { screener: 'screener', holdings: 'portfolio', folio: 'folio' }

export function presetEntry(id: PresetId): LayoutEntry {
  switch (id) {
    case 'mtf':
      // 左の列はウォッチリスト（お気に入り）とスクリーナー。右は日足（上）と週足・月足（下）を同じ高さで
      return {
        root: R(
          [30, 70],
          selectCol(MAIN_LINK),
          C(
            [50, 50],
            P('chart', MAIN_LINK, { tf: 'D' }),
            R([50, 50], P('chart', MAIN_LINK, { tf: 'W' }), P('chart', MAIN_LINK, { tf: 'M' })),
          ),
        ),
        docks: {},
      }
    case 'grid':
      // グリッドはスクリーナーの結果を並べることが多いので、ドロワーはスクリーナーを前に出す
      return { root: P('grid', MAIN_LINK, { src: 'live' }), docks: { left: selectDock(MAIN_LINK, 1) } }
    case 'screener':
      // スクリーナーが主役なので、左の列はスクリーナーだけ（ウォッチリストは置かない）。結果の行を動かすと、
      // となりの銘柄情報と右のチャート 2 枚（上下）が同じ銘柄を出す（リンク 2）
      return {
        root: R(
          [26, 26, 48],
          P('screener', MAIN_LINK),
          P('info', MAIN_LINK),
          C([50, 50], P('chart', MAIN_LINK, { tf: 'D' }), P('chart', MAIN_LINK, { tf: 'D' })),
        ),
        docks: {},
      }
    case 'income':
      // 高配当のウォッチリストと、下に配当カレンダー（このタブの一覧）
      return {
        root: R(
          [40, 60],
          C([45, 55], P('watchlist', 3, { list: 'income' }), P('divcal', 3)),
          C([55, 45], P('chart', 3, { tf: 'M' }), P('info', 3)),
        ),
        docks: {},
      }
    case 'triple':
      return {
        root: R(
          [30, 70],
          selectCol(MAIN_LINK),
          C(
            [64, 36],
            R([34, 33, 33], P('chart', MAIN_LINK, { tf: 'D' }), P('chart', MAIN_LINK, { tf: 'W' }), P('chart', MAIN_LINK, { tf: 'M' })),
            P('info', MAIN_LINK),
          ),
        ),
        docks: {},
      }
    case 'market':
      // §6.4 Market（P2）: 左の列にマーケット一覧（ウォッチリストの代わり。FR-L12, FR-MB5）とランキング（このタブの一覧）、
      // 右に heatmap・チャート、下に market-overview と騰落（FR-BR1）
      return {
        root: R(
          [30, 70],
          C([40, 60], P('board', 1), P('ranking', 1)),
          C([64, 36], R([60, 40], P('heatmap', 1), P('chart', 1, { tf: 'D' })), R([55, 45], P('market', 1), P('breadth', 1))),
        ),
        docks: {},
      }
    case 'free':
      // §6.4 フリー: 分割を重ねて自由に並べる。リンク色の無いチャートは、それぞれ自分の銘柄を持つ（FR-L11）。
      // 左のドロワーにウォッチリスト・スクリーナー（リンク 2）。左の大きいチャートはリンク 2 で一覧の選択に従い、右の 3 枚は独立
      return {
        root: R(
          [50, 50],
          P('chart', MAIN_LINK, { tf: 'D' }),
          C(
            [34, 33, 33],
            P('chart', 0, { tf: 'D', sym: 'JP:8306' }),
            P('chart', 0, { tf: 'D', sym: 'JP:8058' }),
            P('chart', 0, { tf: 'D', sym: 'JP:9434' }),
          ),
        ),
        docks: { left: selectDock(MAIN_LINK, 0) },
      }
    case 'holdings':
      // §6.4 保有（FR-H11）: 左に保有の一覧（このタブの一覧。列が多いので広め）、右にチャートと銘柄情報（リンク 4）
      return {
        root: R([58, 42], P('portfolio', 4), C([60, 40], P('chart', 4, { tf: 'D' }), P('info', 4))),
        docks: {},
      }
    case 'folio':
      // §6.4 ポートフォリオ（FR-PF1）: 左にダッシュボード、右にチャートと銘柄情報（保有のタブと同じリンク 4）
      return {
        root: R([62, 38], P('folio', 4), C([40, 60], P('chart', 4, { tf: 'D' }), P('info', 4))),
        docks: {},
      }
  }
}
export function defaultDoc(): LayoutDoc {
  return {
    version: 1,
    active: 'mtf',
    entries: Object.fromEntries(PRESET_IDS.map((p) => [p, presetEntry(p)])) as Record<PresetId, LayoutEntry>,
    links: { '1': 'JP:8306', '2': 'JP:7203', '3': 'JP:2914', '4': 'JP:8951', '5': 'JP:3462' },
  }
}
const fixDock = (fixNode: (n: unknown) => LNode | null, d: Dock | undefined): Dock | undefined => {
  if (!d || !Array.isArray(d.panes)) return undefined
  const panes = d.panes.map(fixNode).filter((x): x is PaneNode => x?.kind === 'pane')
  if (!panes.length) return undefined
  return {
    panes,
    active: Math.min(Math.max(0, d.active | 0), panes.length - 1),
    pinned: !!d.pinned,
    width: Math.min(1200, Math.max(280, d.width || DOCK_WIDTH)),
  }
}

/** ディスクから読んだ木を正規化する（形を確かめ、ID を一意にする。FR-L6） */
export function normalizeDoc(raw: unknown): LayoutDoc {
  const d = defaultDoc()
  if (!raw || typeof raw !== 'object') return d
  const o = raw as Partial<LayoutDoc>
  const seen = new Set<string>()
  const fixNode = (n: unknown): LNode | null => {
    if (!n || typeof n !== 'object') return null
    const x = n as LNode
    let id = typeof x.id === 'string' ? x.id : nid()
    if (seen.has(id)) id = nid()
    seen.add(id)
    if (x.kind === 'pane') {
      if (!(WIDGETS as string[]).includes(x.widget)) return null
      return {
        kind: 'pane',
        id,
        widget: x.widget,
        link: Number.isInteger(x.link) && x.link >= 0 && x.link <= 5 ? x.link : MAIN_LINK,
        state: x.state && typeof x.state === 'object' ? x.state : {},
      }
    }
    if (x.kind === 'split' && Array.isArray(x.children)) {
      const kids = x.children.map(fixNode).filter((k): k is LNode => !!k)
      if (!kids.length) return null
      if (kids.length === 1) return kids[0]!
      const sizes =
        Array.isArray(x.sizes) && x.sizes.length === kids.length && x.sizes.every((s) => s > 0)
          ? x.sizes
          : kids.map(() => 100 / kids.length)
      return { kind: 'split', id, dir: x.dir === 'col' ? 'col' : 'row', sizes, children: kids }
    }
    return null
  }
  for (const p of PRESET_IDS) {
    const e = o.entries?.[p]
    const root = e ? fixNode(e.root) : null
    if (!root) continue
    const docks: LayoutEntry['docks'] = {}
    const left = fixDock(fixNode, e?.docks?.left)
    const right = fixDock(fixNode, e?.docks?.right)
    if (left) docks.left = left
    if (right) docks.right = right
    d.entries[p] = { root, docks }
  }
  if (o.active && PRESET_IDS.includes(o.active)) d.active = o.active
  if (o.links && typeof o.links === 'object') d.links = { ...d.links, ...o.links }
  return d
}

/** 1 つのエントリ（保存したレイアウトなど）を正規化する */
export function normalizeEntry(raw: unknown): LayoutEntry | null {
  const doc = normalizeDoc({ version: 1, active: 'mtf', entries: { mtf: raw }, links: {} })
  return raw && (raw as LayoutEntry).root ? doc.entries.mtf : null
}

class LayoutState {
  doc = $state<LayoutDoc>(defaultDoc())
  /** 開いているドロワー（ピン留めしたものは別に開いたまま） */
  dockOpen = $state<DockSide | null>(null)
  get entry(): LayoutEntry {
    return this.doc.entries[this.doc.active]
  }
}
export const layout = new LayoutState()

let saveTimer: ReturnType<typeof setTimeout> | null = null
export function saveLayout(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(flushLayout, 400)
}
function flushLayout(): Promise<unknown> {
  saveTimer = null
  // フリー N は自分の配置だけを保存する（1 枚目のレイアウトに触らない。マルチモニタ）
  if (IS_FREE)
    return rpc('user.saveWindowLayout', { slot: SLOT as 'free2', entry: $state.snapshot(layout.doc.entries.free) }).catch(() => {})
  return rpc('user.saveLayout', { layout: $state.snapshot(layout.doc) }).catch(() => {})
}

// ---------------------------------------------------------------- フリー N（マルチモニタ、docs/design-multimonitor.md）
/**
 * フリー N の初期の形。どれもリンク色なし（それぞれ自分の銘柄）。あとからフリーと同じ操作で自由に組み替えられる
 * - grid: チャートグリッド 1 枚（このグリッドの銘柄、空から）。1 枚目から銘柄をドラッグして並べる
 * - quad: チャート 4 枚（2×2）・detail: マルチ時間軸 + 銘柄情報・empty: チャート 1 枚
 */
export function freeShape(shape: string | null): LayoutEntry {
  switch (shape) {
    case 'quad':
      return {
        root: R(
          [50, 50],
          C([50, 50], P('chart', 0, { tf: 'D', sym: 'JP:7203' }), P('chart', 0, { tf: 'D', sym: 'JP:8306' })),
          C([50, 50], P('chart', 0, { tf: 'D', sym: 'JP:8058' }), P('chart', 0, { tf: 'D', sym: 'JP:9432' })),
        ),
        docks: {},
      }
    case 'detail':
      return { root: R([62, 38], P('mtf', 0, { sym: 'JP:7203' }), P('info', 0, { sym: 'JP:7203' })), docks: {} }
    case 'empty':
      return { root: P('chart', 0, { tf: 'D', sym: 'JP:7203' }), docks: {} }
    default:
      return { root: P('grid', 0, { src: 'own', own: [], tf: 'D' }), docks: {} }
  }
}
/** フリー N のレイアウトを作る: 開くときに形を選んだらその形、無ければ前回の配置、それも無ければグリッド */
export function freeDoc(raw: unknown, slot: string, shape: string | null): LayoutDoc {
  const saved = (raw as { windows?: Record<string, unknown> } | null)?.windows?.[slot]
  const entry = shape ? freeShape(shape) : saved ? normalizeEntry(saved) : null
  const d = normalizeDoc({ version: 1, active: 'free', entries: { free: entry ?? freeShape('grid') }, links: {} })
  // 置けるのはチャートを並べるペインだけ（一覧は 1 枚目で）。古い保存に他の種類があればチャートにする
  for (const p of allPanes(d.entries.free)) if (!FREE_WIDGETS.includes(p.widget)) changeWidgetIn(p, 'chart')
  d.entries.free.docks = {}
  return d
}
function changeWidgetIn(p: PaneNode, widget: WidgetId): void {
  p.widget = widget
  p.state = widget === 'chart' ? { tf: 'D' } : {}
}
/** ほかのウィンドウから届いたリンク（R3）。保存し直したり送り返したりしない（こだまを防ぐ） */
export function applyRemoteLink(group: number, id: InstrumentId): void {
  if (!group || layout.doc.links[String(group)] === id) return
  layout.doc.links[String(group)] = id
  // 1 枚目はリンクを保存しておく（次の起動で同じ銘柄から）。フリー N はリンクを保存しない
  if (!IS_FREE) saveLayout()
}
/** 閉じる前に、遅らせている保存を確定させる */
export function flushLayoutSave(): Promise<unknown> {
  if (!saveTimer) return Promise.resolve()
  clearTimeout(saveTimer)
  return flushLayout()
}

// ---------------------------------------------------------------- queries
export function allPanes(e: LayoutEntry = layout.entry, withDock = true): PaneNode[] {
  const out: PaneNode[] = []
  const walk = (n: LNode) => (n.kind === 'pane' ? out.push(n) : n.children.forEach(walk))
  walk(e.root)
  if (withDock) for (const d of [e.docks.left, e.docks.right]) if (d) out.push(...d.panes)
  return out
}
export function findPane(id: string | null): PaneNode | undefined {
  if (!id) return undefined
  return allPanes().find((p) => p.id === id)
}
/** そのペインが入っているドロワー（本体なら null） */
export function dockOf(id: string | null | undefined): DockSide | null {
  if (!id) return null
  if (layout.entry.docks.left?.panes.some((p) => p.id === id)) return 'left'
  if (layout.entry.docks.right?.panes.some((p) => p.id === id)) return 'right'
  return null
}
export function inDock(id: string): boolean {
  return dockOf(id) != null
}
function parentOf(id: string, n: LNode = layout.entry.root): { parent: SplitNode; index: number } | null {
  if (n.kind === 'pane') return null
  const i = n.children.findIndex((c) => c.id === id)
  if (i >= 0) return { parent: n, index: i }
  for (const c of n.children) {
    const r = parentOf(id, c)
    if (r) return r
  }
  return null
}
function eachSplit(n: LNode, f: (s: SplitNode) => void): void {
  if (n.kind === 'split') {
    f(n)
    n.children.forEach((c) => eachSplit(c, f))
  }
}

// ---------------------------------------------------------------- ops
export function setPreset(p: PresetId): void {
  layout.doc.active = p
  layout.dockOpen = null
  app.maximized = null
  saveLayout()
}
/** ドロワーを開く・閉じる（ピン留め中は閉じない）。side を省くと開いているものを閉じる */
export function toggleDockOpen(open: boolean, side: DockSide | null = layout.dockOpen): void {
  if (!side) return
  if (!open && layout.entry.docks[side]?.pinned) return
  if (open) layout.dockOpen = side
  else if (layout.dockOpen === side) layout.dockOpen = null
}
/** リンクグループの銘柄を変える。一覧のペインは自分のリンク色をそのまま渡す（Ctrl+0 で外した一覧は 0 で、どこにも送らない） */
export function setLinkSymbol(group: number, id: InstrumentId): void {
  if (!group) return
  layout.doc.links[String(group)] = id
  saveLayout()
  // ほかのウィンドウの同じリンク色にも知らせる（R3、main のバス）
  if (typeof window !== 'undefined') window.elecxstock?.busPublish?.(`link:${group}`, id)
}
export function linkSymbol(group: number): InstrumentId | undefined {
  return layout.doc.links[String(group)]
}
/** ペインが表示する銘柄: リンク色があればそのグループの銘柄、無ければペイン自身の銘柄（FR-L11） */
export function paneSymbol(pane: PaneNode): InstrumentId | undefined {
  if (pane.link) return linkSymbol(pane.link)
  return pane.state.sym as InstrumentId | undefined
}
/** ペインの銘柄を変える。リンク色があればグループ全体、無ければそのペインだけ */
export function setPaneSymbol(pane: PaneNode, id: InstrumentId): void {
  if (pane.link) setLinkSymbol(pane.link, id)
  else patchState(pane, { sym: id })
}
export function patchState(pane: PaneNode, patch: Record<string, unknown>): void {
  pane.state = { ...pane.state, ...patch }
  saveLayout()
}
export function setSizes(split: SplitNode, sizes: number[]): void {
  split.sizes = sizes
  saveLayout()
}
/** Alt+Shift+矢印: フォーカス中ペインの境界を 1 段動かす（§6.5.2） */
export function nudgeDivider(paneId: string, dir: 'left' | 'right' | 'up' | 'down'): void {
  let child = paneId
  for (;;) {
    const p = parentOf(child)
    if (!p) return
    const want = dir === 'left' || dir === 'right' ? 'row' : 'col'
    if (p.parent.dir === want && p.parent.children.length > 1) {
      const { parent, index } = p
      const grow = dir === 'right' || dir === 'down'
      const j = index < parent.children.length - 1 ? index + 1 : index - 1
      const total = parent.sizes[index]! + parent.sizes[j]!
      const d = total * 0.04 * (grow === j > index ? 1 : -1)
      if (parent.sizes[index]! + d < total * 0.08 || parent.sizes[j]! - d < total * 0.08) return
      const s = [...parent.sizes]
      s[index]! += d
      s[j]! -= d
      setSizes(parent, s)
      return
    }
    child = p.parent.id
  }
}
interface SizeSnap {
  preset: PresetId
  splits: number[][]
  dock?: number
  dockRight?: number
}
let undoSnap: SizeSnap | null = null
let undoTimer: ReturnType<typeof setTimeout> | null = null
function snapshotSizes(e: LayoutEntry): SizeSnap {
  const splits: number[][] = []
  eachSplit(e.root, (s) => splits.push([...s.sizes]))
  return {
    preset: layout.doc.active,
    splits,
    ...(e.docks.left ? { dock: e.docks.left.width } : {}),
    ...(e.docks.right ? { dockRight: e.docks.right.width } : {}),
  }
}
/** 区切りの子ごとの中のペイン（種類・時間軸）。木の位置ではなく中身で既定の比率を探すため */
function childKeys(s: SplitNode): string[][] {
  const panes = (n: LNode): string[] =>
    n.kind === 'pane' ? [`${n.widget}${typeof n.state.tf === 'string' ? `:${n.state.tf}` : ''}`] : n.children.flatMap(panes)
  return s.children.map((c) => panes(c).sort())
}
/** 2 つの区切りの似ている度合い（0〜1）。向きと子の数が違えば 0。子ごとに中のペインの重なり（Jaccard）を平均する */
function similarity(a: SplitNode, b: SplitNode): number {
  if (a.dir !== b.dir || a.children.length !== b.children.length) return 0
  const ka = childKeys(a)
  const kb = childKeys(b)
  let sum = 0
  ka.forEach((x, i) => {
    const y = kb[i]!
    const inter = x.filter((v) => y.includes(v)).length
    const union = new Set([...x, ...y]).size
    sum += union ? inter / union : 0
  })
  return sum / ka.length
}
/**
 * 今の木の区切りごとの既定の比率（FR-L9）。プリセットのうち中身がいちばん似ている区切り（向き・子の数が同じで、
 * 子の中のペインが重なるもの）の比率を使い、似たものが無ければ等分。ペインをドロワーに移したり、前の版で保存した
 * レイアウトで形が違っても、残った区切り（例: 日足 / 週足・月足）は元の比率に戻る
 */
function defaultSizesOf(root: LNode, preset: LayoutEntry): Map<SplitNode, number[]> {
  const cands: SplitNode[] = []
  eachSplit(preset.root, (s) => cands.push(s))
  const out = new Map<SplitNode, number[]>()
  eachSplit(root, (s) => {
    let best: SplitNode | null = null
    let bs = 0
    for (const c of cands) {
      const v = similarity(s, c)
      if (v > bs) {
        bs = v
        best = c
      }
    }
    out.set(s, best ? [...best.sizes] : s.sizes.map(() => 100 / s.sizes.length))
  })
  return out
}
/** サイズを元に戻す（FR-L9）。並び・中身は変えない。10 秒間は元に戻せる */
export function resetSizes(): boolean {
  const e = layout.entry
  const preset = presetEntry(layout.doc.active)
  const target = defaultSizesOf(e.root, preset)
  undoSnap = snapshotSizes(e)
  eachSplit(e.root, (s) => {
    s.sizes = [...target.get(s)!]
  })
  if (e.docks.left && preset.docks.left) e.docks.left.width = preset.docks.left.width
  if (e.docks.right && preset.docks.right) e.docks.right.width = preset.docks.right.width
  saveLayout()
  if (undoTimer) clearTimeout(undoTimer)
  undoTimer = setTimeout(() => (undoSnap = null), 10_000)
  return true
}
/** 区切りとドロワーの幅が既定のままか（「サイズを戻す」を押しても変わらないとき true） */
export function sizesAtDefault(): boolean {
  const e = layout.entry
  const preset = presetEntry(layout.doc.active)
  const target = defaultSizesOf(e.root, preset)
  let same = true
  eachSplit(e.root, (x) => {
    const want = target.get(x)!
    const sum = x.sizes.reduce((a, b) => a + b, 0) || 1
    if (x.sizes.some((v, i) => Math.abs((v / sum) * 100 - want[i]!) > 0.5)) same = false
  })
  for (const side of ['left', 'right'] as const) {
    const d = e.docks[side]
    const p = preset.docks[side]
    if (d && p && Math.abs(d.width - p.width) > 1) same = false
  }
  return same
}
export function canUndoReset(): boolean {
  return !!undoSnap && undoSnap.preset === layout.doc.active
}
export function undoResetSizes(): boolean {
  if (!canUndoReset()) return false
  const snap = undoSnap!
  const e = layout.entry
  let k = 0
  eachSplit(e.root, (s) => {
    const t = snap.splits[k++]
    if (t && t.length === s.sizes.length) s.sizes = [...t]
  })
  if (e.docks.left && snap.dock) e.docks.left.width = snap.dock
  if (e.docks.right && snap.dockRight) e.docks.right.width = snap.dockRight
  undoSnap = null
  saveLayout()
  return true
}
/** レイアウトを初期状態に戻す（FR-L10。確認は呼ぶ側で行う） */
export function resetLayout(): void {
  layout.doc.entries[layout.doc.active] = IS_FREE ? freeShape(SHAPE) : presetEntry(layout.doc.active)
  app.focus = null
  saveLayout()
}
/**
 * すべてのタブ（プリセット）のレイアウトを初期状態に戻す（FR-L10）。表示中のタブ・リンクの銘柄・名前を付けたレイアウトは変えない。
 * 1 枚目だけ（フリー N はそれぞれの窓の配置なので、窓ごとに resetLayout で戻す）
 */
export function resetAllLayouts(): void {
  if (IS_FREE) return
  for (const id of PRESET_IDS) layout.doc.entries[id] = presetEntry(id)
  app.focus = null
  saveLayout()
}
/** 右・下に分割（Ctrl+Shift+E / O） */
export function splitPane(paneId: string, dir: 'row' | 'col', widget: WidgetId = 'chart'): string | null {
  if (inDock(paneId) || (IS_FREE && !FREE_WIDGETS.includes(widget))) return null
  const pane = findPane(paneId)
  if (!pane) return null
  const fresh = P(widget, pane.link, {
    ...(widget === 'chart' ? { tf: 'D' } : {}),
    ...(!pane.link && pane.state.sym ? { sym: pane.state.sym } : {}),
  })
  const pp = parentOf(paneId)
  if (pp && pp.parent.dir === dir) {
    const s = pp.parent.sizes[pp.index]! / 2
    pp.parent.children.splice(pp.index + 1, 0, fresh)
    pp.parent.sizes.splice(pp.index, 1, s, s)
  } else {
    const node: SplitNode = { kind: 'split', id: nid(), dir, sizes: [50, 50], children: [pane, fresh] }
    if (pp) pp.parent.children[pp.index] = node
    else layout.entry.root = node
  }
  saveLayout()
  return fresh.id
}
/** ペインを閉じる（Ctrl+Shift+W）。最後の 1 枚は閉じない */
export function closePane(paneId: string): void {
  if (inDock(paneId)) return
  const pp = parentOf(paneId)
  if (!pp) return
  pp.parent.children.splice(pp.index, 1)
  pp.parent.sizes.splice(pp.index, 1)
  if (pp.parent.children.length === 1) {
    const only = pp.parent.children[0]!
    const gp = parentOf(pp.parent.id)
    if (gp) gp.parent.children[gp.index] = only
    else layout.entry.root = only
  }
  if (app.focus === paneId) app.focus = null
  saveLayout()
}
export function changeWidget(paneId: string, widget: WidgetId): void {
  const p = findPane(paneId)
  if (!p || (IS_FREE && !FREE_WIDGETS.includes(widget))) return
  p.widget = widget
  // リンク色の無いペインは自分の銘柄を持つので、種類を変えても引き継ぐ（FR-L11）
  const sym = !p.link ? p.state.sym : undefined
  p.state = { ...(widget === 'chart' ? { tf: 'D' } : {}), ...(sym ? { sym } : {}) }
  saveLayout()
}
/** 区切り線の比率を、プリセットの初期値に戻すときの元（保存レイアウトにも使う） */
export function snapshotEntry(): LayoutEntry {
  return JSON.parse(JSON.stringify($state.snapshot(layout.entry))) as LayoutEntry
}
/** 木からペインを抜く（閉じるのと同じ形の整理をする）。抜いたペインを返す */
function detach(paneId: string): PaneNode | null {
  const side = dockOf(paneId)
  if (side) {
    const d = layout.entry.docks[side]!
    const i = d.panes.findIndex((p) => p.id === paneId)
    const [p] = d.panes.splice(i, 1)
    if (!d.panes.length) {
      delete layout.entry.docks[side]
      if (layout.dockOpen === side) layout.dockOpen = null
    } else d.active = Math.min(d.active, d.panes.length - 1)
    return p ?? null
  }
  const pp = parentOf(paneId)
  if (!pp) return null // 本体の最後の 1 枚は抜かない
  const [p] = pp.parent.children.splice(pp.index, 1)
  pp.parent.sizes.splice(pp.index, 1)
  if (pp.parent.children.length === 1) {
    const only = pp.parent.children[0]!
    const gp = parentOf(pp.parent.id)
    if (gp) gp.parent.children[gp.index] = only
    else layout.entry.root = only
  }
  return (p as PaneNode) ?? null
}
/** ペインを別のペインの上下左右へ動かす（タイトルのドラッグ。FR-L2）。center は入れ替え */
export function movePane(srcId: string, targetId: string, where: 'left' | 'right' | 'top' | 'bottom' | 'center'): boolean {
  if (srcId === targetId) return false
  if (where === 'center') {
    if (inDock(srcId) || inDock(targetId)) return false
    swapPane(srcId, targetId)
    return true
  }
  if (inDock(targetId)) return false
  if (!inDock(srcId) && !parentOf(srcId)) return false
  const src = detach(srcId)
  if (!src) return false
  const dir = where === 'left' || where === 'right' ? 'row' : 'col'
  const before = where === 'left' || where === 'top'
  const target = findPane(targetId)!
  const pp = parentOf(targetId)
  if (pp && pp.parent.dir === dir) {
    const s = pp.parent.sizes[pp.index]! / 2
    pp.parent.children.splice(pp.index + (before ? 0 : 1), 0, src)
    pp.parent.sizes.splice(pp.index, 1, s, s)
  } else {
    const node: SplitNode = { kind: 'split', id: nid(), dir, sizes: [50, 50], children: before ? [src, target] : [target, src] }
    if (pp) pp.parent.children[pp.index] = node
    else layout.entry.root = node
  }
  saveLayout()
  return true
}
/**
 * ペインを画面（本体）の外側の端へ動かす（FR-L2）。右・左は新しい列、上・下は新しい行として、いちばん外の区切りに足す。
 * 一番右の列が上下に分かれているときでも、その右に新しい列を作れる（ペインの端に落とすと、そのペインの隣にしか入らないため）。
 * 新しい列・行の大きさは等分（n 列なら 1/(n+1)）。ドロワーのペインも移せる。本体の最後の 1 枚は動かさない
 */
export function moveToEdge(srcId: string, side: 'left' | 'right' | 'top' | 'bottom'): boolean {
  if (!inDock(srcId) && !parentOf(srcId)) return false
  const dir = side === 'left' || side === 'right' ? 'row' : 'col'
  const first = side === 'left' || side === 'top'
  const root = layout.entry.root
  // すでにその端にある（いちばん外の区切りの端の子）なら何もしない
  if (root.kind === 'split' && root.dir === dir && root.children[first ? 0 : root.children.length - 1]?.id === srcId) return false
  const src = detach(srcId)
  if (!src) return false
  const r = layout.entry.root
  if (r.kind === 'split' && r.dir === dir) {
    const n = r.children.length
    const share = 100 / (n + 1)
    const total = r.sizes.reduce((a, b) => a + b, 0) || 100
    r.sizes = r.sizes.map((v) => (v / total) * (100 - share))
    if (first) {
      r.children.unshift(src)
      r.sizes.unshift(share)
    } else {
      r.children.push(src)
      r.sizes.push(share)
    }
  } else {
    layout.entry.root = { kind: 'split', id: nid(), dir, sizes: [50, 50], children: first ? [src, r] : [r, src] }
  }
  saveLayout()
  return true
}
/** ペインをドロワーへ移す（FR-DR6）。ドロワーが無ければ作る */
export function moveToDock(paneId: string, side: DockSide): boolean {
  if (dockOf(paneId) === side) return false
  if (!inDock(paneId) && !parentOf(paneId)) return false // 本体の最後の 1 枚
  rememberHome(paneId)
  const p = detach(paneId)
  if (!p) return false
  const d = layout.entry.docks[side]
  if (d) {
    d.panes.push(p)
    d.active = d.panes.length - 1
  } else layout.entry.docks[side] = { panes: [p], active: 0, pinned: false, width: DOCK_WIDTH }
  saveLayout()
  return true
}
/** ドロワーへ移す前の位置（隣の要素・向き・前後・大きさ）。本体に戻すときにそこへ戻す */
interface Home {
  sib: string
  dir: 'row' | 'col'
  before: boolean
  share: number
}
function rememberHome(paneId: string): void {
  const pp = parentOf(paneId)
  const p = findPane(paneId)
  if (!pp || !p) return
  const ch = pp.parent.children
  const next = ch[pp.index + 1]
  const sib = next ?? ch[pp.index - 1]
  if (!sib) return
  const sum = pp.parent.sizes.reduce((a, b) => a + b, 0) || 1
  const home: Home = { sib: sib.id, dir: pp.parent.dir, before: !!next, share: (pp.parent.sizes[pp.index]! / sum) * 100 }
  p.state = { ...p.state, _home: home }
}
/** 覚えておいた位置へ戻す。隣の要素がもう無ければ false */
function placeHome(p: PaneNode, h: Home): boolean {
  const root = layout.entry.root
  const pp = parentOf(h.sib)
  const node = pp ? pp.parent.children[pp.index] : root.id === h.sib ? root : null
  if (!node) return false
  const share = Math.min(80, Math.max(10, h.share))
  if (pp && pp.parent.dir === h.dir) {
    const sum = pp.parent.sizes.reduce((a, b) => a + b, 0) || 1
    pp.parent.sizes = pp.parent.sizes.map((x) => (x / sum) * (100 - share))
    const at = pp.index + (h.before ? 0 : 1)
    pp.parent.children.splice(at, 0, p)
    pp.parent.sizes.splice(at, 0, share)
  } else {
    const split: SplitNode = {
      kind: 'split',
      id: nid(),
      dir: h.dir,
      sizes: h.before ? [share, 100 - share] : [100 - share, share],
      children: h.before ? [p, node] : [node, p],
    }
    if (pp) pp.parent.children[pp.index] = split
    else layout.entry.root = split
  }
  return true
}
/** ドロワーのペインを本体に戻す（FR-DR6）。ドロワーへ移す前の位置に戻し、分からなければ本体の右端に足す */
export function moveFromDock(paneId: string): boolean {
  if (!inDock(paneId)) return false
  const p = detach(paneId)
  if (!p) return false
  const { _home, ...rest } = p.state
  p.state = rest
  if (_home && placeHome(p, _home as Home)) {
    saveLayout()
    return true
  }
  const root = layout.entry.root
  if (root.kind === 'split' && root.dir === 'row') {
    const s = 100 / (root.children.length + 1)
    root.sizes = [...root.sizes.map((x) => x * (1 - s / 100)), s]
    root.children.push(p)
  } else layout.entry.root = { kind: 'split', id: nid(), dir: 'row', sizes: [70, 30], children: [root, p] }
  saveLayout()
  return true
}
/** 名前を付けて保存したレイアウトを今のプリセットに読み込む（FR-L4 の P2） */
export function applyEntry(entry: LayoutEntry, links: Record<string, InstrumentId>): void {
  layout.doc.entries[layout.doc.active] = JSON.parse(JSON.stringify(entry)) as LayoutEntry
  layout.doc.links = { ...layout.doc.links, ...links }
  layout.dockOpen = null
  app.maximized = null
  app.focus = null
  saveLayout()
}
/** 隣のペインと入れ替える（Ctrl+Alt+Shift+矢印。ドラッグ移動の代わり） */
export function swapPane(paneId: string, targetId: string): void {
  const a = parentOf(paneId)
  const b = parentOf(targetId)
  if (!a || !b) return
  const pa = a.parent.children[a.index]!
  const pb = b.parent.children[b.index]!
  a.parent.children[a.index] = pb
  b.parent.children[b.index] = pa
  saveLayout()
}
