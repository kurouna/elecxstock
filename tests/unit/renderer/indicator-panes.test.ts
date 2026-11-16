// チャートの下の段と凡例の見せ方（FR-C3, FR-C6）: 桁・ヒストグラムの色・段の高さ・段の位置・段ごとの凡例
import { describe, expect, it } from 'vitest'
import { stubWindow } from '../../support/window'

stubWindow()
const { histTone, indicatorDigits, legendByPane, legendValue, paneTops, priceFormat, stretchFactors, withAlpha } = await import(
  '../../../src/renderer/lib/indicatorPanes'
)

describe('下の段の指標の桁（FR-C3）', () => {
  it('MACD は株価より 1 桁細かく、RSI・ストキャスティクスは小数 1 桁', () => {
    expect(indicatorDigits('diff', 0)).toBe(1)
    expect(indicatorDigits('diff', 1)).toBe(2)
    expect(indicatorDigits('diff', 3)).toBe(4)
    expect(indicatorDigits('osc', 0)).toBe(1)
    expect(indicatorDigits('osc', 2)).toBe(1)
  })
  it('目盛りの桁は凡例と同じ', () => {
    expect(priceFormat(0)).toEqual({ type: 'price', precision: 0, minMove: 1 })
    expect(priceFormat(2)).toEqual({ type: 'price', precision: 2, minMove: 0.01 })
  })
})

describe('MACD のヒストグラムの色（FR-C6）', () => {
  it('0 の上下と、0 から離れていくか近づいていくかで 4 段階', () => {
    expect(histTone(5, 3)).toBe('up')
    expect(histTone(2, 3)).toBe('upWeak')
    expect(histTone(-5, -3)).toBe('down')
    expect(histTone(-2, -3)).toBe('downWeak')
  })
  it('前の値が無いとき・同じ大きさのときは強い。0 は上の側', () => {
    expect(histTone(4, null)).toBe('up')
    expect(histTone(-4, undefined)).toBe('down')
    expect(histTone(3, 3)).toBe('up')
    expect(histTone(0, 0)).toBe('up')
    expect(histTone(0, 2)).toBe('upWeak')
  })
  it('0 をまたいだら、大きさに関係なくその側の強い色', () => {
    expect(histTone(1, -3)).toBe('up')
    expect(histTone(-1, 3)).toBe('down')
    expect(histTone(0, -2)).toBe('up')
  })
})

describe('ヒストグラムの色の不透明度（FR-C6）', () => {
  it('#rrggbb と #rgb に付ける。範囲の外は 0〜1 に収める', () => {
    expect(withAlpha('#c62f37', 1)).toBe('#c62f37ff')
    expect(withAlpha('#c62f37', 0.3)).toBe('#c62f374d')
    expect(withAlpha('#abc', 0)).toBe('#aabbcc00')
    expect(withAlpha(' #C62F37 ', 2)).toBe('#C62F37ff')
  })
  it('読めない色はそのまま', () => {
    expect(withAlpha('rgb(1, 2, 3)', 0.5)).toBe('rgb(1, 2, 3)')
    expect(withAlpha('', 0.5)).toBe('')
  })
})

describe('下の段の高さと位置（FR-C6）', () => {
  it('下の段が無ければ本体だけ。1 つ・2 つは 25% ずつ、3 つは合計 50% に収める', () => {
    expect(stretchFactors(0)).toEqual([1])
    expect(stretchFactors(1)).toEqual([0.75, 0.25])
    expect(stretchFactors(2)).toEqual([0.5, 0.25, 0.25])
    const f3 = stretchFactors(3)
    expect(f3).toHaveLength(4)
    expect(f3[0]).toBeCloseTo(0.5)
    for (const f of f3.slice(1)) expect(f).toBeCloseTo(0.5 / 3)
  })
  it('段の上端は上の段の高さと区切りを足したもの', () => {
    expect(paneTops([])).toEqual([])
    expect(paneTops([300, 100, 80])).toEqual([0, 301, 402])
    expect(paneTops([300, 100], 0)).toEqual([0, 300])
  })
})

describe('段ごとの凡例（FR-C3）', () => {
  const v = (x: number | null) => [10, x]
  it('桁は線ごとに決めた桁。名前の先頭が MA でも、MACD は移動平均の桁にしない', () => {
    expect(legendValue({ label: 'MA5', color: '#111', values: v(1234.56), pane: 0, digits: 0 }, 1).text).toBe('1,235')
    expect(legendValue({ label: 'MACD', color: '#111', values: v(42.24), pane: 2, digits: 1 }, 1).text).toBe('42.2')
    expect(legendValue({ label: 'Signal', color: '#111', values: v(34.41), pane: 2, digits: 1 }, 1).text).toBe('34.4')
  })
  it('桁が無ければ値の大きさで決める（1,000 未満は小数 1 桁）。値が無ければ —', () => {
    expect(legendValue({ label: 'A', color: '#111', values: v(980.04), pane: 0 }, 1).text).toBe('980.0')
    expect(legendValue({ label: 'A', color: '#111', values: v(1050.4), pane: 0 }, 1).text).toBe('1,050')
    expect(legendValue({ label: 'A', color: '#111', values: v(null), pane: 0 }, 1).text).toBe('—')
    expect(legendValue({ label: 'A', color: '#111', values: v(1), pane: 0 }, 5).text).toBe('—')
  })
  it('符号で色を変える線は上げ・下げのクラスにし、線の色は付けない', () => {
    const h = { label: 'Hist', color: '', values: [-1.5, 2], pane: 2, digits: 1, signColor: true }
    expect(legendValue(h, 0)).toEqual({ label: 'Hist', color: undefined, cls: 'down', text: '-1.5' })
    expect(legendValue(h, 1).cls).toBe('up')
    expect(legendValue({ label: 'MA5', color: '#111', values: [1], pane: 0 }, 0)).toMatchObject({ color: '#111', cls: '' })
  })
  it('本体と下の段に分け、下の段は段の順に名前と値を並べる', () => {
    const lines = [
      { label: 'MA5', color: '#1', values: [100], pane: 0, digits: 0 },
      { label: '%K', color: '#2', values: [80], pane: 2, digits: 1 },
      { label: '', color: '#3', values: [55], pane: 1, digits: 1 },
      { label: '%D', color: '#4', values: [70], pane: 2, digits: 1 },
    ]
    const r = legendByPane(lines, { 2: 'Stoch', 1: 'RSI' }, 0)
    expect(r.main.map((x) => x.label)).toEqual(['MA5'])
    expect(r.subs.map((s) => [s.pane, s.title, s.vals.map((x) => `${x.label}:${x.text}`)])).toEqual([
      [1, 'RSI', [':55.0']],
      [2, 'Stoch', ['%K:80.0', '%D:70.0']],
    ])
    expect(legendByPane(lines, {}, 0).subs).toEqual([])
  })
})
