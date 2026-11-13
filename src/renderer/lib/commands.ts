// アクションの登録表（FR-KB1）とキー操作（§6.5）。メニュー・ボタン・ショートカット・コマンドバーは同じアクションを呼ぶ。
// キーは物理キー（KeyboardEvent.code）で判定し、日本語 IME の変換中は無視する（FR-KB5）。
// 登録表のキーは設定で変えられる（FR-KB6。settings.keymap が上書き）。ペインの中の単キーは各ペインが持つ。
import { addDays, jstNow } from '@shared/calendar'
import type { InstrumentId, Watchlist } from '@shared/types'
import {
  app,
  applySettingsToDom,
  candidates,
  choiceDialog,
  closeOverlay,
  confirmDialog,
  listName,
  nameOf,
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
  type DockSide,
  dockOf,
  findPane,
  inDock,
  layout,
  moveFromDock,
  moveToDock,
  moveToEdge,
  nudgeDivider,
  PRESET_IDS,
  type PresetId,
  paneSymbol,
  patchState,
  resetLayout,
  resetSizes,
  saveLayout,
  setLinkSymbol,
  setPaneSymbol,
  setPreset,
  splitPane,
  swapPane,
  undoResetSizes,
  WIDGETS,
  type WidgetId,
} from '../stores/layout.svelte'
import { toCsv } from './columns'
import type { Key } from './i18n'
import { matches, normalizeKey } from './keys'
import { paneApi } from './panes'
import { exportHoldings, importBrokerCsv, importHoldings, undoHoldingsImport } from './portfolio'
import { confirmCloseScreen } from './screens'

export interface Action {
  id: string
  label: () => string
  /** 既定のキー（FR-KB6 で上書きできる） */
  key?: string
  /**
   * いつキーを照合するか。global: ペインより先（レイアウト・ドロワーなど）。
   * late: ペインのキー処理のあと（Ctrl+Shift+A のように、ペインが同じキーを使うことがあるもの）
   */
  when?: 'global' | 'late'
  run: () => void | Promise<void>
}

/** 今のキー（設定の上書き → 既定）。'' は割り当てなし */
export function keyOf(a: Action | string): string {
  const act = typeof a === 'string' ? ACTIONS.find((x) => x.id === a) : a
  if (!act) return ''
  const o = app.settings.keymap[act.id]
  return o != null ? o : (act.key ?? '')
}
/** 同じキーを使っているアクション（衝突の検出。FR-KB6） */
export function conflicts(id: string, key: string): Action[] {
  const k = normalizeKey(key)
  if (!k) return []
  return ACTIONS.filter((a) => a.id !== id && normalizeKey(keyOf(a)) === k)
}

export function focusedSymbol(): InstrumentId | null {
  const p = findPane(app.focus)
  const fromApi = paneApi(app.focus)?.current?.()
  if (fromApi) return fromApi
  if (p?.link) return layout.doc.links[String(p.link)] ?? null
  return layout.doc.links['1'] ?? null
}

/** フォーカス中のペインがウォッチリストなら、表示しているリスト（銘柄ジャンプ・コマンドバーの Ctrl+Enter で足す先） */
export function focusedWatchlist(): Watchlist | null {
  const p = findPane(app.focus)
  if (p?.widget !== 'watchlist') return null
  return app.watchlists.find((w) => w.id === ((p.state.list as string) ?? 'favorites')) ?? null
}

export function setFocus(id: string | null): void {
  app.focus = id
  if (!id) return
  // ピン留めしていないドロワーは、フォーカスが外へ出たら隠す（§6.9）
  const open = layout.dockOpen
  if (open && !layout.entry.docks[open]?.pinned && dockOf(id) !== open) layout.dockOpen = null
  queueMicrotask(() => {
    const el = document.querySelector<HTMLElement>(`[data-pane-id="${id}"]`)
    if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true })
  })
}

/** フォーカス中のウォッチリストが「保有」のタブ（中身を変えられない。FR-W10）なら、そう知らせて true */
export function holdingsTabLocked(): boolean {
  const p = findPane(app.focus)
  if (p?.widget !== 'watchlist' || p.state.list !== 'holdings') return false
  toast(t('list.holdingsLocked'))
  return true
}
/** リンク色が無いとき、自分の銘柄を持つペイン */
const OWN_SYMBOL = new Set<WidgetId>(['chart', 'mtf', 'info'])
/** 選んだ銘柄を、フォーカス中のペインに送る（リンクグループ、または chart-grid の銘柄） */
export function sendSymbol(id: InstrumentId): void {
  const pane = findPane(app.focus)
  if (paneApi(app.focus)?.receive?.(id)) return
  // リンク色の無いチャート・銘柄情報は、そのペインだけを変える（FR-L11）
  if (pane && !pane.link && OWN_SYMBOL.has(pane.widget)) {
    setPaneSymbol(pane, id)
    return
  }
  const group = pane?.link || 1
  setLinkSymbol(group, id)
}

/** ドロワーを開く前にフォーカスしていたペイン（閉じたらそこへ戻す。§6.9） */
let beforeDock: string | null = null
export function toggleDock(side: DockSide = 'left'): void {
  const d = layout.entry.docks[side]
  if (!d) {
    toast(t(side === 'left' ? 'layout.noDrawer' : 'layout.noRightDrawer'))
    return
  }
  if (d.pinned) {
    d.pinned = false
    if (layout.dockOpen === side) layout.dockOpen = null
    saveLayout()
    return
  }
  const opening = layout.dockOpen !== side
  layout.dockOpen = opening ? side : null
  if (opening) {
    if (app.focus && !inDock(app.focus)) beforeDock = app.focus
    setFocus(d.panes[d.active]!.id)
  } else if (app.focus && dockOf(app.focus) === side) {
    const back = beforeDock && findPane(beforeDock) && !inDock(beforeDock) ? beforeDock : allPanes(layout.entry, false)[0]!.id
    setFocus(back)
  }
}
export function pinDock(): void {
  const side = dockOf(app.focus) ?? layout.dockOpen ?? (layout.entry.docks.left ? 'left' : 'right')
  const d = layout.entry.docks[side]
  if (!d) {
    toast(t('layout.noDrawer'))
    return
  }
  d.pinned = !d.pinned
  layout.dockOpen = d.pinned ? side : null
  saveLayout()
  toast(`${t('drawer.pin')}: ${d.pinned ? 'ON' : 'OFF'}`)
}

export function doResetSizes(): void {
  resetSizes()
  toast(t('layout.sizesReset'), { label: `${t('layout.undo')} (Ctrl+Z)`, run: () => undoResetSizes() && toast(t('layout.undone')) }, 10_000)
}
export async function doResetLayout(): Promise<void> {
  // 戻すのは表示中のタブだけ。どのタブかを名前で示す
  const tab = t(`preset.${layout.doc.active}` as Key)
  const r = await confirmDialog({
    title: t('layout.resetTitle', { tab }),
    body: t('layout.resetBody'),
    ok: t('layout.resetDo'),
    danger: true,
  })
  if (!r.ok) return
  resetLayout()
  toast(t('layout.resetDone', { tab }))
}

export async function startUpdate(): Promise<void> {
  await rpc('jobs.start', { kind: app.status?.withBars ? 'daily' : 'initial' })
}
/** 銘柄を指定した取り直し（FR-S7）: 選んだ銘柄（複数選択を含む） */
export async function refetchSelected(): Promise<void> {
  const sel = paneApi(app.focus)?.selected?.()
  const ids = sel?.length ? sel : focusedSymbol() ? [focusedSymbol()!] : []
  if (!ids.length) return
  await rpc('jobs.refetch', { ids })
  toast(t('refetch.started', { n: ids.length }))
}
/** 一覧（ウォッチリスト・スクリーナーの結果など）の銘柄をすべて取り直す（FR-S7） */
async function refetchList(): Promise<void> {
  const c = paneApi(app.focus)?.columns?.()
  if (!c?.ids.length) {
    toast(t('cmd.needList'))
    return
  }
  const r = await confirmDialog({
    title: t('refetch.listTitle', { name: c.name, n: c.ids.length }),
    body: t('refetch.listBody'),
    ok: t('refetch.do'),
  })
  if (!r.ok) return
  await rpc('jobs.refetch', { ids: c.ids.slice(0, 5000) })
  toast(t('refetch.started', { n: c.ids.length }))
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

const today = () => jstNow().date // 日本時間の日付（FR-T1）
export async function exportUser(): Promise<void> {
  const json = await rpc('user.exportAll', {})
  if (await window.elecxstock.saveText(`elecxstock-userdata-${today()}.json`, json)) toast(t('set.exported'))
}
export async function importUser(): Promise<void> {
  const text = await window.elecxstock.openFile('json')
  if (typeof text !== 'string') return
  // 置き換える前に、何が置き換わるかを示して確かめる（取り込む前の状態は残り、元に戻せる）
  let o: { watchlists?: unknown[]; screens?: unknown[]; layouts?: unknown[]; settings?: unknown }
  try {
    o = JSON.parse(text)
  } catch {
    toast(t('import.badFile'), undefined, 5000)
    return
  }
  const ok = await confirmDialog({
    title: t('import.userTitle'),
    items: [
      t('import.userLists', { from: app.watchlists.length, to: o.watchlists?.length ?? 0 }),
      t('import.userScreens', { from: app.screens.length, to: o.screens?.length ?? 0 }),
      ...(o.layouts ? [t('import.userLayouts', { from: app.layouts.length, to: o.layouts.length })] : []),
      ...(o.settings ? [t('import.userSettings')] : []),
    ],
    body: t('import.userBody'),
    ok: t('import.userDo'),
  })
  if (!ok.ok) return
  const r = await rpc('user.importAll', { json: text })
  await reloadUser()
  toast(t('set.imported', { w: r.watchlists, s: r.screens }), { label: t('hold.undo'), run: () => void undoUserImport() }, 10_000)
}
async function reloadUser(): Promise<void> {
  const u = await rpc('user.load', {})
  app.watchlists = u.watchlists
  app.screens = u.screens
  app.settings = u.settings
  app.layouts = u.layouts
  applySettingsToDom()
}
async function undoUserImport(): Promise<void> {
  if (!(await rpc('user.undoImport', {}))) {
    toast(t('hold.nothingToUndo'))
    return
  }
  await reloadUser()
  toast(t('hold.undone'))
}
/** 一覧を CSV に書き出す（FR-SC6, W8） */
async function exportListCsv(): Promise<void> {
  const c = paneApi(app.focus)?.columns?.()
  if (!c) {
    toast(t('cmd.needList'))
    return
  }
  const csv = toCsv(c.ids, c.cols, nameOf)
  if (await window.elecxstock.saveText(`elecxstock-${c.name}-${today()}.csv`, csv)) toast(t('csv.saved', { n: c.ids.length }))
}
/** 選んだ銘柄の日足を CSV に書き出す（FR-S3） */
async function exportBarsCsv(): Promise<void> {
  const sel = paneApi(app.focus)?.selected?.()
  const ids = (sel?.length ? sel : focusedSymbol() ? [focusedSymbol()!] : []).slice(0, 500)
  if (!ids.length) return
  const years = await promptDialog(t('csv.barsYears'), '1')
  if (years == null) return
  const n = Math.max(0, Number(years) || 0)
  const from = n ? addDays(today(), -Math.round(n * 365.25)) : undefined
  const csv = await rpc('bars.csv', { ids, ...(from ? { from } : {}) })
  const name = ids.length === 1 ? ids[0]!.replace(/^\w+:/, '') : `${ids.length}`
  if (await window.elecxstock.saveText(`elecxstock-bars-${name}-${today()}.csv`, csv)) toast(t('csv.saved', { n: ids.length }))
}
/** コードを並べた CSV・テキストから取り込む（FR-W8）。先頭の列の 4〜5 桁のコードを拾う */
async function importCodes(): Promise<void> {
  const text = await window.elecxstock.openFile('text')
  if (typeof text !== 'string') return
  const codes = [
    ...new Set(
      text
        .split(/\r?\n/)
        .map((l) =>
          l
            .replace(/^﻿/, '')
            .split(/[,\t;]/)[0]!
            .trim()
            .replace(/^"|"$/g, '')
            .toUpperCase(),
        )
        .filter((c) => /^[0-9][0-9A-Z]{3,4}$/.test(c)),
    ),
  ]
  if (!codes.length) {
    toast(t('import.noCodes'))
    return
  }
  const known = await rpc('instruments.get', { ids: codes.map((c) => `JP:${c}`) })
  const ids = known.map((i) => i.id)
  const skipped = codes.length - ids.length
  await addToListDialog(ids)
  if (skipped) toast(t('import.skipped', { n: skipped }), undefined, 4000)
}
async function backupDb(): Promise<void> {
  toast(t('backup.running'))
  const name = await rpc('data.backup', {})
  if (await window.elecxstock.exportBackup(name)) toast(t('backup.saved'))
}
export async function checkUpdate(manual = false): Promise<void> {
  try {
    const r = await rpc('app.checkUpdate', {})
    if (r?.newer) {
      app.update = { version: r.version, url: r.url }
      toast(
        t('update.available', { v: r.version }),
        { label: t('update.open'), run: () => void window.elecxstock.openExternal(r.url) },
        15_000,
      )
    } else if (manual) toast(t('update.latest'))
  } catch {
    if (manual) toast(t('update.failed'))
  }
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
/** そのペインの種類があればフォーカスし、無ければフォーカス中のペインの下に開く */
export function openPane(widget: WidgetId): void {
  const p = allPanes().find((x) => x.widget === widget)
  if (p) {
    const side = dockOf(p.id)
    if (side) {
      const d = layout.entry.docks[side]!
      d.active = d.panes.indexOf(p)
      if (!d.pinned) layout.dockOpen = side
    }
    setFocus(p.id)
    return
  }
  const base = app.focus && !inDock(app.focus) ? app.focus : allPanes(layout.entry, false)[0]!.id
  focusNew(splitPane(base, 'col', widget))
}

const presetName = (p: PresetId) => t(`preset.${p}` as Key)
const paneRun = (action: string) => () => {
  if (!paneApi(app.focus)?.run?.(action)) toast(t('cmd.needList'))
}

export const ACTIONS: Action[] = [
  ...PRESET_IDS.map((p, i) => ({
    id: `layout.${p}`,
    label: () => t('act.layout', { name: presetName(p) }),
    key: `Ctrl+Shift+${i + 1}`,
    when: 'global' as const,
    run: () => setPreset(p),
  })),
  {
    id: 'layouts',
    label: () => t('act.layouts'),
    key: 'Ctrl+Shift+L',
    when: 'global',
    run: () => {
      app.overlay = { kind: 'layouts' }
    },
  },
  { id: 'max', label: () => t('act.max'), key: 'Ctrl+Shift+Enter', when: 'global', run: () => toggleMax() },
  { id: 'fav', label: () => t('act.fav'), key: 'Ctrl+D', when: 'global', run: () => toggleFav(focusedSymbol()) },
  { id: 'update', label: () => t('act.update'), key: 'F5', when: 'global', run: () => startUpdate() },
  { id: 'refetch', label: () => t('act.updateSel'), key: 'Shift+F5', when: 'global', run: () => refetchSelected() },
  { id: 'refetchList', label: () => t('act.refetchList'), run: () => refetchList() },
  { id: 'universe', label: () => t('act.universe'), run: () => void rpc('jobs.start', { kind: 'universe' }) },
  {
    id: 'settings',
    label: () => t('act.settings'),
    key: 'Ctrl+,',
    when: 'global',
    run: () => {
      app.overlay = { kind: 'settings' }
    },
  },
  {
    id: 'data',
    label: () => t('act.data'),
    run: () => {
      app.overlay = { kind: 'settings', tab: 'data' }
    },
  },
  {
    id: 'keys',
    label: () => t('act.keys'),
    run: () => {
      app.overlay = { kind: 'settings', tab: 'keys' }
    },
  },
  { id: 'lang', label: () => t('act.lang'), run: () => saveSettings({ lang: app.settings.lang === 'ja' ? 'en' : 'ja' }) },
  { id: 'theme', label: () => t('act.theme'), run: () => saveSettings({ theme: app.settings.theme === 'dark' ? 'light' : 'dark' }) },
  { id: 'candle', label: () => t('act.candle'), run: () => saveSettings({ candleStyle: app.settings.candleStyle === 'jp' ? 'us' : 'jp' }) },
  {
    id: 'density',
    label: () => t('act.density'),
    run: () => saveSettings({ density: app.settings.density === 'normal' ? 'compact' : 'normal' }),
  },
  {
    id: 'help',
    label: () => t('act.help'),
    key: 'F1',
    when: 'global',
    run: () => {
      app.overlay = { kind: 'help' }
    },
  },
  {
    id: 'screens',
    label: () => t('act.screens'),
    key: 'Ctrl+O',
    when: 'late',
    run: () => {
      app.overlay = { kind: 'screens' }
    },
  },
  { id: 'resetSizes', label: () => t('act.resetSizes'), key: 'Ctrl+Alt+R', when: 'global', run: () => doResetSizes() },
  { id: 'resetLayout', label: () => t('act.resetLayout'), run: () => doResetLayout() },
  { id: 'drawer', label: () => t('act.drawer'), key: 'Ctrl+B', when: 'global', run: () => toggleDock('left') },
  { id: 'drawerRight', label: () => t('act.drawerRight'), key: 'Ctrl+Shift+B', when: 'global', run: () => toggleDock('right') },
  { id: 'drawerPin', label: () => t('act.drawerPin'), key: 'Ctrl+Alt+B', when: 'global', run: () => pinDock() },
  ...(['right', 'left', 'bottom', 'top'] as const).map((side) => ({
    id: `paneToEdge-${side}`,
    label: () => t(`act.paneToEdge.${side}` as Key),
    run: () => {
      const id = app.focus
      if (!id || !moveToEdge(id, side)) return toast(t('layout.cannotMove'))
      layout.dockOpen = null
      setFocus(id)
    },
  })),
  { id: 'toDrawer', label: () => t('act.toDrawer'), run: () => toDrawer('left') },
  { id: 'toDrawerRight', label: () => t('act.toDrawerRight'), run: () => toDrawer('right') },
  { id: 'fromDrawer', label: () => t('act.fromDrawer'), run: () => fromDrawer() },
  { id: 'openGrid', label: () => t('act.openGrid'), key: 'Ctrl+Shift+G', when: 'global', run: () => openInGrid() },
  {
    id: 'addTo',
    label: () => t('act.addTo'),
    key: 'Ctrl+Shift+A',
    when: 'late',
    run: () => addToListDialog(paneApi(app.focus)?.selected?.() ?? (focusedSymbol() ? [focusedSymbol()!] : [])),
  },
  { id: 'newList', label: () => t('act.newList'), run: () => newList() },
  { id: 'duplicateList', label: () => t('act.duplicateList'), run: paneRun('duplicate') },
  { id: 'columns', label: () => t('act.columns'), run: paneRun('columns') },
  { id: 'limit', label: () => t('act.limit'), run: paneRun('limit') },
  { id: 'exportCsv', label: () => t('act.exportCsv'), run: () => exportListCsv() },
  { id: 'exportBars', label: () => t('act.exportBars'), run: () => exportBarsCsv() },
  { id: 'importCodes', label: () => t('act.importCodes'), run: () => importCodes() },
  { id: 'exportUser', label: () => t('act.exportUser'), run: () => exportUser() },
  { id: 'importUser', label: () => t('act.importUser'), run: () => importUser() },
  { id: 'portfolio', label: () => t('act.portfolio'), run: () => openPane('portfolio') },
  { id: 'importBrokerCsv', label: () => t('act.importBrokerCsv'), run: () => importBrokerCsv() },
  { id: 'exportHoldings', label: () => t('act.exportHoldings'), run: () => exportHoldings() },
  { id: 'importHoldings', label: () => t('act.importHoldings'), run: () => importHoldings() },
  { id: 'undoHoldings', label: () => t('act.undoHoldings'), run: () => undoHoldingsImport() },
  { id: 'backupDb', label: () => t('act.backupDb'), run: () => backupDb() },
  { id: 'openLogs', label: () => t('act.openLogs'), run: () => void window.elecxstock.openLogs() },
  { id: 'checkUpdate', label: () => t('act.checkUpdate'), run: () => checkUpdate(true) },
  { id: 'split', label: () => t('act.split'), key: 'Ctrl+Shift+E', when: 'global', run: () => focusNew(splitPane(app.focus ?? '', 'row')) },
  {
    id: 'splitDown',
    label: () => t('act.splitDown'),
    key: 'Ctrl+Shift+O',
    when: 'global',
    run: () => focusNew(splitPane(app.focus ?? '', 'col')),
  },
  {
    id: 'close',
    label: () => t('act.close'),
    key: 'Ctrl+Shift+W',
    when: 'global',
    run: async () => {
      const id = app.focus
      if (id && (await confirmCloseScreen(findPane(id)))) closePane(id)
    },
  },
  { id: 'changeWidget', label: () => t('act.changeWidget'), key: 'Ctrl+Shift+N', when: 'global', run: () => changeWidgetDialog() },
  { id: 'jobs', label: () => t('act.jobs'), run: () => openPane('jobs') },
  { id: 'fullscreen', label: () => t('act.fullscreen'), key: 'F11', when: 'global', run: () => toggleFullscreen() },
  // アプリを終了する。閉じる前の保存（beforeunload）はウィンドウを閉じるときと同じ
  { id: 'quit', label: () => t('act.quit'), key: 'Ctrl+Shift+Q', when: 'global', run: () => window.close() },
]

function focusNew(id: string | null): void {
  if (id) setFocus(id)
}
function toDrawer(side: DockSide): void {
  const id = app.focus
  if (!id) return
  if (!moveToDock(id, side)) {
    toast(t('layout.cannotMove'))
    return
  }
  layout.dockOpen = side
  setFocus(id)
}
function fromDrawer(): void {
  const id = app.focus
  if (!id || !moveFromDock(id)) {
    toast(t('layout.cannotMove'))
    return
  }
  layout.dockOpen = null
  setFocus(id)
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
    .map((el) => ({ id: el.dataset.paneId ?? `__rail:${el.dataset.dockRail}`, r: el.getBoundingClientRect() }))
    .filter((x) => x.r.width > 0)
}
const railOf = (id: string) => (id.startsWith('__rail:') ? (id.slice(7) as DockSide) : null)
export function moveFocus(dir: 'left' | 'right' | 'up' | 'down'): void {
  const sel = app.focus ? `[data-pane-id="${app.focus}"]` : '[data-dock-rail]:focus'
  const cur = (document.querySelector<HTMLElement>(sel) ?? document.querySelector<HTMLElement>('[data-dock-rail]'))?.getBoundingClientRect()
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
  if (!best) return
  const rail = railOf(best)
  if (rail) focusRail(rail)
  else setFocus(best)
}
/** 閉じているドロワーの帯にフォーカスを置く（FR-DR4）。帯にいる間の ↑↓ はドロワーの一覧に届く */
export function focusRail(side: DockSide = 'left'): void {
  app.focus = null
  document.querySelector<HTMLElement>(`[data-dock-rail="${side}"]`)?.focus()
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
  const focusedRail = (document.activeElement as HTMLElement | null)?.dataset?.dockRail
  const cur = app.focus ?? (focusedRail ? `__rail:${focusedRail}` : ids[0]!)
  const i = ids.indexOf(cur)
  const next = ids[(i + (back ? -1 : 1) + ids.length) % ids.length]!
  const rail = railOf(next)
  if (rail) focusRail(rail)
  else setFocus(next)
}

const ARROW: Record<string, 'left' | 'right' | 'up' | 'down'> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }
const inText = (e: KeyboardEvent) => (e.target as HTMLElement)?.matches?.('input, textarea, select')
function runMatching(e: KeyboardEvent, when: 'global' | 'late'): boolean {
  for (const a of ACTIONS) {
    if ((a.when ?? 'global') !== when) continue
    if (matches(e, keyOf(a))) {
      void a.run()
      return true
    }
  }
  return false
}

/** 設定でキーを割り当てている間は、アプリ全体のキー処理を止める（FR-KB6） */
export const keyCapture = { on: false }

/** アプリ全体のキー処理（§6.5）。true を返したら既定の動作を止める */
export function handleKey(e: KeyboardEvent): boolean {
  if (e.isComposing || keyCapture.on) return false
  const ctrl = e.ctrlKey || e.metaKey
  const c = e.code
  if (app.overlay) {
    if (c === 'Escape') {
      closeOverlay()
      return true
    }
    if (matches(e, keyOf('help')) && app.overlay.kind === 'help') {
      closeOverlay()
      return true
    }
    if (ctrl && !e.shiftKey && c === 'KeyK' && app.overlay.kind !== 'palette') {
      closeOverlay() // 答えを待っているダイアログには「取り消し」を返してから
      app.overlay = { kind: 'palette' }
      return true
    }
    return false
  }
  if (matches(e, keyOf('help'))) return run('help')
  if (ctrl && !e.shiftKey && !e.altKey && c === 'KeyK') {
    app.overlay = { kind: 'palette' }
    return true
  }
  if (inText(e)) return false
  const pane = paneApi(app.focus)
  // ドロワーのタブを切り替える（Ctrl+Tab / Ctrl+Shift+Tab）
  const side = dockOf(app.focus)
  const dk = side ? layout.entry.docks[side] : undefined
  if (ctrl && c === 'Tab' && dk && dk.panes.length > 1) {
    dk.active = (dk.active + (e.shiftKey ? -1 : 1) + dk.panes.length) % dk.panes.length
    setFocus(dk.panes[dk.active]!.id)
    saveLayout()
    return true
  }
  if (c === 'Escape') {
    if (pane?.key?.(e)) return true
    if (app.maximized) {
      app.maximized = null
      return true
    }
    const open = layout.dockOpen
    if (open && !layout.entry.docks[open]?.pinned) {
      toggleDock(open)
      return true
    }
    return false
  }
  // リンク色（Ctrl+0〜5）は割り当てを変えない
  if (ctrl && !e.shiftKey && !e.altKey && /^Digit[0-5]$/.test(c)) {
    const p = findPane(app.focus)
    if (p) {
      const was = paneSymbol(p)
      p.link = Number(c.slice(5))
      if (!p.link && was) p.state = { ...p.state, sym: was }
      saveLayout()
      toast(t('link.set', { n: p.link || '—' }))
    }
    return true
  }
  if (ctrl && !e.shiftKey && !e.altKey && c === 'KeyZ' && canUndoReset()) {
    undoResetSizes()
    toast(t('layout.undone'))
    return true
  }
  if (runMatching(e, 'global')) return true
  if (c === 'F6') {
    cycle(e.shiftKey)
    return true
  }
  // ペイン自身のキー（一覧の ↑↓、チャートの D/W/M、グリッドの Space など）
  if (pane?.key?.(e)) return true
  if (runMatching(e, 'late')) return true
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

/** アクションを ID で実行する（ステータスバーのボタンなど、キー以外から呼ぶとき） */
export function runAction(id: string): boolean {
  return run(id)
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
