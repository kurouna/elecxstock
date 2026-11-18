// 当時の条件で選び直す（docs/design-simulator.md §1.2・§13・§21.11。P2）: スクリーンの条件のうち、基準日の値で作り直せるものだけを使う。純粋関数。
import { addDays, addYears } from '../calendar'
import { FIELD_BY_ID } from '../fields'
import type { Condition, Dividend, JstDate } from '../types'

/** 基準日の値で作り直せる指標（価格と配当の記録だけから決まる） */
export const RESCREEN_KEYS = new Set(['yieldTrailing', 'divUpYears', 'divNoCutYears'])
/** 基準日で使える指標か（銘柄の属性・★・ウォッチリストは今の値のまま。保有は今の保有なので使わない） */
function usable(id: string): boolean {
  const src = FIELD_BY_ID.get(id)?.source
  return src?.kind === 'attr' || (src?.kind === 'user' && src.key !== 'held') || (src?.kind === 'metrics' && RESCREEN_KEYS.has(src.column))
}
/**
 * 条件を、基準日で使えるもの（kept）と使えないもの（ignored。指標の ID）に分ける。
 * 「または」のまとまりを先に作ってから外す（外してからまとめると、外した条件のすぐ下の「または」が前の「かつ」のまとまりに入り、
 * 条件が緩む。screener.ts と同じ）。まとまりの頭を外したら、残った最初の条件を頭にする。作り直せない指標と比べる相対条件も外す
 */
export function splitRescreen(conds: Condition[]): { kept: Condition[]; ignored: string[] } {
  const groups: Condition[][] = []
  for (const c of conds) {
    if (c.or && groups.length) groups.at(-1)!.push(c)
    else groups.push([c])
  }
  const kept: Condition[] = []
  const ignored: string[] = []
  for (const g of groups) {
    const ok = g.filter((c) => {
      const y = usable(c.field) && (c.ref == null || usable(c.ref))
      if (!y && !ignored.includes(c.field)) ignored.push(c.field)
      return y
    })
    ok.forEach((c, i) => {
      const { or: _, ...rest } = c
      kept.push(i === 0 ? rest : { ...rest, or: true })
    })
  }
  return { kept, ignored }
}
/**
 * 基準日の実績利回り（%）: 直近 1 年（権利落ち日ベース）の配当 ÷ 株価。その 1 年を配当の記録が覆っていなければ欠損
 * （metrics.ts の実績利回りと同じ扱い。記録の無い銘柄を 0% として選ばない）
 */
export function yieldAt(divs: Dividend[], price: number, base: JstDate, divFrom: JstDate): number | null {
  const from = addYears(base, -1)
  if (!(price > 0) || divFrom > addDays(from, 7)) return null
  return (divs.filter((d) => d.date > from && d.date <= base).reduce((a, d) => a + d.amount, 0) / price) * 100
}
