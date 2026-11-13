// P2 の画面の振る舞いを、キーボードだけで確かめる（FR-KB8）: グリッドのタイルの差し替え・名前付きのレイアウト・
// Market レイアウト（ヒートマップ・ランキング）・右のドロワーの保有・チャートの指標メニュー
import { expect, test } from '@playwright/test'
import { keys, launch } from './helpers'

test('P2: グリッドの差し替え・保存レイアウト・マーケット・保有', async () => {
  const { app, page } = await launch()
  await page.getByRole('dialog').waitFor()
  await keys(page, 'Enter', 'Enter')
  await expect(page.locator('footer')).toContainText(/待機/, { timeout: 60_000 })

  // グリッド: 選んだタイルの銘柄を C で差し替える（このグリッドの銘柄に固定される）
  await keys(page, 'Control+Shift+Digit3')
  const grid = page.locator('[data-pane-id]').filter({ hasText: 'チャートグリッド' })
  await expect(grid.locator('.tile').first()).toBeVisible()
  await keys(page, 'c')
  await expect(page.locator('.dialog.palette')).toContainText('の代わりに表示する銘柄')
  await page.keyboard.type('8058')
  await expect(page.locator('.dialog.palette .it').first()).toContainText('三菱商事')
  await keys(page, 'Enter')
  await expect(page.locator('.toasts')).toContainText('差し替えました')
  await expect(page.locator('.bar select.srcsel')).toHaveValue('own')
  await expect(grid.locator('.tile').first()).toContainText('8058')

  // 名前を付けてレイアウトを保存し、別のプリセットに切り替えてから開く
  await keys(page, 'Control+Shift+l', 'Insert')
  await page.keyboard.type('朝の確認')
  await keys(page, 'Enter')
  await expect(page.locator('.dialog')).toContainText('朝の確認')
  await keys(page, 'Escape', 'Control+Shift+Digit4', 'Control+Shift+l', 'Enter')
  await expect(page.locator('.toasts')).toContainText('レイアウトを開きました')
  await expect(page.locator('[data-pane-id]').filter({ hasText: 'チャートグリッド' })).toBeVisible()

  // Market: ヒートマップ（33 業種）とランキング
  await keys(page, 'Control+Shift+Digit1')
  await expect(page.locator('.map .cell').first()).toBeVisible()
  await keys(page, 'ArrowRight', 'Enter') // 業種の中へ
  await expect(page.locator('.map .cell').first()).toBeVisible()
  await keys(page, 'Escape')
  await page.screenshot({ path: 'test-results/p2-market.png' })

  // 保有タブ（FR-H11）: 保有の一覧にフォーカスがあり、楽天証券の CSV の取り込みを案内する（ファイルの選択は OS のダイアログなので E2E では開かない）
  await keys(page, 'Control+Shift+Digit7')
  const pf = page.locator('[data-widget="portfolio"]')
  await expect(pf).toContainText('楽天証券の保有商品の CSV')
  await expect(pf.getByRole('button', { name: '取り込む', exact: true })).toBeVisible()
  await expect(pf).toHaveClass(/focused/)
  await page.screenshot({ path: 'test-results/p2-portfolio.png' })

  // チャート: I の指標メニューから RSI を足す（下に段が増える）
  await keys(page, 'Control+Shift+Digit5', 'Alt+ArrowRight', 'i', 'Enter') // トリプル: 左の列のウォッチリストから右の日足のチャートへ
  await expect(page.locator('.dialog')).toContainText('RSI')
  for (let i = 0; i < 5; i++) await keys(page, 'ArrowDown')
  await keys(page, 'Space', 'Enter')
  await expect(page.locator('[data-widget="chart"]').first()).toContainText('RSI14')

  // フォーカスの枠（FR-KB3）: キーで操作しているときだけ出し、クリックしたら消す
  const ring = () =>
    page
      .locator('.pane.focused')
      .first()
      .evaluate((el) => getComputedStyle(el).boxShadow)
  await expect(page.locator('html')).toHaveAttribute('data-input', 'keyboard')
  expect(await ring()).not.toBe('none')
  await page
    .locator('.pane')
    .first()
    .click({ position: { x: 40, y: 8 } })
  await expect(page.locator('html')).toHaveAttribute('data-input', 'pointer')
  expect(await ring()).toBe('none')
  await keys(page, 'Alt+ArrowRight')
  expect(await ring()).not.toBe('none')
  await app.close()
})
