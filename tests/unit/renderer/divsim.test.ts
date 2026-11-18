// 配当シミュレータのペインの画面の側の計算（docs/design-simulator.md §6〜§9。L1）。値はすべて架空
import { addDays, isTradingDay } from '@shared/calendar'
import { buildPx } from '@shared/sim/backtest'
import { type SimStock, simulate } from '@shared/sim/run'
import { DEFAULT_SIM } from '@shared/sim/types'
import { describe, expect, it } from 'vitest'
import {
  basisNotes,
  cycle,
  indexAt,
  lineScale,
  parseAmount,
  pct,
  receiptMonths,
  SIM_COMPARES,
  simColumns,
  simKey,
  simSettingsOf,
  simViewOf,
  sortPast,
  yen,
} from '../../../src/renderer/lib/divsim'

const TODAY = '2026-11-13'
function daily(from: string, to: string): { d: string; c: number }[] {
  const out: { d: string; c: number }[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) if (isTradingDay(d)) out.push({ d, c: 1000 })
  return out
}
const stock = (id: string, o: Partial<SimStock> = {}): SimStock => ({
  id,
  kind: 'stock',
  market: 'P',
  sector33: '銀行業',
  px: buildPx([], daily('2023-01-04', TODAY)),
  divs: [
    { date: '2024-03-27', amount: 10 },
    { date: '2025-03-27', amount: 12 },
    { date: '2026-03-27', amount: 12 },
  ],
  divFrom: '2016-11-13',
  ...o,
})
const result = (o: Partial<Parameters<typeof simulate>[0]> = {}) =>
  simulate({
    today: TODAY,
    settings: { ...DEFAULT_SIM, years: 3 },
    stocks: [stock('A'), stock('B'), stock('C', { divFrom: '2025-01-01' })],
    total: 3,
    etf: null,
    members: () => [],
    stressPool: [],
    ...o,
  })

describe('FR-SIM1 設定の読み取りと切り替え', () => {
  it('知らない値は既定に戻す。元本は範囲に収める', () => {
    expect(simSettingsOf({})).toEqual(DEFAULT_SIM)
    expect(simSettingsOf({ years: 7, tax: 'x', amount: 1, horizon: 20, reinvest: true })).toEqual({
      ...DEFAULT_SIM,
      amount: 10_000,
      horizon: 20,
      reinvest: true,
    })
    expect(simViewOf({ tab: 'fwd', cmp: 'peer', pct: true, receipt: false, scope: 'group' })).toEqual({
      tab: 'fwd',
      cmp: 'peer',
      pct: true,
      receipt: false,
      scope: 'group',
    })
    expect(simViewOf({})).toEqual({ tab: 'past', cmp: 'both', pct: false, receipt: true, scope: 'one' })
  })
  it('B は 1306 と同業種 → 1306 → 同業種 → なし → 最初', () => {
    expect(cycle(SIM_COMPARES, 'both')).toBe('etf')
    expect(cycle(SIM_COMPARES, 'none')).toBe('both')
    expect(cycle(SIM_COMPARES, 'both', -1)).toBe('none')
  })
  it('元本は万円で打つ（全角・カンマ・「万円」も読む）', () => {
    expect(parseAmount('300')).toBe(3_000_000)
    expect(parseAmount('１,５００万円')).toBe(15_000_000)
    expect(parseAmount('0')).toBeNull()
    expect(parseAmount('abc')).toBeNull()
  })
  it('計算し直す鍵は銘柄と設定だけ（表示の状態は入れない）', () => {
    expect(simKey(['a', 'b'], DEFAULT_SIM)).toBe(simKey(['a', 'b'], { ...DEFAULT_SIM }))
    expect(simKey(['a', 'b'], DEFAULT_SIM)).not.toBe(simKey(['b', 'a'], DEFAULT_SIM))
    expect(simKey(['a'], DEFAULT_SIM)).not.toBe(simKey(['a'], { ...DEFAULT_SIM, tax: 'gross' }))
  })
})

describe('FR-SIM4 受取の目安', () => {
  it('権利確定月から 3 か月後へずらす', () => {
    const xs = Array.from({ length: 12 }, (_, i) => i)
    const r = receiptMonths(xs)
    expect(r[5]).toBe(2) // 3 月の権利 → 6 月に受取
    expect(r[0]).toBe(9) // 10 月の権利 → 1 月
  })
})

describe('FR-SIM5 前提の文と見出しの札', () => {
  it('過去: 外した銘柄・後知恵・生存者・税。外した銘柄は警告', () => {
    const r = result()
    const ns = basisNotes(r, 'past', true)
    const keys = ns.map((n) => n.k)
    expect(keys).toContain('sim.n.hindsight')
    expect(keys).toContain('sim.n.survivor')
    expect(keys).toContain('sim.n.taxed')
    expect(ns.find((n) => n.k === 'sim.n.excluded')).toMatchObject({ a: { n: 1, a: 1, b: 0 }, warn: true })
    expect(ns.find((n) => n.k === 'sim.n.noPeer')?.warn).toBe(true)
    expect(ns.find((n) => n.k === 'sim.n.etfMissing')?.warn).toBe(true)
    expect(ns.filter((n) => n.warn).length).toBe(3)
  })
  it('ウォッチリストなら後知恵を出さない。上限で切ったら警告', () => {
    const r = result({ total: 340 })
    const ns = basisNotes(r, 'past', false)
    expect(ns.some((n) => n.k === 'sim.n.hindsight')).toBe(false)
    expect(ns.find((n) => n.k === 'sim.n.capped')).toMatchObject({ a: { n: 3, t: 340 }, warn: true })
  })
  it('これから: 試算であること。期間不足の銘柄は警告', () => {
    const ns = basisNotes(result(), 'fwd', true)
    expect(ns[0]!.k).toBe('sim.n.estimate')
    expect(ns.find((n) => n.k === 'sim.n.short')).toMatchObject({ a: { n: 3 }, warn: true })
  })
})

describe('FR-SIM6 表の列と CSV の値', () => {
  const r = result()
  const cols = simColumns(r, 'past', { lang: 'ja', label: (k) => k, name: (id) => `name-${id}`, code: (id) => id })
  it('数の列は丸めない値を返す（CSV に入る）', () => {
    const total = cols.find((c) => c.id === 'total')!
    expect(total.sort!('A')).toBeCloseTo(0.034 * (1 - 0.20315))
    expect(total.cell('A')).toEqual({ t: '+2.7%', c: 'up' })
    expect(cols.find((c) => c.id === 'rank')!.cell('A')).toEqual({ t: '—' })
  })
  it('これからの列', () => {
    const f = simColumns(r, 'fwd', { lang: 'ja', label: (k) => k, name: (id) => id, code: (id) => id })
    expect(f.find((c) => c.id === 'y1')!.sort!('A')).toBeCloseTo((3_000_000 / 3 / 1000) * 12 * (1 - 0.20315))
    expect(f.find((c) => c.id === 'months')!.cell('A')).toEqual({ t: '3' })
  })
  it('並べ替えは大きい順', () => {
    expect(sortPast(r.past!.rows, 'total').map((x) => x.id)).toEqual(['A', 'B'])
  })
})

describe('FR-SIM2 書式と図の座標', () => {
  it('金額は万円・億円（英語は ¥k・¥M）。割合は符号付き', () => {
    expect(yen(4_433_000, 'ja')).toBe('443.3万')
    expect(yen(-12_345, 'ja', true)).toBe('−1.23万')
    expect(yen(150_000_000, 'ja')).toBe('1.50億')
    expect(yen(4_433_000, 'en')).toBe('¥4.43M')
    expect(pct(0.1234)).toBe('+12.3%')
    expect(pct(null)).toBe('—')
  })
  it('折れ線の座標: 端は余白の内側、点の番号に戻せる', () => {
    const s = lineScale([[100, 200, 150], null], 300, 100)
    expect(s.x(0)).toBe(s.pad.l)
    expect(s.x(2)).toBe(300 - s.pad.r)
    expect(s.y(200)).toBeLessThan(s.y(100))
    expect(indexAt(s.x(1) + 3, s)).toBe(1)
    expect(indexAt(-50, s)).toBe(0)
    expect(s.ticks.length).toBeGreaterThan(1)
  })
  it('値が 1 つしかなくても 0 で割らない', () => {
    const s = lineScale([[5, 5]], 100, 50)
    expect(Number.isFinite(s.y(5))).toBe(true)
  })
})

describe('FR-SIM1 文の形の設定の帯と、右端の値の重なり', () => {
  it('差し込む語で分ける', async () => {
    const { splitTemplate } = await import('../../../src/renderer/lib/divsim')
    expect(splitTemplate('{years}に{amount}を入れて')).toEqual([{ k: 'years' }, 'に', { k: 'amount' }, 'を入れて'])
    expect(splitTemplate('abc')).toEqual(['abc'])
  })
  it('重なれば下へずらし、はみ出せば内へ押し戻す', async () => {
    const { spreadLabels } = await import('../../../src/renderer/lib/divsim')
    expect(spreadLabels([50, 52, 10], 12, 0, 100)).toEqual([50, 62, 10])
    expect(spreadLabels([95, 98], 12, 0, 100)).toEqual([88, 100])
  })
})

describe('FR-SIM4 FR-SIM5 表の印（期間不足・業種の値・月次）と外した理由', () => {
  it('これから: 期間不足と、ストレスの前年比が業種の値のときに印を出す', () => {
    const r = result({
      stressPool: [
        {
          id: 'X',
          s17: '銀行',
          years: new Map([2019, 2020, 2021, 2022, 2023, 2024, 2025].map((y) => [y, y === 2020 ? 8 : 10])),
          from: 2018,
        },
      ],
    })
    const cols = simColumns(r, 'fwd', { lang: 'ja', label: (k) => k, name: (id) => id, code: (id) => id })
    expect(cols.find((c) => c.id === 'mark')!.cell('A').t).toBe('sim.mark.short・sim.mark.s17')
  })
  it('過去: 業種の列と、月末の終値で買った印', () => {
    const r = result()
    const cols = simColumns(r, 'past', { lang: 'ja', label: (k) => k, name: (id) => id, code: (id) => id, sector: () => '銀行業' })
    expect(cols.map((c) => c.id).slice(0, 4)).toEqual(['code', 'name', 'mark', 'sector'])
    expect(cols.find((c) => c.id === 'mark')!.cell('A').t).toBe('')
  })
  it('外した理由に上場廃止を数える', () => {
    const r = result({ stocks: [stock('A'), stock('D', { delisted: true })] })
    expect(basisNotes(r, 'past', true).find((n) => n.k === 'sim.n.excluded')?.a).toMatchObject({ n: 1, c: 1 })
  })
})

describe('FR-SIM1 FR-SIM6 FR-SIM7 2 回目のレビューの反映', () => {
  it('出どころ: ウォッチリストへ替えても覚え、スクリーナーへ戻したら読み込み中から始める', async () => {
    const { sourceStep } = await import('../../../src/renderer/lib/divsim')
    let st = sourceStep('', 'live')
    expect(st).toEqual({ last: 'live', reset: true, screen: true })
    st = sourceStep(st.last, 'live')
    expect(st.reset).toBe(false)
    st = sourceStep(st.last, 'favorites')
    expect(st).toEqual({ last: 'favorites', reset: true, screen: false })
    st = sourceStep(st.last, 'live')
    expect(st).toEqual({ last: 'live', reset: true, screen: true })
  })
  it('読み込み中・結果が無いときは、画面の中を動かすキー（Tab・矢印・Enter など）を受けない。設定のキーは受ける', async () => {
    const { blockedWhileLoading } = await import('../../../src/renderer/lib/divsim')
    for (const k of ['Tab', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Enter', 'Home', 'End', 'KeyN', 'KeyS'])
      expect(blockedWhileLoading(k), k).toBe(true)
    for (const k of ['KeyR', 'KeyX', 'KeyB', 'KeyL', 'KeyA', 'PageDown', 'PageUp']) expect(blockedWhileLoading(k), k).toBe(false)
  })
  it('これから: 上場廃止で外した銘柄があれば、前提に理由を出す', () => {
    const r = result({ stocks: [stock('A'), stock('D', { delisted: true })] })
    const n = basisNotes(r, 'fwd', true).find((x) => x.k === 'sim.n.delistedFwd')
    expect(n).toMatchObject({ a: { n: 1 }, warn: true })
    expect(basisNotes(result(), 'fwd', true).some((x) => x.k === 'sim.n.delistedFwd')).toBe(false)
  })
  it('「元本を回収」の札: 文字の幅に合わせ、右端に近ければ縦線の左に出す', async () => {
    const { pillGeom } = await import('../../../src/renderer/lib/divsim')
    const ja = pillGeom(100, 600, '元本を回収')
    expect(ja.x).toBeGreaterThan(100)
    const en = pillGeom(100, 600, 'Principal recovered')
    expect(en.w).toBeGreaterThan(ja.w)
    const right = pillGeom(580, 600, '元本を回収')
    expect(right.x + right.w).toBeLessThanOrEqual(578)
  })
})

describe('FR-SIM10 対象（1 銘柄 ⇔ 群）', () => {
  it('既定は 1 銘柄。リンク色の銘柄を計算する。群なら出どころの銘柄', async () => {
    const { simTargets } = await import('../../../src/renderer/lib/divsim')
    expect(simTargets('one', 2, 'JP:7203', ['JP:1', 'JP:2'])).toEqual({ scope: 'one', ids: ['JP:7203'] })
    expect(simTargets('group', 2, 'JP:7203', ['JP:1', 'JP:2'])).toEqual({ scope: 'group', ids: ['JP:1', 'JP:2'] })
    // 出どころの結果がまだ無い（スクリーナーを走らせている途中）
    expect(simTargets('group', 2, 'JP:7203', null)).toEqual({ scope: 'group', ids: null })
  })
  it('リンク色の銘柄がまだ無ければ空（「銘柄を選んでください」）', async () => {
    const { simTargets } = await import('../../../src/renderer/lib/divsim')
    expect(simTargets('one', 2, undefined, ['JP:1'])).toEqual({ scope: 'one', ids: [] })
  })
  it('リンク 0 のペインは群だけ', async () => {
    const { simTargets } = await import('../../../src/renderer/lib/divsim')
    expect(simTargets('one', 0, 'JP:7203', ['JP:1'])).toEqual({ scope: 'group', ids: ['JP:1'] })
  })
})

describe('FR-SIM5 FR-SIM11 案内と保有の銘柄', () => {
  it('過去が 0 件のとき: これからの銘柄も無ければ別の案内', async () => {
    const { noPastHintKey } = await import('../../../src/renderer/lib/divsim')
    expect(noPastHintKey(3)).toBe('sim.noPastHint')
    expect(noPastHintKey(0)).toBe('sim.noPastHintNone')
  })
  it('保有の銘柄は口座をまたいで 1 つにまとめ、並びは保有の順', async () => {
    const { heldIds } = await import('../../../src/renderer/lib/divsim')
    expect(
      heldIds([
        { code: '8058', quantity: 1 },
        { code: '8001', quantity: 2 },
        { code: '8058', quantity: 3 },
      ]),
    ).toEqual(['JP:8058', 'JP:8001'])
  })
  it('保有のとき: 前提に「今の株数と口座ごとの税」を出し、後知恵は出さない', () => {
    const r = result({ held: new Map([['A', { qty: 10, net: 1 }]]) })
    const ns = basisNotes(r, 'fwd', false)
    expect(ns.some((n) => n.k === 'sim.n.held')).toBe(true)
  })
})

describe('FR-SIM6 FR-SIM11 3 回目のレビューの反映', () => {
  it('保有 × これから: 前提に設定の税の文を出さない（口座ごとの税と食い違うため）。過去には出す', () => {
    const r = result({ settings: { ...DEFAULT_SIM, years: 3, tax: 'gross' }, held: new Map([['A', { qty: 10, net: 1 }]]) })
    const fwd = basisNotes(r, 'fwd', false).map((n) => n.k)
    expect(fwd).toContain('sim.n.held')
    expect(fwd.some((k) => k === 'sim.n.gross' || k === 'sim.n.taxed' || k === 'sim.n.nisa')).toBe(false)
    expect(basisNotes(r, 'past', false).map((n) => n.k)).toContain('sim.n.gross')
  })
  it('保有の銘柄は株数が 0 より多いものだけ', async () => {
    const { heldIds } = await import('../../../src/renderer/lib/divsim')
    expect(
      heldIds([
        { code: '8058', quantity: 10 },
        { code: '8001', quantity: 0 },
      ]),
    ).toEqual(['JP:8058'])
  })
  it('今のタブに効かない設定のキーは受けない（これからで R・G・B・P、保有のこれからでは A・X も）', async () => {
    const { keyApplies } = await import('../../../src/renderer/lib/divsim')
    for (const k of ['KeyR', 'KeyG', 'KeyB', 'KeyP', 'KeyA', 'KeyX']) expect(keyApplies(k, 'past', false), k).toBe(true)
    for (const k of ['KeyR', 'KeyG', 'KeyB', 'KeyP']) expect(keyApplies(k, 'fwd', false), k).toBe(false)
    for (const k of ['KeyA', 'KeyX', 'KeyV', 'KeyL']) expect(keyApplies(k, 'fwd', false), k).toBe(true)
    for (const k of ['KeyA', 'KeyX']) expect(keyApplies(k, 'fwd', true), k).toBe(false)
    expect(keyApplies('KeyV', 'past', false)).toBe(false)
  })
})

describe('FR-SIM4 年ごとの見込みの図（上段: その年の配当・下段: 累計。横の軸は共通）', () => {
  const years = (y1: number, s1: number, n = 10) =>
    Array.from({ length: n }, (_, i) => ({ year: i + 1, value: y1, stress: s1, cum: y1 * (i + 1) }))
  it('上段と下段は重ならず、それぞれ自分の軸を持つ', async () => {
    const { fwdChart } = await import('../../../src/renderer/lib/divsim')
    const g = fwdChart(years(20_400, 15_000), 1_000_000, 600, 250)
    expect(g.top.y(0)).toBeLessThan(g.bot.y(g.bot.max))
    expect(g.top.y(20_400)).toBeGreaterThanOrEqual(g.top.y0 - g.top.h)
    expect(g.bot.y(204_000)).toBeGreaterThanOrEqual(g.bot.y0 - g.bot.h)
    expect(g.top.h).toBeGreaterThanOrEqual(44)
  })
  it('上段: 横ばいは同じ高さの棒、ストレスは棒より低い段（同じなら出さない）', async () => {
    const { fwdChart } = await import('../../../src/renderer/lib/divsim')
    const g = fwdChart(years(20_400, 15_000), 1_000_000, 600, 250)
    expect(g.top.y(20_400)).toBeLessThan(g.top.y(15_000))
    expect(g.stressSame).toBe(false)
    expect(fwdChart(years(20_400, 20_400), 1_000_000, 600, 250).stressSame).toBe(true)
  })
  it('下段: 累計は後の年ほど高い。ストレスの累計も持つ', async () => {
    const { fwdChart } = await import('../../../src/renderer/lib/divsim')
    const g = fwdChart(years(20_400, 15_000), 1_000_000, 600, 250)
    expect(g.bot.y(g.cum[9]!)).toBeLessThan(g.bot.y(g.cum[0]!))
    expect(g.cumStress[9]).toBe(150_000)
    expect(g.bot.ticks.length).toBeGreaterThan(1)
  })
  it('元本: 累計の 1.5 倍以内なら線と届く年、遠ければ線を引かず年数だけ', async () => {
    const { fwdChart } = await import('../../../src/renderer/lib/divsim')
    const far = fwdChart(years(20_400, 20_400), 1_000_000, 600, 250)
    expect(far.principal).toBeNull()
    const near = fwdChart(years(150_000, 150_000), 1_000_000, 600, 250)
    expect(near.principal).toBe(1_000_000)
    expect(near.payback).toBe(6)
  })
  it('無配でも 0 で割らない・年数は出さない', async () => {
    const { fwdChart } = await import('../../../src/renderer/lib/divsim')
    const g = fwdChart(years(0, 0), 1_000_000, 600, 250)
    expect(Number.isFinite(g.top.y(0)) && Number.isFinite(g.bot.y(0))).toBe(true)
  })
  it('横の目盛り: 10 年までは毎年、それより長ければ 5 年ごと（と 1 年目）', async () => {
    const { fwdChart } = await import('../../../src/renderer/lib/divsim')
    expect(fwdChart(years(1, 1, 10), 10, 600, 250).xTicks).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(fwdChart(years(1, 1, 30), 10, 600, 250).xTicks).toEqual([0, 4, 9, 14, 19, 24, 29])
  })
  it('データラベル: 10 年までは毎年、長ければ横の目盛りの年、狭ければ最初と最後。上段は上に余白を取る', async () => {
    const { fwdChart } = await import('../../../src/renderer/lib/divsim')
    expect(fwdChart(years(1, 1, 10), 10, 600, 250).labels).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(fwdChart(years(1, 1, 30), 10, 600, 250).labels).toEqual([0, 4, 9, 14, 19, 24, 29])
    expect(fwdChart(years(1, 1, 10), 10, 300, 250).labels).toEqual([0, 9])
    const g = fwdChart(years(20_400, 15_000), 1_000_000, 600, 250)
    expect(g.top.vmax).toBe(20_400)
    expect(g.top.y(20_400) - (g.top.y0 - g.top.h)).toBeGreaterThanOrEqual(10)
  })
  it('横の位置から年を選ぶ', async () => {
    const { fwdChart } = await import('../../../src/renderer/lib/divsim')
    const g = fwdChart(years(1, 1), 10, 600, 250)
    expect(g.indexAt(g.x(3))).toBe(3)
    expect(g.indexAt(-10)).toBe(0)
  })
  it('ツールチップの値: その年・累計・元本に対する割合・減配シナリオ（違うときだけ）', async () => {
    const { fwdReadout } = await import('../../../src/renderer/lib/divsim')
    const ys = years(20_400, 15_000)
    expect(fwdReadout(ys, 4, 1_000_000)).toMatchObject({
      year: 5,
      value: 20_400,
      cum: 102_000,
      pct: 0.102,
      stress: 15_000,
      cumStress: 75_000,
    })
    expect(fwdReadout(years(20_400, 20_400), 0, 1_000_000)).toMatchObject({
      year: 1,
      value: 20_400,
      cum: 20_400,
      pct: 0.0204,
      stress: null,
      cumStress: null,
    })
    expect(fwdReadout(ys, 0, 0).pct).toBeNull()
  })
})

describe('FR-SIM6 FR-SIM12 4 回目のレビューの反映と言い方', () => {
  it('過去のタブでは M（方式）を受けない（これからだけに効く）', async () => {
    const { keyApplies } = await import('../../../src/renderer/lib/divsim')
    expect(keyApplies('KeyM', 'past', false)).toBe(false)
    expect(keyApplies('KeyM', 'fwd', false)).toBe(true)
  })
  it('並べ替えの候補: 横ばいのときは「試算の伸び」（すべて —）を巡らない', async () => {
    const { fwdSorts } = await import('../../../src/renderer/lib/divsim')
    expect(fwdSorts('flat')).not.toContain('g')
    expect(fwdSorts('growth')).toContain('g')
  })
  it('画面の文言に「ストレス」を使わない（日本語では「減配シナリオ」と言い、何を当てたかを添える）', async () => {
    const { ja } = await import('../../../src/renderer/lib/i18n')
    const bad = Object.entries(ja).filter(([k, v]) => k.startsWith('sim.') && v.includes('ストレス'))
    expect(bad).toEqual([])
    expect(ja['sim.f.stress']).toContain('減配シナリオ')
  })
})

describe('FR-SIM8 帯を図に入れる', () => {
  const years = (n = 10) => Array.from({ length: n }, (_, i) => ({ year: i + 1, value: 100, stress: 100, cum: 100 * (i + 1) }))
  const band = (n = 10) => ({
    p10: Array.from({ length: n }, () => 60),
    p50: Array.from({ length: n }, () => 100),
    p90: Array.from({ length: n }, () => 180),
    c10: Array.from({ length: n }, (_, i) => 60 * (i + 1)),
    c50: Array.from({ length: n }, (_, i) => 100 * (i + 1)),
    c90: Array.from({ length: n }, (_, i) => 180 * (i + 1)),
    years: 8,
  })
  it('目盛りの上端は帯の 90% 点まで入る（帯が図の外に出ない）', async () => {
    const { fwdChart } = await import('../../../src/renderer/lib/divsim')
    const g = fwdChart(years(), 10_000, 600, 250, band())
    expect(g.top.y(180)).toBeGreaterThanOrEqual(g.top.y0 - g.top.h)
    expect(g.bot.y(1800)).toBeGreaterThanOrEqual(g.bot.y0 - g.bot.h)
    expect(g.band).not.toBeNull()
    expect(fwdChart(years(), 10_000, 600, 250).band).toBeNull()
  })
  it('ツールチップの値に帯（10〜90%）を入れる', async () => {
    const { fwdReadout } = await import('../../../src/renderer/lib/divsim')
    expect(fwdReadout(years(), 4, 1000, band())).toMatchObject({ lo: 60, hi: 180, cumLo: 300, cumHi: 900 })
    expect(fwdReadout(years(), 4, 1000)).toMatchObject({ lo: null, hi: null })
  })
})

describe('FR-SIM8 減配の感応度と目標の配当', () => {
  const row = (id: string, y1: number, r: number) => ({ id, y1, r })
  it('感応度: 1 年目の配当の多い順に、無配になったときに減る額（全体に対する割合）と減配シナリオで減る額', async () => {
    const { sensitivity } = await import('../../../src/renderer/lib/divsim')
    const s = sensitivity([row('A', 100, 1), row('B', 300, 0.5), row('C', 0, 1), row('D', 600, 1.2)], 2)
    expect(s.map((x) => x.id)).toEqual(['D', 'B'])
    expect(s[0]).toEqual({ id: 'D', y1: 600, share: 0.6, cut: 0 })
    expect(s[1]).toEqual({ id: 'B', y1: 300, share: 0.3, cut: 150 })
    expect(sensitivity([row('A', 0, 1)], 5)).toEqual([])
  })
  it('目標の配当（月）: 届くのに要る元本と、今の見込みが目標の何 %', async () => {
    const { goalOf } = await import('../../../src/renderer/lib/divsim')
    expect(goalOf(50_000, 120_000, 3_000_000)).toEqual({ annual: 600_000, need: 15_000_000, pct: 0.2 })
    expect(goalOf(0, 120_000, 3_000_000)).toBeNull()
    expect(goalOf(50_000, 0, 3_000_000)).toEqual({ annual: 600_000, need: null, pct: 0 })
  })
})

describe('FR-SIM12 表の「試算の伸び」の列', () => {
  it('伸びを見込むときだけ出す', async () => {
    const { simColumns } = await import('../../../src/renderer/lib/divsim')
    const o = { lang: 'ja' as const, label: (k: string) => k, name: (id: string) => id, code: (id: string) => id }
    expect(simColumns(result(), 'fwd', o).some((c) => c.id === 'g')).toBe(false)
    expect(simColumns(result({ settings: { ...DEFAULT_SIM, years: 3, method: 'growth' } }), 'fwd', o).some((c) => c.id === 'g')).toBe(true)
  })
})

describe('FR-SIM8 超過分の分解の段（滝）', () => {
  it('1306 から順に足していき、最後は選んだ群（合計）', async () => {
    const { decompSteps } = await import('../../../src/renderer/lib/divsim')
    const s = decompSteps({ etf: 0.1, size: 0.05, sector: -0.02, pick: 0.07 })
    expect(s.map((x) => x.k)).toEqual(['etf', 'size', 'sector', 'pick', 'total'])
    expect(s[0]).toEqual({ k: 'etf', from: 0, to: 0.1, v: 0.1 })
    expect(s[2]!.k).toBe('sector')
    expect(s[2]!.from).toBeCloseTo(0.15)
    expect(s[2]!.to).toBeCloseTo(0.13)
    expect(s[4]!.to).toBeCloseTo(0.2)
    expect(s[4]!.from).toBe(0)
  })
})

describe('FR-SIM8 設定: 基準日の日付・積立・配分', () => {
  it('ペインの状態から読む（知らない値は既定）', () => {
    expect(simSettingsOf({ years: 10, from: '2020-04-01', monthly: 30_000, weight: 'yield' })).toMatchObject({
      years: 10,
      from: '2020-04-01',
      monthly: 30_000,
      weight: 'yield',
    })
    expect(simSettingsOf({ from: '2020/04/01', monthly: -5, weight: 'x' })).toMatchObject({ from: null, monthly: 0, weight: 'equal' })
  })
  it('計算し直す鍵に入る', () => {
    expect(simKey(['a'], { ...DEFAULT_SIM, monthly: 1 })).not.toBe(simKey(['a'], DEFAULT_SIM))
    expect(simKey(['a'], { ...DEFAULT_SIM, from: '2020-01-01' })).not.toBe(simKey(['a'], DEFAULT_SIM))
    expect(simKey(['a'], { ...DEFAULT_SIM, weight: 'yield' })).not.toBe(simKey(['a'], DEFAULT_SIM))
  })
  it('日付の入力（YYYY-MM-DD・/ 区切り・全角）。今日より後・2000 年より前・読めない値は null', async () => {
    const { parseFrom } = await import('../../../src/renderer/lib/divsim')
    expect(parseFrom('2020-04-01', '2026-11-13')).toBe('2020-04-01')
    expect(parseFrom('２０２０/4/1', '2026-11-13')).toBe('2020-04-01')
    expect(parseFrom('2027-01-01', '2026-11-13')).toBeNull()
    expect(parseFrom('1999-12-31', '2026-11-13')).toBeNull()
    expect(parseFrom('abc', '2026-11-13')).toBeNull()
  })
  it('積立の額（月・万円で打つ。0 で止める）', async () => {
    const { parseMonthly } = await import('../../../src/renderer/lib/divsim')
    expect(parseMonthly('3')).toBe(30_000)
    expect(parseMonthly('0')).toBe(0)
    expect(parseMonthly('-1')).toBeNull()
  })
})

describe('FR-SIM8 シナリオの保存（ペインの状態に持つ）', () => {
  it('今の設定（計算の設定と出どころ・対象）を名前で保存。同じ名前は上書き、20 件まで（古いものから消す）', async () => {
    const { saveScenario, scenariosOf } = await import('../../../src/renderer/lib/divsim')
    const st = { years: 5, amount: 1_000_000, src: 'favorites', scope: 'group', tab: 'fwd', pct: true }
    let xs = saveScenario([], 'A', st)
    expect(xs[0]!.name).toBe('A')
    expect(xs[0]!.state).toMatchObject({ years: 5, amount: 1_000_000, src: 'favorites', scope: 'group' })
    expect(xs[0]!.state).not.toHaveProperty('tab')
    expect(xs[0]!.state).not.toHaveProperty('pct')
    xs = saveScenario(xs, 'A', { ...st, years: 3 })
    expect(xs.length).toBe(1)
    expect(xs[0]!.state.years).toBe(3)
    for (let i = 0; i < 25; i++) xs = saveScenario(xs, `S${i}`, st)
    expect(xs.length).toBe(20)
    expect(xs.at(-1)!.name).toBe('S24')
    expect(scenariosOf({ scenarios: xs }).length).toBe(20)
    expect(scenariosOf({ scenarios: 'x' })).toEqual([])
    // 計算の入力（当時の条件で選び直す）も入れる
    expect(saveScenario([], 'R', { rescreen: true, tab: 'past' })[0]!.state.rescreen).toBe(true)
    // 決めていなかった設定も「既定」として入れる（読み込んだとき、あとから変えた値が残らない）
    const blank = saveScenario([], 'B', {})[0]!.state
    expect(blank).toMatchObject({ from: null, monthly: null, rescreen: null, src: null })
  })
})

describe('FR-SIM8 フリーの窓に置く', () => {
  it('フリーの窓に置けるペインに入る。既定の出どころは★お気に入り（スクリーナーが無いため今のスクリーナーは選べない）', async () => {
    const { FREE_WIDGETS } = await import('../../../src/renderer/lib/windowSlot')
    const { defaultSource, allowsLive } = await import('../../../src/renderer/lib/divsim')
    expect(FREE_WIDGETS).toContain('divsim')
    expect(defaultSource(true)).toBe('favorites')
    expect(defaultSource(false)).toBe('live')
    expect(allowsLive(true)).toBe(false)
    expect(allowsLive(false)).toBe(true)
  })
})

describe('FR-SIM8 当時の条件で選び直す（H）', () => {
  it('過去のタブだけで受ける', async () => {
    const { keyApplies } = await import('../../../src/renderer/lib/divsim')
    expect(keyApplies('KeyH', 'past', false)).toBe(true)
    expect(keyApplies('KeyH', 'fwd', false)).toBe(false)
  })
  it('前提に、作り直せた条件で選び直したことと、使えなかった条件を出す', () => {
    const r = result()
    r.past!.rescreen = { count: 2, ignored: ['value.per'] }
    const n = basisNotes(r, 'past', true).find((x) => x.k === 'sim.n.rescreen')
    expect(n).toMatchObject({ a: { n: 2, x: 'PER' }, warn: true })
  })
})

describe('FR-SIM8 積立と選び直しの前提（レビューの反映）', () => {
  it('積立のときは「同業種と比べられる銘柄がない」の警告を出さない（積立の前提が理由を言う）', () => {
    const r = result({ settings: { ...DEFAULT_SIM, monthly: 50_000 } })
    const ks = basisNotes(r, 'past', true).map((n) => n.k)
    expect(ks).toContain('sim.n.dca')
    expect(ks).not.toContain('sim.n.noPeer')
  })
  it('使えなかった条件は指標の名前で出す（ID ではなく）', () => {
    const r = result()
    r.past!.rescreen = { count: 2, ignored: ['value.per'] }
    expect(basisNotes(r, 'past', true, 'ja').find((n) => n.k === 'sim.n.rescreen')?.a?.x).toBe('PER')
    expect(basisNotes(r, 'past', true, 'en').find((n) => n.k === 'sim.n.rescreen')?.a?.x).toBe('P/E')
  })
  it('選び直しの入力の署名: 条件の値・★・ウォッチリストが変わると変わる（計算し直す）', async () => {
    const { rescreenInput, rescreenSig } = await import('../../../src/renderer/lib/divsim')
    const c = [{ field: 'income.yield', op: '>=' as const, value: 3 }]
    const a = rescreenSig(rescreenInput(c, [{ id: 'fav', builtin: 'favorites', items: ['JP:1'] }]))
    expect(rescreenSig(rescreenInput([{ ...c[0]!, value: 4 }], [{ id: 'fav', builtin: 'favorites', items: ['JP:1'] }]))).not.toBe(a)
    expect(rescreenSig(rescreenInput(c, [{ id: 'fav', builtin: 'favorites', items: ['JP:2'] }]))).not.toBe(a)
    expect(rescreenSig(rescreenInput(c, [{ id: 'fav', builtin: 'favorites', items: ['JP:1'] }]))).toBe(a)
    expect(rescreenSig(null)).toBe('')
    expect(rescreenInput(c, [{ id: 'fav', builtin: 'favorites', items: ['JP:1'] }]).favorites).toEqual(['JP:1'])
  })
  it('これからのタブでは基準日の日付（Alt+5）を受けない', async () => {
    const { altApplies } = await import('../../../src/renderer/lib/divsim')
    expect(altApplies('Digit5', 'fwd')).toBe(false)
    expect(altApplies('Digit5', 'past')).toBe(true)
    expect(altApplies('Digit1', 'fwd')).toBe(true)
  })
})
