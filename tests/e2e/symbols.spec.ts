// 銘柄の扱い: 銘柄ジャンプの ☆（Ctrl+D）・リストへの追加（Ctrl+Enter）、ジャンプ後の Ctrl+D、一覧からのドラッグ＆ドロップ（FR-DR7）
import { expect, test } from '@playwright/test'
import { keys, launch } from './helpers'

test('銘柄: ジャンプの ☆ と Ctrl+Enter・ジャンプ後の Ctrl+D・ドラッグでタイルに落とす', async () => {
  const { app, page } = await launch()
  await page.getByRole('dialog').first().waitFor()
  await keys(page, 'Enter', 'Enter')
  await expect(page.locator('footer')).toContainText(/待機中/, { timeout: 60_000 })

  // MTF: ウォッチリスト（お気に入り）にフォーカス。ジャンプ → Ctrl+D でお気に入りに入れる（コマンドバーは開いたまま）
  await keys(page, 'Control+Shift+Digit1')
  await page.waitForTimeout(300)
  await keys(page, 'Digit7', 'Digit2', 'Digit0', 'Digit3')
  const pal = page.locator('.dialog.jump')
  await expect(pal).toContainText('トヨタ')
  await keys(page, 'Control+d')
  // ☆ のあとはコードが空になり、閉じずに次のコードを待つ
  await expect(pal).toContainText('続けて次のコード')
  await keys(page, 'Digit7', 'Digit2', 'Digit0', 'Digit3')
  await expect(pal.getByRole('button', { name: 'お気に入りから外す' }).first()).toBeVisible()
  await keys(page, 'Enter')
  // 別の銘柄にジャンプしてから Ctrl+D: 前の行（7203）を外さずに、表示中の銘柄を入れる
  await keys(page, 'Digit8', 'Digit0', 'Digit0', 'Digit1')
  await expect(pal).toContainText('伊藤忠')
  await keys(page, 'Enter')
  await keys(page, 'Control+d')
  await expect(page.locator('.toasts')).toContainText('伊藤忠')
  const wl = page.locator('[data-pane-id]').first()
  await expect(wl).toContainText('7203')
  await expect(wl).toContainText('8001')

  // インカム: 高配当のリストにフォーカスして Ctrl+Enter でそのリストに足す
  await keys(page, 'Control+Shift+Digit4')
  await page.waitForTimeout(300)
  await keys(page, 'Digit8', 'Digit0', 'Digit5', 'Digit8')
  await expect(pal).toContainText('高配当 に追加')
  await keys(page, 'Control+Enter')
  await expect(page.locator('[data-pane-id]').first()).toContainText('8058')

  // グリッド: ドロワーのスクリーナーの行をタイルにドラッグすると、ドロワーが畳まれてタイルが差し替わる
  await keys(page, 'Control+Shift+Digit2', 'Control+b')
  const row = page.locator('.dock .slot:not([hidden]) tbody tr[draggable="true"]').first()
  await expect(row).toBeVisible()
  const code = (await row.locator('td').first().textContent())!.replace(/\D/g, '')
  const tile = page.locator('.tile').nth(2)
  await row.dragTo(tile)
  await expect(page.locator('.dock')).not.toHaveClass(/open/)
  await expect(page.locator('.tile').nth(2).locator('.h')).toContainText(code)

  // MTF: ウォッチリストの行を日足のチャートに落とすと、リンク色の同じチャートがその銘柄になる
  await keys(page, 'Control+Shift+Digit1')
  const src = page.locator('[data-pane-id]').first().locator('tbody tr[draggable="true"]', { hasText: '8001' })
  const chart = page.locator('[data-widget="chart"]').first()
  const a = (await src.boundingBox())!
  const b = (await chart.boundingBox())!
  await page.mouse.move(a.x + 40, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 })
  await expect(chart).toHaveAttribute('data-drop', 'on')
  await page.screenshot({ path: 'test-results/drop-chart.png' })
  await page.mouse.up()
  await expect(chart.locator('.ph')).toContainText('8001')
  await app.close()
})
