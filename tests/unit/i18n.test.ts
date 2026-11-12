import { describe, expect, it } from 'vitest'
import { en, ja } from '../../src/renderer/lib/i18n'

describe('文言のカタログ（FR-N6）', () => {
  it('日本語と英語のキーが一致し、空の文言が無い', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ja).sort())
    for (const [k, v] of Object.entries({ ...ja, ...en })) expect(v.length, k).toBeGreaterThan(0)
  })
  it('引数の名前が両方で同じ', () => {
    for (const k of Object.keys(ja) as (keyof typeof ja)[]) {
      const a = [...ja[k].matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
      const b = [...en[k].matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
      expect(b, k).toEqual(a)
    }
  })
})
