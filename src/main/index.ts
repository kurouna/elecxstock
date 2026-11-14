// main プロセス（薄い）: ウィンドウ・単一インスタンス・Core（utilityProcess）の起動と MessagePort の受け渡し・安全策（§8.1, NFR-S3）。
// マルチモニタ（docs/design-multimonitor.md）: 主ウィンドウ（main）と、タブなしのフリー N（free2〜free4）。
// 窓ごとに Core へのポートを渡し、位置はディスプレイの組み合わせごとに覚える（placement.ts）。
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  MessageChannelMain,
  net,
  protocol,
  screen,
  session,
  shell,
  type UtilityProcess,
  utilityProcess,
  type WebContents,
} from 'electron'
import { type DisplayLike, type Placement, parseState, place, remember, type WindowStateV2 } from './placement'

declare const __APP_VERSION__: string
const here = dirname(fileURLToPath(import.meta.url))
const isDev = !!process.env.ELECTRON_RENDERER_URL
const devTools = !app.isPackaged || process.env.ELECXSTOCK_DEVTOOLS === '1'

if (process.env.ELECXSTOCK_USER_DATA) app.setPath('userData', process.env.ELECXSTOCK_USER_DATA)
app.setAppUserModelId('dev.kurouna.elecxstock')

// 画面は file:// ではなく独自プロトコルで読み込む（NFR-S3）
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }])

if (!app.requestSingleInstanceLock()) app.quit()

// ---------------------------------------------------------------- log（NFR-O1, Q11）: userData/logs に日付ごと。30 日より古いものは消す
const logDir = () => join(app.getPath('userData'), 'data', 'logs')
function log(msg: string): void {
  try {
    mkdirSync(logDir(), { recursive: true })
    appendFileSync(join(logDir(), `main-${new Date().toISOString().slice(0, 10)}.log`), `${new Date().toISOString()} ${msg}\n`)
  } catch {
    /* ignore */
  }
}
function pruneLogs(): void {
  try {
    const limit = Date.now() - 30 * 86400_000
    for (const f of readdirSync(logDir())) {
      const p = join(logDir(), f)
      if (/\.log$/.test(f) && statSync(p).mtimeMs < limit) rmSync(p, { force: true })
    }
  } catch {
    /* ignore */
  }
}
process.on('uncaughtException', (e) => log(`uncaught ${e.stack ?? e}`))
process.on('unhandledRejection', (e) => log(`unhandled ${String(e)}`))

const EXTERNAL_ALLOW = [
  /^https:\/\/(www\.)?tradingview\.com\//,
  /^https:\/\/github\.com\/kurouna\/elecxstock/,
  /^https:\/\/(www\.)?jpx\.co\.jp\//,
  /^https:\/\/finance\.yahoo\.co(m|\.jp)\//,
]
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"

// ---------------------------------------------------------------- windows（マルチモニタ）
type Slot = 'main' | 'free2' | 'free3' | 'free4'
const SLOTS: Slot[] = ['main', 'free2', 'free3', 'free4']
const FREE_SLOTS: Slot[] = ['free2', 'free3', 'free4']
const isSlot = (s: unknown): s is Slot => typeof s === 'string' && (SLOTS as string[]).includes(s)
interface Win {
  win: BrowserWindow
  loaded: boolean
  /** renderer が起動を終えて銘柄を受け取れる（win:ready を呼んだ） */
  ready: boolean
}
const wins = new Map<Slot, Win>()
/** 最後に前に出たウィンドウ（知らせの出し先・Ctrl+F6 の起点・フリー N へ送る先） */
let activeSlot: Slot = 'main'
let lastFree: Slot | null = null
/** フリー N に、読み込みが終わったら渡す銘柄（R4: キーで送る） */
const pendingSend = new Map<Slot, string[]>()

let core: UtilityProcess | null = null
let quitting = false
let coreReady = false

const stateFile = () => join(app.getPath('userData'), 'window.json')
const displays = (): DisplayLike[] =>
  screen.getAllDisplays().map((d) => ({ bounds: d.bounds, workArea: d.workArea, scaleFactor: d.scaleFactor }))
const primary = (): DisplayLike => {
  const p = screen.getPrimaryDisplay()
  return displays().find((d) => d.bounds.x === p.bounds.x && d.bounds.y === p.bounds.y) ?? displays()[0]!
}
let state: WindowStateV2 = { version: 2, topo: {}, open: [] }
function loadState(): void {
  try {
    state = parseState(JSON.parse(readFileSync(stateFile(), 'utf8')), displays())
  } catch {
    state = { version: 2, topo: {}, open: [] }
  }
}
function saveState(): void {
  try {
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(stateFile(), JSON.stringify(state))
  } catch {
    /* ignore */
  }
}
/** 窓の今の位置を、今のディスプレイの組み合わせの記録として残す */
function rememberWin(slot: Slot, w: BrowserWindow): void {
  if (w.isDestroyed()) return
  const p: Placement = { bounds: w.getNormalBounds(), maximized: w.isMaximized(), fullScreen: w.isFullScreen() }
  state = remember(state, displays(), slot, p)
}

// ---------------------------------------------------------------- core（utilityProcess）
let coreFails = 0
let coreStartedAt = 0
function startCore(): void {
  coreStartedAt = Date.now()
  const dataDir = join(app.getPath('userData'), 'data')
  core = utilityProcess.fork(join(here, 'core.js'), [], {
    serviceName: 'elecxstock-core',
    stdio: 'pipe',
    env: {
      ...process.env,
      ELECXSTOCK_DATA_DIR: dataDir,
      ELECXSTOCK_VERSION: __APP_VERSION__,
      NODE_USE_ENV_PROXY: '1', // プロキシは環境変数 HTTPS_PROXY で指定できる（NFR-S1）
    },
  })
  coreReady = false
  core.on('message', (msg: { type?: string }) => {
    if (msg?.type === 'ready') {
      coreReady = true
      for (const s of wins.keys()) wirePort(s)
    }
  })
  core.stdout?.on('data', (d) => process.stdout.write(`[core] ${d}`))
  core.stderr?.on('data', (d) => {
    process.stderr.write(`[core] ${d}`)
    log(`core stderr: ${String(d).trim()}`)
  })
  core.on('exit', (code) => {
    core = null
    coreReady = false
    if (quitting) return
    // 落ちても自動で立ち上げ直す（NFR-Q11）。続けて落ちるとき（DB が開けないなど）は間隔を延ばし、5 回で止めて知らせる
    coreFails = Date.now() - coreStartedAt < 30_000 ? coreFails + 1 : 1
    log(`core exited (${code}); restart #${coreFails}`)
    if (coreFails >= 5) {
      void dialog
        .showMessageBox({
          type: 'error',
          title: 'elecxstock',
          message: app.getLocale().startsWith('ja') ? 'データの処理（Core）が起動できません' : 'The data engine (Core) cannot start',
          detail: app.getLocale().startsWith('ja')
            ? 'データベースが壊れているか、ほかのプログラムが使っている可能性があります。ログのフォルダを開いて原因を確かめてください。'
            : 'The database may be damaged or in use by another program. Open the log folder to see the cause.',
          buttons: app.getLocale().startsWith('ja') ? ['ログを開く', 'もう一度試す', '閉じる'] : ['Open logs', 'Retry', 'Close'],
        })
        .then((r) => {
          if (r.response === 0) void shell.openPath(logDir())
          if (r.response === 1) {
            coreFails = 0
            startCore()
          }
        })
      return
    }
    setTimeout(() => startCore(), Math.min(30_000, 1000 * 2 ** (coreFails - 1)))
  })
}
/** renderer と Core を MessagePort で直結する（main は通さない）。窓ごとに 1 本 */
function wirePort(slot: Slot): void {
  const w = wins.get(slot)
  if (!core || !w || !coreReady || !w.loaded || w.win.isDestroyed()) return
  const { port1, port2 } = new MessageChannelMain()
  core.postMessage({ type: 'port', slot }, [port1])
  w.win.webContents.postMessage('core-port', null, [port2])
}

// ---------------------------------------------------------------- window
const pageUrl = (slot: Slot, shape?: string) => {
  const q = slot === 'main' ? '' : `?w=${slot}${shape ? `&shape=${encodeURIComponent(shape)}` : ''}`
  return isDev ? `${process.env.ELECTRON_RENDERER_URL!}${q}` : `app://elecxstock/index.html${q}`
}
const slotOf = (wc: WebContents): Slot | null => {
  for (const [s, w] of wins) if (!w.win.isDestroyed() && w.win.webContents === wc) return s
  return null
}
const winOf = (e: Electron.IpcMainInvokeEvent): BrowserWindow | null => BrowserWindow.fromWebContents(e.sender)

async function createWindow(slot: Slot, shape?: string): Promise<void> {
  const free = slot !== 'main'
  const p = place(displays(), primary(), state, slot, free ? { width: 1400, height: 900 } : { width: 1600, height: 960 })
  const win = new BrowserWindow({
    x: p.bounds.x,
    y: p.bounds.y,
    width: p.bounds.width,
    height: p.bounds.height,
    // フリー N は縦置き・小さい画面にも置けるよう小さくまで縮められる
    minWidth: free ? 480 : 1100,
    minHeight: free ? 360 : 700,
    show: false,
    backgroundColor: '#0b0d10',
    title: free ? `elecxstock — ${slot.replace('free', 'フリー ')}` : 'elecxstock',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#101318', symbolColor: '#a3adb9', height: 36 },
    icon: join(here, '../../build/icon.png'), // 窓のアイコン（インストーラ・exe は build/icon.ico）
    webPreferences: {
      preload: join(here, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
      devTools,
      backgroundThrottling: false,
    },
  })
  const w: Win = { win, loaded: false, ready: false }
  wins.set(slot, w)
  if (free) lastFree = slot
  // 倍率の違うモニタでは、作るときの大きさが崩れることがある: 位置を決めてから大きさをもう一度当てる（§5）
  win.setBounds(p.bounds)
  if (p.maximized) win.maximize()
  if (p.fullScreen) win.setFullScreen(true)
  win.once('ready-to-show', () => win.show())
  win.on('focus', () => {
    activeSlot = slot
    if (free) lastFree = slot
  })
  win.on('close', () => {
    rememberWin(slot, win)
    saveState()
  })
  win.on('closed', () => {
    wins.delete(slot)
    pendingSend.delete(slot)
    if (activeSlot === slot) activeSlot = 'main'
    if (lastFree === slot) lastFree = FREE_SLOTS.find((s) => wins.has(s)) ?? null
    // 主ウィンドウを閉じたらアプリを終える。フリー N を利用者が閉じたら、次の起動では開き直さない
    if (slot === 'main') app.quit()
    else if (!quitting) {
      state = { ...state, open: state.open.filter((s) => s !== slot) }
      saveState()
    }
  })
  // 画面遷移と新しいウィンドウを禁止し、外部リンクは許可リストだけ OS のブラウザで開く（NFR-S3）
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (EXTERNAL_ALLOW.some((r) => r.test(url))) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  win.webContents.on('did-start-loading', () => {
    w.loaded = false
    w.ready = false
  })
  win.webContents.on('did-finish-load', () => {
    w.loaded = true
    wirePort(slot)
  })
  win.webContents.on('render-process-gone', (_e, d) => {
    log(`renderer gone (${slot}): ${d.reason} (${d.exitCode})`)
    if (d.reason !== 'clean-exit') win.webContents.reload()
  })
  win.webContents.on('console-message', (e) => {
    if (e.level === 'error') log(`renderer error (${slot}): ${e.message}`)
  })
  if (!devTools) {
    // 製品版では再読み込みのキーを無効にする（F5 はアプリの「データ更新」に使う）
    win.webContents.on('before-input-event', (e, input) => {
      if (input.type === 'keyDown' && (input.control || input.meta) && input.key.toLowerCase() === 'r') e.preventDefault()
    })
  }
  await win.loadURL(pageUrl(slot, shape))
}
/** フリー N を開く（開いていれば前に出す）。slot が無ければ空いている番号 */
async function openFree(slot: Slot | null, shape?: string): Promise<Slot | null> {
  const s = slot ?? FREE_SLOTS.find((x) => !wins.has(x)) ?? null
  if (!s || s === 'main') return null
  const open = wins.get(s)
  if (open) {
    if (open.win.isMinimized()) open.win.restore()
    open.win.focus()
    return s
  }
  if (!state.open.includes(s)) state = { ...state, open: [...state.open, s] }
  saveState()
  await createWindow(s, shape)
  return s
}

function registerProtocol(): void {
  const root = normalize(join(here, '../renderer'))
  const types: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.json': 'application/json',
  }
  protocol.handle('app', async (req) => {
    const url = new URL(req.url)
    const p = normalize(join(root, decodeURIComponent(url.pathname)))
    if (!p.startsWith(root + sep) || !existsSync(p)) return new Response('not found', { status: 404 })
    const body = await readFile(p)
    return new Response(body, {
      headers: {
        'content-type': types[extname(p)] ?? 'application/octet-stream',
        'content-security-policy': CSP,
        'x-content-type-options': 'nosniff',
      },
    })
  })
  void net
}

// ---------------------------------------------------------------- small IPC（ファイルの保存・読み込み・外部リンク）
function fromApp(e: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent): boolean {
  const u = e.senderFrame?.url ?? ''
  return u.startsWith('app://elecxstock/') || (isDev && u.startsWith(process.env.ELECTRON_RENDERER_URL!))
}
ipcMain.handle('app:openExternal', (e, url: unknown) => {
  if (!fromApp(e) || typeof url !== 'string') return false
  if (!EXTERNAL_ALLOW.some((r) => r.test(url))) return false
  void shell.openExternal(url)
  return true
})
ipcMain.handle('app:saveText', async (e, name: unknown, text: unknown) => {
  const win = winOf(e)
  if (!fromApp(e) || typeof name !== 'string' || typeof text !== 'string' || !win) return false
  const ext = extname(name).slice(1).toLowerCase() || 'json'
  const label = { json: 'JSON', csv: 'CSV', txt: 'Text' }[ext] ?? ext.toUpperCase()
  const r = await dialog.showSaveDialog(win, {
    defaultPath: name.replace(/[\\/:*?"<>|]/g, '_'),
    filters: [{ name: label, extensions: [ext] }],
  })
  if (r.canceled || !r.filePath) return false
  writeFileSync(r.filePath, text)
  return true
})
// ウィンドウの枠（最小化・最大化・閉じるのボタン）の色と高さを、テーマと表示倍率に合わせる（FR-V8）。送り元の窓に効かせる
ipcMain.handle('app:setChrome', (e, theme: unknown, scale: unknown) => {
  const win = winOf(e)
  if (!fromApp(e) || !win) return false
  const light = theme === 'light'
  const z = typeof scale === 'number' && scale >= 0.8 && scale <= 1.5 ? scale : 1
  try {
    win.setTitleBarOverlay({ color: light ? '#ffffff' : '#101318', symbolColor: light ? '#4a5562' : '#a3adb9', height: Math.round(36 * z) })
    win.setBackgroundColor(light ? '#e9ecf0' : '#0b0d10')
  } catch {
    /* titleBarOverlay の無い環境 */
  }
  return true
})
// 同梱 OSS のライセンス一覧（設定 > このアプリについて。§10）
ipcMain.handle('app:notices', (e) => {
  if (!fromApp(e)) return ''
  const cands = [join(dirname(process.execPath), 'THIRD_PARTY_NOTICES.txt'), join(app.getAppPath(), 'out', 'THIRD_PARTY_NOTICES.txt')]
  for (const p of cands) if (existsSync(p)) return readFileSync(p, 'utf8')
  return ''
})
ipcMain.handle('app:openFile', async (e, kind: unknown) => {
  const win = winOf(e)
  if (!fromApp(e) || !win) return null
  const filters =
    kind === 'xlsx'
      ? [{ name: 'Excel', extensions: ['xlsx'] }]
      : kind === 'csv' || kind === 'text'
        ? [{ name: 'CSV / Text', extensions: ['csv', 'txt'] }]
        : [{ name: 'JSON', extensions: ['json'] }]
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters })
  if (r.canceled || !r.filePaths[0]) return null
  if (statSync(r.filePaths[0]).size > 20_000_000) return null
  const buf = readFileSync(r.filePaths[0])
  // 証券会社の CSV は Shift_JIS のことが多いので、バイト列のまま渡して renderer で文字コードを判定する
  return kind === 'xlsx' || kind === 'csv' ? new Uint8Array(buf) : buf.toString('utf8')
})

// Core が data/backups に書いた DB のバックアップを、利用者が選んだ場所へ写す（FR-S3）。元は data/backups の中だけ
ipcMain.handle('app:exportBackup', async (e, file: unknown) => {
  const win = winOf(e)
  if (!fromApp(e) || typeof file !== 'string' || !/^market-[\w-]+\.db$/.test(file) || !win) return false
  const src = join(app.getPath('userData'), 'data', 'backups', file)
  if (!existsSync(src)) return false
  const r = await dialog.showSaveDialog(win, { defaultPath: file, filters: [{ name: 'SQLite', extensions: ['db'] }] })
  if (r.canceled || !r.filePath) return false
  copyFileSync(src, r.filePath)
  return true
})
// ログのフォルダを開く（ジョブ・設定から。NFR-O1）
ipcMain.handle('app:openLogs', (e) => {
  if (!fromApp(e)) return false
  mkdirSync(logDir(), { recursive: true })
  void shell.openPath(logDir())
  return true
})

// ---------------------------------------------------------------- windows IPC（マルチモニタ）
const SHAPES = ['grid', 'quad', 'detail', 'empty', 'last']
/** フリー N を開く。slot が無ければ空いている番号、shape は初期の形（last は前回の配置） */
ipcMain.handle('win:open', async (e, slot: unknown, shape: unknown) => {
  if (!fromApp(e)) return null
  const s = slot == null ? null : isSlot(slot) && slot !== 'main' ? slot : undefined
  if (s === undefined) return null
  const sh = typeof shape === 'string' && SHAPES.includes(shape) && shape !== 'last' ? shape : undefined
  return openFree(s, sh)
})
/** 開いているウィンドウと、いま前にあるウィンドウ（Ctrl+F6 の確かめにも使う） */
ipcMain.handle('win:info', (e) => {
  if (!fromApp(e)) return null
  return { open: SLOTS.filter((s) => wins.has(s)), active: activeSlot, self: slotOf(e.sender) }
})
/** 次・前のウィンドウへ（Ctrl+F6 / Ctrl+Shift+F6） */
ipcMain.handle('win:cycle', (e, dir: unknown) => {
  if (!fromApp(e)) return null
  const open = SLOTS.filter((s) => wins.has(s))
  const from = slotOf(e.sender) ?? activeSlot
  const i = open.indexOf(from)
  const next = open[(i + (dir === -1 ? -1 : 1) + open.length) % open.length]!
  const w = wins.get(next)!.win
  if (w.isMinimized()) w.restore()
  w.focus()
  activeSlot = next
  if (next !== 'main') lastFree = next
  return next
})
/**
 * このウィンドウの文字の大きさ（R2）: 1 段ずつ。0 で戻す。null は今の値を返すだけ。スロットごとに覚える。
 * Chromium のズームは同じオリジン（file://）の窓で共有されるので、倍率だけを返し、renderer が CSS の zoom に掛ける
 */
ipcMain.handle('win:zoom', (e, step: unknown) => {
  const slot = slotOf(e.sender)
  if (!fromApp(e) || !slot) return null
  const cur = state.zoom?.[slot] ?? 1
  if (step === null) return cur
  if (typeof step !== 'number' || !Number.isFinite(step)) return null
  const z = step === 0 ? 1 : Math.min(2, Math.max(0.6, Math.round((cur + step * 0.1) * 10) / 10))
  state = { ...state, zoom: { ...(state.zoom ?? {}), [slot]: z } }
  saveState()
  return z
})
/** アプリを終える（Ctrl+Shift+Q。どの窓から押しても全部を閉じる） */
ipcMain.handle('app:quit', (e) => {
  if (fromApp(e)) app.quit()
  return true
})
// ---------------------------------------------------------------- bus（R3: ウィンドウをまたぐリンク）
// 番号を付けて送り元以外の窓へ配り、最後の値を覚えて、あとから開いた窓・読み込み直した窓に渡す
let busSeq = 0
const busLast = new Map<string, { seq: number; data: unknown }>()
ipcMain.on('bus:publish', (e, topic: unknown, data: unknown) => {
  if (!fromApp(e) || typeof topic !== 'string' || !/^link:[1-5]$/.test(topic)) return
  const msg = { topic, data, seq: ++busSeq }
  busLast.set(topic, { seq: msg.seq, data })
  for (const w of wins.values()) if (!w.win.isDestroyed() && w.win.webContents !== e.sender) w.win.webContents.send('bus', msg)
})
ipcMain.handle('bus:last', (e) => {
  if (!fromApp(e)) return []
  return [...busLast].map(([topic, v]) => ({ topic, data: v.data, seq: v.seq }))
})
// ---------------------------------------------------------------- send（R4: 1 枚目の一覧からキーでフリー N へ送る）
ipcMain.handle('win:send', async (e, ids: unknown) => {
  if (!fromApp(e) || !Array.isArray(ids)) return null
  const list = ids.filter((x): x is string => typeof x === 'string' && /^[A-Z]+:[0-9A-Z]{1,8}$/.test(x)).slice(0, 60)
  if (!list.length) return null
  let target = lastFree && wins.has(lastFree) ? lastFree : (FREE_SLOTS.find((s) => wins.has(s)) ?? null)
  if (!target) {
    target = await openFree(null, 'grid')
    if (!target) return null
  }
  const w = wins.get(target)!
  // 起動を終えるまで（win:ready まで）は預かる。読み込み中に送ると、起動でレイアウトが置き換わって消える
  if (w.ready) w.win.webContents.send('win:receive', list)
  else pendingSend.set(target, [...(pendingSend.get(target) ?? []), ...list])
  return target
})
/** フリー N の renderer が受け取りの準備ができたら、待っている銘柄を渡す */
ipcMain.handle('win:ready', (e) => {
  const slot = slotOf(e.sender)
  if (!fromApp(e) || !slot) return []
  const w = wins.get(slot)
  if (w) w.ready = true
  const list = pendingSend.get(slot) ?? []
  pendingSend.delete(slot)
  return list
})

// ---------------------------------------------------------------- app
app.on('second-instance', () => {
  const w = wins.get('main')?.win
  if (w) {
    if (w.isMinimized()) w.restore()
    w.focus()
  }
})
app.on('web-contents-created', (_e, wc) => {
  wc.on('will-attach-webview', (ev) => ev.preventDefault())
})
app.whenReady().then(async () => {
  Menu.setApplicationMenu(null)
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false)) // 権限の要求はすべて拒否
  session.defaultSession.setPermissionCheckHandler(() => false)
  registerProtocol()
  pruneLogs()
  log(`start ${__APP_VERSION__} ${process.platform} electron ${process.versions.electron}`)
  loadState()
  startCore()
  await createWindow('main')
  // 前回の終了時に開いていたフリー N を開き直す
  for (const s of state.open) if (isSlot(s) && s !== 'main') await createWindow(s)
  // ディスプレイが外れたら、その画面にあった窓は全画面を解いて主ディスプレイへ（この位置は記録しない）
  screen.on('display-removed', () => {
    for (const w of wins.values()) {
      if (w.win.isDestroyed()) continue
      const b = w.win.getBounds()
      const ok = displays().some((d) => b.x < d.workArea.x + d.workArea.width - 100 && b.x + b.width > d.workArea.x + 100)
      if (!ok) {
        if (w.win.isFullScreen()) w.win.setFullScreen(false)
        const a = primary().workArea
        w.win.setBounds({ x: a.x + 60, y: a.y + 60, width: Math.min(b.width, a.width - 120), height: Math.min(b.height, a.height - 120) })
      }
    }
  })
})
// 閉じるとき: 開いている窓の位置を残し、Core に止めるよう頼み、取得中の項目を止めて DB を閉じるのを待つ（続きは次の起動で再開。FR-F1）。
// 応答が無ければ 4 秒で強制終了する（項目の書き込みはトランザクションなので、途中で切っても半端な状態は残らない）
let coreStopped = false
let flushed = false
/** 全窓に、遅らせている保存（レイアウト・ウォッチリスト）を Core に書かせ、返事を待つ（最長 2 秒） */
let flushSeq = 0
function flushWindows(): Promise<void> {
  const targets = [...wins.values()].filter((w) => !w.win.isDestroyed() && w.loaded)
  if (!targets.length) return Promise.resolve()
  const id = ++flushSeq
  return new Promise((resolve) => {
    let left = targets.length
    const finish = () => {
      clearTimeout(timer)
      ipcMain.off('app:flushed', onAck)
      resolve()
    }
    const onAck = (_e: unknown, n: unknown) => {
      if (n === id && --left <= 0) finish()
    }
    const timer = setTimeout(finish, 2000)
    ipcMain.on('app:flushed', onAck)
    for (const w of targets) w.win.webContents.send('app:flush', id)
  })
}
app.on('before-quit', (e) => {
  if (!quitting) {
    // 終了で閉じるフリー N は、次の起動で開き直す
    state = { ...state, open: FREE_SLOTS.filter((s) => wins.has(s)) }
    for (const [s, w] of wins) rememberWin(s, w.win)
    saveState()
  }
  quitting = true
  // 先に全窓の保存を終わらせてから Core を止める（beforeunload は Core が止まったあとに来るので頼らない）
  if (!flushed && core) {
    flushed = true
    e.preventDefault()
    void flushWindows().then(() => app.quit())
    return
  }
  const c = core
  if (!c || coreStopped) return
  e.preventDefault()
  coreStopped = true
  const done = () => {
    clearTimeout(timer)
    app.quit()
  }
  const timer = setTimeout(() => {
    log('core did not stop in time; killing')
    c.kill()
    done()
  }, 4000)
  c.once('exit', done)
  c.postMessage({ type: 'shutdown' })
})
app.on('window-all-closed', () => app.quit())
