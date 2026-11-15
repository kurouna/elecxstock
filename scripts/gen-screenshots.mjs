// README 用のスクリーンショット（docs/screenshots/）。スタブのプロバイダ（架空の値）で起動し、キー操作で各画面を開いて撮る。
// 使い方: npm run build && node scripts/gen-screenshots.mjs
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from '@playwright/test'

const out = join(process.cwd(), 'docs', 'screenshots')
mkdirSync(out, { recursive: true })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
/** 撮る日時（テストの基準日時と同じ。平日の大引けのあと。撮り直しても日付が変わらない） */
const NOW = '2026-11-13T18:00:00+09:00'

async function session(lang, shots) {
  const userData = mkdtempSync(join(tmpdir(), 'elecxstock-shot-'))
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, ELECXSTOCK_PROVIDER: 'stub', ELECXSTOCK_USER_DATA: userData, ELECXSTOCK_NOW: NOW },
  })
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
  // ペインの種類を変える（Ctrl+Shift+N。フォーカス中のペインを別の種類にする）
  ['widget', async ({ k }) => k('Alt+ArrowRight', 'Control+Shift+KeyN')],
  ['grid', async ({ k }) => k('Escape', 'Control+Shift+Digit3', 'w', 'Alt+Digit4', 'Space', 'ArrowRight', 'ArrowRight', 'Space')],
  ['grid-drawer', async ({ k }) => k('Control+b')],
  ['screener', async ({ k }) => k('Escape', 'Control+Shift+Digit2', 'ArrowDown', 'ArrowDown')],
  // 条件を選ぶダイアログ（FR-SC17）
  ['fields', async ({ k }) => k('Insert')],
  [
    'income',
    async ({ k, type, page }) => {
      // 高配当のリスト（このタブのウォッチリスト）に、J-REIT・5 桁の優先株などを銘柄ジャンプの Ctrl+Enter で足す
      await k('Escape', 'Control+Shift+Digit6')
      for (const c of ['8951', '3462', '8963', '3281', '94345', '2914', '8058', '9434']) {
        await type(c)
        await page.locator('.dialog.jump .it.sel').getByText(c).waitFor()
        await k('Control+Enter')
      }
      await k('Escape', 'Home')
    },
  ],
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
  [
    'market',
    async ({ k, page }) => {
      await k('Escape', 'Control+Shift+Digit1', 'Alt+ArrowRight', 'ArrowRight')
      // 指数の ETF（1306・1343）はタブを開いたときに取得の対象に足すので、取れて描くまで待つ
      await page.locator('[data-widget="market"] .tile').last().getByText('1343').waitFor()
      await page.waitForFunction(() => !document.querySelector('[data-widget="market"] .state'), null, { timeout: 30_000 })
    },
  ],
  [
    // アラート（FR-AL1・AL2・AL9）: 銘柄のアラートを 2 つ（1 つは成立中）とスクリーンのアラートを作り、チャートの点線を撮る
    'alert-line',
    async ({ k, type, page }) => {
      await k('Control+Shift+Digit4')
      await page
        .locator('[data-widget="chart"]')
        .first()
        .click({ position: { x: 300, y: 200 } })
      await type('8058')
      await k('Enter', 'Control+Alt+a', 'KeyO', 'Control+Enter')
      await type('7203')
      await k('Enter', 'Control+Alt+a', 'Control+Enter')
      await k('Control+Shift+Digit2', 'Control+Alt+a', 'Control+Enter', 'Control+Shift+Digit4')
      await page.locator('[data-widget="chart"] canvas').first().waitFor()
      await wait(1500)
    },
  ],
  ['alerts', async ({ k }) => k('Control+Alt+l')],
  [
    // 2 枚目のモニタ用のフリーのウィンドウ（Ctrl+Alt+N → 4 分割）
    'free',
    async ({ k, page, app }) => {
      await k('Escape')
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
    // 2 枚のモニタに並べたところ（1 枚目 + フリー 2 を撮って 1 枚の絵にまとめる）。フリー 2 の 2 枚目のチャートはリンク 1 で 1 枚目の銘柄を追う
    'multi',
    async ({ k, type, page, app }) => {
      await k('Control+Shift+Digit4')
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
      const charts = w.locator('[data-widget="chart"]')
      await charts.first().locator('canvas').first().waitFor()
      await charts.nth(1).click({ position: { x: 200, y: 150 } })
      await w.keyboard.press('Control+Digit1')
      await page.bringToFront()
      await page
        .locator('[data-widget="chart"]')
        .first()
        .click({ position: { x: 300, y: 200 } })
      await type('8058')
      await k('Enter')
      await wait(2500)
      for (const p of [page, w]) await p.evaluate(() => document.querySelectorAll('.toasts .toast').forEach((t) => t.remove()))
      const shots = [(await page.screenshot()).toString('base64'), (await w.screenshot()).toString('base64')]
      await w.close()
      // まとめる窓（アプリの外の素の窓）
      const made = app.waitForEvent('window')
      await app.evaluate(({ BrowserWindow }) => {
        const b = new BrowserWindow({ useContentSize: true, width: 1800, height: 700, show: true, backgroundColor: '#0b0d10' })
        b.loadURL('about:blank')
      })
      const c = await made
      await c.setViewportSize({ width: 1800, height: 700 })
      const screen = (src, label) =>
        `<figure><div class="bezel"><img src="data:image/png;base64,${src}"></div><div class="stand"></div><figcaption>${label}</figcaption></figure>`
      await c.setContent(`<!doctype html><meta charset="utf-8"><style>
        html,body{margin:0;width:1800px;height:700px;background:radial-gradient(ellipse at 50% 30%,#1c2230,#0b0d10 70%);font:600 20px "Segoe UI","Yu Gothic UI",sans-serif;color:#aab3c2;overflow:hidden}
        main{display:flex;gap:48px;justify-content:center;align-items:flex-start;padding-top:36px}
        figure{margin:0;display:flex;flex-direction:column;align-items:center}
        .bezel{padding:12px;background:#15181e;border:1px solid #2a2f38;border-radius:10px;box-shadow:0 24px 60px #000a}
        img{display:block;width:820px;height:488px}
        .stand{width:160px;height:36px;background:linear-gradient(#20242c,#15181e);clip-path:polygon(30% 0,70% 0,85% 100%,15% 100%)}
        figcaption{margin-top:18px}
      </style><main>${screen(shots[0], '1 枚目（メイン）')}${screen(shots[1], 'フリー 2（2 枚目のモニタ）')}</main>`)
      await c
        .locator('img')
        .last()
        .evaluate((i) => i.decode())
      return c
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
