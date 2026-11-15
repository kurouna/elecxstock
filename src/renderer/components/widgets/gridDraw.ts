// chart-grid のタイルの描画（FR-G3, G8, G9）。30 枚を速く描くため、チャートライブラリではなく 2D Canvas に直接描く。
import type { Bars, Timeframe } from '@shared/types'
import { linesInRange, type YieldLine } from '@shared/yieldLines'

export interface TileOpts {
  tf: Timeframe
  scale: 0 | 1 | 2 // 通常・対数・比較%
  ma: boolean
  hoverDate: string | null
  /** 目標利回りの線（FR-C12）。目盛りの範囲に入るものだけを描く */
  yields?: YieldLine[]
  fmtPx: (v: number) => string
  fmtPct: (v: number) => string
}
const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim()
const MA: Record<Timeframe, number[]> = { D: [25, 75], W: [13, 26], M: [12, 24] }

/** タイルを描く。描いた目標利回りの線のラベルを返す（E2E が canvas の data-yield で確かめる） */
export function drawTile(cv: HTMLCanvasElement, b: Bars | undefined, all: Bars | undefined, o: TileOpts): string[] {
  const r = cv.getBoundingClientRect()
  const dpr = devicePixelRatio
  if (!r.width || !r.height) return []
  cv.width = Math.round(r.width * dpr)
  cv.height = Math.round(r.height * dpr)
  const g = cv.getContext('2d')!
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  g.clearRect(0, 0, r.width, r.height)
  if (!b || b.time.length < 2) return []
  const n = b.time.length
  const W = r.width - 48
  const H = r.height
  const top = 6
  const volH = Math.round(H * 0.16)
  const ph = H - top - volH - 4
  const up = css('--up')
  const down = css('--down')
  const norm = o.scale === 2
  const log = o.scale === 1
  const base = b.close[0]!
  const val = (v: number) => (norm ? (v / base - 1) * 100 : v)
  let hi = Number.NEGATIVE_INFINITY
  let lo = Number.POSITIVE_INFINITY
  for (let i = 0; i < n; i++) {
    hi = Math.max(hi, val(norm ? b.close[i]! : b.high[i]!))
    lo = Math.min(lo, val(norm ? b.close[i]! : b.low[i]!))
  }
  if (norm) {
    hi = Math.max(hi, 0)
    lo = Math.min(lo, 0)
  }
  const pad = (hi - lo) * 0.06 || 1
  hi += pad
  lo -= pad
  if (log && lo <= 0) lo = Math.max(1e-6, Math.min(...b.low) * 0.98)
  const f = (v: number) => (log ? Math.log(v) : v)
  const y = (v: number) => top + ((f(hi) - f(val(v))) / (f(hi) - f(lo))) * ph
  const yv = (v: number) => top + ((f(hi) - f(v)) / (f(hi) - f(lo))) * ph
  const step = W / n
  const x = (i: number) => i * step + step / 2
  g.font = `10px ${css('--mono')}`
  // 目盛り: 対数のときは対数の空間で等分する
  for (let k = 0; k <= 3; k++) {
    const vv = log ? Math.exp(f(lo) + ((f(hi) - f(lo)) * k) / 3) : lo + ((hi - lo) * k) / 3
    const yy = yv(vv)
    g.strokeStyle = css('--chart-grid')
    g.lineWidth = 1
    g.beginPath()
    g.moveTo(0, Math.round(yy) + 0.5)
    g.lineTo(W, Math.round(yy) + 0.5)
    g.stroke()
    g.fillStyle = css('--text-3')
    g.fillText(norm ? o.fmtPct(vv) : o.fmtPx(vv), W + 4, Math.min(H - volH - 2, Math.max(10, yy + 3)))
  }
  let vmax = 0
  for (const v of b.volume) vmax = Math.max(vmax, v)
  for (let i = 0; i < n; i++) {
    const hh = vmax ? (b.volume[i]! / vmax) * volH : 0
    g.fillStyle = i && b.close[i]! < b.close[i - 1]! ? css('--vol-down') : css('--vol-up')
    g.fillRect(x(i) - Math.max(0.5, step * 0.35), H - hh, Math.max(1, step * 0.7), hh)
  }
  if (norm) {
    const zy = yv(0)
    g.setLineDash([3, 3])
    g.strokeStyle = css('--line-strong')
    g.beginPath()
    g.moveTo(0, zy)
    g.lineTo(W, zy)
    g.stroke()
    g.setLineDash([])
    g.strokeStyle = val(b.close[n - 1]!) >= 0 ? up : down
    g.lineWidth = 1.5
    g.beginPath()
    for (let i = 0; i < n; i++) (i ? g.lineTo : g.moveTo).call(g, x(i), y(b.close[i]!))
    g.stroke()
  } else {
    for (let i = 0; i < n; i++) {
      const o2 = b.open[i]!
      const c = b.close[i]!
      const col = c >= o2 ? up : down
      g.strokeStyle = col
      g.fillStyle = col
      g.lineWidth = 1
      const X = Math.round(x(i)) + 0.5
      g.beginPath()
      g.moveTo(X, y(b.high[i]!))
      g.lineTo(X, y(b.low[i]!))
      g.stroke()
      const t = y(Math.max(o2, c))
      const bt = y(Math.min(o2, c))
      g.fillRect(Math.round(x(i) - step * 0.35), t, Math.max(1, Math.round(step * 0.7)), Math.max(1, bt - t))
    }
    if (o.ma && all) {
      MA[o.tf].forEach((p, k) => {
        // 移動平均は表示期間より前の足も使って計算する
        const idx = new Map(all.time.map((tm, i) => [tm, i]))
        g.strokeStyle = css(k ? '--ma3' : '--ma2')
        g.lineWidth = 1
        g.beginPath()
        let started = false
        for (let i = 0; i < n; i++) {
          const j = idx.get(b.time[i]!)
          if (j == null || j < p - 1) continue
          let s = 0
          for (let q = j - p + 1; q <= j; q++) s += all.close[q]!
          const yy = y(s / p)
          if (started) g.lineTo(x(i), yy)
          else g.moveTo(x(i), yy)
          started = true
        }
        g.stroke()
      })
    }
  }
  // 目標利回りの線（FR-C12）: 比較% の目盛りでは引かない。範囲は広げず、入る線だけを点線とラベルで描く
  const drawn = norm ? [] : linesInRange(o.yields ?? [], lo, hi)
  if (drawn.length) {
    const col = css('--yield-line')
    g.strokeStyle = col
    g.fillStyle = col
    g.lineWidth = 1
    g.setLineDash([4, 3])
    for (const l of drawn) {
      const yy = Math.round(yv(l.price)) + 0.5
      g.beginPath()
      g.moveTo(0, yy)
      g.lineTo(W, yy)
      g.stroke()
    }
    g.setLineDash([])
    // ラベルは右の目盛りの欄に、線の色の地で出す（チャートの軸のラベルと同じ形。最新の足に重ねない）
    const panel = css('--panel')
    for (const l of drawn) {
      const yy = Math.round(yv(l.price))
      const tw = g.measureText(l.label).width + 6
      g.fillStyle = col
      g.fillRect(W + 1, yy - 7, tw, 13)
      g.fillStyle = panel
      g.fillText(l.label, W + 4, yy + 3)
    }
  }
  if (o.hoverDate) {
    let k = -1
    for (let i = 0; i < n; i++) {
      if (b.time[i]! <= o.hoverDate) k = i
      else break
    }
    if (k >= 0) {
      g.strokeStyle = css('--chart-cross')
      g.setLineDash([2, 2])
      g.beginPath()
      g.moveTo(Math.round(x(k)) + 0.5, 0)
      g.lineTo(Math.round(x(k)) + 0.5, H)
      g.stroke()
      g.setLineDash([])
      g.fillStyle = css('--panel')
      g.fillRect(4, H - volH - 16, 170, 14)
      g.fillStyle = css('--text-2')
      g.fillText(
        `${b.time[k]!.replaceAll('-', '/')}  ${o.fmtPx(b.close[k]!)}  ${o.fmtPct((b.close[k]! / base - 1) * 100)}`,
        6,
        H - volH - 5,
      )
    }
  }
  return drawn.map((l) => l.label)
}
