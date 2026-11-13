// 見た目の回帰テスト（NFR-Q10）: 主要なダイアログを基準画像と比べ、意図しない変化を見つける。
// データや時刻で変わる所（チャート・時計）は避け、要素だけを撮る。基準画像は `npx playwright test visual --update-snapshots` で作り直す。
import { expect, test } from '@playwright/test'
import { keys, launch } from './helpers'

const opts = { maxDiffPixelRatio: 0.03, threshold: 0.25, animations: 'disabled' as const }

test('見た目: 初回の確認・ショートカット一覧・設定（ダーク・ライト）', async () => {
  const { app, page } = await launch()
  const dlg = page.getByRole('dialog').first()
  await dlg.waitFor()
  await page.evaluate(() => document.fonts.ready)
  await expect(dlg).toHaveScreenshot('firstrun.png', opts)
  await keys(page, 'Enter')
  await expect(dlg).toContainText('TradingView')
  await expect(dlg).toHaveScreenshot('firstrun-fetch.png', opts)
  await keys(page, 'Enter')
  await expect(page.locator('footer')).toContainText(/待機/, { timeout: 60_000 })
  await keys(page, 'F1')
  const help = page.getByRole('dialog', { name: 'ショートカット' })
  await expect(help).toHaveScreenshot('help-dark.png', opts)
  await keys(page, 'Escape', 'Control+Comma', 'ArrowDown')
  const set = page.getByRole('dialog', { name: '設定' })
  await expect(set).toContainText('テーマ')
  await expect(set).toHaveScreenshot('settings-display-dark.png', opts)
  // ライトテーマ（FR-V8）
  await set.getByRole('button', { name: 'ライト' }).focus()
  await keys(page, 'Enter')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(set).toHaveScreenshot('settings-display-light.png', opts)
  await keys(page, 'Escape', 'F1')
  await expect(page.getByRole('dialog', { name: 'ショートカット' })).toHaveScreenshot('help-light.png', opts)
  await app.close()
})
