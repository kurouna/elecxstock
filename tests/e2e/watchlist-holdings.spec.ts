// ウォッチリストの「保有」タブ（FR-W10）: 保有の記録の銘柄を出し、中身はここでは変えられない
import { expect, test } from '@playwright/test'
import { keys, launch } from './helpers'

test('ウォッチリスト: 保有のタブに保有の銘柄が並び、外す・並べ替えはできない', async () => {
  const { app, page } = await launch()
  await expect(page.getByRole('dialog', { name: /elecxstock/ })).toBeVisible()
  await keys(page, 'Enter', 'Enter')
  await expect(page.locator('footer')).toContainText(/待機/, { timeout: 60_000 })
  const wl = page.locator('[data-widget="watchlist"]').first()
  // 保有が無いときは、取り込み方を案内する
  await wl.getByRole('tab', { name: /保有/ }).click()
  await expect(wl).toContainText('保有タブ（Ctrl+Shift+8）')

  // 保有を取り込む（CSV の取り込みと同じ API。ファイルの選択は OS のダイアログなので使わない）
  const h = (code: string, account: string, quantity: number, avgCost: number) => ({ code, account, quantity, avgCost, broker: 'rakuten' })
  await page.evaluate(
    async (hs) => {
      const meta = { broker: 'rakuten', importedAt: '2026-11-14T00:00:00Z', realized: null, dividends: null }
      await (window as unknown as { elecxstock: { call: (m: string, p: unknown) => Promise<unknown> } }).elecxstock.call(
        'portfolio.applyCsv',
        {
          holdings: hs,
          meta,
        },
      )
    },
    [h('8058', 'nisa_growth', 100, 3500), h('7203', 'tokutei', 200, 2500), h('7203', 'nisa_growth', 100, 2600)],
  )
  // 保有の一覧を読み直す（保有タブを開くと読み込む）
  await keys(page, 'Control+Shift+Digit8', 'Control+Shift+Digit1')
  const tab = wl.getByRole('tab', { name: /保有/ })
  await tab.click()
  await expect(tab).toHaveAttribute('aria-selected', 'true')
  // 同じ銘柄を 2 つの口座で持っていても 1 行
  await expect(wl.locator('tbody tr')).toHaveCount(2)
  await expect(wl.locator('tbody')).toContainText('7203')
  await expect(wl.locator('tbody')).toContainText('8058')
  await expect(tab).toContainText('2')

  // ↓ でめくるとチャートが追従する
  await wl.locator('tbody tr').first().click()
  await keys(page, 'ArrowDown')
  await expect(page.locator('[data-widget="chart"]').first()).toContainText('8058')
  // Delete で外そうとしても外れず、理由を知らせる
  await keys(page, 'Delete')
  await expect(page.locator('.toasts')).toContainText('「保有」のタブは保有の記録から作る')
  await expect(wl.locator('tbody tr')).toHaveCount(2)
  // Ctrl+PgDn でほかのリストへ移れる
  await keys(page, 'Control+PageDown')
  await expect(tab).toHaveAttribute('aria-selected', 'false')
  await app.close()
})
