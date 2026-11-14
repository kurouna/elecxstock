// 銘柄情報ペインを、いくつかの大きさで撮る（デザインの見直し用。docs/mock/info-before/）。スタブのプロバイダ（架空の値）。
// 使い方: npm run build && node scripts/shot-info-sizes.mjs [出力先（既定は docs/mock/info-before）]
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from '@playwright/test'

const out = join(process.cwd(), ...(process.argv[2] ? [process.argv[2]] : ['docs', 'mock', 'info-before']))
mkdirSync(out, { recursive: true })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const userData = mkdtempSync(join(tmpdir(), 'elecxstock-info-'))
const app = await electron.launch({ args: ['.'], env: { ...process.env, ELECXSTOCK_PROVIDER: 'stub', ELECXSTOCK_USER_DATA: userData } })
const page = await app.firstWindow()
const k = async (...keys) => {
  for (const x of keys) {
    await page.keyboard.press(x)
    await wait(80)
  }
}
await page.getByRole('dialog').waitFor()
await k('Enter', 'Enter')
await page
  .locator('footer')
  .getByText(/待機|Idle/)
  .waitFor({ timeout: 60_000 })
// 保有を 1 つ入れて、保有の欄も出す
await k('Control+Shift+Digit7', 'Insert')
for (const ch of '8058') await k(`Digit${ch}`)
await k('Tab', 'Tab')
for (const ch of '200') await k(`Digit${ch}`)
await k('Tab')
for (const ch of '10500') await k(`Digit${ch}`)
await k('Enter')
// スクリーナーのタブの銘柄情報（右下）を最大化して、窓の大きさを変えて撮る
await k('Control+Shift+Digit2')
const info = page.locator('[data-widget="info"]')
await info.click({ position: { x: 100, y: 10 } })
await k('Digit8', 'Digit0', 'Digit5', 'Digit8', 'Enter')
await info.click({ position: { x: 100, y: 10 } })
await k('Control+Shift+Enter')
const sizes = [
  ['xs', 360, 640],
  ['s', 520, 520],
  ['m', 760, 460],
  ['l', 1100, 620],
  ['xl', 1500, 640],
]
for (const [name, w, h] of sizes) {
  await app.evaluate(
    ({ BrowserWindow }, s) => {
      const b = BrowserWindow.getAllWindows()[0]
      b.unmaximize()
      b.setMinimumSize(200, 200)
      b.setContentSize(s.w, s.h + 62) // トップバーとステータスバー
    },
    { w, h },
  )
  await wait(800)
  await page.evaluate(() => document.querySelectorAll('.toasts .toast').forEach((t) => t.remove()))
  await page.locator('.pane.maxed').screenshot({ path: join(out, `${name}.png`) })
  console.log('shot', name, w, h)
}
await app.close()
