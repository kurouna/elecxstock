// チャートの下の段（RSI・MACD・ストキャスティクス。FR-C6）と凡例（FR-C3）の見せ方。ChartView が使う関数。
import { cls, fmt, px } from './format'
import type { Series } from './indicators'

/** 下の段の指標の値の桁の種類。osc は 0〜100 の値（RSI・ストキャスティクス）、diff は株価の差（MACD・Signal・ヒストグラム） */
export type DigitsKind = 'osc' | 'diff'

/** 下の段の凡例と目盛りの桁。priceDigits は本体の目盛りの株価の桁。差は株価より 1 桁細かく、0〜100 の値は小数 1 桁 */
export function indicatorDigits(kind: DigitsKind, priceDigits: number): number {
  return kind === 'osc' ? 1 : priceDigits + 1
}

/** Lightweight Charts の目盛りの桁 */
export function priceFormat(digits: number): { type: 'price'; precision: number; minMove: number } {
  return { type: 'price', precision: digits, minMove: 10 ** -digits }
}

/**
 * MACD のヒストグラムの色の段階: 0 より上（up）か下（down）か、と、0 から離れていく（強い）か近づいていく（Weak）か。
 * 前の値が無いとき・0 をまたいだときは強いとする
 */
export type HistTone = 'up' | 'upWeak' | 'down' | 'downWeak'
export function histTone(v: number, prev: number | null | undefined): HistTone {
  const crossed = prev != null && v >= 0 !== prev >= 0
  const grow = prev == null || crossed || Math.abs(v) >= Math.abs(prev)
  if (v >= 0) return grow ? 'up' : 'upWeak'
  return grow ? 'down' : 'downWeak'
}

/** 色に不透明度を付ける（#rgb・#rrggbb）。読めない色はそのまま返す */
export function withAlpha(color: string, a: number): string {
  const c = color.trim()
  const m3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(c)
  const hex = m3 ? `#${m3[1]}${m3[1]}${m3[2]}${m3[2]}${m3[3]}${m3[3]}` : /^#[0-9a-f]{6}$/i.test(c) ? c : null
  if (!hex) return c
  const x = Math.round(Math.min(1, Math.max(0, a)) * 255)
  return `${hex}${x.toString(16).padStart(2, '0')}`
}

/**
 * 段の高さの割合（上から本体・下の段の順）。下の段は 1 つなら 25%、増えたら合計 50% に収める。
 * 割合で持つので、ペインの大きさが変わっても保つ
 */
export function stretchFactors(subCount: number): number[] {
  if (subCount <= 0) return [1]
  const share = Math.min(0.25, 0.5 / subCount)
  return [1 - share * subCount, ...new Array<number>(subCount).fill(share)]
}

/** 段ごとの上端（px）。heights は上から順の段の高さ、sep は段の区切りの太さ（Lightweight Charts は 1px） */
export function paneTops(heights: number[], sep = 1): number[] {
  const out: number[] = []
  let y = 0
  for (const h of heights) {
    out.push(y)
    y += h + sep
  }
  return out
}

/**
 * 凡例に出す線（名前・色・値の配列・段・桁）。label が空なら名前を出さず値だけ（線が 1 本の段）。
 * digits が無いものは値の大きさで桁を決める（px）。signColor は値の符号で上げ・下げの色にする（MACD のヒストグラム）
 */
export interface LegendLine {
  label: string
  color: string
  values: Series
  pane: number
  digits?: number
  signColor?: boolean
}
export interface LegendValue {
  label: string
  color: string | undefined
  cls: string
  text: string
}
export function legendValue(x: LegendLine, i: number): LegendValue {
  const v = x.values[i] ?? null
  return {
    label: x.label,
    color: x.signColor ? undefined : x.color,
    cls: x.signColor ? cls(v) : '',
    text: v == null ? '—' : x.digits != null ? fmt(v, x.digits) : px(v),
  }
}

/** 凡例を段ごとに分ける: 本体（段 0）の値と、下の段ごとの名前と値（titles は段の番号 → 名前） */
export function legendByPane(
  lines: LegendLine[],
  titles: Record<number, string>,
  i: number,
): { main: LegendValue[]; subs: { pane: number; title: string; vals: LegendValue[] }[] } {
  const of = (p: number) => lines.filter((x) => x.pane === p).map((x) => legendValue(x, i))
  return {
    main: of(0),
    subs: Object.entries(titles)
      .map(([p, title]) => ({ pane: Number(p), title, vals: of(Number(p)) }))
      .sort((a, b) => a.pane - b.pane),
  }
}
