// 銘柄のドラッグ＆ドロップ: 一覧（ウォッチリスト・スクリーナー・ランキング）の行を、グリッドのタイルやチャートに落とす。
// ピン留めしていないドロワーから引き出したら、落とし先が見えるようにドロワーを帯に畳む（FR-DR7）。
// キーでは同じことを C（タイルの差し替え）と Enter（リンクグループに送る）で行う（FR-KB4）。
import type { InstrumentId } from '@shared/types'
import { t } from '../stores/app.svelte'
import { layout, type PaneNode, saveLayout, setLinkSymbol } from '../stores/layout.svelte'

export const SYMBOL_MIME = 'application/x-elecxstock-symbol'

/** ドラッグ中の銘柄（dragover では dataTransfer の中身を読めないので、ここに持つ） */
let dragging: InstrumentId | null = null

export function startSymbolDrag(e: DragEvent, id: InstrumentId | undefined): void {
  if (!id || !e.dataTransfer) return
  dragging = id
  e.dataTransfer.setData(SYMBOL_MIME, id)
  e.dataTransfer.setData('text/plain', id.replace(/^[A-Z]+:/, ''))
  e.dataTransfer.effectAllowed = 'copy'
  document.body.classList.add('dragging-symbol')
  // ドラッグが始まってから畳む（同じ処理の中で元の要素を隠すと、ドラッグが取り消されることがある）
  setTimeout(() => {
    const side = layout.dockOpen
    if (side && !layout.entry.docks[side]?.pinned) layout.dockOpen = null
  }, 0)
}
export function endSymbolDrag(): void {
  dragging = null
  document.body.classList.remove('dragging-symbol')
  // Esc で取り消したときなどに残った印を消す
  for (const el of document.querySelectorAll<HTMLElement>('[data-drop]')) delete el.dataset.drop
}
export function isSymbolDrag(e: DragEvent): boolean {
  return !!e.dataTransfer?.types.includes(SYMBOL_MIME)
}
export function droppedSymbol(e: DragEvent): InstrumentId | null {
  return (e.dataTransfer?.getData(SYMBOL_MIME) || dragging) ?? null
}

/** チャートのペインに落としたら、そのリンクグループ（リンクの無いペインはそのペイン）の銘柄にする */
export function dropOnChart(pane: PaneNode, id: InstrumentId): void {
  if (pane.link) setLinkSymbol(pane.link, id)
  else {
    layout.doc.links['0'] = id
    saveLayout()
  }
}

/**
 * Svelte のアクション: 銘柄を落とせる場所にする。ドラッグが上にある間は data-drop="on" を付ける（見た目は CSS で）
 * 使い方: <div use:symbolDrop={(id) => ...}>。onDrop が null のときは落とせない。
 * 入れ子のとき（グリッドの枠とタイル）は、いちばん内側だけが反応するように dragenter / dragleave を止める
 */
export function symbolDrop(node: HTMLElement, onDrop: ((id: InstrumentId) => void) | null) {
  let cb = onDrop
  let depth = 0
  const over = (e: DragEvent) => {
    if (!cb || !isSymbolDrag(e)) return
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  }
  const enter = (e: DragEvent) => {
    if (!cb || !isSymbolDrag(e)) return
    e.stopPropagation()
    depth++
    node.dataset.drop = 'on'
    node.dataset.dropLabel = t('drop.here')
  }
  const leave = (e: DragEvent) => {
    if (!cb) return
    e.stopPropagation()
    depth = Math.max(0, depth - 1)
    if (!depth) delete node.dataset.drop
  }
  const drop = (e: DragEvent) => {
    if (!cb || !isSymbolDrag(e)) return
    e.preventDefault()
    e.stopPropagation()
    depth = 0
    delete node.dataset.drop
    const id = droppedSymbol(e)
    endSymbolDrag()
    if (id) cb?.(id)
  }
  node.addEventListener('dragover', over)
  node.addEventListener('dragenter', enter)
  node.addEventListener('dragleave', leave)
  node.addEventListener('drop', drop)
  return {
    update(next: ((id: InstrumentId) => void) | null) {
      cb = next
    },
    destroy() {
      node.removeEventListener('dragover', over)
      node.removeEventListener('dragenter', enter)
      node.removeEventListener('dragleave', leave)
      node.removeEventListener('drop', drop)
    },
  }
}
