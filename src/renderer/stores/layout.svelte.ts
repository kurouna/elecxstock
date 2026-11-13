// レイアウト（§6.1, FR-L1〜L10, FR-DR1〜DR5）。木構造の変更はすべてこのモジュールの関数で行う（FR-L6）。
// 今のレイアウトは作業に追従して自動保存する（FR-L4）。プリセットの初期値は残し、FR-L9 / L10 で戻せる。
import type { InstrumentId } from '@shared/types'
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
export const WIDGETS: WidgetId[] = [
  'chart',
  'mtf',
  'watchlist',
  'screener',
  'info',
  'grid',
  'divcal',
  'portfolio',
  'heatmap',
  'ranking',
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
export type PresetId = 'mtf' | 'grid' | 'screener' | 'income' | 'triple' | 'market' | 'free'
export const PRESET_IDS: PresetId[] = ['mtf', 'grid', 'screener', 'income', 'triple', 'market', 'free']
export interface LayoutDoc {
  version: 1
  active: PresetId
  entries: Record<PresetId, LayoutEntry>
  links: Record<string, InstrumentId>
}

let uid = 0
const nid = () => `n${Date.now().toString(36)}${(++uid).toString(36)}`
const P = (widget: WidgetId, link = 1, state: Record<string, unknown> = {}): PaneNode => ({ kind: 'pane', id: nid(), widget, link, state })
const R = (sizes: number[], ...children: LNode[]): SplitNode => ({ kind: 'split', id: nid(), dir: 'row', sizes, children })
const C = (sizes: number[], ...children: LNode[]): SplitNode => ({ kind: 'split', id: nid(), dir: 'col', sizes, children })

/** プリセット（§6.4）。選ぶとこの初期状態から始まり、変更はそのプリセットの「今のレイアウト」になる */
export function presetEntry(id: PresetId): LayoutEntry {
  switch (id) {
    case 'mtf':
      return {
        root: R(
          [26, 74],
          P('watchlist', 1, { list: 'favorites' }),
          C([62, 38], P('chart', 1, { tf: 'D' }), R([50, 50], P('chart', 1, { tf: 'W' }), P('chart', 1, { tf: 'M' }))),
        ),
        docks: {},
      }
    case 'grid':
      return {
        root: P('grid', 1, { src: 'live' }),
        docks: { left: { panes: [P('watchlist', 1, { list: 'favorites' }), P('screener', 1)], active: 1, pinned: false, width: 660 } },
      }
    case 'screener':
      return {
        root: R([46, 54], P('screener', 1), C([58, 42], R([62, 38], P('chart', 1, { tf: 'D' }), P('chart', 1, { tf: 'W' })), P('info', 1))),
        docks: {},
      }
    case 'income':
      return {
        root: R(
          [48, 52],
          C([45, 55], P('watchlist', 3, { list: 'income' }), P('divcal', 3)),
          C([55, 45], P('chart', 3, { tf: 'M' }), P('info', 3)),
        ),
        docks: {},
      }
    case 'triple':
      return {
        root: C(
          [64, 36],
          R([34, 33, 33], P('chart', 1, { tf: 'D' }), P('chart', 1, { tf: 'W' }), P('chart', 1, { tf: 'M' })),
          R([30, 70], P('watchlist', 1, { list: 'favorites' }), P('info', 1)),
        ),
        docks: {},
      }
    case 'market':
      // §6.4 Market（P2）: heatmap + ranking + market-overview。右のドロワーに保有の一覧
      return {
        root: R([58, 42], C([64, 36], P('heatmap', 4), P('market', 4)), C([55, 45], P('ranking', 4), P('chart', 4, { tf: 'D' }))),
        docks: { right: { panes: [P('portfolio', 4)], active: 0, pinned: false, width: 620 } },
      }
    case 'free':
      // §6.4 フリー: 分割を重ねて自由に並べる。リンク色の無いチャートは、それぞれ自分の銘柄を持つ（FR-L11）。
      // 左のドロワーにウォッチリスト・スクリーナー（リンク 1）。左の大きいチャートはリンク 1 で一覧の選択に従い、右の 3 枚は独立
      return {
        root: R(
          [50, 50],
          P('chart', 1, { tf: 'D' }),
          C(
            [34, 33, 33],
            P('chart', 0, { tf: 'D', sym: 'JP:8306' }),
            P('chart', 0, { tf: 'D', sym: 'JP:8058' }),
            P('chart', 0, { tf: 'D', sym: 'JP:9434' }),
          ),
        ),
        docks: { left: { panes: [P('watchlist', 1, { list: 'favorites' }), P('screener', 1)], active: 0, pinned: false, width: 560 } },
      }
  }
}
export function defaultDoc(): LayoutDoc {
  return {
    version: 1,
    active: 'mtf',
    entries: Object.fromEntries(PRESET_IDS.map((p) => [p, presetEntry(p)])) as Record<PresetId, LayoutEntry>,
    links: { '1': 'JP:7203', '2': 'JP:8951', '3': 'JP:2914', '4': 'JP:8306', '5': 'JP:3462' },
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
    width: Math.min(1200, Math.max(280, d.width || 600)),
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
        link: Number.isInteger(x.link) && x.link >= 0 && x.link <= 5 ? x.link : 1,
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
function flushLayout(): void {
  saveTimer = null
  void rpc('user.saveLayout', { layout: $state.snapshot(layout.doc) }).catch(() => {})
}
/** 閉じる前に、遅らせている保存を確定させる */
export function flushLayoutSave(): void {
  if (saveTimer) {
    clearTimeout(saveTimer)
    flushLayout()
  }
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
export function setLinkSymbol(group: number, id: InstrumentId): void {
  if (!group) return
  layout.doc.links[String(group)] = id
  saveLayout()
}
export function linkSymbol(group: number): InstrumentId | undefined {
  return layout.doc.links[String(group)]
}
/** ペインが表示する銘柄: リンク色があればそのグループの銘柄、無ければペイン自身の銘柄（FR-L11） */
export function paneSymbol(pane: PaneNode): InstrumentId | undefined {
  if (pane.link) return linkSymbol(pane.link)
  return (pane.state.sym as InstrumentId | undefined) ?? linkSymbol(0)
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
/** サイズを元に戻す（FR-L9）。並び・中身は変えない。10 秒間は元に戻せる */
export function resetSizes(): boolean {
  const e = layout.entry
  const preset = presetEntry(layout.doc.active)
  const target: number[][] = []
  eachSplit(preset.root, (s) => target.push([...s.sizes]))
  undoSnap = snapshotSizes(e)
  let k = 0
  eachSplit(e.root, (s) => {
    const t = target[k++]
    s.sizes = t && t.length === s.sizes.length ? [...t] : s.sizes.map(() => 100 / s.sizes.length)
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
  const target: number[][] = []
  eachSplit(preset.root, (x) => target.push([...x.sizes]))
  let k = 0
  let same = true
  eachSplit(e.root, (x) => {
    const t = target[k++]
    const want = t && t.length === x.sizes.length ? t : x.sizes.map(() => 100 / x.sizes.length)
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
  layout.doc.entries[layout.doc.active] = presetEntry(layout.doc.active)
  app.focus = null
  saveLayout()
}
/** 右・下に分割（Ctrl+Shift+E / O） */
export function splitPane(paneId: string, dir: 'row' | 'col', widget: WidgetId = 'chart'): string | null {
  if (inDock(paneId)) return null
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
  if (!p) return
  p.widget = widget
  p.state = widget === 'chart' ? { tf: 'D' } : {}
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
    if (!d.panes.length) delete layout.entry.docks[side]
    else d.active = Math.min(d.active, d.panes.length - 1)
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
  } else layout.entry.docks[side] = { panes: [p], active: 0, pinned: false, width: 600 }
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
