// アプリの起動（docs/test-plan.md §3.1・§3.2）: スタブのプロバイダ・基準日時・種の userData の写し
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type ElectronApplication, _electron as electron, expect, type Page } from '@playwright/test'
import { USER_FILE_SCHEMAS } from '../../../src/shared/api'
import { TEST_NOW } from '../../../src/shared/clock'
import { DEFAULT_SETTINGS } from '../../../src/shared/settings'
import type { LayoutDoc, Node } from './layout'
import { runDir, seedDir } from './paths'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

/** 並列で窓が重なっても描画・タイマーを止めない（アプリは backgroundThrottling: false） */
export const CHROMIUM_ARGS = [
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  '--disable-features=CalculateNativeWinOcclusion',
  '--disable-gpu-shader-disk-cache',
  '--disk-cache-size=1',
]

/** 利用者の JSON（data/user/<name>.json）。中身は { version, data } */
export type UserFile =
  | 'settings'
  | 'watchlists'
  | 'screens'
  | 'layout'
  | 'layouts'
  | 'holdings'
  | 'portfolioMeta'
  | 'alerts'
  /** チャートの描画（docs/design-drawings.md） */
  | 'drawings'
  /** アラートの判定の状態と履歴（AlertBook。世代なし） */
  | 'alertState'
  | 'alertHistory'
  /** 資産推移の記録（FolioBook。世代なし） */
  | 'portfolioHistory'

export const userFile = (userData: string, name: string) => join(userData, 'data', 'user', `${name}.json`)

export function readUser<T = unknown>(userData: string, name: UserFile): T {
  const raw = JSON.parse(readFileSync(userFile(userData, name), 'utf8'))
  return (raw && typeof raw === 'object' && 'data' in raw ? raw.data : raw) as T
}
/**
 * 利用者の JSON を読む。まだ無ければ undefined（expect.poll の中で使う。Core が書く前に読むと readUser は投げ、
 * poll は投げた時点で待たずに落ちる。CI の遅いマシンで drawings.json が無いと落ちた）
 */
export function readUserIf<T = unknown>(userData: string, name: UserFile): T | undefined {
  return existsSync(userFile(userData, name)) ? readUser<T>(userData, name) : undefined
}
/**
 * 利用者の JSON を書く。Core が読むときと同じスキーマ（USER_FILE_SCHEMAS）で先に確かめる。通らないフィクスチャは、Core が黙って退避して
 * 空・読み取り専用で起動し、分かりにくい落ち方をするため（設定は Core と同じく既定値に重ねてから確かめる）
 */
export function writeUser(userData: string, name: UserFile, data: unknown): void {
  const schema = USER_FILE_SCHEMAS[name as keyof typeof USER_FILE_SCHEMAS]
  if (schema) {
    const r = schema.safeParse(name === 'settings' ? { ...DEFAULT_SETTINGS, ...(data as object) } : data)
    if (!r.success) throw new Error(`writeUser(${name}): ${r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`)
  }
  mkdirSync(join(userData, 'data', 'user'), { recursive: true })
  writeFileSync(userFile(userData, name), JSON.stringify({ version: 1, data }))
}

export interface LaunchOpts {
  /** 空の userData（初回起動を確かめるテストだけ） */
  fresh?: boolean
  /** 前の起動の userData を使う（再起動） */
  userData?: string
  /** ELECXSTOCK_NOW（既定は TEST_NOW） */
  now?: string
  lang?: 'ja' | 'en'
  /** 設定の一部を書き換える */
  settings?: Record<string, unknown>
  /** レイアウトを書き換える（support/layout.ts の freeTab など） */
  layout?: (doc: LayoutDoc) => void
  /** 起動と同時に開くフリー N の窓と、その配置（support/layout.ts の Node） */
  freeWindows?: Record<string, Node>
  /** 起動の前にニュースの設定（data/news/settings.json）を書く。種は答えていない状態（ニュースを取らない） */
  news?: Record<string, unknown>
  /** 起動の前に利用者の JSON を書く（キーで準備するより安いとき） */
  user?: Partial<Record<UserFile, unknown>>
  /** 窓の大きさ（既定 1600×960） */
  viewport?: { width: number; height: number } | null
  /** アプリへの引数（--hidden など） */
  args?: string[]
  /** 足す環境変数（ELECXSTOCK_BACKGROUND_STUB など） */
  env?: Record<string, string>
  /** 窓を出さずに起動する（--hidden）。窓が見えるのを待たない */
  hidden?: boolean
}

/** テストの起動の環境変数: 外の ELECXSTOCK_* は落とし、スタブのプロバイダ・基準日時・userData を付ける（二度目の起動も同じものを使う） */
export function launchEnv(userData: string, extra: Record<string, string> = {}, now: string = TEST_NOW): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) if (v != null && !k.startsWith('ELECXSTOCK_')) env[k] = v
  return {
    ...env,
    ELECXSTOCK_PROVIDER: 'stub',
    ELECXSTOCK_NOW: now,
    ELECXSTOCK_USER_DATA: userData,
    ELECXSTOCK_DEVTOOLS: '1',
    ...extra,
  }
}

export interface Launched {
  app: ElectronApplication
  page: Page
  userData: string
}

export async function launch(opts: LaunchOpts = {}): Promise<Launched> {
  let userData = opts.userData
  if (!userData) {
    userData = mkdtempSync(join(runDir(), 'ud-'))
    if (!opts.fresh) cpSync(seedDir(), userData, { recursive: true })
  }
  const patch = { ...opts.settings, ...(opts.lang ? { lang: opts.lang } : {}) }
  if (Object.keys(patch).length) writeUser(userData, 'settings', { ...readUser<object>(userData, 'settings'), ...patch })
  if (opts.layout || opts.freeWindows) {
    const doc = readUser<LayoutDoc & { windows?: Record<string, unknown> }>(userData, 'layout')
    const free = JSON.stringify(doc.entries.free)
    opts.layout?.(doc)
    // マイレイアウトのタブの正はページ（layouts.json。FR-L14）。テストがこのタブ（entries.free）を変えたら、その中身を
    // 1 枚だけのページ（ID は 0 枚のときに作るのと同じ free）として書き、表示中のページにする。ほかのページを使うテストは user.layouts で書く
    if (JSON.stringify(doc.entries.free) !== free) {
      writeUser(userData, 'layouts', [
        { id: 'free', name: { ja: 'フリー', en: 'Free' }, entry: doc.entries.free, links: {}, created: 1, updated: 1 },
      ])
      ;(doc as { page?: string }).page = 'free'
    }
    if (opts.freeWindows) {
      doc.windows = { ...doc.windows, ...Object.fromEntries(Object.entries(opts.freeWindows).map(([k, root]) => [k, { root, docks: {} }])) }
      const wf = join(userData, 'window.json')
      const w = JSON.parse(readFileSync(wf, 'utf8'))
      writeFileSync(wf, JSON.stringify({ ...w, open: Object.keys(opts.freeWindows) }))
    }
    writeUser(userData, 'layout', doc)
  }
  for (const [name, data] of Object.entries(opts.user ?? {})) writeUser(userData, name as UserFile, data)
  if (opts.news) {
    mkdirSync(join(userData, 'data', 'news'), { recursive: true })
    writeFileSync(join(userData, 'data', 'news', 'settings.json'), JSON.stringify(opts.news))
  }
  const app = await electron.launch({
    args: [...CHROMIUM_ARGS, '.', ...(opts.args ?? [])],
    cwd: ROOT,
    env: launchEnv(userData, opts.env, opts.now),
  })
  const page = await app.firstWindow()
  if (opts.hidden) return { app, page, userData }
  if (opts.viewport !== null) await page.setViewportSize(opts.viewport ?? { width: 1600, height: 960 }).catch(() => {})
  // マウスを窓の左上の角に置く。CI のマシンでは実際のカーソルが窓の上にあることがあり、チャートに十字線が出たり、
  // 資産推移の十字線の日がカーソルの位置に変わったりして、キーだけの操作の結果がずれる（CI は実際のカーソルも窓の外へ動かす。ci.yml）。
  // 窓は ready-to-show で出る（show: false）。出たときに OS が実際のカーソルの位置で mousemove を送るので、出てから置く
  await expect
    .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((w) => w.isVisible())), { timeout: 20_000 })
    .toBe(true)
  await page.mouse.move(0, 0).catch(() => {})
  return { app, page, userData }
}

/**
 * 種から起動したアプリが操作できるまで待つ: 起動の読み込み（app.ready）が済んでペインが並び、フォーカスのあるペインがあり、取得が待機に戻る。
 * ペインが出る前に押したキーは、読み込んだレイアウトで上書きされる（タブの切り替えなどが消える）ので、必ず待つ
 */
export async function ready(page: Page): Promise<void> {
  await expect(page.locator('.main [data-pane-id]').first()).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.pane.focused')).toHaveCount(1)
  // 取得のジョブ（起動時の自動の更新を含む）が終わっている（フッターは失敗の知らせに変わることがあるので、Core に聞く）
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const jobs = (await (
            window as unknown as { elecxstock: { call: (m: string, p: unknown) => Promise<{ status: string }[]> } }
          ).elecxstock.call('jobs.list', {})) as { status: string }[]
          return jobs.filter((j) => j.status === 'queued' || j.status === 'running').length
        }),
      { timeout: 20_000 },
    )
    .toBe(0)
}
