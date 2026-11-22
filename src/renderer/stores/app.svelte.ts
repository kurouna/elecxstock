// アプリ全体の状態（Svelte 5 runes）。Core とのやりとりは rpc() だけを通す。

import type { CoreError, Method, Params, Results } from '@shared/api'
import { DEFAULT_SETTINGS } from '@shared/settings'
import type {
  Alert,
  AlertView,
  AppInfo,
  Condition,
  DataStatus,
  Holding,
  Instrument,
  InstrumentId,
  JobProgress,
  MetricsRow,
  PortfolioMeta,
  SavedScreen,
  Settings,
  Watchlist,
} from '@shared/types'
import { SvelteMap } from 'svelte/reactivity'
import { DICTS, format, type Key } from '../lib/i18n'
import type { ShapeFig } from '../lib/shapeFigs'
import { IS_FREE } from '../lib/windowSlot'
import type { WidgetId } from './layout.svelte'

const raw = window.elecxstock
/** Core への窓口。Svelte の状態（Proxy）は構造化複製できないので、送る前に必ずスナップショットにする */
export const bridge: typeof raw = {
  ...raw,
  call: (method, params) => raw.call(method, $state.snapshot(params) as typeof params),
  on: raw.on,
  prioritize: (ids) => raw.prioritize([...ids]),
}

export { DEFAULT_SETTINGS }

export type Overlay =
  | { kind: 'palette'; q?: string; title?: string }
  | { kind: 'jump'; first: string }
  /** ショートカット一覧（F1）。q があればその語で絞り込んで開く（コマンドバーのペインの中のキーから） */
  | { kind: 'help'; q?: string }
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
  | { kind: 'choice'; title: string; choices: Choice[]; resolve: (v: string | null) => void }
  | { kind: 'ask3'; title: string; body: string; resolve: (v: 'save' | 'discard' | 'cancel') => void }
  | {
      kind: 'checklist'
      title: string
      hint?: string
      items: CheckItem[]
      reorder: boolean
      resolve: (v: CheckItem[] | null) => void
    }
  | { kind: 'pageMenu' }
  /** ペインの種類を選ぶ（Ctrl+Shift+N と、分割の続き。docs/design-dialogs.md §5） */
  | { kind: 'widgetPicker'; mode: 'change' | 'split'; dir?: 'row' | 'col'; paneId: string; resolve: (w: WidgetId | null) => void }
  | { kind: 'holding'; holding?: Holding; resolve: (h: Holding | null) => void }
  /** アラートのポップアップ（FR-AL8）。tab が無ければ、未読があれば履歴 */
  | { kind: 'alerts'; tab?: 'alerts' | 'history' }
  /** アラートを作る・直すダイアログ（FR-AL7） */
  | { kind: 'alertForm'; edit?: AlertView; symbol?: InstrumentId; screenId?: string; resolve: (a: AlertDraft | null) => void }
  /** スクリーナーの条件を選ぶダイアログ（docs/mock/fields.html）。onAdd があれば Shift+Enter で開いたまま続けて足せる */
  | {
      kind: 'fieldPicker'
      title: string
      fields: string[]
      used: string[]
      onAdd?: (id: string) => void
      resolve: (id: string | null) => void
    }

/** ダイアログで作った・直したアラート（id・基準日・作った日時は Core が付ける） */
export type AlertDraft = Pick<Alert, 'target' | 'conditions' | 'repeat' | 'enabled' | 'note'> & { id: string }

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
  #overlay = $state<Overlay | null>(null)
  /**
   * 開いているオーバーレイ。初回起動（firstrun）の間は、ほかのオーバーレイに置き換えない（閉じる＝同意・あとで、の null だけ通す）。
   * キー（handleKey）だけでなく、トレイの「設定」・通知のクリック・トーストのボタンなど、どの経路から開いても免責を飛ばさない（FR-FR1）
   */
  get overlay(): Overlay | null {
    return this.#overlay
  }
  set overlay(o: Overlay | null) {
    if (o && overlayLocked(this.#overlay, o)) return
    this.#overlay = o
  }
  toasts = $state<Toast[]>([])
  maximized = $state<string | null>(null)
  /** スクリーナーで今開いている条件（未保存の変更を含む）。chart-grid の「スクリーナーの結果」に使う */
  /** スクリーナーで編集中の条件（グリッドの「スクリーナーの結果」）。null はまだ触っていない */
  liveConds = $state<Condition[] | null>(null)
  liveScreenId = $state<string | null>(null)
  /** 保有の記録（FR-H7）。数量・平均取得単価は Core が取引から計算したもの */
  holdings = $state<Holding[]>([])
  /** 最後に取り込んだ証券会社の CSV の情報（FR-H11） */
  portfolioMeta = $state<PortfolioMeta | null>(null)
  /** 新しい版（NFR-Q9） */
  update = $state<{ version: string; url: string } | null>(null)
  /** 鳴ったアラートの未読の数（トップバーのベル。FR-AL5） */
  alertsUnread = $state(0)
  /** アラートか履歴が変わるたびに増やす（開いているポップアップが読み直す） */
  alertsRev = $state(0)
  /** アラートの一覧（ポップアップ・チャートの点線。FR-AL8・AL9） */
  alerts = $state<AlertView[]>([])
}
export const app = new AppState()

/**
 * スクリーンの結果と一覧の列の値を変えうる状態（docs/test-plan.md §8.1）。スクリーナー・グリッドのスクリーン・一覧の並べ替えは
 * screenInputs() を読んで、そのすべてに依存する（どれかを読み忘れて、変えても走り直さない不具合を防ぐ）。
 * 指標の値は dataVersion、ウォッチリストと★は watchlists、保有の条件と列は holdings。
 * ★・ウォッチリストの入れ外しは items を書き換えるだけ（配列は同じ）なので、中身まで読む（読まないと走り直さない）
 */
export const SCREEN_INPUTS = ['dataVersion', 'watchlists', 'holdings'] as const
/** 条件で今の銘柄を絞り込んだ ID（★・ウォッチリストの条件も今の中身で。パフォーマンス比較の取り込み） */
export async function screenIds(conditions: Condition[]): Promise<InstrumentId[]> {
  const r = await bridge.call('screener.run', {
    conditions,
    favorites: app.watchlists.find((w) => w.builtin === 'favorites')?.items ?? [],
    watchlists: Object.fromEntries(app.watchlists.map((w) => [w.id, w.items])),
  })
  return r.ids
}
export function screenInputs(): unknown[] {
  return SCREEN_INPUTS.map((k) => (k === 'watchlists' ? app.watchlists.map((w) => `${w.id}:${w.items.join(',')}`).join('|') : app[k]))
}

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
/** 一覧（取得の対象と、指標のある銘柄）を読み直す。対象から外れた銘柄は名前を残し、取得の対象の印だけ外す */
export async function loadInstruments(): Promise<void> {
  const all = await rpc('instruments.all', {})
  const seen = new Set<string>()
  for (const i of all) {
    app.instruments.set(i.id, i)
    seen.add(i.id)
  }
  for (const [id, i] of app.instruments) if (i.userAdded && !seen.has(id)) app.instruments.set(id, { ...i, userAdded: false })
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
/**
 * 取得の知らせ（data.updated をまとめたもの）を画面に映す: 手元の指標を新しい値で置き換えてから、dataVersion を上げる。
 * 先に消さない（FR-S11。消すと新しい値が届くまで、並べ替えた一覧で値の無い銘柄が最後に回って行が跳ねる）。
 * Core に指標が無くなった銘柄は消す。手元に無い銘柄は、表示するペインが ensureMetrics で取る
 */
export async function applyDataUpdated(ids: Set<InstrumentId> | '*'): Promise<void> {
  const want = (ids === '*' ? [...app.metrics.keys()] : [...ids]).filter((id) => app.metrics.has(id))
  if (want.length) {
    try {
      const rows = await bridge.call('metrics.get', { ids: want })
      const got = new Set<InstrumentId>()
      for (const r of rows) {
        app.metrics.set(r.id, r)
        got.add(r.id)
      }
      for (const id of want) if (!got.has(id)) app.metrics.delete(id)
    } catch {
      // 取れなかったら消して、表示するペインに取り直させる（前のやり方）
      for (const id of want) app.metrics.delete(id)
    }
  }
  app.updatedIds = ids
  app.dataVersion++
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
function flushWatchlists(): Promise<unknown> {
  saveListsTimer = null
  return rpc('user.saveWatchlists', { watchlists: $state.snapshot(app.watchlists) }).catch(() => {})
}
/** 閉じる前に、遅らせている保存を確定させる（終わるのを待てる） */
export function flushListSaves(): Promise<unknown> {
  if (!saveListsTimer) return Promise.resolve()
  clearTimeout(saveListsTimer)
  return flushWatchlists()
}
/** フリー N の★・◆: 利用者のデータは Core が書き、ほかの窓へ知らせる（マルチモニタ） */
function toggleViaCore(list: 'favorites' | 'candidates', id: InstrumentId, on: Key, off: Key): void {
  const was = (list === 'favorites' ? favorites() : candidates()).items.includes(id)
  void rpc('watchlists.toggleItem', { list, id })
    .then((ls) => {
      app.watchlists = ls
      toast(t(was ? off : on, { name: nameOf(id) }))
    })
    .catch(() => {}) // Core の立ち上げ直しの間など。★は変わらないまま（次の押下でやり直せる）
}
export function toggleFav(id: InstrumentId | null | undefined): void {
  if (!id) return
  if (IS_FREE) return void toggleViaCore('favorites', id, 'fav.on', 'fav.off')
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
  if (IS_FREE) return void toggleViaCore('candidates', id, 'cand.on', 'cand.off')
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
  if (IS_FREE) return void toast(t('win.notInFree'))
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
/** このウィンドウだけの文字の倍率（マルチモニタ R2）。設定の uiScale に掛ける */
export const winZoom = { v: 1 }
/** このウィンドウの倍率を 1 段変える（0 で戻す） */
export async function zoomThisWindow(step: number): Promise<void> {
  const z = await window.elecxstock.zoomWindow(step)
  if (typeof z !== 'number') return
  winZoom.v = z
  applySettingsToDom()
  toast(t('win.zoom', { pct: Math.round(z * 100) }))
}
export function applySettingsToDom(): void {
  const r = document.documentElement
  r.lang = app.settings.lang
  r.dataset.candle = app.settings.candleStyle
  r.dataset.density = app.settings.density
  r.dataset.reduceMotion = String(app.settings.reduceMotion)
  r.dataset.theme = app.settings.theme
  r.dataset.focusAlways = String(app.settings.focusAlways)
  void raw.setChrome?.(app.settings.theme, app.settings.uiScale * winZoom.v)
  r.style.zoom = String(Math.round(app.settings.uiScale * winZoom.v * 100) / 100)
}

// ---------------------------------------------------------------- overlays（promise で答えを待つ）
/** 初回起動（firstrun）の間は、ほかのオーバーレイを開かない（免責に同意するまで。FR-FR1）。app.overlay の setter と答えを待つダイアログが使う */
export function overlayLocked(cur: Overlay | null, next: Overlay): boolean {
  return cur?.kind === 'firstrun' && next.kind !== 'firstrun'
}
/** 答えを待つダイアログを開く。開けない（初回起動の間）ときは、待っている側が止まらないよう「取り消し」をすぐ返す */
function ask<T>(make: (resolve: (v: T) => void) => Overlay, cancel: NoInfer<T>): Promise<T> {
  return new Promise((resolve) => {
    const o = make(resolve)
    if (overlayLocked(app.overlay, o)) resolve(cancel)
    else app.overlay = o
  })
}
export function confirmDialog(o: {
  title: string
  body?: string
  items?: string[]
  ok: string
  danger?: boolean
  check?: string
}): Promise<{ ok: boolean; checked: boolean }> {
  return ask((resolve) => ({ kind: 'confirm', ...o, resolve }), { ok: false, checked: false })
}
export function promptDialog(title: string, value: string): Promise<string | null> {
  return ask((resolve) => ({ kind: 'prompt', title, value, resolve }), null)
}
/** 選ぶダイアログの選択肢。fig は形の図（新しいページ・ウィンドウの初めの形）。図があると、説明を名前の下に出す */
export interface Choice {
  id: string
  label: string
  hint?: string
  fig?: ShapeFig | undefined
}
export function choiceDialog(title: string, choices: Choice[]): Promise<string | null> {
  return ask((resolve) => ({ kind: 'choice', title, choices, resolve }), null)
}
/** 保有を足す・直すフォーム（FR-H7） */
export function holdingDialog(holding?: Holding): Promise<Holding | null> {
  return ask((resolve) => ({ kind: 'holding', ...(holding ? { holding } : {}), resolve }), null)
}
/** 条件を選ぶダイアログを開く。Enter で選んだ指標の ID を返す（取り消しは null）。onAdd は Shift+Enter で続けて足すたびに呼ぶ */
export function fieldPicker(o: { title: string; fields: string[]; used: string[]; onAdd?: (id: string) => void }): Promise<string | null> {
  return ask((resolve) => ({ kind: 'fieldPicker', ...o, resolve }), null)
}
/** 最近足した指標を覚える（条件を選ぶダイアログの「よく使う」。新しい順に 8 件） */
export function rememberField(id: string): void {
  const next = [id, ...app.settings.recentFields.filter((x) => x !== id)].slice(0, 8)
  if (next.join() !== app.settings.recentFields.join()) saveSettings({ recentFields: next })
}
export function alertDialog(o: { edit?: AlertView; symbol?: InstrumentId; screenId?: string }): Promise<AlertDraft | null> {
  return ask((resolve) => ({ kind: 'alertForm', ...o, resolve }), null)
}
export function ask3(title: string, body: string): Promise<'save' | 'discard' | 'cancel'> {
  return ask((resolve) => ({ kind: 'ask3', title, body, resolve }), 'cancel')
}
/** 項目の入切と並べ替え（列の選択・指標のメニュー）。Space で入切、Alt+↑↓ で並べ替え、Enter で決める */
export function checklistDialog(title: string, items: CheckItem[], reorder = false, hint?: string): Promise<CheckItem[] | null> {
  return ask(
    (resolve) => ({ kind: 'checklist', title, items: items.map((x) => ({ ...x })), reorder, ...(hint ? { hint } : {}), resolve }),
    null,
  )
}
/** ペインの種類を選ぶ（変える・分割の続き）。閉じたら null */
export function widgetPickerDialog(o: { mode: 'change' | 'split'; dir?: 'row' | 'col'; paneId: string }): Promise<WidgetId | null> {
  return ask((resolve) => ({ kind: 'widgetPicker', ...o, resolve }), null)
}
/** オーバーレイを閉じる（答えを待っているものには「取り消し」を返す） */
export function closeOverlay(): void {
  const o = app.overlay
  app.overlay = null
  if (!o) return
  if (o.kind === 'confirm') o.resolve({ ok: false, checked: false })
  else if (o.kind === 'prompt' || o.kind === 'choice' || o.kind === 'checklist') o.resolve(null)
  else if (o.kind === 'ask3') o.resolve('cancel')
  else if (o.kind === 'alertForm' || o.kind === 'fieldPicker' || o.kind === 'holding' || o.kind === 'widgetPicker') o.resolve(null)
}
