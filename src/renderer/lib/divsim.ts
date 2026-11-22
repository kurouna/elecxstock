// 配当シミュレータのペイン（docs/design-simulator.md §6〜§9）の画面の側の計算: 設定の読み取りと切り替え・前提の文・表の列・図の座標。
// 純粋な関数（テストは tests/unit/renderer/divsim.test.ts）。計算そのものは src/shared/sim/（Core の sim.run）。

import { toJstDate } from '@shared/calendar'
import { FIELD_BY_ID } from '@shared/fields'
import type { Band } from '@shared/sim/forecast'
import {
  DEFAULT_SIM,
  SIM_HORIZONS,
  SIM_METHODS,
  SIM_YEARS,
  type SimFwdRow,
  type SimPastRow,
  type SimResult,
  type SimSector,
  type SimSettings,
  type SimTax,
} from '@shared/sim/types'
import type { Condition, InstrumentId, Lang } from '@shared/types'
import type { Cell, ListCol } from './columns'
import { niceTicks } from './folio'
import type { Key } from './i18n'

export type SimTab = 'past' | 'fwd'
/** 比べる相手（B: TOPIX と同業種 → TOPIX → 同業種 → なし。TOPIX は連動 ETF の TOPIX_ETF） */
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
    method: pick(s.method, SIM_METHODS, DEFAULT_SIM.method),
    from: typeof s.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.from) ? s.from : null,
    monthly: typeof s.monthly === 'number' && Number.isFinite(s.monthly) && s.monthly > 0 ? Math.min(1e9, s.monthly) : 0,
    weight: s.weight === 'yield' ? 'yield' : 'equal',
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
export function heldIds(hs: { code: string; quantity: number }[]): InstrumentId[] {
  // 株数が 0 の行は数えない（Core の保有のまとめ（heldForSim）と母集団をそろえる）
  return [...new Set(hs.filter((h) => h.quantity > 0).map((h) => `JP:${h.code}`))]
}
/**
 * 今のタブに効く設定・表示のキーか。効かないキーは受けない（押しても画面が変わらないのに計算し直して読み込み中が出るため）。
 * これからに効かない: 再投資（R）・業種（G）・比べる相手（B）・円と %（P）。保有のこれからは元本（A）・税（X）も口座ごとなので効かない。
 * 過去に効かない: 受取月（V）
 */
export function keyApplies(code: string, tab: SimTab, held: boolean, one = false): boolean {
  // 配分（W）は 1 銘柄では常に 100%、保有のこれからは実際の株数なので結果が変わらない
  if (code === 'KeyW' && (one || (held && tab === 'fwd'))) return false
  if (tab === 'past') return code !== 'KeyV' && code !== 'KeyM'
  // 積立（D）・当時の条件で選び直す（H）は過去だけに効く
  if (code === 'KeyD' || code === 'KeyH') return false
  if (['KeyR', 'KeyG', 'KeyB', 'KeyP'].includes(code)) return false
  return !(held && (code === 'KeyA' || code === 'KeyX'))
}
/** 過去が 0 件のときの案内（これからの銘柄も無ければ別の文） */
export const noPastHintKey = (fwdRows: number): Key => (fwdRows > 0 ? 'sim.noPastHint' : 'sim.noPastHintNone')
/** Alt+数字のキーが今のタブで効くか（Alt+5 の基準日の日付は過去だけ。効かないキーはペインで受けない） */
export const altApplies = (code: string, tab: SimTab): boolean => (code === 'Digit5' ? tab === 'past' : /^Digit[1-4]$/.test(code))
/**
 * 計算し直すときに読み込み中を出すか（FR-SIM7）。入力（銘柄・設定）が前の結果と同じで、取得の完了だけで計算し直すときは出さず、
 * 前の結果を出したまま差し替える。初めて・設定や出どころを変えたときは出す（前の結果は新しい設定の答えではないため）
 */
export const showsLoading = (x: { prev: string; next: string; hasResult: boolean }): boolean => !(x.hasResult && x.prev === x.next)
/** 読み込み中・結果が無いときに受けないキー（画面に出ていないカード・表の行を動かさない。設定のキーは受ける） */
const MOVE_KEYS = new Set(['Tab', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Enter', 'Home', 'End', 'KeyN', 'KeyS', 'Escape'])
export const blockedWhileLoading = (code: string): boolean => MOVE_KEYS.has(code)
/** カード・表が出ているか（読み込み中・結果が無い・過去のタブで過去が 0 件（案内だけの画面）のときは出ていない。出ていなければ MOVE_KEYS を受けない） */
export const showsCards = (x: { loading: boolean; hasResult: boolean; tab: SimTab; hasPast: boolean }): boolean =>
  !x.loading && x.hasResult && (x.tab !== 'past' || x.hasPast)
/**
 * PgUp・PgDn でタブを替えるか（替えないときは表の行を動かす）。表を選んでいても、カード・表が出ていなければ替える
 * （過去が 0 件の案内だけの画面で、見えない表の行を動かしてタブを替えられなくならないように）
 */
export const pageSwitchesTab = (key: string, card: string | null, shown: boolean): boolean =>
  (key === 'PageUp' || key === 'PageDown') && (!shown || card !== 'table')
/** 縦線に添える札（「元本を回収」）: 文字の幅に合わせ、右端に近ければ縦線の左に出す */
export function pillGeom(x: number, right: number, label: string): { x: number; w: number } {
  const w = [...label].reduce((s, ch) => s + (ch.charCodeAt(0) > 0x7f ? 10 : 5.6), 0) + 8
  return { x: x + 2 + w > right - 2 ? x - 2 - w : x + 2, w }
}
/** 計算し直すかを決める鍵: 計算する銘柄の集合と順（上限で切る順に効く）と設定。表示の状態は入れない */
export function simKey(ids: InstrumentId[], s: SimSettings): string {
  return `${ids.join(',')}|${s.years}|${s.amount}|${s.reinvest}|${s.tax}|${s.sector}|${s.horizon}|${s.method}|${s.from ?? ''}|${s.monthly}|${s.weight}`
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
/** 基準日の日付の上限（parseFrom の today）: 結果のデータの基準の日。結果が無い（読み込み中・エラー）なら今日（日本時間） */
export const fromLimit = (asOf: string | undefined, now: number = Date.now()): string => asOf ?? toJstDate(now)
/** 基準日の日付の入力（YYYY-MM-DD・/ 区切り・全角）。今日より後・2000 年より前・読めなければ null */
export function parseFrom(text: string, today: string): string | null {
  const m = text
    .normalize('NFKC')
    .trim()
    .match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (!m) return null
  const d = `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}`
  const t = Date.parse(`${d}T00:00:00Z`)
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== d) return null
  return d >= '2000-01-01' && d < today ? d : null
}
/** 積立の額の入力（月・万円で打つ。0 で止める）。読めなければ null */
export function parseMonthly(text: string): number | null {
  const v = Number(
    text
      .normalize('NFKC')
      .replaceAll(',', '')
      .replace(/万円?$/, '')
      .trim(),
  )
  if (!Number.isFinite(v) || v < 0 || v > 100_000) return null
  return Math.round(v * 10_000)
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
export function basisNotes(r: SimResult, tab: SimTab, screen: boolean, lang: Lang = 'ja'): Note[] {
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
    if (p?.rescreen) {
      // 使えなかった条件は指標の名前で（ID は出さない）
      const x = p.rescreen.ignored.map((id) => FIELD_BY_ID.get(id)?.label[lang] ?? id).join(lang === 'ja' ? '・' : ', ')
      out.push({ k: 'sim.n.rescreen', a: { n: p.rescreen.count, x: x || '—' }, warn: true })
    }
    if (s.monthly > 0) out.push({ k: 'sim.n.dca' })
    if (s.weight === 'yield') out.push({ k: 'sim.n.weightYield' })
    // 積立のときは同業種と比べない（理由は積立の前提が言う）
    if (p && !p.peer && s.monthly === 0) out.push({ k: 'sim.n.noPeer', warn: true })
    else if (p) out.push({ k: 'sim.n.sector', a: { c: p.peerInfo.compared, t: p.peerInfo.total, n: p.peerInfo.s17 } })
    // 比べる TOPIX が何か（番号だけでは分からない）
    if (p?.etf) out.push({ k: 'sim.n.topix' })
    if (r.glitch) out.push({ k: 'sim.n.glitch', a: { n: r.glitch.stocks, m: r.glitch.points }, warn: true })
    if (r.etfMissing) out.push({ k: 'sim.n.etfMissing', warn: true })
    if (r.reitShare > 0.2) out.push({ k: 'sim.n.reit', warn: true })
  } else {
    out.push({ k: 'sim.n.estimate' })
    if (r.fwd.held) out.push({ k: 'sim.n.held' })
    if (r.fwd.band) out.push({ k: 'sim.n.band', a: { n: r.fwd.band.years } })
    if (r.settings.method === 'growth') {
      out.push({ k: 'sim.n.growth' })
      out.push({ k: 'sim.n.boom', warn: true })
    }
    if (r.settings.method === 'trend') out.push({ k: 'sim.n.trend', warn: true })
    if (r.fwd.stress) out.push({ k: 'sim.n.stress', a: { y: r.fwd.stress.year, p: pct(r.fwd.stress.ratio - 1) } })
    const gone = r.excluded.filter((x) => x.reason === 'delisted').length
    if (gone) out.push({ k: 'sim.n.delistedFwd', a: { n: gone }, warn: true })
    const short = r.fwd.rows.filter((x) => x.short).length
    if (short) out.push({ k: 'sim.n.short', a: { n: short }, warn: true })
  }
  // 保有のこれからは口座ごとの税（sim.n.held）なので、設定の税の文は出さない
  if (!(tab === 'fwd' && r.fwd.held)) out.push({ k: s.tax === 'taxed' ? 'sim.n.taxed' : s.tax === 'nisa' ? 'sim.n.nisa' : 'sim.n.gross' })
  if (r.total > r.ids.length) out.push({ k: 'sim.n.capped', a: { n: r.ids.length, t: r.total }, warn: true })
  if (r.stale.length) out.push({ k: 'sim.n.stale', a: { n: r.stale.length, d: r.stale.map((x) => x.d).sort()[0]! }, warn: true })
  return out
}

/** 表の並べ替えの候補（S で巡る）。値が大きい順 */
export const PAST_SORTS = ['total', 'contrib', 'received', 'yoc', 'rank'] as const
export const FWD_SORTS = ['y1', 'yield', 'growth', 'g', 'stress'] as const
/** これからの表の並べ替えの候補（S で巡る）。横ばいのときは「試算の伸び」（すべて —）を巡らない */
export const fwdSorts = (method: SimSettings['method']): readonly string[] =>
  method === 'growth' ? FWD_SORTS : FWD_SORTS.filter((k) => k !== 'g')
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
  k === 'yield' ? r.d0 / r.price : k === 'growth' ? (r.growth5 ?? -1e9) : k === 'g' ? r.g : k === 'stress' ? r.r : r.y1
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
    // 試算の伸びは「伸びを見込む」のときだけ（横ばいではすべて —）
    ...(r.settings.method === 'growth'
      ? [
          num(
            'g',
            'sim.c.g',
            64,
            f((x) => Math.exp(x.g) - 1),
            (v) => ({ t: pct(v), c: signCls(v) }),
          ),
        ]
      : []),
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
/** 横の位置（ポインタの x）からいちばん近い点の番号 */
export function indexAt(px: number, scale: { pad: { l: number }; iw: number; n: number }): number {
  const i = Math.round(((px - scale.pad.l) / scale.iw) * (scale.n - 1))
  return Math.max(0, Math.min(scale.n - 1, i))
}
/**
 * 右端の目盛りの値のうち、終点の札（名前の行 ly と値の行 ly + 11。どちらも右の余白に書く）に重ならないものだけ。
 * 目盛りの値は y + 3 を下端に約 9px、札は ly − 9 から ly + 13 まで
 */
export function clearTicks(ticks: number[], y: (v: number) => number, labelYs: number[]): number[] {
  return ticks.filter((v) => {
    const ty = y(v)
    return labelYs.every((ly) => ty <= ly - 14 || ty >= ly + 19)
  })
}

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

/**
 * これからの年ごとの見込みの図（設計 §7.3・21.8）: 横の軸（年）を共通にした上下 2 段。1 段に 1 つの量だけを描き、段ごとに目盛りを持つ
 * （2 つの量を 1 つの図に 2 つの軸で重ねると、累計の線が年ごとの棒より下に見えて読み違えるため）。
 * 上段はその年の配当（棒。ストレスは棒に重ねる段）、下段は累計（階段の面。ストレスの累計は破線）。
 * 元本は累計の 1.5 倍以内のときだけ下段に線を引き、届く年に印。遠ければ届く年数（横ばいで）を文で出す
 */
export function fwdChart(
  years: { value: number; stress: number; cum: number }[],
  amount: number,
  w: number,
  h: number,
  band: Band | null = null,
) {
  const pad = { l: 8, r: 64, t: 16, b: 18 }
  const gap = 20
  const n = Math.max(1, years.length)
  const iw = Math.max(1, w - pad.l - pad.r)
  // 上は「その年の配当」の金額の帯（文字 2 行: 金額と前年比）。毎年の差は数 % で棒では見分けにくいため（利用者の指摘）。残りが累計の図
  const sh = 30
  const bh = Math.max(1, h - pad.t - pad.b - sh - gap)
  let s = 0
  const cumStress = years.map((y) => (s += y.stress))
  const cum = years.map((y) => y.cum)
  const cumMax = cum.at(-1) ?? 0
  const principal = amount > 0 && cumMax > 0 && amount <= cumMax * 1.5 ? amount : null
  const bMax = Math.max(cumMax, principal ?? 0, band?.c90.at(-1) ?? 0, 1) * 1.08
  const by0 = pad.t + sh + gap + bh
  const x = (i: number) => pad.l + (iw * (i + 0.5)) / n
  const xTicks = n <= 10 ? years.map((_, i) => i) : years.map((_, i) => i).filter((i) => i === 0 || (i + 1) % 5 === 0)
  /** データラベルを出す年: 10 年までは毎年、長ければ 5 年ごと（と 1 年目）。ラベルの間が 40px に満たなければ最初と最後だけ */
  const labels = (n <= 10 ? iw / n : (5 * iw) / n) < 40 ? [...new Set([0, n - 1])] : xTicks
  return {
    pad,
    iw,
    n,
    x,
    /** 年の枠の左右（階段の面） */
    slot: (i: number) => ({ l: pad.l + (iw * i) / n, r: pad.l + (iw * (i + 1)) / n }),
    /** その年の配当の金額の帯: ラベルを出す年ごとに金額と前年比（その年と前の年。前の年が無い・0 なら null） */
    strip: {
      y: pad.t,
      h: sh,
      cells: labels.map((i) => {
        const prev = i > 0 ? years[i - 1]!.value : 0
        return { i, x: x(i), v: years[i]?.value ?? 0, yoy: prev > 0 ? years[i]!.value / prev - 1 : null }
      }),
    },
    bot: { y0: by0, h: bh, max: bMax, y: (v: number) => by0 - (bh * v) / bMax, ticks: niceTicks(0, bMax, 3) },
    cum,
    cumStress,
    band,
    principal,
    payback: principal == null ? -1 : years.findIndex((yr) => yr.cum >= amount),
    stressSame: years.every((yr) => Math.abs(yr.stress - yr.value) < 1e-6),
    xTicks,
    labels,
    indexAt: (px: number) => Math.max(0, Math.min(n - 1, Math.floor(((px - pad.l) / iw) * n))),
  }
}
/** 図の下の固定の 1 行（十字線の年）: その年・累計・元本に対する割合・ストレス（横ばいと違う年だけ） */
export function fwdReadout(years: { value: number; stress: number; cum: number }[], i: number, amount: number, band: Band | null = null) {
  const y = years[i]!
  const cumStress = years.slice(0, i + 1).reduce((a, x) => a + x.stress, 0)
  const same = Math.abs(y.stress - y.value) < 1e-6 && Math.abs(cumStress - y.cum) < 1e-6
  return {
    year: i + 1,
    value: y.value,
    cum: y.cum,
    pct: amount > 0 ? y.cum / amount : null,
    stress: same ? null : y.stress,
    cumStress: same ? null : cumStress,
    lo: band ? band.p10[i]! : null,
    hi: band ? band.p90[i]! : null,
    cumLo: band ? band.c10[i]! : null,
    cumHi: band ? band.c90[i]! : null,
  }
}

/**
 * 減配の感応度（§7.3）: 1 年目の配当の多い順に、その銘柄が無配になったら減る額と全体に対する割合、減配シナリオで減る額。
 * 配当の無い銘柄は出さない。全体が 0 なら空。判定はしない（どれを売るべきかは言わない）
 */
export function sensitivity(
  rows: { id: InstrumentId; y1: number; r: number }[],
  n = 5,
): { id: InstrumentId; y1: number; share: number; cut: number }[] {
  const total = rows.reduce((a, x) => a + x.y1, 0)
  if (!(total > 0)) return []
  return rows
    .filter((x) => x.y1 > 0)
    .sort((a, b) => b.y1 - a.y1)
    .slice(0, n)
    .map((x) => ({ id: x.id, y1: x.y1, share: x.y1 / total, cut: x.y1 * (1 - Math.min(1, x.r)) }))
}
/**
 * 目標の文の差し込み（m: 目標の月額・p: 達成率・need: 届くのに要る元本）。hide（保有のプライバシーモード）では達成率も隠す
 * （図の長さと同じく、達成率と目標の額から配当の額が分かるため。FR-H12）。money は hide のとき隠す書式を渡す
 */
export function goalArgs(
  g: { need: number | null; pct: number },
  monthly: number,
  money: (v: number) => string,
  hide: boolean,
  mask: string,
): { m: string; p: string; need: string } {
  return { m: money(monthly), p: hide ? mask : pct(g.pct, 0, false), need: g.need == null ? '—' : money(g.need) }
}
/** 目標の配当（月・円）: 年の目標、届くのに要る元本（今の見込みの利回りで）、今の見込みが目標の何 %。目標が 0 なら null */
export function goalOf(monthly: number, y1: number, amount: number): { annual: number; need: number | null; pct: number } | null {
  if (!(monthly > 0)) return null
  const annual = monthly * 12
  return { annual, need: y1 > 0 && amount > 0 ? (annual * amount) / y1 : null, pct: y1 / annual }
}

/** 超過分の分解の段（滝。§4.3）: TOPIX から規模・業種の配分・銘柄選びを順に足し、最後に合計（選んだ群） */
export function decompSteps(d: { etf: number; size: number; sector: number; pick: number }) {
  const out: { k: 'etf' | 'size' | 'sector' | 'pick' | 'total'; from: number; to: number; v: number }[] = []
  let at = 0
  for (const k of ['etf', 'size', 'sector', 'pick'] as const) {
    out.push({ k, from: at, to: at + d[k], v: d[k] })
    at += d[k]
  }
  out.push({ k: 'total', from: 0, to: at, v: at })
  return out
}

/** シナリオに入れる状態のキー（計算の設定と、出どころ・対象。表示の状態（タブ・円と % など）は入れない） */
const SCENARIO_KEYS = [
  'years',
  'amount',
  'reinvest',
  'tax',
  'sector',
  'horizon',
  'method',
  'from',
  'monthly',
  'weight',
  'rescreen',
  'src',
  'scope',
] as const
const SCENARIO_MAX = 20
export interface Scenario {
  name: string
  state: Record<string, unknown>
}
/** ペインの状態から保存したシナリオを読む（形の崩れたものは捨てる） */
export function scenariosOf(s: Record<string, unknown>): Scenario[] {
  const xs = s.scenarios
  if (!Array.isArray(xs)) return []
  return xs.filter(
    (x): x is Scenario => !!x && typeof x === 'object' && typeof x.name === 'string' && !!x.state && typeof x.state === 'object',
  )
}
/** 今の状態を名前で保存（同じ名前は上書き。20 件まで、古いものから消す） */
export function saveScenario(list: Scenario[], name: string, state: Record<string, unknown>): Scenario[] {
  const pick: Record<string, unknown> = {}
  for (const k of SCENARIO_KEYS) pick[k] = k in state ? state[k] : null
  return [...list.filter((x) => x.name !== name), { name, state: pick }].slice(-SCENARIO_MAX)
}

/** 当時の条件で選び直す入力（スクリーンの条件と、★・ウォッチリストの中身。今の値のまま） */
export interface RescreenIn {
  conditions: Condition[]
  favorites: InstrumentId[]
  watchlists: Record<string, InstrumentId[]>
}
export function rescreenInput(conditions: Condition[], watchlists: { id: string; builtin?: string; items: InstrumentId[] }[]): RescreenIn {
  return {
    conditions,
    favorites: watchlists.find((w) => w.builtin === 'favorites')?.items ?? [],
    watchlists: Object.fromEntries(watchlists.map((w) => [w.id, w.items])),
  }
}
/** 入力の署名（条件の値・★・ウォッチリストが変われば計算し直す）。選び直さないときは空 */
export const rescreenSig = (x: RescreenIn | null): string => (x ? JSON.stringify(x) : '')
/** 既定の出どころ: 1 枚目の窓は今のスクリーナー、フリーの窓は★お気に入り（フリーの窓にはスクリーナーを置けない。§8） */
export const defaultSource = (free: boolean): string => (free ? 'favorites' : 'live')
/** 出どころの一覧に「今のスクリーナー」を出すか（フリーの窓では出さない） */
export const allowsLive = (free: boolean): boolean => !free
/** ペインの状態の出どころ（無ければ既定）。フリーの窓では、1 枚目から写したレイアウトなどで「今のスクリーナー」が入っていても★お気に入りにする */
export function sourceOf(raw: unknown, free: boolean): string {
  if (typeof raw !== 'string' || !raw) return defaultSource(free)
  return raw === 'live' && !allowsLive(free) ? defaultSource(free) : raw
}
/** 1 銘柄のこれからの「見込む伸び」: 伸びを見込むは率（g は対数の伸び）、ほかは方式の名前 */
export function growthCell(method: SimSettings['method'], g: number): number | Key {
  return method === 'growth' ? Math.exp(g) - 1 : method === 'trend' ? 'sim.m.trend' : 'sim.m.flat'
}
