// レイアウト（§6.1, FR-L1〜L10, FR-DR1〜DR5）。木構造の変更はすべてこのモジュールの関数で行う（FR-L6）。
// 今のレイアウトは作業に追従して自動保存する（FR-L4）。プリセットの初期値は残し、FR-L9 / L10 で戻せる。
import type { InstrumentId } from '@shared/types'
import { app, rpc } from './app.svelte'

export type WidgetId = 'watchlist' | 'chart' | 'info' | 'screener' | 'grid' | 'jobs' | 'divcal'
export const WIDGETS: WidgetId[] = ['chart', 'watchlist', 'screener', 'info', 'grid', 'divcal', 'jobs']
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
  docks: { left?: Dock }
}
export type PresetId = 'mtf' | 'grid' | 'screener' | 'income' | 'triple'
export const PRESET_IDS: PresetId[] = ['mtf', 'grid', 'screener', 'income', 'triple']
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
          [24, 76],
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
      if (!(['watchlist', 'chart', 'info', 'screener', 'grid', 'jobs', 'divcal'] as string[]).includes(x.widget)) return null
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
    const left = e?.docks?.left
    const docks: LayoutEntry['docks'] = {}
    if (left && Array.isArray(left.panes)) {
      const panes = left.panes.map(fixNode).filter((x): x is PaneNode => x?.kind === 'pane')
      if (panes.length)
        docks.left = {
          panes,
          active: Math.min(Math.max(0, left.active | 0), panes.length - 1),
          pinned: !!left.pinned,
          width: Math.min(1200, Math.max(280, left.width || 600)),
        }
    }
    d.entries[p] = { root, docks }
  }
  if (o.active && PRESET_IDS.includes(o.active)) d.active = o.active
  if (o.links && typeof o.links === 'object') d.links = { ...d.links, ...o.links }
  return d
}

class LayoutState {
  doc = $state<LayoutDoc>(defaultDoc())
  dockOpen = $state(false)
  get entry(): LayoutEntry {
    return this.doc.entries[this.doc.active]
  }
}
export const layout = new LayoutState()

let saveTimer: ReturnType<typeof setTimeout> | null = null
export function saveLayout(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void rpc('user.saveLayout', { layout: $state.snapshot(layout.doc) }).catch(() => {}), 400)
}

// ---------------------------------------------------------------- queries
export function allPanes(e: LayoutEntry = layout.entry, withDock = true): PaneNode[] {
  const out: PaneNode[] = []
  const walk = (n: LNode) => (n.kind === 'pane' ? out.push(n) : n.children.forEach(walk))
  walk(e.root)
  if (withDock && e.docks.left) out.push(...e.docks.left.panes)
  return out
}
export function findPane(id: string | null): PaneNode | undefined {
  if (!id) return undefined
  return allPanes().find((p) => p.id === id)
}
export function inDock(id: string): boolean {
  return !!layout.entry.docks.left?.panes.some((p) => p.id === id)
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
  layout.dockOpen = false
  app.maximized = null
  saveLayout()
}
/** ドロワーを開く・閉じる（ピン留め中は閉じない） */
export function toggleDockOpen(open: boolean): void {
  if (!open && layout.entry.docks.left?.pinned) return
  if (layout.dockOpen !== open) layout.dockOpen = open
}
export function setLinkSymbol(group: number, id: InstrumentId): void {
  if (!group) return
  layout.doc.links[String(group)] = id
  saveLayout()
}
export function linkSymbol(group: number): InstrumentId | undefined {
  return layout.doc.links[String(group)]
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
}
let undoSnap: SizeSnap | null = null
let undoTimer: ReturnType<typeof setTimeout> | null = null
function snapshotSizes(e: LayoutEntry): SizeSnap {
  const splits: number[][] = []
  eachSplit(e.root, (s) => splits.push([...s.sizes]))
  return { preset: layout.doc.active, splits, ...(e.docks.left ? { dock: e.docks.left.width } : {}) }
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
  saveLayout()
  if (undoTimer) clearTimeout(undoTimer)
  undoTimer = setTimeout(() => (undoSnap = null), 10_000)
  return true
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
  const fresh = P(widget, pane.link, widget === 'chart' ? { tf: 'D' } : {})
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
