// 同じリンク色のチャート間で十字線・表示期間を合わせるための登録表（FR-K3, K4）
import type { Bars, Timeframe } from '@shared/types'
import type { PaneNode } from '../../stores/layout.svelte'

export interface ChartHandle {
  readonly pane: PaneNode
  tf: () => Timeframe
  bars: () => Bars | null
  /** 十字線をその日付を含む足に置く（null で消す）。受けた側はほかへ送らない */
  show: (time: string | null) => void
  /** 表示期間を合わせる（そろえる設定のチャートだけが受ける）。同じ銘柄・同じ時間軸なので、足の論理番号で合わせる */
  range: (from: number, to: number) => void
}
export const charts = new Set<ChartHandle>()

/**
 * 十字線の知らせをほかのチャートへ送るか。Lightweight Charts の知らせは描き直しのときに非同期に届くので、受け取り中の旗では止められない。
 * マウスで動かした（sourceEvent がある）知らせと、マウスがチャートから出た（時刻も位置も無い）知らせだけを送る。
 * プログラムで置いた十字線（同期の受け取り・キーボード・描画のカーソル）は、置いた側が直接リンク先へ知らせる
 */
export function sendCrosshair(p: { sourceEvent?: unknown; time?: unknown; point?: unknown }): boolean {
  // マウスが出た知らせは時刻も位置も無い。位置があって時刻が無いのは、幅が縮んでプログラムで置いた十字線が余白に当たったとき（送らない）
  return p.sourceEvent != null || (p.time == null && p.point == null)
}

/**
 * 表示期間の送り返しを止める。受けた範囲を覚え、同じ範囲の知らせ（受けたことで起きた変更）は送らない。
 * ライブラリは受けた範囲を幅と足の間隔に直して計算し直すので、端数が 1ulp ほどずれる。足の数で 1/1000 までの違いは同じとみる。
 * 次の知らせで必ず忘れる（受け手がすでに同じ範囲にいて知らせが出なかったとき、あとの利用者の操作の知らせを捨てない）。受け手が足の間隔の下限などで丸めた範囲は、違う範囲として送り元へ返す
 * （受け手が出せる範囲に送り元もそろえる）
 */
export class RangeEcho {
  private last: { from: number; to: number } | null = null
  received(from: number, to: number): void {
    this.last = { from, to }
  }
  shouldSend(from: number, to: number): boolean {
    const l = this.last
    this.last = null
    return !(l && Math.abs(l.from - from) <= 1e-3 && Math.abs(l.to - to) <= 1e-3)
  }
}
