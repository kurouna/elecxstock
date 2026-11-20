// マイレイアウトのページの操作（FR-L14。docs/design-mylayouts.md §3.2〜§3.4）: メニュー（components/overlays/Layouts.svelte）・
// コマンドバー・キーから使う。ダイアログとトーストはここ、ページの木の変更は stores/layout.svelte.ts
import type { SavedLayout } from '@shared/types'
import { app, choiceDialog, promptDialog, rpc, t, toast } from '../stores/app.svelte'
import {
  addPage,
  copyToPage,
  currentPage,
  duplicatePage,
  type FreeOpened,
  freeWin,
  layout,
  openablePages,
  PAGES_MAX,
  type PageRefusal,
  pageName,
  pageOpenable,
  removePage,
  renamePage,
  setPage,
  shapeEntry,
  undoRemovePage,
} from '../stores/layout.svelte'
import type { Key } from './i18n'
import { composing } from './keys'
import { clampSel } from './selection'
import { type ShapeFig, shapeFigOf } from './shapeFigs'
import { freeNo, IS_FREE, SLOT } from './windowSlot'

/** メニューの行: ページ（番号は 1〜9 だけ）と、操作 */
export type MenuRow =
  | { kind: 'page'; page: SavedLayout; n: number | null }
  | { kind: 'new' | 'duplicate' | 'rename' | 'copyTab' | 'delete' }
/**
 * メニューの行を作る（`pages` は開けるページ）。「今のタブを写して足す」はマイレイアウト以外のタブで開いたときだけ。
 * 「削除」はページが 2 枚以上のときだけ（最後の 1 枚は消せないので、選べない行を出さない。Delete キーは理由を知らせる）
 */
export function menuRows(pages: readonly SavedLayout[], active: string): MenuRow[] {
  return [
    ...pages.map((page, i) => ({ kind: 'page' as const, page, n: i < 9 ? i + 1 : null })),
    { kind: 'new' },
    { kind: 'duplicate' },
    { kind: 'rename' },
    ...(active === 'free' ? [] : [{ kind: 'copyTab' as const }]),
    ...(pages.length > 1 ? [{ kind: 'delete' as const }] : []),
  ]
}
/** 複製・名前・削除の相手: 選んでいる行がページならそのページ、操作の行なら表示中のページ */
export function menuTarget(rows: readonly MenuRow[], sel: number, current: string | undefined): SavedLayout | undefined {
  const r = rows[sel]
  if (r?.kind === 'page') return r.page
  return rows.find((x): x is Extract<MenuRow, { kind: 'page' }> => x.kind === 'page' && x.page.id === current)?.page
}
/** メニューでキーを押したときにすること（FR-KB5: 数字は code で判定し、変換中は何もしない） */
export type MenuCommand =
  | { kind: 'select'; sel: number }
  | { kind: 'reorder'; delta: -1 | 1 }
  | { kind: 'row' }
  | { kind: 'open'; index: number }
  | { kind: 'new' | 'duplicate' | 'rename' | 'delete' | 'undo' }
type KeyLike = Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'isComposing' | 'keyCode'>
export function menuKey(e: KeyLike, sel: number, count: number): MenuCommand | null {
  if (composing(e)) return null
  const ctrl = e.ctrlKey || e.metaKey
  const digit = /^Digit([1-9])$/.exec(e.code)
  if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && e.altKey) return { kind: 'reorder', delta: e.key === 'ArrowUp' ? -1 : 1 }
  if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) return { kind: 'select', sel: clampSel(sel + 1, count) }
  if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) return { kind: 'select', sel: Math.max(0, sel - 1) }
  if (e.key === 'Home') return { kind: 'select', sel: 0 }
  if (e.key === 'End') return { kind: 'select', sel: clampSel(count - 1, count) }
  if (e.key === 'Enter') return { kind: 'row' }
  if (digit && !ctrl && !e.altKey && !e.shiftKey) return { kind: 'open', index: Number(digit[1]) - 1 }
  if (e.key === 'Insert') return { kind: e.shiftKey ? 'duplicate' : 'new' }
  if (e.key === 'F2') return { kind: 'rename' }
  if (e.key === 'Delete') return { kind: 'delete' }
  if (ctrl && !e.shiftKey && !e.altKey && e.code === 'KeyZ') return { kind: 'undo' }
  return null
}
/**
 * 削除は同じ相手に 2 回（Delete か、削除の行で Enter）。1 回目は印だけ付け、ほかのキーを押すと印を消す。
 * 返す `pending` を次の印にし、`remove` なら消す
 */
export function deletePress(pending: string | null, cmd: MenuCommand | null, row: MenuRow | undefined, target: string | undefined) {
  const isDelete = cmd?.kind === 'delete' || (cmd?.kind === 'row' && row?.kind === 'delete')
  if (!isDelete || !target) return { pending: null, remove: false }
  return pending === target ? { pending: null, remove: true } : { pending: target, remove: false }
}
/**
 * メニューを ▾ の下に、右端をそろえて出す位置（CSS の px）。`anchor` は getBoundingClientRect の値で、文字の大きさ（ルートの zoom）が
 * 掛かっているので割り戻す。`menuWidth`（offsetWidth）は掛かっていない。窓からはみ出さないように左右を詰める
 */
export function menuPosition(
  anchor: { right: number; bottom: number },
  menuWidth: number,
  viewportWidth: number,
  zoom: number,
): { left: number; top: number } {
  const z = zoom > 0 ? zoom : 1
  const right = anchor.right / z
  const vw = viewportWidth / z
  return { left: Math.max(4, Math.min(right - menuWidth, vw - menuWidth - 4)), top: anchor.bottom / z + 2 }
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
  if (!IS_FREE) app.overlay = { kind: 'pageMenu' }
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
/** 新しいページの形の選択肢（形の図つき） */
export function pageShapeOptions(): { id: string; label: string; hint: string; fig?: ShapeFig }[] {
  return PAGE_SHAPES.map(([id, label, hint]) => ({ id, label: t(label), hint: t(hint), fig: shapeFigOf(id) }))
}
/** 新しいページ（Insert）: 形を選ぶ → 名前を打つ → 開く。取り消したらメニューに戻る */
export async function newPage(): Promise<void> {
  if (openablePages().length >= PAGES_MAX) return refused('limit')
  const shape = await choiceDialog(t('lay.shapeTitle'), pageShapeOptions())
  if (!shape) return backToMenu()
  const name = await promptDialog(t('lay.saveTitle'), '')
  if (!name) return backToMenu()
  added(addPage(name, shapeEntry(shape), shape))
}
/** このページを複製（Shift+Insert） */
export async function duplicate(id = layout.doc.page): Promise<void> {
  const p = layout.pages.find((x) => x.id === id)
  if (!p) return
  // 名前を打たせてから断らない（新しいページと同じ）
  if (openablePages().length >= PAGES_MAX) return refused('limit')
  const name = await promptDialog(t('lay.saveTitle'), t('lay.dupName', { name: nameOfPage(p) }))
  if (!name) return backToMenu()
  added(duplicatePage(p.id, name))
}
/** 今のタブを写してページに足す（名前付きの保存の代わり）。写したあとは新しいページを開く */
export async function copyTab(): Promise<void> {
  if (openablePages().length >= PAGES_MAX) return refused('limit')
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

// ---------------------------------------------------------------- フリー 2〜4 でページを開く（docs/design-mylayouts.md §3.6）
/** 新しいウィンドウの初期の形の選択肢に足す、開けるページ（`page:<ID>`。写しを開く） */
export function pageShapeChoices(pages: readonly SavedLayout[]): { id: string; label: string; hint: string; fig: ShapeFig }[] {
  return pages
    .filter((p) => pageOpenable(p) && /^[\w-]{1,40}$/.test(p.id))
    .map((p) => ({
      id: `page:${p.id}`,
      label: t('win.shape.page', { tab: t('preset.free'), name: nameOfPage(p) }),
      hint: t('win.shape.pageHint'),
      fig: 'page' as const,
    }))
}
/** フリー N を開いたときに、ページから変えたもの・ページが無かったことを知らせる */
export function noticeFreeOpened(r: FreeOpened, shape: string | null): void {
  if (r.missing) toast(t('win.pageMissing'), undefined, 5000)
  else if (r.adjusted && shape?.startsWith('page:')) toast(t('win.pageAdjusted'), undefined, 5000)
}
/** フリー N の窓の名前（ページから開いた窓は「フリー 2（<ページ名> から）」）。ページの名前は渡されたページから読む */
export function freeWindowName(pages: readonly SavedLayout[] = []): string {
  const win = t('win.freeTitle', { n: freeNo(SLOT) })
  const id = freeWin.origin?.startsWith('page:') ? freeWin.origin.slice(5) : null
  const p = id ? pages.find((x) => x.id === id) : undefined
  return p ? t('win.fromPage', { win, name: nameOfPage(p) }) : win
}
/** フリー N の初期状態の中身（ページから開いた窓は、ページの今の中身を読み直して写す） */
export async function freeResetTarget(): Promise<{ name: string; pages: SavedLayout[] }> {
  const pages = freeWin.origin?.startsWith('page:') ? (await rpc('user.load', {})).layouts : []
  return { name: freeWindowName(pages), pages }
}
