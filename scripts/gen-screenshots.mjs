// README 用のスクリーンショット（docs/screenshots/）。スタブのプロバイダ（架空の値）で起動し、キー操作で各画面を開いて撮る。
// 使い方: npm run build && node scripts/gen-screenshots.mjs
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from '@playwright/test'

const out = join(process.cwd(), 'docs', 'screenshots')
mkdirSync(out, { recursive: true })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function session(lang, shots) {
  const userData = mkdtempSync(join(tmpdir(), 'elecxstock-shot-'))
  const app = await electron.launch({ args: ['.'], env: { ...process.env, ELECXSTOCK_PROVIDER: 'stub', ELECXSTOCK_USER_DATA: userData } })
  const page = await app.firstWindow()
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]
    w.unmaximize()
    w.setContentSize(1680, 1000)
  })
  const k = async (...keys) => {
    for (const x of keys) {
      await page.keyboard.press(x)
      await wait(80)
    }
  }
  const type = async (s) => {
    for (const ch of s) await k(/\d/.test(ch) ? `Digit${ch}` : `Key${ch}`)
  }
  await page.getByRole('dialog').waitFor()
  await k('Enter', 'Enter')
  await page
    .locator('footer')
    .getByText(/待機|Idle/)
    .waitFor({ timeout: 60_000 })
  if (lang === 'en') {
    await k('Control+k')
    await page.keyboard.type('English')
    await k('Enter')
  }
  // お気に入りといくつかのリストを作っておく
  await k('Alt+ArrowRight')
  for (const c of ['8058', '7203', '8306', '2914', '8951', '3462', '9434', '8766', '94345']) {
    await type(c)
    await k('Enter', 'Control+d')
  }
  await wait(400)
  await page.evaluate(() => document.querySelectorAll('.toasts .toast').forEach((t) => t.remove()))
  for (const [name, fn] of shots) {
    // 撮る窓を返したら、その窓を撮る（フリーのウィンドウ）
    const target = (await fn({ k, type, page, app })) ?? page
    await wait(900)
    await target.evaluate(() => document.querySelectorAll('.toasts .toast').forEach((t) => t.remove()))
    await target.screenshot({ path: join(out, `${name}.png`) })
    console.log('shot', name)
    if (target !== page) await target.close()
  }
  await app.close()
}

await session('ja', [
  ['mtf', async ({ k }) => k('Alt+ArrowLeft', 'Home', 'ArrowDown')],
  ['grid', async ({ k }) => k('Control+Shift+Digit3', 'w', 'Alt+Digit4', 'Space', 'ArrowRight', 'ArrowRight', 'Space')],
  ['grid-drawer', async ({ k }) => k('Control+b')],
  ['screener', async ({ k }) => k('Escape', 'Control+Shift+Digit2', 'ArrowDown', 'ArrowDown')],
  ['income', async ({ k }) => k('Control+Shift+Digit6')],
  ['triple', async ({ k }) => k('Control+Shift+Digit5')],
  [
    'palette',
    async ({ k, page }) => {
      await k('Control+Shift+Digit4', 'Control+k')
      await page.keyboard.type('日本')
    },
  ],
  ['help', async ({ k }) => k('Escape', 'F1')],
  ['settings', async ({ k }) => k('Escape', 'Control+Comma', 'ArrowDown', 'ArrowDown')],
  ['market', async ({ k }) => k('Escape', 'Control+Shift+Digit1', 'Alt+ArrowRight', 'ArrowRight')],
  [
    // 2 枚目のモニタ用のフリーのウィンドウ（Ctrl+Alt+N → 4 分割）
    'free',
    async ({ k, page, app }) => {
      const next = app.waitForEvent('window')
      await k('Control+Alt+n')
      await page.locator('.dialog').getByText('4 分割', { exact: true }).click()
      const w = await next
      await w.waitForLoadState('domcontentloaded')
      await app.evaluate(({ BrowserWindow }) => {
        const f = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('w=free2'))
        f?.unmaximize()
        f?.setContentSize(1680, 1000)
      })
      await w.locator('[data-widget="chart"] canvas').first().waitFor()
      await wait(2500)
      return w
    },
  ],
  [
    'light',
    async ({ k, page }) => {
      await k('Control+k')
      await page.keyboard.type('テーマ')
      await k('Enter', 'Control+Shift+Digit3')
    },
  ],
])
await session('en', [['grid-en', async ({ k }) => k('Control+Shift+Digit3', 'n', 'Alt+Digit3')]])
