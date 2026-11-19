// 常駐と自動起動の実行（FR-BG1〜BG8。docs/design-background.md）。判断は src/shared/background.ts の純粋な関数で、ここは窓の出し入れ・トレイ・
// サインイン時の起動の登録を行うだけ。窓の一覧・位置の記録・保存の流し込みは index.ts から受け取る。
// ELECXSTOCK_BACKGROUND_STUB=1（スタブのプロバイダのときだけ）では、トレイとサインイン時の起動をメモリの上のスタブにし、
// globalThis.__elecxstockBackground から E2E が読む・操作する（実際のタスクバー・レジストリに触れない）
import {
  decideClose,
  HIDDEN_ARG,
  type LaunchItemLike,
  LOGIN_ITEM_NAME,
  type LoginState,
  loginArgs,
  loginState,
  type SavedBackground,
  trayHint,
  trayMenu,
} from '@shared/background'
import { app, type BrowserWindow, Menu, Notification, nativeImage, Tray } from 'electron'

export interface BackgroundDeps {
  /** 開いている窓（1 枚目が先） */
  windows(): { slot: string; win: BrowserWindow }[]
  /** 窓の位置を記録する（見えない窓は記録しない） */
  remember(slot: string, win: BrowserWindow): void
  saveState(): void
  /** 全窓の遅らせている保存を流し込む（待たない） */
  flush(): void
  /** 保存した設定（settings.json）を今読む */
  settings(): SavedBackground
  quitting(): boolean
  hintShown(): boolean
  markHint(): void
  /** 1 枚目に設定の画面を開かせる */
  openSettings(): void
  quit(): void
  /** トレイのアイコン（build/icon.ico） */
  icon: string
}

export interface Background {
  /** 窓の × を押されたとき、閉じずに通知領域へしまうか（しまうなら、もうしまった） */
  closing(slot: string): boolean
  /** すべての窓を隠して通知領域へ（初回だけ案内する） */
  putAway(hint?: boolean): void
  /** 隠れている窓をすべて出し、1 枚目を前に出す */
  reveal(): void
  /** 通知領域にしまっている最中か（このあと作る窓も隠して作る） */
  stowed(): boolean
  /** その窓を、しまうために隠しているか（隠した窓の位置は記録しない。最小化した窓は isVisible() が偽になるので、それとは分ける） */
  hidden(slot: string): boolean
  /** 窓を受け持つ。deferred は隠して作った窓の、出すときに当てる最大化・全画面 */
  attach(slot: string, win: BrowserWindow, deferred?: { maximized: boolean; fullScreen?: boolean }): void
  loginItem(): LoginState
  setLoginItem(on: boolean, hidden: boolean): LoginState
  /** 終了するとき: トレイのアイコンをすぐに消す（残すと Windows の通知領域にアイコンの影が残る） */
  dispose(): void
}

interface TrayLike {
  show(lang: SavedBackground['lang']): void
  hide(): void
  /** 終了するときにすぐ壊す（hide は次のイベントまで待つので、終了の途中では間に合わないことがある） */
  destroy(): void
}
interface LoginBackend {
  available: boolean
  read(): { items: LaunchItemLike[]; hiddenMatch: boolean }
  write(on: boolean, hidden: boolean): void
}

/** 本物のトレイ: しまっている間だけ作る。作るときの言語でメニューを作る（export は単体テストのため） */
export function realTray(icon: string, actions: Record<'open' | 'settings' | 'quit', () => void>): TrayLike {
  let tray: Tray | null = null
  /** hide() で、次のイベントで壊すのを待っているもの（その前に終了したら destroy() が壊す） */
  const doomed = new Set<Tray>()
  const kill = (t: Tray) => {
    doomed.delete(t)
    if (!t.isDestroyed()) t.destroy()
  }
  return {
    show(lang) {
      if (tray) return
      tray = new Tray(nativeImage.createFromPath(icon))
      tray.setToolTip('elecxstock')
      tray.setContextMenu(
        Menu.buildFromTemplate(
          trayMenu(lang).map((x) => (x.id === 'separator' ? { type: 'separator' } : { label: x.label, click: actions[x.id] })),
        ),
      )
      // 1 回目のクリックで消えるので、ダブルクリックは受けない
      tray.on('click', actions.open)
    },
    hide() {
      // トレイのクリック・メニューの中から呼ばれるので、そのイベントが終わってから壊す（途中で destroy すると落ちることがある）
      const t = tray
      tray = null
      if (!t) return
      doomed.add(t)
      setImmediate(() => kill(t))
    },
    destroy() {
      const t = tray
      tray = null
      if (t) kill(t)
      for (const d of [...doomed]) kill(d)
    },
  }
}

/** 本物のサインイン時の起動（HKCU の Run キー。Electron が書く）。開発版では electron.exe を登録してしまうので使わない */
function realLogin(): LoginBackend {
  return {
    available: app.isPackaged,
    read() {
      // 引数は読み戻せない（launchItems の args は常に空）が、openAtLogin は引数まで比べる
      const s = app.getLoginItemSettings({ path: process.execPath, args: [HIDDEN_ARG] })
      return { items: s.launchItems, hiddenMatch: s.openAtLogin }
    },
    write(on, hidden) {
      app.setLoginItemSettings({ openAtLogin: on, path: process.execPath, args: loginArgs(hidden), enabled: true, name: LOGIN_ITEM_NAME })
    },
  }
}

export function createBackground(deps: BackgroundDeps): Background {
  const stub = process.env.ELECXSTOCK_BACKGROUND_STUB === '1' && process.env.ELECXSTOCK_PROVIDER === 'stub'
  const deferred = new Map<string, { maximized: boolean; fullScreen?: boolean }>()
  const notes = new Set<Notification>()
  let hints = 0
  let stowed = false
  /** しまうために隠した窓（隠して作った窓を含む） */
  const hiddenSlots = new Set<string>()
  const main = () => deps.windows().find((w) => w.slot === 'main')?.win

  const actions = {
    open: () => bg.reveal(),
    settings: () => {
      bg.reveal()
      deps.openSettings()
    },
    quit: () => deps.quit(),
  }

  // ---- スタブ（E2E）
  const stubTray = {
    visible: false,
    lang: 'ja' as SavedBackground['lang'],
    menu: () => (stubTray.visible ? trayMenu(stubTray.lang).flatMap((x) => (x.id === 'separator' ? [] : [x.label])) : []),
    choose: (id: 'open' | 'settings' | 'quit') => stubTray.visible && actions[id](),
    click: () => stubTray.visible && actions.open(),
  }
  const stubLogin = {
    args: null as string[] | null,
    enabled: true,
    disable: () => {
      stubLogin.enabled = false
    },
  }
  const tray: TrayLike = stub
    ? {
        show: (lang) => {
          stubTray.visible = true
          stubTray.lang = lang
        },
        hide: () => {
          stubTray.visible = false
        },
        destroy: () => {
          stubTray.visible = false
        },
      }
    : realTray(deps.icon, actions)
  const login: LoginBackend = stub
    ? {
        available: true,
        read: () => ({
          items: stubLogin.args ? [{ name: LOGIN_ITEM_NAME, scope: 'user', enabled: stubLogin.enabled }] : [],
          hiddenMatch: !!stubLogin.args?.includes(HIDDEN_ARG),
        }),
        write: (on, hidden) => {
          stubLogin.args = on ? loginArgs(hidden) : null
          stubLogin.enabled = true
        },
      }
    : realLogin()

  /** 初めてしまったときだけ、^ の中にあることを Windows の通知で知らせる */
  function hintOnce(): void {
    if (deps.hintShown()) return
    deps.markHint()
    hints++
    if (stub || !Notification.isSupported()) return
    const n = new Notification(trayHint(deps.settings().lang))
    notes.add(n)
    n.on('close', () => notes.delete(n))
    n.on('click', () => {
      notes.delete(n)
      bg.reveal()
    })
    n.show()
  }

  const bg: Background = {
    closing(slot) {
      if (decideClose({ slot, closeToTray: deps.settings().closeToTray, quitting: deps.quitting() }) === 'close') return false
      bg.putAway()
      return true
    },
    putAway(hint = true) {
      const all = deps.windows().filter((w) => !w.win.isDestroyed())
      for (const { slot, win } of all) deps.remember(slot, win)
      deps.saveState()
      // 最小化したまま隠すとタスクバーのボタンが残ることがあるので、タスクバーからも外す（出すときに戻す）
      for (const { slot, win } of all) {
        hiddenSlots.add(slot)
        win.setSkipTaskbar(true)
        win.hide()
      }
      deps.flush()
      stowed = true
      tray.show(deps.settings().lang)
      if (hint) hintOnce()
    },
    reveal() {
      stowed = false
      const all = deps.windows().filter((w) => !w.win.isDestroyed())
      // しまうために隠した窓だけを出す（利用者が最小化しておいた窓はそのまま）。フリー N を先に出し、1 枚目を最後に出して前に置く
      for (const { slot, win } of [...all].reverse()) {
        if (!hiddenSlots.has(slot)) continue
        if (win.isMinimized()) win.restore()
        win.setSkipTaskbar(false)
        win.show()
      }
      const m = main()
      if (m && !m.isDestroyed()) {
        if (m.isMinimized()) m.restore()
        m.focus()
      }
      tray.hide()
    },
    stowed: () => stowed,
    hidden: (slot) => hiddenSlots.has(slot),
    attach(slot, win, d) {
      if (d) {
        deferred.set(slot, d)
        hiddenSlots.add(slot)
      }
      win.on('closed', () => hiddenSlots.delete(slot))
      // アプリを通らずに出た窓（タスクバーなど）も正す: 最小化と非表示が重なると、出しても操作を受け付けない窓に見える
      win.on('show', () => {
        hiddenSlots.delete(slot)
        if (win.isMinimized()) win.restore()
        win.setSkipTaskbar(false)
        const p = deferred.get(slot)
        if (p) {
          deferred.delete(slot)
          if (p.maximized) win.maximize()
          if (p.fullScreen) win.setFullScreen(true)
        }
        if (slot === 'main') {
          stowed = false
          tray.hide()
        }
      })
    },
    loginItem() {
      if (!login.available) return loginState(false, [], false)
      const r = login.read()
      return loginState(true, r.items, r.hiddenMatch)
    },
    setLoginItem(on, hidden) {
      if (login.available) login.write(on, hidden)
      return bg.loginItem()
    },
    dispose() {
      tray.destroy()
    },
  }

  if (stub) {
    ;(globalThis as Record<string, unknown>).__elecxstockBackground = {
      windows: () =>
        deps
          .windows()
          .filter((w) => !w.win.isDestroyed())
          .map(({ slot, win }) => ({ slot, visible: win.isVisible(), minimized: win.isMinimized(), maximized: win.isMaximized() })),
      close: (slot: string) =>
        deps
          .windows()
          .find((w) => w.slot === slot)
          ?.win.close(),
      minimize: (slot: string) =>
        deps
          .windows()
          .find((w) => w.slot === slot)
          ?.win.minimize(),
      tray: stubTray,
      login: stubLogin,
      hints: () => hints,
    }
  }
  return bg
}
