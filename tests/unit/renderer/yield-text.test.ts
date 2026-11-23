// 利回りの変化の内訳の文言（docs/design-yield-breakdown.md §3.3。L1・L2）: 一言の文・増減率の書き方・F1 の一覧
import { describe, expect, it } from 'vitest'
import { stubWindow } from '../../support/window'

stubWindow()
const { captionText, ptText, ratePct, ydT, yieldPct, ym } = await import('../../../src/renderer/lib/yieldText')
const { SHORTCUTS } = await import('../../../src/renderer/lib/shortcuts')

describe('FR-I11 一言の文と増減率', () => {
  it('種類ごとの文（判定の言葉を使わない）', () => {
    expect(captionText({ kind: 'flat' })).toBe('配当も株価もほぼ変わらない')
    expect(captionText({ kind: 'same', dD: 0.3, dP: 0.3 })).toBe('利回りはほぼ変わらない（配当 +30%・株価 +30% がそろって動いた）')
    expect(captionText({ kind: 'main', up: true, by: 'price' })).toBe('利回りは上がった。主に株価が下がったため')
    expect(captionText({ kind: 'main', up: false, by: 'div' })).toBe('利回りは下がった。主に配当が減ったため')
    expect(captionText({ kind: 'both', up: true })).toBe('利回りは上がった。配当と株価の両方による')
    expect(captionText({ kind: 'over', up: true, by: 'div' })).toBe('利回りは上がった。増配が株価の上昇を上回った')
    expect(captionText({ kind: 'over', up: false, by: 'price' })).toBe('利回りは下がった。株価の上昇が増配を上回った')
    expect(captionText({ kind: 'over', up: true, by: 'price' })).toBe('利回りは上がった。株価の下落が減配を上回った')
    for (const k of ['flat', 'main', 'both', 'over'] as const)
      expect(captionText(k === 'flat' ? { kind: k } : ({ kind: k, up: true, by: 'div' } as never))).not.toMatch(
        /割安|割高|買い|売り|おすすめ/,
      )
  })
  it('REIT は分配金（§4）。一言・読み方の式・読み取り', () => {
    expect(captionText({ kind: 'main', up: false, by: 'div' }, true)).toBe('利回りは下がった。主に分配金が減ったため')
    expect(captionText({ kind: 'flat' }, true)).toBe('分配金も株価もほぼ変わらない')
    expect(ydT('yd.tip.eq', true)).toBe('利回り = 1口分配金 ÷ 株価')
    expect(ydT('yd.tip.eq')).toBe('利回り = 1株配当 ÷ 株価')
    expect(ydT('yd.ov.read', true, { p: '1', d: '2', y: '3%' })).toBe('株価 1 円 · 分配金 2 円 · 利回り 3%')
    // 言葉の差し込み口が残らない
    for (const k of ['yd.tip.body', 'yd.tip.note', 'yd.tip.plane', 'yd.ov.sub', 'yd.ov.title', 'yd.openTitle', 'yd.spanStarted'] as const)
      expect(ydT(k, true, { name: 'x', from: '2024/01' })).not.toMatch(/\{|配当/)
  })
  it('増減率は整数の %（± は 0）。利回りは小数 2 桁。pt は丸めて 0 なら ±', () => {
    expect(ratePct(0.064)).toBe('+6%')
    expect(ratePct(-0.224)).toBe('−22%')
    expect(ratePct(0.002)).toBe('±0%')
    expect(yieldPct(0.05594)).toBe('5.59%')
    expect(ptText(0.4249)).toBe('+0.42 pt')
    expect(ptText(-1.1)).toBe('−1.10 pt')
    expect(ptText(-0.001)).toBe('±0.00 pt')
    expect(ym('2024-03')).toBe('2024/03')
  })
  it('F1 の銘柄情報の段に V・?・N と平面のキー', () => {
    const keys = SHORTCUTS.filter((r) => r.sec === 'info').map((r) => r.keys)
    for (const k of ['V', 'Shift+/', 'N', 'Esc']) expect(keys, k).toContain(k)
  })
})
