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
export function isDirty(pane: PaneNode): boolean {
  const s = screenOf(pane)
  return !s || JSON.stringify(s.conditions) !== JSON.stringify(condsOf(pane))
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
  patchState(pane, { screenId: id, conds: clone(s.conditions), sel: 0 })
  app.liveConds = clone(s.conditions)
  app.liveScreenId = id
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
