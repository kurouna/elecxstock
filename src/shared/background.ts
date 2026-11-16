// 常駐と自動起動の判断（FR-BG1〜BG8。docs/design-background.md）。純粋な関数で、main（src/main/background.ts）と設定の画面が共有する。
// 実行（窓の出し入れ・トレイ・サインイン時の起動の登録）は main が行う
import type { Lang } from './types'

/** サインインで起動したとき、窓を出さずに通知領域で始める */
export const HIDDEN_ARG = '--hidden'
/** 動いている elecxstock を、保存を終えてから終わらせる（インストーラが使う） */
export const QUIT_ARG = '--quit'
/** サインイン時の起動の登録（HKCU の Run キー）の値の名前。アンインストーラ（build/installer.nsh）が同じ名前で消す */
export const LOGIN_ITEM_NAME = 'dev.kurouna.elecxstock'

/** main が判断に使う、保存した設定（settings.json。Core が書く）の一部 */
export interface SavedBackground {
  closeToTray: boolean
  lang: Lang
  /** 初回の同意と初回の取り込みが済んでいる（隠して起動してよい） */
  ready: boolean
}

/** settings.json の中身（{ version, data } か平たい形）を読む。無い・壊れている・知らない値は既定（オフ） */
export function savedBackground(text: string | null): SavedBackground {
  let o: Record<string, unknown> = {}
  try {
    const raw = text ? (JSON.parse(text) as unknown) : null
    if (raw && typeof raw === 'object') {
      const d = (raw as { data?: unknown }).data
      o = (d && typeof d === 'object' ? d : raw) as Record<string, unknown>
    }
  } catch {
    /* 既定 */
  }
  return {
    closeToTray: o.closeToTray === true,
    lang: o.lang === 'en' ? 'en' : 'ja',
    ready: o.disclaimerAccepted === true && o.firstRunDone === true,
  }
}

/** 窓の × を押されたとき: 1 枚目はしまう設定がオンで終了の途中でなければ隠す。フリー N は単独で閉じる */
export function decideClose(o: { slot: string; closeToTray: boolean; quitting: boolean }): 'hide' | 'close' {
  return o.slot === 'main' && o.closeToTray && !o.quitting ? 'hide' : 'close'
}

export type LaunchAction = 'quit' | 'hidden' | 'open'

/** 起動の引数から、何のための起動かを決める（--quit は --hidden より強い） */
export function launchAction(argv: readonly string[]): LaunchAction {
  if (argv.includes(QUIT_ARG)) return 'quit'
  if (argv.includes(HIDDEN_ARG)) return 'hidden'
  return 'open'
}

/**
 * 動いている 1 つ目が二度目の起動を受け取ったとき（data は requestSingleInstanceLock の additionalData）。
 * 終了の途中は何もしない（app.quit() をもう一度呼ぶと、保存の流し込みと Core の停止を待たずに終わる）。知らない形は open（古い版から）
 */
export function secondInstance(data: unknown, quitting: boolean): 'quit' | 'reveal' | 'none' {
  if (quitting) return 'none'
  const action = data && typeof data === 'object' ? (data as { action?: unknown }).action : undefined
  if (action === 'quit') return 'quit'
  if (action === 'hidden') return 'none'
  return 'reveal'
}

/** 窓を出さずに始めるか。初回が済んでいなければ出す（見えない初回の画面で止まらないように） */
export const startHiddenNow = (action: LaunchAction, saved: SavedBackground): boolean => action === 'hidden' && saved.ready

/** サインイン時の起動の引数 */
export const loginArgs = (hidden: boolean): string[] => (hidden ? [HIDDEN_ARG] : [])

/** Electron の LoginItemSettings.launchItems の 1 件（使うところだけ） */
export interface LaunchItemLike {
  name: string
  scope: string
  enabled: boolean
}

/** サインイン時の起動の状態。正は Windows の登録で、毎回読み直す */
export interface LoginState {
  /** 登録できる（インストールした版） */
  available: boolean
  /** 登録されていて、無効にされていない */
  on: boolean
  /** 登録の引数が --hidden（通知領域に入れておく） */
  hidden: boolean
  /** 登録はあるが、タスクマネージャー（または Windows の設定）で無効にされている */
  disabledByOs: boolean
}

/** 自分の名前の、利用者ごとの登録を探して状態にする。hiddenMatch は引数 --hidden で比べたときの openAtLogin（Electron は引数を読み戻せない） */
export function loginState(available: boolean, items: readonly LaunchItemLike[], hiddenMatch: boolean): LoginState {
  const own = available ? items.find((x) => x.name === LOGIN_ITEM_NAME && x.scope === 'user') : undefined
  return { available, on: !!own?.enabled, hidden: !!own && hiddenMatch, disabledByOs: !!own && !own.enabled }
}

export type LoginNote = 'dev' | 'disabledByOs' | null

/** 設定の画面の 3 つのスイッチの、押せるか・オンか・注意 */
export interface LoginView {
  closeToTray: { disabled: boolean }
  login: { disabled: boolean; on: boolean; note: LoginNote }
  hidden: { disabled: boolean; on: boolean }
}

/**
 * s が null（main からまだ読めていない）の間は、サインイン時の起動の 2 つを押せず、注意も出さない（開発版の注意が一瞬出ないように）。
 * 読み取り専用の間は「閉じても残す」を押せない（保存に失敗しても画面の値だけが変わり、main が読むファイルとずれるため）。
 * サインイン時の起動は Windows の登録が正なので押せる。「通知領域に入れておく」はサインイン時の起動がオンのときだけ
 */
export function loginView(s: LoginState | null, o: { readOnly: boolean }): LoginView {
  if (!s)
    return {
      closeToTray: { disabled: o.readOnly },
      login: { disabled: true, on: false, note: null },
      hidden: { disabled: true, on: false },
    }
  return {
    closeToTray: { disabled: o.readOnly },
    login: { disabled: !s.available, on: s.on, note: !s.available ? 'dev' : s.disabledByOs ? 'disabledByOs' : null },
    hidden: { disabled: !s.on, on: s.on && s.hidden },
  }
}

export type TrayItem = { id: 'open' | 'settings' | 'quit'; label: string } | { id: 'separator' }

/** トレイの右クリックのメニュー（アイコンはしまうたびに作り直すので、作るときの言語にする） */
export function trayMenu(lang: Lang): TrayItem[] {
  const ja = lang === 'ja'
  return [
    { id: 'open', label: ja ? 'elecxstock を開く' : 'Open elecxstock' },
    { id: 'settings', label: ja ? '設定' : 'Settings' },
    { id: 'separator' },
    { id: 'quit', label: ja ? 'elecxstock を終了' : 'Quit elecxstock' },
  ]
}

/** 初めてしまったときの Windows の通知（Windows 11 は新しいアイコンを ^ の中に入れる） */
export function trayHint(lang: Lang): { title: string; body: string } {
  return lang === 'ja'
    ? {
        title: 'elecxstock は通知領域で動いています',
        body: 'タスクバーの ^ の中のアイコンから開けます。終了はアイコンのメニューか Ctrl+Shift+Q で。',
      }
    : {
        title: 'elecxstock is still running',
        body: 'Open it from its icon under ^ on the taskbar. Quit from the icon menu or with Ctrl+Shift+Q.',
      }
}
