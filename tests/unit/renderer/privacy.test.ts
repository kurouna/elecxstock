// プライバシーモード（FR-H12。docs/testing.md の L1・L4）: 保有の金額と数量の書式は **** になり、% は残る
import { afterEach, describe, expect, it } from 'vitest'
import { stubWindow } from '../../support/window'

stubWindow()
const { MASK, privacy, secret } = await import('../../../src/renderer/lib/privacy.svelte')
const { man1, manYen, signPct, yenFull } = await import('../../../src/renderer/lib/folio')
const { yen } = await import('../../../src/renderer/lib/folioTips')
const { money, ownMoney } = await import('../../../src/renderer/lib/format')
const { blockedInFree } = await import('../../../src/renderer/lib/windowSlot')

afterEach(() => {
  privacy.on = false
})

describe('プライバシーモードの書式（FR-H12）', () => {
  it('オフなら値のまま、オンなら固定の ****（桁数も分からない）', () => {
    expect(secret('1,234')).toBe('1,234')
    privacy.on = true
    expect(secret('1,234')).toBe(MASK)
    expect(secret('123,456,789')).toBe(MASK)
  })

  it('ポートフォリオの円の書式はオンで隠れ、% は隠れない', () => {
    expect(yenFull(1_234_567)).toBe('1,234,567')
    expect(manYen(-1_876_494, true)).toBe('−188万')
    privacy.on = true
    expect(yenFull(1_234_567)).toBe(MASK)
    expect(manYen(-1_876_494, true)).toBe(MASK)
    expect(man1(52_000, true)).toBe(MASK)
    expect(yen(52_000)).toBe(`¥${MASK}`)
    expect(signPct(12.34)).toBe('+12.3%')
  })

  it('保有の金額の money は単位ごと隠し（単位で桁が分かる）、ほかの money は隠さない', () => {
    privacy.on = true
    expect(ownMoney(12_345_678)).toEqual({ n: MASK, u: '' })
    expect(money(12_345_678).n).not.toBe(MASK)
  })

  it('切り替えは 1 枚目のウィンドウだけ（フリー N からは設定を書かない）', () => {
    expect(blockedInFree('privacy')).toBe(true)
  })
})
