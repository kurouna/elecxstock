// ポインタと位置の換算（FR-V10 の表示倍率）。表示倍率はルートの CSS の zoom で掛けているので、
// getBoundingClientRect・clientX は倍率が掛かった px、clientWidth・offsetWidth・style の px は掛かっていない。
// 混ぜると倍率が 100% 以外でずれるので、どちらかにそろえてから計算する（例: pages.ts の menuPosition）

/** ルートの zoom（表示倍率 × 窓ごとの倍率） */
export const rootZoom = (): number => Number(document.documentElement.style.zoom) || 1

/** ポインタの x を、要素の中の CSS の px（倍率を割り戻した値。clientWidth と同じ単位）にする */
export function localX(clientX: number, rect: { left: number; width: number }, cssWidth: number): number {
  return rect.width > 0 ? ((clientX - rect.left) * cssWidth) / rect.width : 0
}

/**
 * 図の中の説明（position: absolute）の左の位置（CSS の px）。十字線 cx の右に収まれば右、だめなら左、
 * どちらにも収まらなければ図の右の端に寄せる（狭いカードで切れない）
 */
export function tipAside(cx: number, tipWidth: number, width: number, gap = 10): number {
  if (cx + gap + tipWidth <= width) return cx + gap
  if (cx - gap - tipWidth >= 0) return cx - gap - tipWidth
  return Math.max(0, width - tipWidth)
}
/** 要素の右に出す説明（position: fixed）の位置（CSS の px）。`anchor` は getBoundingClientRect の値。窓の右からはみ出さない */
export function tipBeside(
  anchor: { right: number; top: number },
  tipWidth: number,
  viewportWidth: number,
  zoom: number,
  /** 説明の高さ（offsetHeight。CSS の px）と窓の高さ（innerHeight）。渡すと窓の下からはみ出さないよう上に寄せる（上の端は 0） */
  fit?: { height: number; viewportHeight: number },
): { x: number; y: number } {
  const z = zoom > 0 ? zoom : 1
  const y = anchor.top / z - 4
  return {
    x: Math.max(0, Math.min(anchor.right / z + 8, viewportWidth / z - tipWidth)),
    y: fit ? Math.max(0, Math.min(y, fit.viewportHeight / z - fit.height)) : y,
  }
}
/**
 * 区切り線のドラッグ（FR-L1）: 両隣を合わせた幅（span）に対する、ポインタの位置の比（8%〜92%）。pos・start・span はどれも
 * getBoundingClientRect・clientX の px（倍率が掛かったもの同士）。幅が 0 以下（隠れている・縮みきった）なら null（NaN でサイズを壊さない）
 */
export function gutterRatio(pos: number, start: number, span: number): number | null {
  if (!(span > 0)) return null
  return Math.max(0.08, Math.min(0.92, (pos - start) / span))
}
