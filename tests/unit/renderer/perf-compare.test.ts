// パフォーマンス比較のペインの計算（docs/design-perf.md §3・§4・§2.3。L1）。値はすべて架空
import { createStubProvider } from '@core/providers/stub'
import { addDays, isTradingDay } from '@shared/calendar'
import { describe, expect, it } from 'vitest'
import {
  addPatch,
  addTradingDays,
  annualized,
  assignColor,
  baseLimits,
  calendarCells,
  calMove,
  crossBox,
  cycleBench,
  dayNum,
  disambiguate,
  divNote,
  endLimits,
  fitLabel,
  fitWidth,
  importPatch,
  indexSeries,
  keepSpaced,
  labelPx,
  labelWidth,
  layoutEndLabels,
  maxDrawdown,
  monthLastTradingDay,
  monthlyPending,
  nearestDay,
  PF_MAX,
  parseYmd,
  pfView,
  presetBase,
  removePatch,
  resolveFrame,
  shortName,
  sinceBase,
  snapTrading,
  sortIds,
  stepCross,
  stepDate,
  stitch,
  thinIdx,
  timeTicks,
  valueAt,
  valueTicks,
  yRange,
} from '../../../src/renderer/lib/perf'
import { PerfSetStore } from '../../../src/renderer/lib/perfSets'

/** from〜to の営業日の足（終値は 1 日ごとに step ずつ増える） */
function days(from: string, to: string, c0 = 100, step = 1) {
  const time: string[] = []
  const close: number[] = []
  let c = c0
  for (let d = from; d <= to; d = addDays(d, 1))
    if (isTradingDay(d)) {
      time.push(d)
      close.push(c)
      c += step
    }
  return { time, close }
}
/** bars.get の 'M' の形: 月の初め（月次系列は YYYY-MM-01）に、その月の終値 */
function months(from: string, to: string, c0 = 50) {
  const time: string[] = []
  const close: number[] = []
  let c = c0
  for (let ym = from; ym <= to; ) {
    time.push(`${ym}-01`)
    close.push(c)
    c += 10
    const [y, m] = ym.split('-').map(Number) as [number, number]
    ym = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
  }
  return { time, close }
}

describe('FR-PC3 月の最終営業日・営業日に寄せる', () => {
  it('月の最終営業日は祝日・週末・年末を飛ばす', () => {
    expect(monthLastTradingDay('2024-08')).toBe('2024-08-30')
    expect(monthLastTradingDay('2024-12')).toBe('2024-12-30') // 12/31 は休場
    expect(monthLastTradingDay('2025-05')).toBe('2025-05-30')
    expect(monthLastTradingDay('2024-03')).toBe('2024-03-29')
  })
  it('休場日は直前の営業日。営業日はそのまま', () => {
    expect(snapTrading('2025-01-04')).toBe('2024-12-30')
    expect(snapTrading('2024-08-05')).toBe('2024-08-05')
  })
  it('n 営業日先・前', () => {
    expect(addTradingDays('2024-08-02', 1)).toBe('2024-08-05')
    expect(addTradingDays('2024-08-05', -1)).toBe('2024-08-02')
    expect(addTradingDays('2024-12-27', 2)).toBe('2025-01-06')
  })
})

describe('FR-PC3 stitch（月次は日足の始まりの月より前だけ）', () => {
  const daily = days('2023-10-16', '2024-03-29')
  const monthly = months('2022-01', '2024-03')
  it('月の足の日付を月の最終営業日にし、日足の始まりの月から後は日足', () => {
    const s = stitch(daily, monthly)
    expect(s.stitch).toBe('2023-10-16')
    expect(s.time[0]).toBe('2022-01-31')
    // 2023-09 が最後の月次の点（2023-10 は日足の月なので使わない）
    const i = s.time.indexOf('2023-10-16')
    expect(s.time[i - 1]).toBe('2023-09-29')
    expect(s.time.slice(i)).toEqual(daily.time)
    expect(s.close.length).toBe(s.time.length)
  })
  it('月次が無い・日足の前に月が無いときは日足だけ（継ぎ目なし）', () => {
    expect(stitch(daily, null)).toEqual({ ...daily, stitch: null })
    expect(stitch(daily, months('2023-10', '2024-03')).stitch).toBeNull()
  })
  it('日足が空なら月次だけ', () => {
    const s = stitch({ time: [], close: [] }, months('2020-01', '2020-03'))
    expect(s.time).toEqual(['2020-01-31', '2020-02-28', '2020-03-31'])
  })
})

describe('FR-PC3 FR-PC5 resolveFrame', () => {
  const A = { id: 'A', s: stitch(days('2023-10-16', '2026-11-13'), months('2015-01', '2026-11')) }
  const B = { id: 'B', s: stitch(days('2023-10-16', '2026-11-13', 500, 2), months('2015-01', '2026-11', 300)) }
  it('日足の中の営業日はその日。100 にする日はすべての線で同じ', () => {
    const f = resolveFrame('2024-08-05', null, [A, B])
    expect(f.base).toBe('2024-08-05')
    expect(f.reason).toBeNull()
    expect(f.monthly).toBe(false)
    expect(f.end).toBe('2026-11-13')
    const a = f.states.A!
    expect(a.kind).toBe('ok')
    if (a.kind === 'ok') expect(A.s.time[a.i0]).toBe('2024-08-05')
  })
  it('休場日は直前の営業日（理由 holiday）', () => {
    const f = resolveFrame('2025-01-04', null, [A])
    expect(f.base).toBe('2024-12-30')
    expect(f.reason).toBe('holiday')
  })
  it('日足より前は、最終営業日が基準日以前の月（基準日の月の足は月末が後なら使わない）', () => {
    const f = resolveFrame('2020-03-15', null, [A, B])
    expect(f.monthly).toBe(true)
    expect(f.reason).toBe('monthly')
    expect(f.base).toBe('2020-02-28')
    expect(f.stitch).toBe('2023-10-16')
    // 月末ちょうどならその月
    expect(resolveFrame('2020-03-31', null, [A]).base).toBe('2020-03-31')
  })
  it('基準日の足が無く、5 営業日以内に直前の足があればその終値（from）', () => {
    const s = days('2023-10-16', '2026-11-13')
    const cut = { time: s.time.filter((d) => d < '2024-08-01' || d > '2024-08-05'), close: [] as number[] }
    cut.close = cut.time.map((_, i) => 100 + i)
    const C = { id: 'C', s: stitch(cut, null) }
    const f = resolveFrame('2024-08-05', null, [A, C])
    const c = f.states.C!
    expect(c.kind).toBe('ok')
    if (c.kind === 'ok') expect(c.from).toBe('2024-07-31')
  })
  it('前後に 5 営業日以上足が無ければ gap', () => {
    const s = days('2023-10-16', '2026-11-13')
    const cut = { time: s.time.filter((d) => d < '2024-07-01' || d > '2024-09-01'), close: [] as number[] }
    cut.close = cut.time.map(() => 100)
    const f = resolveFrame('2024-08-05', null, [A, { id: 'C', s: stitch(cut, null) }])
    expect(f.states.C!.kind).toBe('gap')
  })
  it('基準日より前に足が無ければ上場前（最初の足の日）', () => {
    const N = { id: 'N', s: stitch(days('2026-03-02', '2026-11-13'), null) }
    const f = resolveFrame('2024-11-13', null, [A, N])
    expect(f.states.N).toEqual({ kind: 'before', first: '2026-03-02' })
    expect(resolveFrame('2024-11-13', null, [{ id: 'E', s: null }]).states.E).toEqual({ kind: 'before', first: null })
  })
  it('月次を取得中は pending（上場前と取り違えない）', () => {
    const P = { id: 'P', s: stitch(days('2023-10-16', '2026-11-13'), null), pending: true }
    expect(resolveFrame('2020-03-15', null, [A, P]).states.P!.kind).toBe('pending')
  })
  it('最新の足が終わりの日より古い銘柄は last を持つ', () => {
    const S = { id: 'S', s: stitch(days('2023-10-16', '2026-11-10'), null) }
    const f = resolveFrame('2024-08-05', null, [A, S])
    expect(f.end).toBe('2026-11-13')
    const s = f.states.S!
    expect(s.kind === 'ok' && s.last).toBe('2026-11-10')
    const a = f.states.A!
    expect(a.kind === 'ok' && a.last).toBeUndefined()
  })
  it('終わりの日を指定すると、その日以前の最後の足まで', () => {
    const f = resolveFrame('2024-08-05', '2025-01-04', [A])
    expect(f.end).toBe('2024-12-30')
    const a = f.states.A!
    if (a.kind === 'ok') expect(A.s.time[a.i1]).toBe('2024-12-30')
  })
})

describe('FR-PC6 指数化・年率・最大下落率', () => {
  const s = stitch({ time: ['2024-01-04', '2024-01-05', '2024-01-09', '2024-01-10'], close: [200, 300, 150, 250] }, null)
  it('基準日が 100、終わりの日まで', () => {
    const x = indexSeries(s, { kind: 'ok', i0: 1, i1: 3 })
    expect(x.t).toEqual(['2024-01-05', '2024-01-09', '2024-01-10'])
    expect(x.v[0]).toBe(100)
    expect(x.v[1]).toBe(50)
    expect(x.v.at(-1)).toBeCloseTo(83.333, 2)
  })
  it('最大下落率は高値からの下げ（%。負）', () => {
    expect(maxDrawdown([100, 120, 60, 130, 117])).toBeCloseTo(-50)
    expect(maxDrawdown([100, 110])).toBe(0)
  })
  it('年率は半年未満で出さない', () => {
    expect(annualized(121, '2024-01-04', '2024-03-01')).toBeNull()
    const r = annualized(121, '2024-11-13', '2026-11-13')!
    expect(r).toBeGreaterThan(9)
    expect(r).toBeLessThan(11)
  })
  it('十字線の日の値（その日以前の最後の点）', () => {
    const x = { t: ['2024-01-05', '2024-01-09'], v: [100, 50] }
    expect(valueAt(x, '2024-01-08')).toBe(100)
    expect(valueAt(x, '2024-01-09')).toBe(50)
    expect(valueAt(x, '2024-01-04')).toBeUndefined()
  })
})

describe('FR-PC6 配当込みの範囲の注意', () => {
  it('配当込みで基準日が配当の記録より前の銘柄があれば、いちばん遅い始まり', () => {
    expect(divNote(true, '2015-03-31', { A: '2016-11-15', B: '2023-10-13' })).toBe('2023-10-13')
    expect(divNote(true, '2024-08-05', { A: '2016-11-15', B: '2023-10-13' })).toBeNull()
    expect(divNote(false, '2015-03-31', { A: '2016-11-15' })).toBeNull()
  })
})

describe('FR-PC5 月次を取得中の見分け', () => {
  it('基準日が日足より前・月次が無い・月次をまだ取っていない → 取得中。取ったのに無いなら上場前（取得中のままにしない）', () => {
    const d = days('2023-10-16', '2026-11-13')
    expect(monthlyPending('2020-01-01', d, undefined, false)).toBe(true)
    expect(monthlyPending('2020-01-01', d, 40, false)).toBe(false)
    expect(monthlyPending('2024-01-01', d, undefined, false)).toBe(false)
    expect(monthlyPending('2020-01-01', d, undefined, true)).toBe(false)
  })
})

describe('FR-PC7 右端の札・十字線の小箱', () => {
  it('重なる札を押し広げ、順を保ち、上下の端を出ない', () => {
    const ys = layoutEndLabels([100, 102, 104, 300], 20, 320, 16)
    expect(ys[1]! - ys[0]!).toBeGreaterThanOrEqual(16)
    expect(ys[2]! - ys[1]!).toBeGreaterThanOrEqual(16)
    expect(ys[3]).toBe(300)
    const low = layoutEndLabels([318, 319, 320], 20, 320, 16)
    expect(Math.max(...low)).toBeLessThanOrEqual(320)
    expect(low[2]! - low[1]!).toBeGreaterThanOrEqual(16)
    const top = layoutEndLabels([0, 1], 20, 320, 16)
    expect(Math.min(...top)).toBeGreaterThanOrEqual(20)
    // 入力の順（上下が逆でも）に返す
    const rev = layoutEndLabels([200, 100], 0, 400, 16)
    expect(rev).toEqual([200, 100])
  })
  it('小箱は値の高い順。値の無い線は出さない', () => {
    const r = crossBox([
      { id: 'a', v: 90 },
      { id: 'b', v: 120 },
      { id: 'c', v: undefined },
    ])
    expect(r.map((x) => x.id)).toEqual(['b', 'a'])
  })
})

describe('FR-PC6 目盛り', () => {
  it('4 年までは四半期（1 月は年）', () => {
    const t = timeTicks('2024-08-05', '2026-11-13')
    expect(t.map((x) => x.d)).toContain('2025-01-01')
    expect(t.find((x) => x.d === '2025-01-01')!.label).toBe('2025')
    expect(t.find((x) => x.d === '2025-04-01')!.label).toBe('2025/04')
  })
  it('6 年までは毎年、長いと 2 年・5 年ごと', () => {
    expect(timeTicks('2021-01-05', '2026-11-13').every((x) => x.d.endsWith('-01-01'))).toBe(true)
    const t10 = timeTicks('2016-01-05', '2026-11-13')
    expect(t10.every((x) => Number(x.d.slice(0, 4)) % 2 === 0)).toBe(true)
    const t20 = timeTicks('2001-01-05', '2026-11-13')
    expect(t20.every((x) => Number(x.d.slice(0, 4)) % 5 === 0)).toBe(true)
  })
  it('値: 通常は区切りのよい値、対数は 2 倍ごと', () => {
    expect(valueTicks(58, 151, false)).toEqual([60, 80, 100, 120, 140])
    expect(valueTicks(62, 151, false)).toEqual([80, 100, 120, 140])
    expect(valueTicks(40, 420, true)).toEqual([50, 100, 200, 400])
    // 対数で範囲が狭いときは区切りのよい値
    expect(valueTicks(90, 130, true).length).toBeGreaterThanOrEqual(3)
  })
})

describe('FR-PC8 色の枠', () => {
  it('空いている枠のいちばん若いもの。満杯なら null', () => {
    expect(assignColor({})).toBe(1)
    expect(assignColor({ a: 1, b: 2 })).toBe(3)
    // 2 を外すと次は 2（ほかの色は変えない）
    expect(assignColor({ a: 1, c: 3 })).toBe(2)
    expect(assignColor({ a: 1, b: 2, c: 3, d: 4, e: 5 })).toBeNull()
    expect(PF_MAX).toBe(5)
  })
})

describe('FR-PC2 カレンダー・日付の操作', () => {
  it('6 週（42 日）・日曜始まり', () => {
    const c = calendarCells('2024-09') // 2024-09-01 は日曜
    expect(c.length).toBe(42)
    expect(c[0]).toBe('2024-09-01')
    const f = calendarCells('2024-02') // 2024-02-01 は木曜・うるう年
    expect(f[0]).toBe('2024-01-28')
    expect(f).toContain('2024-02-29')
  })
  it('← → 日・↑ ↓ 週・PgUp PgDn 月・Shift で年・Home End 月の初め／終わり', () => {
    expect(calMove('2024-01-31', 'ArrowRight', false)).toBe('2024-02-01')
    expect(calMove('2024-01-31', 'ArrowUp', false)).toBe('2024-01-24')
    expect(calMove('2024-01-31', 'PageDown', false)).toBe('2024-02-29')
    expect(calMove('2024-02-29', 'PageUp', true)).toBe('2023-02-28')
    expect(calMove('2024-02-10', 'Home', false)).toBe('2024-02-01')
    expect(calMove('2024-02-10', 'End', false)).toBe('2024-02-29')
    expect(calMove('2024-02-10', 'KeyA', false)).toBeNull()
  })
  it('yyyymmdd を読む（実在しない日は null）', () => {
    expect(parseYmd('20240805')).toBe('2024-08-05')
    expect(parseYmd('20230229')).toBeNull()
    expect(parseYmd('2024085')).toBeNull()
  })
  it('基準日の欄: ← → 営業日（月次は 1 か月）・↑ ↓ 1 か月・PgUp PgDn 1 年。営業日に寄せる', () => {
    expect(stepDate('2024-08-05', 'day', 1, false)).toBe('2024-08-06')
    expect(stepDate('2024-08-05', 'day', -1, false)).toBe('2024-08-02')
    expect(stepDate('2020-02-28', 'day', 1, true)).toBe('2020-03-31')
    expect(stepDate('2024-08-05', 'month', -1, false)).toBe('2024-07-05')
    expect(stepDate('2024-08-05', 'year', -1, false)).toBe('2023-08-04') // 2023-08-05 は土曜
  })
  it('年初・N 年前の札（年初は前の年の最後の営業日）', () => {
    expect(presetBase('2026-11-13', 0)).toBe('2025-12-30')
    expect(presetBase('2026-11-13', 1)).toBe('2025-11-13')
    expect(presetBase('2026-11-13', 3)).toBe('2023-11-13')
    expect(presetBase('2026-11-13', 5)).toBe('2021-11-12') // 2021-11-13 は土曜
  })
  it('選べる範囲: 基準日と終わりの日は 5 営業日より近づけない。1999 年より前・今日より後は選べない', () => {
    expect(baseLimits('2026-11-13', null)).toEqual({ min: '1999-01-01', max: '2026-11-06' })
    expect(baseLimits('2026-11-13', '2025-01-10').max).toBe('2024-12-30') // 1/1〜1/3 は休場
    expect(endLimits('2026-11-13', '2024-08-05')).toEqual({ min: '2024-08-13', max: '2026-11-13' })
  })
})

describe('FR-PC7 短い名前', () => {
  it('ホールディングス・グループ・投資法人などを落とし、詰める', () => {
    expect(shortName('東京海上ホールディングス')).toBe('東京海上')
    expect(shortName('三菱UFJフィナンシャル・グループ')).toBe('三菱UFJ')
    expect(shortName('日本ビルファンド投資法人')).toBe('日本ビルファンド')
    expect(shortName('NEXT FUNDS TOPIX連動型上場投信')).toBe('TOPIX')
    expect(shortName('ジャパンリアルエステイト投資法人').length).toBeLessThanOrEqual(8)
    expect(shortName('Tokio Marine Holdings,Inc.')).toBe('Tokio Marine')
  })
  it('スタブの全銘柄で、詰めた名前が重ならない（ja・en）', async () => {
    const rows = await createStubProvider().fetchUniverse({ signal: new AbortController().signal })
    const ja = rows.map((r) => shortName(r.nameJa))
    expect(new Set(ja).size).toBe(ja.length)
    expect(ja.every((x) => x.length > 0)).toBe(true)
    const en = rows.map((r) => shortName(r.nameEn))
    expect(new Set(en).size).toBe(en.length)
  })
})

describe('FR-PC4 FR-PC8 ペインの状態（足す・外す・取り込む・並び）', () => {
  it('未設定は既定で読む（種は作ったときのリンク色の銘柄）', () => {
    const v = pfView({}, 'JP:7203')
    expect(v.ids).toEqual(['JP:7203'])
    expect(v.slots).toEqual({ 'JP:7203': 1 })
    expect(v.bench).toEqual(['JP:1306'])
    expect(v).toMatchObject({ base: undefined, end: undefined, mode: 'idx', total: false, log: false, sort: 0, off: [] })
    expect(pfView({}, null).ids).toEqual([])
    // 書いたあとは種を使わない
    expect(pfView({ pfIds: [] }, 'JP:7203').ids).toEqual([])
  })
  it('足す: 空いた色の枠。重複・5 銘柄で断る。比べる相手は比べる相手に', () => {
    const v = pfView({ pfIds: ['A', 'C'], pfSlots: { A: 1, C: 3 } }, null)
    expect(addPatch(v, 'B')).toEqual({ patch: { pfIds: ['A', 'C', 'B'], pfSlots: { A: 1, C: 3, B: 2 } } })
    expect(addPatch(v, 'A')).toEqual({ refused: 'dup' })
    const full = pfView({ pfIds: ['A', 'B', 'C', 'D', 'E'], pfSlots: { A: 1, B: 2, C: 3, D: 4, E: 5 } }, null)
    expect(addPatch(full, 'F')).toEqual({ refused: 'full' })
    expect(addPatch(full, 'JP:1343')).toEqual({ patch: { pfBench: ['JP:1306', 'JP:1343'] } })
    expect(addPatch(full, 'JP:1306')).toEqual({ refused: 'dup' })
  })
  it('外す: 色の枠を空ける（ほかの色は変えない）。比べる相手も外せる', () => {
    const v = pfView({ pfIds: ['A', 'B', 'C'], pfSlots: { A: 1, B: 2, C: 3 }, pfOff: ['B'] }, null)
    expect(removePatch(v, 'B')).toEqual({ pfIds: ['A', 'C'], pfSlots: { A: 1, C: 3 }, pfOff: [] })
    expect(removePatch(v, 'JP:1306')).toEqual({ pfBench: [], pfOff: ['B'] })
  })
  it('取り込む: 先頭の 5 銘柄で置き換える（比べる相手・重複は除く）', () => {
    const p = importPatch(['A', 'JP:1306', 'B', 'A', 'C', 'D', 'E', 'F'])
    expect(p.pfIds).toEqual(['A', 'B', 'C', 'D', 'E'])
    expect(p.pfSlots).toEqual({ A: 1, B: 2, C: 3, D: 4, E: 5 })
    expect(p.pfOff).toEqual([])
  })
  it('並び: 終わりの日の値の順（値の無い銘柄は後ろ）・足した順・コード順', () => {
    const ids = ['JP:8035', 'JP:7203', 'JP:9984']
    const end = { 'JP:8035': 120, 'JP:9984': 150 }
    expect(sortIds(ids, 0, end)).toEqual(['JP:9984', 'JP:8035', 'JP:7203'])
    expect(sortIds(ids, 1, end)).toEqual(ids)
    expect(sortIds(ids, 2, end)).toEqual(['JP:7203', 'JP:8035', 'JP:9984'])
  })
})

describe('FR-PC10 比較の組（メモリだけ）', () => {
  it('名前で覚え、同じ名前は置き換え、消せる。ディスクに書く口は持たない', () => {
    const s = new PerfSetStore()
    s.save({ name: 'A', base: '2024-08-05', end: null, ids: ['JP:7203'], bench: ['JP:1306'], mode: 'idx', total: false, log: false })
    s.save({ name: 'B', base: '2023-01-04', end: null, ids: [], bench: [], mode: 'pct', total: true, log: false })
    s.save({ name: 'A', base: '2020-01-06', end: null, ids: [], bench: [], mode: 'idx', total: false, log: true })
    expect(s.list().map((x) => x.name)).toEqual(['A', 'B'])
    expect(s.get('A')!.base).toBe('2020-01-06')
    s.remove('B')
    expect(s.list().map((x) => x.name)).toEqual(['A'])
    // 渡した値を後から変えても、覚えた組は変わらない
    const x = s.get('A')!
    x.ids.push('JP:9984')
    expect(s.get('A')!.ids).toEqual([])
  })
})

describe('FR-PC4 FR-PC7 比べる相手・縦の範囲・間引き・十字線', () => {
  it('B で比べる相手を巡る: なし → 1306 → 1306 と 1343 → 1343 → なし', () => {
    expect(cycleBench([])).toEqual(['JP:1306'])
    expect(cycleBench(['JP:1306'])).toEqual(['JP:1306', 'JP:1343'])
    expect(cycleBench(['JP:1306', 'JP:1343'])).toEqual(['JP:1343'])
    expect(cycleBench(['JP:1343'])).toEqual([])
  })
  it('縦の範囲は 100 を含み、上下に余白。対数でも正', () => {
    const r = yRange([110, 150], false)
    expect(r.lo).toBeLessThan(100)
    expect(r.hi).toBeGreaterThan(150)
    const g = yRange([50, 400], true)
    expect(g.lo).toBeGreaterThan(0)
    expect(g.lo).toBeLessThan(50)
    expect(yRange([], false)).toEqual({ lo: 80, hi: 120 })
  })
  it('間引き: 1px に 2 点まで、最初と最後は残す', () => {
    const k = thinIdx(1000, 100)
    expect(k[0]).toBe(0)
    expect(k.at(-1)).toBe(999)
    expect(k.length).toBeLessThanOrEqual(201)
    expect(thinIdx(10, 100)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  })
  it('十字線: ← → 1 点・Shift で 1 か月・Home End。無ければ終わりから', () => {
    const ax = days('2024-08-05', '2024-12-30').time
    expect(stepCross(ax, null, 'ArrowLeft', false)).toBe(ax.at(-1))
    expect(stepCross(ax, '2024-08-06', 'ArrowLeft', false)).toBe('2024-08-05')
    expect(stepCross(ax, '2024-08-05', 'ArrowLeft', false)).toBe('2024-08-05')
    expect(stepCross(ax, '2024-08-05', 'ArrowRight', true)).toBe('2024-09-05')
    expect(stepCross(ax, '2024-10-01', 'Home', false)).toBe('2024-08-05')
    expect(stepCross(ax, '2024-10-01', 'End', false)).toBe('2024-12-30')
    expect(stepCross(ax, '2024-10-01', 'KeyA', false)).toBeNull()
  })
  it('基準日からの距離: 日足は営業日、月次の部分は月', () => {
    expect(sinceBase('2024-08-05', '2024-08-09', null)).toEqual({ n: 4, unit: 'day' })
    expect(sinceBase('2020-02-28', '2021-05-31', '2023-10-16')).toEqual({ n: 15, unit: 'month' })
    expect(sinceBase('2020-02-28', '2023-10-17', '2023-10-16').unit).toBe('day')
  })
})

describe('FR-PC7 札の幅・目盛りの間隔（レビューの反映）', () => {
  it('名前を半角の幅で詰める（全角は 2）', () => {
    expect(fitWidth('東京エレクトロン', 10)).toBe('東京エレク')
    expect(fitWidth('TOPIX', 10)).toBe('TOPIX')
    expect(fitWidth('三菱UFJ', 8)).toBe('三菱UFJ')
  })
  it('目盛りの文字は前の文字から gap 以上離れたものだけ出す', () => {
    expect(keepSpaced([0, 30, 60, 130, 150], 56)).toEqual([true, false, true, true, false])
  })
})

describe('FR-PC2 FR-PC3 レビューの反映', () => {
  it('月次の部分では ↑ ↓ PgUp PgDn も月末にそろえて 1 か月・1 年ずつ動く（resolveFrame で戻らない）', () => {
    const A = { id: 'A', s: stitch(days('2023-10-16', '2026-11-13'), months('2010-01', '2026-11')) }
    const go = (d: string, u: 'month' | 'year', dir: 1 | -1) => resolveFrame(stepDate(d, u, dir, true), null, [A]).base
    expect(go('2015-02-27', 'month', 1)).toBe('2015-03-31')
    expect(go('2015-02-27', 'month', -1)).toBe('2015-01-30')
    expect(go('2015-02-27', 'year', 1)).toBe('2016-02-29')
    expect(go('2015-02-27', 'year', -1)).toBe('2014-02-28')
  })
  it('16 年を超えても年率・営業日の数が頭打ちにならない', () => {
    const r = annualized(400, '2006-11-13', '2026-11-13')!
    expect(r).toBeGreaterThan(7)
    expect(r).toBeLessThan(7.4)
    expect(sinceBase('2006-11-13', '2026-11-13', null).n).toBeGreaterThan(4800)
  })
  it('比べる相手も非表示にできる（外さない）', () => {
    expect(pfView({ pfOff: ['JP:1306'], pfBench: ['JP:1306'] }, null).off).toEqual(['JP:1306'])
  })
  it('短い名前が重なるときはコードを添える', () => {
    expect(
      disambiguate([
        { id: 'JP:9984', code: '9984', short: 'ソフトバンク' },
        { id: 'JP:9434', code: '9434', short: 'ソフトバンク' },
        { id: 'JP:7203', code: '7203', short: 'トヨタ自動車' },
      ]),
    ).toEqual({ 'JP:9984': 'ソフトバンク 9984', 'JP:9434': 'ソフトバンク 9434', 'JP:7203': 'トヨタ自動車' })
  })
  it('マウスの位置にいちばん近い日', () => {
    const ax = ['2024-01-04', '2024-01-05', '2024-01-09']
    expect(nearestDay(ax, dayNum('2024-01-08'))).toBe('2024-01-09')
    expect(nearestDay(ax, dayNum('2024-01-06'))).toBe('2024-01-05')
    expect(nearestDay(ax, dayNum('2023-12-01'))).toBe('2024-01-04')
    expect(nearestDay([], 0)).toBeNull()
  })
  it('札の幅: 広いと 168、中くらいで 124、狭いと出さない', () => {
    expect(labelWidth(1000)).toBe(168)
    expect(labelWidth(700)).toBe(124)
    expect(labelWidth(400)).toBe(0)
  })
})

describe('FR-PC7 札と小箱の名前は値の幅を残して詰める（コードレビューの反映）', () => {
  it('値が長い（+1234.5%）ときは名前を短くして、札の幅を超えない', () => {
    // 中くらいの札（124px）の文字の幅は 111px。値 8 文字（約 58px）と空白を残す
    const n = fitLabel('東京エレクトロン', '+1234.5%', 111)
    expect(n).toBe('東京エレ')
    expect(labelPx(n, '+1234.5%')).toBeLessThanOrEqual(111)
    // 広い札（168px）でも、8 文字の名前と 4 桁の % は入りきらない
    const w = fitLabel('東京エレクトロン', '+1234.5%', 155)
    expect(labelPx(w, '+1234.5%')).toBeLessThanOrEqual(155)
    expect(w.length).toBeLessThan(8)
  })
  it('ふつうの値なら名前はそのまま。入らなければ空', () => {
    expect(fitLabel('三菱UFJ', '150.4', 111)).toBe('三菱UFJ')
    expect(fitLabel('東京エレクトロン', '+49.4%', 155)).toBe('東京エレクトロン')
    expect(fitLabel('東京エレクトロン', '+1234.5%', 50)).toBe('')
  })
})
