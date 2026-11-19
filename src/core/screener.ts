// スクリーニング（§5.2）。指標の登録表（FR-FD1）に従って条件を評価する。metrics 表だけを読む（FR-S10）。
// 条件は「または」（Condition.or）でまとめたグループを「かつ」でつなぐ（FR-SC5）。相対条件は Condition.ref で別の指標と比べる。
import { COMPUTE_KEYS, computeValue, type HeldStats, heldStats } from '@shared/compute'
import { FIELD_BY_ID, migrateConditions, refFields, refTarget, usable } from '@shared/fields'
import { REF_ETF_IDS } from '@shared/markets'
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
export { COMPUTE_KEYS, computeValue }

/** 条件が評価できるか（FR-SC11: 今の版に無い・使えない指標は無効として残す） */
export function conditionValid(c: Condition): boolean {
  const f = FIELD_BY_ID.get(c.field)
  if (!usable(f) || (f.source.kind === 'compute' && !COMPUTE_KEYS.has(f.source.key))) return false
  if (!f.operators.includes(c.op)) return false
  if (c.ref) {
    const g = FIELD_BY_ID.get(c.ref)
    if (!usable(g) || g.source.kind !== 'metrics' || f.source.kind !== 'metrics' || (c.op !== '>=' && c.op !== '<=')) return false
    // 相手は同じ種類の指標だけ（価格どうし・騰落率どうしなど。前の版で保存した「終値 ≥ 時価総額」などは無効）
    if (!refFields(f).some((x) => x.id === g.id)) return false
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
    // NaN・Infinity は欠損（アラートの fieldValue と同じ。src/shared/alerts.ts）
    if (typeof x !== 'number' || !Number.isFinite(x)) return null
    let v = Number(c.value)
    if (c.ref) {
      const g = FIELD_BY_ID.get(c.ref)!
      const y = g.source.kind === 'metrics' ? (m as unknown as Row)[g.source.column] : null
      if (typeof y !== 'number' || !Number.isFinite(y)) return null
      v = refTarget(c.field, y, Number(c.value)) // 価格は相手の ± %、% の指標どうしは ± ポイント
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
    if (x == null || !Number.isFinite(x)) return null
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
  // マーケット一覧の連動 ETF（FR-U6）は取得の対象なので、スクリーナーにも出す（市場に ETF を選んだとき）
  return ins.status === 'active' && (ins.market === 'P' || ins.market === 'R' || ins.userAdded || REF_ETF_SET.has(ins.id))
}
const REF_ETF_SET = new Set(REF_ETF_IDS)

export function runScreen(input: ScreenInput): ScreenResult {
  const t0 = performance.now()
  // 保有割合の分母（保有の評価額の合計）は 1 回だけ作る
  let inp: ScreenInput = input
  if (input.holdings?.size) {
    const byId = new Map(input.instruments.map((i) => [i.id, i]))
    inp = {
      ...input,
      held: heldStats(
        input.holdings,
        (id) => input.metrics.get(id),
        (id) => byId.get(id),
      ),
    }
  }
  const invalid: number[] = []
  // 保存したときの指標の版から今の版へ移す（FR-FD5）。移せなかった条件は無効
  const { conditions, failed } = migrateConditions(inp.conditions)
  // 先に「または」でまとまりを作ってから、無効な条件を外す（外してからまとめると、無効な条件のすぐ下の「または」が
  // 前の「かつ」のまとまりに入り、条件が緩む）。条件がすべて無効なまとまりは外す
  const raw: { c: Condition; i: number }[][] = []
  conditions.forEach((c, i) => {
    if (c.or && raw.length) raw.at(-1)!.push({ c, i })
    else raw.push([{ c, i }])
  })
  const groups: { c: Condition }[][] = []
  for (const g of raw) {
    const kept = g.filter(({ c, i }) => {
      // 保有の記録が無いときの保有の指標は無効（FR-SC11・H6。全銘柄が欠損で 0 件にしない）
      const noHoldings = !!FIELD_BY_ID.get(c.field)?.requires?.includes('holdings') && !inp.holdings?.size
      const ok = conditionValid(c) && !failed.includes(i) && !noHoldings
      if (!ok) invalid.push(i)
      return ok
    })
    if (kept.length) groups.push(kept.map(({ c }) => ({ c })))
  }
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
