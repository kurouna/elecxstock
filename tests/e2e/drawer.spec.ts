// ドロワー（FR-DR2・DR3・DR6）: 見出しのボタンで移す・戻す、ポインタで開く・自動で隠れる・ピン留め（ポインタの操作を確かめるのでマウスを使う）
import { expect, test } from '@playwright/test'
import { keys, launch } from './helpers'

test('ドロワー: 見出しから移す・自動で隠れる・ピン留め・本体に戻す', async () => {
  const { app, page } = await launch()
  await page.getByRole('dialog').first().waitFor()
  await keys(page, 'Enter', 'Enter')
  await expect(page.locator('footer')).toContainText(/待機中/, { timeout: 60_000 })
  await keys(page, 'Control+Shift+Digit4')
  const wl = page.locator('[data-pane-id]').first()
  await wl.hover()
  await wl.getByRole('button', { name: 'ペインを左のドロワーへ' }).click()
  const rail = page.locator('[data-dock-rail="left"]')
  await expect(rail).toBeVisible()
  await page.mouse.move(1000, 400)
  await page.mouse.click(1000, 400)
  await expect(page.locator('.dock')).not.toHaveClass(/open/)
  const box = (await rail.boundingBox())!
  await page.mouse.move(box.x + 10, box.y + 300, { steps: 5 })
  await page.waitForTimeout(400)
  await expect(page.locator('.dock')).toHaveClass(/open/)
  await page.mouse.move(box.x + 10, box.y + 2, { steps: 10 }) // 帯に沿って上へ離れる
  await page.mouse.move(400, 0, { steps: 2 })
  await page.waitForTimeout(500)
  await expect(page.locator('.dock')).not.toHaveClass(/open/)
  await page.mouse.move(box.x + 10, box.y + 300, { steps: 5 })
  await page.waitForTimeout(400)
  await page.locator('.dock .pin').click()
  await page.mouse.move(1200, 500, { steps: 10 })
  await page.waitForTimeout(500)
  await expect(page.locator('.dock')).toHaveClass(/pinned/)
  await page.locator('.dock [data-pane-id]').first().hover()
  await page.locator('.dock').getByRole('button', { name: 'ドロワーのペインを本体に戻す' }).click()
  await expect(rail).toHaveCount(0)
  await app.close()
})
