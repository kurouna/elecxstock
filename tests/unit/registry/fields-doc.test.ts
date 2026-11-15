// スクリーナーの項目の一覧（docs/screener-fields.md）が、指標の登録表と合っている（FR-FD4, FR-SC17）。
// 指標を足す・直したら npm run gen:fields-doc で作り直す
import { readFileSync } from 'node:fs'
import * as reg from '@shared/fields'
import { describe, expect, it } from 'vitest'
// @ts-expect-error 型の無い .mjs（文書を作る純粋な関数）
import { fieldsDoc } from '../../../scripts/fields-doc.mjs'

describe('スクリーナーの項目の一覧（FR-FD4, FR-SC17）', () => {
  it('docs/screener-fields.md は登録表から作ったものと同じ（npm run gen:fields-doc）', () => {
    expect(readFileSync('docs/screener-fields.md', 'utf8').replaceAll('\r\n', '\n')).toBe(fieldsDoc(reg))
  })
  it('使えるすべての項目が載る', () => {
    const doc = fieldsDoc(reg) as string
    for (const f of reg.FIELDS.filter((x) => reg.usable(x))) expect(doc, f.id).toContain(f.label.ja)
  })
})
