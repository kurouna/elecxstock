import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type ElectronApplication, _electron as electron, type Page } from '@playwright/test'

/** スタブのプロバイダ（外部に接続しない）と使い捨ての userData で起動する */
export async function launch(
  opts: { userData?: string; lang?: 'ja' | 'en' } = {},
): Promise<{ app: ElectronApplication; page: Page; userData: string }> {
  const userData = opts.userData ?? mkdtempSync(join(tmpdir(), 'elecxstock-e2e-'))
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, ELECXSTOCK_PROVIDER: 'stub', ELECXSTOCK_USER_DATA: userData, ELECXSTOCK_DEVTOOLS: '1' },
  })
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1600, height: 960 }).catch(() => {})
  return { app, page, userData }
}

/** キーを押す（マウスを使わない操作。FR-KB8） */
export async function keys(page: Page, ...seq: string[]): Promise<void> {
  for (const k of seq) {
    await page.keyboard.press(k)
    await page.waitForTimeout(60)
  }
}
