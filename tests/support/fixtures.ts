// テストのフィクスチャ（値はすべて架空）。評価日を引数で受け、テストの結果が今日の日付で変わらないようにする（docs/testing.md）

import type { DayBar } from '@core/series'
import { heldFrom } from '@shared/alerts'
import { addDays, isTradingDay } from '@shared/calendar'
import { TEST_NOW } from '@shared/clock'
import type { ComputeContext } from '@shared/compute'
import { heldStats } from '@shared/compute'
import type { Dividend, Holding, Instrument, InstrumentId, MetricsRow } from '@shared/types'

/** 基準日時の日付（日本時間） */
export const TODAY = TEST_NOW.slice(0, 10)

/** from〜to の営業日の日足。終値は f(何本目か)。高値・安値は ±1% */
export function days(from: string, to: string, f: (i: number) => number): DayBar[] {
  const out: DayBar[] = []
  let i = 0
  for (let d = from; d <= to; d = addDays(d, 1))
    if (isTradingDay(d)) {
      const c = f(i++)
      out.push({ d, o: c, h: c * 1.01, l: c * 0.99, c, v: 1000 })
    }
  return out
}
/** from から n 本の営業日の日足 */
export function bars(from: string, n: number, close: (i: number) => number): DayBar[] {
  const out: DayBar[] = []
  for (let d = from; out.length < n; d = addDays(d, 1))
    if (isTradingDay(d)) {
      const c = close(out.length)
      out.push({ d, o: c, h: c * 1.01, l: c * 0.99, c, v: 1000 + out.length })
    }
  return out
}
/** 毎年の決まった日の配当（years の年ごと） */
export function yearlyDividends(years: number[], mmdd = '09-27', amount: number | ((y: number) => number) = 10): Dividend[] {
  return years.map((y) => ({ date: `${y}-${mmdd}`, amount: typeof amount === 'number' ? amount : amount(y) }))
}

export function instrument(o: Partial<Instrument> & { code: string }): Instrument {
  return {
    id: `JP:${o.code}`,
    nameJa: `架空${o.code}`,
    nameEn: `Fictitious ${o.code}`,
    market: 'P',
    kind: 'stock',
    sectorJa: '銀行業',
    sectorEn: 'Banks',
    status: 'active',
    userAdded: false,
    ...o,
  } as Instrument
}
export function metricsRow(o: Partial<MetricsRow> & { id: InstrumentId }): MetricsRow {
  return { asOf: TODAY, provisional: false, gapSuspect: false, anomaly: false, close: 1000, ...o } as MetricsRow
}
export function holding(o: Partial<Holding> & { code: string }): Holding {
  return { account: 'tokutei', quantity: 100, avgCost: 1000, ...o } as Holding
}
/** 実行時の計算の材料（保有・保有の合計・今日） */
export function computeContext(
  holdings: Holding[],
  metrics: Map<string, MetricsRow>,
  instruments: Map<string, Instrument>,
  today = TODAY,
): ComputeContext {
  const h = heldFrom(holdings)
  return {
    today,
    ...(h.size
      ? {
          holdings: h,
          held: heldStats(
            h,
            (id) => metrics.get(id),
            (id) => instruments.get(id),
          ),
        }
      : {}),
  }
}

/**
 * 境界の組（docs/test-plan.md §3.1）。差分のテストはこれらすべてで回す。
 * 評価日はどれも 2026-11-13（TODAY）
 */
export const EDGE_SETS: { name: string; bars: DayBar[]; dividends: Dividend[] }[] = [
  {
    name: '10 年・毎年増配',
    bars: days('2016-11-14', TODAY, () => 1000),
    dividends: yearlyDividends([2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026], '09-27', (y) => 10 + (y - 2016)),
  },
  {
    name: '保存期間 5 年（日足より前の配当の記録あり）',
    bars: days('2021-11-15', TODAY, () => 1000),
    dividends: yearlyDividends([2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026], '03-27', (y) => 10 + (y - 2016)),
  },
  {
    name: '上場 5 年未満（年の途中から）',
    bars: days('2023-06-01', TODAY, () => 1000),
    dividends: yearlyDividends([2023, 2024, 2025, 2026], '09-27', 12),
  },
  {
    name: '無配に転じた',
    bars: days('2019-01-04', TODAY, () => 1000),
    dividends: yearlyDividends([2019, 2020, 2021, 2022, 2023, 2024], '03-27', 20),
  },
  { name: '配当の記録が無い', bars: days('2019-01-04', TODAY, () => 1000), dividends: [] },
]
