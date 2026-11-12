// 一覧の列（FR-SC3, §6.3 watchlist の「列の選択」）。指標の列は登録表（FR-FD1）から作る。
// watchlist・screener・ranking・portfolio が同じ列の定義を使い、Ctrl+Shift+C で選ぶ・並べ替える。
import { FIELDS, type FieldDef, usable } from '@shared/fields'
import type { InstrumentId, MetricsRow } from '@shared/types'
import { app, checklistDialog, inst, metric, t } from '../stores/app.svelte'
import { cls, date, fmt, money, px, sgn } from './format'
import type { Key } from './i18n'

export interface Cell {
  t: string
  u?: string
  c?: string
}
export interface ListCol {
  id: string
  label: () => string
  w?: number
  /** 左揃え（文字の列） */
  l?: boolean
  /** 並べ替えの値。無い列は並べ替えない */
  sort?: (id: InstrumentId) => number | string | null
  cell: (id: InstrumentId) => Cell
  /** 列の選択で外せない列 */
  fixed?: boolean
}

const mv = (id: InstrumentId, col: string) => (metric(id) as unknown as Record<string, number | null> | undefined)?.[col] ?? null

function fieldCell(f: FieldDef, v: number | null): Cell {
  if (v == null) return { t: '—' }
  switch (f.type) {
    case 'money': {
      if (f.source.kind === 'metrics' && ['close', 'ma25', 'ma75', 'ma200', 'hi52', 'lo52'].includes(f.source.column)) return { t: px(v) }
      const m = money(v)
      return { t: m.n, u: m.u }
    }
    case 'percent':
      return f.category === 'return' || f.id === 'price.chgPct' || f.category === 'technical'
        ? { t: sgn(v, f.digits ?? 1, ''), u: '%', c: cls(v) }
        : { t: fmt(v, f.digits ?? 2), u: '%' }
    case 'ratio':
      return { t: fmt(v, f.digits ?? 2) }
    default:
      return { t: fmt(v, f.digits ?? 0) }
  }
}

/** 列の幅（指標の種類から） */
const widthOf = (f: FieldDef) => (f.type === 'money' ? 76 : f.type === 'percent' ? 64 : 58)
/** 見出しは短く（指標の登録表の名前を使い、長いものは列用の短い名前） */
const SHORT: Record<string, Key> = {
  'price.close': 'col.close',
  'price.chgPct': 'col.chg',
  'income.yield': 'col.yield',
  'liq.turnover20': 'col.turnover',
  'value.per': 'col.per',
  'value.pbr': 'col.pbr',
  'ret.1y': 'col.ret1y',
}

export const COLUMNS: ListCol[] = [
  { id: 'star', label: () => '', w: 24, l: true, fixed: true, cell: () => ({ t: '' }) },
  { id: 'code', label: () => t('col.code'), w: 52, l: true, fixed: true, sort: (id) => inst(id)?.code ?? id, cell: () => ({ t: '' }) },
  { id: 'name', label: () => t('col.name'), l: true, fixed: true, cell: () => ({ t: '' }) },
  {
    id: 'mkt',
    label: () => t('col.mkt'),
    w: 70,
    l: true,
    sort: (id) => inst(id)?.market ?? '',
    cell: (id) => {
      const i = inst(id)
      return { t: i ? t(`mkt.${i.market}` as Key) : '', c: 'dim' }
    },
  },
  {
    id: 'sector',
    label: () => t('col.sector'),
    w: 110,
    l: true,
    sort: (id) => inst(id)?.sectorJa ?? '',
    cell: (id) => {
      const i = inst(id)
      return { t: (app.settings.lang === 'en' ? i?.sectorEn || i?.sectorJa : i?.sectorJa) || '—', c: 'dim' }
    },
  },
  ...FIELDS.filter((f) => usable(f) && f.source.kind === 'metrics' && f.type !== 'enum').map(
    (f): ListCol => ({
      id: f.id,
      label: () => (SHORT[f.id] ? t(SHORT[f.id]!) : f.label[app.settings.lang]),
      w: widthOf(f),
      sort: (id) => mv(id, (f.source as { column: string }).column),
      cell: (id) => fieldCell(f, mv(id, (f.source as { column: string }).column)),
    }),
  ),
  {
    id: 'recordMonths',
    label: () => t('col.recordMonths'),
    w: 72,
    sort: (id) => metric(id)?.recordMonths[0] ?? null,
    cell: (id) => ({ t: metric(id)?.recordMonths.join('・') || '—' }),
  },
  {
    id: 'asOf',
    label: () => t('col.asOf'),
    w: 84,
    sort: (id) => metric(id)?.asOf ?? null,
    cell: (id) => ({ t: date(metric(id)?.asOf), c: 'dim' }),
  },
]
export const COLUMN_BY_ID = new Map(COLUMNS.map((c) => [c.id, c]))
// 以前の版で保存した並べ替えのキー（metrics の列名）も引けるようにする
for (const [old, id] of [
  ['close', 'price.close'],
  ['chgPct', 'price.chgPct'],
  ['yieldTrailing', 'income.yield'],
  ['turnover20', 'liq.turnover20'],
] as const)
  COLUMN_BY_ID.set(old, COLUMN_BY_ID.get(id)!)

export const DEFAULT_COLUMNS = {
  watchlist: ['star', 'code', 'name', 'price.close', 'price.chgPct', 'income.yield', 'liq.turnover20'],
  screener: ['star', 'code', 'name', 'mkt', 'price.close', 'income.yield', 'value.per', 'value.pbr', 'liq.turnover20', 'ret.1y'],
}

/** ペインの状態などに保存した列の ID から、使える列を並べる（知らない ID は捨て、固定の列は必ず先頭に置く） */
export function resolveColumns(ids: string[] | undefined, fallback: string[]): ListCol[] {
  const want = ids?.length ? ids : fallback
  const fixed = COLUMNS.filter((c) => c.fixed)
  const rest = want.map((id) => COLUMN_BY_ID.get(id)).filter((c): c is ListCol => !!c && !c.fixed)
  return [...fixed, ...rest]
}

/** 列の選択（Ctrl+Shift+C）。選んだ列の ID を順番どおりに返す */
export async function chooseColumns(current: ListCol[]): Promise<string[] | null> {
  const on = new Set(current.map((c) => c.id))
  const order = [...current.filter((c) => !c.fixed), ...COLUMNS.filter((c) => !c.fixed && !on.has(c.id))]
  const r = await checklistDialog(
    t('cols.title'),
    order.map((c) => ({ id: c.id, label: c.label() || c.id, on: on.has(c.id) })),
    true,
  )
  if (!r) return null
  return [...COLUMNS.filter((c) => c.fixed).map((c) => c.id), ...r.filter((x) => x.on).map((x) => x.id)]
}

/** 並べ替え（欠損は最後） */
export function sortIds(ids: InstrumentId[], col: ListCol | undefined, dir: 1 | -1): InstrumentId[] {
  if (!col?.sort) return ids
  const f = col.sort
  const key = new Map(ids.map((id) => [id, f(id)]))
  return [...ids].sort((a, b) => {
    const x = key.get(a)
    const y = key.get(b)
    if (x == null && y == null) return 0
    if (x == null) return 1
    if (y == null) return -1
    return (x < y ? -1 : x > y ? 1 : 0) * dir
  })
}

/** CSV（FR-SC6, W8）。Excel で文字化けしないよう BOM を付ける */
export function toCsv(ids: InstrumentId[], cols: ListCol[], nameOf: (id: InstrumentId) => string): string {
  const use = cols.filter((c) => c.id !== 'star')
  const esc = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s)
  const head = use.map((c) => esc(c.id === 'code' ? 'code' : c.id === 'name' ? 'name' : c.id))
  const raw = (id: InstrumentId, c: ListCol): string => {
    if (c.id === 'code') return inst(id)?.code ?? id.replace(/^\w+:/, '')
    if (c.id === 'name') return nameOf(id)
    const v = c.sort?.(id)
    if (typeof v === 'number') return String(Math.round(v * 1e6) / 1e6)
    return v == null ? '' : c.cell(id).t
  }
  return `﻿${[head.join(','), ...ids.map((id) => use.map((c) => esc(raw(id, c))).join(','))].join('\r\n')}\r\n`
}

export type { MetricsRow }
