// 配布用にパッケージした exe を一度起動し、CDP で画面が描けることを確かめる（スタブのプロバイダ）。
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

const exe = process.argv[2] ?? 'release/win-unpacked/elecxstock.exe'
const userData = mkdtempSync(join(tmpdir(), 'elecxstock-pkg-'))
const child = spawn(exe, ['--remote-debugging-port=9339'], {
  env: { ...process.env, ELECXSTOCK_PROVIDER: 'stub', ELECXSTOCK_USER_DATA: userData },
  stdio: 'ignore',
})
let ok = false
try {
  let browser
  for (let i = 0; i < 40 && !browser; i++) {
    await new Promise((r) => setTimeout(r, 500))
    browser = await chromium.connectOverCDP('http://127.0.0.1:9339').catch(() => undefined)
  }
  if (!browser) throw new Error('CDP not reachable')
  const page =
    browser
      .contexts()[0]
      .pages()
      .find((p) => p.url().startsWith('app://')) ?? browser.contexts()[0].pages()[0]
  await page.getByRole('dialog').waitFor({ timeout: 20_000 })
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await page
    .locator('footer')
    .getByText(/待機|Idle/)
    .waitFor({ timeout: 60_000 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'test-results/packaged.png' })
  console.log('url', page.url(), 'title', await page.title())
  ok = true
  await browser.close()
} finally {
  child.kill()
}
process.exit(ok ? 0 : 1)
