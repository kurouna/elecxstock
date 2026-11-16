// マイレイアウトのページの操作（FR-L14。docs/design-mylayouts.md §3.2〜§3.4）: メニュー（components/overlays/Layouts.svelte）・
// コマンドバー・キーから使う。ダイアログとトーストはここ、ページの木の変更は stores/layout.svelte.ts
import type { SavedLayout } from '@shared/types'
import { app, choiceDialog, promptDialog, t, toast } from '../stores/app.svelte'
import {
  addPage,
  copyToPage,
  currentPage,
  duplicatePage,
  layout,
  openablePages,
  PAGES_MAX,
  type PageRefusal,
  pageName,
  removePage,
  renamePage,
  setPage,
  shapeEntry,
  undoRemovePage,
} from '../stores/layout.svelte'
import type { Key } from './i18n'
import { IS_FREE } from './windowSlot'

/** メニューの行: ページ（番号は 1〜9 だけ）と、操作 */
export type MenuRow =
  | { kind: 'page'; page: SavedLayout; n: number | null }
  | { kind: 'new' | 'duplicate' | 'rename' | 'copyTab' | 'delete' }
/** メニューの行を作る。「今のタブを写して足す」はマイレイアウト以外のタブで開いたときだけ */
export function menuRows(pages: readonly SavedLayout[], active: string): MenuRow[] {
  return [
    ...pages.map((page, i) => ({ kind: 'page' as const, page, n: i < 9 ? i + 1 : null })),
    { kind: 'new' },
    { kind: 'duplicate' },
    { kind: 'rename' },
    ...(active === 'free' ? [] : [{ kind: 'copyTab' as const }]),
    { kind: 'delete' },
  ]
}
/** 新しいページの初期の形（§3.4。選ぶ順）と、その名前・説明（フリー N の初期の形と同じ言葉） */
export const PAGE_SHAPES: readonly [shape: string, label: Key, hint: Key][] = [
  ['preset:free', 'lay.shape.free', 'lay.shape.freeHint'],
  ['free:empty', 'win.shape.empty', 'win.shape.emptyHint'],
  ['free:quad', 'win.shape.quad', 'win.shape.quadHint'],
  ['free:grid', 'win.shape.grid', 'win.shape.gridHint'],
  ['free:detail', 'win.shape.detail', 'win.shape.detailHint'],
]

export const nameOfPage = (p: SavedLayout): string => pageName(p, app.settings.lang)
/** 表示中のページの名前（タブ・確認の文言） */
export function currentPageName(): string {
  const p = currentPage()
  return p ? nameOfPage(p) : ''
}
const refused = (r: PageRefusal) => toast(r === 'limit' ? t('lay.limit', { n: PAGES_MAX }) : t('lay.tooBigAdd'), undefined, 5000)
/** メニューを開く（ページを選ぶまで表示中のタブは変えない） */
export function openPageMenu(): void {
  if (!IS_FREE) app.overlay = { kind: 'layouts' }
}
const backToMenu = () => openPageMenu()

function added(r: SavedLayout | PageRefusal | null): void {
  if (!r) return
  if (r === 'limit' || r === 'size') {
    refused(r)
    return
  }
  setPage(r.id)
  app.overlay = null
  toast(t('lay.added', { name: nameOfPage(r) }))
}
/** 新しいページ（Insert）: 形を選ぶ → 名前を打つ → 開く。取り消したらメニューに戻る */
export async function newPage(): Promise<void> {
  if (openablePages().length >= PAGES_MAX) return refused('limit')
  const shape = await choiceDialog(
    t('lay.shapeTitle'),
    PAGE_SHAPES.map(([id, label, hint]) => ({ id, label: t(label), hint: t(hint) })),
  )
  if (!shape) return backToMenu()
  const name = await promptDialog(t('lay.saveTitle'), '')
  if (!name) return backToMenu()
  added(addPage(name, shapeEntry(shape), shape))
}
/** このページを複製（Shift+Insert） */
export async function duplicate(id = layout.doc.page): Promise<void> {
  const p = layout.pages.find((x) => x.id === id)
  if (!p) return
  const name = await promptDialog(t('lay.saveTitle'), t('lay.dupName', { name: nameOfPage(p) }))
  if (!name) return backToMenu()
  added(duplicatePage(p.id, name))
}
/** 今のタブを写してページに足す（名前付きの保存の代わり）。写したあとは新しいページを開く */
export async function copyTab(): Promise<void> {
  const name = await promptDialog(t('lay.saveTitle'), '')
  if (!name) return backToMenu()
  added(copyToPage(name))
}
/** 名前を変える（F2）。終わったらメニューに戻る */
export async function rename(id = layout.doc.page): Promise<void> {
  const p = layout.pages.find((x) => x.id === id)
  if (!p) return
  const name = await promptDialog(t('lay.renameTitle'), nameOfPage(p))
  if (name) renamePage(p.id, name)
  backToMenu()
}
/** 消す（Delete を 2 回）。最後の 1 枚は消さない。10 秒間は元に戻せる（Ctrl+Z） */
export function remove(id: string): boolean {
  const p = layout.pages.find((x) => x.id === id)
  if (!p) return false
  const name = nameOfPage(p)
  if (!removePage(id)) {
    toast(t('lay.lastPage'), undefined, 5000)
    return false
  }
  toast(t('lay.removed', { name }), { label: `${t('layout.undo')} (Ctrl+Z)`, run: () => void undoRemove() }, 10_000)
  return true
}
export function undoRemove(): boolean {
  const p = undoRemovePage()
  if (p) toast(t('lay.restored', { name: nameOfPage(p) }))
  return !!p
}
/** コマンドバーの項目（ページごとに「マイレイアウト: <名前> を開く」）。ACTIONS には入れない。フリー N では出さない */
export function pageCommands(): { id: string; label: string; run: () => void }[] {
  if (IS_FREE) return []
  return openablePages().map((p) => ({
    id: `page:${p.id}`,
    label: t('lay.openPage', { tab: t('preset.free'), name: nameOfPage(p) }),
    run: () => void setPage(p.id),
  }))
}
