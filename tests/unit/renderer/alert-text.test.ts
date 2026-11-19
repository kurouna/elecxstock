// アラートの条件までの距離の表示（FR-AL8。alertText.ts）。単位は距離の種類に合わせる
import { afterEach, describe, expect, it } from 'vitest'
import { stubWindow } from '../../support/window'

stubWindow()
const { distanceText } = await import('../../../src/renderer/lib/alertText')
const { app } = await import('../../../src/renderer/stores/app.svelte')

afterEach(() => {
  app.settings.lang = 'ja'
})

describe('条件までの距離の単位（FR-AL8）', () => {
  it('% は小数 1 桁、率の指標の差はポイント', () => {
    expect(distanceText({ kind: 'pct', value: -5.94 })).toBe('−5.9%')
    expect(distanceText({ kind: 'pt', value: 0.4 })).toBe('+0.40pt')
    expect(distanceText(null)).toBe('—')
  })
  it('金額の差は円（EPS −100 → ≥ 110 は「+210.0円」。pt と書かない）', () => {
    expect(distanceText({ kind: 'yen', value: 210 })).toBe('+210.0円')
    expect(distanceText({ kind: 'yen', value: -50 })).toBe('−50.0円')
    expect(distanceText({ kind: 'yen', value: 1234 })).toBe('+1,234円')
    expect(distanceText({ kind: 'yen', value: 3e8 })).toBe('+3.0億')
    app.settings.lang = 'en'
    expect(distanceText({ kind: 'yen', value: 210 })).toBe('+¥210.0')
    expect(distanceText({ kind: 'yen', value: -3e9 })).toBe('−¥3.0B')
  })
})
