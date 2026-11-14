// スクリーニング（§5.2）。指標の登録表（FR-FD1）に従って条件を評価する。metrics 表だけを読む（FR-S10）。
// 条件は「または」（Condition.or）でまとめたグループを「かつ」でつなぐ（FR-SC5）。相対条件は Condition.ref で別の指標と比べる。
import { jstNow } from '@shared/calendar'
import { FIELD_BY_ID, migrateConditions, usable } from '@shared/fields'
import { epochDay } from '@shared/rights'
import type { Condition, Instrument, InstrumentId, JstDate, MetricsRow, ScreenResult } from '@shared/types'

export interface ScreenInput {
  conditions: Condition[]
  instruments: Instrument[]
  metrics: Map<InstrumentId, MetricsRow>
  favorites: Set<InstrumentId>
  watchlists: Record<string, InstrumentId[]>
  /** 保有（銘柄ごとの数量と取得価額の合計。口座区分をまたぐ）。保有の条件に使う（FR-H4, H6） */
  holdings?: Map<InstrumentId, { qty: number; cost: number }>
  /** 今日（予定までの日数を数える。既定は日本時間の今日） */
  today?: JstDate
  /** 保有の評価額の合計と業種ごとの合計（保有割合。runScreen が 1 回だけ作る） */
  held?: HeldStats
}
interface HeldStats {
  total: number
  value: Map<InstrumentId, number>
  bySector: Map<string, number>
}

/** 実行時に計算する指標（登録表の source.kind === 'compute'） */
export const COMPUTE_KEYS = new Set(['pnlPct', 'earningsDays', 'rightsDays', 'weight', 'sectorWeight', 'yoc'])
/** 業種のまとまり（J-REIT はまとめて 1 つ。銘柄情報の業種の中央値と同じ） */
const sectorOf = (i: Pick<Instrument, 'kind' | 'sectorJa'>) => (i.kind === 'reit' ? 'REIT' : i.sectorJa)

/** 保有の評価額（最新の終値 × 数量）の合計と、銘柄ごと・業種ごと */
function heldStats(inp: ScreenInput, byId: Map<InstrumentId, Instrument>): HeldStats {
  const value = new Map<InstrumentId, number>()
  const bySector = new Map<string, number>()
  let total = 0
  for (const [id, h] of inp.holdings ?? []) {
    const c = inp.metrics.get(id)?.close
    if (c == null || !(h.qty > 0)) continue
    const v = c * h.qty
    value.set(id, v)
    total += v
    const ins = byId.get(id)
    if (ins) bySector.set(sectorOf(ins), (bySector.get(sectorOf(ins)) ?? 0) + v)
  }
  return { total, value, bySector }
}

/** 実行時に計算する指標の値。欠損は null（FR-SC8） */
export function computeValue(key: string, ins: Instrument, m: MetricsRow, inp: ScreenInput): number | null {
  const h = inp.holdings?.get(ins.id)
  switch (key) {
    case 'pnlPct':
      // 保有の評価損益率: 持っていない銘柄・終値の無い銘柄は欠損
      return h && h.cost > 0 && m.close != null ? ((m.close * h.qty) / h.cost - 1) * 100 : null
    case 'earningsDays':
    case 'rightsDays': {
      // 日付から今日までの暦日数（metrics に日数を持つと、更新しない日に古くなる）。過ぎた日付は欠損
      const day = key === 'earningsDays' ? m.earningsDay : m.rightsDay
      if (day == null) return null
      const d = day - epochDay(inp.today ?? jstNow().date)
      return d >= 0 ? d : null
    }
    case 'weight': {
      // 保有割合: 保有していない銘柄は 0%（保有の記録が無ければ欠損）
      const s = inp.held
      if (!s || !(s.total > 0)) return null
      return ((s.value.get(ins.id) ?? 0) / s.total) * 100
    }
    case 'sectorWeight': {
      const s = inp.held
      if (!s || !(s.total > 0)) return null
      return ((s.bySector.get(sectorOf(ins)) ?? 0) / s.total) * 100
    }
    case 'yoc':
      // 取得利回り: 過去 12 か月の配当 ÷ 平均取得単価。保有していない銘柄は欠損
      return h && h.qty > 0 && h.cost > 0 && m.div12 != null ? (m.div12 / (h.cost / h.qty)) * 100 : null
  }
  return null
}

/** 条件が評価できるか（FR-SC11: 今の版に無い・使えない指標は無効として残す） */
export function conditionValid(c: Condition): boolean {
  const f = FIELD_BY_ID.get(c.field)
  if (!usable(f) || (f.source.kind === 'compute' && !COMPUTE_KEYS.has(f.source.key))) return false
  if (!f.operators.includes(c.op)) return false
  if (c.ref) {
    const g = FIELD_BY_ID.get(c.ref)
    if (!usable(g) || g.source.kind !== 'metrics' || f.source.kind !== 'metrics' || (c.op !== '>=' && c.op !== '<=')) return false
  }
  return true
}

type Row = Record<string, unknown>

/** 1 つの条件を評価する。true / false、または欠損（FR-SC8）で null */
function test(c: Condition, ins: Instrument, m: MetricsRow, inp: ScreenInput, wl: Map<string, Set<InstrumentId>>): boolean | null {
  const f = FIELD_BY_ID.get(c.field)!
  const src = f.source
  if (src.kind === 'metrics') {
    const x = (m as unknown as Row)[src.column]
    if (Array.isArray(x)) {
      // 権利確定月など、複数の値を持つ指標: 1 つでも当たれば「含まれる」
      const vs = (Array.isArray(c.value) ? c.value : [String(c.value)]).map(String)
      const hit = x.some((v) => vs.includes(String(v)))
      return c.op === 'notin' ? !hit : hit
    }
    if (x == null || typeof x !== 'number') return null
    let v = Number(c.value)
    if (c.ref) {
      const g = FIELD_BY_ID.get(c.ref)!
      const y = g.source.kind === 'metrics' ? (m as unknown as Row)[g.source.column] : null
      if (y == null || typeof y !== 'number') return null
      v = y * (1 + Number(c.value) / 100) // 相手の値 ± value %
    }
    return c.op === '>=' ? x >= v : c.op === '<=' ? x <= v : false
  }
  if (src.kind === 'attr') {
    const x = String(ins[src.key])
    const vs = Array.isArray(c.value) ? c.value : [String(c.value)]
    const hit = vs.includes(x)
    return c.op === 'in' ? hit : c.op === 'notin' ? !hit : x === String(c.value)
  }
  if (src.kind === 'user' && src.key === 'favorite') return inp.favorites.has(ins.id) === Boolean(c.value)
  if (src.kind === 'user' && src.key === 'held') return (inp.holdings?.has(ins.id) ?? false) === Boolean(c.value)
  if (src.kind === 'compute') {
    const x = computeValue(src.key, ins, m, inp)
    if (x == null) return null
    const v = Number(c.value)
    return c.op === '>=' ? x >= v : c.op === '<=' ? x <= v : false
  }
  const lists = Array.isArray(c.value) ? c.value : [String(c.value)]
  const hit = lists.some((l) => wl.get(l)?.has(ins.id))
  return c.op === 'in' ? hit : !hit
}

/**
 * 1 銘柄について、条件をすべて（「かつ」）判定する（アラート。FR-AL1）。保存したときの版から移し、使えない条件があれば invalid。
 * どれかの値が欠けていれば met は null
 */
export function evaluateConditions(
  conditions: Condition[],
  ins: Instrument,
  m: MetricsRow,
  holdings?: Map<InstrumentId, { qty: number; cost: number }>,
): { met: boolean | null; invalid?: true } {
  const { conditions: cs, failed } = migrateConditions(conditions)
  if (failed.length || !cs.every(conditionValid)) return { met: null, invalid: true }
  const inp: ScreenInput = {
    conditions: cs,
    instruments: [],
    metrics: new Map(),
    favorites: new Set(),
    watchlists: {},
    ...(holdings ? { holdings } : {}),
  }
  const wl = new Map<string, Set<InstrumentId>>()
  let all = true
  for (const c of cs) {
    const r = test(c, ins, m, inp, wl)
    if (r === null) return { met: null }
    if (!r) all = false
  }
  return { met: all }
}

/** スクリーニング・ランキング・ヒートマップの対象か: いま取得している銘柄だけ（FR-U4, U8） */
export function screenable(ins: Instrument): boolean {
  return ins.status === 'active' && (ins.market === 'P' || ins.market === 'R' || ins.userAdded)
}

export function runScreen(input: ScreenInput): ScreenResult {
  const t0 = performance.now()
  // 保有割合の分母（保有の評価額の合計）は 1 回だけ作る
  const inp: ScreenInput = input.holdings?.size
    ? { ...input, held: heldStats(input, new Map(input.instruments.map((i) => [i.id, i]))) }
    : input
  const invalid: number[] = []
  // 保存したときの指標の版から今の版へ移す（FR-FD5）。移せなかった条件は無効
  const { conditions, failed } = migrateConditions(inp.conditions)
  const groups: { c: Condition }[][] = []
  conditions.forEach((c, i) => {
    const ok = conditionValid(c) && !failed.includes(i)
    if (!ok) {
      invalid.push(i)
      return
    }
    if (c.or && groups.length) groups.at(-1)!.push({ c })
    else groups.push([{ c }])
  })
  const wl = new Map(Object.entries(inp.watchlists).map(([k, v]) => [k, new Set(v)]))
  const ids: InstrumentId[] = []
  const rows: MetricsRow[] = []
  for (const ins of inp.instruments) {
    if (ins.market === 'I') continue
    // 廃止した銘柄と、取得をやめた銘柄（プライム・J-REIT から外れ、どのウォッチリストにも無い）は対象にしない。
    // 指標が取得をやめた時点のまま古くなっているため（FR-SC1, FR-U4, U8）
    if (!screenable(ins)) continue
    const m = inp.metrics.get(ins.id)
    if (!m) continue
    let ok = true
    for (const g of groups) {
      // グループの中は「または」。欠損は includeMissing の条件だけ当たりとみなす（FR-SC8）
      let any = false
      for (const { c } of g) {
        const r = test(c, ins, m, inp, wl)
        if (r === true || (r === null && c.includeMissing)) {
          any = true
          break
        }
      }
      if (!any) {
        ok = false
        break
      }
    }
    if (ok) {
      ids.push(ins.id)
      rows.push(m)
    }
  }
  return { ids, rows, invalid, ms: Math.round((performance.now() - t0) * 10) / 10 }
}
