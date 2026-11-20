// ペインの種類を選ぶダイアログの判定（docs/design-dialogs.md §5）: 絞り込み・使えない種類・今の種類・このタブにある数、
// カードの格子のキーでの移動、変えると何が起きるか。画面（overlays/WidgetPicker.svelte）は描くだけ
import { type Match, matchText } from '@shared/match'
import type { WidgetId } from '../stores/layout.svelte'
import { WIDGET_GROUPS, WIDGET_INFO, WIDGET_ORDER, type WidgetGroup } from './widgetInfo'
import { FREE_WIDGETS } from './windowSlot'

export interface Card {
  id: WidgetId
  name: string
  desc: string
  ranges: Match['ranges']
  /** フリー N では使えない（FR-L7）。消さずに薄くし、選べない */
  disabled: boolean
  /** 今の種類（「いま」の札。分割では無い） */
  current: boolean
  /** このタブにもうある数（対象のペインは数えない） */
  inTab: number
}
export interface CardGroup {
  group: WidgetGroup
  cards: Card[]
}

/** 別名（i18n の widgetAlias.* を , で分けたもの。漢字の名前の読みも入れる） */
const aliasOf = (tr: (k: string) => string, id: WidgetId) =>
  tr(`widgetAlias.${id}`)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

/** 分類の順に、絞り込んだカード。当たらない分類は出さない。並びは絞り込んでも変えない（場所を覚えられるように） */
export function pickerGroups(o: {
  q: string
  free: boolean
  current: WidgetId | null
  counts: Partial<Record<WidgetId, number>>
  tr: (k: string) => string
}): CardGroup[] {
  const out: CardGroup[] = []
  for (const group of WIDGET_GROUPS) {
    const cards: Card[] = []
    for (const id of WIDGET_ORDER) {
      if (WIDGET_INFO[id].group !== group) continue
      const name = o.tr(`widget.${id}`)
      const desc = o.tr(`widgetDesc.${id}`)
      const m = matchText(o.q, name, [...aliasOf(o.tr, id), desc])
      if (!m) continue
      cards.push({
        id,
        name,
        desc,
        ranges: m.ranges,
        disabled: o.free && !FREE_WIDGETS.includes(id),
        current: id === o.current,
        inTab: Math.max(0, (o.counts[id] ?? 0) - (id === o.current ? 1 : 0)),
      })
    }
    if (cards.length) out.push({ group, cards })
  }
  return out
}

export type GridDir = 'left' | 'right' | 'up' | 'down' | 'next' | 'prev'
/**
 * カードの格子（分類ごとに cols 列で折り返す）の中で、dir の方向の選べるカード。
 * ← → は同じ行、↑ ↓ は次の行の近い列。その方向に相手が無ければ読む順の前後へ送る（絞り込むと同じ行に 2 枚並び、↓ だけでは 2 枚目に行けないため）
 */
export function gridMove<T extends string>(groups: { cards: { id: T; disabled: boolean }[] }[], cols: number, cur: T, dir: GridDir): T {
  const pos: { id: T; row: number; col: number; disabled: boolean }[] = []
  let row0 = 0
  for (const g of groups) {
    g.cards.forEach((c, i) => pos.push({ id: c.id, row: row0 + Math.floor(i / cols), col: i % cols, disabled: c.disabled }))
    row0 += Math.ceil(g.cards.length / cols)
  }
  const ok = pos.filter((p) => !p.disabled)
  const at = ok.findIndex((p) => p.id === cur)
  if (at < 0) return ok[0]?.id ?? cur
  const me = ok[at]!
  const linear = (d: number) => ok[at + d]?.id ?? cur
  if (dir === 'next') return linear(1)
  if (dir === 'prev') return linear(-1)
  if (dir === 'left' || dir === 'right') {
    const d = dir === 'right' ? 1 : -1
    const same = ok
      .filter((p) => p.row === me.row && Math.sign(p.col - me.col) === d)
      .sort((a, b) => Math.abs(a.col - me.col) - Math.abs(b.col - me.col))
    return same[0]?.id ?? linear(d)
  }
  const d = dir === 'down' ? 1 : -1
  const rows = [...new Set(ok.map((p) => p.row))]
    .filter((r) => Math.sign(r - me.row) === d)
    .sort((a, b) => Math.abs(a - me.row) - Math.abs(b - me.row))
  const r = rows[0]
  if (r == null) return linear(d)
  const inRow = ok.filter((p) => p.row === r).sort((a, b) => Math.abs(a.col - me.col) - Math.abs(b.col - me.col) || a.col - b.col)
  return inRow[0]!.id
}

export type Outcome =
  | { kind: 'same' }
  | { kind: 'change' | 'split'; follow: 'link' | 'own'; link: number; resets: boolean; inTab: number; dir?: 'row' | 'col' }
/**
 * 選んだ種類にすると何が起きるか（下の段に出す）。リンク色があればその銘柄に従い、無ければ自分の銘柄を引き継ぐ（FR-L11）。
 * 種類を変えると、時間軸・指標などそのペインの設定は初期に戻る（layout の changeWidget）
 */
export function pickOutcome(o: {
  mode: 'change' | 'split'
  /** 分割の向き（row: 右・col: 下） */
  dir?: 'row' | 'col'
  current: WidgetId | null
  target: WidgetId
  link: number
  inTab: number
}): Outcome {
  if (o.mode === 'change' && o.target === o.current) return { kind: 'same' }
  const out: Outcome = { kind: o.mode, follow: o.link ? 'link' : 'own', link: o.link, resets: o.mode === 'change', inTab: o.inTab }
  return o.mode === 'split' ? { ...out, dir: o.dir ?? 'row' } : out
}
/** ペインの種類ごとの数（「このタブに N」） */
export function paneCounts(panes: readonly { widget: WidgetId }[]): Partial<Record<WidgetId, number>> {
  const out: Partial<Record<WidgetId, number>> = {}
  for (const p of panes) out[p.widget] = (out[p.widget] ?? 0) + 1
  return out
}
/** 下の段の 2 行（何を引き継ぐか / 何が戻るか・このタブにある数） */
export function outcomeText(
  o: Outcome,
  c: { tr: (k: string, a?: Record<string, string | number>) => string; sym: string; curName: string; targetName?: string },
): [string, string] {
  if (o.kind === 'same') return [c.tr('wpick.same'), '']
  const first =
    o.follow === 'link'
      ? c.sym
        ? c.tr('wpick.followLinkSym', { n: o.link, sym: c.sym })
        : c.tr('wpick.followLink', { n: o.link })
      : c.sym
        ? c.tr('wpick.keepSym', { sym: c.sym })
        : c.tr('wpick.keepNone')
  // 分割は、どこに何を足すかを先に
  const lead = o.kind === 'split' ? `${c.tr(o.dir === 'col' ? 'wpick.addCol' : 'wpick.addRow', { name: c.targetName ?? '' })} ` : ''
  const second = [o.resets ? c.tr('wpick.resets', { name: c.curName }) : '', o.inTab > 0 ? c.tr('wpick.already', { n: o.inTab }) : '']
    .filter(Boolean)
    .join(' · ')
  return [lead + first, second]
}
/**
 * 選ぶカード: 初めは今の種類。打っている間は、選んでいるカードが残ればそのまま（今の種類なら、ほかの先頭へ移す。
 * 今の種類のままだと Enter で何も起きない）。消えたら今の種類以外の先頭
 */
export function pickSel<T extends string>(ids: readonly T[], current: T | null, q: string, prev: T | null): T | null {
  const other = ids.find((x) => x !== current) ?? null
  if (prev && ids.includes(prev) && !(q && prev === current && other)) return prev
  if (!q && current && ids.includes(current)) return current
  return other ?? (current && ids.includes(current) ? current : null)
}
