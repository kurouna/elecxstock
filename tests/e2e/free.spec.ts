// フリーのレイアウト（FR-L11）: リンク色の無いチャートは銘柄を別々に持ち、見出しのボタンで分割できる
import { expect, test } from '@playwright/test'
import { keys, launch } from './helpers'

test('フリー: チャートごとに別の銘柄・ジャンプはそのチャートだけ・見出しから分割', async () => {
  const { app, page } = await launch()
  await page.getByRole('dialog').first().waitFor()
  await keys(page, 'Enter', 'Enter')
  await expect(page.locator('footer')).toContainText(/待機中/, { timeout: 60_000 })
  await keys(page, 'Control+Shift+Digit8')
  const panes = page.locator('.main [data-pane-id]')
  await expect(panes).toHaveCount(4)
  await expect(panes.nth(0).locator('.ph')).toContainText('7203')
  await expect(panes.nth(1).locator('.ph')).toContainText('8306')
  await page.screenshot({ path: 'test-results/free.png' })

  // 2 枚目にフォーカスして銘柄ジャンプ: 2 枚目だけが変わる（F6 でペインを順に巡る）
  await keys(page, 'F6')
  await keys(page, 'Digit8', 'Digit0', 'Digit0', 'Digit1', 'Enter')
  await expect(panes.nth(1).locator('.ph')).toContainText('8001')
  await expect(panes.nth(0).locator('.ph')).toContainText('7203')
  await expect(panes.nth(2).locator('.ph')).toContainText('8058')

  // C キーでこのチャート（リンク色なし）の銘柄だけを変える
  await keys(page, 'F6')
  await keys(page, 'c')
  const pal = page.locator('.dialog.palette')
  await expect(pal).toContainText('の代わりに表示する銘柄')
  await page.keyboard.type('2914')
  await expect(pal.locator('.it.sel')).toContainText('2914') // 選んでいる行が 2914 になってから決める
  await keys(page, 'Enter')
  await expect(panes.nth(2).locator('.ph')).toContainText('2914')
  await expect(panes.nth(1).locator('.ph')).toContainText('8001')

  // 左のドロワーにウォッチリスト・スクリーナーがある
  await expect(page.locator('[data-dock-rail="left"]')).toContainText('スクリーナー')

  // 見出しの ⊟ で下に分割すると 5 枚になり、新しいチャートは元の銘柄を引き継ぐ
  await panes.nth(0).hover()
  await panes.nth(0).getByRole('button', { name: '下に分割' }).click()
  await expect(panes).toHaveCount(5)
  await expect(panes.nth(1).locator('.ph')).toContainText('7203')

  // このタブのレイアウトを初期状態に戻す: 確認は ← → で選び Enter で決める（危険な操作なので取り消しから始まる）
  const reset = async () => {
    await keys(page, 'Control+k')
    await page.keyboard.type('初期状態')
    await keys(page, 'Enter')
    await expect(page.getByRole('alertdialog')).toContainText('「フリー」のレイアウト')
  }
  await reset()
  await keys(page, 'Enter') // 取り消し
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect(panes).toHaveCount(5)
  await reset()
  await keys(page, 'ArrowRight', 'Enter') // 実行
  await expect(page.locator('.toasts')).toContainText('「フリー」のレイアウトを初期状態に戻しました')
  await expect(panes).toHaveCount(4)
  await app.close()
})
