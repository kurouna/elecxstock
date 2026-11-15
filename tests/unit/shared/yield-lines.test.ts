// 目標利回りの線（FR-C12）: 目標の利回りになる株価（過去 12 か月の配当 ÷ 目標の利回り）と、設定の値の読み書き。値はすべて架空
import { DEFAULT_SETTINGS } from '@shared/settings'
import {
  linesInRange,
  normalizeTargets,
  parseYieldTarget,
  stackLabels,
  targetsFromInputs,
  targetTexts,
  YIELD_TARGETS_UI,
  yieldLabel,
  yieldLines,
  yieldTargetPrice,
} from '@shared/yieldLines'
import { describe, expect, it } from 'vitest'

const on = { yieldLine: true, yieldTargets: [4] }
const m = { div12: 120, yieldTrailing: 3, close: 4000 }

describe('目標利回りの株価（FR-C12）', () => {
  it('過去 12 か月の配当 ÷ 目標の利回り', () => {
    expect(yieldTargetPrice(120, 4)).toBe(3000)
    expect(yieldTargetPrice(5945, 5.5)).toBeCloseTo(108090.909, 3)
  })
  it('配当が無い・0・目標が 0 以下なら引かない（null）', () => {
    expect(yieldTargetPrice(null, 4)).toBeNull()
    expect(yieldTargetPrice(0, 4)).toBeNull()
    expect(yieldTargetPrice(120, 0)).toBeNull()
    expect(yieldTargetPrice(120, -1)).toBeNull()
  })
  it('ラベルは % を付け、小数の末尾の 0 は付けない', () => {
    expect(yieldLabel(4)).toBe('4%')
    expect(yieldLabel(4.5)).toBe('4.5%')
    expect(yieldLabel(3.75)).toBe('3.75%')
    expect(yieldLabel(4.0)).toBe('4%')
  })
})

describe('チャートに引く線（FR-C12）', () => {
  it('設定が OFF なら引かない（既定は OFF）', () => {
    expect(DEFAULT_SETTINGS.yieldLine).toBe(false)
    expect(yieldLines(m, { ...on, yieldLine: false })).toEqual([])
  })
  it('目標ごとに 1 本。株価・ラベル・今の株価からの差（%）を持ち、利回りの低い順（株価の高い順）', () => {
    const ls = yieldLines(m, { yieldLine: true, yieldTargets: [4, 2.5] })
    expect(ls.map((l) => l.label)).toEqual(['2.5%', '4%'])
    expect(ls.map((l) => l.price)).toEqual([4800, 3000])
    expect(ls[0]!.gap).toBeCloseTo(20)
    expect(ls[1]!.gap).toBeCloseTo(-25)
  })
  it('チャートは設定の上限（3 つ）より多くても全部引く。同じ目標は 1 本', () => {
    const ls = yieldLines(m, { yieldLine: true, yieldTargets: [1, 2, 3, 4, 5, 3] })
    expect(ls).toHaveLength(5)
    expect(YIELD_TARGETS_UI).toBe(3)
  })
  it('指標が無い・配当が無い・上場 12 か月未満（実績利回りが出ない）なら引かない', () => {
    expect(yieldLines(undefined, on)).toEqual([])
    expect(yieldLines({ ...m, div12: 0, yieldTrailing: 0 }, on)).toEqual([])
    expect(yieldLines({ ...m, div12: null }, on)).toEqual([])
    expect(yieldLines({ ...m, yieldTrailing: null }, on)).toEqual([])
  })
  it('今の株価が無くても線は引く（差は null）', () => {
    expect(yieldLines({ ...m, close: null }, on)).toEqual([{ pct: 4, price: 3000, label: '4%', gap: null }])
  })
  it('グリッドのタイルは、目盛りの範囲に入る線だけを描く（範囲は広げない）', () => {
    const ls = yieldLines(m, { yieldLine: true, yieldTargets: [2, 3, 4] })
    expect(linesInRange(ls, 3500, 6500).map((l) => l.label)).toEqual(['2%', '3%'])
    expect(linesInRange(ls, 3000, 4000).map((l) => l.label)).toEqual(['3%', '4%'])
    expect(linesInRange(ls, 7000, 8000)).toEqual([])
  })
})

describe('グリッドのタイルの軸のラベル（FR-C12）', () => {
  it('離れていれば線の高さのまま', () => {
    expect(stackLabels([20, 60, 100], 13, 0, 200)).toEqual([20, 60, 100])
  })
  it('近い目標（3.5% と 3.8% など）のラベルは重ならないように、下のラベルを下へずらす（並びは変えない）', () => {
    expect(stackLabels([50, 55], 13, 0, 200)).toEqual([50, 63])
    expect(stackLabels([50, 52, 54], 13, 0, 200)).toEqual([50, 63, 76])
  })
  it('並びがばらばらでも、高さの順にずらして元の順で返す', () => {
    expect(stackLabels([55, 50], 13, 0, 200)).toEqual([63, 50])
  })
  it('ラベルの中心は min〜max に収める。下の端を越えるときは下から積み上げて上へずらす', () => {
    expect(stackLabels([190, 195], 13, 6, 193)).toEqual([180, 193])
    expect(stackLabels([2, 3], 13, 6, 193)).toEqual([6, 19])
  })
})

describe('設定の目標利回り（FR-C12）', () => {
  it('小数・全角・% 付きで打てる。0.1〜30 の外と読めない文字は null', () => {
    expect(parseYieldTarget('4')).toBe(4)
    expect(parseYieldTarget('3.75')).toBe(3.75)
    expect(parseYieldTarget('４．５')).toBe(4.5)
    expect(parseYieldTarget('4.5%')).toBe(4.5)
    expect(parseYieldTarget(' 5 ')).toBe(5)
    expect(parseYieldTarget('0.1')).toBe(0.1)
    expect(parseYieldTarget('30')).toBe(30)
    expect(parseYieldTarget('0')).toBeNull()
    expect(parseYieldTarget('0.05')).toBeNull()
    expect(parseYieldTarget('30.5')).toBeNull()
    expect(parseYieldTarget('-4')).toBeNull()
    expect(parseYieldTarget('')).toBeNull()
    expect(parseYieldTarget('abc')).toBeNull()
  })
  it('小数は 2 桁までに丸める', () => {
    expect(parseYieldTarget('3.456')).toBe(3.46)
  })
  it('保存する目標は、空き・重なりを除いて小さい順', () => {
    expect(normalizeTargets([5, null, 3.5, 5])).toEqual([3.5, 5])
    expect(normalizeTargets([null, null, null])).toEqual([])
  })
  it('設定の欄（3 つ）: 読めた値を保存する目標にし、読めない欄があれば bad（その欄は保存しない）', () => {
    expect(targetsFromInputs(['5', '', '3.5'])).toEqual({ targets: [3.5, 5], bad: false, texts: ['5', '', '3.5'] })
    // 読めない欄は空に戻す（並びは打った順のまま。打っている途中に欄が入れ替わらない）
    expect(targetsFromInputs(['5', 'abc', ''])).toEqual({ targets: [5], bad: true, texts: ['5', '', ''] })
    expect(targetsFromInputs(['', '', ''])).toEqual({ targets: [], bad: false, texts: ['', '', ''] })
  })
  it('設定の欄に出す文字は、保存した目標を上限の数の欄に並べ、空きは空', () => {
    expect(targetTexts([3.5, 5])).toEqual(['3.5', '5', ''])
    expect(targetTexts([])).toEqual(['', '', ''])
    // 設定のファイルで上限より多く書いた目標は、欄には上限まで
    expect(targetTexts([1, 2, 3, 4])).toEqual(['1', '2', '3'])
  })
  it('既定の目標は 4%', () => {
    expect(DEFAULT_SETTINGS.yieldTargets).toEqual([4])
  })
})
