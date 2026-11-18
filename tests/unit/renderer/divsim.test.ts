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
    Array.from({ length: n }, (_, i) => ({ year: i + 1, flat: y1, stress: s1, cumFlat: y1 * (i + 1) }))
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
    expect(g.bot.y(g.cumFlat[9]!)).toBeLessThan(g.bot.y(g.cumFlat[0]!))
    expect(g.cumStress[9]).toBe(150_000)
    expect(g.bot.ticks.length).toBeGreaterThan(1)
  })
  it('元本: 累計の 1.5 倍以内なら線と届く年、遠ければ線を引かず年数だけ', async () => {
    const { fwdChart } = await import('../../../src/renderer/lib/divsim')
    const far = fwdChart(years(20_400, 20_400), 1_000_000, 600, 250)
    expect(far.principal).toBeNull()
    expect(far.paybackYears).toBe(50)
    const near = fwdChart(years(150_000, 150_000), 1_000_000, 600, 250)
    expect(near.principal).toBe(1_000_000)
    expect(near.payback).toBe(6)
  })
  it('無配でも 0 で割らない・年数は出さない', async () => {
    const { fwdChart } = await import('../../../src/renderer/lib/divsim')
    const g = fwdChart(years(0, 0), 1_000_000, 600, 250)
    expect(g.paybackYears).toBeNull()
    expect(Number.isFinite(g.top.y(0)) && Number.isFinite(g.bot.y(0))).toBe(true)
  })
  it('横の目盛り: 10 年までは毎年、それより長ければ 5 年ごと（と 1 年目）', async () => {
    const { fwdChart } = await import('../../../src/renderer/lib/divsim')
    expect(fwdChart(years(1, 1, 10), 10, 600, 250).xTicks).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(fwdChart(years(1, 1, 30), 10, 600, 250).xTicks).toEqual([0, 4, 9, 14, 19, 24, 29])
  })
  it('横の位置から年を選ぶ', async () => {
    const { fwdChart } = await import('../../../src/renderer/lib/divsim')
    const g = fwdChart(years(1, 1), 10, 600, 250)
    expect(g.indexAt(g.x(3))).toBe(3)
    expect(g.indexAt(-10)).toBe(0)
  })
  it('図の下の固定の 1 行: その年・累計・元本に対する割合・ストレス（違うときだけ）', async () => {
    const { fwdReadout } = await import('../../../src/renderer/lib/divsim')
    const ys = years(20_400, 15_000)
    expect(fwdReadout(ys, 4, 1_000_000)).toEqual({ year: 5, flat: 20_400, cum: 102_000, pct: 0.102, stress: 15_000, cumStress: 75_000 })
    expect(fwdReadout(years(20_400, 20_400), 0, 1_000_000)).toEqual({ year: 1, flat: 20_400, cum: 20_400, pct: 0.0204, stress: null, cumStress: null })
    expect(fwdReadout(ys, 0, 0).pct).toBeNull()
  })
})
