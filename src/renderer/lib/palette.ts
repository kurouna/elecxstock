// コマンドバー（Ctrl+K）の候補の組み立て（docs/design-dialogs.md §3。FR-KB1・FR-KB9）。画面（overlays/Palette.svelte）は描くだけ。
// アクションの分類・「このペインで」に出すアクション・今使えない理由・最近使ったもの・接頭辞の範囲もここで決める
import { CODE_RE } from '@shared/code'
import { type Match, matchText, rankBy } from '@shared/match'
import type { InstrumentId } from '@shared/types'
import type { WidgetId } from '../stores/layout.svelte'

/** アクションの分類（コマンドバーの段の順・行の札） */
export const ACTION_GROUPS = ['pane', 'win', 'sym', 'folio', 'alert', 'data', 'view', 'app'] as const
export type ActionGroup = (typeof ACTION_GROUPS)[number]
const GROUP_OF: Record<string, ActionGroup> = {
  layouts: 'pane',
  max: 'pane',
  resetSizes: 'pane',
  resetLayout: 'pane',
  resetAllLayouts: 'pane',
  drawer: 'pane',
  drawerRight: 'pane',
  drawerPin: 'pane',
  toDrawer: 'pane',
  toDrawerRight: 'pane',
  fromDrawer: 'pane',
  split: 'pane',
  splitDown: 'pane',
  close: 'pane',
  changeWidget: 'pane',
  jobs: 'pane',
  fullscreen: 'win',
  newWindow: 'win',
  nextWindow: 'win',
  prevWindow: 'win',
  zoomIn: 'win',
  zoomOut: 'win',
  zoomReset: 'win',
  sendToFree: 'win',
  fav: 'sym',
  addTo: 'sym',
  newList: 'sym',
  duplicateList: 'sym',
  columns: 'sym',
  limit: 'sym',
  exportCsv: 'sym',
  importCodes: 'sym',
  screens: 'sym',
  openGrid: 'sym',
  portfolio: 'folio',
  folio: 'folio',
  folioGoal: 'folio',
  folioClear: 'folio',
  importBrokerCsv: 'folio',
  exportHoldings: 'folio',
  importHoldings: 'folio',
  undoHoldings: 'folio',
  privacy: 'folio',
  alertNew: 'alert',
  alerts: 'alert',
  update: 'data',
  refetch: 'data',
  refetchList: 'data',
  universe: 'data',
  exportBars: 'data',
  backupDb: 'data',
  exportUser: 'data',
  importUser: 'data',
  data: 'data',
  lang: 'view',
  theme: 'view',
  candle: 'view',
  density: 'view',
  settings: 'app',
  keys: 'app',
  help: 'app',
  openLogs: 'app',
  checkUpdate: 'app',
  quit: 'app',
}
/** 分類の表にあるか、決まった形の ID か（分類の表の漏れを見つける） */
export const knownGroup = (id: string) => id in GROUP_OF || /^(layout\.|paneToEdge-|open\.|page:)/.test(id)
/** アクションの分類（レイアウトのプリセット・ペインを端へ・フリー N を開くは ID の形で） */
export function groupOf(id: string): ActionGroup {
  if (id.startsWith('layout.') || id.startsWith('paneToEdge-')) return 'pane'
  if (id.startsWith('open.')) return 'win'
  if (id.startsWith('page:')) return 'pane'
  return GROUP_OF[id] ?? 'app'
}

/** 空のときの「このペインで」: ペインの種類に関係するアクション */
export const CONTEXT_ACTIONS: Partial<Record<WidgetId, string[]>> = {
  chart: ['alertNew', 'exportBars', 'sendToFree', 'fav', 'max'],
  mtf: ['alertNew', 'exportBars', 'sendToFree', 'fav'],
  info: ['alertNew', 'exportBars', 'fav', 'refetch'],
  watchlist: ['columns', 'exportCsv', 'addTo', 'duplicateList', 'importCodes'],
  screener: ['columns', 'limit', 'exportCsv', 'openGrid', 'screens'],
  grid: ['addTo', 'sendToFree', 'max'],
  ranking: ['addTo', 'refetch'],
  portfolio: ['importBrokerCsv', 'exportHoldings', 'privacy', 'folio'],
  folio: ['folioGoal', 'privacy', 'portfolio'],
  divcal: ['addTo', 'exportCsv'],
  divsim: ['sendToFree', 'max'],
  perf: ['sendToFree', 'max'],
  heatmap: ['addTo', 'max'],
  board: ['columns', 'exportCsv'],
  breadth: ['max'],
  market: ['max'],
  news: ['max'],
  jobs: ['openLogs', 'update'],
}

export type Scope = 'all' | 'sym' | 'act' | 'scr' | 'pane'
export const SCOPES: readonly Scope[] = ['all', 'sym', 'act', 'scr', 'pane']
const PREFIX: Record<string, Scope> = { '>': 'act', '#': 'scr', '@': 'pane' }
/** 打った語から範囲と語を分ける（> アクション・# スクリーニング条件・@ ペインの種類。全角も） */
export function parseQuery(raw: string, scope: Scope): { scope: Scope; q: string } {
  const s = raw.normalize('NFKC').trim()
  const p = PREFIX[s[0] ?? '']
  return p ? { scope: p, q: s.slice(1).trim() } : { scope, q: s }
}
/** 接頭辞を外した語（範囲のチップで範囲を変えたとき） */
export const stripPrefix = (raw: string) => {
  const s = raw.normalize('NFKC').trimStart()
  return PREFIX[s[0] ?? ''] ? s.slice(1).trimStart() : raw
}

/** 最近使ったもの（先頭に足し、同じものは外し、max 件まで） */
export function pushRecent(list: readonly string[], key: string, max: number): string[] {
  return [key, ...list.filter((x) => x !== key)].slice(0, max)
}

export interface PalAction {
  id: string
  label: string
  key: string
  group: ActionGroup
  /** 今使えない理由（i18n のキー）。使えれば null */
  reason: string | null
}
export interface PalSym {
  id: InstrumentId
  code: string
  name: string
  /** 取得の対象（プライム・REIT・指数・追加した銘柄）。false なら「追加して取得する」も出す */
  tracked?: boolean
}
export type PalItem =
  | { kind: 'sym'; id: InstrumentId; ranges: Match['ranges']; codeHit?: number }
  | { kind: 'add'; code: string }
  | { kind: 'scr'; id: string; ranges: Match['ranges'] }
  | { kind: 'act'; id: string; ranges: Match['ranges'] }
  | { kind: 'pane'; id: WidgetId; ranges: Match['ranges'] }
  | { kind: 'key'; index: number; ranges: Match['ranges'] }
export interface PalGroup {
  id: string
  title: string
  items: PalItem[]
  /** 横に並べるチップ（最近の銘柄） */
  chips?: boolean
  /** 行の先頭に分類の名前を出す（分類の見出しの下では出さない） */
  tags: boolean
  /** 出しきれなかった数（ペインの中のキー） */
  more?: number
}
const PANE_KEYS_MAX = 5

/** 候補の段を組み立てる（空のときと、打ったとき）。空の段は出さない */
export function buildPalette(o: {
  q: string
  scope: Scope
  actions: readonly PalAction[]
  screens: readonly { id: string; name: string }[]
  syms: readonly PalSym[]
  widgets: readonly { id: WidgetId; name: string; alias: readonly string[]; current: boolean }[]
  paneKeys: readonly { label: string; alias: readonly string[]; grp: string; keys: string }[]
  recentSyms: readonly InstrumentId[]
  recentActs: readonly string[]
  context: readonly string[]
  contextName: string
  symbolsOnly: boolean
  tr: (k: string, a?: Record<string, string | number>) => string
}): PalGroup[] {
  const out: PalGroup[] = []
  const push = (g: PalGroup) => g.items.length && out.push(g)
  const on = (s: Scope) => !o.symbolsOnly && (o.scope === 'all' || o.scope === s)
  const actById = new Map(o.actions.map((a) => [a.id, a]))
  const q = o.q
  if (!q) {
    if (o.symbolsOnly) return out
    // 最近の銘柄（範囲が「銘柄」のときも）
    if (o.scope === 'all' || o.scope === 'sym')
      push({
        id: 'recentSyms',
        title: o.tr('cmd.recentSyms'),
        chips: true,
        tags: false,
        items: o.recentSyms.map((id) => ({ kind: 'sym', id, ranges: [] })),
      })
    if (o.scope === 'all') {
      const acts = (ids: readonly string[]) => ids.filter((id) => actById.has(id)).map((id) => ({ kind: 'act' as const, id, ranges: [] }))
      push({ id: 'recentActs', title: o.tr('cmd.recentActs'), tags: true, items: acts(o.recentActs) })
      push({ id: 'context', title: o.tr('cmd.context', { name: o.contextName }), tags: true, items: acts(o.context) })
    }
    if (o.scope === 'scr')
      push({ id: 'screens', title: o.tr('cmd.screens'), tags: false, items: o.screens.map((s) => ({ kind: 'scr', id: s.id, ranges: [] })) })
    if (o.scope === 'pane')
      push({ id: 'panes', title: o.tr('cmd.paneType'), tags: false, items: o.widgets.map((w) => ({ kind: 'pane', id: w.id, ranges: [] })) })
    if (o.scope === 'all' || o.scope === 'act')
      for (const g of ACTION_GROUPS)
        push({
          id: `ag:${g}`,
          title: o.tr(`agroup.${g}`),
          tags: false,
          items: o.actions.filter((a) => a.group === g).map((a) => ({ kind: 'act', id: a.id, ranges: [] })),
        })
    return out
  }
  if (o.symbolsOnly || o.scope === 'all' || o.scope === 'sym') {
    const code = q.toUpperCase()
    const items: PalItem[] = []
    for (const s of o.syms) {
      const codeHit = s.code.startsWith(code) ? code.length : 0
      const m = matchText(q, s.name)
      items.push({ kind: 'sym', id: s.id, ranges: m?.ranges ?? [], ...(codeHit ? { codeHit } : {}) })
      // 一覧にあっても取得の対象外（スタンダード・グロース・ETF など）なら「追加して取得する」も（FR-U3）
      if (s.code === code && s.tracked === false) items.push({ kind: 'add', code })
    }
    // 一覧に無いコードは「追加して取得する」を先頭に（FR-U3）
    if (CODE_RE.test(code) && !o.syms.some((s) => s.code === code)) items.unshift({ kind: 'add', code })
    push({ id: 'syms', title: o.tr('cmd.symbols'), tags: false, items })
  }
  if (on('scr'))
    push({
      id: 'screens',
      title: o.tr('cmd.screens'),
      tags: false,
      items: rankBy(q, o.screens, (s) => s.name).map(({ item, m }) => ({ kind: 'scr', id: item.id, ranges: m.ranges })),
    })
  if (on('act'))
    push({
      id: 'acts',
      title: o.tr('cmd.actions'),
      tags: true,
      items: rankBy(
        q,
        o.actions,
        (a) => a.label,
        (a) => [a.id, o.tr(`agroup.${a.group}`), a.key],
      ).map(({ item, m }) => ({ kind: 'act', id: item.id, ranges: m.ranges })),
    })
  if (on('pane'))
    push({
      id: 'panes',
      title: o.tr('cmd.paneType'),
      tags: false,
      items: rankBy(
        q,
        o.widgets,
        (w) => w.name,
        (w) => w.alias,
      ).map(({ item, m }) => ({ kind: 'pane', id: item.id, ranges: m.ranges })),
    })
  if (o.scope === 'all' && !o.symbolsOnly) {
    const ks = rankBy(
      q,
      o.paneKeys,
      (k) => k.label,
      (k) => [...k.alias, k.grp],
    )
    push({
      id: 'paneKeys',
      title: o.tr('cmd.paneKeys'),
      tags: true,
      items: ks.slice(0, PANE_KEYS_MAX).map(({ item, m }) => ({ kind: 'key', index: o.paneKeys.indexOf(item), ranges: m.ranges })),
      ...(ks.length > PANE_KEYS_MAX ? { more: ks.length - PANE_KEYS_MAX } : {}),
    })
  }
  return out
}

/** 最近使ったもの（'sym:<ID>'・'act:<ID>'）を、銘柄（6 件まで）とアクション（3 件まで）に分ける */
export function recentOf(list: readonly string[]): { syms: InstrumentId[]; acts: string[] } {
  return {
    syms: list
      .filter((k) => k.startsWith('sym:'))
      .map((k) => k.slice(4) as InstrumentId)
      .slice(0, 6),
    acts: list
      .filter((k) => k.startsWith('act:'))
      .map((k) => k.slice(4))
      .slice(0, 3),
  }
}
/** 銘柄の行の終値（言語の書き方。無ければ空） */
export const fmtClose = (v: number | null | undefined, lang: 'ja' | 'en') =>
  v == null ? '' : v.toLocaleString(lang === 'en' ? 'en-US' : 'ja-JP', { maximumFractionDigits: 1 })
/** 銘柄の行の前日比（%。上がったら +） */
export const fmtChgPct = (v: number | null | undefined) => (v == null ? '' : `${v > 0 ? '+' : ''}${v.toFixed(2)}%`)
/** 取得の対象の銘柄か（プライム・REIT・指数・追加した銘柄）。対象外なら「追加して取得する」も出す（FR-U3） */
export const isTracked = (i: { userAdded?: boolean; market: string }) =>
  !!i.userAdded || i.market === 'P' || i.market === 'R' || i.market === 'I'

/** ↑ ↓ で移る先（chips[i] は i 番目の候補が最近の銘柄のチップか）。チップの行は 1 段として飛ぶ: チップの上の ↓ は最初の行へ、最初の行の ↑ はチップの先頭へ */
export function moveRow(chips: readonly boolean[], sel: number, d: 1 | -1): number {
  if (chips[sel]) {
    const j = d > 0 ? chips.indexOf(false) : -1
    return j >= 0 ? j : sel
  }
  const j = sel + d
  if (j < 0 || j >= chips.length) return sel
  return chips[j] ? chips.indexOf(true) : j
}
