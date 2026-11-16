// 常駐と自動起動（FR-BG1〜BG8。docs/design-background.md）。トレイとサインイン時の起動はメモリの上のスタブ（ELECXSTOCK_BACKGROUND_STUB=1）で、
// 実際のタスクバー・レジストリには触れない。窓を閉じる・最小化するのは OS の操作なので main から行い、アプリの操作はキーだけで行う
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ElectronApplication, Locator, Page } from '@playwright/test'
import { expect, keys, pane, readUser, rpc, tab, test } from './support'
import { launchEnv, ROOT } from './support/launch'

const STUB = { ELECXSTOCK_BACKGROUND_STUB: '1' }

type WinView = { slot: string; visible: boolean; minimized: boolean; maximized: boolean }
type Bg = {
  windows(): WinView[]
  close(slot: string): void
  minimize(slot: string): void
  tray: { visible: boolean; menu(): string[]; choose(id: string): void; click(): void }
  login: { args: string[] | null; enabled: boolean; disable(): void }
  hints(): number
}
/** main のスタブを読む・操作する（関数は main の中で呼ぶ） */
const bg = <T>(app: ElectronApplication, f: (b: Bg) => T): Promise<T> =>
  app.evaluate((_e, src) => {
    const b = (globalThis as unknown as { __elecxstockBackground: Bg }).__elecxstockBackground
    return new Function('b', `return (${src})(b)`)(b)
  }, f.toString()) as Promise<T>

const visible = (app: ElectronApplication) =>
  bg(app, (b) =>
    b
      .windows()
      .filter((w) => w.visible)
      .map((w) => w.slot),
  )

/** 設定の「一般」タブで、名前のスイッチまで Tab で進む */
async function tabTo(page: Page, target: Locator): Promise<void> {
  for (let i = 0; i < 40; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return
    await keys(page, 'Tab')
  }
  await expect(target).toBeFocused()
}

test.describe('閉じても通知領域に残す（FR-BG1・BG2・BG3・BG5）', () => {
  test('スイッチをキーでオンにすると、1 枚目を閉じても動き続け、トレイから戻り、トレイの終了で終わる', async ({ start }) => {
    const { app, page, userData } = await start({ env: STUB })
    await keys(page, 'Control+Comma')
    const dlg = page.getByRole('dialog', { name: '設定' })
    const sw = dlg.getByRole('button', { name: '閉じても通知領域で動かし続ける' })
    await expect(sw).toHaveAttribute('aria-pressed', 'false')
    await tabTo(page, sw)
    await keys(page, 'Space')
    await expect(sw).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => readUser<{ closeToTray: boolean }>(userData, 'settings').closeToTray).toBe(true)
    await keys(page, 'Escape')

    // しまう前はトレイを出さない
    expect(await bg(app, (b) => b.tray.visible)).toBe(false)
    await bg(app, (b) => b.close('main'))
    await expect.poll(() => visible(app)).toEqual([])
    expect(await bg(app, (b) => b.tray.visible)).toBe(true)
    expect(await bg(app, (b) => b.tray.menu())).toEqual(['elecxstock を開く', '設定', 'elecxstock を終了'])
    expect(await bg(app, (b) => b.hints())).toBe(1)
    // 隠れていても renderer は動いていて、Core にも話せる（自動の更新とアラートが続く）
    expect(Array.isArray(await rpc(page, 'jobs.list'))).toBe(true)

    await bg(app, (b) => b.tray.choose('open'))
    await expect.poll(() => visible(app)).toEqual(['main'])
    expect(await bg(app, (b) => b.tray.visible)).toBe(false)

    // 2 回目は案内を出さない。トレイのクリックでも戻る
    await bg(app, (b) => b.close('main'))
    await expect.poll(() => visible(app)).toEqual([])
    expect(await bg(app, (b) => b.hints())).toBe(1)
    await bg(app, (b) => b.tray.click())
    await expect.poll(() => visible(app)).toEqual(['main'])

    // トレイの「設定」は窓を出して設定を開く
    await bg(app, (b) => b.close('main'))
    await expect.poll(() => visible(app)).toEqual([])
    await bg(app, (b) => b.tray.choose('settings'))
    await expect.poll(() => visible(app)).toEqual(['main'])
    await expect(dlg).toBeVisible()
    await keys(page, 'Escape')

    // トレイの「終了」はしまう設定でも終わる
    await bg(app, (b) => b.close('main'))
    await expect.poll(() => visible(app)).toEqual([])
    const closed = app.waitForEvent('close')
    await bg(app, (b) => b.tray.choose('quit'))
    await closed
  })

  test('しまう設定がオフなら、今までどおり閉じると終わる', async ({ start }) => {
    const { app } = await start({ env: STUB })
    const closed = app.waitForEvent('close')
    await bg(app, (b) => b.close('main'))
    await closed
  })

  test('Ctrl+Shift+Q はしまう設定でも終わる', async ({ start }) => {
    const { app, page } = await start({ env: STUB, settings: { closeToTray: true } })
    const closed = app.waitForEvent('close')
    await keys(page, 'Control+Shift+KeyQ')
    await closed
  })

  test('フリー N も一緒に隠れて、一緒に戻る。最小化してから閉じても、戻すと最小化が解けている', async ({ start }) => {
    const { app } = await start({
      env: STUB,
      viewport: null,
      settings: { closeToTray: true },
      freeWindows: { free2: pane('chart', { tf: 'D', sym: 'JP:8058' }, 0) },
    })
    await expect.poll(() => visible(app)).toEqual(['main', 'free2'])
    await bg(app, (b) => b.minimize('main'))
    await bg(app, (b) => b.close('main'))
    await expect.poll(() => visible(app)).toEqual([])
    await bg(app, (b) => b.tray.choose('open'))
    await expect.poll(() => visible(app)).toEqual(['main', 'free2'])
    expect(await bg(app, (b) => b.windows().some((w) => w.minimized))).toBe(false)
  })
})

test.describe('隠して起動する（FR-BG7）', () => {
  test('--hidden で起動すると窓を出さずにトレイを出し、トレイから出す', async ({ launch }) => {
    const { app } = await launch({ env: STUB, args: ['--hidden'], hidden: true })
    await expect.poll(() => bg(app, (b) => b.tray.visible), { timeout: 20_000 }).toBe(true)
    expect(await visible(app)).toEqual([])
    // 利用者が選んだ起動の仕方なので、案内は出さない
    expect(await bg(app, (b) => b.hints())).toBe(0)
    await bg(app, (b) => b.tray.click())
    await expect.poll(() => visible(app)).toEqual(['main'])
  })

  test('初回が済んでいなければ、--hidden でも窓を出す', async ({ launch }) => {
    const { app, page } = await launch({ env: STUB, args: ['--hidden'], fresh: true })
    await expect.poll(() => visible(app)).toEqual(['main'])
    await expect(page.getByRole('dialog')).toBeVisible()
  })
})

test.describe('サインイン時の起動（FR-BG6・BG7）', () => {
  test('キーでオンにすると登録され、通知領域に入れておくで引数が変わり、タスクマネージャーで無効にされると注意が出る', async ({
    start,
  }) => {
    const { app, page } = await start({ env: STUB })
    await keys(page, 'Control+Comma')
    const dlg = page.getByRole('dialog', { name: '設定' })
    const login = dlg.getByRole('button', { name: 'Windows にサインインしたら起動する' })
    const hidden = dlg.getByRole('button', { name: '起動したら通知領域に入れておく' })
    await expect(login).toHaveAttribute('aria-pressed', 'false')
    await expect(hidden).toBeDisabled()

    await tabTo(page, login)
    await keys(page, 'Space')
    await expect(login).toHaveAttribute('aria-pressed', 'true')
    expect(await bg(app, (b) => b.login.args)).toEqual([])
    await expect(hidden).toBeEnabled()
    await tabTo(page, hidden)
    await keys(page, 'Space')
    await expect(hidden).toHaveAttribute('aria-pressed', 'true')
    expect(await bg(app, (b) => b.login.args)).toEqual(['--hidden'])

    // タスクマネージャーで無効にされた → 開き直すとオフで、注意が出る。オンにすると有効に戻る
    await keys(page, 'Escape')
    await bg(app, (b) => b.login.disable())
    await keys(page, 'Control+Comma')
    await expect(login).toHaveAttribute('aria-pressed', 'false')
    await expect(dlg.getByText('タスクマネージャーのスタートアップで無効になっています')).toBeVisible()
    await tabTo(page, login)
    await keys(page, 'Space')
    await expect(login).toHaveAttribute('aria-pressed', 'true')
    expect(await bg(app, (b) => b.login.enabled)).toBe(true)

    // オフにすると消える
    await keys(page, 'Space')
    await expect(login).toHaveAttribute('aria-pressed', 'false')
    expect(await bg(app, (b) => b.login.args)).toBeNull()
  })
})

/** 同じデータの場所で二度目の起動をして、そのプロセスが終わるのを待つ（すぐ終わるので Playwright ではつながない） */
async function second(userData: string, args: string[]): Promise<number | null> {
  const electron = (await import('electron')).default as unknown as string
  const p = spawn(electron, ['.', ...args], { cwd: ROOT, env: launchEnv(userData, STUB), stdio: 'ignore' })
  return new Promise((r) => p.on('exit', r))
}

test.describe('二度目の起動（FR-BG8）', () => {
  test('--quit は、動いている 1 つ目に遅らせている保存を終えさせてから終わらせる。2 つ目はすぐ終わる', async ({ start }) => {
    const { app, page, userData } = await start({ env: STUB })
    // タブの切り替えの保存は遅らせている。すぐ --quit を送っても、終わる前に書かれる
    await tab(page, 'grid')
    const closed = app.waitForEvent('close')
    expect(await second(userData, ['--quit'])).toBe(0)
    await closed
    expect(readUser<{ active: string }>(userData, 'layout').active).toBe('grid')
  })

  test('引数なしの二度目の起動は、しまった窓を出す。--hidden の二度目の起動（サインイン時の起動）は何もしない', async ({ start }) => {
    const { app, userData } = await start({ env: STUB, settings: { closeToTray: true } })
    await bg(app, (b) => b.close('main'))
    await expect.poll(() => visible(app)).toEqual([])
    expect(await second(userData, ['--hidden'])).toBe(0)
    expect(await visible(app)).toEqual([])
    expect(await bg(app, (b) => b.tray.visible)).toBe(true)
    expect(await second(userData, [])).toBe(0)
    await expect.poll(() => visible(app)).toEqual(['main'])
  })

  test('前に出すとき、利用者が最小化しておいた見えているフリー N はそのまま', async ({ start }) => {
    const { app, userData } = await start({
      env: STUB,
      viewport: null,
      freeWindows: { free2: pane('chart', { tf: 'D', sym: 'JP:8058' }, 0) },
    })
    await expect.poll(() => visible(app)).toEqual(['main', 'free2'])
    await bg(app, (b) => b.minimize('free2'))
    await expect.poll(() => bg(app, (b) => b.windows().find((w) => w.slot === 'free2')?.minimized)).toBe(true)
    expect(await second(userData, [])).toBe(0)
    await expect.poll(() => bg(app, (b) => b.windows().find((w) => w.slot === 'main')?.minimized)).toBe(false)
    expect(await bg(app, (b) => b.windows().find((w) => w.slot === 'free2')?.minimized)).toBe(true)
  })
})

test.describe('隠して起動した窓の位置（FR-BG4・BG7）', () => {
  const winFile = (userData: string) => join(userData, 'window.json')

  test('最大化していた窓は、隠して起動しても出したときに最大化している', async ({ launch }) => {
    const { app, userData } = await launch({ env: STUB, args: ['--hidden'], hidden: true })
    await expect.poll(() => bg(app, (b) => b.tray.visible), { timeout: 20_000 }).toBe(true)
    // 一度出して最大化し、トレイの終了で終える（位置を記録させる）
    await bg(app, (b) => b.tray.click())
    await expect.poll(() => visible(app)).toEqual(['main'])
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.maximize())
    await expect.poll(() => bg(app, (b) => b.windows()[0]?.maximized)).toBe(true)
    await app.close()
    const again = await launch({ env: STUB, args: ['--hidden'], hidden: true, userData })
    await expect.poll(() => bg(again.app, (b) => b.tray.visible), { timeout: 20_000 }).toBe(true)
    expect(await visible(again.app)).toEqual([])
    await bg(again.app, (b) => b.tray.click())
    await expect.poll(() => bg(again.app, (b) => b.windows()[0]?.maximized)).toBe(true)
  })

  test('隠れたまま終えても、記録した位置は変わらない', async ({ launch }) => {
    const { app, userData } = await launch({ env: STUB, args: ['--hidden'], hidden: true })
    await expect.poll(() => bg(app, (b) => b.tray.visible), { timeout: 20_000 }).toBe(true)
    const before = JSON.parse(readFileSync(winFile(userData), 'utf8')).topo
    const closed = app.waitForEvent('close')
    await bg(app, (b) => b.tray.choose('quit'))
    await closed
    expect(JSON.parse(readFileSync(winFile(userData), 'utf8')).topo).toEqual(before)
  })

  test('隠して起動した直後にトレイから出しても、あとから開き直すフリー N も出る', async ({ launch }) => {
    const seed = await launch({ env: STUB, viewport: null, freeWindows: { free2: pane('chart', { tf: 'D', sym: 'JP:8058' }, 0) } })
    await expect.poll(() => visible(seed.app)).toEqual(['main', 'free2'])
    await seed.app.close()
    const { app } = await launch({ env: STUB, args: ['--hidden'], hidden: true, userData: seed.userData })
    // トレイが出たらすぐ出す（フリー N を作る前のことがある）
    await expect.poll(() => bg(app, (b) => b.tray.visible), { timeout: 20_000, intervals: [20] }).toBe(true)
    await bg(app, (b) => b.tray.click())
    await expect.poll(() => app.windows().length, { timeout: 20_000 }).toBe(2)
    await expect.poll(() => visible(app)).toEqual(['main', 'free2'])
  })
})

test.describe('最小化した窓の位置（FR-BG4 のデグレ防止）', () => {
  test('最小化したまま終えても、その窓の位置を記録する（しまうために隠した窓とは分ける）', async ({ start }) => {
    const { app, userData } = await start({ env: STUB, viewport: null })
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0]!
      w.unmaximize()
      w.setBounds({ x: 120, y: 80, width: 1300, height: 820 })
    })
    await bg(app, (b) => b.minimize('main'))
    await expect.poll(() => bg(app, (b) => b.windows()[0]?.minimized)).toBe(true)
    const closed = app.waitForEvent('close')
    await app.evaluate(({ app: a }) => a.quit())
    await closed
    const topo = JSON.parse(readFileSync(join(userData, 'window.json'), 'utf8')).topo as Record<string, { main?: { bounds: unknown } }>
    expect(Object.values(topo).map((t) => t.main?.bounds)).toContainEqual({ x: 120, y: 80, width: 1300, height: 820 })
  })
})
