// アプリ全体の状態（Svelte 5 runes）。Core とのやりとりは rpc() だけを通す。

import type { CoreError, Method, Params, Results } from '@shared/api'
import type {
  AppInfo,
  Condition,
  DataStatus,
  Holding,
  Instrument,
  InstrumentId,
  JobProgress,
  MetricsRow,
  SavedLayout,
  SavedScreen,
  Settings,
  Watchlist,
} from '@shared/types'
import { SvelteMap } from 'svelte/reactivity'
import { DICTS, format, type Key } from '../lib/i18n'

const raw = window.elecxstock
/** Core への窓口。Svelte の状態（Proxy）は構造化複製できないので、送る前に必ずスナップショットにする */
export const bridge: typeof raw = {
  ...raw,
  call: (method, params) => raw.call(method, $state.snapshot(params) as typeof params),
  on: raw.on,
  prioritize: (ids) => raw.prioritize([...ids]),
}

export const DEFAULT_SETTINGS: Settings = {
  lang: 'ja',
  candleStyle: 'jp',
  density: 'normal',
  uiScale: 1,
  retentionYears: 5,
  disclaimerAccepted: false,
  firstRunDone: false,
  userInstruments: [],
  reduceMotion: false,
  theme: 'dark',
  autoUpdate: true,
  checkUpdates: true,
  keymap: {},
  maPeriods: { D: [5, 25, 75], W: [13, 26, 52], M: [12, 24, 60] },
}

export type Overlay =
  | { kind: 'palette'; q?: string; title?: string }
  | { kind: 'jump'; first: string }
  | { kind: 'help' }
  | { kind: 'settings'; tab?: string }
  | { kind: 'screens' }
  | { kind: 'firstrun' }
  | {
      kind: 'confirm'
      title: string
      body?: string
      items?: string[]
      ok: string
      danger?: boolean
      check?: string
      resolve: (v: { ok: boolean; checked: boolean }) => void
    }
  | { kind: 'prompt'; title: string; value: string; resolve: (v: string | null) => void }
  | { kind: 'choice'; title: string; choices: { id: string; label: string; hint?: string }[]; resolve: (v: string | null) => void }
  | { kind: 'ask3'; title: string; body: string; resolve: (v: 'save' | 'discard' | 'cancel') => void }
  | {
      kind: 'checklist'
      title: string
      hint?: string
      items: CheckItem[]
      reorder: boolean
      resolve: (v: CheckItem[] | null) => void
    }
  | { kind: 'layouts' }

export interface CheckItem {
  id: string
  label: string
  on: boolean
  hint?: string
}

export interface Toast {
  id: number
  kind?: 'info' | 'error'
  msg: string
  action?: { label: string; run: () => void }
  ms: number
}

class AppState {
  ready = $state(false)
  info = $state<AppInfo | null>(null)
  settings = $state<Settings>({ ...DEFAULT_SETTINGS })
  watchlists = $state<Watchlist[]>([])
  screens = $state<SavedScreen[]>([])
  readOnly = $state(false)
  userError = $state<string | null>(null)
  instruments = new SvelteMap<InstrumentId, Instrument>()
  metrics = new SvelteMap<InstrumentId, MetricsRow>()
  dataVersion = $state(0)
  /** 直近の data.updated で変わった銘柄（'*' はすべて）。チャートは自分の銘柄が含まれるときだけ読み直す */
  updatedIds = $state<Set<InstrumentId> | '*'>('*')
  jobs = $state<JobProgress[]>([])
  status = $state<DataStatus | null>(null)
  provider = $state<{ offline: boolean; paused: boolean; message?: string }>({ offline: false, paused: false })
  focus = $state<string | null>(null)
  overlay = $state<Overlay | null>(null)
  toasts = $state<Toast[]>([])
  maximized = $state<string | null>(null)
  /** スクリーナーで今開いている条件（未保存の変更を含む）。chart-grid の「スクリーナーの結果」に使う */
  liveConds = $state<Condition[]>([])
  liveScreenId = $state<string | null>(null)
  /** 名前を付けて保存したレイアウト（FR-L4 の P2） */
  layouts = $state<SavedLayout[]>([])
  /** 保有の記録（FR-H7）。数量・平均取得単価は Core が取引から計算したもの */
  holdings = $state<Holding[]>([])
  /** 新しい版（NFR-Q9） */
  update = $state<{ version: string; url: string } | null>(null)
}
export const app = new AppState()

export function t(key: Key, args?: Record<string, string | number>): string {
  return format(DICTS[app.settings.lang][key] ?? key, args)
}

let toastSeq = 0
export function toast(msg: string, action?: Toast['action'], ms = 2200, kind: Toast['kind'] = 'info'): void {
  const id = ++toastSeq
  app.toasts = [...app.toasts.slice(-2), { id, kind, msg, ...(action ? { action } : {}), ms }]
  setTimeout(() => {
    app.toasts = app.toasts.filter((x) => x.id !== id)
  }, ms)
}

/** Core を呼ぶ。エラーはコードで受け取り、文言はここで訳す（FR-N5） */
export async function rpc<M extends Method>(method: M, params: Params<M>): Promise<Results[M]> {
  try {
    return await bridge.call(method, params)
  } catch (e) {
    const err = e as CoreError
    if (err?.code === 'read-only') toast(t('err.readOnly'), undefined, 6000, 'error')
    else if (err?.code === 'busy') toast(t('err.busy'), undefined, 4000, 'error')
    else toast(t('err.generic', { msg: err?.message || err?.code || String(e) }), undefined, 10_000, 'error')
    throw e
  }
}

// ---------------------------------------------------------------- instruments & metrics
export function inst(id: InstrumentId | null | undefined): Instrument | undefined {
  return id ? app.instruments.get(id) : undefined
}
export function nameOf(id: InstrumentId | null | undefined): string {
  const i = inst(id)
  if (!i) return id?.replace(/^\w+:/, '') ?? ''
  return app.settings.lang === 'en' && i.nameEn ? i.nameEn : i.nameJa
}
export function codeOf(id: InstrumentId | null | undefined): string {
  return id ? (inst(id)?.code ?? id.replace(/^\w+:/, '')) : ''
}
export async function loadInstruments(): Promise<void> {
  const all = await rpc('instruments.all', {})
  for (const i of all) app.instruments.set(i.id, i)
}
const pendingMetrics = new Set<InstrumentId>()
let metricsTimer: ReturnType<typeof setTimeout> | null = null
/** 一覧に出す銘柄の指標を、まとめて取ってきてキャッシュする */
export function ensureMetrics(ids: InstrumentId[]): void {
  for (const id of ids) if (!app.metrics.has(id)) pendingMetrics.add(id)
  if (!pendingMetrics.size || metricsTimer) return
  metricsTimer = setTimeout(async () => {
    metricsTimer = null
    const want = [...pendingMetrics]
    pendingMetrics.clear()
    try {
      const rows = await bridge.call('metrics.get', { ids: want })
      for (const r of rows) app.metrics.set(r.id, r)
      // 指標の無い銘柄の名前も取っておく
      const missing = want.filter((id) => !app.instruments.has(id))
      if (missing.length) for (const i of await bridge.call('instruments.get', { ids: missing })) app.instruments.set(i.id, i)
    } catch {
      /* ignore */
    }
  }, 16)
}
export function metric(id: InstrumentId | null | undefined): MetricsRow | undefined {
  return id ? app.metrics.get(id) : undefined
}

// ---------------------------------------------------------------- user data
export function favorites(): Watchlist {
  return app.watchlists.find((w) => w.builtin === 'favorites')!
}
export function candidates(): Watchlist {
  return app.watchlists.find((w) => w.builtin === 'candidates')!
}
export function isFav(id: InstrumentId | null | undefined): boolean {
  return !!id && !!favorites()?.items.includes(id)
}
export function isCand(id: InstrumentId | null | undefined): boolean {
  return !!id && !!candidates()?.items.includes(id)
}
let saveListsTimer: ReturnType<typeof setTimeout> | null = null
/** その銘柄のデータが直近の更新で変わったか（チャートの読み直しの判定） */
export function touched(id: InstrumentId): boolean {
  return app.updatedIds === '*' || app.updatedIds.has(id)
}
export function saveWatchlists(): void {
  if (saveListsTimer) clearTimeout(saveListsTimer)
  saveListsTimer = setTimeout(flushWatchlists, 150)
}
function flushWatchlists(): void {
  saveListsTimer = null
  void rpc('user.saveWatchlists', { watchlists: $state.snapshot(app.watchlists) }).catch(() => {})
}
/** 閉じる前に、遅らせている保存を確定させる */
export function flushListSaves(): void {
  if (saveListsTimer) {
    clearTimeout(saveListsTimer)
    flushWatchlists()
  }
}
export function toggleFav(id: InstrumentId | null | undefined): void {
  if (!id) return
  const f = favorites()
  if (f.items.includes(id)) {
    f.items = f.items.filter((x) => x !== id)
    toast(t('fav.off', { name: nameOf(id) }))
  } else {
    f.items = [...f.items, id]
    toast(t('fav.on', { name: nameOf(id) }))
  }
  saveWatchlists()
}
export function toggleCand(id: InstrumentId | null | undefined): void {
  if (!id) return
  const c = candidates()
  if (c.items.includes(id)) {
    c.items = c.items.filter((x) => x !== id)
    toast(t('cand.off', { name: nameOf(id) }))
  } else {
    c.items = [...c.items, id]
    toast(t('cand.on', { name: nameOf(id) }))
  }
  saveWatchlists()
}
export function addToList(listId: string, ids: InstrumentId[]): void {
  const l = app.watchlists.find((w) => w.id === listId)
  if (!l) return
  const add = ids.filter((id) => !l.items.includes(id))
  l.items = [...l.items, ...add]
  saveWatchlists()
  if (ids.length) toast(t('list.added', { list: listName(l), name: ids.length === 1 ? nameOf(ids[0]) : `${ids.length}` }))
}
export function listName(l: Watchlist): string {
  return app.settings.lang === 'en' ? l.name.en || l.name.ja : l.name.ja
}
export function screenName(s: SavedScreen): string {
  return app.settings.lang === 'en' ? s.name.en || s.name.ja : s.name.ja
}
export function saveScreens(): void {
  void rpc('user.saveScreens', { screens: $state.snapshot(app.screens) }).catch(() => {})
}
export function saveSettings(patch: Partial<Settings>): void {
  app.settings = { ...app.settings, ...patch }
  applySettingsToDom()
  void rpc('user.saveSettings', { settings: $state.snapshot(app.settings) }).catch(() => {})
}
export function applySettingsToDom(): void {
  const r = document.documentElement
  r.lang = app.settings.lang
  r.dataset.candle = app.settings.candleStyle
  r.dataset.density = app.settings.density
  r.dataset.reduceMotion = String(app.settings.reduceMotion)
  r.dataset.theme = app.settings.theme
  void raw.setChrome?.(app.settings.theme, app.settings.uiScale)
  r.style.zoom = String(app.settings.uiScale)
}

// ---------------------------------------------------------------- overlays（promise で答えを待つ）
export function confirmDialog(o: {
  title: string
  body?: string
  items?: string[]
  ok: string
  danger?: boolean
  check?: string
}): Promise<{ ok: boolean; checked: boolean }> {
  return new Promise((resolve) => {
    app.overlay = { kind: 'confirm', ...o, resolve }
  })
}
export function promptDialog(title: string, value: string): Promise<string | null> {
  return new Promise((resolve) => {
    app.overlay = { kind: 'prompt', title, value, resolve }
  })
}
export function choiceDialog(title: string, choices: { id: string; label: string; hint?: string }[]): Promise<string | null> {
  return new Promise((resolve) => {
    app.overlay = { kind: 'choice', title, choices, resolve }
  })
}
export function ask3(title: string, body: string): Promise<'save' | 'discard' | 'cancel'> {
  return new Promise((resolve) => {
    app.overlay = { kind: 'ask3', title, body, resolve }
  })
}
/** 項目の入切と並べ替え（列の選択・指標のメニュー）。Space で入切、Alt+↑↓ で並べ替え、Enter で決める */
export function checklistDialog(title: string, items: CheckItem[], reorder = false, hint?: string): Promise<CheckItem[] | null> {
  return new Promise((resolve) => {
    app.overlay = { kind: 'checklist', title, items: items.map((x) => ({ ...x })), reorder, ...(hint ? { hint } : {}), resolve }
  })
}
/** オーバーレイを閉じる（答えを待っているものには「取り消し」を返す） */
export function closeOverlay(): void {
  const o = app.overlay
  app.overlay = null
  if (!o) return
  if (o.kind === 'confirm') o.resolve({ ok: false, checked: false })
  else if (o.kind === 'prompt' || o.kind === 'choice' || o.kind === 'checklist') o.resolve(null)
  else if (o.kind === 'ask3') o.resolve('cancel')
}
