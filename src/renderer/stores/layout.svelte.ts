// レイアウト（§6.1, FR-L1〜L10, FR-DR1〜DR5）。木構造の変更はすべてこのモジュールの関数で行う（FR-L6）。
// 今のレイアウトは作業に追従して自動保存する（FR-L4）。プリセットの初期値は残し、FR-L9 / L10 で戻せる。
import type { RecoveredFile } from '@shared/api'
import type { InstrumentId, SavedLayout } from '@shared/types'
import { FREE_WIDGETS, IS_FREE, SLOT } from '../lib/windowSlot'
import { app, bridge, rpc, t, toast } from './app.svelte'

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
  /** `free` は表示中のマイレイアウトのページの作業用の写し（正は layouts.json のページ。FR-L14） */
  entries: Record<PresetId, LayoutEntry>
  links: Record<string, InstrumentId>
  /** 表示中のマイレイアウトのページの ID（1 枚目だけ） */
  page?: string
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
      // 右の上に heatmap と、その右の列にチャート（上）・騰落（下。FR-BR1）、右の下に market-overview（heatmap と騰落の下に広く）
      return {
        root: R(
          [30, 70],
          C([40, 60], P('board', 1), P('ranking', 1)),
          C([75, 25], R([60, 40], P('heatmap', 1), C([70, 30], P('chart', 1, { tf: 'D' }), P('breadth', 1))), P('market', 1)),
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

/**
 * ディスクから読んだ木を正規化する（形を確かめ、ID を一意にする。FR-L6）。`seen` を渡すと、すでに使った ID を避ける
 * （マイレイアウトのページとタブをまたいでペインの ID を一意にする。docs/design-mylayouts.md §5.3）
 */
export function normalizeDoc(raw: unknown, seen = new Set<string>()): LayoutDoc {
  const d = defaultDoc()
  if (!raw || typeof raw !== 'object') return d
  const o = raw as Partial<LayoutDoc>
  const fix = entryFixer(seen)
  for (const p of PRESET_IDS) {
    const e = fix(o.entries?.[p])
    if (e) d.entries[p] = e
  }
  if (o.active && PRESET_IDS.includes(o.active)) d.active = o.active
  if (o.links && typeof o.links === 'object') d.links = { ...d.links, ...o.links }
  if (typeof o.page === 'string' && o.page.length <= 40) d.page = o.page
  return d
}

/** 1 つのエントリ（マイレイアウトのページ・フリー N の配置）を正規化する。開けない（本体にペインが 1 枚も残らない）ときは null */
export function normalizeEntry(raw: unknown, seen = new Set<string>()): LayoutEntry | null {
  return entryFixer(seen)(raw)
}

function entryFixer(seen: Set<string>): (raw: unknown) => LayoutEntry | null {
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
  return (raw) => {
    if (!raw || typeof raw !== 'object') return null
    const e = raw as Partial<LayoutEntry>
    const root = fixNode(e.root)
    if (!root) return null
    const docks: LayoutEntry['docks'] = {}
    const left = fixDock(fixNode, e.docks?.left)
    const right = fixDock(fixNode, e.docks?.right)
    if (left) docks.left = left
    if (right) docks.right = right
    return { root, docks }
  }
}

class LayoutState {
  doc = $state<LayoutDoc>(defaultDoc())
  /** 開いているドロワー（ピン留めしたものは別に開いたまま） */
  dockOpen = $state<DockSide | null>(null)
  /**
   * マイレイアウトのページ（FR-L14。1 枚目だけ）。並びは layouts.json のまま。開けないページ（前の版にないペインだけのもの）も
   * 中身のまま持ち、保存で書き戻す（一覧には出さない）。表示中のページの中身は `doc.entries.free` が新しい
   */
  pages = $state<SavedLayout[]>([])
  get entry(): LayoutEntry {
    return this.doc.entries[this.doc.active]
  }
}
export const layout = new LayoutState()

let saveTimer: ReturnType<typeof setTimeout> | null = null
/** 取り込みの間は保存を止める（読み直すまで、古いページで書き戻さない。§5.6） */
let saveSuspended = false
export function saveLayout(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(flushLayout, 400)
}
/** 2MB を超えたこと・保存に失敗したことは 1 回だけ知らせる */
const warned = { size: false, failed: false }
async function flushLayout(): Promise<unknown> {
  saveTimer = null
  // フリー N は自分の配置だけを保存する（1 枚目のレイアウトに触らない。マルチモニタ）
  if (IS_FREE) {
    // 開いた元の形（origin）を付けて保存する（LayoutEntry の直下。前の版は知らないキーを捨てるだけ）
    const entry = { ...$state.snapshot(layout.doc.entries.free), ...(freeWin.origin ? { origin: freeWin.origin } : {}) }
    return rpc('user.saveWindowLayout', { slot: SLOT as 'free2', entry }).catch(() => {})
  }
  if (saveSuspended) return
  // ページを先に書く（2 つの書き込みの間で落ちても、正の layouts.json のほうが新しい）。同じ中身なら Core は書かない
  commitPage()
  const pages = $state.snapshot(layout.pages) as SavedLayout[]
  // 自動保存は大きさで断らない（断ると layout.json とずれる）。超えたことだけ知らせる
  if (!warned.size && pagesBytes(pages) > PAGES_MAX_BYTES) {
    warned.size = true
    toast(t('lay.tooBig'), undefined, 6000, 'error')
  }
  // rpc は失敗のたびにトーストを出すので、自動保存は bridge で呼び、失敗は 1 回だけ知らせる
  try {
    await bridge.call('user.saveLayouts', { layouts: pages })
    await bridge.call('user.saveLayout', { layout: $state.snapshot(layout.doc) })
  } catch {
    if (!warned.failed) toast(t('lay.saveFailed'), undefined, 5000, 'error')
    warned.failed = true
  }
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
export function freeDoc(raw: unknown, slot: string, shape: string | null, pages: readonly SavedLayout[] = []): LayoutDoc {
  return openFreeWindow(raw, slot, shape, pages).doc
}
/** フリー N で開いた元の形（`free:<形>`・`page:<ページの ID>`）。初期状態に戻す（FR-L10）先。窓の配置に `origin` として保存する */
export const freeWin = { origin: null as string | null }
export interface FreeOpened {
  doc: LayoutDoc
  origin: string | null
  /** フリー N に置けないペインをチャートにした・ドロワーを捨てた */
  adjusted: boolean
  /** 開く元のページが無かった（グリッドで開いた） */
  missing: boolean
}
/**
 * フリー N を開く（docs/design-mylayouts.md §3.6・§5.8）。形（`grid` など・`page:<ID>`）を選んだらその形、無ければ前回の配置
 * （元の形は `origin` から読む）、それも無ければグリッド。マイレイアウトのページは写しを開く（ペインの ID を振り直す）
 */
export function openFreeWindow(raw: unknown, slot: string, shape: string | null, pages: readonly SavedLayout[] = []): FreeOpened {
  const saved = (raw as { windows?: Record<string, unknown> } | null)?.windows?.[slot] as { origin?: unknown } | undefined
  if (shape && shape !== 'last') {
    const origin = shape.startsWith('page:') ? shape : `free:${shape}`
    return { ...freeEntryOf(origin, pages), origin }
  }
  const origin = typeof saved?.origin === 'string' ? saved.origin : null
  const entry = saved ? normalizeEntry(saved) : null
  const r = fitFree(entry ?? freeShape('grid'))
  return { doc: r.doc, origin: entry ? origin : 'free:grid', adjusted: r.adjusted, missing: false }
}
/** 開いたフリー N のレイアウトを使う */
export function useFreeWindow(r: FreeOpened): FreeOpened {
  layout.doc = r.doc
  freeWin.origin = r.origin
  return r
}
/** 元の形の中身（フリー N の初期状態に戻すときも使う）。ページは今の中身を写す。無ければグリッド */
export function freeEntryOf(origin: string | null, pages: readonly SavedLayout[]): Omit<FreeOpened, 'origin'> {
  if (origin?.startsWith('page:')) {
    const p = pages.find((x) => `page:${x.id}` === origin)
    const e = p ? normalizeEntry(p.entry) : null
    if (!e) return { ...fitFree(freeShape('grid')), missing: true }
    return { ...fitFree(cloneEntry(e)), missing: false }
  }
  return { ...fitFree(freeShape(origin?.replace(/^free:/, '') ?? 'grid')), missing: false }
}
/** フリー N に合わせる: 置けるのはチャートを並べるペインだけ（一覧は 1 枚目で）。ほかの種類はチャートにし、ドロワーは捨てる */
function fitFree(entry: LayoutEntry): { doc: LayoutDoc; adjusted: boolean } {
  const d = normalizeDoc({ version: 1, active: 'free', entries: { free: entry }, links: {} })
  let adjusted = !!(d.entries.free.docks.left || d.entries.free.docks.right)
  for (const p of allPanes(d.entries.free))
    if (!FREE_WIDGETS.includes(p.widget)) {
      changeWidgetIn(p, 'chart')
      adjusted = true
    }
  d.entries.free.docks = {}
  return { doc: d, adjusted }
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
/** 取り込み・取り込みの取り消しの前に: 遅らせている保存を確定させ、読み直す（useLoadedLayout）まで保存を止める（§5.6） */
export async function suspendLayoutSave(): Promise<void> {
  await flushLayoutSave()
  saveSuspended = true
}
/** 取り込みに失敗したとき（読み直さない）に保存を戻す */
export function resumeLayoutSave(): void {
  saveSuspended = false
}

// ---------------------------------------------------------------- マイレイアウトのページ（FR-L14、docs/design-mylayouts.md）
/** ページの数の上限。足す操作だけに効かせる（取り込みで超えたときは全部を持つ） */
export const PAGES_MAX = 30
/** ページの合計の大きさの上限。足す・複製・写すときだけ調べる（自動保存は断らない） */
export const PAGES_MAX_BYTES = 2_000_000
export const pagesBytes = (pages: unknown): number => JSON.stringify(pages).length
let pageSeq = 0
/** 'p' + 時刻 + カウンタ（同じミリ秒に何件作っても重ならない） */
export const newPageId = (): string => `p${Date.now().toString(36)}${(++pageSeq).toString(36)}`
/** 開けるページか（スキーマには通るが、知らないペインだけのページ＝新しい版で作ったページなどは開けない） */
export const pageOpenable = (p: SavedLayout): boolean => normalizeEntry(p.entry) != null
export const pageName = (p: SavedLayout, lang: string): string => (lang === 'en' ? p.name.en || p.name.ja : p.name.ja)
/** 0 枚のときに作るページ（§5.4 の 2）。ID を固定するので、書けずに起動し直しても同じページになる */
export const FIRST_PAGE = { id: 'free', name: { ja: 'フリー', en: 'Free' } } as const

/** 写す（複製・今のタブを写す・フリー N で開く）。ペインと区切りの ID を振り直し、ドロワーへ移す前の位置（_home.sib）も直す */
export function cloneEntry(e: LayoutEntry): LayoutEntry {
  const c = JSON.parse(JSON.stringify(e)) as LayoutEntry
  const ids = new Map<string, string>()
  const walk = (n: LNode) => {
    const id = nid()
    ids.set(n.id, id)
    n.id = id
    if (n.kind === 'split') n.children.forEach(walk)
  }
  walk(c.root)
  for (const d of [c.docks.left, c.docks.right]) for (const p of d?.panes ?? []) walk(p)
  for (const p of allPanes(c)) {
    const { _home, ...rest } = p.state as { _home?: Home }
    if (!_home) continue
    const sib = ids.get(_home.sib)
    p.state = sib ? { ...rest, _home: { ..._home, sib } } : rest
  }
  return c
}

/** ページの初期の形（§3.4）。初期状態に戻す（FR-L10）ときの戻す先。形が無い・知らない形はフリーのプリセット */
export function shapeEntry(shape: string | undefined): LayoutEntry {
  const m = /^(preset|free):(\w+)$/.exec(shape ?? '')
  if (m?.[1] === 'free' && ['empty', 'quad', 'grid', 'detail'].includes(m[2]!)) return freeShape(m[2]!)
  if (m?.[1] === 'preset' && (PRESET_IDS as string[]).includes(m[2]!)) return presetEntry(m[2] as PresetId)
  return presetEntry('free')
}

export interface ResolvedPages {
  doc: LayoutDoc
  pages: SavedLayout[]
  /** 開けないので隠したページの数 */
  hidden: number
  /** 開けるページが無かったので 1 枚作った */
  created: boolean
}
/**
 * 読み込みの決まり（§5.4・§5.2）。移行の処理は持たず、何度通しても同じ結果になる:
 * 1. ページはそのまま（前の版の名前付きのレイアウトもページ）。ID が重なるページは振り直す
 * 2. 開けるページが 0 枚なら、今の entries.free（無ければフリーのプリセット）から ID `free` のページを作る
 * 3. 開けないページは隠して、中身のまま持つ（保存で書き戻す）
 * 表示中のページは doc.page の開けるページ、無ければ先頭の開けるページ。正は layouts.json なので、entries.free はそのページから作る。
 * ペインの ID はページとタブをまたいで一意にする（ページが先: 表示中のページと entries.free は同じ ID を持つので、捨てる側を振り直す）
 */
export function resolvePages(rawDoc: unknown, rawPages: readonly SavedLayout[], now = Date.now()): ResolvedPages {
  const seen = new Set<string>()
  const ids = new Set<string>()
  const open = new Set<string>()
  const pages = rawPages.map((p): SavedLayout => {
    const id = ids.has(p.id) ? newPageId() : p.id
    ids.add(id)
    const entry = normalizeEntry(p.entry, seen)
    if (entry) open.add(id)
    return { ...p, id, entry: entry ?? p.entry }
  })
  const hidden = pages.length - open.size
  const doc = normalizeDoc(rawDoc, seen)
  let created = false
  if (!open.size) {
    const id = ids.has(FIRST_PAGE.id) ? newPageId() : FIRST_PAGE.id
    pages.push({
      id,
      name: { ...FIRST_PAGE.name },
      entry: JSON.parse(JSON.stringify(doc.entries.free)),
      links: {},
      created: now,
      updated: now,
    })
    open.add(id)
    created = true
  }
  const cur = pages.find((p) => p.id === doc.page && open.has(p.id)) ?? pages.find((p) => open.has(p.id))!
  doc.page = cur.id
  doc.entries.free = JSON.parse(JSON.stringify(cur.entry))
  return { doc, pages, hidden, created }
}
/**
 * 読み込んだレイアウトとページを使う（1 枚目の起動・取り込みと取り消しのあと）。フォーカス・最大化・ドロワー・サイズの取り消しを空にし、
 * 止めていた保存を戻す。ページを作った・表示中のページが変わったときは保存する
 */
export function useLoadedLayout(rawDoc: unknown, rawPages: readonly SavedLayout[]): ResolvedPages {
  const r = resolvePages(rawDoc, rawPages)
  layout.doc = r.doc
  layout.pages = r.pages
  layout.dockOpen = null
  app.maximized = null
  app.focus = null
  undoSnap = null
  pageUndo = null
  saveSuspended = false
  if (r.created || r.doc.page !== (rawDoc as { page?: unknown } | null)?.page) saveLayout()
  return r
}
/** 読み込みで直したことを知らせる（1 枚目だけ）: 読み損なって既定に戻したファイル・除いたページ・隠したページ */
export function noticeLoaded(r: ResolvedPages, recovered: readonly RecoveredFile[] = []): void {
  for (const f of recovered) {
    const msg = f.dropped
      ? t('lay.droppedPages', { n: f.dropped, file: f.backup })
      : t(f.file === 'layout' ? 'lay.recoveredLayout' : 'lay.recoveredPages', { file: f.backup })
    toast(msg, undefined, 12_000, 'error')
  }
  if (r.hidden) toast(t('lay.hiddenPages', { n: r.hidden }), undefined, 6000)
}
/** 取り込み・取り込みの取り消しのあと: ページを読み直す（タブの配置は今のまま。§5.6） */
export function reloadPages(rawPages: readonly SavedLayout[]): ResolvedPages {
  return useLoadedLayout($state.snapshot(layout.doc), rawPages)
}
export function currentPage(): SavedLayout | undefined {
  return layout.pages.find((p) => p.id === layout.doc.page)
}
/** 一覧に出すページ（開けるものだけ。並びはファイルのまま） */
export function openablePages(): SavedLayout[] {
  return layout.pages.filter(pageOpenable)
}
/** 表示中のページに作業用の写し（entries.free）を書き戻す。変わっていなければ触らない（updated を変えない） */
function commitPage(): void {
  const p = IS_FREE ? undefined : currentPage()
  if (!p) return
  const now = $state.snapshot(layout.doc.entries.free)
  if (JSON.stringify(now) === JSON.stringify($state.snapshot(p.entry))) return
  p.entry = now
  p.updated = Date.now()
}
/** 作業用の写しを別のページに替える（表示中のタブは変えない） */
function showPage(p: SavedLayout): boolean {
  const e = normalizeEntry($state.snapshot(p.entry))
  if (!e) return false
  if (p.id !== layout.doc.page) {
    commitPage()
    layout.doc.entries.free = e
    layout.doc.page = p.id
  }
  return true
}
/** ページを開く（マイレイアウトのタブへ移る）。タブを替えたときと同じく、ドロワー・最大化・フォーカスを空にする（§3.5） */
export function setPage(id: string): boolean {
  const p = layout.pages.find((x) => x.id === id)
  if (!p || !showPage(p)) return false
  layout.doc.active = 'free'
  layout.dockOpen = null
  app.maximized = null
  app.focus = null
  saveLayout()
  return true
}
export type PageRefusal = 'limit' | 'size'
/** ページを足す（中身は写す）。上限（30 枚・2MB）を超えるなら足さずに理由を返す */
export function addPage(name: string, entry: LayoutEntry, shape?: string): SavedLayout | PageRefusal {
  if (openablePages().length >= PAGES_MAX) return 'limit'
  const now = Date.now()
  const p: SavedLayout = { id: newPageId(), name: { ja: name, en: name }, entry: cloneEntry(entry), links: {}, created: now, updated: now }
  if (shape) p.shape = shape
  commitPage()
  if (pagesBytes([...($state.snapshot(layout.pages) as SavedLayout[]), p]) > PAGES_MAX_BYTES) return 'size'
  layout.pages.push(p)
  saveLayout()
  return layout.pages[layout.pages.length - 1]!
}
/** 今のタブ（マイレイアウトなら表示中のページ）を写してページに足す。形は写した元のタブ（ページの複製はそのページの形） */
export function copyToPage(name: string): SavedLayout | PageRefusal {
  const a = layout.doc.active
  return addPage(name, layout.entry, a === 'free' ? currentPage()?.shape : `preset:${a}`)
}
export function renamePage(id: string, name: string): void {
  const p = layout.pages.find((x) => x.id === id)
  if (!p || !name) return
  p.name = { ja: name, en: name }
  saveLayout()
}
/** ページを複製する（中身と形を写し、ペインの ID を振り直す）。表示中のページは作業用の写しから */
export function duplicatePage(id: string, name: string): SavedLayout | PageRefusal | null {
  const p = layout.pages.find((x) => x.id === id)
  if (!p || !pageOpenable(p)) return null
  const entry = id === layout.doc.page ? layout.doc.entries.free : (p.entry as LayoutEntry)
  return addPage(name, entry, p.shape)
}
/** 直前に消したページ（10 秒間は元に戻せる。サイズを戻すの取り消しと同じ 1 つの枠で、あとから行ったほうが残る） */
let pageUndo: { page: SavedLayout; index: number; current: boolean } | null = null
let pageUndoTimer: ReturnType<typeof setTimeout> | null = null
export function canUndoRemovePage(): boolean {
  return !!pageUndo
}
/** 消したページを元の位置に戻す。表示中だったページなら、また表示する（タブは変えない） */
export function undoRemovePage(): SavedLayout | null {
  const u = pageUndo
  if (!u) return null
  pageUndo = null
  const id = layout.pages.some((p) => p.id === u.page.id) ? newPageId() : u.page.id
  layout.pages.splice(Math.min(u.index, layout.pages.length), 0, { ...u.page, id })
  const p = layout.pages.find((x) => x.id === id)!
  if (u.current) {
    showPage(p)
    if (layout.doc.active === 'free') {
      layout.dockOpen = null
      app.maximized = null
      app.focus = null
    }
  }
  saveLayout()
  return p
}
/** ページを消す。開ける最後の 1 枚は消さない（false）。表示中のページを消したら、となりのページを写す。10 秒間は元に戻せる */
export function removePage(id: string): boolean {
  const open = openablePages()
  const at = open.findIndex((p) => p.id === id)
  if (at >= 0 && open.length <= 1) return false
  const i = layout.pages.findIndex((p) => p.id === id)
  if (i < 0) return false
  if (id === layout.doc.page) commitPage() // 元に戻すときに最後の変更まで戻す
  pageUndo = { page: $state.snapshot(layout.pages[i]!) as SavedLayout, index: i, current: id === layout.doc.page }
  undoSnap = null
  if (pageUndoTimer) clearTimeout(pageUndoTimer)
  pageUndoTimer = setTimeout(() => (pageUndo = null), 10_000)
  if (id === layout.doc.page) {
    const next = open[at + 1] ?? open[at - 1]!
    layout.doc.page = undefined // 消すページに書き戻さない
    showPage(next)
    if (layout.doc.active === 'free') {
      layout.dockOpen = null
      app.maximized = null
      app.focus = null
    }
  }
  layout.pages.splice(i, 1)
  saveLayout()
  return true
}
/** 一覧（開けるページ）の上下と入れ替える */
export function movePage(id: string, delta: -1 | 1): boolean {
  const open = openablePages()
  const j = open.findIndex((p) => p.id === id)
  const q = open[j + delta]
  if (j < 0 || !q) return false
  const a = layout.pages.findIndex((p) => p.id === id)
  const b = layout.pages.findIndex((p) => p.id === q.id)
  const list = [...layout.pages]
  ;[list[a], list[b]] = [list[b]!, list[a]!]
  layout.pages = list
  saveLayout()
  return true
}
/** すべてのタブと、表示中でない開けるページのエントリ（§5.7。`doc.entries` を回る処理はこれを回す） */
export function allEntries(): LayoutEntry[] {
  const out = PRESET_IDS.map((p) => layout.doc.entries[p])
  if (!IS_FREE) for (const p of layout.pages) if (p.id !== layout.doc.page && pageOpenable(p)) out.push(p.entry as LayoutEntry)
  return out
}
/** 画面の木を作り直す鍵（Workspace の {#key}）: タブと、マイレイアウトではページ */
export function viewKey(): string {
  return layout.doc.active === 'free' ? `free:${layout.doc.page ?? ''}` : layout.doc.active
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
  /** マイレイアウトのページ（ページをまたいで戻さない） */
  page: string | undefined
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
    page: layout.doc.page,
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
function defaultSizesOf(root: LNode, tiers: LayoutEntry[][]): Map<SplitNode, number[]> {
  const cands = tiers.map((tier) => {
    const out: SplitNode[] = []
    for (const e of tier) eachSplit(e.root, (s) => out.push(s))
    return out
  })
  const out = new Map<SplitNode, number[]>()
  eachSplit(root, (s) => {
    let best: SplitNode | null = null
    for (const tier of cands) {
      let bs = 0
      for (const c of tier) {
        const v = similarity(s, c)
        if (v > bs) {
          bs = v
          best = c
        }
      }
      if (best) break // 先の段で見つかれば、次の段（ほかのプリセット）は見ない
    }
    out.set(s, best ? [...best.sizes] : s.sizes.map(() => 100 / s.sizes.length))
  })
  return out
}
/**
 * 基準の比率を探すプリセットの段（FR-L9）。先の段に似た区切りが無ければ次の段から探す。マイレイアウトのページは、
 * 写した元のタブ（`preset:<タブ>`）を先に、無ければすべてのプリセットから。フリーの形（`free:*`・`preset:free`）はフリーのプリセット
 */
function sizeBases(): LayoutEntry[][] {
  const a = layout.doc.active
  if (a !== 'free' || IS_FREE) return [[presetEntry(a)]]
  const shape = currentPage()?.shape ?? ''
  const all = () => PRESET_IDS.map(presetEntry)
  const from = /^preset:(\w+)$/.exec(shape)?.[1] as PresetId | undefined
  if (from && from !== 'free' && PRESET_IDS.includes(from)) return [[presetEntry(from)], all()]
  if (shape.startsWith('free:') || shape === 'preset:free') return [[presetEntry('free')]]
  return [all()]
}
/** ドロワーの幅の基準（区切りと同じ段の順で、そのドロワーを持つ最初のプリセット） */
const dockBase = (tiers: LayoutEntry[][], side: DockSide): Dock | undefined => tiers.flat().find((e) => e.docks[side])?.docks[side]
/** サイズを元に戻す（FR-L9）。並び・中身は変えない。10 秒間は元に戻せる */
export function resetSizes(): boolean {
  const e = layout.entry
  const tiers = sizeBases()
  const target = defaultSizesOf(e.root, tiers)
  undoSnap = snapshotSizes(e)
  pageUndo = null // 元に戻すは 1 つだけ（あとから行ったほうが残る）
  eachSplit(e.root, (s) => {
    s.sizes = [...target.get(s)!]
  })
  for (const side of ['left', 'right'] as const) {
    const d = e.docks[side]
    const p = dockBase(tiers, side)
    if (d && p) d.width = p.width
  }
  saveLayout()
  if (undoTimer) clearTimeout(undoTimer)
  undoTimer = setTimeout(() => (undoSnap = null), 10_000)
  return true
}
/** 区切りとドロワーの幅が既定のままか（「サイズを戻す」を押しても変わらないとき true） */
export function sizesAtDefault(): boolean {
  const e = layout.entry
  const tiers = sizeBases()
  const target = defaultSizesOf(e.root, tiers)
  let same = true
  eachSplit(e.root, (x) => {
    const want = target.get(x)!
    const sum = x.sizes.reduce((a, b) => a + b, 0) || 1
    if (x.sizes.some((v, i) => Math.abs((v / sum) * 100 - want[i]!) > 0.5)) same = false
  })
  for (const side of ['left', 'right'] as const) {
    const d = e.docks[side]
    const p = dockBase(tiers, side)
    if (d && p && Math.abs(d.width - p.width) > 1) same = false
  }
  return same
}
export function canUndoReset(): boolean {
  return !!undoSnap && undoSnap.preset === layout.doc.active && (undoSnap.preset !== 'free' || undoSnap.page === layout.doc.page)
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
/**
 * レイアウトを初期状態に戻す（FR-L10。確認は呼ぶ側で行う）。マイレイアウトでは表示中のページだけを、作ったときの形に戻す。
 * フリー N は開いた元の形に戻す。ページから開いた窓は、呼ぶ側がページの今の中身を読んで `entry` に渡す（読むのが非同期のため）
 */
export function resetLayout(entry?: LayoutEntry): void {
  const a = layout.doc.active
  layout.doc.entries[a] =
    entry ?? (IS_FREE ? freeEntryOf(freeWin.origin, []).doc.entries.free : a === 'free' ? shapeEntry(currentPage()?.shape) : presetEntry(a))
  app.focus = null
  saveLayout()
}
/**
 * すべてのタブ（プリセット）のレイアウトを初期状態に戻す（FR-L10）。表示中のタブ・リンクの銘柄は変えない。
 * マイレイアウト（フリーのタブのページ）は利用者が作ったものなので触らない。
 * 1 枚目だけ（フリー N はそれぞれの窓の配置なので、窓ごとに resetLayout で戻す）
 */
export function resetAllLayouts(): void {
  if (IS_FREE) return
  for (const id of PRESET_IDS) if (id !== 'free') layout.doc.entries[id] = presetEntry(id)
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
