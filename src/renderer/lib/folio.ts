// ポートフォリオのペイン（folio。docs/design-portfolio.md・FR-PF1〜PF8）の画面のロジック。コンポーネントには計算を書かず、ここに置く。
// 値の材料（保有・指標・銘柄・Core の記録と配当の分析）を受け取り、カードに出す形を返す純粋な関数（L4 のテストで確かめる）。
import { addDays } from '@shared/calendar'
import {
  bridge,
  byMonth,
  concentration,
  cyclicalShare,
  DIVIDEND_TAX,
  decompose,
  dpsCagr,
  dpsStreak,
  heatMix,
  heatStep,
  netRate,
  nextMonths,
  payoutRatio,
  twr,
} from '@shared/folio'
import { sector17Of } from '@shared/sectors'
import type {
  AccountType,
  FolioAt,
  FolioContrib,
  FolioDividends,
  FolioPos,
  FolioSeriesPoint,
  Holding,
  Instrument,
  JstDate,
  MetricsRow,
} from '@shared/types'
import { secret } from './privacy.svelte'
import { type Placed, squarify } from './treemap'

// ---------------- 状態とキー ----------------
/** Tab で巡るカード（FR-PF6） */
export const CARDS = ['hist', 'alloc', 'contrib', 'div', 'events', 'dshare', 'dtab'] as const
export type Card = (typeof CARDS)[number]
export function nextCard(cur: Card | null, back: boolean): Card {
  const i = cur ? CARDS.indexOf(cur) : back ? 0 : -1
  return CARDS[(i + (back ? -1 : 1) + CARDS.length) % CARDS.length]!
}
/** 資産推移の期間（記録・1M・3M・6M・1Y・全。Alt+1〜6） */
export const HIST_PERIODS: { key: string; bars: number }[] = [
  { key: 'rec', bars: 0 },
  { key: '1M', bars: 21 },
  { key: '3M', bars: 63 },
  { key: '6M', bars: 126 },
  { key: '1Y', bars: 250 },
  { key: 'all', bars: Number.POSITIVE_INFINITY },
]
export const ALLOC_GROUPS = ['sector', 'sector17', 'acct', 'kind', 'code'] as const
export type AllocGroup = (typeof ALLOC_GROUPS)[number]
export const DIV_GROUPS = ['code', 'sector', 'sector17', 'market', 'kind', 'acct'] as const
export type DivGroup = (typeof DIV_GROUPS)[number]
/** 配当の表の並べ替え（code は銘柄コードの昇順。ほかは大きい順） */
export const DIV_SORTS = ['code', 'annual', 'delta', 'yield', 'yoc', 'cagr'] as const
export type DivSort = (typeof DIV_SORTS)[number]
export const CONTRIB_PERIODS = ['day', 'month', 'year', 'all'] as const
export type ContribPeriod = (typeof CONTRIB_PERIODS)[number]
export const BENCHES = ['', 'IDX:N225', 'JP:1306'] as const

/** ペインに保存する表示の状態（pane.state.folio） */
export interface FolioView {
  period: number
  pct: boolean
  bench: number
  est: boolean
  group: number
  heat: number
  contrib: number
  dgroup: number
  dsort: number
}
export const DEFAULT_VIEW: FolioView = { period: 0, pct: false, bench: 0, est: false, group: 0, heat: 0, contrib: 0, dgroup: 0, dsort: 0 }
export function viewOf(raw: unknown): FolioView {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<FolioView>
  const int = (v: unknown, n: number, d: number) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) < n ? (v as number) : d)
  return {
    period: int(o.period, HIST_PERIODS.length, 0),
    pct: o.pct === true,
    bench: int(o.bench, BENCHES.length, 0),
    est: o.est === true,
    group: int(o.group, ALLOC_GROUPS.length, 0),
    heat: int(o.heat, 2, 0),
    contrib: int(o.contrib, CONTRIB_PERIODS.length, 0),
    dgroup: int(o.dgroup, DIV_GROUPS.length, 0),
    dsort: int(o.dsort, DIV_SORTS.length, 0),
  }
}
/**
 * ペインの単キー（KeyboardEvent.code。FR-KB5）。ペインの中で単キーの意味はカードによって変えない
 * （G は選んでいるカードの分類、S は並べ替え）。返すのは変えた状態（変えなければ null）
 */
export function viewKey(v: FolioView, code: string, card: Card | null): FolioView | null {
  switch (code) {
    case 'KeyP':
      return { ...v, pct: !v.pct }
    case 'KeyB': {
      const bench = (v.bench + 1) % BENCHES.length
      return { ...v, bench, pct: bench ? true : v.pct }
    }
    case 'KeyE':
      return { ...v, est: !v.est, period: !v.est && v.period === 0 ? 5 : v.period }
    case 'KeyG':
      return card === 'dshare' || card === 'dtab'
        ? { ...v, dgroup: (v.dgroup + 1) % DIV_GROUPS.length }
        : { ...v, group: (v.group + 1) % ALLOC_GROUPS.length }
    case 'KeyH':
      return { ...v, heat: 1 - v.heat }
    case 'KeyT':
      return { ...v, contrib: (v.contrib + 1) % CONTRIB_PERIODS.length }
    case 'KeyS':
      return card === 'dtab' ? { ...v, dsort: (v.dsort + 1) % DIV_SORTS.length } : null
    default:
      return null
  }
}
/** 一覧の行の移動（↑ ↓ PgUp PgDn Home End）。当たらなければ null */
export function moveRow(i: number, n: number, key: string): number | null {
  const step: Record<string, number> = { ArrowUp: -1, ArrowDown: 1, PageUp: -10, PageDown: 10, Home: -1e9, End: 1e9 }
  if (!(key in step) || n <= 0) return null
  return Math.max(0, Math.min(n - 1, i + step[key]!))
}

// ---------------- 保有の行 ----------------
export interface FRow {
  code: string
  id: string
  name: string
  acct: AccountType
  kind: string
  market: string
  sector: string
  qty: number
  avgCost: number
  close: number | null
  value: number
  cost: number
  pnl: number
  dayPnl: number
  chgPct: number | null
  per: number | null
  beta: number | null
  div12: number | null
  yld: number | null
  rightsDay: number | null
  earningsDay: number | null
}
/** 保有（銘柄 × 口座区分）の行。終値が無ければ取得単価で数える（評価額を 0 にしない） */
export function rowsOf(
  holdings: Holding[],
  get: (id: string) => { m?: MetricsRow; ins?: Instrument; name: string },
  now?: FolioPos[],
): FRow[] {
  // Core が分割で換算した今の株数（無ければ保有の株数）
  const conv = new Map((now ?? []).map((p) => [`${p.code}/${p.acct}`, p]))
  return holdings
    .filter((h) => h.quantity > 0)
    .map((h) => {
      const id = `JP:${h.code}`
      const { m, ins, name } = get(id)
      const c = conv.get(`${h.code}/${h.account}`)
      const qty = c?.qty ?? h.quantity
      const avg = c?.cost ?? h.avgCost
      const close = m?.close ?? (c ? null : (h.price ?? null))
      const value = (close ?? avg) * qty
      const cost = avg * qty
      return {
        code: h.code,
        id,
        name: name || h.name || h.code,
        acct: h.account,
        kind: ins?.kind ?? 'stock',
        market: ins?.market ?? 'X',
        sector: ins?.sectorJa ?? '',
        qty,
        avgCost: avg,
        close,
        value,
        cost,
        pnl: value - cost,
        dayPnl: m?.chg != null ? m.chg * qty : 0,
        chgPct: m?.chgPct ?? null,
        per: m?.per ?? null,
        beta: m?.beta1y ?? null,
        div12: m?.div12 ?? null,
        yld: m?.yieldTrailing ?? null,
        rightsDay: m?.rightsDay ?? null,
        earningsDay: m?.earningsDay ?? null,
      }
    })
}
/** 銘柄ごとにまとめる（口座区分をまたいで足す） */
export function byCode(rows: FRow[]): FRow[] {
  const m = new Map<string, FRow>()
  for (const r of rows) {
    const was = m.get(r.code)
    if (!was) m.set(r.code, { ...r })
    else {
      was.qty += r.qty
      was.value += r.value
      was.cost += r.cost
      was.pnl += r.pnl
      was.dayPnl += r.dayPnl
      was.avgCost = was.qty ? was.cost / was.qty : 0
      if (r.value > was.value - r.value) was.acct = r.acct
    }
  }
  return [...m.values()]
}
export interface Totals {
  value: number
  cost: number
  pnl: number
  day: number
  /** 株の PER の調和平均（評価額の重み） */
  per: number | null
  /** β の加重平均 */
  beta: number | null
}
export function totalsOf(rows: FRow[]): Totals {
  const value = rows.reduce((s, r) => s + r.value, 0)
  const cost = rows.reduce((s, r) => s + r.cost, 0)
  const day = rows.reduce((s, r) => s + r.dayPnl, 0)
  const st = rows.filter((r) => r.per != null && r.per > 0)
  const sv = st.reduce((s, r) => s + r.value, 0)
  const per = sv ? sv / st.reduce((s, r) => s + r.value / r.per!, 0) : null
  const bt = rows.filter((r) => r.beta != null)
  const bv = bt.reduce((s, r) => s + r.value, 0)
  return { value, cost, pnl: value - cost, day, per, beta: bv ? bt.reduce((s, r) => s + r.value * r.beta!, 0) / bv : null }
}
export const KIND_KEYS: Record<string, string> = { stock: 'stock', pref: 'stock', reit: 'reit', etf: 'etf' }
/** 分類の鍵（資産構成・配当で共通）。17 業種の無い銘柄（REIT・ETF）は種別の名前 */
export function groupKey(g: AllocGroup | DivGroup, r: Pick<FRow, 'code' | 'sector' | 'kind' | 'acct' | 'market'>): string {
  const kind = KIND_KEYS[r.kind] ?? 'other'
  switch (g) {
    case 'sector':
      return r.kind === 'stock' || r.kind === 'pref' ? r.sector || `kind:${kind}` : `kind:${kind}`
    case 'sector17':
      return (r.kind === 'stock' || r.kind === 'pref' ? sector17Of(r.sector) : null) ?? `kind:${kind}`
    case 'acct':
      return `acct:${r.acct}`
    case 'kind':
      return `kind:${kind}`
    case 'market':
      return `market:${r.market}`
    default:
      return r.code
  }
}

// ---------------- 資産推移（FR-PF3・PF4） ----------------
/** 期間の点（記録の前の試算は E のときだけ。「記録」は記録の初日から） */
export function histPoints(points: FolioSeriesPoint[], v: Pick<FolioView, 'period' | 'est'>): FolioSeriesPoint[] {
  const real = points.filter((p) => p.src !== 'est')
  const all = v.est ? points : real
  const n = HIST_PERIODS[v.period]!.bars
  const xs = v.period === 0 ? real : Number.isFinite(n) ? all.slice(-(n + 1)) : all
  return xs.length >= 2 || !real.length ? xs : real.slice(-2)
}
export interface HistHead {
  /** 期間の終わりの含み損益と率 */
  pnl: number
  pnlPct: number | null
  /** 評価損益の増減（入出金除く。試算の点は数に入れない） */
  move: number | null
  from: JstDate | null
  /** 時間加重（%）。記録の点だけ */
  twr: number[]
  bridge: ReturnType<typeof bridge> | null
}
export function histHead(points: FolioSeriesPoint[]): HistHead {
  const real = points.filter((p) => p.src !== 'est')
  const a = real[0]
  const b = real.at(-1)
  const end = points.at(-1)
  const pnl = end ? end.value - end.cost : 0
  return {
    pnl,
    pnlPct: end && end.cost > 0 ? (pnl / end.cost) * 100 : null,
    move: a && b && real.length >= 2 ? bridge(a, b).move : null,
    from: a?.d ?? null,
    twr: twr(real),
    bridge: a && b && real.length >= 2 ? bridge(a, b) : null,
  }
}
/** 目盛り: 範囲を切りのよい値で 3〜5 本に分ける */
export function niceTicks(lo: number, hi: number, n = 4): number[] {
  if (!(hi > lo)) return [lo]
  const raw = (hi - lo) / n
  const p = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((k) => k * p).find((s) => s >= raw)!
  const out: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10))
  return out
}
export interface HistGeom {
  vPath: string
  cPath: string
  band: string
  /** 取得額の階段から上（含み益）・下（含み損）の切り抜き */
  clipUp: string
  clipDown: string
  estPath: string
  estEnd: number
  ticks: { y: number; v: number }[]
  x: (i: number) => number
  y: (v: number) => number
  fills: number[]
}
/** 資産推移の図（評価額の線・取得額の階段・その間の帯）。i は points の位置 */
export function histGeom(points: FolioSeriesPoint[], w: number, h: number, pad = { l: 2, r: 56, t: 6, b: 18 }): HistGeom {
  // 縦軸は 0 円から（評価額と取得額の大きさを、そのままの比で見せる）。上だけ少し空ける
  const vals = points.flatMap((p) => (p.src === 'est' ? [p.value] : [p.value, p.cost]))
  const lo = Math.min(0, ...vals)
  const top = Math.max(0, ...vals)
  const hi = top + ((top - lo) * 0.08 || 1)
  const n = points.length
  const x = (i: number) => pad.l + (i / Math.max(1, n - 1)) * (w - pad.l - pad.r)
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (h - pad.t - pad.b)
  const f = (v: number) => v.toFixed(1)
  const est = points.filter((p) => p.src === 'est').length
  const rp = points.slice(est)
  const xs = (i: number) => x(i + est)
  const vPath = rp.map((p, i) => `${i ? 'L' : 'M'}${f(xs(i))},${f(y(p.value))}`).join('')
  const cPath = rp.map((p, i) => (i ? `H${f(xs(i))}V${f(y(p.cost))}` : `M${f(xs(i))},${f(y(p.cost))}`)).join('')
  const cRev = rp
    .slice()
    .reverse()
    .map((p, j) => `L${f(xs(rp.length - 1 - j))},${f(y(p.cost))}`)
    .join('')
  const estPath = points
    .slice(0, est + 1)
    .map((p, i) => `${i ? 'L' : 'M'}${f(x(i))},${f(y(p.value))}`)
    .join('')
  return {
    vPath,
    cPath,
    band: rp.length ? `${vPath}${cRev}Z` : '',
    clipUp: rp.length ? `${cPath}V${f(pad.t)}H${f(xs(0))}Z` : '',
    clipDown: rp.length ? `${cPath}V${f(h - pad.b)}H${f(xs(0))}Z` : '',
    estPath: est ? estPath : '',
    estEnd: est,
    ticks: niceTicks(lo, hi).map((v) => ({ v, y: y(v) })),
    x,
    y,
    fills: points.flatMap((p, i) => (p.src === 'fill' ? [i] : [])),
  }
}
/** % の図（時間加重とベンチマーク）: 0 を含む範囲 */
export function pctGeom(series: number[][], n: number, w: number, h: number, pad = { l: 2, r: 56, t: 6, b: 18 }) {
  const vals = [0, ...series.flat()]
  let lo = Math.min(...vals)
  let hi = Math.max(...vals)
  const m = (hi - lo) * 0.08 || 1
  lo -= m
  hi += m
  const x = (i: number) => pad.l + (i / Math.max(1, n - 1)) * (w - pad.l - pad.r)
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (h - pad.t - pad.b)
  const path = (s: number[]) => s.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  return { x, y, path, ticks: niceTicks(lo, hi).map((v) => ({ v, y: y(v) })) }
}
/** ベンチマークの騰落率（期間の初めの記録の日から）。記録が 20 日たまってから */
export function benchSeries(points: FolioSeriesPoint[], closes: { d: string; c: number }[]): number[] | null {
  const real = points.filter((p) => p.src !== 'est')
  if (real.length < 20 || !closes.length) return null
  const at = (d: string) => {
    let c: number | null = null
    for (const b of closes) {
      if (b.d > d) break
      c = b.c
    }
    return c
  }
  const base = at(real[0]!.d)
  if (!base) return null
  return real.map((p) => ((at(p.d) ?? base) / base - 1) * 100)
}
/** 月の目盛り（年の変わり目は年。点が多いときは四半期だけ） */
export function monthTicks(ds: string[]): { i: number; label: string }[] {
  const out: { i: number; label: string }[] = []
  let last = ''
  ds.forEach((d, i) => {
    const m = d.slice(0, 7)
    if (m === last) return
    if (last && (ds.length < 140 || /-(01|04|07|10)$/.test(m)))
      out.push({ i, label: m.endsWith('-01') ? m.slice(0, 4) : `${Number(m.slice(5))}` })
    last = m
  })
  return out
}

// ---------------- ウォーターフォール ----------------
export interface WfStep {
  key: string
  v: number
  total?: boolean
  /** 損益ではない増減（入出金）: 中立の色 */
  flow?: boolean
}
export interface WfBar extends WfStep {
  x: number
  w: number
  top: number
  h: number
  /** 次の棒へつなぐ線の高さ */
  link: number
}
/** 両端は合計、間は増減。合計の棒は 0 から描くと差が見えないので下を切る（cut の割合だけ余白を足す） */
export function waterfall(
  steps: WfStep[],
  w: number,
  h: number,
  o: { top?: number; bottom?: number; cut?: number; maxW?: number } = {},
): WfBar[] {
  const T = o.top ?? 16
  const B = o.bottom ?? 30
  let run = 0
  const xs = steps.map((s) => {
    if (s.total) {
      run = s.v
      return { s, a: 0, b: s.v }
    }
    const a = run
    run += s.v
    return { s, a, b: run }
  })
  const ends = xs.flatMap((x) => (x.s.total ? [x.b] : [x.a, x.b]))
  const span = Math.max(...ends) - Math.min(...ends) || Math.abs(Math.max(...ends)) || 1
  const lo = Math.min(...ends) - span * (o.cut ?? 0.6)
  const hi = Math.max(...ends) + span * 0.08
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (h - T - B)
  const cw = w / steps.length
  const bw = Math.min(o.maxW ?? 46, cw * 0.56)
  return xs.map(({ s, a, b }, i) => {
    const y1 = s.total ? h - B : y(Math.max(a, b))
    const y2 = s.total ? y(b) : y(Math.min(a, b))
    return { ...s, x: cw * (i + 0.5) - bw / 2, w: bw, top: Math.min(y1, y2), h: Math.max(1, Math.abs(y2 - y1)), link: y(b) }
  })
}

// ---------------- 資産構成（FR-PF5） ----------------
export interface Tile extends Placed<{ key: string; rows: FRow[] }> {
  group: boolean
  head: number
  metric: number | null
  step: number
}
/** 2 段のツリーマップ（分類 → 銘柄）。色は含み損益率か前日比 */
export function allocTiles(rows: FRow[], group: AllocGroup, heat: number, w: number, h: number): Tile[] {
  const leaves = group === 'acct' ? rows : byCode(rows)
  const metric = (rs: FRow[]) => {
    if (heat) {
      const base = rs.reduce((s, r) => s + r.value - r.dayPnl, 0)
      return base ? (rs.reduce((s, r) => s + r.dayPnl, 0) / base) * 100 : null
    }
    const c = rs.reduce((s, r) => s + r.cost, 0)
    return c ? (rs.reduce((s, r) => s + r.pnl, 0) / c) * 100 : null
  }
  const span = heat ? 3 : 30
  const tile = (p: Placed<{ key: string; rows: FRow[] }>, g: boolean, head = 0): Tile => {
    const m = metric(p.item.rows)
    return { ...p, group: g, head, metric: m, step: heatStep(m, span) }
  }
  const value = (x: { rows: FRow[] }) => x.rows.reduce((s, r) => s + r.value, 0)
  if (group === 'code')
    return squarify(
      leaves.map((r) => ({ key: r.code, rows: [r] })),
      value,
      { x: 0, y: 0, w, h },
    ).map((p) => tile(p, false))
  const by = new Map<string, FRow[]>()
  for (const r of leaves) {
    const k = groupKey(group, r)
    by.set(k, [...(by.get(k) ?? []), r])
  }
  const out: Tile[] = []
  for (const g of squarify(
    [...by].map(([key, rs]) => ({ key, rows: rs })),
    value,
    { x: 0, y: 0, w, h },
  )) {
    const head = g.h > 44 && g.w > 64 ? 16 : 0
    out.push(tile(g, true, head))
    for (const p of squarify(
      g.item.rows.map((r) => ({ key: group === 'acct' ? `${r.code}/${r.acct}` : r.code, rows: [r] })),
      value,
      { x: g.x + 1, y: g.y + head + 1, w: g.w - 2, h: g.h - head - 2 },
    ))
      out.push(tile(p, false))
  }
  return out
}
export const HEAT_SPAN = [30, 3]
/** 矢印の向きでいちばん近いタイル（並び順ではなく位置で選ぶ） */
export function spatialNext(tiles: { x: number; y: number; w: number; h: number }[], cur: number, key: string): number {
  const c = tiles[cur]
  const dir = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, [number, number]>)[key]
  if (!c || !dir) return cur
  const cx = c.x + c.w / 2
  const cy = c.y + c.h / 2
  let best = cur
  let bd = Number.POSITIVE_INFINITY
  tiles.forEach((t, i) => {
    const dx = t.x + t.w / 2 - cx
    const dy = t.y + t.h / 2 - cy
    const along = dx * dir[0] + dy * dir[1]
    if (along <= 1) return
    const d = along + Math.abs(dx * dir[1] + dy * dir[0]) * 2
    if (d < bd) {
      bd = d
      best = i
    }
  })
  return best
}
/** 口座区分の構成比（円グラフ。区分の並びは決まった順で、色が入れ替わらない） */
export const ACCT_ORDER: AccountType[] = ['nisa_growth', 'nisa_tsumitate', 'nisa_legacy', 'tokutei', 'ippan']
export function acctParts(
  rows: Pick<FRow, 'acct' | 'value'>[],
): { acct: AccountType; value: number; share: number; a0: number; a1: number }[] {
  const total = rows.reduce((s, r) => s + Math.max(0, r.value), 0)
  if (!total) return []
  let a = -Math.PI / 2
  return ACCT_ORDER.flatMap((acct) => {
    const value = rows.filter((r) => r.acct === acct).reduce((s, r) => s + Math.max(0, r.value), 0)
    if (!value) return []
    const a0 = a
    a += (value / total) * Math.PI * 2
    return [{ acct, value, share: value / total, a0, a1: a }]
  })
}
/** NISA（成長・つみたて・旧）の評価額の割合 */
export const nisaShare = (parts: { acct: AccountType; share: number }[]) =>
  parts.filter((p) => p.acct.startsWith('nisa')).reduce((s, p) => s + p.share, 0)
export function allocStats(rows: FRow[]) {
  const c = concentration(byCode(rows).map((r) => r.value))
  const cy = cyclicalShare(rows.map((r) => ({ sector: r.sector, kind: r.kind, value: r.value })))
  return { ...c, cyclical: cy.cyclical, defensive: cy.defensive, other: cy.other }
}

// ---------------- 損益寄与（FR-PF5） ----------------
export interface ContribRow {
  code: string
  name: string
  price: number
  div: number
  v: number
  soldOn?: JstDate
}
export function contribRows(
  period: ContribPeriod,
  rows: FRow[],
  fromCore: FolioContrib | null,
  nameOf: (code: string) => string,
): ContribRow[] {
  const mk = (code: string, price: number, div: number, soldOn?: JstDate): ContribRow => ({
    code,
    name: nameOf(code),
    price,
    div,
    v: price + div,
    ...(soldOn ? { soldOn } : {}),
  })
  let out: ContribRow[]
  if (period === 'day') out = byCode(rows).map((r) => mk(r.code, r.dayPnl, 0))
  else if (period === 'all') out = byCode(rows).map((r) => mk(r.code, r.pnl, 0))
  else out = (fromCore?.rows ?? []).map((r) => mk(r.code, r.price, r.div, r.soldOn))
  return out.sort((a, b) => b.v - a.v)
}
/** 棒の位置（0 を中心に左右。値動きの先に配当を続けて積む）。% は track の幅に対して */
export function contribBars(rs: ContribRow[]) {
  const right = Math.max(0, ...rs.map((r) => Math.max(r.price, 0) + r.div))
  const left = Math.max(0, ...rs.map((r) => -Math.min(r.price, 0)))
  const mx = Math.max(right, left) || 1
  return rs.map((r) => {
    const pw = (Math.abs(r.price) / mx) * 50
    const dw = (Math.max(0, r.div) / mx) * 50
    return { pl: r.price >= 0 ? 50 : 50 - pw, pw, dl: r.price >= 0 ? 50 + pw : 50, dw }
  })
}

// ---------------- 配当（FR-PF7） ----------------
export interface DivRow {
  code: string
  name: string
  sector: string
  kind: string
  market: string
  acct: AccountType
  months: number[]
  dps: (number | null)[]
  dpsNow: number
  dpsPrev: number
  annual: number
  annualPrev: number
  gross: number
  raise: number
  qty: number
  factor: ReturnType<typeof decompose>['factor']
  cagr: number | null
  streak: number
  noCut: boolean
  yld: number | null
  yoc: number | null
  payout: number | null
  value: number
  cost: number
  special: boolean
  regimeChanged: boolean
  last: { date: string; amount: number }[]
  /** 前の 1 年の権利落ち（前年同月） */
  prevLast: { date: string; amount: number }[]
  /** 税引後の割合（口座の重み） */
  net: number
  sold: boolean
}
/** Core の配当の材料と保有の行から、銘柄ごとの配当の行を作る（1 年前の記録が無ければ 1 年前の株数は今と同じとみなす） */
export function divRows(
  d: FolioDividends,
  rows: FRow[],
  info: (code: string) => { name: string; ins?: Instrument; m?: MetricsRow },
): DivRow[] {
  const cur = new Map(byCode(rows).map((r) => [r.code, r]))
  return d.rows.map((x) => {
    const r = cur.get(x.code)
    const i = info(x.code)
    const dpsNow = x.dps.at(-1) ?? 0
    const dpsPrev = x.dps.at(-2) ?? dpsNow
    const ago = x.yearAgo ?? x.now
    const dc = decompose(x.now, ago, dpsNow, dpsPrev)
    const st = dpsStreak(x.dps)
    const q = x.now.reduce((s, y) => s + y.qty, 0)
    const value = r?.value ?? 0
    const cost = r?.cost ?? 0
    const acct = (x.now[0] ?? ago[0])?.acct ?? 'tokutei'
    return {
      code: x.code,
      name: i.name || x.code,
      sector: i.ins?.sectorJa ?? '',
      kind: i.ins?.kind ?? 'stock',
      market: i.ins?.market ?? 'X',
      acct,
      months: [...new Set(x.last.map((y) => Number(y.date.slice(5, 7))))].sort((a, b) => a - b),
      dps: x.dps,
      dpsNow,
      dpsPrev,
      annual: dc.annual,
      annualPrev: dc.annualPrev,
      gross: q * dpsNow,
      raise: dc.raise,
      qty: dc.qty,
      factor: dc.factor,
      cagr: dpsCagr(x.dps),
      streak: st.streak,
      noCut: st.noCut,
      yld: r?.close ? (dpsNow / r.close) * 100 : null,
      yoc: r && r.avgCost > 0 ? (dpsNow / (r.cost / r.qty)) * 100 : null,
      payout: i.ins?.kind === 'stock' ? payoutRatio(r?.close ? (dpsNow / r.close) * 100 : null, i.m?.per ?? null) : null,
      value,
      cost,
      special: x.special,
      regimeChanged: x.regimeChanged,
      last: x.last,
      prevLast: x.prev,
      net: q ? x.now.reduce((s, y) => s + y.qty * netRate(y.acct), 0) / q : netRate(acct),
      sold: q === 0,
    }
  })
}
export interface DivSummary {
  now: number
  prev: number
  delta: number
  gross: number
  perMonth: number
  nisaSaved: number
  raised: number
  cut: number
  top3: number
  hasYearAgo: boolean
  fx: { raise: number; cut: number; new: number; add: number; sold: number; acct: number }
}
export function divSummary(rs: DivRow[], hasYearAgo: boolean, nowRows: { code: string; acct: AccountType; qty: number }[]): DivSummary {
  const now = rs.reduce((s, r) => s + r.annual, 0)
  const prev = rs.reduce((s, r) => s + r.annualPrev, 0)
  const dps = new Map(rs.map((r) => [r.code, r.dpsNow]))
  const nisaSaved = nowRows.filter((x) => x.acct.startsWith('nisa')).reduce((s, x) => s + x.qty * (dps.get(x.code) ?? 0) * DIVIDEND_TAX, 0)
  const top = rs.map((r) => r.annual).sort((a, b) => b - a)
  const sum = (f: (r: DivRow) => number) => rs.reduce((s, r) => s + f(r), 0)
  return {
    now,
    prev,
    delta: now - prev,
    gross: rs.reduce((s, r) => s + r.gross, 0),
    perMonth: now / 12,
    nisaSaved,
    raised: rs.filter((r) => !r.sold && r.raise > 0.5).length,
    cut: rs.filter((r) => !r.sold && r.raise < -0.5).length,
    top3: now ? top.slice(0, 3).reduce((s, v) => s + v, 0) / now : 0,
    hasYearAgo,
    fx: {
      raise: sum((r) => Math.max(0, r.raise)),
      cut: sum((r) => Math.min(0, r.raise)),
      new: sum((r) => (r.factor === 'new' ? r.qty : 0)),
      add: sum((r) => (r.factor === 'add' ? r.qty : 0)),
      sold: sum((r) => (r.factor === 'sold' || r.factor === 'trim' ? r.qty : 0)),
      acct: sum((r) => (r.factor === 'acct' ? r.qty : 0)),
    },
  }
}
/** 増減要因（前年 → 増配 → 減配 → 新規 → 買い増し → 売却 → 現在）。足すと現在と一致する */
export function divBridgeSteps(s: DivSummary): WfStep[] {
  return [
    { key: 'prev', v: s.prev, total: true },
    { key: 'raise', v: s.fx.raise },
    { key: 'cut', v: s.fx.cut },
    { key: 'new', v: s.fx.new },
    { key: 'add', v: s.fx.add },
    { key: 'sold', v: s.fx.sold },
    ...(Math.abs(s.fx.acct) >= 0.5 ? [{ key: 'acct', v: s.fx.acct }] : []),
    { key: 'now', v: s.now, total: true },
  ]
}
/** 今後 12 か月の配当（権利落ちの月に積む）と前年同月 */
export function divMonths(
  rs: DivRow[],
  month: number,
): { m: number; now: number; prev: number; codes: { code: string; name: string; amt: number }[] }[] {
  return nextMonths(month).map((m) => {
    let now = 0
    let prev = 0
    const codes: { code: string; name: string; amt: number }[] = []
    for (const r of rs) {
      if (!r.sold) {
        const qNet = r.dpsNow ? r.annual / r.dpsNow : 0
        const amt = byMonth(r.last, qNet).get(m) ?? 0
        if (amt) codes.push({ code: r.code, name: r.name, amt })
        now += amt
      }
      const qPrev = r.dpsPrev ? r.annualPrev / r.dpsPrev : 0
      prev += byMonth(r.prevLast, qPrev).get(m) ?? 0
    }
    return { m, now, prev, codes: codes.sort((a, b) => b.amt - a.amt) }
  })
}
type DivMonth = ReturnType<typeof divMonths>[number]
/** 配当見込みの月の棒のツールチップ: 月の合計と前年同月、その月の銘柄の内訳（額の大きい順に max 件。残りはまとめる） */
export function monthTip(
  x: DivMonth,
  tr: (k: 'folio.monthAmt' | 'folio.monthMore' | 'folio.noRights', v?: Record<string, string | number>) => string,
  max = 10,
): string {
  const head = tr('folio.monthAmt', { m: x.m, now: yenFull(x.now), prev: yenFull(x.prev) })
  if (!x.codes.length) return `${head}\n${tr('folio.noRights')}`
  const lines = x.codes.slice(0, max).map((c) => `${c.code} ${c.name}  ¥${yenFull(c.amt)}`)
  const rest = x.codes.slice(max)
  if (rest.length) lines.push(tr('folio.monthMore', { n: rest.length, amt: yenFull(rest.reduce((s, c) => s + c.amt, 0)) }))
  return [head, ...lines].join('\n')
}
export interface DivGroupRow {
  key: string
  rows: DivRow[]
  annual: number
  annualPrev: number
  raise: number
  qty: number
  gross: number
  value: number
  cost: number
  yld: number | null
  yoc: number | null
  dps: number[]
}
export function divGroups(rs: DivRow[], g: DivGroup): DivGroupRow[] {
  const by = new Map<string, DivRow[]>()
  for (const r of rs) {
    const k = groupKey(g, r)
    by.set(k, [...(by.get(k) ?? []), r])
  }
  return [...by].map(([key, xs]) => {
    const s = (f: (r: DivRow) => number) => xs.reduce((a, r) => a + f(r), 0)
    const value = s((r) => r.value)
    const cost = s((r) => r.cost)
    const gross = s((r) => r.gross)
    return {
      key,
      rows: xs,
      annual: s((r) => r.annual),
      annualPrev: s((r) => r.annualPrev),
      raise: s((r) => r.raise),
      qty: s((r) => r.qty),
      gross,
      value,
      cost,
      yld: value ? (gross / value) * 100 : null,
      yoc: cost ? (gross / cost) * 100 : null,
      // 今の株数で見た 1 株配当の 5 年（分類の行の小さな棒）
      dps: [0, 1, 2, 3, 4].map((i) => xs.reduce((a, r) => a + (r.dpsNow ? (r.dps[i] ?? 0) * (r.gross / r.dpsNow) : 0), 0)),
    }
  })
}
const sortVal = (
  s: Exclude<DivSort, 'code'> | DivSort,
  x: { annual: number; annualPrev: number; yld: number | null; yoc: number | null; cagr?: number | null },
) =>
  s === 'annual'
    ? x.annual
    : s === 'delta'
      ? x.annual - x.annualPrev
      : s === 'yield'
        ? (x.yld ?? -1)
        : s === 'yoc'
          ? (x.yoc ?? -1)
          : (x.cagr ?? -1e9)
export type TableRow = { type: 'g'; g: DivGroupRow; open: boolean } | { type: 'm'; r: DivRow; child: boolean }
/** 表の行: 分類が銘柄以外ならアコーディオン（開いた分類だけ銘柄を出す） */
export function tableRows(rs: DivRow[], g: DivGroup, sort: DivSort, open: Set<string>): TableRow[] {
  const by = (a: Parameters<typeof sortVal>[1], b: Parameters<typeof sortVal>[1]) => sortVal(sort, b) - sortVal(sort, a)
  // 銘柄コードの並べ替え: 銘柄はコードの昇順、分類は名前の順（分類の中の銘柄はコードの昇順）
  const byCodeAsc = (a: DivRow, b: DivRow) => a.code.localeCompare(b.code)
  const rowSort = sort === 'code' ? byCodeAsc : by
  if (g === 'code') return [...rs].sort(rowSort).map((r) => ({ type: 'm', r, child: false }))
  const out: TableRow[] = []
  const groups = divGroups(rs, g)
  for (const x of sort === 'code' ? groups.sort((a, b) => a.key.localeCompare(b.key, 'ja')) : groups.sort((a, b) => by(a, b))) {
    out.push({ type: 'g', g: x, open: open.has(x.key) })
    if (open.has(x.key)) out.push(...[...x.rows].sort(rowSort).map((r) => ({ type: 'm' as const, r, child: true })))
  }
  return out
}
/** 表で → ← を押したとき: 開く・閉じる分類と、閉じたあとに選ぶ行 */
export function toggleOpen(
  rows: TableRow[],
  i: number,
  open: Set<string>,
  want: boolean | undefined,
  g: DivGroup,
): { open: Set<string>; sel: number } {
  const r = rows[i]
  if (!r || g === 'code') return { open, sel: i }
  const k = r.type === 'g' ? r.g.key : groupKey(g, r.r)
  const next = new Set(open)
  const on = want ?? !open.has(k)
  if (on) next.add(k)
  else next.delete(k)
  const sel = !on && r.type === 'm' ? rows.findIndex((x) => x.type === 'g' && x.g.key === k) : i
  return { open: next, sel: Math.max(0, sel) }
}
/** 資産推移の図: x（図の左端からの CSS の px）に近い点の位置。histGeom の左右の余白（左 2・右 56）と合わせる */
export function histIndexAt(px: number, w: number, n: number): number {
  if (n < 2) return 0
  return Math.max(0, Math.min(n - 1, Math.round(((px - 2) / Math.max(1, w - 58)) * (n - 1))))
}
/** 資産推移の配当見込みの推移の図 */
export function trendGeom(trend: { d: string; v: number }[], w: number, h: number) {
  if (trend.length < 2) return null
  const vs = trend.map((t) => t.v)
  const lo = Math.min(...vs) * 0.96
  const hi = Math.max(...vs) * 1.02 || 1
  const x = (i: number) => (i / (trend.length - 1)) * (w - 50)
  const y = (v: number) => 4 + (1 - (v - lo) / (hi - lo || 1)) * (h - 18)
  const line = trend.map((t, i) => `${i ? `H${x(i).toFixed(1)}V` : 'M0,'}${y(t.v).toFixed(1)}`).join('')
  return { line, area: `${line}V${h - 14}H0Z`, x, y }
}

// ---------------- 評価額のカードの数（十字線の連動。FR-PF8） ----------------
/**
 * 評価額のカードの数: トータル損益・最高値から・前回比。十字線の日なら、その日の記録の実現損益・受取配当、
 * その日までの最高値、その日と前の記録の差で数える（今日の累計と混ぜない）
 */
export function heroNumbers(
  points: FolioSeriesPoint[],
  crossDay: JstDate | null,
  tot: { value: number; pnl: number },
  meta: { realized: number | null; dividends: number | null } | null,
): { total: number; fromPeak: number | null; prevRec: number | null } {
  const real = points.filter((p) => p.src !== 'est')
  let i = real.length - 1
  if (crossDay) while (i >= 0 && real[i]!.d > crossDay) i--
  const upto = real.slice(0, i + 1)
  const p = real[i]
  const realized = crossDay ? (p?.realized ?? 0) : (meta?.realized ?? 0)
  const received = crossDay ? (p?.received ?? 0) : (meta?.dividends ?? 0)
  const peak = upto.length ? Math.max(...upto.map((x) => x.value)) : 0
  return {
    total: tot.pnl + realized + received,
    fromPeak: peak ? (tot.value / peak - 1) * 100 : null,
    prevRec: i >= 1 ? p!.value - real[i - 1]!.value : null,
  }
}
/** 配当の利回り・取得利回り（今の評価額・取得額で割る。十字線の日の値と混ぜない） */
export function divYields(gross: number, base: { value: number; cost: number }): { yld: number | null; yoc: number | null } {
  return { yld: base.value ? (gross / base.value) * 100 : null, yoc: base.cost ? (gross / base.cost) * 100 : null }
}
/** 並びが変わったら（取得で値が変わった・並べ替えた）、選んでいた銘柄の新しい位置。見つからなければ今の位置 */
export function reselect<T>(list: T[], key: string | null, keyOf: (x: T) => string, cur: number): number {
  if (!key) return cur
  const i = list.findIndex((x) => keyOf(x) === key)
  return i >= 0 ? i : cur
}
/** 一覧が短くなったら、選んでいる位置を最後に寄せる */
export const clampIndex = (i: number, n: number) => Math.max(0, Math.min(i, n - 1))
/** 損益寄与の上の行（合計・うち配当・値上がりと値下がりの数） */
export function contribSummary(rs: ContribRow[]): { total: number; div: number; up: number; down: number } {
  let total = 0
  let div = 0
  let up = 0
  for (const r of rs) {
    total += r.v
    div += r.div
    if (r.v > 0) up++
  }
  return { total, div, up, down: rs.length - up }
}
/** 保有の取り込みのあとの知らせ（記録だけの JSON なら記録の日数） */
export const importedNote = (holdings: number, history: number): { key: 'hold.imported' | 'hold.importedHistory'; n: number } =>
  holdings || !history ? { key: 'hold.imported', n: holdings } : { key: 'hold.importedHistory', n: history }
/** 証券会社の CSV を取り込んだ日時（日本時間。FR-T1）。読めなければ null */
export function importedAtText(iso: string | undefined, lang: 'ja' | 'en'): string | null {
  const ms = iso ? Date.parse(iso) : Number.NaN
  if (!Number.isFinite(ms)) return null
  return new Date(ms).toLocaleString(lang === 'ja' ? 'ja-JP' : 'en-US', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Tokyo' })
}

// ---------------- 予定・要約・その他 ----------------
export interface FolioEvent {
  day: number
  date: JstDate
  type: 'rights' | 'earnings' | 'alert'
  code: string
  name: string
  amount?: number
  qty?: number
  text?: string
}
const EPOCH = Date.UTC(1970, 0, 1)
export const dayToDate = (n: number): JstDate => new Date(EPOCH + n * 86400_000).toISOString().slice(0, 10)
export const dateToDay = (d: JstDate) => Math.round((Date.parse(`${d}T00:00:00Z`) - EPOCH) / 86400_000)
/** 今後 30 日の予定（権利付き最終日と配当見込みの額・決算・成立中のアラート）。日付順 */
export function eventsOf(
  rows: FRow[],
  divs: DivRow[],
  alerts: { code: string; name: string; text: string }[],
  today: JstDate,
): FolioEvent[] {
  const t0 = dateToDay(today)
  const out: FolioEvent[] = []
  const dv = new Map(divs.map((d) => [d.code, d]))
  for (const r of byCode(rows)) {
    if (r.rightsDay != null && r.rightsDay >= t0 && r.rightsDay <= t0 + 30) {
      const d = dv.get(r.code)
      const m = Number(dayToDate(r.rightsDay).slice(5, 7))
      const amt = d ? (byMonth(d.last, d.dpsNow ? d.annual / d.dpsNow : 0).get(m) ?? null) : null
      out.push({
        day: r.rightsDay - t0,
        date: dayToDate(r.rightsDay),
        type: 'rights',
        code: r.code,
        name: r.name,
        ...(amt ? { amount: amt } : {}),
      })
    }
    if (r.earningsDay != null && r.earningsDay >= t0 && r.earningsDay <= t0 + 30)
      out.push({ day: r.earningsDay - t0, date: dayToDate(r.earningsDay), type: 'earnings', code: r.code, name: r.name, qty: r.qty })
  }
  for (const a of alerts) out.push({ day: 0, date: today, type: 'alert', code: a.code, name: a.name, text: a.text })
  return out.sort((a, b) => a.day - b.day || (a.type === 'alert' ? -1 : 1))
}
/** 1 行の要約の材料（今年の寄与の合計・うち配当・最も効いた銘柄・年間配当の前年比） */
export function briefOf(
  year: ContribRow[],
  div: DivSummary | null,
): { total: number; div: number; top: ContribRow | null; divPct: number | null } | null {
  if (!year.length) return null
  const top = [...year].sort((a, b) => b.v - a.v)[0] ?? null
  return {
    total: year.reduce((s, r) => s + r.v, 0),
    div: year.reduce((s, r) => s + r.div, 0),
    top,
    divPct: div && div.prev > 0 && div.hasYearAgo ? (div.delta / div.prev) * 100 : null,
  }
}
/** ドーナツのスライスの道（外径 R・内径 r0。間を 2px 相当あける） */
export function arcPath(a0: number, a1: number, R: number, r0: number, cx = 100, cy = 100, gap = 0.012): string {
  const b0 = a0 + gap
  const b1 = Math.max(b0, a1 - gap)
  const big = b1 - b0 > Math.PI ? 1 : 0
  const p = (rad: number, a: number) => `${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`
  return `M${p(R, b0)}A${R},${R} 0 ${big} 1 ${p(R, b1)}L${p(r0, b1)}A${r0},${r0} 0 ${big} 0 ${p(r0, b0)}Z`
}
/** 損益の色の段の文字の色: ダークは本文の色、ライトは濃い段（0・4）だけ白 */
export const tileInk = (step: number, light: boolean) => (light && (step === 0 || step === 4) ? '#ffffff' : 'var(--text)')
/** 期間の初めの日（表示用） */
export const yearStart = (today: JstDate) => addDays(`${today.slice(0, 4)}-01-01`, 0)

/**
 * 十字線の日の行（FR-PF8）: その日の保有（株数は今の基準）× その日の終値。前日比はその日と前の取引日の終値の差。
 * 銘柄の名前・業種などは今の行から引く（売った銘柄は名前だけ）
 */
export function rowsAtDay(at: FolioAt, base: FRow[], nameOf: (code: string) => string): FRow[] {
  const info = new Map(base.map((r) => [r.code, r]))
  return at.pos.map((p) => {
    const b = info.get(p.code)
    const c = at.close[p.code] ?? null
    const pv = at.prev[p.code] ?? null
    const value = (c ?? p.cost) * p.qty
    const cost = p.cost * p.qty
    return {
      ...(b ?? {
        per: null,
        beta: null,
        div12: null,
        yld: null,
        rightsDay: null,
        earningsDay: null,
        kind: 'stock',
        market: 'X',
        sector: '',
      }),
      code: p.code,
      id: `JP:${p.code}`,
      name: b?.name ?? nameOf(p.code),
      acct: p.acct,
      qty: p.qty,
      avgCost: p.cost,
      close: c,
      value,
      cost,
      pnl: value - cost,
      dayPnl: c != null && pv != null ? (c - pv) * p.qty : 0,
      chgPct: c != null && pv ? (c / pv - 1) * 100 : null,
    }
  })
}

// ---------------- 書式（符号は − を使い、▲▼ は使わない。日本の会計では ▲ がマイナスを表すため） ----------------
const sg = (v: number, sign: boolean) => (v < 0 ? '−' : sign && v > 0 ? '+' : '')
/** 円を万・億で短く（1 万未満はそのまま）。この節の円の書式は個人の金額だけに使い、プライバシーモードでは隠す（FR-H12） */
export const manYen = (v: number, sign = false): string => secret(manYenRaw(v, sign))
function manYenRaw(v: number, sign: boolean): string {
  const a = Math.abs(v)
  if (a >= 1e8) return `${sg(v, sign)}${(a / 1e8).toFixed(2)}億`
  if (a >= 1e4) return `${sg(v, sign)}${(a / 1e4).toFixed(a >= 1e6 ? 0 : 1)}万`
  return `${sg(v, sign)}${Math.round(a).toLocaleString('ja-JP')}`
}
/** 1 枚の図の中は万円・小数 1 桁にそろえる */
export const man1 = (v: number, sign = false) => secret(`${sg(v, sign)}${(Math.abs(v) / 1e4).toFixed(1)}万`)
/** 円（桁区切り） */
export const yenFull = (v: number, sign = false) => secret(`${sg(v, sign)}${Math.round(Math.abs(v)).toLocaleString('ja-JP')}`)
/** % （± を付ける） */
export const signPct = (v: number | null | undefined, d = 1) =>
  v == null || !Number.isFinite(v) ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(d)}%`
export const toneOf = (v: number | null | undefined) => (v == null || Math.abs(v) < 1e-9 ? 'flat' : v > 0 ? 'up' : 'down')

/** 表の「要因」（増配・減配・据え置き と 新規・買い増し・一部売却・売却）。額は税引後の年額 */
export function divFactors(r: Pick<DivRow, 'raise' | 'qty' | 'factor' | 'sold'>): { k: string; v: number }[] {
  const out: { k: string; v: number }[] = []
  if (r.raise > 0.5) out.push({ k: 'raise', v: r.raise })
  else if (r.raise < -0.5) out.push({ k: 'cut', v: r.raise })
  else if (!r.sold && r.factor !== 'new') out.push({ k: 'flat', v: 0 })
  if (r.factor) out.push({ k: r.factor, v: r.qty })
  return out
}
/** 1 株配当の 5 年の最後の棒の色: 増配 = 金、減配 = 下落の色、据え置き = 中立 */
export function lastTone(d: (number | null)[]): 'gold' | 'down' | 'flat' {
  const a = d.at(-1)
  const b = d.at(-2)
  return a == null || b == null ? 'flat' : a > b + 1e-9 ? 'gold' : a < b - 1e-9 ? 'down' : 'flat'
}
/** 損益の段の背景（上昇・下落の色を 12〜55% だけ混ぜる） */
export function heatBg(step: number): string {
  const mix = heatMix(step)
  return mix ? `color-mix(in srgb, ${step < 2 ? 'var(--down)' : 'var(--up)'} ${Math.round(mix * 100)}%, var(--panel-3))` : 'var(--panel-3)'
}
/** ドーナツの濃淡（大きい順に薄く。その他は中立） */
export const donutShade = (i: number, rest: boolean) =>
  rest ? 'var(--f-bar)' : `color-mix(in srgb, var(--f-gold-fill) ${Math.round((1 - Math.min(i, 5) * 0.17) * 100)}%, var(--panel-3))`
/** 分類の行に含まれる銘柄が、選んでいる銘柄の集合に無いか（薄くする） */
export const dimmed = (brushed: Set<string> | null, codes: string[]) => !!brushed && !codes.some((c) => brushed.has(c))
