// スクリーナーの条件の編集（FR-SC1, SC5, SC10）: 条件を作る・値の表示・← → で送る・選択肢・並べ替えと「または」。
// コンポーネント（Screener.svelte）に変換・判定を書かない（docs/testing.md）。テストは tests/unit/renderer/condition-edit.test.ts
import { refOffsetText } from '@shared/conditionInput'
import { FIELD_BY_ID, type FieldDef, MARKET_CHOICES } from '@shared/fields'
import type { Condition } from '@shared/types'
import { app, t } from '../stores/app.svelte'
import { fieldValueText } from './alertText'
import { fmt } from './format'

type Lang = 'ja' | 'en'
type Value = Condition['value']

/** 市場区分の ← → で巡る組（よく使う組み合わせ） */
const MARKET_SETS = [['P', 'R'], ['P'], ['R'], ['P', 'S', 'G'], ['P', 'S', 'G', 'R', 'E']]

/** 指標を選んだときの条件（既定の値。ウォッチリストは最初のリスト） */
export function newCondition(f: FieldDef): Condition {
  const value = f.source.kind === 'user' && f.type === 'enum' ? [app.watchlists[0]?.id ?? 'favorites'] : (f.default ?? 0)
  return { field: f.id, op: f.operators[0]!, value: value as Value }
}

/** 値の選択肢（列挙の指標。ウォッチリストは今のリストから）。数値の指標は空 */
export function valueChoices(f: FieldDef, lang: Lang): { id: string; label: string }[] {
  if (f.type !== 'enum') return []
  if (f.source.kind === 'user') return app.watchlists.map((w) => ({ id: w.id, label: w.name[lang] }))
  return (f.choices ?? (f.id === 'attr.market' ? MARKET_CHOICES : [])).map((c) => ({ id: c.value, label: c.label[lang] }))
}

/** 条件の値の表示（結果の上の条件の行） */
export function conditionValueText(c: Condition, lang: Lang): string {
  const f = FIELD_BY_ID.get(c.field)
  if (!f) return String(c.value)
  if (c.ref) {
    const g = FIELD_BY_ID.get(c.ref)
    const d = Number(c.value)
    return `${g?.label[lang] ?? c.ref}${d ? ` ${refOffsetText(c)}` : ''}`
  }
  if (f.type === 'bool') return c.value ? t('common.yes') : t('common.no')
  if (f.type === 'enum') {
    const ch = valueChoices(f, lang)
    const vs = Array.isArray(c.value) ? c.value : [String(c.value)]
    return vs.map((v) => ch.find((x) => x.id === v)?.label ?? v).join(', ')
  }
  if (f.type === 'money') return fieldValueText(f.id, Number(c.value))
  if (f.type === 'percent') return `${fmt(Number(c.value), f.digits ?? 2)} %`
  if (f.type === 'ratio') return `${fmt(Number(c.value), f.digits ?? 2)} ×`
  return fmt(Number(c.value), f.digits ?? 0)
}

/**
 * ← → で値を 1 つ送る（d は ±1）。はい／いいえは切り替え、市場区分はよく使う組を巡り、ほかの列挙（業種・種別・権利確定月・
 * ウォッチリスト）は 1 つずつ巡る（複数は Enter の選択肢で足す）。数値は刻み（相対条件は相手からの差）
 */
export function stepValue(c: Condition, d: number): Value | null {
  const f = FIELD_BY_ID.get(c.field)
  if (!f) return null
  if (f.type === 'bool') return !c.value
  if (f.id === 'attr.market') {
    const k = MARKET_SETS.findIndex((o) => JSON.stringify(o) === JSON.stringify(c.value))
    return MARKET_SETS[(k + d + MARKET_SETS.length) % MARKET_SETS.length]!
  }
  if (f.type === 'enum') {
    const ch = valueChoices(f, app.settings.lang)
    if (!ch.length) return null
    const cur = (Array.isArray(c.value) ? c.value[0] : String(c.value)) ?? ''
    const k = ch.findIndex((x) => x.id === cur)
    // 今の値が選択肢に無ければ（消したリストなど）先頭から
    const next = k < 0 ? (d > 0 ? 0 : ch.length - 1) : (k + d + ch.length) % ch.length
    return [ch[next]!.id]
  }
  const st = c.ref ? 1 : (f.step ?? 1)
  return Math.round((Number(c.value) + st * d) * 1e6) / 1e6
}

/** 先頭の条件の「または」を外す（前にまとまりが無い。残すと、ほかの条件を先頭に動かしたときに「または」に化ける） */
export function withoutLeadingOr(conds: Condition[]): Condition[] {
  const first = conds[0]
  if (!first?.or) return conds
  const { or: _or, ...rest } = first
  return [rest, ...conds.slice(1)]
}

/**
 * 条件を上下に動かす（Alt+↑↓）。「かつ／または」は行の位置に残し、中身だけを入れ替える（A または B → B または A のように、
 * まとまりの形を変えない）
 */
export function moveCondition(conds: Condition[], i: number, d: number): Condition[] {
  const j = i + d
  if (j < 0 || j >= conds.length) return conds
  const or = (k: number) => !!conds[k]!.or
  const put = (c: Condition, asOr: boolean): Condition => {
    const { or: _or, ...rest } = c
    return asOr ? { ...rest, or: true } : rest
  }
  const next = [...conds]
  next[i] = put(conds[j]!, or(i))
  next[j] = put(conds[i]!, or(j))
  return withoutLeadingOr(next)
}

/** 条件の記号（≥ ≤ = ∈ ∉） */
export const opLabel = (op: string): string => ({ '>=': '≥', '<=': '≤', '=': '=', in: '∈', notin: '∉' })[op] ?? op
/** 条件の組の文（例: 実績利回り ≥ 4.00 % かつ 市場区分 ∈ プライム, REIT）。「または」は上の条件とつなぐ（FR-SC5） */
export function conditionsText(conds: readonly Condition[], lang: Lang): string {
  const and = lang === 'ja' ? ' かつ ' : ' and '
  const or = lang === 'ja' ? ' または ' : ' or '
  return conds
    .map(
      (c, i) =>
        `${i ? (c.or ? or : and) : ''}${FIELD_BY_ID.get(c.field)?.label[lang] ?? c.field} ${opLabel(c.op)} ${conditionValueText(c, lang)}`,
    )
    .join('')
}
