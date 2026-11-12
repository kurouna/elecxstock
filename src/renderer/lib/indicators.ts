// チャートの指標（FR-C2, C6）。純粋関数。足の数と同じ長さの配列を返し、期間が足りない所は null（描かない。FR-D9）。

export type Series = (number | null)[]

export function sma(x: number[], n: number): Series {
  const out: Series = new Array(x.length).fill(null)
  let s = 0
  for (let i = 0; i < x.length; i++) {
    s += x[i]!
    if (i >= n) s -= x[i - n]!
    if (i >= n - 1) out[i] = s / n
  }
  return out
}
export function ema(x: Series, n: number): Series {
  const out: Series = new Array(x.length).fill(null)
  const k = 2 / (n + 1)
  let prev: number | null = null
  let seed = 0
  let cnt = 0
  for (let i = 0; i < x.length; i++) {
    const v = x[i]
    if (v == null) continue
    if (prev == null) {
      seed += v
      cnt++
      if (cnt === n) {
        prev = seed / n
        out[i] = prev
      }
      continue
    }
    prev = v * k + prev * (1 - k)
    out[i] = prev
  }
  return out
}
/** ボリンジャーバンド（既定 20 本・±2σ） */
export function bollinger(c: number[], n = 20, k = 2): { mid: Series; up: Series; lo: Series } {
  const mid = sma(c, n)
  const up: Series = new Array(c.length).fill(null)
  const lo: Series = new Array(c.length).fill(null)
  for (let i = n - 1; i < c.length; i++) {
    const m = mid[i]!
    let v = 0
    for (let j = i - n + 1; j <= i; j++) v += (c[j]! - m) ** 2
    const sd = Math.sqrt(v / n)
    up[i] = m + k * sd
    lo[i] = m - k * sd
  }
  return { mid, up, lo }
}
const hl = (h: number[], l: number[], i: number, n: number) => {
  if (i < n - 1) return null
  let hi = -Infinity
  let lw = Infinity
  for (let j = i - n + 1; j <= i; j++) {
    if (h[j]! > hi) hi = h[j]!
    if (l[j]! < lw) lw = l[j]!
  }
  return (hi + lw) / 2
}
/**
 * 一目均衡表（9・26・52）。先行スパンは 26 本先に描くので、足の数 + 26 の長さで返す（未来の分は時刻を外挿する）。
 * 遅行スパンは終値を 26 本前に描く
 */
export function ichimoku(
  h: number[],
  l: number[],
  c: number[],
): { tenkan: Series; kijun: Series; spanA: Series; spanB: Series; chikou: Series } {
  const n = c.length
  const tenkan: Series = c.map((_, i) => hl(h, l, i, 9))
  const kijun: Series = c.map((_, i) => hl(h, l, i, 26))
  const spanA: Series = new Array(n + 26).fill(null)
  const spanB: Series = new Array(n + 26).fill(null)
  for (let i = 0; i < n; i++) {
    const a = tenkan[i]
    const b = kijun[i]
    if (a != null && b != null) spanA[i + 26] = (a + b) / 2
    spanB[i + 26] = hl(h, l, i, 52)
  }
  const chikou: Series = new Array(n).fill(null)
  for (let i = 26; i < n; i++) chikou[i - 26] = c[i]!
  return { tenkan, kijun, spanA, spanB, chikou }
}
/** MACD（12・26・9） */
export function macd(c: number[], f = 12, s = 26, sig = 9): { macd: Series; signal: Series; hist: Series } {
  const a = ema(c, f)
  const b = ema(c, s)
  const m: Series = c.map((_, i) => (a[i] != null && b[i] != null ? a[i]! - b[i]! : null))
  const sg = ema(m, sig)
  return { macd: m, signal: sg, hist: m.map((v, i) => (v != null && sg[i] != null ? v - sg[i]! : null)) }
}
/** RSI（Wilder、14） */
export function rsiSeries(c: number[], n = 14): Series {
  const out: Series = new Array(c.length).fill(null)
  if (c.length <= n) return out
  let g = 0
  let l = 0
  for (let i = 1; i <= n; i++) {
    const d = c[i]! - c[i - 1]!
    g += Math.max(d, 0)
    l += Math.max(-d, 0)
  }
  g /= n
  l /= n
  out[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l)
  for (let i = n + 1; i < c.length; i++) {
    const d = c[i]! - c[i - 1]!
    g = (g * (n - 1) + Math.max(d, 0)) / n
    l = (l * (n - 1) + Math.max(-d, 0)) / n
    out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l)
  }
  return out
}
/** ストキャスティクス（スロー、14・3・3）: %K（= ファスト %D）と %D */
export function stochastic(h: number[], l: number[], c: number[], n = 14, k = 3, d = 3): { k: Series; d: Series } {
  const fast: Series = c.map((v, i) => {
    if (i < n - 1) return null
    let hi = -Infinity
    let lw = Infinity
    for (let j = i - n + 1; j <= i; j++) {
      hi = Math.max(hi, h[j]!)
      lw = Math.min(lw, l[j]!)
    }
    return hi > lw ? ((v - lw) / (hi - lw)) * 100 : 50
  })
  const avg = (x: Series, m: number): Series =>
    x.map((_, i) => {
      if (i < m - 1) return null
      let s = 0
      for (let j = i - m + 1; j <= i; j++) {
        if (x[j] == null) return null
        s += x[j]!
      }
      return s / m
    })
  const kk = avg(fast, k)
  return { k: kk, d: avg(kk, d) }
}
/** 比較表示（FR-C7）: 表示の始点を 0% とした騰落率 */
export function rebase(c: Series, from: number): Series {
  const base = c[from] ?? c.find((v) => v != null) ?? null
  return c.map((v) => (v != null && base ? (v / base - 1) * 100 : null))
}
