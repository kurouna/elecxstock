// タイトルバー（トップバー）の右端に空ける幅（FR-L13）。最小化・最大化・閉じるボタン（Electron の titleBarOverlay）は
// 窓の右端に OS の大きさで描かれ、文字の大きさ（ルートの CSS zoom）では変わらない。窓から読んだ幅を、トップバーの CSS の px に直す

/** Window Controls Overlay が読めないとき（titleBarOverlay の無い環境など）の、閉じるボタンなどの幅（CSS の px。倍率 1 のとき） */
export const CAPTION_FALLBACK = 138

/**
 * 閉じるボタンなどの幅を、倍率 zoom のかかったトップバーの CSS の px で返す。
 * viewportWidth は窓の中身の幅（window.innerWidth）、area は navigator.windowControlsOverlay.getTitlebarAreaRect()（どちらも倍率のかからない px）。
 * 読めないとき・おかしい値（テストの表示域のエミュレーションで窓と食い違うなど）のときは CAPTION_FALLBACK を倍率で割った値
 */
export function captionInset(viewportWidth: number, area: { x: number; width: number } | null, zoom: number): number {
  const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1
  const w = area ? viewportWidth - (area.x + area.width) : Number.NaN
  const px = Number.isFinite(w) && w >= 40 && w <= 400 ? w : CAPTION_FALLBACK
  return Math.ceil(px / z)
}
