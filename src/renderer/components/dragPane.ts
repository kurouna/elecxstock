// ペインのドラッグ移動（FR-L2）の共通の値
export const DRAG_MIME = 'application/x-elecxstock-pane'
export type DropZone = 'left' | 'right' | 'top' | 'bottom' | 'center'
/** ポインタの位置から落とす場所を決める（端の 25% は分割、真ん中は入れ替え） */
export function zoneOf(e: DragEvent, el: HTMLElement): DropZone {
  const r = el.getBoundingClientRect()
  const x = (e.clientX - r.left) / r.width
  const y = (e.clientY - r.top) / r.height
  const d = Math.min(x, 1 - x, y, 1 - y)
  if (d > 0.25) return 'center'
  if (d === x) return 'left'
  if (d === 1 - x) return 'right'
  return d === y ? 'top' : 'bottom'
}
