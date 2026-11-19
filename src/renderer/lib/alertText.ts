// アラートの条件・値・距離の表示（FR-AL8）。言葉はスクリーナーの条件の書き方にそろえる

import { refOffsetText } from '@shared/conditionInput'
import { FIELD_BY_ID, perShare } from '@shared/fields'
import type { AlertView, Condition } from '@shared/types'
import { app } from '../stores/app.svelte'
import { fmt, money, px } from './format'

const opText = (op: string) => (op === '>=' ? '≥' : op === '<=' ? '≤' : op)
const label = (id: string) => FIELD_BY_ID.get(id)?.label[app.settings.lang] ?? id

/** 指標の値（1 株あたりの価格は円、金額は億・兆、率は %） */
export function fieldValueText(field: string, v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—'
  const f = FIELD_BY_ID.get(field)
  if (!f) return fmt(v, 2)
  if (f.type === 'money') {
    if (perShare(f)) return px(v)
    const m = money(v)
    return `${m.n} ${m.u}`
  }
  if (f.type === 'percent') return `${fmt(v, f.digits ?? 2)}%`
  if (f.type === 'ratio') return `${fmt(v, f.digits ?? 2)}×`
  return fmt(v, f.digits ?? 0)
}

/** しきい値（整数の価格は小数を付けない: 990.0 ではなく 990） */
function thresholdText(field: string, v: number): string {
  const f = FIELD_BY_ID.get(field)
  return f && perShare(f) && Number.isInteger(v) ? fmt(v, 0) : fieldValueText(field, v)
}
/** 条件の文（例: 終値 ≤ 17,500 / 終値 ≤ 75日移動平均 +0% / 実績利回り ≥ 5.50%） */
export function condText(c: Condition): string {
  if (c.ref) {
    return `${label(c.field)} ${opText(c.op)} ${label(c.ref)} ${refOffsetText(c)}`
  }
  return `${label(c.field)} ${opText(c.op)} ${thresholdText(c.field, Number(c.value))}`
}
export const condsText = (cs: Condition[]): string => cs.map(condText).join(app.settings.lang === 'ja' ? ' かつ ' : ' and ')

/** 条件までの距離（あと −5.9% / あと 0.40pt / あと +210.0円）。円の差は 100 万円未満なら価格の書式、それ以上は万・億・兆 */
export function distanceText(d: AlertView['distance']): string {
  if (!d) return '—'
  const s = d.value >= 0 ? '+' : '−'
  const a = Math.abs(d.value)
  if (d.kind === 'pct') return `${s}${fmt(a, 1)}%`
  if (d.kind === 'pt') return `${s}${fmt(a, 2)}pt`
  const ja = app.settings.lang === 'ja'
  if (a < 1e6) return ja ? `${s}${px(a)}円` : `${s}¥${px(a)}`
  const m = money(a)
  return `${s}${m.n}${m.u}`
}
