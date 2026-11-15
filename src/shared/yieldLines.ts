// 目標利回りの線（FR-C12）: 「配当利回りが目標の % になる株価」を、チャート（ChartView）とグリッドのタイル（gridDraw）に点線で引く。
// 株価は過去 12 か月の配当（metrics の div12。実績利回りと同じ値）÷ 目標の利回り。配当は分割調整済みなので、チャートの価格と単位がそろう
import { parseTyped } from './fields'
import type { MetricsRow, Settings } from './types'

/** 設定の画面で打てる目標の数（チャートは数に関係なく全部引く） */
export const YIELD_TARGETS_UI = 3
export const YIELD_MIN = 0.1
export const YIELD_MAX = 30

export interface YieldLine {
  /** 目標の利回り（%） */
  pct: number
  /** その利回りになる株価 */
  price: number
  /** 線のラベル（'4%'） */
  label: string
  /** 今の株価からの差（%）。今の株価が無ければ null */
  gap: number | null
}

/** 目標の利回りになる株価。配当が無い・目標が 0 以下なら null */
export function yieldTargetPrice(div12: number | null | undefined, pct: number): number | null {
  if (div12 == null || !(div12 > 0) || !(pct > 0)) return null
  return div12 / (pct / 100)
}

/** 線のラベル（小数の末尾の 0 は付けない） */
export function yieldLabel(pct: number): string {
  return `${Number(pct.toFixed(2))}%`
}

/**
 * その銘柄に引く線。設定が OFF・配当が無い・上場 12 か月未満（実績利回りが出ない。過去 12 か月の配当がそろっていない）なら引かない。
 * 同じ目標は 1 本にし、利回りの低い順（株価の高い順）に並べる
 */
export function yieldLines(
  m: Pick<MetricsRow, 'div12' | 'yieldTrailing' | 'close'> | undefined,
  s: Pick<Settings, 'yieldLine' | 'yieldTargets'>,
): YieldLine[] {
  if (!s.yieldLine || !m || m.yieldTrailing == null) return []
  const out: YieldLine[] = []
  for (const pct of normalizeTargets(s.yieldTargets)) {
    const price = yieldTargetPrice(m.div12, pct)
    if (price == null) continue
    out.push({ pct, price, label: yieldLabel(pct), gap: m.close ? (price / m.close - 1) * 100 : null })
  }
  return out
}

/** 目盛りの範囲（lo〜hi）に入る線（グリッドのタイルは範囲を広げずに、入る線だけを描く） */
export function linesInRange(lines: YieldLine[], lo: number, hi: number): YieldLine[] {
  return lines.filter((l) => l.price >= lo && l.price <= hi)
}

/** 設定の欄に打った目標を読む（小数・全角・% 付きも。0.1〜30 の外と読めない文字は null）。小数は 2 桁まで */
export function parseYieldTarget(s: string): number | null {
  const v = parseTyped(s)
  if (v == null || v < YIELD_MIN || v > YIELD_MAX) return null
  return Math.round(v * 100) / 100
}

/** 保存する目標（空き・範囲の外・重なりを除いて小さい順） */
export function normalizeTargets(list: readonly (number | null | undefined)[]): number[] {
  const ok = list.filter((v): v is number => v != null && Number.isFinite(v) && v >= YIELD_MIN && v <= YIELD_MAX)
  return [...new Set(ok)].sort((a, b) => a - b)
}

/**
 * 設定の欄（YIELD_TARGETS_UI 個）に打った文字から、保存する目標を作る。読めない欄はその欄だけ除いて空に戻し（texts）、bad で知らせる。
 * 欄の並びは打った順のまま（保存する目標は小さい順）
 */
export function targetsFromInputs(texts: readonly string[]): { targets: number[]; bad: boolean; texts: string[] } {
  let bad = false
  const vals = texts.map((s) => {
    if (!s.trim()) return null
    const v = parseYieldTarget(s)
    if (v == null) bad = true
    return v
  })
  return { targets: normalizeTargets(vals), bad, texts: texts.map((s, i) => (s.trim() && vals[i] == null ? '' : s)) }
}

/** 設定の欄に出す文字（保存した目標を欄の数まで並べ、空きは空） */
export function targetTexts(targets: readonly number[]): string[] {
  return Array.from({ length: YIELD_TARGETS_UI }, (_, i) => (targets[i] != null ? String(targets[i]) : ''))
}
