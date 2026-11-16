// 騰落の集計（§6.17, FR-BR2〜BR3。設計: docs/design-breadth.md）。市場・業種ごとに上げ下げの数・新高値・新安値・売買代金と、
// 時価総額で加重した騰落率（ヒートマップと同じ）を出す。指標の表（metrics）の行だけから作る
import type { InstrumentId, JstDate, MetricsRow } from './types'

export type BreadthPeriod = 'd1' | 'm1' | 'm3' | 'ytd' | 'y1'
/** 騰落率の期間と指標の列（ヒートマップの期間と同じ列） */
export const BREADTH_PERIODS: Record<BreadthPeriod, 'chgPct' | 'ret1m' | 'ret3m' | 'retYtd' | 'ret1y'> = {
  d1: 'chgPct',
  m1: 'ret1m',
  m3: 'ret3m',
  ytd: 'retYtd',
  y1: 'ret1y',
}

export type BreadthMetrics = Pick<
  MetricsRow,
  'asOf' | 'chgPct' | 'ret1m' | 'ret3m' | 'retYtd' | 'ret1y' | 'marketCap' | 'turnover' | 'newHi52' | 'newLo52'
>
export interface BreadthIn {
  id: InstrumentId
  /** 集計の単位（市場の記号・業種名） */
  group: string
  m: BreadthMetrics
}
export interface BreadthRow {
  key: string
  /** 銘柄数（指標のある銘柄） */
  n: number
  up: number
  down: number
  flat: number
  newHi: number
  newLo: number
  /** 売買代金の合計（円）。基準日の値が 1 つも無ければ欠損 */
  turnover: number | null
  /** 時価総額で加重した騰落率（%） */
  ret: Record<BreadthPeriod, number | null>
  /** いちばん新しい基準日 */
  asOf: JstDate | null
  ids: InstrumentId[]
}

/**
 * 集計する。行の並びは、最初に出てきた順（呼ぶ側が並べ替える）。
 * 上げ下げ・新高値・新安値・売買代金は、その集まりのいちばん新しい基準日の銘柄だけで数える（古い値を今日の数に混ぜない）。
 * 加重の騰落率は、値と時価総額（> 0）の両方がある銘柄で出す（ヒートマップと同じ。基準日は問わない）
 */
export function breadth(rows: BreadthIn[]): BreadthRow[] {
  const groups = new Map<string, BreadthIn[]>()
  for (const r of rows) {
    const g = groups.get(r.group)
    if (g) g.push(r)
    else groups.set(r.group, [r])
  }
  return [...groups].map(([key, rs]) => {
    let asOf: JstDate | null = null
    for (const r of rs) if (r.m.asOf && (!asOf || r.m.asOf > asOf)) asOf = r.m.asOf
    const out: BreadthRow = {
      key,
      n: rs.length,
      up: 0,
      down: 0,
      flat: 0,
      newHi: 0,
      newLo: 0,
      turnover: null,
      ret: { d1: null, m1: null, m3: null, ytd: null, y1: null },
      asOf,
      ids: rs.map((r) => r.id),
    }
    for (const { m } of rs) {
      if (!asOf || m.asOf !== asOf) continue
      if (m.chgPct != null) {
        if (m.chgPct > 0) out.up++
        else if (m.chgPct < 0) out.down++
        else out.flat++
      }
      if (m.newHi52 === 1) out.newHi++
      if (m.newLo52 === 1) out.newLo++
      if (m.turnover != null) out.turnover = (out.turnover ?? 0) + m.turnover
    }
    for (const p of Object.keys(BREADTH_PERIODS) as BreadthPeriod[]) out.ret[p] = weighted(rs, BREADTH_PERIODS[p])
    return out
  })
}

function weighted(rs: BreadthIn[], col: (typeof BREADTH_PERIODS)[BreadthPeriod]): number | null {
  let w = 0
  let n = 0
  for (const { m } of rs) {
    const v = m[col]
    const c = m.marketCap
    if (v == null || c == null || !(c > 0)) continue
    w += v * c
    n += c
  }
  return n > 0 ? w / n : null
}
