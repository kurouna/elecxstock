// main プロセス（薄い）: ウィンドウ・単一インスタンス・Core（utilityProcess）の起動と MessagePort の受け渡し・安全策（§8.1, NFR-S3）。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, extname, join, normalize } from 'node:path'
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
} from 'electron'

declare const __APP_VERSION__: string
const here = dirname(fileURLToPath(import.meta.url))
const isDev = !!process.env.ELECTRON_RENDERER_URL
const devTools = !app.isPackaged || process.env.ELECXSTOCK_DEVTOOLS === '1'

if (process.env.ELECXSTOCK_USER_DATA) app.setPath('userData', process.env.ELECXSTOCK_USER_DATA)
app.setAppUserModelId('dev.kurouna.elecxstock')

// 画面は file:// ではなく独自プロトコルで読み込む（NFR-S3）
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }])

if (!app.requestSingleInstanceLock()) app.quit()

const EXTERNAL_ALLOW = [
  /^https:\/\/(www\.)?tradingview\.com\//,
  /^https:\/\/github\.com\/kurouna\/elecxstock/,
  /^https:\/\/(www\.)?jpx\.co\.jp\//,
  /^https:\/\/finance\.yahoo\.co(m|\.jp)\//,
]
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"

let win: BrowserWindow | null = null
let core: UtilityProcess | null = null
let quitting = false
let coreReady = false
let pageLoaded = false

// ---------------------------------------------------------------- window state（NFR-Q8）
const stateFile = () => join(app.getPath('userData'), 'window.json')
interface WinState {
  x?: number
  y?: number
  width: number
  height: number
  maximized: boolean
}
function loadState(): WinState {
  try {
    const s = JSON.parse(readFileSync(stateFile(), 'utf8')) as WinState
    // モニタが外れていたら見える位置に戻す
    const visible = screen.getAllDisplays().some((d) => {
      const a = d.workArea
      return (
        s.x != null &&
        s.y != null &&
        s.x < a.x + a.width - 100 &&
        s.x + s.width > a.x + 100 &&
        s.y >= a.y - 20 &&
        s.y < a.y + a.height - 100
      )
    })
    return visible ? s : { width: s.width, height: s.height, maximized: s.maximized }
  } catch {
    return { width: 1600, height: 960, maximized: false }
  }
}
function saveState(): void {
  if (!win) return
  const b = win.getNormalBounds()
  try {
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(stateFile(), JSON.stringify({ ...b, maximized: win.isMaximized() }))
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------- core（utilityProcess）
function startCore(): void {
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
      wirePort()
    }
  })
  core.stdout?.on('data', (d) => process.stdout.write(`[core] ${d}`))
  core.stderr?.on('data', (d) => process.stderr.write(`[core] ${d}`))
  core.on('exit', (code) => {
    core = null
    coreReady = false
    if (quitting) return
    // 落ちても自動で立ち上げ直し、ポートを渡し直す（NFR-Q11）
    console.error(`core exited (${code}); restarting`)
    setTimeout(() => {
      startCore()
    }, 1000)
  })
}
/** renderer と Core を MessagePort で直結する（main は通さない） */
function wirePort(): void {
  if (!core || !win || !coreReady || !pageLoaded) return
  const { port1, port2 } = new MessageChannelMain()
  core.postMessage({ type: 'port' }, [port1])
  win.webContents.postMessage('core-port', null, [port2])
}

// ---------------------------------------------------------------- window
async function createWindow(): Promise<void> {
  const s = loadState()
  win = new BrowserWindow({
    ...(s.x != null && s.y != null ? { x: s.x, y: s.y } : {}),
    width: s.width,
    height: s.height,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: '#0b0d10',
    title: 'elecxstock',
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
  if (s.maximized) win.maximize()
  win.once('ready-to-show', () => win?.show())
  win.on('close', saveState)
  win.on('closed', () => {
    win = null
  })
  // 画面遷移と新しいウィンドウを禁止し、外部リンクは許可リストだけ OS のブラウザで開く（NFR-S3）
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (EXTERNAL_ALLOW.some((r) => r.test(url))) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  win.webContents.on('did-start-loading', () => {
    pageLoaded = false
  })
  win.webContents.on('did-finish-load', () => {
    pageLoaded = true
    wirePort()
  })
  win.webContents.on('render-process-gone', (_e, d) => {
    if (d.reason !== 'clean-exit') win?.webContents.reload()
  })
  if (!devTools) {
    // 製品版では再読み込みのキーを無効にする（F5 はアプリの「データ更新」に使う）
    win.webContents.on('before-input-event', (e, input) => {
      if (input.type === 'keyDown' && (input.control || input.meta) && input.key.toLowerCase() === 'r') e.preventDefault()
    })
  }
  if (isDev) await win.loadURL(process.env.ELECTRON_RENDERER_URL!)
  else await win.loadURL('app://elecxstock/index.html')
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
    if (!p.startsWith(root) || !existsSync(p)) return new Response('not found', { status: 404 })
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
function fromApp(e: Electron.IpcMainInvokeEvent): boolean {
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
  if (!fromApp(e) || typeof name !== 'string' || typeof text !== 'string' || !win) return false
  const r = await dialog.showSaveDialog(win, {
    defaultPath: name.replace(/[\\/:*?"<>|]/g, '_'),
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })
  if (r.canceled || !r.filePath) return false
  writeFileSync(r.filePath, text)
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
  if (!fromApp(e) || !win) return null
  const filters = kind === 'xlsx' ? [{ name: 'Excel', extensions: ['xlsx'] }] : [{ name: 'JSON', extensions: ['json'] }]
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters })
  if (r.canceled || !r.filePaths[0]) return null
  const buf = readFileSync(r.filePaths[0])
  if (buf.length > 20_000_000) return null
  return kind === 'xlsx' ? new Uint8Array(buf) : buf.toString('utf8')
})

// ---------------------------------------------------------------- app
app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
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
  startCore()
  await createWindow()
})
app.on('before-quit', () => {
  quitting = true
  core?.kill()
})
app.on('window-all-closed', () => app.quit())
