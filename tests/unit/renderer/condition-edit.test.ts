// スクリーナーの条件の編集（FR-SC1, SC5, SC10）: 値の表示・← → で送る・選択肢・並べ替えと「または」。
// すべての指標で、表示が欠損（—）にならず、送っても値の形が壊れない（NaN・範囲外にならない）ことを確かめる
import { FIELD_BY_ID, FIELDS, usable } from '@shared/fields'
import type { Condition } from '@shared/types'
import { describe, expect, it } from 'vitest'
import { stubWindow } from '../../support/window'

stubWindow()
const E = await import('../../../src/renderer/lib/conditionEdit')
const { app } = await import('../../../src/renderer/stores/app.svelte')

const lists = [
  { id: 'favorites', builtin: 'favorites', name: { ja: '★お気に入り', en: '★ Favorites' }, items: [] },
  { id: 'watch', name: { ja: '監視', en: 'Watch' }, items: [] },
] as const
app.watchlists = lists.map((w) => ({ ...w, items: [] })) as never

const fresh = (id: string): Condition => E.newCondition(FIELD_BY_ID.get(id)!)
const valid = (c: Condition) => {
  const v = c.value
  if (Array.isArray(v)) return v.length > 0 && v.every((x) => typeof x === 'string' && x !== '')
  if (typeof v === 'number') return Number.isFinite(v)
  return typeof v === 'boolean'
}

describe('条件の値の表示（FR-SC1）', () => {
  it('権利確定月は月の名前で出し、複数の月も読める（— にならない）', () => {
    const c: Condition = { field: 'income.recordMonth', op: 'in', value: ['3'] }
    expect(E.conditionValueText(c, 'ja')).toBe('3月')
    expect(E.conditionValueText({ ...c, value: ['3', '9'] }, 'ja')).toBe('3月, 9月')
  })
  it('使えるすべての指標で、作ったばかりの条件の表示が欠損（—）や NaN にならない', () => {
    for (const f of FIELDS.filter((x) => usable(x))) {
      const s = E.conditionValueText(fresh(f.id), 'ja')
      expect(s, f.id).not.toMatch(/^—$|NaN/)
    }
  })
  it('相対条件の差は、価格どうしは %、% の指標どうしはポイント（FR-SC5）', () => {
    expect(E.conditionValueText({ field: 'price.close', op: '>=', value: 5, ref: 'price.ma75' }, 'ja')).toBe('75日移動平均 +5%')
    expect(E.conditionValueText({ field: 'ret.tr1y', op: '>=', value: -2.5, ref: 'ret.1y' }, 'ja')).toBe('1年騰落率 −2.5pt')
  })
})

describe('← → で値を送る（FR-SC1）', () => {
  it('使えるすべての指標で、送っても値の形が壊れない（NaN・空・範囲外の数にならない）', () => {
    for (const f of FIELDS.filter((x) => usable(x))) {
      let c = fresh(f.id)
      for (const d of [1, 1, -1, -1, -1]) {
        const v = E.stepValue(c, d)
        if (v == null) continue
        c = { ...c, value: v }
        expect(valid(c), `${f.id} → ${JSON.stringify(c.value)}`).toBe(true)
      }
    }
  })
  it('権利確定月は 1 つずつ月を巡る（複数を選んでいても、配列のまま）', () => {
    expect(E.stepValue({ field: 'income.recordMonth', op: 'in', value: ['3'] }, 1)).toEqual(['4'])
    expect(E.stepValue({ field: 'income.recordMonth', op: 'in', value: ['12'] }, 1)).toEqual(['1'])
    expect(E.stepValue({ field: 'income.recordMonth', op: 'in', value: ['3', '9'] }, -1)).toEqual(['2'])
  })
  it('ウォッチリストは次のリストへ', () => {
    expect(E.stepValue({ field: 'user.watchlist', op: 'in', value: ['favorites'] }, 1)).toEqual(['watch'])
  })
})

describe('選択肢（Enter で開く。FR-SC10）', () => {
  it('列挙の指標は選択肢を持つ。ウォッチリストは今のリストから作る', () => {
    expect(E.valueChoices(FIELD_BY_ID.get('income.recordMonth')!, 'ja').map((x) => x.id)).toHaveLength(12)
    expect(E.valueChoices(FIELD_BY_ID.get('user.watchlist')!, 'ja')).toEqual([
      { id: 'favorites', label: '★お気に入り' },
      { id: 'watch', label: '監視' },
    ])
    expect(E.valueChoices(FIELD_BY_ID.get('price.close')!, 'ja')).toEqual([])
  })
})

describe('並べ替えと「または」（FR-SC5）', () => {
  const A: Condition = { field: 'income.yield', op: '>=', value: 4 }
  const B: Condition = { field: 'value.per', op: '<=', value: 15, or: true }
  const C: Condition = { field: 'value.pbr', op: '<=', value: 1 }
  it('入れ替えても「かつ／または」の形は変わらない（A または B → B または A）', () => {
    const r = E.moveCondition([A, B, C], 1, -1)
    expect(r.map((c) => c.field)).toEqual(['value.per', 'income.yield', 'value.pbr'])
    expect(r.map((c) => !!c.or)).toEqual([false, true, false])
  })
  it('先頭の条件には「または」を残さない（先頭を消して繰り上がったときも）', () => {
    expect(E.withoutLeadingOr([B, C])[0]!.or).toBeUndefined()
    expect(E.withoutLeadingOr([A, B])[1]!.or).toBe(true)
  })
})
