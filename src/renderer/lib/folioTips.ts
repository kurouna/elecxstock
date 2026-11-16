// ポートフォリオのグラフのツールチップの文言（FR-PF1・PF5・PF7）。マウスを載せたときに出す詳細で、
// 画面に出ている値の内訳を足す。文言は渡された t で作る（このファイルは画面の状態を読まない）
import type { FolioContribRow } from '@shared/types'
import type { DivGroupRow, DivRow, FolioEvent, FRow, Tile } from './folio'
import { lastTone, signPct, yenFull } from './folio'
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

/**
 * 1 株配当（5 年）の小さな棒: 年ごとの値（古い順）と、右端（直近 1 年）の色の意味。
 * 分類の行（group）は 1 株配当 × 今の株数の合計（税引前の円）
 */
export function dpsTip(dps: (number | null)[], group: boolean, tr: Tr): string {
  const n = dps.length
  const fmt = (v: number | null) =>
    v == null || (group && !v) ? '—' : group ? yen(v) : v.toLocaleString('ja-JP', { maximumFractionDigits: 2 })
  const tone = lastTone(dps)
  const a = dps.at(-1)
  const b = dps.at(-2)
  const chg = tone !== 'flat' && a != null && b ? `（${signPct((a / b - 1) * 100)}）` : ''
  return [
    tr(group ? 'folio.dps.group' : 'folio.dps.head'),
    ...dps.map((v, i) => `  ${i === n - 1 ? tr('folio.dps.last') : tr('folio.dps.ago', { n: n - 1 - i })}  ${fmt(v)}`),
    `${tr(`folio.dps.${tone}` as Key)}${chg}`,
  ].join('\n')
}

/** 年間配当の推移: x（図の左端から）に近い記録の位置 */
export function trendIndexAt(px: number, w: number, n: number): number {
  if (n < 2) return 0
  return Math.max(0, Math.min(n - 1, Math.round((px / Math.max(1, w - 50)) * (n - 1))))
}
/** 年間配当の推移: その日の配当見込みと、最初の記録からの増減 */
export function trendLabel(trend: { d: string; v: number }[], i: number, tr: Tr): string {
  const p = trend[i]
  if (!p) return ''
  return tr('folio.trendAt', { d: p.d.replaceAll('-', '/'), v: yen(p.v), dv: yen(p.v - trend[0]!.v, true) })
}

/** 今後 30 日の予定の印: 日付・あと何日・種類・銘柄と、権利なら配当見込みの額・決算なら株数・アラートなら条件 */
export function eventTip(e: FolioEvent, tr: Tr): string {
  const when = e.day ? tr('folio.inDays', { n: e.day }) : e.type === 'alert' ? tr('folio.ev.met') : tr('folio.today')
  const x =
    e.type === 'rights'
      ? e.amount
        ? tr('folio.ev.amount', { v: yenFull(e.amount) })
        : ''
      : e.type === 'earnings'
        ? tr('folio.ev.qty', { n: (e.qty ?? 0).toLocaleString() })
        : (e.text ?? '')
  return [`${e.date.replaceAll('-', '/')}（${when}）${tr(`folio.ev.${e.type}Long` as Key)}`, `${e.code} ${e.name}`, ...(x ? [x] : [])].join(
    '\n',
  )
}

/** 資産推移の期間の内訳の棒: 期首・期末は日付、入出金・評価損益の増減はその意味 */
export function histStepTip(key: string, v: number, from: string | null, to: string | null, tr: Tr): string {
  const total = key === 'start' || key === 'end'
  const d = key === 'start' ? from : key === 'end' ? to : null
  const head = `${tr(`folio.wf.${key}` as Key)} ${yen(v, !total)}${d ? `（${d.replaceAll('-', '/')}）` : ''}`
  const note = key === 'flow' ? tr('folio.wfTip.flow') : key === 'move' ? tr('folio.wfTip.move') : ''
  return note ? `${head}\n${note}` : head
}
