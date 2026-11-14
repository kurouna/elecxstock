// 指標の登録表（FR-FD1〜FD5, FR-SC, FR-AL1）。指標ごとの性質を 1 枚の表にしてスナップショットで持つ。
// 期待値を登録表から導くと同語反復になるので、足す・直すと差分が出て、人が目で確かめる（docs/testing.md の L2）。
// 表が変わったら `npx vitest run -u tests/unit/registry` で作り直し、差分を確かめてからコミットする
import { alertConditionOk } from '@shared/alerts'
import { canIncludeMissing, editText, parseConditionValue, typesNumber, valueScale, valueUnit } from '@shared/conditionInput'
import { FIELDS, perShare, refFields, usable } from '@shared/fields'
import { describe, expect, it } from 'vitest'
import { stubWindow } from '../../support/window'

stubWindow()
const { COLUMN_BY_ID } = await import('../../../src/renderer/lib/columns')

const USABLE = FIELDS.filter((f) => usable(f))

describe('指標の性質の表（FR-FD4, FR-SC17, SC18, FR-AL1）', () => {
  it('分類・型・単位・1 株あたりか・打つ倍率・欠損のトグル・相対の相手・アラート・列', async () => {
    const yes = (b: boolean) => (b ? 'o' : '-')
    const rows = USABLE.map((f) =>
      [
        f.id,
        f.group ?? '?',
        f.type,
        f.source.kind,
        f.unit?.ja ?? '',
        yes(perShare(f)),
        typesNumber(f) ? String(valueScale({ field: f.id })) : '',
        yes(canIncludeMissing(f)),
        refFields(f)
          .map((g) => g.id)
          .join(' '),
        yes(alertConditionOk({ field: f.id, op: '>=', value: 0 })),
        yes(COLUMN_BY_ID.has(f.id)),
      ].join(' | '),
    )
    const head = 'id | group | type | source | unit | perShare | scale | missing | refs | alert | column'
    await expect(`${[head, ...rows].join('\n')}\n`).toMatchFileSnapshot('__snapshots__/field-properties.txt')
  })
})

describe('表示 → 入力 → 表示が元に戻る（スクリーナーとアラートの入力。FR-SC, FR-AL1）', () => {
  const samples = [0, 1, 12.5, 980, 30_000, 1.5e8, 1.23e10, 4.5e12, -3.2]
  for (const f of USABLE.filter((x) => typesNumber(x))) {
    it(f.id, () => {
      for (const v of samples) {
        const c = { field: f.id, op: '>=' as const, value: v }
        expect(parseConditionValue(c, editText(c)), `${f.id} ${v}`).toBeCloseTo(v, 4)
      }
      // 単位を付けて打っても同じ値（金額）
      if (f.type === 'money') {
        expect(parseConditionValue({ field: f.id }, '30万')).toBe(3e5)
        expect(parseConditionValue({ field: f.id }, '1.5億')).toBe(1.5e8)
      }
      // 相対条件の値は % のまま（金額の倍率を掛けない）
      expect(parseConditionValue({ field: f.id, ref: 'x' }, '5')).toBe(5)
      expect(valueUnit({ field: f.id, ref: 'x' }, 'ja')).toBe('')
    })
  }
})

describe('一覧の列（FR-SC3）', () => {
  it('数値の指標（市場データ・実行時の計算）はすべて結果表の列に出せる', () => {
    for (const f of USABLE.filter((x) => (x.source.kind === 'metrics' && x.type !== 'enum') || x.source.kind === 'compute'))
      expect(COLUMN_BY_ID.has(f.id), f.id).toBe(true)
  })
  it('「欠損を含める」を選べるのは、欠損しうる指標（市場データの数値・実行時の計算）だけ', () => {
    for (const f of USABLE) {
      const can = (f.source.kind === 'metrics' && f.type !== 'enum') || f.source.kind === 'compute'
      expect(canIncludeMissing(f), f.id).toBe(can)
    }
  })
})
