// グリッドのページ送り（FR-G2）: ツールバーの ‹ ›、矢印でページの端を越える
import { expect, test } from '@playwright/test'
import { keys, launch } from './helpers'

test('グリッド: ‹ › と矢印でページをめくる', async () => {
  const { app, page } = await launch()
  await expect(page.getByRole('dialog', { name: /elecxstock/ })).toBeVisible()
  await keys(page, 'Enter', 'Enter')
  await expect(page.locator('footer')).toContainText(/待機/, { timeout: 60_000 })
  await keys(page, 'Control+Shift+Digit3')
  const grid = page.locator('[data-widget="grid"]')
  // いちばん小さい格子（2×2）にしてページを増やす
  for (let i = 0; i < 6; i++) await keys(page, 'Minus')
  const label = grid.getByText(/^ページ \d+\/\d+$/)
  await expect(label).toHaveText(/^ページ 1\/[2-9]\d*$/)
  const prev = grid.getByRole('button', { name: '前のページ' })
  const next = grid.getByRole('button', { name: '次のページ' })
  await expect(prev).toBeDisabled()

  // 最後のタイルで → は次のページの先頭、先頭で ← は前のページの最後
  const tiles = grid.locator('.tile')
  await keys(page, 'End', 'ArrowRight')
  await expect(label).toHaveText(/^ページ 2\//)
  await expect(tiles.first()).toHaveClass(/sel/)
  await keys(page, 'ArrowLeft')
  await expect(label).toHaveText(/^ページ 1\//)
  await expect(tiles.last()).toHaveClass(/sel/)
  // 最下段で ↓ は次のページ、最上段で ↑ は前のページ
  await keys(page, 'Home', 'ArrowDown', 'ArrowDown')
  await expect(label).toHaveText(/^ページ 2\//)
  await keys(page, 'ArrowUp')
  await expect(label).toHaveText(/^ページ 1\//)

  // ツールバーのボタン
  await next.click()
  await expect(label).toHaveText(/^ページ 2\//)
  await prev.click()
  await expect(label).toHaveText(/^ページ 1\//)
  await expect(prev).toBeDisabled()
  await app.close()
})
