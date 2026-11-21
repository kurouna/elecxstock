// ダイアログの中で Tab を折り返す（FR-KB2。docs/design-dialogs.md §10）。重ねた画面（components/overlays/Overlays.svelte）が、
// ダイアログが Tab を自分で扱わなかったとき（preventDefault していないとき）だけ使う。後ろの画面のボタンへフォーカスを出さない

/**
 * Tab の行き先。count は中の止まれる部品の数、prev / next は今のフォーカスより前・後ろにある止まれる部品の数。
 * null はブラウザに任せる（中の次の部品へ移る）、-1 はどこへも動かさない、それ以外は折り返して止まる部品の番号
 */
export function tabWrap(count: number, prev: number, next: number, shift: boolean): number | null {
  if (!count) return -1
  if (shift) return prev > 0 ? null : count - 1
  return next > 0 ? null : 0
}

const FOCUSABLE = 'button, input, select, textarea, a[href], [tabindex]'
/** root の中で Tab が外へ出るなら折り返す */
export function trapTab(e: KeyboardEvent, root: HTMLElement | null | undefined): void {
  if (e.key !== 'Tab' || e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey || !root) return
  const els = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) =>
      el.tabIndex >= 0 &&
      !(el as HTMLButtonElement).disabled &&
      el.getClientRects().length > 0 &&
      getComputedStyle(el).visibility !== 'hidden',
  )
  const at = document.activeElement
  const inRoot = !!at && root.contains(at)
  const prev = inRoot ? els.filter((el) => el !== at && el.compareDocumentPosition(at!) & Node.DOCUMENT_POSITION_FOLLOWING).length : 0
  const next = inRoot ? els.filter((el) => el !== at && at!.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING).length : 0
  const to = tabWrap(els.length, prev, next, e.shiftKey)
  if (to == null) return
  e.preventDefault()
  if (to >= 0) els[to]?.focus()
}

/**
 * ダイアログを押しても、打つ欄（探す欄など）からフォーカスを移さない（mousedown の既定の動きを止める。click は届く）。
 * 見出し・一覧・下の段を押したあとも、打つ・↑↓・Esc（語を消す）がそのまま効くように。打つ欄そのものを押したときは止めない
 */
export function keepFocus(e: MouseEvent): void {
  if (!(e.target as Element | null)?.closest?.('input, textarea, select')) e.preventDefault()
}
