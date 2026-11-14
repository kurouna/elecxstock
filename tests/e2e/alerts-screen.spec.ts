// スクリーンのアラート（FR-AL2）とフリーのウィンドウからの作成（AL2）。キーだけで操作する。値はスタブ（架空）
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type ElectronApplication, expect, type Page, test } from '@playwright/test'
import { keys, launch } from './helpers'

async function ready(page: Page) {
  await expect(page.getByRole('dialog', { name: /elecxstock/ })).toBeVisible()
  await keys(page, 'Enter', 'Enter')
  await expect(page.locator('footer')).toContainText(/待機/, { timeout: 60_000 })
}

test('スクリーンのアラート: スクリーナーから作り、新しく入った銘柄で鳴り、履歴からスクリーンを開く', async () => {
  test.setTimeout(180_000)
  const first = await launch()
  const { page } = first
  await ready(page)
  // スクリーナー（高配当銘柄）にフォーカスして Ctrl+Alt+A → 対象は開いているスクリーン
  await keys(page, 'Control+Shift+Digit2')
  await expect(page.locator('[data-widget="screener"]')).toContainText('高配当銘柄')
  await keys(page, 'Control+Alt+a')
  const form = page.locator('.dialog.alertform')
  await expect(form.getByRole('radio', { name: 'スクリーン' })).toHaveAttribute('aria-checked', 'true')
  await expect(form).toContainText('新しく入った銘柄')
  await expect(form.locator('.nowline')).toContainText('外れた銘柄は知らせません')
  await page.screenshot({ path: 'test-results/alerts-4-screen-form.png' })
  // ← → で銘柄に切り替えられる（戻してから作る）
  await keys(page, 'ArrowLeft')
  await expect(form.getByRole('radio', { name: 'スクリーン' })).toHaveAttribute('aria-checked', 'false')
  await keys(page, 'ArrowRight', 'Control+Enter')
  await expect(page.locator('.toasts')).toContainText('アラートを作りました: [高配当銘柄]')
  await keys(page, 'Control+Alt+l')
  const row = page.locator('.dialog.alerts tbody tr', { hasText: '[高配当銘柄]' })
  await expect(row).toContainText('新しく入った銘柄')
  await expect(row).toContainText(/\d+ 件/)
  await keys(page, 'Escape')
  await first.app.close()

  // 前の結果を空・古い日付にしておく → 次の判定で結果の銘柄がすべて「新しく入った」
  const dir = join(first.userData, 'data', 'user')
  const list = JSON.parse(readFileSync(join(dir, 'alerts.json'), 'utf8')).data
  writeFileSync(
    join(dir, 'alertState.json'),
    JSON.stringify({ version: 1, data: { [list[0].id]: { met: false, asOf: '2000-01-04', members: [] } } }),
  )
  const second = await launch({ userData: first.userData })
  const p2 = second.page
  await expect(p2.locator('footer')).toContainText(/待機/, { timeout: 60_000 })
  await keys(p2, 'F5')
  await expect(p2.locator('.toasts')).toContainText(/\[高配当銘柄\] に \d+ 件入りました/, { timeout: 60_000 })
  // 履歴の Enter でスクリーナーにそのスクリーンを開く。グリッドのタブではドロワーのスクリーナーを開いて見せる
  await keys(p2, 'Control+Shift+Digit3', 'Control+Alt+l')
  const hist = p2.locator('.dialog.alerts tbody tr', { hasText: '[高配当銘柄]' })
  await expect(hist).toHaveClass(/unread/)
  await p2.screenshot({ path: 'test-results/alerts-5-screen-history.png' })
  await keys(p2, 'Enter')
  await expect(p2.locator('[data-widget="screener"]')).toBeVisible()
  await expect(p2.locator('[data-widget="screener"]')).toContainText('高配当銘柄')
  await second.app.close()
})

/** Ctrl+Alt+N で開き、初期の形を選ぶ */
async function openFree(app: ElectronApplication, page: Page, label: string): Promise<Page> {
  const next = app.waitForEvent('window')
  await keys(page, 'Control+Alt+n')
  const dlg = page.locator('.dialog')
  await expect(dlg).toContainText('初期の形')
  await dlg.getByText(label, { exact: true }).click()
  const w = await next
  await w.waitForLoadState('domcontentloaded')
  await w.setViewportSize({ width: 1400, height: 900 }).catch(() => {})
  await expect(w.locator('.wname')).toBeVisible({ timeout: 20_000 })
  return w
}

test('フリーのウィンドウからもアラートを作れる。ポップアップは 1 枚目だけ', async () => {
  const { app, page } = await launch()
  await ready(page)
  const free = await openFree(app, page, 'チャートグリッド')
  const grid = free.locator('[data-widget="grid"]')
  await grid.click({ position: { x: 200, y: 200 } })
  await keys(free, 'Digit8', 'Digit0', 'Digit5', 'Digit8', 'Enter')
  await expect(grid.locator('.tile').first()).toContainText('8058')
  await keys(free, 'Control+Alt+a')
  await expect(free.locator('.dialog.alertform')).toContainText('三菱商事')
  await keys(free, 'Control+Enter')
  await expect(free.locator('.toasts')).toContainText('アラートを作りました: 8058')
  // ポップアップはフリーでは開かない
  await keys(free, 'Control+Alt+l')
  await expect(free.locator('.dialog.alerts')).toHaveCount(0)
  // 1 枚目の一覧に届く（user.changed）
  await page.bringToFront()
  await keys(page, 'Control+Alt+l')
  await expect(page.locator('.dialog.alerts tbody tr', { hasText: '8058' })).toBeVisible()
  await app.close()
})
