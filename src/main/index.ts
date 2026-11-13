// main プロセス（薄い）: ウィンドウ・単一インスタンス・Core（utilityProcess）の起動と MessagePort の受け渡し・安全策（§8.1, NFR-S3）。
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
      wirePort()
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
    // 落ちても自動で立ち上げ直し、ポートを渡し直す（NFR-Q11）
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
    log(`renderer gone: ${d.reason} (${d.exitCode})`)
    if (d.reason !== 'clean-exit') win?.webContents.reload()
  })
  win.webContents.on('console-message', (e) => {
    if (e.level === 'error') log(`renderer error: ${e.message}`)
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
// ウィンドウの枠（最小化・最大化・閉じるのボタン）の色と高さを、テーマと表示倍率に合わせる（FR-V8）
ipcMain.handle('app:setChrome', (e, theme: unknown, scale: unknown) => {
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
  pruneLogs()
  log(`start ${__APP_VERSION__} ${process.platform} electron ${process.versions.electron}`)
  startCore()
  await createWindow()
})
// 閉じるとき: Core に止めるよう頼み、取得中の項目を止めて DB を閉じるのを待つ（続きは次の起動で再開。FR-F1）。
// 応答が無ければ 4 秒で強制終了する（項目の書き込みはトランザクションなので、途中で切っても半端な状態は残らない）
let coreStopped = false
app.on('before-quit', (e) => {
  quitting = true
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
