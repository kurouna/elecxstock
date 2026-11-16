// ポートフォリオのグラフのツールチップの文言（FR-PF1・PF5・PF7）。マウスを載せたときに出す詳細で、
// 画面に出ている値の内訳を足す。文言は渡された t で作る（このファイルは画面の状態を読まない）
import type { FolioContribRow } from '@shared/types'
import type { DivGroupRow, DivRow, FRow, Tile } from './folio'
import { signPct, yenFull } from './folio'
import type { Key } from './i18n'

export type Tr = (k: Key, v?: Record<string, string | number>) => string

/** 円（桁区切り）。sign で +/− を付ける */
export const yen = (v: number, sign = false) => {
  const s = v < 0 && Math.round(Math.abs(v)) ? '−' : sign && Math.round(v) > 0 ? '+' : sign ? '±' : ''
  return `${s}¥${yenFull(Math.abs(v))}`
}
const pctOf = (v: number, total: number) => (total ? `${((v / total) * 100).toFixed(1)}%` : '—')
/** 額の大きい順に max 件と「ほか N 件」 */
function top<T>(xs: T[], max: number, line: (x: T) => string, amt: (x: T) => number, tr: Tr, sign = false): string[] {
  const out = xs.slice(0, max).map(line)
  const rest = xs.slice(max)
  if (rest.length)
    out.push(
      tr('folio.tip.more', {
        n: rest.length,
        amt: yen(
          rest.reduce((s, x) => s + amt(x), 0),
          sign,
        ),
      }),
    )
  return out
}

/** 配当の内訳のスライス（分類 1 つ）。other は「その他」にまとめた分類 */
export function donutTip(g: DivGroupRow, total: number, name: string, byCode: boolean, tr: Tr, max = 5): string {
  const d = g.annual - g.annualPrev
  const parts = [
    g.raise > 0.5 || g.raise < -0.5 ? `${tr(g.raise > 0 ? 'folio.fx.raise' : 'folio.fx.cut')} ${yen(g.raise, true)}` : '',
    Math.abs(g.qty) > 0.5 ? `${tr('folio.fx.qty')} ${yen(g.qty, true)}` : '',
  ].filter(Boolean)
  const lines = [
    name,
    `${tr('folio.annualNet')} ${yen(g.annual)}（${pctOf(g.annual, total)}）`,
    `${tr('folio.yoy')} ${yen(d, true)}${parts.length ? `（${parts.join('・')}）` : ''}`,
    `${tr('folio.yieldYoc')} ${g.yld == null ? '—' : `${g.yld.toFixed(2)}%`} / ${g.yoc == null ? '—' : `${g.yoc.toFixed(2)}%`}`,
  ]
  if (!byCode) {
    const rs = g.rows.filter((r) => r.annual > 0).sort((a, b) => b.annual - a.annual)
    lines.push(
      tr('folio.tip.count', { n: rs.length }),
      ...top(
        rs,
        max,
        (r) => `  ${r.code} ${r.name}  ${yen(r.annual)}`,
        (r) => r.annual,
        tr,
      ),
    )
  }
  return lines.join('\n')
}
/** 配当の内訳の「その他」: まとめた分類を額の順に */
export function donutOtherTip(gs: DivGroupRow[], total: number, name: (g: DivGroupRow) => string, tr: Tr, max = 8): string {
  const sum = gs.reduce((s, g) => s + g.annual, 0)
  return [
    `${tr('folio.other')}（${gs.length}）`,
    `${tr('folio.annualNet')} ${yen(sum)}（${pctOf(sum, total)}）`,
    ...top(
      gs,
      max,
      (g) => `  ${name(g)}  ${yen(g.annual)}`,
      (g) => g.annual,
      tr,
    ),
  ].join('\n')
}

/** 配当の増減要因の棒: その要因に入る銘柄と額。両端（前年・現在）は銘柄の数 */
export function divStepTip(key: string, v: number, rows: DivRow[], tr: Tr, max = 8): string {
  const head = `${tr(`folio.dwf.${key}` as Key)} ${key === 'prev' || key === 'now' ? yen(v) : yen(v, true)}`
  if (key === 'prev') return `${head}\n${tr('folio.tip.count', { n: rows.filter((r) => r.annualPrev > 0.5).length })}`
  if (key === 'now') return `${head}\n${tr('folio.tip.count', { n: rows.filter((r) => r.annual > 0.5).length })}`
  const pick: Record<string, (r: DivRow) => number> = {
    raise: (r) => (r.raise > 0.5 ? r.raise : 0),
    cut: (r) => (r.raise < -0.5 ? r.raise : 0),
    new: (r) => (r.factor === 'new' ? r.qty : 0),
    add: (r) => (r.factor === 'add' ? r.qty : 0),
    sold: (r) => (r.factor === 'sold' || r.factor === 'trim' ? r.qty : 0),
    acct: (r) => (r.factor === 'acct' ? r.qty : 0),
  }
  const f = pick[key]
  if (!f) return head
  const rs = rows
    .map((r) => ({ r, v: f(r) }))
    .filter((x) => Math.abs(x.v) > 0.5)
    .sort((a, b) => Math.abs(b.v) - Math.abs(a.v))
  if (!rs.length) return `${head}\n${tr('folio.tip.none')}`
  const tag = (r: DivRow) => (key === 'sold' && r.factor === 'trim' ? `（${tr('folio.fx.trim')}）` : '')
  return [
    head,
    ...top(
      rs,
      max,
      (x) => `  ${x.r.code} ${x.r.name}${tag(x.r)}  ${yen(x.v, true)}`,
      (x) => x.v,
      tr,
      true,
    ),
  ].join('\n')
}

/** 資産構成のタイル（銘柄。口座で分けないときは口座をまたいで合計） */
export function tileTip(t: Tile, totalValue: number, tr: Tr): string {
  const rs: FRow[] = t.item.rows
  const r = rs[0]!
  const value = rs.reduce((s, x) => s + x.value, 0)
  const cost = rs.reduce((s, x) => s + x.cost, 0)
  const pnl = rs.reduce((s, x) => s + x.pnl, 0)
  const day = rs.reduce((s, x) => s + x.dayPnl, 0)
  const base = value - day
  return [
    `${r.code} ${r.name}`,
    `${tr('folio.value')} ${yen(value)}（${pctOf(value, totalValue)}）`,
    `${tr('folio.pnl')} ${yen(pnl, true)}（${signPct(cost ? (pnl / cost) * 100 : null)}）`,
    `${tr('folio.heatDay')} ${yen(day, true)}（${signPct(base ? (day / base) * 100 : null)}）`,
  ].join('\n')
}

/** 損益寄与の行: 値動きと配当の内訳 */
export function contribTip(r: FolioContribRow & { name: string }, tr: Tr): string {
  return [
    `${r.code} ${r.name}`,
    `${tr('folio.tip.price')} ${yen(r.price, true)}`,
    `${tr('folio.tip.div')} ${yen(r.div, true)}`,
    `${tr('folio.tip.total')} ${yen(r.price + r.div, true)}`,
    ...(r.soldOn ? [tr('folio.soldTip', { d: r.soldOn })] : []),
  ].join('\n')
}
