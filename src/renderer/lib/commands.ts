// アクションの登録表（FR-KB1）とキー操作（§6.5）。メニュー・ボタン・ショートカット・コマンドバーは同じアクションを呼ぶ。
// キーは物理キー（KeyboardEvent.code）で判定し、日本語 IME の変換中は無視する（FR-KB5）。
import type { InstrumentId } from '@shared/types'
import {
  app,
  candidates,
  choiceDialog,
  closeOverlay,
  confirmDialog,
  listName,
  promptDialog,
  rpc,
  saveSettings,
  saveWatchlists,
  t,
  toast,
  toggleFav,
} from '../stores/app.svelte'
import {
  allPanes,
  canUndoReset,
  changeWidget,
  closePane,
  findPane,
  inDock,
  layout,
  nudgeDivider,
  PRESET_IDS,
  type PresetId,
  patchState,
  resetLayout,
  resetSizes,
  saveLayout,
  setLinkSymbol,
  setPreset,
  splitPane,
  swapPane,
  undoResetSizes,
  WIDGETS,
} from '../stores/layout.svelte'
import type { Key } from './i18n'
import { paneApi } from './panes'

export interface Action {
  id: string
  label: () => string
  key?: string
  run: () => void | Promise<void>
}

export function focusedSymbol(): InstrumentId | null {
  const p = findPane(app.focus)
  const fromApi = paneApi(app.focus)?.current?.()
  if (fromApi) return fromApi
  if (p?.link) return layout.doc.links[String(p.link)] ?? null
  return layout.doc.links['1'] ?? null
}

export function setFocus(id: string | null): void {
  app.focus = id
  if (!id) return
  queueMicrotask(() => {
    const el = document.querySelector<HTMLElement>(`[data-pane-id="${id}"]`)
    if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true })
  })
}

/** 選んだ銘柄を、フォーカス中のペインに送る（リンクグループ、または chart-grid の銘柄） */
export function sendSymbol(id: InstrumentId): void {
  const pane = findPane(app.focus)
  if (paneApi(app.focus)?.receive?.(id)) return
  const group = pane?.link || 1
  setLinkSymbol(group, id)
}

export function toggleDock(): void {
  const d = layout.entry.docks.left
  if (!d) {
    toast(t('layout.noDrawer'))
    return
  }
  if (d.pinned) {
    d.pinned = false
    layout.dockOpen = false
    saveLayout()
    return
  }
  layout.dockOpen = !layout.dockOpen
  if (layout.dockOpen) setFocus(d.panes[d.active]!.id)
  else if (app.focus && inDock(app.focus)) setFocus(allPanes(layout.entry, false)[0]!.id)
}
export function pinDock(): void {
  const d = layout.entry.docks.left
  if (!d) {
    toast(t('layout.noDrawer'))
    return
  }
  d.pinned = !d.pinned
  layout.dockOpen = d.pinned
  saveLayout()
  toast(`${t('drawer.pin')}: ${d.pinned ? 'ON' : 'OFF'}`)
}

export function doResetSizes(): void {
  resetSizes()
  toast(t('layout.sizesReset'), { label: `${t('layout.undo')} (Ctrl+Z)`, run: () => undoResetSizes() && toast(t('layout.undone')) }, 10_000)
}
export async function doResetLayout(): Promise<void> {
  const r = await confirmDialog({ title: t('layout.resetTitle'), body: t('layout.resetBody'), ok: t('layout.resetDo'), danger: true })
  if (!r.ok) return
  resetLayout()
  toast(t('layout.resetDone'))
}

export async function startUpdate(): Promise<void> {
  await rpc('jobs.start', { kind: app.status?.withBars ? 'daily' : 'initial' })
}
export async function refetchSelected(): Promise<void> {
  const id = focusedSymbol()
  if (id) await rpc('jobs.refetch', { ids: [id] })
}

export async function addToListDialog(ids: InstrumentId[]): Promise<void> {
  if (!ids.length) return
  const lists = app.watchlists.filter((w) => w.builtin !== 'favorites')
  const choice = await choiceDialog(t('list.pickTarget'), [
    ...lists.map((l) => ({ id: l.id, label: listName(l), hint: t('list.items', { n: l.items.length }) })),
    { id: '__new', label: `＋ ${t('list.new')}` },
  ])
  if (!choice) return
  let id = choice
  if (choice === '__new') {
    const name = await promptDialog(t('list.newName'), '')
    if (!name) return
    id = `u${Date.now().toString(36)}`
    app.watchlists.push({ id, name: { ja: name, en: name }, items: [] })
  }
  const l = app.watchlists.find((w) => w.id === id)!
  l.items = [...l.items, ...ids.filter((x) => !l.items.includes(x))]
  saveWatchlists()
  toast(t('list.added', { list: listName(l), name: ids.length === 1 ? ids[0]!.replace(/^\w+:/, '') : String(ids.length) }))
}

export async function exportUser(): Promise<void> {
  const json = await rpc('user.exportAll', {})
  if (await window.elecxstock.saveText(`elecxstock-userdata-${new Date().toISOString().slice(0, 10)}.json`, json)) toast(t('set.exported'))
}
export async function importUser(): Promise<void> {
  const text = await window.elecxstock.openFile('json')
  if (typeof text !== 'string') return
  const r = await rpc('user.importAll', { json: text })
  const u = await rpc('user.load', {})
  app.watchlists = u.watchlists
  app.screens = u.screens
  app.settings = u.settings
  toast(t('set.imported', { w: r.watchlists, s: r.screens }))
}

export function openInGrid(): void {
  // 開いた時点のスクリーナーの条件を「スクリーナーの結果」に使う（FR-SC6, G1）
  const scr = findPane(app.focus)
  if (scr?.widget === 'screener' && Array.isArray(scr.state.conds)) app.liveConds = JSON.parse(JSON.stringify(scr.state.conds))
  setPreset('grid')
  const g = allPanes().find((p) => p.widget === 'grid')
  if (g) {
    patchState(g, { src: 'live', page: 0, sel: 0 })
    setFocus(g.id)
  }
}

const presetName = (p: PresetId) => t(`preset.${p}` as Key)

export const ACTIONS: Action[] = [
  ...PRESET_IDS.map((p, i) => ({
    id: `layout.${p}`,
    label: () => t('act.layout', { name: presetName(p) }),
    key: `Ctrl+Shift+${i + 1}`,
    run: () => setPreset(p),
  })),
  { id: 'max', label: () => t('act.max'), key: 'Ctrl+Shift+Enter', run: () => toggleMax() },
  { id: 'fav', label: () => t('act.fav'), key: 'Ctrl+D', run: () => toggleFav(focusedSymbol()) },
  { id: 'update', label: () => t('act.update'), key: 'F5', run: () => startUpdate() },
  { id: 'refetch', label: () => t('act.updateSel'), key: 'Shift+F5', run: () => refetchSelected() },
  { id: 'universe', label: () => t('act.universe'), run: () => void rpc('jobs.start', { kind: 'universe' }) },
  { id: 'settings', label: () => t('act.settings'), key: 'Ctrl+,', run: () => (app.overlay = { kind: 'settings' }) },
  { id: 'data', label: () => t('act.data'), run: () => (app.overlay = { kind: 'settings', tab: 'data' }) },
  { id: 'lang', label: () => t('act.lang'), run: () => saveSettings({ lang: app.settings.lang === 'ja' ? 'en' : 'ja' }) },
  { id: 'candle', label: () => t('act.candle'), run: () => saveSettings({ candleStyle: app.settings.candleStyle === 'jp' ? 'us' : 'jp' }) },
  {
    id: 'density',
    label: () => t('act.density'),
    run: () => saveSettings({ density: app.settings.density === 'normal' ? 'compact' : 'normal' }),
  },
  { id: 'help', label: () => t('act.help'), key: 'F1', run: () => (app.overlay = { kind: 'help' }) },
  { id: 'screens', label: () => t('act.screens'), key: 'Ctrl+O', run: () => (app.overlay = { kind: 'screens' }) },
  { id: 'resetSizes', label: () => t('act.resetSizes'), key: 'Ctrl+Alt+R', run: () => doResetSizes() },
  { id: 'resetLayout', label: () => t('act.resetLayout'), run: () => doResetLayout() },
  { id: 'drawer', label: () => t('act.drawer'), key: 'Ctrl+B', run: () => toggleDock() },
  { id: 'drawerPin', label: () => t('act.drawerPin'), key: 'Ctrl+Alt+B', run: () => pinDock() },
  { id: 'openGrid', label: () => t('act.openGrid'), key: 'Ctrl+Shift+G', run: () => openInGrid() },
  {
    id: 'addTo',
    label: () => t('act.addTo'),
    key: 'Ctrl+Shift+A',
    run: () => addToListDialog(paneApi(app.focus)?.selected?.() ?? (focusedSymbol() ? [focusedSymbol()!] : [])),
  },
  { id: 'newList', label: () => t('act.newList'), run: () => newList() },
  { id: 'exportUser', label: () => t('act.exportUser'), run: () => exportUser() },
  { id: 'importUser', label: () => t('act.importUser'), run: () => importUser() },
  { id: 'split', label: () => t('act.split'), key: 'Ctrl+Shift+E', run: () => focusNew(splitPane(app.focus ?? '', 'row')) },
  { id: 'splitDown', label: () => t('act.splitDown'), key: 'Ctrl+Shift+O', run: () => focusNew(splitPane(app.focus ?? '', 'col')) },
  { id: 'close', label: () => t('act.close'), key: 'Ctrl+Shift+W', run: () => app.focus && closePane(app.focus) },
  { id: 'changeWidget', label: () => t('act.changeWidget'), key: 'Ctrl+Shift+N', run: () => changeWidgetDialog() },
  { id: 'jobs', label: () => t('act.jobs'), run: () => openJobsPane() },
  { id: 'fullscreen', label: () => t('act.fullscreen'), key: 'F11', run: () => toggleFullscreen() },
]

function focusNew(id: string | null): void {
  if (id) setFocus(id)
}
async function newList(): Promise<void> {
  const name = await promptDialog(t('list.newName'), '')
  if (!name) return
  app.watchlists.push({ id: `u${Date.now().toString(36)}`, name: { ja: name, en: name }, items: [] })
  saveWatchlists()
}
async function changeWidgetDialog(): Promise<void> {
  const id = app.focus
  if (!id) return
  const w = await choiceDialog(
    t('act.changeWidget'),
    WIDGETS.map((x) => ({ id: x, label: t(`widget.${x}` as Key) })),
  )
  if (w) changeWidget(id, w as (typeof WIDGETS)[number])
}
function openJobsPane(): void {
  const p = allPanes().find((x) => x.widget === 'jobs')
  if (p) {
    setFocus(p.id)
    return
  }
  const id = splitPane(app.focus ?? allPanes(layout.entry, false)[0]!.id, 'col', 'jobs')
  focusNew(id)
}
function toggleFullscreen(): void {
  if (document.fullscreenElement) void document.exitFullscreen()
  else void document.documentElement.requestFullscreen()
}
export function toggleMax(): void {
  if (!app.focus || inDock(app.focus)) return
  app.maximized = app.maximized === app.focus ? null : app.focus
}

// ---------------------------------------------------------------- focus movement
function paneRects(): { id: string; r: DOMRect }[] {
  return [...document.querySelectorAll<HTMLElement>('[data-pane-id], [data-dock-rail]')]
    .filter((el) => el.offsetParent !== null)
    .map((el) => ({ id: el.dataset.paneId ?? '__rail', r: el.getBoundingClientRect() }))
    .filter((x) => x.r.width > 0)
}
export function moveFocus(dir: 'left' | 'right' | 'up' | 'down'): void {
  const cur = document.querySelector<HTMLElement>(app.focus ? `[data-pane-id="${app.focus}"]` : '[data-dock-rail]')?.getBoundingClientRect()
  if (!cur) return
  const cx = cur.x + cur.width / 2
  const cy = cur.y + cur.height / 2
  let best: string | null = null
  let bd = Number.POSITIVE_INFINITY
  for (const { id, r } of paneRects()) {
    if (id === app.focus) continue
    const ok = {
      left: r.right <= cur.left + 2,
      right: r.left >= cur.right - 2,
      up: r.bottom <= cur.top + 2,
      down: r.top >= cur.bottom - 2,
    }[dir]
    if (!ok) continue
    const d = Math.hypot(r.x + r.width / 2 - cx, r.y + r.height / 2 - cy)
    if (d < bd) {
      bd = d
      best = id
    }
  }
  if (best === '__rail') focusRail()
  else if (best) setFocus(best)
}
/** 閉じているドロワーの帯にフォーカスを置く（FR-DR4）。帯にいる間の ↑↓ はドロワーの一覧に届く */
export function focusRail(): void {
  app.focus = null
  document.querySelector<HTMLElement>('[data-dock-rail]')?.focus()
}
function swapWith(dir: 'left' | 'right' | 'up' | 'down'): void {
  const from = app.focus
  if (!from) return
  moveFocus(dir)
  const to = app.focus
  if (to && to !== from && !inDock(to) && !inDock(from)) {
    swapPane(from, to)
    setFocus(from)
  }
}
function cycle(back: boolean): void {
  const ids = paneRects().map((x) => x.id)
  if (!ids.length) return
  const cur = app.focus ?? '__rail'
  const i = ids.indexOf(cur)
  const next = ids[(i + (back ? -1 : 1) + ids.length) % ids.length]!
  if (next === '__rail') focusRail()
  else setFocus(next)
}

const ARROW: Record<string, 'left' | 'right' | 'up' | 'down'> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }
const inText = (e: KeyboardEvent) => (e.target as HTMLElement)?.matches?.('input, textarea, select')

/** アプリ全体のキー処理（§6.5）。true を返したら既定の動作を止める */
export function handleKey(e: KeyboardEvent): boolean {
  if (e.isComposing) return false
  const ctrl = e.ctrlKey || e.metaKey
  const c = e.code
  if (app.overlay) {
    if (c === 'Escape') {
      closeOverlay()
      return true
    }
    if (c === 'F1' && app.overlay.kind === 'help') {
      closeOverlay()
      return true
    }
    if (ctrl && !e.shiftKey && c === 'KeyK' && app.overlay.kind !== 'palette') {
      app.overlay = { kind: 'palette' }
      return true
    }
    return false
  }
  if (c === 'F1') return run('help')
  if (ctrl && !e.shiftKey && !e.altKey && c === 'KeyK') {
    app.overlay = { kind: 'palette' }
    return true
  }
  if (inText(e)) return false
  const pane = paneApi(app.focus)
  if (c === 'Escape') {
    if (pane?.key?.(e)) return true
    if (app.maximized) {
      app.maximized = null
      return true
    }
    if (layout.dockOpen && !layout.entry.docks.left?.pinned) {
      toggleDock()
      return true
    }
    return false
  }
  if (ctrl && e.shiftKey && !e.altKey && /^Digit[1-5]$/.test(c)) {
    setPreset(PRESET_IDS[Number(c.slice(5)) - 1]!)
    return true
  }
  if (ctrl && e.shiftKey && c === 'Enter') return run('max')
  if (ctrl && !e.shiftKey && !e.altKey && /^Digit[0-5]$/.test(c)) {
    const p = findPane(app.focus)
    if (p) {
      p.link = Number(c.slice(5))
      saveLayout()
      toast(t('link.set', { n: p.link || '—' }))
    }
    return true
  }
  if (ctrl && !e.shiftKey && !e.altKey && c === 'KeyD') return run('fav')
  if (ctrl && !e.shiftKey && c === 'Comma') return run('settings')
  if (ctrl && e.altKey && c === 'KeyB') return run('drawerPin')
  if (ctrl && !e.altKey && !e.shiftKey && c === 'KeyB') return run('drawer')
  if (ctrl && e.shiftKey && !e.altKey && c === 'KeyB') {
    toast(t('layout.noDrawer'))
    return true
  }
  if (ctrl && e.altKey && !e.shiftKey && c === 'KeyR') return run('resetSizes')
  if (ctrl && !e.shiftKey && !e.altKey && c === 'KeyZ' && canUndoReset()) {
    undoResetSizes()
    toast(t('layout.undone'))
    return true
  }
  if (ctrl && e.shiftKey && c === 'KeyG') return run('openGrid')
  if (ctrl && e.shiftKey && c === 'KeyE') return run('split')
  if (ctrl && e.shiftKey && c === 'KeyO') return run('splitDown')
  if (ctrl && e.shiftKey && c === 'KeyW') return run('close')
  if (ctrl && e.shiftKey && c === 'KeyN') return run('changeWidget')
  if (ctrl && e.shiftKey && c === 'KeyL') {
    toast(t('common.notInMvp'))
    return true
  }
  if (c === 'F5') return run(e.shiftKey ? 'refetch' : 'update')
  if (c === 'F11') return run('fullscreen')
  if (c === 'F6') {
    cycle(e.shiftKey)
    return true
  }
  // ペイン自身のキー（一覧の ↑↓、チャートの D/W/M、グリッドの Space など）
  if (pane?.key?.(e)) return true
  if (ctrl && e.shiftKey && c === 'KeyA') return run('addTo')
  if (ctrl && !e.shiftKey && c === 'KeyO') return run('screens')
  const arrow = ARROW[e.key]
  if (arrow && e.altKey && e.shiftKey && !ctrl) {
    if (app.focus) nudgeDivider(app.focus, arrow)
    return true
  }
  if (arrow && e.altKey && e.shiftKey && ctrl) {
    swapWith(arrow)
    return true
  }
  if (arrow && e.altKey && !e.shiftKey && !ctrl) {
    moveFocus(arrow)
    return true
  }
  // 銘柄ジャンプ: 1〜9 で始まる（0 はチャートの期間リセットに使う。FR-O1）
  if (!ctrl && !e.altKey && !e.shiftKey && /^(Digit|Numpad)[1-9]$/.test(c)) {
    app.overlay = { kind: 'jump', first: c.slice(-1) }
    return true
  }
  return false
}

function run(id: string): boolean {
  const a = ACTIONS.find((x) => x.id === id)
  if (a) void a.run()
  return true
}

export function candidatesListName(): string {
  return listName(candidates())
}
export { confirmDialog }
