// ツリーマップの配置（heatmap。面積 = 時価総額）。squarified の方式で、なるべく正方形に近い長方形に分ける。純粋関数。
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}
export interface Placed<T> extends Rect {
  item: T
}

const worst = (row: number[], side: number, total: number) => {
  const s = row.reduce((a, b) => a + b, 0)
  if (!s || !side) return Number.POSITIVE_INFINITY
  const max = Math.max(...row)
  const min = Math.min(...row)
  const k = (side * side * total) / (s * s)
  return Math.max(k * max, 1 / (k * min))
}

/** 値の大きい順に並べた items を rect の中に敷き詰める（値が 0 以下のものは置かない） */
export function squarify<T>(items: T[], value: (t: T) => number, rect: Rect): Placed<T>[] {
  const xs = items.filter((t) => value(t) > 0).sort((a, b) => value(b) - value(a))
  const total = xs.reduce((s, t) => s + value(t), 0)
  const out: Placed<T>[] = []
  if (!total || rect.w <= 0 || rect.h <= 0) return out
  const scale = (rect.w * rect.h) / total
  let { x, y, w, h } = rect
  let i = 0
  while (i < xs.length) {
    const side = Math.min(w, h)
    const row: T[] = [xs[i]!]
    let areas = [value(xs[i]!) * scale]
    i++
    while (i < xs.length) {
      const next = [...areas, value(xs[i]!) * scale]
      if (worst(next, side, 1) > worst(areas, side, 1)) break
      areas = next
      row.push(xs[i]!)
      i++
    }
    const sum = areas.reduce((a, b) => a + b, 0)
    if (w >= h) {
      // 左に縦の列を置く
      const cw = sum / h
      let yy = y
      row.forEach((t, k) => {
        const hh = areas[k]! / cw
        out.push({ item: t, x, y: yy, w: cw, h: hh })
        yy += hh
      })
      x += cw
      w -= cw
    } else {
      const ch = sum / w
      let xx = x
      row.forEach((t, k) => {
        const ww = areas[k]! / ch
        out.push({ item: t, x: xx, y, w: ww, h: ch })
        xx += ww
      })
      y += ch
      h -= ch
    }
  }
  return out
}

/** 矢印キーで隣の長方形へ（中心どうしの距離が近いもの） */
export function neighbor(rs: Rect[], from: number, dir: 'left' | 'right' | 'up' | 'down'): number {
  const a = rs[from]
  if (!a) return from
  const cx = a.x + a.w / 2
  const cy = a.y + a.h / 2
  let best = from
  let bd = Number.POSITIVE_INFINITY
  rs.forEach((r, i) => {
    if (i === from) return
    const ok = {
      left: r.x + r.w <= a.x + 0.5,
      right: r.x >= a.x + a.w - 0.5,
      up: r.y + r.h <= a.y + 0.5,
      down: r.y >= a.y + a.h - 0.5,
    }[dir]
    if (!ok) return
    const d = Math.hypot(r.x + r.w / 2 - cx, r.y + r.h / 2 - cy)
    if (d < bd) {
      bd = d
      best = i
    }
  })
  return best
}

/** ヒートマップの業種のタイルの名前（業種の無い銘柄は「—」のタイルにまとめる） */
export const sectorTileKey = (sectorJa: string | null | undefined): string => sectorJa || '—'
/** 業種のタイルの銘柄（選んだタイルの銘柄をまとめて送る。pool はタイルに描いた銘柄で、★のみ表示なら★の銘柄だけ。FR-W4） */
export function sectorMembers<T>(pool: readonly T[], key: string, sectorOf: (x: T) => string | null | undefined): T[] {
  return pool.filter((x) => sectorTileKey(sectorOf(x)) === key)
}
