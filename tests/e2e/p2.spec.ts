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
  await keys(page, 'Control+Shift+Digit2')
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
  await keys(page, 'Escape', 'Control+Shift+Digit1', 'Control+Shift+l', 'Enter')
  await expect(page.locator('.toasts')).toContainText('レイアウトを開きました')
  await expect(page.locator('[data-pane-id]').filter({ hasText: 'チャートグリッド' })).toBeVisible()

  // Market: ヒートマップ（33 業種）とランキング
  await keys(page, 'Control+Shift+Digit6')
  await expect(page.locator('.map .cell').first()).toBeVisible()
  await keys(page, 'ArrowRight', 'Enter') // 業種の中へ
  await expect(page.locator('.map .cell').first()).toBeVisible()
  await keys(page, 'Escape')
  await page.screenshot({ path: 'test-results/p2-market.png' })

  // 右のドロワーの保有に、数量と平均取得単価を直接入れて足す
  await keys(page, 'Control+Shift+b', 'Insert')
  await page.keyboard.type('7203')
  await keys(page, 'Enter', 'Enter') // コード → 口座区分（NISA 成長投資枠）
  await keys(page, 'ArrowDown', 'ArrowDown', 'Enter') // 数量と平均取得単価を直接入れる
  await page.keyboard.type('100')
  await keys(page, 'Enter')
  await page.keyboard.press('Control+a')
  await page.keyboard.type('2500')
  await keys(page, 'Enter')
  await expect(page.locator('.toasts')).toContainText('保有を保存しました')
  await expect(page.locator('.dock.open')).toContainText('7203')
  await expect(page.locator('.dock.open')).toContainText('NISA 成長投資枠')
  await page.screenshot({ path: 'test-results/p2-portfolio.png' })
  await keys(page, 'Escape')

  // チャート: I の指標メニューから RSI を足す（下に段が増える）
  await keys(page, 'Control+Shift+Digit5', 'i', 'Enter') // トリプル: 最初のペインは日足のチャート
  await expect(page.locator('.dialog')).toContainText('RSI')
  for (let i = 0; i < 5; i++) await keys(page, 'ArrowDown')
  await keys(page, 'Space', 'Enter')
  await expect(page.locator('[data-pane-id]').first()).toContainText('RSI14')
  await app.close()
})
