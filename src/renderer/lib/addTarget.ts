// 銘柄ジャンプ・コマンドバーで「足す先」（PaneApi.addTarget。ウォッチリスト・パフォーマンス比較）をどう扱うか（docs/design-perf.md §5.1）。
// Jump.svelte と Palette.svelte はここで決め、足す先の種類で分岐を書かない
import type { AddTarget } from './panes'

/** Enter・Ctrl+Enter（と行のクリック＝Enter）ですること: 表示する・足す・何もしない */
export function enterAction(t: AddTarget | null | undefined, ctrl: boolean): 'show' | 'add' | 'none' {
  if (ctrl) return t ? 'add' : 'none'
  return t?.primary ? 'add' : 'show'
}
/** 候補の行の「＋ 足す先」のボタン（出さないときは null）。ctrlHint は下の段に Ctrl+Enter の案内を出すか（Enter で足す先には出さない） */
export function addButton(t: AddTarget | null | undefined): { label: string; title: string; full: boolean; ctrlHint: boolean } | null {
  if (!t || t.quiet) return null
  const full = !!t.full
  return { label: t.label, title: full ? (t.fullTitle ?? t.title) : t.title, full, ctrlHint: !t.primary }
}
