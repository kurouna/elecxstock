import { expect, test } from '@playwright/test'
import { launch } from './helpers'

test('起動して初回取得まで進む', async () => {
  const { app, page } = await launch()
  await expect(page.getByRole('dialog', { name: /elecxstock/ })).toBeVisible()
  await page.screenshot({ path: 'test-results/first-run.png' })
  await page.keyboard.press('Enter') // 同意
  await page.keyboard.press('Enter') // 取得を始める
  await expect(page.locator('footer')).toContainText(/完了|待機|Idle/, { timeout: 60_000 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'test-results/mtf.png' })
  await app.close()
})
