// コマンドバー・銘柄ジャンプで選んだ銘柄は必ず見える場所に出す（FR-K1）: 今のタブで同じリンク色のチャートに出せなければ MTF タブで出す
import { expect, test } from '@playwright/test'
import { keys, launch } from './helpers'

test('コマンドバーの銘柄: 今のタブに出せないときは MTF タブに移って表示する', async () => {
  const { app, page } = await launch()
  await expect(page.getByRole('dialog', { name: /elecxstock/ })).toBeVisible()
  await keys(page, 'Enter', 'Enter')
  await expect(page.locator('footer')).toContainText(/待機/, { timeout: 60_000 })
  const active = page.locator('.presets [aria-current="true"]')
  const pick = async (code: string) => {
    await keys(page, 'Control+k')
    await page.keyboard.type(code)
    await expect(page.locator('.dialog.palette .it.sel')).toContainText(code)
    await keys(page, 'Enter')
  }

  // トリプル: 同じリンク色のチャートがあるので、このタブのまま表示する
  await keys(page, 'Control+Shift+Digit5')
  await pick('8058')
  await expect(active).toContainText('トリプル')
  await expect(page.locator('[data-widget="chart"]').first()).toContainText('8058')

  // グリッド: 左のドロワーのウォッチリストから（グリッドにはリンクのチャートが無い）→ MTF で表示する
  await keys(page, 'Control+Shift+Digit3', 'Control+b')
  await expect(page.locator('.dock.open')).toBeVisible()
  await pick('9432')
  await expect(active).toContainText('MTF')
  await expect(page.locator('[data-widget="chart"]').first()).toContainText('9432')
  await expect(page.locator('.toasts')).toContainText('MTF')
  await app.close()
})
