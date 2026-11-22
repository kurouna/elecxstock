// パフォーマンス比較のペインの計算（docs/design-perf.md §3.5）。系列の継ぎ合わせ・基準日の解決・指数化・札の配置・目盛り・
// 色の枠・カレンダー・ペインの状態の読み書き。コンポーネント（widgets/PerfPane.svelte ほか）は描くだけ
import { addDays, addYears, dayOfWeek, isTradingDay, prevTradingDay, tradingDaysBetween } from '@shared/calendar'
import { TOPIX_ETF } from '@shared/markets'
import type { InstrumentId, JstDate } from '@shared/types'

/** 比べる銘柄の数の上限（§4。全部の組の見分けやすさを通った色の数） */
export const PF_MAX = 5
/** 比べる相手（色の枠を使わない。TOPIX 連動 ETF は実線・1343 は破線） */
export const PF_BENCH: readonly InstrumentId[] = [TOPIX_ETF, 'JP:1343']
export const isBench = (id: InstrumentId) => PF_BENCH.includes(id)
/** カレンダーで選べる最初の日（月次系列の始まり。FR-D7） */
export const PF_MIN_DATE = '1999-01-01'
/** 基準日の欄の札（Alt+1〜6）: 年初・1・3・5・10・20 年前 */
export const PF_PRESETS = [0, 1, 3, 5, 10, 20] as const

// ---------------------------------------------------------------- 日付
/** 休場日なら直前の営業日 */
export const snapTrading = (d: JstDate): JstDate => (isTradingDay(d) ? d : prevTradingDay(d))
/** n 営業日先（負なら前）。d が休場日でも営業日だけ数える */
export function addTradingDays(d: JstDate, n: number): JstDate {
  let x = d
  const s = Math.sign(n)
  for (let k = Math.abs(n); k > 0; ) {
    x = addDays(x, s)
    if (isTradingDay(x)) k--
  }
  return x
}
const ymOf = (d: JstDate) => d.slice(0, 7)
/** 'YYYY-MM' の n か月先 */
export function shiftMonth(ym: string, n: number): string {
  const y = Number(ym.slice(0, 4))
  const m = Number(ym.slice(5, 7)) - 1 + n
  const yy = y + Math.floor(m / 12)
  const mm = ((m % 12) + 12) % 12
  return `${yy}-${String(mm + 1).padStart(2, '0')}`
}
const daysIn = (ym: string) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate()
/** n か月先の同じ日（無い日は月末） */
export function addMonths(d: JstDate, n: number): JstDate {
  const ym = shiftMonth(ymOf(d), n)
  return `${ym}-${String(Math.min(Number(d.slice(8, 10)), daysIn(ym))).padStart(2, '0')}`
}
const monthEnd = (ym: string): JstDate => `${ym}-${String(daysIn(ym)).padStart(2, '0')}`
/** 月の最終営業日（月の足の終値の日） */
export const monthLastTradingDay = (ym: string): JstDate => snapTrading(monthEnd(ym))
/** 最終営業日が d 以前の月のうち、いちばん新しい月の最終営業日（月次の精度の基準日。最大 1 か月先の値を使わない） */
function monthEndOnOrBefore(d: JstDate): JstDate {
  const e = monthLastTradingDay(ymOf(d))
  return e <= d ? e : monthLastTradingDay(shiftMonth(ymOf(d), -1))
}
/** yyyymmdd（8 桁）を読む。実在しない日は null */
export function parseYmd(s: string): JstDate | null {
  if (!/^\d{8}$/.test(s)) return null
  const d = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
  const m = Number(s.slice(4, 6))
  if (m < 1 || m > 12 || Number(s.slice(6, 8)) < 1 || Number(s.slice(6, 8)) > daysIn(d.slice(0, 7))) return null
  return d
}

// ---------------------------------------------------------------- 系列（§3.1〜§3.3）
export interface Closes {
  time: JstDate[]
  close: number[]
}
/** 継いだ系列。`stitch` は日足の始まり（月次の点を前に継いだときだけ） */
export interface PfSeries extends Closes {
  stitch: JstDate | null
}
/**
 * 日足の前に月次を継ぐ（§3.1）。`monthly` は bars.get の 'M'（全期間が月 1 点で、日付は月の初め）。
 * 日足の始まりの月より前の月だけ使い、日付をその月の最終営業日（終値の日）に置き換える
 */
export function stitch(daily: Closes, monthly?: Closes | null): PfSeries {
  const first = daily.time[0]
  const time: JstDate[] = []
  const close: number[] = []
  if (monthly)
    for (let i = 0; i < monthly.time.length; i++) {
      const ym = ymOf(monthly.time[i]!)
      if (first && ym >= ymOf(first)) break
      time.push(monthLastTradingDay(ym))
      close.push(monthly.close[i]!)
    }
  const st = time.length && first ? first : null
  return { time: [...time, ...daily.time], close: [...close, ...daily.close], stitch: st }
}
/** 基準日が日足より前で、月次系列がまだ届いていない（取得中）か。保存期間より後に上場した銘柄は上場前（取得中ではない） */
export function monthlyPending(base: JstDate, daily: Closes, monthlyUntil: number | undefined, monthlyFetched: boolean): boolean {
  const first = daily.time[0]
  return !!first && first > base && monthlyUntil == null && !monthlyFetched
}
/** 日数（基準日は含まず終わりの日は含む）。tradingDaysBetween は 4,000 で止まるので、長い期間はこちら */
export function countTradingDays(a: JstDate, b: JstDate): number {
  let n = 0
  for (let x = addDays(a, 1); x <= b; x = addDays(x, 1)) if (isTradingDay(x)) n++
  return n
}
/** その日以前の最後の点の位置（無ければ -1） */
function lastLE(t: readonly JstDate[], d: JstDate): number {
  let lo = 0
  let hi = t.length - 1
  let r = -1
  while (lo <= hi) {
    const m = (lo + hi) >> 1
    if (t[m]! <= d) {
      r = m
      lo = m + 1
    } else hi = m - 1
  }
  return r
}
/** 銘柄ごとの状態（§3.3） */
export type PfState =
  | { kind: 'ok'; i0: number; i1: number; from?: JstDate; last?: JstDate }
  | { kind: 'before'; first: JstDate | null }
  | { kind: 'gap' }
  | { kind: 'pending' }
export interface PfInput {
  id: InstrumentId
  s: PfSeries | null
  /** 月次を取得中（monthlyPending） */
  pending?: boolean
}
export interface PfFrame {
  /** 100 にした日（すべての線で同じ） */
  base: JstDate
  /** 終わりの日（指定が無ければ、表示中の銘柄の最新の足） */
  end: JstDate
  /** 打った日と 100 にした日が違う理由 */
  reason: 'holiday' | 'monthly' | null
  /** 月次の精度を含む */
  monthly: boolean
  /** 日足の始まり（月次の点を継いだとき。継ぎ目の印） */
  stitch: JstDate | null
  /** 月次の最後の点の日（見出しの「月次の精度 〜YYYY/MM」） */
  monthlyTo: JstDate | null
  states: Record<InstrumentId, PfState>
}
/** 基準日・終わりの日を解決する（§3.2）。100 にする日は基準日から 1 つに決め、銘柄ごとにその日の足を探す */
/** `today` は足が 1 本も無いときの終わりの日 */
export function resolveFrame(base: JstDate, end: JstDate | null, inputs: readonly PfInput[], today?: JstDate): PfFrame {
  const tb = snapTrading(base)
  const covered = inputs.filter((x) => x.s?.time.length && x.s.time[0]! <= tb)
  const dailyFrom = (s: PfSeries) => s.stitch ?? s.time[0]!
  const monthly = inputs.some((x) => x.pending) || covered.some((x) => dailyFrom(x.s!) > tb)
  const b = monthly ? monthEndOnOrBefore(base) : tb
  const latest = inputs.reduce<JstDate>((m, x) => (x.s?.time.length && x.s.time.at(-1)! > m ? x.s.time.at(-1)! : m), '')
  let e = end ? snapTrading(end) : latest || (today ? snapTrading(today) : tb)
  if (end && covered.some((x) => dailyFrom(x.s!) > e)) e = monthEndOnOrBefore(end)
  const states: Record<InstrumentId, PfState> = {}
  let st: JstDate | null = null
  let mTo: JstDate | null = null
  for (const x of inputs) {
    const s = x.s
    if (x.pending) {
      states[x.id] = { kind: 'pending' }
      continue
    }
    if (!s?.time.length) {
      states[x.id] = { kind: 'before', first: null }
      continue
    }
    const i0 = lastLE(s.time, b)
    if (i0 < 0) {
      states[x.id] = { kind: 'before', first: s.time[0]! }
      continue
    }
    const d0 = s.time[i0]!
    const i1 = lastLE(s.time, e)
    if (i1 < i0 || (d0 < b && tradingDaysBetween(d0, b) > 5)) {
      states[x.id] = { kind: 'gap' }
      continue
    }
    const last = s.time[i1]! < e ? s.time[i1] : undefined
    states[x.id] = { kind: 'ok', i0, i1, ...(d0 < b ? { from: d0 } : {}), ...(last ? { last } : {}) }
    if (monthly && s.stitch && s.stitch > b) {
      if (!st || s.stitch > st) st = s.stitch
      const k = s.time.indexOf(s.stitch) - 1
      if (k >= 0 && (!mTo || s.time[k]! > mTo)) mTo = s.time[k]!
    }
  }
  return {
    base: b,
    end: e,
    reason: monthly ? 'monthly' : b !== base ? 'holiday' : null,
    monthly,
    stitch: st && st <= e ? st : null,
    monthlyTo: mTo,
    states,
  }
}
export interface Indexed {
  t: JstDate[]
  v: number[]
}
/** 基準日を 100 にそろえた系列（基準日〜終わりの日） */
export function indexSeries(s: Closes, st: Extract<PfState, { kind: 'ok' }>): Indexed {
  const c0 = s.close[st.i0]!
  const t = s.time.slice(st.i0, st.i1 + 1)
  const v = s.close.slice(st.i0, st.i1 + 1).map((c) => (c / c0) * 100)
  return { t, v }
}
/** 十字線の日の値（その日以前の最後の点。基準日より前は無い） */
export function valueAt(x: Indexed, d: JstDate): number | undefined {
  const i = lastLE(x.t, d)
  return i < 0 ? undefined : x.v[i]
}
/** 最大下落率（%。高値からのいちばん深い下げ。下げが無ければ 0） */
export function maxDrawdown(v: readonly number[]): number {
  let peak = -Infinity
  let worst = 0
  for (const x of v) {
    if (x > peak) peak = x
    const dd = (x / peak - 1) * 100
    if (dd < worst) worst = dd
  }
  return worst
}
/** 年率（%）。年数は暦の日数 / 365.25。半年未満は出さない（null） */
export function annualized(endValue: number, base: JstDate, end: JstDate): number | null {
  // 年数は暦の日数から（営業日の数え方の上限に掛からない）
  const years = (dayNum(end) - dayNum(base)) / 365.25
  if (years < 0.5 || !(endValue > 0)) return null
  return ((endValue / 100) ** (1 / years) - 1) * 100
}
/** 配当込みで、基準日が配当の記録の始まりより前の銘柄があれば、いちばん遅い始まり（「配当込みは YYYY/MM から」） */
export function divNote(total: boolean, base: JstDate, divFrom: Record<InstrumentId, JstDate>): JstDate | null {
  if (!total) return null
  let r: JstDate | null = null
  for (const d of Object.values(divFrom)) if (d > base && (!r || d > r)) r = d
  return r
}

// ---------------------------------------------------------------- 描画（§2.5）
/** 右端の札の縦位置: 重なるものを押し広げ、上下の端で止める。入力の順に返す */
export function layoutEndLabels(ys: readonly number[], top: number, bottom: number, gap: number): number[] {
  const ord = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y)
  const p = ord.map((o) => Math.min(bottom, Math.max(top, o.y)))
  for (let i = 1; i < p.length; i++) p[i] = Math.max(p[i]!, p[i - 1]! + gap)
  if (p.length && p.at(-1)! > bottom) {
    p[p.length - 1] = bottom
    for (let i = p.length - 2; i >= 0; i--) p[i] = Math.min(p[i]!, p[i + 1]! - gap)
  }
  if (p.length && p[0]! < top) {
    p[0] = top
    for (let i = 1; i < p.length; i++) p[i] = Math.max(p[i]!, p[i - 1]! + gap)
  }
  const out: number[] = new Array(ys.length)
  ord.forEach((o, k) => {
    out[o.i] = p[k]!
  })
  return out
}
/** 十字線の脇の小箱: 値の高い順（値の無い線は出さない） */
export function crossBox<T extends { v: number | undefined }>(items: readonly T[]): (T & { v: number })[] {
  return items.filter((x): x is T & { v: number } => x.v != null).sort((a, b) => b.v - a.v)
}
export interface TimeTick {
  d: JstDate
  label: string
}
/** 時間の目盛り: 半年までは毎月、4 年までは四半期（1 月だけ年）、6 年までは毎年、12 年までは 2 年、それより長いと 5 年ごと */
export function timeTicks(from: JstDate, to: JstDate): TimeTick[] {
  const years = (Date.parse(to) - Date.parse(from)) / (365.25 * 86400_000)
  const pick: (y: number, m: number) => boolean =
    years <= 0.5
      ? () => true
      : years <= 4
        ? (_y, m) => m % 3 === 1
        : years <= 6
          ? (_y, m) => m === 1
          : years <= 12
            ? (y, m) => m === 1 && y % 2 === 0
            : (y, m) => m === 1 && y % 5 === 0
  const out: TimeTick[] = []
  for (let ym = shiftMonth(ymOf(from), 1); `${ym}-01` <= to; ym = shiftMonth(ym, 1)) {
    const y = Number(ym.slice(0, 4))
    const m = Number(ym.slice(5, 7))
    if (pick(y, m)) out.push({ d: `${ym}-01`, label: m === 1 ? String(y) : ym.replace('-', '/') })
  }
  return out
}
function niceStep(raw: number): number {
  const p = 10 ** Math.floor(Math.log10(raw))
  const n = raw / p
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * p
}
/** 縦の目盛り（指数の値）: 通常は区切りのよい値、対数は 100 の 2 倍ごと（狭くて 3 本に満たなければ区切りのよい値） */
export function valueTicks(lo: number, hi: number, log: boolean): number[] {
  if (!(hi > lo)) return [lo]
  if (log && lo > 0) {
    const out: number[] = []
    for (let k = Math.ceil(Math.log2(lo / 100) - 1e-9); 100 * 2 ** k <= hi * (1 + 1e-9); k++) out.push(100 * 2 ** k)
    if (out.length >= 3) return out
  }
  const step = niceStep((hi - lo) / 5)
  const out: number[] = []
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6)
  return out
}
/** 空いている色の枠のいちばん若いもの（1〜5）。満杯なら null */
export function assignColor(slots: Record<InstrumentId, number>, max = PF_MAX): number | null {
  const used = new Set(Object.values(slots))
  for (let n = 1; n <= max; n++) if (!used.has(n)) return n
  return null
}

// ---------------------------------------------------------------- カレンダー（§2.3）・基準日の欄（§5）
/** 6 週（42 日）の並び。日曜始まり */
export function calendarCells(ym: string): JstDate[] {
  const first = `${ym}-01`
  const start = addDays(first, -dayOfWeek(first))
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}
/** カレンダーの中のキー: ← → 日・↑ ↓ 週・PgUp PgDn 月（Shift で年）・Home End 月の初め／終わり。ほかは null */
export function calMove(d: JstDate, key: string, shift: boolean): JstDate | null {
  switch (key) {
    case 'ArrowLeft':
      return addDays(d, -1)
    case 'ArrowRight':
      return addDays(d, 1)
    case 'ArrowUp':
      return addDays(d, -7)
    case 'ArrowDown':
      return addDays(d, 7)
    case 'PageUp':
      return addMonths(d, shift ? -12 : -1)
    case 'PageDown':
      return addMonths(d, shift ? 12 : 1)
    case 'Home':
      return `${ymOf(d)}-01`
    case 'End':
      return monthEnd(ymOf(d))
  }
  return null
}
/** 基準日の欄で日付を直接動かす: day は 1 営業日（月次の部分は 1 か月）・month は 1 か月・year は 1 年。営業日に寄せる */
export function stepDate(d: JstDate, unit: 'day' | 'month' | 'year', dir: 1 | -1, monthly: boolean): JstDate {
  const n = unit === 'year' ? dir * 12 : dir
  // 月次の部分は月末にそろえる（月の途中に動かすと resolveFrame がその前の月末へ戻し、動かないか 2 か月動く）
  if (monthly) return monthLastTradingDay(shiftMonth(ymOf(d), n))
  if (unit === 'day') return addTradingDays(d, dir)
  return snapTrading(addMonths(d, n))
}
/** 年初（前の年の最後の営業日）・N 年前の基準日 */
export function presetBase(today: JstDate, years: number): JstDate {
  return years === 0 ? prevTradingDay(`${today.slice(0, 4)}-01-01`) : snapTrading(addYears(today, -years))
}
export interface DateLimits {
  min: JstDate
  max: JstDate
}
/** 基準日の選べる範囲（終わりの日の 5 営業日前まで） */
export function baseLimits(today: JstDate, end: JstDate | null | undefined): DateLimits {
  return { min: PF_MIN_DATE, max: addTradingDays(snapTrading(end && end < today ? end : today), -5) }
}
/** 終わりの日の選べる範囲（基準日の 5 営業日後から今日まで） */
export function endLimits(today: JstDate, base: JstDate): DateLimits {
  const min = addTradingDays(snapTrading(base), 5)
  return { min: min < today ? min : today, max: today }
}
export const clampDate = (d: JstDate, l: DateLimits): JstDate => (d < l.min ? l.min : d > l.max ? l.max : d)

// ---------------------------------------------------------------- 短い名前（§3.5）
const DROP_JA = [
  'フィナンシャル・グループ',
  'フィナンシャルグループ',
  'ホールディングス',
  'グループ',
  '投資法人',
  '株式会社',
  '（株）',
  '連動型上場投信',
  '上場投信',
  'NEXT FUNDS',
  'ETF',
]
const DROP_EN =
  /,?\s*\b(Co\.,\s*Ltd|Company Limited|Inc|Ltd|Corporation|Corp|Limited|Holdings|Financial Group|Group|Investment|Exchange Traded Fund|ETF)\b\.?/gi
/** 札・一覧の短い名前: ホールディングス・グループ・投資法人などを落とし、半角 16 文字（全角 8 文字）までに詰める */
export function shortName(name: string): string {
  let s = name
  for (const w of DROP_JA) s = s.split(w).join('')
  s = s.replace(DROP_EN, '').replace(/^NEXT FUNDS\s*/, '')
  s = s
    .replace(/[・\s,]+$/, '')
    .replace(/^[・\s]+/, '')
    .trim()
  if (!s) s = name
  return fitWidth(s, 16)
}

// ---------------------------------------------------------------- ペインの状態（§6）
export type PfMode = 'idx' | 'pct'
export interface PfView {
  /** 打った基準日（未設定は 1 年前） */
  base: JstDate | undefined
  end: JstDate | undefined
  ids: InstrumentId[]
  slots: Record<InstrumentId, number>
  off: InstrumentId[]
  bench: InstrumentId[]
  mode: PfMode
  total: boolean
  log: boolean
  /** 0: 終わりの日の値の順・1: 足した順・2: コード順 */
  sort: 0 | 1 | 2
}
const strs = (v: unknown): string[] | undefined => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined)
const date = (v: unknown): JstDate | undefined => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined)
/** ペインの状態を既定で読む。銘柄が未設定なら、作ったときのリンク色の銘柄（seed）を 1 つ（書かない。§6） */
export function pfView(state: Record<string, unknown>, seed: InstrumentId | null | undefined): PfView {
  const raw = strs(state.pfIds)
  const ids = (raw ?? (seed && !isBench(seed) ? [seed] : [])).filter((x) => !isBench(x)).slice(0, PF_MAX)
  const slotsIn = (state.pfSlots && typeof state.pfSlots === 'object' ? state.pfSlots : {}) as Record<string, unknown>
  const slots: Record<InstrumentId, number> = {}
  for (const id of ids) {
    const n = slotsIn[id]
    if (typeof n === 'number' && n >= 1 && n <= PF_MAX && !Object.values(slots).includes(n)) slots[id] = n
  }
  for (const id of ids) if (!slots[id]) slots[id] = assignColor(slots) ?? PF_MAX
  // 比べる相手でない ID（前の版の TOPIX 連動 ETF など）は今の TOPIX 連動 ETF にする。pfBench には比べる相手しか書かないので、
  // 知らない ID は TOPIX の代わりを替えたあとの古い値と見なす
  const bench = [...new Set((strs(state.pfBench) ?? [TOPIX_ETF]).map((x) => (isBench(x) ? x : TOPIX_ETF)))]
  const sort = state.pfSort === 1 || state.pfSort === 2 ? state.pfSort : 0
  return {
    base: date(state.pfBase),
    end: date(state.pfEnd),
    ids,
    slots,
    off: (strs(state.pfOff) ?? []).filter((x) => ids.includes(x) || bench.includes(x)),
    bench,
    mode: state.pfMode === 'pct' ? 'pct' : 'idx',
    total: state.pfTotal === true,
    log: state.pfLog === true,
    sort,
  }
}
/** 銘柄を足す（色の枠は空いているいちばん若いもの）。比べる相手は比べる相手に。重複・5 銘柄は断る */
export function addPatch(v: PfView, id: InstrumentId): { patch: Record<string, unknown> } | { refused: 'dup' | 'full' } {
  if (isBench(id)) return v.bench.includes(id) ? { refused: 'dup' } : { patch: { pfBench: [...v.bench, id] } }
  if (v.ids.includes(id)) return { refused: 'dup' }
  const n = assignColor(v.slots)
  if (v.ids.length >= PF_MAX || n == null) return { refused: 'full' }
  return { patch: { pfIds: [...v.ids, id], pfSlots: { ...v.slots, [id]: n } } }
}
/** 銘柄を外す（色の枠を空ける。ほかの色は変えない） */
export function removePatch(v: PfView, id: InstrumentId): Record<string, unknown> {
  if (isBench(id)) return { pfBench: v.bench.filter((x) => x !== id), pfOff: v.off.filter((x) => x !== id) }
  const { [id]: _, ...slots } = v.slots
  return { pfIds: v.ids.filter((x) => x !== id), pfSlots: slots, pfOff: v.off.filter((x) => x !== id) }
}
/** まとめて置き換える（取り込み）: 先頭の 5 銘柄（比べる相手・重複を除く） */
export function importPatch(ids: readonly InstrumentId[]): {
  pfIds: InstrumentId[]
  pfSlots: Record<InstrumentId, number>
  pfOff: InstrumentId[]
} {
  const pick = [...new Set(ids.filter((x) => !isBench(x)))].slice(0, PF_MAX)
  return { pfIds: pick, pfSlots: Object.fromEntries(pick.map((id, i) => [id, i + 1])), pfOff: [] }
}
/** 一覧の並び（十字線では並べ替えない。終わりの日の値で決める） */
export function sortIds(ids: readonly InstrumentId[], sort: 0 | 1 | 2, endValue: Record<InstrumentId, number | undefined>): InstrumentId[] {
  if (sort === 1) return [...ids]
  if (sort === 2) return [...ids].sort((a, b) => a.localeCompare(b))
  return [...ids].sort((a, b) => (endValue[b] ?? -Infinity) - (endValue[a] ?? -Infinity))
}
/** B: 比べる相手を巡る（なし → TOPIX → TOPIX と 1343 → 1343 → なし） */
export function cycleBench(b: readonly InstrumentId[]): InstrumentId[] {
  const C: InstrumentId[][] = [[], [TOPIX_ETF], [TOPIX_ETF, 'JP:1343'], ['JP:1343']]
  const i = C.findIndex((x) => x.join() === b.join())
  return [...C[(i + 1) % C.length]!]
}

// ---------------------------------------------------------------- チャートの形（§2.5）
/** 縦の範囲（指数の値）: 100 を含め、上下に 6% の余白（対数は対数の上で） */
export function yRange(values: readonly number[], log: boolean): { lo: number; hi: number } {
  let lo = Infinity
  let hi = -Infinity
  for (const v of values)
    if (Number.isFinite(v) && (!log || v > 0)) {
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
  if (!Number.isFinite(lo)) return { lo: 80, hi: 120 }
  lo = Math.min(lo, 100)
  hi = Math.max(hi, 100)
  if (log) {
    const a = Math.log(lo)
    const b = Math.log(hi)
    const p = Math.max((b - a) * 0.06, 0.01)
    return { lo: Math.exp(a - p), hi: Math.exp(b + p) }
  }
  const p = Math.max((hi - lo) * 0.06, 1)
  return { lo: lo - p, hi: hi + p }
}
/** 線を描く点の位置: 1px に 2 点まで（最初と最後は残す） */
export function thinIdx(n: number, px: number): number[] {
  const step = Math.max(1, Math.floor(n / Math.max(1, px * 2)))
  const out: number[] = []
  for (let i = 0; i < n; i += step) out.push(i)
  if (n && out.at(-1) !== n - 1) out.push(n - 1)
  return out
}
/** 日付を横軸の値（日の通し番号）にする */
export const dayNum = (d: JstDate): number => Date.parse(`${d}T00:00:00Z`) / 86400_000
/** 十字線をキーで動かす（← → 1 点・Shift+← → 1 か月・Home End）。今の十字線が無ければ終わりの点から。ほかは null */
export function stepCross(axis: readonly JstDate[], cur: JstDate | null, key: string, shift: boolean): JstDate | null {
  if (!axis.length) return null
  const last = axis.length - 1
  if (key === 'Home') return axis[0]!
  if (key === 'End') return axis[last]!
  if (key !== 'ArrowLeft' && key !== 'ArrowRight') return null
  const dir = key === 'ArrowRight' ? 1 : -1
  // 十字線が無ければ、まず終わりの点に出す
  if (!cur) return axis[last]!
  const at = Math.max(0, lastLE(axis, cur))
  if (!shift) return axis[Math.min(last, Math.max(0, at + dir))]!
  const to = addMonths(axis[at]!, dir)
  const j = dir > 0 ? Math.min(last, Math.max(at + 1, lastLE(axis, to))) : Math.max(0, Math.min(at - 1, lastLE(axis, to)))
  return axis[j]!
}
/** 基準日から十字線の日まで: 日足は営業日の数、月次の部分（継ぎ目より前）は月の数 */
export function sinceBase(base: JstDate, at: JstDate, stitchDay: JstDate | null): { n: number; unit: 'day' | 'month' } {
  if (stitchDay && at < stitchDay) {
    const m = (Number(at.slice(0, 4)) - Number(base.slice(0, 4))) * 12 + Number(at.slice(5, 7)) - Number(base.slice(5, 7))
    return { n: m, unit: 'month' }
  }
  return { n: countTradingDays(base, at), unit: 'day' }
}

// ---------------------------------------------------------------- 文字
/** 値の書き方: 100 のときは指数（149.4）、% のときは騰落率（+49.4%） */
export function pfValue(v: number | undefined, mode: PfMode): string {
  if (v == null || !Number.isFinite(v)) return '—'
  if (mode === 'idx') return v.toFixed(1)
  const x = v - 100
  const s = Math.abs(x) < 0.05 ? '±' : x > 0 ? '+' : '−'
  return `${s}${Math.abs(x).toFixed(1)}%`
}
/** 縦の目盛りの文字（% のときは +20% など。指数の軸のまま） */
export function pfTick(v: number, mode: PfMode): string {
  if (mode === 'idx') return Number.isInteger(v) ? String(v) : v.toFixed(1)
  const x = Math.round((v - 100) * 10) / 10
  return `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x)}%`
}
const WD = { ja: '日月火水木金土', en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] } as const
export const weekday = (d: JstDate, lang: 'ja' | 'en'): string => WD[lang][dayOfWeek(d)]!
/** 2024/08/05 */
export const slash = (d: JstDate): string => d.replaceAll('-', '/')

/** 半角の幅（全角は 2）で units までに詰める（札・一覧の名前） */
export function fitWidth(s: string, units: number): string {
  let w = 0
  let out = ''
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0
    const cw = code <= 0xff || (code >= 0xff61 && code <= 0xff9f) ? 1 : 2
    if (w + cw > units) break
    w += cw
    out += ch
  }
  return out.trim()
}
/** 目盛りの文字を出すか: 前に出した文字から gap 以上離れたものだけ */
export function keepSpaced(xs: readonly number[], gap: number): boolean[] {
  let last = -Infinity
  return xs.map((x) => {
    if (x - last < gap) return false
    last = x
    return true
  })
}

/** 短い名前が重なるときはコードを添える（ソフトバンクグループとソフトバンクなど） */
export function disambiguate(items: readonly { id: InstrumentId; code: string; short: string }[]): Record<InstrumentId, string> {
  const n = new Map<string, number>()
  for (const x of items) n.set(x.short, (n.get(x.short) ?? 0) + 1)
  return Object.fromEntries(items.map((x) => [x.id, (n.get(x.short) ?? 0) > 1 ? `${x.short} ${x.code}` : x.short]))
}
/** マウスの位置（日の通し番号）にいちばん近い日。axis は昇順 */
export function nearestDay(axis: readonly JstDate[], day: number): JstDate | null {
  if (!axis.length) return null
  let lo = 0
  let hi = axis.length - 1
  while (lo < hi) {
    const m = (lo + hi) >> 1
    if (dayNum(axis[m]!) < day) lo = m + 1
    else hi = m
  }
  const a = axis[Math.max(0, lo - 1)]!
  const b = axis[lo]!
  return Math.abs(dayNum(a) - day) <= Math.abs(dayNum(b) - day) ? a : b
}
/**
 * 右端の札の幅（px）: 760px より広いと 168、520px より広いと 124、狭いと札を出さない。名前は全角 8 文字まで出すので、
 * 設計の 132／112 では値が切れる（実装で広げた。design-perf.md §2.5）
 */
export const labelWidth = (w: number): number => (w > 760 ? 168 : w > 520 ? 124 : 0)
/** 次の並び（S） */
export const nextSort = (s: 0 | 1 | 2): 0 | 1 | 2 => ((s + 1) % 3) as 0 | 1 | 2
/** 終点が仮の足（FR-D8）か: 終わりの日の指定が無く、どれかの銘柄の最後の足が仮 */
export function endsProvisional(
  end: JstDate | undefined,
  bars: readonly ({ time: readonly string[]; provisional: readonly number[] } | null | undefined)[],
): boolean {
  return !end && bars.some((d) => !!d && d.provisional.includes(d.time.length - 1))
}
/** 札・小箱の文字の幅の目安（12px）: 名前の全角 12px・半角 6.6px、値（等幅・太字）1 文字 7.3px、間の空白 4px */
const namePx = (s: string): number => [...s].reduce((w, ch) => w + (isHalf(ch) ? 6.6 : 12), 0)
const isHalf = (ch: string): boolean => {
  const code = ch.codePointAt(0) ?? 0
  return code <= 0xff || (code >= 0xff61 && code <= 0xff9f)
}
/** 「名前 値」の幅の目安（px） */
export const labelPx = (name: string, value: string): number => namePx(name) + (name ? 4 : 0) + value.length * 7.3
/**
 * 名前を、値（+1234.5% など）と間の空白を残した幅 px に収まるまで詰める（入らなければ空）。
 * 右端の札は SVG の右の端、十字線の小箱は値の左で切れないように（画像に書き出すと SVG の幅で切れる）
 */
export function fitLabel(name: string, value: string, px: number): string {
  let out = ''
  for (const ch of name) {
    if (labelPx(out + ch, value) > px) break
    out += ch
  }
  return out.trim()
}
