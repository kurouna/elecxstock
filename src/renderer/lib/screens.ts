// 名前を付けたスクリーン（FR-SC4, SC12〜SC16）の操作。スクリーナーのペインとスクリーン一覧の両方から使う。
import type { Condition, SavedScreen } from '@shared/types'
import { app, ask3, promptDialog, saveScreens, screenName, t, toast } from '../stores/app.svelte'
import { allPanes, type PaneNode, patchState, setPreset } from '../stores/layout.svelte'
import { setFocus } from './commands'

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T

export function screenOf(pane: PaneNode): SavedScreen | undefined {
  return app.screens.find((s) => s.id === pane.state.screenId)
}
export function condsOf(pane: PaneNode): Condition[] {
  const c = pane.state.conds as Condition[] | undefined
  if (c) return c
  return clone(screenOf(pane)?.conditions ?? app.screens[0]?.conditions ?? [])
}
const DEFAULT_SORT = { k: 'income.yield', dir: -1 as 1 | -1 }
/** 結果表の並べ替え・列・上位 N 件（ペインの状態に無ければ、開いているスクリーンの値） */
export function extrasOf(pane: PaneNode): { sort: { k: string; dir: 1 | -1 }; columns?: string[]; limit?: number } {
  const s = screenOf(pane)
  const st = pane.state as { sort?: { k: string; dir: 1 | -1 }; cols?: string[]; limit?: number }
  const sort = st.sort ?? (s?.sort ? { k: s.sort.field, dir: s.sort.dir } : DEFAULT_SORT)
  const columns = st.cols ?? s?.columns
  const limit = 'limit' in st ? st.limit : s?.limit
  return { sort, ...(columns ? { columns } : {}), ...(limit ? { limit } : {}) }
}
export function isDirty(pane: PaneNode): boolean {
  const s = screenOf(pane)
  return !s || JSON.stringify(s.conditions) !== JSON.stringify(condsOf(pane)) || (s.limit ?? 0) !== (extrasOf(pane).limit ?? 0)
}
function writeExtras(s: SavedScreen, pane: PaneNode): void {
  const x = extrasOf(pane)
  s.sort = { field: x.sort.k, dir: x.sort.dir }
  if (x.columns) s.columns = [...x.columns]
  else delete s.columns
  if (x.limit) s.limit = x.limit
  else delete s.limit
}
export function setConds(pane: PaneNode, conds: Condition[]): void {
  patchState(pane, { conds })
  app.liveConds = clone(conds)
}
export function saveScreen(pane: PaneNode): void {
  const s = screenOf(pane)
  if (!s) {
    void saveScreenAs(pane)
    return
  }
  s.conditions = clone(condsOf(pane))
  writeExtras(s, pane)
  s.updated = Date.now()
  saveScreens()
  toast(t('scr.saved', { name: screenName(s) }))
}
export async function saveScreenAs(pane: PaneNode): Promise<void> {
  const base = screenOf(pane)
  const name = await promptDialog(t('scr.saveAsTitle'), base ? t('scr.copyOf', { name: screenName(base) }) : '')
  if (!name) return
  const now = Date.now()
  const s: SavedScreen = {
    id: `s${now.toString(36)}`,
    name: { ja: name, en: name },
    conditions: clone(condsOf(pane)),
    created: now,
    updated: now,
  }
  writeExtras(s, pane)
  app.screens.push(s)
  saveScreens()
  patchState(pane, { screenId: s.id })
  toast(t('scr.saved', { name }))
}
export async function renameScreen(pane: PaneNode): Promise<void> {
  const s = screenOf(pane)
  if (!s) return
  const name = await promptDialog(t('scr.renameTitle'), screenName(s))
  if (!name) return
  s.name = { ja: name, en: name }
  saveScreens()
}
/** 別のスクリーンを開く。保存されていない変更があれば「保存 / 破棄 / キャンセル」を尋ねる（FR-SC13） */
export async function openScreen(pane: PaneNode, id: string): Promise<void> {
  if (pane.state.screenId === id && !isDirty(pane)) return
  if (isDirty(pane) && screenOf(pane)) {
    const r = await ask3(t('scr.unsavedTitle'), t('scr.unsavedBody'))
    if (r === 'cancel') return
    if (r === 'save') saveScreen(pane)
  }
  const s = app.screens.find((x) => x.id === id)
  if (!s) return
  patchState(pane, {
    screenId: id,
    conds: clone(s.conditions),
    sel: 0,
    sort: s.sort ? { k: s.sort.field, dir: s.sort.dir } : undefined,
    cols: s.columns ? [...s.columns] : undefined,
    limit: s.limit,
  })
  app.liveConds = clone(s.conditions)
  app.liveScreenId = id
}
/** ペインを閉じる前に、保存されていないスクリーンの変更を尋ねる（FR-SC13）。閉じてよければ true */
export async function confirmCloseScreen(pane: PaneNode | null | undefined): Promise<boolean> {
  if (pane?.widget !== 'screener' || !isDirty(pane) || !screenOf(pane)) return true
  const r = await ask3(t('scr.unsavedTitle'), t('scr.unsavedBody'))
  if (r === 'cancel') return false
  if (r === 'save') saveScreen(pane)
  return true
}
/** スクリーン一覧・コマンドバーから開く。スクリーナーのペインが無ければスクリーナーのレイアウトに切り替える */
export function openScreenAnywhere(id: string): void {
  let p = allPanes().find((x) => x.widget === 'screener')
  if (!p) {
    setPreset('screener')
    p = allPanes().find((x) => x.widget === 'screener')
  }
  if (!p) return
  setFocus(p.id)
  void openScreen(p, id)
}
