// 見た目の回帰テスト（NFR-Q10）: 主要なダイアログを基準画像と比べ、意図しない変化を見つける。
// データや時刻で変わる所（チャート・時計）は避け、要素だけを撮る。基準画像は `npx playwright test visual --update-snapshots` で作り直す。
// 並列のあとの直列の project で回す（ほかの窓の負荷で描画がぶれないように）
import { expect, keys, test } from './support'

const opts = { maxDiffPixelRatio: 0.03, threshold: 0.25, animations: 'disabled' as const }

test.describe('見た目（NFR-Q10, FR-V8）', () => {
  test('初回の確認（空の userData）', async ({ launch }) => {
    const { page } = await launch({ fresh: true })
    const dlg = page.getByRole('dialog').first()
    await dlg.waitFor()
    await page.evaluate(() => document.fonts.ready)
    await expect(dlg).toHaveScreenshot('firstrun.png', opts)
    await keys(page, 'Enter')
    await expect(dlg).toContainText('TradingView')
    await expect(dlg).toHaveScreenshot('firstrun-fetch.png', opts)
  })

  test('ショートカット一覧・設定（ダーク・ライト）', async ({ start }) => {
    const { page } = await start()
    await page.evaluate(() => document.fonts.ready)
    await keys(page, 'F1')
    const help = page.getByRole('dialog', { name: 'ショートカット' })
    await expect(help).toHaveScreenshot('help-dark.png', opts)
    await keys(page, 'Escape')
    await expect(help).toHaveCount(0)
    await keys(page, 'Control+Comma')
    const set = page.getByRole('dialog', { name: '設定' })
    await expect(set).toBeVisible()
    await keys(page, 'ArrowDown')
    await expect(set).toContainText('テーマ')
    await expect(set).toHaveScreenshot('settings-display-dark.png', opts)
    // ライトテーマ（FR-V8）
    await set.getByRole('button', { name: 'ライト' }).focus()
    await keys(page, 'Enter')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await expect(set).toHaveScreenshot('settings-display-light.png', opts)
    // 本文の Esc はタブへ戻る（もう一度で閉じる。docs/design-dialogs.md §6）
    await keys(page, 'Escape', 'Escape')
    await expect(set).toHaveCount(0)
    await keys(page, 'F1')
    await expect(page.getByRole('dialog', { name: 'ショートカット' })).toHaveScreenshot('help-light.png', opts)
  })

  test('ペインの種類・設定のデータのタブ（ライト。危険な操作の枠）（FR-KB10, FR-KB11）', async ({ start }) => {
    const { page } = await start()
    await page.evaluate(() => document.fonts.ready)
    await keys(page, 'Control+Shift+KeyN')
    const wp = page.locator('.dialog.wpick')
    await expect(wp.locator('.card.sel')).toBeVisible()
    await expect(wp).toHaveScreenshot('widget-picker.png', opts)
    await keys(page, 'Escape')
    await expect(wp).toHaveCount(0)
    await keys(page, 'Control+Comma', 'ArrowDown')
    const set = page.getByRole('dialog', { name: '設定' })
    await set.getByRole('button', { name: 'ライト' }).focus()
    await keys(page, 'Enter')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await keys(page, 'Escape', 'ArrowDown', 'ArrowDown')
    await expect(set.getByRole('tab', { name: 'データ' })).toHaveAttribute('aria-selected', 'true')
    await expect(set.locator('.card2.danger')).toBeVisible()
    await expect(set).toHaveScreenshot('settings-data-light.png', opts)
  })

  test('マイレイアウトのページのメニュー（FR-L14）', async ({ start }) => {
    const { page } = await start()
    await page.evaluate(() => document.fonts.ready)
    await keys(page, 'Control+Shift+l')
    const menu = page.getByRole('menu', { name: 'マイレイアウトのページ' })
    await expect(menu).toContainText('今のタブを写してページに足す')
    await expect(menu).toHaveScreenshot('pages-menu.png', opts)
  })
})
