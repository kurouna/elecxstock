/**
 * いまキーボードとポインタのどちらで操作しているかを <html data-input> に出す（FR-KB3）。
 * ペイン・タイルのフォーカスの枠は、:focus-visible と同じく、キーで操作しているときだけ出す。
 * 修飾キーだけの押下（Ctrl・Shift・Alt・Meta）では切り替えない（Ctrl+クリックなどのため）。
 */
const MODIFIERS = new Set(['Control', 'Shift', 'Alt', 'Meta'])

export function trackInputMode(root: HTMLElement = document.documentElement): () => void {
  const set = (v: 'keyboard' | 'pointer') => {
    if (root.dataset.input !== v) root.dataset.input = v
  }
  const onKey = (e: KeyboardEvent) => {
    if (!MODIFIERS.has(e.key)) set('keyboard')
  }
  const onPointer = () => set('pointer')
  set('pointer')
  window.addEventListener('keydown', onKey, true)
  window.addEventListener('pointerdown', onPointer, true)
  return () => {
    window.removeEventListener('keydown', onKey, true)
    window.removeEventListener('pointerdown', onPointer, true)
  }
}
