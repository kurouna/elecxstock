// マウスを一切使わず「起動 → 更新 → ウォッチリストをめくる → スクリーニング → 結果をウォッチリストに追加 → レイアウト切り替え」を通す（FR-KB8）。
import { expect, test } from '@playwright/test'
import { keys, launch } from './helpers'

test('キーボードだけで一日の流れを通す', async () => {
  const { app, page } = await launch()
  const shot = (n: string) => page.screenshot({ path: `test-results/kb-${n}.png` })
  // 初回起動: 同意 → 取得を始める
  await expect(page.getByRole('dialog', { name: /elecxstock/ })).toBeVisible()
  await keys(page, 'Enter', 'Enter')
  await expect(page.locator('footer')).toContainText(/待機/, { timeout: 60_000 })

  // 銘柄ジャンプ → お気に入り（チャートにフォーカスを移してから）
  await keys(page, 'Alt+ArrowRight')
  await keys(page, 'Digit8', 'Digit0', 'Digit5', 'Digit8')
  await expect(page.getByRole('dialog', { name: '銘柄ジャンプ' })).toContainText('三菱商事')
  await keys(page, 'Enter')
  await expect(page.locator('[data-pane-id]').nth(1)).toContainText('8058')
  await keys(page, 'Control+d')
  await keys(page, 'Digit7', 'Digit2', 'Digit0', 'Digit3', 'Enter', 'Control+d')
  await keys(page, 'Digit9', 'Digit4', 'Digit3', 'Digit4', 'Digit5', 'Enter', 'Control+d')
  // ウォッチリスト（★お気に入り）に移ってめくる → チャートが追従する（FR-K2）
  await keys(page, 'Alt+ArrowLeft')
  await expect(page.locator('[data-pane-id]').first()).toContainText('94345')
  await keys(page, 'Home', 'ArrowDown')
  await expect(page.locator('[data-pane-id]').nth(1)).toContainText('7203')
  await keys(page, 'w') // ウォッチリストにフォーカスがあるので週足キーは効かない（一覧のキー）
  await shot('1-mtf')

  // スクリーナー（高配当銘柄）→ 結果を ↓ でめくる → 監視リストに追加
  await keys(page, 'Control+Shift+Digit3')
  const scr = page.locator('[data-pane-id]').first()
  await expect(scr).toContainText('高配当銘柄')
  await expect(scr.locator('tbody tr').nth(2)).toBeVisible()
  await keys(page, 'Tab', 'ArrowRight') // 条件へ移り、利回りの閾値を上げる
  await expect(scr).toContainText('変更あり')
  await keys(page, 'Escape', 'ArrowDown')
  await keys(page, 'Control+Shift+a')
  await expect(page.getByRole('dialog', { name: '' }).or(page.locator('.dialog'))).toContainText('追加先のリストを選ぶ')
  await keys(page, 'ArrowDown', 'ArrowDown', 'Enter') // 「監視」
  await expect(page.locator('.toasts')).toContainText('監視')
  await keys(page, 'Control+Shift+s')
  await page.keyboard.type('高配当4%')
  await keys(page, 'Enter')
  await expect(scr).toContainText('高配当4%')
  await shot('2-screener')

  // グリッドで開く → 週足・2年 → 売買候補の印
  await keys(page, 'Control+Shift+g')
  const grid = page.locator('[data-pane-id]').filter({ hasText: 'チャートグリッド' })
  await expect(grid.locator('.tile').first()).toBeVisible()
  await keys(page, 'w', 'Alt+Digit4', 'Space', 'ArrowRight', 'Space')
  await expect(grid.locator('.tile.cand')).toHaveCount(2)
  await keys(page, 'Shift+Space')
  await expect(grid.locator('.tile')).toHaveCount(2)
  await keys(page, 'Shift+Space', 'Control+b')
  await expect(page.locator('.dock.open')).toBeVisible()
  await shot('3-grid')
  await keys(page, 'Escape')

  // レイアウトの切り替えとサイズのリセット・取り消し
  await keys(page, 'Control+Shift+Digit1', 'Alt+Shift+ArrowRight', 'Alt+Shift+ArrowRight', 'Control+Alt+r')
  await expect(page.locator('.toasts')).toContainText('サイズを元に戻しました')
  await keys(page, 'F1')
  await expect(page.getByRole('dialog', { name: 'ショートカット' })).toBeVisible()
  await shot('4-help')
  await keys(page, 'Escape', 'Control+Comma')
  await expect(page.getByRole('dialog', { name: '設定' })).toBeVisible()
  await keys(page, 'ArrowDown', 'ArrowDown')
  await shot('5-settings')
  await keys(page, 'Escape')
  await app.close()
})

test('再起動してもレイアウト・グリッド・スクリーンが残る（FR-L4, G11, SC14）', async () => {
  const first = await launch()
  await first.page.getByRole('dialog').waitFor()
  await keys(first.page, 'Enter', 'Enter')
  await expect(first.page.locator('footer')).toContainText(/待機/, { timeout: 60_000 })
  await keys(first.page, 'Control+Shift+Digit2')
  await keys(first.page, 'm', 'Alt+Digit5', 'Digit8', 'Digit9', 'Digit5', 'Digit1', 'Enter')
  await expect(first.page.locator('.bar select.srcsel')).toHaveValue('own')
  await first.page.waitForTimeout(800)
  await first.app.close()
  const second = await launch({ userData: first.userData })
  await expect(second.page.locator('.presets [aria-current="true"]')).toContainText('グリッド')
  await expect(second.page.locator('.bar select.srcsel')).toHaveValue('own')
  await expect(second.page.locator('.tile')).toHaveCount(1)
  await expect(second.page.locator('.seg button[aria-pressed="true"]').first()).toHaveText('M')
  await second.app.close()
})
