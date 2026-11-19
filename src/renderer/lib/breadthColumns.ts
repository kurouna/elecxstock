// 騰落のペインの市場・業種別の表の列（§6.17, FR-BR2〜BR3。設計: docs/design-breadth.md）。
// 銘柄の一覧の列（lib/columns.ts）と同じ形（見出し・幅・並べ替えの値・セル）で持ち、ペインは同じ表（table.grid）に描く
import type { BreadthRow } from '@shared/breadth'
import { checklistDialog, t } from '../stores/app.svelte'
import type { Cell } from './columns'
import { cls, fmt, money, sgn } from './format'
import type { Key } from './i18n'

export type BreadthTab = 'market' | 'sector'
export interface BreadthCol {
  id: string
  label: () => string
  w?: number
  l?: boolean
  /** 列の選択で外せない列（名前） */
  fixed?: boolean
  sort: (r: BreadthRow) => number | string | null
  cell: (r: BreadthRow, name: (key: string) => string) => Cell
}

const count = (id: string, key: Key, v: (r: BreadthRow) => number, tone?: 1 | -1): BreadthCol => ({
  id,
  label: () => t(key),
  w: 64,
  sort: v,
  cell: (r) => ({ t: fmt(v(r), 0), ...(tone && v(r) ? { c: cls(tone) } : {}) }),
})
const pct = (id: string, key: Key, v: (r: BreadthRow) => number | null): BreadthCol => ({
  id,
  label: () => t(key),
  w: 64,
  sort: v,
  cell: (r) => {
    const x = v(r)
    const d = Math.abs(x ?? 0) >= 100 ? 1 : 2
    return x == null ? { t: '—' } : { t: sgn(x, d, ''), u: '%', c: cls(x, d) }
  },
})
const NAME = (key: Key): BreadthCol => ({
  id: 'name',
  label: () => t(key),
  l: true,
  fixed: true,
  sort: (r) => r.key,
  cell: (r, name) => ({ t: name(r.key) }),
})
const N = count('n', 'br.col.n', (r) => r.n)
const UP = count('up', 'br.col.up', (r) => r.up, 1)
const DOWN = count('down', 'br.col.down', (r) => r.down, -1)
const FLAT = count('flat', 'br.col.flat', (r) => r.flat)
const HI = count('newHi', 'br.col.newHi', (r) => r.newHi, 1)
const LO = count('newLo', 'br.col.newLo', (r) => r.newLo, -1)
const TURNOVER: BreadthCol = {
  id: 'turnover',
  label: () => t('br.col.turnover'),
  w: 84,
  sort: (r) => r.turnover,
  cell: (r) => {
    const m = money(r.turnover)
    return { t: m.n, u: m.u }
  },
}
const D1 = pct('d1', 'br.col.d1', (r) => r.ret.d1)

export const BREADTH_COLUMNS: Record<BreadthTab, BreadthCol[]> = {
  market: [NAME('br.col.market'), D1, UP, DOWN, FLAT, HI, LO, TURNOVER, N],
  sector: [
    NAME('br.col.sector'),
    D1,
    pct('m1', 'br.col.m1', (r) => r.ret.m1),
    pct('m3', 'br.col.m3', (r) => r.ret.m3),
    pct('ytd', 'br.col.ytd', (r) => r.ret.ytd),
    pct('y1', 'br.col.y1', (r) => r.ret.y1),
    UP,
    DOWN,
    HI,
    LO,
    TURNOVER,
    N,
  ],
}
/**
 * 既定の列（市場は全部、業種別は騰落率と上げ下げの数・売買代金・銘柄数）。幅の狭いペインでは右から隠すので、
 * 大事な前日比を名前のすぐ右に、銘柄数を最後に置く
 */
export const DEFAULT_BREADTH_COLUMNS: Record<BreadthTab, string[]> = {
  market: ['name', 'd1', 'up', 'down', 'flat', 'newHi', 'newLo', 'turnover', 'n'],
  sector: ['name', 'd1', 'm1', 'm3', 'ytd', 'y1', 'up', 'down', 'turnover', 'n'],
}
/** 既定の並べ替え（業種別は 1日の騰落率の高い順。市場は登録の順） */
export const DEFAULT_BREADTH_SORT: Record<BreadthTab, { k: string; dir: 1 | -1 } | undefined> = {
  market: undefined,
  sector: { k: 'd1', dir: -1 },
}

/** 保存した列の ID から列を並べる（知らない ID は捨て、名前の列は必ず先頭） */
export function resolveBreadthColumns(tab: BreadthTab, ids: string[] | undefined): BreadthCol[] {
  const all = BREADTH_COLUMNS[tab]
  const want = ids?.length ? ids : DEFAULT_BREADTH_COLUMNS[tab]
  const by = new Map(all.map((c) => [c.id, c]))
  return [...all.filter((c) => c.fixed), ...want.map((id) => by.get(id)).filter((c): c is BreadthCol => !!c && !c.fixed)]
}

/** 並べ替え（欠損は最後。lib/columns.ts の sortIds と同じ決まり） */
export function sortBreadth(rows: BreadthRow[], col: BreadthCol | undefined, dir: 1 | -1): BreadthRow[] {
  if (!col) return rows
  const key = new Map(rows.map((r) => [r, col.sort(r)]))
  return [...rows].sort((a, b) => {
    const x = key.get(a)
    const y = key.get(b)
    if (x == null && y == null) return 0
    if (x == null) return 1
    if (y == null) return -1
    return (x < y ? -1 : x > y ? 1 : 0) * dir
  })
}

/** 列の選択（Ctrl+Shift+C）。ウォッチリストと同じダイアログで、この表の列から選ぶ */
export async function chooseBreadthColumns(tab: BreadthTab, current: BreadthCol[]): Promise<string[] | null> {
  const on = new Set(current.map((c) => c.id))
  const all = BREADTH_COLUMNS[tab]
  const order = [...current.filter((c) => !c.fixed), ...all.filter((c) => !c.fixed && !on.has(c.id))]
  const r = await checklistDialog(
    t('cols.title'),
    order.map((c) => ({ id: c.id, label: c.label(), on: on.has(c.id) })),
    true,
  )
  if (!r) return null
  return [...all.filter((c) => c.fixed).map((c) => c.id), ...r.filter((x) => x.on).map((x) => x.id)]
}
