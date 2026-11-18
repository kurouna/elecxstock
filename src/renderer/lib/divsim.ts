// 配当シミュレータのペイン（docs/design-simulator.md §6〜§9）の画面の側の計算: 設定の読み取りと切り替え・前提の文・表の列・図の座標。
// 純粋な関数（テストは tests/unit/renderer/divsim.test.ts）。計算そのものは src/shared/sim/（Core の sim.run）。
import {
  DEFAULT_SIM,
  SIM_HORIZONS,
  SIM_YEARS,
  type SimFwdRow,
  type SimPastRow,
  type SimResult,
  type SimSector,
  type SimSettings,
  type SimTax,
} from '@shared/sim/types'
import type { InstrumentId } from '@shared/types'
import type { Cell, ListCol } from './columns'
import type { Key } from './i18n'

export type SimTab = 'past' | 'fwd'
/** 比べる相手（B: 1306 と同業種 → 1306 → 同業種 → なし） */
export const SIM_COMPARES = ['both', 'etf', 'peer', 'none'] as const
export type SimCompare = (typeof SIM_COMPARES)[number]
export const SIM_TAXES: SimTax[] = ['taxed', 'gross', 'nisa']
export const SIM_SECTORS: SimSector[] = ['s33', 's17']
/** 読み込み中の最短の時間（ms。一瞬だけ出て消えるちらつきを防ぐ。§7.6） */
export const SIM_MIN_LOADING = 400

/** ペインの状態（pane.state）から計算の設定を読む。知らない値は既定に戻す */
export function simSettingsOf(s: Record<string, unknown>): SimSettings {
  const pick = <T>(v: unknown, xs: readonly T[], d: T): T => (xs.includes(v as T) ? (v as T) : d)
  const amt = typeof s.amount === 'number' && Number.isFinite(s.amount) ? Math.min(1e10, Math.max(10_000, s.amount)) : DEFAULT_SIM.amount
  return {
    years: pick(s.years, SIM_YEARS, DEFAULT_SIM.years),
    amount: amt,
    reinvest: s.reinvest === true,
    tax: pick(s.tax, SIM_TAXES, DEFAULT_SIM.tax),
    sector: pick(s.sector, SIM_SECTORS, DEFAULT_SIM.sector),
    horizon: pick(s.horizon, SIM_HORIZONS, DEFAULT_SIM.horizon),
  }
}
/** 画面だけの表示の状態（変えても計算し直さない） */
export function simViewOf(s: Record<string, unknown>): { tab: SimTab; cmp: SimCompare; pct: boolean; receipt: boolean; scope: SimScope } {
  return {
    tab: s.tab === 'fwd' ? 'fwd' : 'past',
    cmp: (SIM_COMPARES as readonly string[]).includes(s.cmp as string) ? (s.cmp as SimCompare) : 'both',
    pct: s.pct === true,
    receipt: s.receipt !== false,
    scope: s.scope === 'group' ? 'group' : 'one',
  }
}
/** 対象（1 銘柄 ⇔ 群。設計 §22）。既定は 1 銘柄 */
export type SimScope = 'one' | 'group'
/**
 * 計算する銘柄: 1 銘柄ならリンク色の銘柄（まだ無ければ空）、群なら出どころの銘柄（まだ届いていなければ null）。
 * リンク色の無い（リンク 0）ペインは群だけ
 */
export function simTargets(
  scope: SimScope,
  link: number,
  linkSym: InstrumentId | null | undefined,
  srcIds: InstrumentId[] | null,
): { scope: SimScope; ids: InstrumentId[] | null } {
  if (scope === 'one' && link) return { scope, ids: linkSym ? [linkSym] : [] }
  return { scope: 'group', ids: srcIds }
}
/** 並びの次（d = −1 で前）の値 */
export function cycle<T>(xs: readonly T[], v: T, d = 1): T {
  const i = xs.indexOf(v)
  return xs[(((Math.max(i, 0) + d) % xs.length) + xs.length) % xs.length]!
}
/**
 * 出どころの切り替え: 前の出どころ（last）と今（src）から、覚える値・結果を捨てて読み込み中から始めるか・スクリーナーを走らせるか。
 * ウォッチリストへ替えたときも覚える（スクリーナーへ戻したときに、前のスクリーナーの結果で計算しない）
 */
export function sourceStep(last: string, src: string): { last: string; reset: boolean; screen: boolean } {
  return { last: src, reset: src !== last, screen: src === 'live' || src.startsWith('scr:') }
}
/** 保有の銘柄（口座をまたいで 1 つにまとめ、並びは保有の順） */
export function heldIds(hs: { code: string }[]): InstrumentId[] {
  return [...new Set(hs.map((h) => `JP:${h.code}`))]
}
/** 過去が 0 件のときの案内（これからの銘柄も無ければ別の文） */
export const noPastHintKey = (fwdRows: number): Key => (fwdRows > 0 ? 'sim.noPastHint' : 'sim.noPastHintNone')
/** 読み込み中・結果が無いときに受けないキー（画面に出ていないカード・表の行を動かさない。設定のキーは受ける） */
const MOVE_KEYS = new Set(['Tab', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Enter', 'Home', 'End', 'KeyN', 'KeyS', 'Escape'])
export const blockedWhileLoading = (code: string): boolean => MOVE_KEYS.has(code)
/** 縦線に添える札（「元本を回収」）: 文字の幅に合わせ、右端に近ければ縦線の左に出す */
export function pillGeom(x: number, right: number, label: string): { x: number; w: number } {
  const w = [...label].reduce((s, ch) => s + (ch.charCodeAt(0) > 0x7f ? 10 : 5.6), 0) + 8
  return { x: x + 2 + w > right - 2 ? x - 2 - w : x + 2, w }
}
/** 計算し直すかを決める鍵: 計算する銘柄の集合と順（上限で切る順に効く）と設定。表示の状態は入れない */
export function simKey(ids: InstrumentId[], s: SimSettings): string {
  return `${ids.join(',')}|${s.years}|${s.amount}|${s.reinvest}|${s.tax}|${s.sector}|${s.horizon}`
}
/** 元本の入力（万円で打つ）。読めなければ null */
export function parseAmount(text: string): number | null {
  const v = Number(
    text
      .normalize('NFKC')
      .replaceAll(',', '')
      .replace(/万円?$/, '')
      .trim(),
  )
  if (!Number.isFinite(v) || v <= 0) return null
  const yen = Math.round(v * 10_000)
  return yen >= 10_000 && yen <= 1e10 ? yen : null
}
/** 受取の目安（権利確定月 + 3 か月）へ月をずらす（0 が 1 月） */
export function receiptMonths(xs: number[]): number[] {
  return xs.map((_, i) => xs[(i + 9) % 12]!)
}

/** 金額の短い書式（日本語は万円・億円、英語は ¥k・¥M）。図と大きな数字に使う */
export function yen(v: number | null | undefined, lang: 'ja' | 'en', sign = false): string {
  if (v == null || !Number.isFinite(v)) return '—'
  const s = sign ? (v > 0 ? '+' : v < 0 ? '−' : '±') : v < 0 ? '−' : ''
  const a = Math.abs(v)
  if (lang === 'ja') {
    if (a >= 1e8) return `${s}${(a / 1e8).toFixed(2)}億`
    if (a >= 1e4) return `${s}${(a / 1e4).toFixed(a >= 1e6 ? 1 : 2)}万`
    return `${s}${Math.round(a).toLocaleString('ja-JP')}`
  }
  if (a >= 1e9) return `${s}¥${(a / 1e9).toFixed(2)}B`
  if (a >= 1e6) return `${s}¥${(a / 1e6).toFixed(2)}M`
  if (a >= 1e3) return `${s}¥${(a / 1e3).toFixed(1)}k`
  return `${s}¥${Math.round(a)}`
}
/** 比の %（0.123 → +12.3%）。null は — */
export function pct(v: number | null | undefined, digits = 1, sign = true): string {
  if (v == null || !Number.isFinite(v)) return '—'
  const s = sign ? (v > 0 ? '+' : v < 0 ? '−' : '±') : v < 0 ? '−' : ''
  return `${s}${Math.abs(v * 100).toFixed(digits)}%`
}

export interface Note {
  k: Key
  a?: Record<string, string | number>
  /** 警告（見出しの札の数に入る） */
  warn?: boolean
}
/**
 * 前提のカードの項目（§6）。計算に効いているものだけ。warn は見出しの札（⚠ 前提 N）の数に入る。
 * screen は出どころがスクリーナー・保存スクリーン（後知恵の注記を出す）
 */
export function basisNotes(r: SimResult, tab: SimTab, screen: boolean): Note[] {
  const out: Note[] = []
  const s = r.settings
  if (tab === 'past') {
    const p = r.past
    if (screen) out.push({ k: 'sim.n.hindsight' })
    out.push({ k: 'sim.n.survivor' })
    if (p?.monthly && p.dailyFrom) out.push({ k: 'sim.n.monthly', a: { d: p.dailyFrom }, warn: true })
    if (r.excluded.length)
      out.push({
        k: 'sim.n.excluded',
        a: {
          n: r.excluded.length,
          a: r.excluded.filter((x) => x.reason === 'noDivRecord').length,
          b: r.excluded.filter((x) => x.reason === 'noPrice').length,
          c: r.excluded.filter((x) => x.reason === 'delisted').length,
        },
        warn: true,
      })
    if (s.reinvest) out.push({ k: 'sim.n.reinvest' })
    if (p && !p.peer) out.push({ k: 'sim.n.noPeer', warn: true })
    else if (p) out.push({ k: 'sim.n.sector', a: { c: p.peerInfo.compared, t: p.peerInfo.total, n: p.peerInfo.s17 } })
    if (r.etfMissing) out.push({ k: 'sim.n.etfMissing', warn: true })
    if (r.reitShare > 0.2) out.push({ k: 'sim.n.reit', warn: true })
  } else {
    out.push({ k: 'sim.n.estimate' })
    if (r.fwd.held) out.push({ k: 'sim.n.held' })
    if (r.fwd.stress) out.push({ k: 'sim.n.stress', a: { y: r.fwd.stress.year, p: pct(r.fwd.stress.ratio - 1) } })
    const gone = r.excluded.filter((x) => x.reason === 'delisted').length
    if (gone) out.push({ k: 'sim.n.delistedFwd', a: { n: gone }, warn: true })
    const short = r.fwd.rows.filter((x) => x.short).length
    if (short) out.push({ k: 'sim.n.short', a: { n: short }, warn: true })
  }
  out.push({ k: s.tax === 'taxed' ? 'sim.n.taxed' : s.tax === 'nisa' ? 'sim.n.nisa' : 'sim.n.gross' })
  if (r.total > r.ids.length) out.push({ k: 'sim.n.capped', a: { n: r.ids.length, t: r.total }, warn: true })
  if (r.stale.length) out.push({ k: 'sim.n.stale', a: { n: r.stale.length, d: r.stale.map((x) => x.d).sort()[0]! }, warn: true })
  return out
}

/** 表の並べ替えの候補（S で巡る）。値が大きい順 */
export const PAST_SORTS = ['total', 'contrib', 'received', 'yoc', 'rank'] as const
export const FWD_SORTS = ['y1', 'yield', 'growth', 'stress'] as const
const pastKey = (r: SimPastRow, k: string): number =>
  k === 'contrib'
    ? r.contrib
    : k === 'received'
      ? r.received
      : k === 'yoc'
        ? r.yoc
        : k === 'rank'
          ? r.rank
            ? -r.rank.k / r.rank.n
            : -2
          : r.totalPct
const fwdKey = (r: SimFwdRow, k: string): number =>
  k === 'yield' ? r.d0 / r.price : k === 'growth' ? (r.growth5 ?? -1e9) : k === 'stress' ? r.r : r.y1
export function sortPast(rows: SimPastRow[], k: string): SimPastRow[] {
  return [...rows].sort((a, b) => pastKey(b, k) - pastKey(a, k))
}
export function sortFwd(rows: SimFwdRow[], k: string): SimFwdRow[] {
  return [...rows].sort((a, b) => fwdKey(b, k) - fwdKey(a, k))
}

/**
 * 銘柄ごとの表の列（表示と CSV の書き出しが共有する。§9）。数の列は sort が丸めない値を返すので、CSV には丸めない値が入る。
 * code・name は toCsv が銘柄の表から書く
 */
export function simColumns(
  r: SimResult,
  tab: SimTab,
  o: {
    lang: 'ja' | 'en'
    label: (k: Key) => string
    name: (id: InstrumentId) => string
    code: (id: InstrumentId) => string
    sector?: (id: InstrumentId) => string
    /** 金額と株数を隠す（保有のときのプライバシーモード） */
    mask?: string
  },
): ListCol[] {
  const L = (k: Key) => () => o.label(k)
  const num = (id: string, k: Key, w: number, get: (id: InstrumentId) => number | null, show: (v: number) => Cell): ListCol => ({
    id,
    label: L(k),
    w,
    sort: get,
    cell: (x) => {
      const v = get(x)
      return v == null ? { t: '—' } : show(v)
    },
  })
  const signCls = (v: number) => (v > 0 ? 'up' : v < 0 ? 'down' : '')
  const money = (v: number, sign = false) => o.mask ?? yen(v, o.lang, sign)
  const head: ListCol[] = [
    { id: 'code', label: L('col.code'), w: 52, l: true, sort: (x) => o.code(x), cell: (x) => ({ t: o.code(x) }), fixed: true },
    { id: 'name', label: L('col.name'), w: 150, l: true, sort: (x) => o.name(x), cell: (x) => ({ t: o.name(x) }), fixed: true },
  ]
  /** 印（文字の列。幅が足りなくても消えないよう名前のすぐ右） */
  const mark = (get: (id: InstrumentId) => Key[]): ListCol => ({
    id: 'mark',
    label: L('sim.c.mark'),
    w: 64,
    l: true,
    sort: (x) =>
      get(x)
        .map((k) => o.label(k))
        .join('・') || null,
    cell: (x) => ({
      t: get(x)
        .map((k) => o.label(k))
        .join('・'),
      c: 'warn',
    }),
  })
  const sector: ListCol[] = o.sector
    ? [{ id: 'sector', label: L('sim.c.sector'), w: 90, l: true, sort: (x) => o.sector!(x), cell: (x) => ({ t: o.sector!(x) }) }]
    : []
  if (tab === 'past') {
    const m = new Map((r.past?.rows ?? []).map((x) => [x.id, x]))
    const g =
      <K extends keyof SimPastRow>(k: K) =>
      (id: InstrumentId) =>
        (m.get(id)?.[k] as number | undefined) ?? null
    return [
      ...head,
      mark((id) => (m.get(id)?.monthly ? ['sim.mark.monthly'] : [])),
      ...sector,
      num('buy', 'sim.c.buy', 70, g('buy'), (v) => ({ t: v.toLocaleString(undefined, { maximumFractionDigits: v < 1000 ? 1 : 0 }) })),
      num('shares', 'sim.c.shares', 64, g('shares'), (v) => ({ t: v.toFixed(1) })),
      num('value', 'sim.c.value', 80, g('value'), (v) => ({ t: yen(v, o.lang) })),
      num('gain', 'sim.c.gain', 80, g('gain'), (v) => ({ t: yen(v, o.lang, true), c: signCls(v) })),
      num('received', 'sim.c.received', 80, g('received'), (v) => ({ t: yen(v, o.lang), c: 'gold' })),
      num('total', 'sim.c.total', 72, g('totalPct'), (v) => ({ t: pct(v), c: signCls(v) })),
      num('contrib', 'sim.c.contrib', 80, g('contrib'), (v) => ({ t: yen(v, o.lang, true), c: signCls(v) })),
      {
        id: 'rank',
        label: L('sim.c.rank'),
        w: 64,
        sort: (x) => {
          const k = m.get(x)?.rank
          return k ? k.k / k.n : null
        },
        cell: (x) => {
          const k = m.get(x)?.rank
          return k ? { t: `${k.k}/${k.n}${k.s17 ? '*' : ''}` } : { t: '—' }
        },
      },
      num('yoc', 'sim.c.yoc', 64, g('yoc'), (v) => ({ t: pct(v, 2, false) })),
      num('cuts', 'sim.c.cuts', 48, g('cuts'), (v) => ({ t: String(v), c: v > 0 ? 'down' : '' })),
    ]
  }
  const m = new Map(r.fwd.rows.map((x) => [x.id, x]))
  const f = (get: (x: SimFwdRow) => number | null) => (id: InstrumentId) => {
    const x = m.get(id)
    return x ? get(x) : null
  }
  const fm = (id: InstrumentId): Key[] => {
    const x = m.get(id)
    if (!x) return []
    const out: Key[] = []
    if (x.short) out.push('sim.mark.short')
    if (x.rSrc === 's17') out.push('sim.mark.s17')
    else if (x.rSrc === 'market') out.push('sim.mark.market')
    return out
  }
  return [
    ...head,
    mark(fm),
    num(
      'd0',
      'sim.c.d0',
      70,
      f((x) => x.d0),
      (v) => ({ t: v.toFixed(v < 100 ? 2 : 0) }),
    ),
    num(
      'yield',
      'sim.c.yield',
      64,
      f((x) => (x.price > 0 ? x.d0 / x.price : null)),
      (v) => ({ t: pct(v, 2, false) }),
    ),
    num(
      'years',
      'sim.c.years',
      48,
      f((x) => x.years),
      (v) => ({ t: String(v) }),
    ),
    num(
      'growth',
      'sim.c.growth',
      64,
      f((x) => (x.growth5 == null ? null : x.growth5 / 100)),
      (v) => ({ t: pct(v), c: signCls(v) }),
    ),
    num(
      'shares',
      'sim.c.shares',
      64,
      f((x) => x.shares),
      (v) => ({ t: o.mask ?? v.toFixed(1) }),
    ),
    num(
      'y1',
      'sim.c.y1',
      80,
      f((x) => x.y1),
      (v) => ({ t: money(v), c: 'gold' }),
    ),
    num(
      'stress',
      'sim.c.stress',
      72,
      f((x) => x.r - 1),
      (v) => ({ t: pct(v), c: signCls(v) }),
    ),
    {
      id: 'months',
      label: L('sim.c.months'),
      w: 80,
      l: true,
      sort: (x) => m.get(x)?.exMonths.join(' ') ?? null,
      cell: (x) => ({ t: m.get(x)?.exMonths.join('・') || '—' }),
    },
  ]
}

/** 折れ線の図の座標: 縦は全系列の最小〜最大（目盛りは切りのよい値）、横は点の番号 */
export function lineScale(series: (number[] | null)[], w: number, h: number, pad = { l: 8, r: 56, t: 10, b: 18 }) {
  const all = series.flatMap((s) => s ?? []).filter(Number.isFinite)
  let lo = all.length ? Math.min(...all) : 0
  let hi = all.length ? Math.max(...all) : 1
  if (hi - lo < 1e-9) {
    lo -= Math.abs(lo) * 0.05 + 1
    hi += Math.abs(hi) * 0.05 + 1
  }
  const span = hi - lo
  lo -= span * 0.06
  hi += span * 0.06
  const n = Math.max(2, ...series.map((s) => s?.length ?? 0))
  const iw = Math.max(1, w - pad.l - pad.r)
  const ih = Math.max(1, h - pad.t - pad.b)
  const x = (i: number) => pad.l + (iw * i) / (n - 1)
  const y = (v: number) => pad.t + ih * (1 - (v - lo) / (hi - lo))
  const path = (s: number[]) => s.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  return { x, y, path, lo, hi, n, ticks: niceTicks(lo, hi, 4), pad, iw, ih }
}
/** 切りのよい目盛り（lo〜hi に n 本ほど） */
export function niceTicks(lo: number, hi: number, n = 4): number[] {
  if (!(hi > lo)) return [lo]
  const raw = (hi - lo) / n
  const p = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((k) => k * p).find((s) => s >= raw)!
  const out: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10))
  return out
}
/** 横の位置（ポインタの x）からいちばん近い点の番号 */
export function indexAt(px: number, scale: { pad: { l: number }; iw: number; n: number }): number {
  const i = Math.round(((px - scale.pad.l) / scale.iw) * (scale.n - 1))
  return Math.max(0, Math.min(scale.n - 1, i))
}
/** 円の系列を元本に対する比（%）にする */
export const toPct = (xs: number[] | null, principal: number): number[] | null =>
  xs && principal > 0 ? xs.map((v) => v / principal - 1) : null

/** 文の形の設定の帯: 「{years}に{amount}を…」を文字と差し込む語（押せる語）に分ける */
export function splitTemplate(text: string): (string | { k: string })[] {
  const out: (string | { k: string })[] = []
  let last = 0
  for (const m of text.matchAll(/\{(\w+)\}/g)) {
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push({ k: m[1]! })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}
/** 線の右端の値の縦の位置: 重なれば下へずらし、はみ出せば内へ押し戻す（並びは入力の順のまま返す） */
export function spreadLabels(ys: number[], gap: number, lo: number, hi: number): number[] {
  const idx = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y)
  for (let k = 1; k < idx.length; k++) idx[k]!.y = Math.max(idx[k]!.y, idx[k - 1]!.y + gap)
  const over = idx.length ? idx.at(-1)!.y - hi : 0
  if (over > 0) {
    idx.at(-1)!.y = hi
    for (let k = idx.length - 2; k >= 0; k--) idx[k]!.y = Math.min(idx[k]!.y, idx[k + 1]!.y - gap)
  }
  for (const x of idx) x.y = Math.max(lo, x.y)
  const out = new Array<number>(ys.length)
  for (const x of idx) out[x.i] = x.y
  return out
}
