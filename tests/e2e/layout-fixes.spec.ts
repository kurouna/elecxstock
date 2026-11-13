// 画面まわりの細かい振る舞い: グリッドの拡大から戻る・「サイズを戻す」の無効・ドロワーから元の位置へ戻す・
// 配当の履歴のツールチップ・銘柄ジャンプの外をクリックで閉じる（ポインタの操作を確かめるのでマウスも使う）
import { expect, test } from '@playwright/test'
import { keys, launch } from './helpers'

test('画面: 拡大から戻る・サイズを戻すの無効・ドロワーから元の位置へ・配当のツールチップ・ジャンプを外クリックで閉じる', async () => {
  const { app, page } = await launch()
  await page.getByRole('dialog').first().waitFor()
  await keys(page, 'Enter', 'Enter')
  await expect(page.locator('footer')).toContainText(/待機中/, { timeout: 60_000 })

  // 既定の大きさのままなら「サイズを戻す」は押せない
  const reset = page.getByRole('button', { name: /サイズを戻す/ })
  await keys(page, 'Control+Shift+Digit2')
  await expect(reset).toBeDisabled()

  // グリッド: タイルをダブルクリックで拡大 →「グリッドに戻る」で戻る
  await page.locator('.tile').first().dblclick()
  await expect(page.locator('.tile')).toHaveCount(1)
  await page.getByRole('button', { name: /グリッドに戻る/ }).click()
  await expect(page.locator('.tile').nth(1)).toBeVisible()

  // インカム: ウォッチリストをドロワーへ → ピン留め → 本体へ戻すと、元の位置（左の列の上）に戻る
  await keys(page, 'Control+Shift+Digit4')
  const wl = page.locator('[data-pane-id]').first()
  const before = (await wl.boundingBox())!
  await wl.hover()
  await wl.getByRole('button', { name: 'ペインを左のドロワーへ' }).click()
  await page.locator('[data-dock-rail="left"]').hover()
  await page.locator('.dock .pin').click()
  await page.locator('.dock [data-pane-id]').first().hover()
  await page.locator('.dock').getByRole('button', { name: 'ドロワーのペインを本体に戻す' }).click()
  await expect(page.locator('[data-dock-rail]')).toHaveCount(0)
  const after = (await page.locator('[data-pane-id]').first().boundingBox())!
  expect(Math.abs(after.x - before.x)).toBeLessThan(4)
  expect(Math.abs(after.width - before.width)).toBeLessThan(8)
  expect(Math.abs(after.height - before.height)).toBeLessThan(8)

  // 配当の履歴: 棒に金額が出て、ポインタを載せると権利落ち日の詳細が出る
  const bars = page.locator('.bars')
  await expect(bars.locator('.v.show').first()).toBeVisible()
  await bars.locator('.b').last().hover()
  await expect(bars.locator('.tip')).toContainText('権利落ち日')

  // 銘柄ジャンプ: 外をクリックすると閉じる
  await page.locator('[data-pane-id]').first().click()
  await keys(page, 'Digit8', 'Digit0')
  await expect(page.locator('.dialog.jump')).toBeVisible()
  await page.mouse.click(1200, 300)
  await expect(page.locator('.dialog.jump')).toHaveCount(0)
  await app.close()
})
