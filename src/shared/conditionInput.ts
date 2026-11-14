// 条件の値を打つ・直すときの変換と、条件の欄を出すかの判定。スクリーナー（Screener.svelte）とアラートのダイアログ（AlertForm.svelte）が
// 同じ関数を呼ぶ（docs/test-plan.md §2 の 2。コンポーネントに変換・判定を書かない）。
import { FIELD_BY_ID, type FieldDef, moneyScale, parseTyped } from './fields'
import type { Condition } from './types'

type Lang = 'ja' | 'en'

/** 値を打つ単位の倍率。金額は表示の単位（1 株あたりは円、最低投資金額は万円、時価総額・売買代金は億円）。相対条件の値は % */
export function valueScale(c: Pick<Condition, 'field' | 'ref'>): number {
  const f = FIELD_BY_ID.get(c.field)
  return !c.ref && f?.type === 'money' ? moneyScale(f) : 1
}
/** 打つ単位の名前（円・万円・億円）。金額でなければ空 */
export function valueUnit(c: Pick<Condition, 'field' | 'ref'>, lang: Lang): string {
  const f = FIELD_BY_ID.get(c.field)
  return !c.ref && f?.type === 'money' && f.unit ? f.unit[lang] : ''
}
/**
 * 直すときに欄に入れる文字（表示の単位の数。100 億円なら「100」）。打ち直さずに確定しても値が変わらないよう、桁を落とさない
 * （有効数字 12 桁・指数の表記にしない）
 */
export function editText(c: Pick<Condition, 'field' | 'ref' | 'value'>): string {
  const x = Number(c.value) / valueScale(c)
  if (!Number.isFinite(x)) return ''
  const s = String(Number(x.toPrecision(12)))
  return /e/i.test(s) ? x.toFixed(12).replace(/\.?0+$/, '') : s
}
/** 打った文字を条件の値にする。単位の無い数は表示の単位、「30万」「1.5億」は書いた単位。読めなければ null（条件を変えない） */
export function parseConditionValue(c: Pick<Condition, 'field' | 'ref'>, s: string): number | null {
  return parseTyped(s, valueScale(c))
}
/** 数を打って直す条件か（数値・率・倍率・金額。相対条件は相手からの差の %） */
export function typesNumber(f: FieldDef | undefined): boolean {
  return !!f && (f.type === 'number' || f.type === 'percent' || f.type === 'ratio' || f.type === 'money')
}
/** 「欠損を含める」を選べるか（市場データの数値と、実行時に計算する指標。属性・列挙・利用者のデータは欠損しない） */
export function canIncludeMissing(f: FieldDef | undefined): boolean {
  return !!f && ((f.source.kind === 'metrics' && f.type !== 'enum') || f.source.kind === 'compute')
}
