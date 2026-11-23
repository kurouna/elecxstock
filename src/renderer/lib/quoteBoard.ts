// 株価ボード（ヒートマップのペインのカードの表示。docs/design-quote-board.md。FR-QB1〜QB8）の純粋な関数。
// 画面（QuoteBoard.svelte）は描くだけで、状態の読み取り・出どころ・並べ替え・分類・騰落の数・基準日・カードの移動はここで決める。
// ヒートマップ（Heatmap.svelte）の状態（period・sector・starOnly）は読まない。株価ボードの状態のキーはすべて qb で始める
import { dayOfWeek, prevTradingDay } from '@shared/calendar'
import { TOPIX_ETF } from '@shared/markets'
import type { Holding, InstrumentId, JstDate, MetricsRow, SavedScreen, Watchlist } from '@shared/types'

export type QbView = 'map' | 'board'
export type QbSort = 'reg' | 'pctD' | 'pctA' | 'valD'
export type QbGroup = 'none' | 'sector' | 'kind'
/**
 * カードの大きさの段（`qbSize`）。1〜3 は前からの段（保存済みのレイアウトはそのまま読む）。0 は縮小・4〜6 は拡大の方向に足した段。
 * 段の範囲はここだけで決める（型・上限・下限はここから作る。段ごとの見た目は QuoteBoard.svelte の .grid.s<段>。揃っていることは単体テストが確かめる）
 */
export const QB_SIZES = [0, 1, 2, 3, 4, 5, 6] as const
export type QbSize = (typeof QB_SIZES)[number]
export const QB_SIZE_MIN: QbSize = QB_SIZES[0]
export const QB_SIZE_MAX: QbSize = QB_SIZES[QB_SIZES.length - 1]!

/** 今の段が何段目か（1 から数える）と段の数。−／＋のツールチップの「4/7」 */
export function sizePos(size: QbSize): { n: number; total: number } {
  return { n: QB_SIZES.indexOf(size) + 1, total: QB_SIZES.length }
}

export interface QbState {
  view: QbView
  /** 一覧の出どころ（cap・wl:<id>・held・scr:<id>） */
  src: string
  sort: QbSort
  group: QbGroup
  size: QbSize
  /** 指数のカードを出すか */
  idx: boolean
  /** ★のみ（ヒートマップの starOnly とは別） */
  star: boolean
}

export const QB_SORTS: readonly QbSort[] = ['reg', 'pctD', 'pctA', 'valD']
export const QB_GROUPS: readonly QbGroup[] = ['none', 'sector', 'kind']
/** 時価総額の上位（プライムの株式と J-REIT を分けて取る。J-REIT はプライムの上位にほぼ入らないため） */
export const QB_TOP = { stock: 90, reit: 10 } as const
/** 1 行目の指数のカード（src/shared/markets.ts の MARKET_REFS の東証の行） */
export const QB_INDEX_IDS: readonly InstrumentId[] = ['IDX:N225', TOPIX_ETF, 'JP:1343']

const DEFAULT: QbState = { view: 'map', src: 'cap', sort: 'reg', group: 'none', size: 2, idx: true, star: false }

/** pane.state から株価ボードの状態を読む。型・範囲を確かめ、無い値・壊れた値・知らない値は既定にする */
export function readQbState(state: Record<string, unknown> | null | undefined): QbState {
  const s = state ?? {}
  const pick = <T>(v: unknown, ok: readonly T[], d: T): T => (ok.includes(v as T) ? (v as T) : d)
  return {
    view: pick(s.qbView, ['map', 'board'] as const, DEFAULT.view),
    src: typeof s.qbSrc === 'string' && isSourceShape(s.qbSrc) ? s.qbSrc : DEFAULT.src,
    sort: pick(s.qbSort, QB_SORTS, DEFAULT.sort),
    group: pick(s.qbGroup, QB_GROUPS, DEFAULT.group),
    size: pick(s.qbSize, QB_SIZES, DEFAULT.size),
    idx: typeof s.qbIdx === 'boolean' ? s.qbIdx : DEFAULT.idx,
    star: typeof s.qbStar === 'boolean' ? s.qbStar : DEFAULT.star,
  }
}
const isSourceShape = (s: string) => s === 'cap' || s === 'held' || /^(wl|scr):.+/.test(s)

/** 出どころの並び（タブの順）: 時価総額の上位・ウォッチリスト（組み込みが先）・保有・保存したスクリーニング条件 */
export function sourceList(watchlists: readonly Watchlist[], screens: readonly SavedScreen[]): string[] {
  const wl = [...watchlists.filter((w) => w.builtin), ...watchlists.filter((w) => !w.builtin)]
  return ['cap', ...wl.map((w) => `wl:${w.id}`), 'held', ...screens.map((s) => `scr:${s.id}`)]
}

/** 出どころの解決。消したウォッチリスト・スクリーンを指していたら cap に戻す */
export function resolveSource(src: string, deps: { watchlists: readonly Watchlist[]; screens: readonly SavedScreen[] }): string {
  if (src.startsWith('wl:')) return deps.watchlists.some((w) => `wl:${w.id}` === src) ? src : 'cap'
  if (src.startsWith('scr:')) return deps.screens.some((s) => `scr:${s.id}` === src) ? src : 'cap'
  return src === 'held' ? 'held' : 'cap'
}

/** 次（d = 1）・前（d = -1）の出どころ。一巡する */
export function stepSource(src: string, list: readonly string[], d: 1 | -1): string {
  if (!list.length) return 'cap'
  const i = list.indexOf(src)
  return list[(((Math.max(i, 0) + d) % list.length) + list.length) % list.length]!
}

/** 保有の銘柄（ウォッチリストの「保有」タブ（Watchlist.svelte の holdingsList）と同じ: 数量 > 0・重複なし・コード順） */
export function heldIds(holdings: readonly Holding[]): InstrumentId[] {
  return [...new Set(holdings.filter((h) => h.quantity > 0).map((h) => `JP:${h.code}` as InstrumentId))].sort()
}

/** 時価総額の上位 n（値の無い銘柄は外す。同じ値は元の並び） */
export function topByCap(ids: readonly InstrumentId[], cap: (id: InstrumentId) => number | null | undefined, n: number): InstrumentId[] {
  return ids
    .map((id, i) => ({ id, i, c: cap(id) }))
    .filter((x): x is { id: InstrumentId; i: number; c: number } => x.c != null && Number.isFinite(x.c) && x.c > 0)
    .sort((a, b) => b.c - a.c || a.i - b.i)
    .slice(0, n)
    .map((x) => x.id)
}

export interface QbItem {
  id: InstrumentId
  m: MetricsRow | undefined
  /** 業種（日本語。分類の見出しのキー） */
  sector: string
  reit: boolean
}
export interface QbGroupRows {
  /** null は分類なし。業種の名前、または 'stock' / 'reit' */
  key: string | null
  items: QbItem[]
}

const pctOf = (x: QbItem) => x.m?.chgPct ?? null
const valOf = (x: QbItem) => x.m?.turnover ?? null

/** 並べ替え（値の無い銘柄は最後。同じ値は元の並び）・★のみ・分類（分類の順は最初に出た順） */
export function boardRows(
  items: readonly QbItem[],
  sort: QbSort,
  group: QbGroup,
  starOnly: boolean,
  isFav: (id: InstrumentId) => boolean,
): QbGroupRows[] {
  const list = items.filter((x) => !starOnly || isFav(x.id)).map((x, i) => ({ x, i }))
  if (sort !== 'reg') {
    const v = sort === 'valD' ? valOf : pctOf
    const dir = sort === 'pctA' ? 1 : -1
    list.sort((a, b) => {
      const va = v(a.x)
      const vb = v(b.x)
      if (va == null || vb == null) return va == null && vb == null ? a.i - b.i : va == null ? 1 : -1
      return (va - vb) * dir || a.i - b.i
    })
  }
  const sorted = list.map((e) => e.x)
  if (group === 'none') return [{ key: null, items: sorted }]
  // 業種の無い銘柄（ETF など）は「—」（ヒートマップの sectorTileKey と同じ）
  const keyOf = (x: QbItem) => (group === 'sector' ? x.sector || '—' : x.reit ? 'reit' : 'stock')
  const by = new Map<string, QbItem[]>()
  for (const x of sorted) {
    const k = keyOf(x)
    const g = by.get(k)
    if (g) g.push(x)
    else by.set(k, [x])
  }
  return [...by].map(([key, items]) => ({ key, items }))
}

export interface QbBreadth {
  up: number
  down: number
  flat: number
  /** 未更新（基準日が最新の営業日より前）の数。上昇・下落・平均には入れない */
  stale: number
  /** 騰落率の単純平均（数える銘柄が無ければ null） */
  avgPct: number | null
}

/** 騰落の数。未更新（stale）と値の無い銘柄（close == null・前日比が数でない）は数えない。値の無い銘柄は未更新にも数えない */
export function boardBreadth(items: readonly QbItem[]): QbBreadth {
  let up = 0
  let down = 0
  let flat = 0
  let stale = 0
  let sum = 0
  let n = 0
  for (const { m } of items) {
    if (!m || m.close == null) continue
    if (m.stale) {
      stale++
      continue
    }
    if (m.chg == null || m.chgPct == null || !Number.isFinite(m.chg) || !Number.isFinite(m.chgPct)) continue
    if (m.chg > 0) up++
    else if (m.chg < 0) down++
    else flat++
    sum += m.chgPct
    n++
  }
  return { up, down, flat, stale, avgPct: n ? sum / n : null }
}

/** 基準日（表示中の銘柄の asOf の最も新しい日）と、その前の営業日。その日の値に仮の足（FR-D8）が混じるか */
export function boardAsOf(items: readonly QbItem[]): { date: JstDate | null; prev: JstDate | null; provisional: boolean } {
  let date: JstDate | null = null
  for (const { m } of items) if (m?.asOf && (date == null || m.asOf > date)) date = m.asOf
  if (date == null) return { date: null, prev: null, provisional: false }
  const provisional = items.some(({ m }) => m?.asOf === date && m.provisional)
  return { date, prev: prevTradingDay(date), provisional }
}

/** カードの矩形（offsetLeft・offsetTop・offsetWidth・offsetHeight。CSS の px で、表示倍率と最大化の transform に左右されない） */
export interface QbRect {
  x: number
  y: number
  w: number
  h: number
}
export type QbMove = 'left' | 'right' | 'up' | 'down' | 'pageUp' | 'pageDown' | 'home' | 'end'

/**
 * カードの格子での移動。← → は読む順（端で止まる）、↑ ↓ は上下の行で横の位置が最も近いカード（分類の見出しをまたぐ。最後の短い行にも入る）、
 * PgUp / PgDn は ↑ ↓ を rowsPerPage 回。空なら 0
 */
export function boardMove(rects: readonly QbRect[], cur: number, dir: QbMove, rowsPerPage = 1): number {
  const n = rects.length
  if (!n) return 0
  const c = Math.max(0, Math.min(cur, n - 1))
  if (dir === 'home') return 0
  if (dir === 'end') return n - 1
  if (dir === 'left') return Math.max(0, c - 1)
  if (dir === 'right') return Math.min(n - 1, c + 1)
  const step = dir === 'up' || dir === 'pageUp' ? -1 : 1
  const times = dir === 'pageUp' || dir === 'pageDown' ? Math.max(1, rowsPerPage) : 1
  let at = c
  for (let k = 0; k < times; k++) {
    const next = vertical(rects, at, step)
    if (next < 0) break
    at = next
  }
  return at
}
function vertical(rects: readonly QbRect[], cur: number, step: 1 | -1): number {
  const r = rects[cur]!
  const cy = r.y + r.h / 2
  const cx = r.x + r.w / 2
  // 次の行（上なら下端が今の行の上にある中で最も下、下なら上端が今の行の下にある中で最も上）
  let rowY: number | null = null
  for (const q of rects) {
    const qy = q.y + q.h / 2
    if (step > 0 ? qy <= cy + 0.5 : qy >= cy - 0.5) continue
    if (rowY == null || (step > 0 ? q.y < rowY : q.y > rowY)) rowY = q.y
  }
  if (rowY == null) return -1
  let best = -1
  let bestD = Number.POSITIVE_INFINITY
  rects.forEach((q, i) => {
    if (Math.abs(q.y - rowY!) > 0.5) return
    const d = Math.abs(q.x + q.w / 2 - cx)
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  return best
}

/** 前日終値（終値 − 前日比。どちらかが無ければ null） */
export function prevCloseOf(m: Pick<MetricsRow, 'close' | 'chg'> | undefined): number | null {
  return m?.close != null && m.chg != null && Number.isFinite(m.close) && Number.isFinite(m.chg) ? m.close - m.chg : null
}

/** 騰落の帯の棒の割合（%。上昇・変わらず・下落の合計が 100。数える銘柄が無ければすべて 0） */
export function breadthShares(b: Pick<QbBreadth, 'up' | 'flat' | 'down'>): { up: number; flat: number; down: number } {
  const n = b.up + b.flat + b.down
  if (!n) return { up: 0, flat: 0, down: 0 }
  return { up: (b.up / n) * 100, flat: (b.flat / n) * 100, down: (b.down / n) * 100 }
}

/** カードの大きさを d だけ変える（QB_SIZE_MIN〜QB_SIZE_MAX で止まる） */
export const stepSize = (size: QbSize, d: 1 | -1): QbSize => Math.max(QB_SIZE_MIN, Math.min(QB_SIZE_MAX, size + d)) as QbSize

/** 一覧の次の値（並べ替え・分類の S・B。一巡する。知らない値からは先頭の次） */
export function nextOf<T>(list: readonly T[], cur: T): T {
  const i = list.indexOf(cur)
  return list[(Math.max(i, 0) + 1) % list.length]!
}

/** 見えている行の数（PgUp / PgDn の 1 回分。少なくとも 1） */
export function rowsInView(viewHeight: number, cardHeight: number): number {
  if (!(cardHeight > 0)) return 1
  return Math.max(1, Math.floor(viewHeight / cardHeight) - 1)
}

const WD = { ja: ['日', '月', '火', '水', '木', '金', '土'], en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] } as const
/** 見出しの日付（ja: 11/13(金)、en: 11/13 (Fri)）。PC の時刻帯に依存させない */
export function dayLabel(d: JstDate, lang: 'ja' | 'en'): string {
  const [, m, dd] = d.split('-')
  const w = WD[lang][dayOfWeek(d)]
  return lang === 'ja' ? `${Number(m)}/${Number(dd)}(${w})` : `${Number(m)}/${Number(dd)} (${w})`
}
/** カードの短い日付（11/12） */
export const shortDate = (d: JstDate): string => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`

/**
 * 前日比の色（cls）と矢印。表示の桁（digits）で丸めて 0 になる値は変わらず（flat・矢印なし）にし、
 * 符号の書き方（format.ts の sgn が「±」と書く）とそろえる（▲±0 を上昇の色で出さない）。値が無ければ色も矢印も無し
 */
export function chgView(chg: number | null | undefined, digits: number): { cls: '' | 'up' | 'down' | 'flat'; arrow: '' | '▲' | '▼' } {
  if (chg == null || !Number.isFinite(chg)) return { cls: '', arrow: '' }
  if (Math.round(Math.abs(chg) * 10 ** digits) === 0) return { cls: 'flat', arrow: '' }
  return chg > 0 ? { cls: 'up', arrow: '▲' } : { cls: 'down', arrow: '▼' }
}

/**
 * 出どころの取り直しを始めるときの一覧。同じ出どころの取り直し（取得の終わり・★の付け外し）の間は前の一覧のまま
 * （CLAUDE.md「新しい値が届いてから置き換える」。読み込み中に戻すと選択が先頭へ飛ぶ）。別の出どころへ替えたときだけ null（読み込み中）
 */
export function keepIdsWhileLoading(prevSrc: string | null, src: string, prevIds: InstrumentId[] | null): InstrumentId[] | null {
  return prevSrc === src ? prevIds : null
}
