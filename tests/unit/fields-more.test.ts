// 条件を選ぶダイアログの見直しで足した指標（値はすべて架空。評価日を固定）
import { addDays, isTradingDay } from '@core/calendar'
import { beta, computeMetrics, volatility } from '@core/metrics'
import { computeValue, conditionValid, runScreen } from '@core/screener'
import type { DayBar } from '@core/series'
import { alertConditionOk, splitSensitive } from '@shared/alerts'
import { COMPUTE_KEYS } from '@shared/compute'
import { FIELD_BY_ID, FIELD_GROUPS, FIELDS, moneyScale, refFields, usable } from '@shared/fields'
import { epochDay, nextRightsDates, recordDayOf } from '@shared/rights'
import type { Instrument, MetricsRow, Quote } from '@shared/types'
import { describe, expect, it } from 'vitest'

function days(from: string, to: string, f: (i: number) => number): DayBar[] {
  const out: DayBar[] = []
  let i = 0
  for (let d = from; d <= to; d = addDays(d, 1))
    if (isTradingDay(d)) {
      const c = f(i++)
      out.push({ d, o: c, h: c * 1.01, l: c * 0.99, c, v: 1000 })
    }
  return out
}
const quote = (q: Partial<Quote>) => q as unknown as Quote

describe('最低投資金額・ROE', () => {
  const bars = days('2025-01-06', '2026-11-13', () => 1234)
  const q = quote({ eps: 120, bps: 1000 })
  it('株式は 100 株・REIT は 1 口。ETF は単位が分からないので欠損', () => {
    expect(computeMetrics('JP:1', bars, [], [], q, '2026-11-13', undefined, { kind: 'stock' }).minInvest).toBe(123400)
    expect(computeMetrics('JP:2', bars, [], [], q, '2026-11-13', undefined, { kind: 'reit' }).minInvest).toBe(1234)
    expect(computeMetrics('JP:3', bars, [], [], q, '2026-11-13', undefined, { kind: 'etf' }).minInvest).toBeNull()
  })
  it('ROE = EPS ÷ BPS（株式だけ。0 以下は欠損）', () => {
    expect(computeMetrics('JP:1', bars, [], [], q, '2026-11-13', undefined, { kind: 'stock' }).roe).toBeCloseTo(12)
    expect(computeMetrics('JP:2', bars, [], [], q, '2026-11-13', undefined, { kind: 'reit' }).roe).toBeNull()
    const neg = quote({ eps: -5, bps: 1000 })
    expect(computeMetrics('JP:1', bars, [], [], neg, '2026-11-13', undefined, { kind: 'stock' }).roe).toBeNull()
  })
})

describe('配当の増減率', () => {
  it('前年比と 5 年の年率（年の合計。評価日の年は途中なので前年まで）', () => {
    const bars = days('2018-01-04', '2024-10-31', () => 1000)
    // 年の合計: 2018 = 10, 2019 = 12, … 2023 = 20
    const dividends = [2018, 2019, 2020, 2021, 2022, 2023, 2024].flatMap((y) => [
      { date: `${y}-03-28`, amount: 5 + (y - 2018) },
      { date: `${y}-09-27`, amount: 5 + (y - 2018) },
    ])
    const m = computeMetrics('JP:1', bars, dividends, [], null, '2024-10-31')
    expect(m.divYoy).toBeCloseTo((20 / 18 - 1) * 100)
    expect(m.divCagr5).toBeCloseTo(((20 / 10) ** (1 / 5) - 1) * 100)
  })
  it('記録の最初の年（年の途中から）は比べない', () => {
    const bars = days('2022-06-01', '2024-10-31', () => 1000)
    const dividends = [2022, 2023].map((y) => ({ date: `${y}-09-27`, amount: 10 }))
    const m = computeMetrics('JP:1', bars, dividends, [], null, '2024-10-31')
    expect(m.divYoy).toBeNull()
    expect(m.divCagr5).toBeNull()
  })
})

describe('年初来', () => {
  it('1〜3 月は昨年来の高値・安値。騰落率は前年最後の終値から', () => {
    const bars = days('2024-01-04', '2026-02-13', (i) => 100 + i)
    const m = computeMetrics('JP:1', bars, [], [], null, '2026-02-13')
    const since = bars.filter((b) => b.d >= '2025-01-01')
    const close = bars.at(-1)!.c
    expect(m.ytdFromHi).toBeCloseTo((close / Math.max(...since.map((b) => b.h)) - 1) * 100)
    expect(m.ytdFromLo).toBeCloseTo((close / Math.min(...since.map((b) => b.l)) - 1) * 100)
    const prev = bars.filter((b) => b.d < '2026-01-01').at(-1)!.c
    expect(m.retYtd).toBeCloseTo((close / prev - 1) * 100)
  })
  it('起点より後に上場した銘柄は欠損', () => {
    const m = computeMetrics(
      'JP:1',
      days('2025-06-02', '2026-02-13', () => 100),
      [],
      [],
      null,
      '2026-02-13',
    )
    expect(m.ytdFromHi).toBeNull()
    expect(m.ytdFromLo).toBeNull()
  })
})

describe('リスク', () => {
  it('ボラティリティ: 動かなければ 0、61 本未満は欠損', () => {
    expect(volatility(days('2026-01-05', '2026-11-13', () => 500))).toBe(0)
    expect(volatility(days('2026-10-01', '2026-11-13', () => 500))).toBeNull()
    const zig = days('2026-01-05', '2026-11-13', (i) => (i % 2 ? 101 : 100))
    expect(volatility(zig)).toBeGreaterThan(10)
  })
  it('ベータ: 日付で突き合わせる。日経平均の 2 倍動けば 2、組が 120 未満なら欠損', () => {
    const idx = days('2025-06-02', '2026-11-13', (i) => 30000 * (1 + 0.01 * Math.sin(i / 3)))
    const bars: DayBar[] = []
    for (let i = 0; i < idx.length; i++) {
      const r = i ? idx[i]!.c / idx[i - 1]!.c - 1 : 0
      const c = i ? bars[i - 1]!.c * (1 + 2 * r) : 1000
      bars.push({ ...idx[i]!, c })
    }
    const index = new Map(idx.map((b) => [b.d, b.c]))
    expect(beta(bars, index)).toBeCloseTo(2, 6)
    // 売買停止で日足が飛んでも、日付で合わせるのでずれない
    const gap = bars.filter((_, i) => i % 10 !== 5)
    expect(beta(gap, index)).toBeCloseTo(2, 1)
    expect(beta(bars, new Map(idx.slice(-100).map((b) => [b.d, b.c])))).toBeNull()
    expect(beta(bars, undefined)).toBeNull()
  })
  it('3 年の最大下落率（配当込み）: 200 → 120 で −40%', () => {
    const bars = days('2023-11-01', '2026-11-13', (i) => (i < 300 ? 100 + i / 3 : i < 500 ? 200 - (i - 300) * 0.4 : 120 + (i - 500) * 0.1))
    const m = computeMetrics('JP:1', bars, [], [], null, '2026-11-13')
    expect(m.mdd3y).toBeCloseTo(-40, 0)
  })
  it('日足が 700 本に足りなければ最大下落率は欠損', () => {
    const m = computeMetrics(
      'JP:1',
      days('2025-01-06', '2026-11-13', () => 100),
      [],
      [],
      null,
      '2026-11-13',
    )
    expect(m.mdd3y).toBeNull()
  })
})

describe('配当込みの騰落率', () => {
  it('値動きが無くても、1 年に 10 円の配当で約 +11%（100 → 90 に落ちた分を戻す）', () => {
    const bars = days('2025-06-02', '2026-11-13', (i) => (i < 300 ? 100 : 90))
    const ex = bars[300]!.d
    const m = computeMetrics('JP:1', bars, [{ date: ex, amount: 10 }], [], null, '2026-11-13')
    expect(m.ret1y).toBeCloseTo(-10)
    expect(m.tr1y).toBeCloseTo(0, 6)
  })
})

describe('権利確定日の推定（rights.ts）', () => {
  it('権利落ち日の翌営業日が月の最後の営業日なら月末', () => {
    // 2026-03-31（火）が月の最後の営業日 → 権利落ち日は 03-30（月）
    expect(recordDayOf([{ date: '2026-03-30', amount: 10 }])).toBe('end')
  })
  it('20 日に確定する銘柄は 20、休場日なら前の営業日から数える', () => {
    expect(recordDayOf([{ date: '2026-02-19', amount: 10 }])).toBe(20)
    // 2027-02-20 は土曜 → 確定日 02-19（金）、権利付最終日はその 2 営業日前
    const [r] = nextRightsDates([2], '2026-11-15', 1, 20)
    expect(r).toEqual({ month: 2, lastCum: '2027-02-17', ex: '2027-02-18' })
  })
  it('配当の記録が無ければ月末', () => {
    expect(recordDayOf([])).toBe('end')
  })
})

describe('実行時に計算する指標（screener.computeValue）', () => {
  const ins = (code: string, kind: Instrument['kind'], sectorJa: string): Instrument => ({
    id: `JP:${code}`,
    code,
    nameJa: code,
    nameEn: code,
    market: kind === 'reit' ? 'R' : 'P',
    kind,
    sectorJa,
    sectorEn: '',
    status: 'active',
    userAdded: false,
  })
  const instruments = [ins('1', 'stock', '銀行業'), ins('2', 'stock', '銀行業'), ins('3', 'reit', ''), ins('4', 'stock', '小売業')]
  const row = (id: string, close: number, extra: Partial<MetricsRow> = {}) =>
    ({ id, close, div12: 30, earningsDay: null, rightsDay: null, ...extra }) as unknown as MetricsRow
  const metrics = new Map(
    [
      row('JP:1', 1000, { earningsDay: epochDay('2026-11-25'), rightsDay: epochDay('2026-11-10') }),
      row('JP:2', 500),
      row('JP:3', 2000),
      row('JP:4', 800),
    ].map((m) => [m.id as string, m]),
  )
  // 評価額: JP:1 = 300,000 / JP:2 = 100,000 / JP:3 = 100,000（計 500,000）
  const holdings = new Map([
    ['JP:1', { qty: 300, cost: 240000 }],
    ['JP:2', { qty: 200, cost: 120000 }],
    ['JP:3', { qty: 50, cost: 90000 }],
  ])
  const base = { instruments, metrics, favorites: new Set<string>(), watchlists: {}, holdings, today: '2026-11-15' }
  const ids = (field: string, op: '>=' | '<=', value: number) => runScreen({ ...base, conditions: [{ field, op, value }] }).ids

  it('保有割合: 持っていない銘柄は 0%', () => {
    expect(ids('holding.weight', '>=', 60)).toEqual(['JP:1'])
    expect(ids('holding.weight', '<=', 0)).toEqual(['JP:4'])
  })
  it('業種の保有割合: 銀行業 80%・REIT 20%・持っていない業種は 0%', () => {
    expect(ids('holding.sectorWeight', '>=', 80)).toEqual(['JP:1', 'JP:2'])
    expect(ids('holding.sectorWeight', '<=', 20).sort()).toEqual(['JP:3', 'JP:4'])
  })
  it('取得利回り = 過去 12 か月の配当 ÷ 平均取得単価（持っていなければ欠損）', () => {
    const inp = { ...base, conditions: [] }
    expect(computeValue('yoc', instruments[0]!, metrics.get('JP:1')!, inp)).toBeCloseTo((30 / 800) * 100)
    expect(computeValue('yoc', instruments[3]!, metrics.get('JP:4')!, inp)).toBeNull()
  })
  it('予定までの日数: 今日から数え、過ぎた日付は欠損', () => {
    const inp = { ...base, conditions: [] }
    expect(computeValue('earningsDays', instruments[0]!, metrics.get('JP:1')!, inp)).toBe(10)
    expect(computeValue('rightsDays', instruments[0]!, metrics.get('JP:1')!, inp)).toBeNull()
    expect(ids('event.earningsDays', '<=', 14)).toEqual(['JP:1'])
  })
  it('保有が無ければ保有割合は欠損', () => {
    const inp = { ...base, holdings: undefined, conditions: [] }
    expect(computeValue('weight', instruments[0]!, metrics.get('JP:1')!, inp)).toBeNull()
  })
})

describe('相対条件の相手は同じ種類だけ', () => {
  it('終値の相手は価格（時価総額・利回りは出ない）', () => {
    const r = refFields(FIELD_BY_ID.get('price.close')!).map((f) => f.id)
    expect(r).toContain('price.ma200')
    expect(r).not.toContain('value.marketCap')
    expect(r).not.toContain('income.yield')
    expect(refFields(FIELD_BY_ID.get('value.marketCap')!)).toEqual([])
  })
})

// ---------------------------------------------------------------- レビューの指摘（境界値・無効な条件・登録表の整合）

describe('登録表の整合（条件を選ぶダイアログ・実行時の計算）', () => {
  it('使える指標はすべて分類と日英の説明を持つ（分類が無いとダイアログに出ない）', () => {
    const groups = new Set(FIELD_GROUPS.map((g) => g.id))
    for (const f of FIELDS.filter((x) => usable(x))) {
      expect(!!f.group && groups.has(f.group), f.id).toBe(true)
      expect(f.description?.ja && f.description.en, f.id).toBeTruthy()
    }
  })
  it('実行時に計算する指標のキーは、すべて computeValue が知っている', () => {
    for (const f of FIELDS.filter((x) => usable(x) && x.source.kind === 'compute'))
      expect(COMPUTE_KEYS.has((f.source as { key: string }).key), f.id).toBe(true)
  })
  it('金額を打つ単位は表示の単位と同じ（円・万円・億円）', () => {
    const scale: Record<string, number> = { 円: 1, 万円: 1e4, 億円: 1e8 }
    for (const f of FIELDS.filter((x) => usable(x) && x.type === 'money')) expect(moneyScale(f), f.id).toBe(scale[f.unit?.ja ?? ''])
  })
})

describe('無効な条件（FR-SC11）', () => {
  it('相対条件の相手が別の種類（終値 ≥ 時価総額）なら無効。スクリーナーもアラートも', () => {
    const bad = { field: 'price.close', op: '>=' as const, value: 0, ref: 'value.marketCap' }
    const ok = { field: 'price.close', op: '>=' as const, value: 0, ref: 'price.ma75' }
    expect(conditionValid(bad)).toBe(false)
    expect(conditionValid(ok)).toBe(true)
    expect(alertConditionOk(bad)).toBe(false)
    expect(alertConditionOk(ok)).toBe(true)
  })
  it('分割で換算するのは 1 株あたりの金額だけ（売買代金・最低投資金額は換算しない）', () => {
    const c = (field: string) => ({ field, op: '<=' as const, value: 1 })
    expect(splitSensitive(c('price.close'))).toBe(true)
    expect(splitSensitive(c('value.eps'))).toBe(true)
    expect(splitSensitive(c('liq.turnover20'))).toBe(false)
    expect(splitSensitive(c('price.minInvest'))).toBe(false)
  })
  it('保有の記録が無いときの保有の指標は無効にして、残りの条件で走らせる', () => {
    const ins: Instrument = {
      id: 'JP:1',
      code: '1',
      nameJa: '1',
      nameEn: '1',
      market: 'P',
      kind: 'stock',
      sectorJa: '銀行業',
      sectorEn: '',
      status: 'active',
      userAdded: false,
    }
    const r = runScreen({
      conditions: [
        { field: 'holding.weight', op: '>=', value: 0 },
        { field: 'price.close', op: '>=', value: 0 },
      ],
      instruments: [ins],
      metrics: new Map([['JP:1', { id: 'JP:1', close: 100 } as unknown as MetricsRow]]),
      favorites: new Set(),
      watchlists: {},
      holdings: new Map(),
    })
    expect(r.invalid).toEqual([0])
    expect(r.ids).toEqual(['JP:1'])
  })
})

describe('境界値', () => {
  it('ボラティリティ: 60 本は欠損、61 本で出る', () => {
    const bars = days('2026-01-05', '2026-11-13', (i) => 100 + (i % 3))
    expect(volatility(bars.slice(-60))).toBeNull()
    expect(volatility(bars.slice(-61))).not.toBeNull()
  })
  it('ベータ: 突き合わせた組が 119 なら欠損、120 で出る', () => {
    const bars = days('2026-01-05', '2026-11-13', (i) => 100 * (1 + 0.01 * Math.sin(i)))
    const index = new Map(bars.map((b) => [b.d, b.c * 300]))
    expect(beta(bars.slice(-120), index)).toBeNull()
    expect(beta(bars.slice(-121), index)).toBeCloseTo(1, 6)
  })
  it('最大下落率: 699 本は欠損、700 本で出る。配当で落ちた分は下落に数えない', () => {
    const bars = days('2022-01-04', '2026-11-13', () => 0)
      .slice(-700)
      .map((b, i) => {
        const c = i < 200 ? 100 : 90
        return { ...b, o: c, h: c * 1.01, l: c * 0.99, c }
      })
    const ex = [{ date: bars[200]!.d, amount: 10 }]
    const asOf = bars.at(-1)!.d
    expect(computeMetrics('JP:1', bars.slice(1), ex, [], null, asOf).mdd3y).toBeNull()
    expect(computeMetrics('JP:1', bars, ex, [], null, asOf).mdd3y).toBeCloseTo(0, 6)
    expect(computeMetrics('JP:1', bars, [], [], null, asOf).mdd3y).toBeCloseTo(-10, 6)
  })
  it('年初来: 3 月 31 日は昨年来、4 月 1 日から今年', () => {
    const bars = days('2024-01-04', '2026-04-01', () => 100)
    const spike = bars.findIndex((b) => b.d >= '2025-06-02')
    bars[spike] = { ...bars[spike]!, h: 200 }
    const mar = computeMetrics('JP:1', bars.slice(0, -1), [], [], null, '2026-03-31')
    const apr = computeMetrics('JP:1', bars, [], [], null, '2026-04-01')
    expect(mar.ytdFromHi).toBeCloseTo(-50)
    expect(apr.ytdFromHi).toBeCloseTo((100 / 101 - 1) * 100)
  })
  it('年初来: 最初の日足が 1 月 11 日までなら出し、12 日からなら欠損', () => {
    expect(
      computeMetrics(
        'JP:1',
        days('2023-01-11', '2023-06-30', () => 100),
        [],
        [],
        null,
        '2023-06-30',
      ).ytdFromHi,
    ).not.toBeNull()
    expect(
      computeMetrics(
        'JP:1',
        days('2023-01-12', '2023-06-30', () => 100),
        [],
        [],
        null,
        '2023-06-30',
      ).ytdFromHi,
    ).toBeNull()
  })
  it('予定までの日数: 今日なら 0、昨日なら欠損', () => {
    const ins = { id: 'JP:1', kind: 'stock', sectorJa: '' } as Instrument
    const at = (d: string) => ({ earningsDay: epochDay(d), rightsDay: null, recordMonths: [], recordDay: null }) as unknown as MetricsRow
    expect(computeValue('earningsDays', ins, at('2026-11-15'), { today: '2026-11-15' })).toBe(0)
    expect(computeValue('earningsDays', ins, at('2026-11-14'), { today: '2026-11-15' })).toBeNull()
  })
  it('権利付最終日が過ぎたら（次の更新までの間も）、権利確定月から次を出す', () => {
    const ins = { id: 'JP:1', kind: 'stock', sectorJa: '' } as Instrument
    const m = { rightsDay: epochDay('2026-09-28'), recordMonths: [3, 9], recordDay: 0 } as unknown as MetricsRow
    expect(computeValue('rightsDays', ins, m, { today: '2026-09-28' })).toBe(0)
    expect(computeValue('rightsDays', ins, m, { today: '2026-09-29' })).toBe(epochDay('2027-03-29') - epochDay('2026-09-29'))
  })
  it('権利確定日の日を metrics に持つ（月末は 0）', () => {
    const bars = days('2024-01-04', '2026-11-13', () => 1000)
    const m = computeMetrics('JP:1', bars, [{ date: '2026-03-30', amount: 10 }], [], null, '2026-11-13')
    expect(m.recordMonths).toEqual([3])
    expect(m.recordDay).toBe(0)
  })
  it('無配に転じた年の増減配率は −100%（減配の条件から漏らさない）', () => {
    const bars = days('2022-01-04', '2026-11-13', () => 1000)
    const m = computeMetrics('JP:1', bars, [{ date: '2024-03-28', amount: 10 }], [], null, '2026-11-13')
    expect(m.divYoy).toBe(-100)
  })
  it('5 年の増配率: 5 年前が記録の最初の年（年の途中から）なら欠損', () => {
    const bars = days('2020-06-01', '2026-11-13', () => 1000)
    const dividends = [2020, 2021, 2022, 2023, 2024, 2025].map((y) => ({ date: `${y}-09-27`, amount: 10 }))
    expect(computeMetrics('JP:1', bars, dividends, [], null, '2026-11-13').divCagr5).toBeNull()
  })
})
