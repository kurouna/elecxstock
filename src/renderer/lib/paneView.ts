// ペインの表示の切り替え（ヒートマップ ⇔ 株価ボード。docs/design-quote-board.md §6・FR-QB1）。
// 切り替えられる側のペイン（Heatmap.svelte・QuoteBoard.svelte）は、このファイルを import しない。HeatmapPane.svelte が
// wrapApi（V キーを足す包み）と more（「⋯」のメニューの項目）を props で渡す
import { composing } from './keys'
import type { PaneApi } from './panes'

export type ViewId = 'map' | 'board'
export const VIEWS: readonly ViewId[] = ['map', 'board']

/** V キー（修飾なし。IME の変換中は除く）か */
export const isViewKey = (
  e: Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'altKey' | 'metaKey' | 'shiftKey' | 'isComposing' | 'keyCode'>,
): boolean => e.code === 'KeyV' && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey && !composing(e)

export const otherView = (v: ViewId): ViewId => (v === 'map' ? 'board' : 'map')

/**
 * ペインの API に V キー（表示の切り替え）を足す。V だけを先に取り、ほかのキーと API のほかの項目は元のまま渡す。
 * toggle は表示を切り替える関数（patchState で qbView を書く。呼び出し側が持つ）
 */
export function withViewSwitch(api: PaneApi, toggle: () => void): PaneApi {
  return {
    ...api,
    key(e) {
      if (isViewKey(e)) {
        toggle()
        return true
      }
      return api.key?.(e) ?? false
    },
  }
}
