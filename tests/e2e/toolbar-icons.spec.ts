// ツールバーのボタン（FR-V13）: 説明文をラベルにせず、アイコンのボタンに名前（読み上げ）とツールチップ（説明とキー）を付ける
import { expect, type Locator, type Page, test } from '@playwright/test'
import { keys, launch } from './helpers'

async function ready(page: Page) {
  await expect(page.getByRole('dialog', { name: /elecxstock/ })).toBeVisible()
  await keys(page, 'Enter', 'Enter')
  await expect(page.locator('footer')).toContainText(/待機/, { timeout: 60_000 })
}
/** アイコンのボタン: 見える文字は無く（または記号だけ）、名前とツールチップを持つ */
async function iconButton(scope: Locator, name: string, tip: RegExp) {
  const b = scope.getByRole('button', { name, exact: true })
  await expect(b).toBeVisible()
  await expect(b).toHaveAttribute('title', tip)
  expect(((await b.textContent()) ?? '').replace(/[\s\d]/g, '').length).toBeLessThanOrEqual(1)
  return b
}

test('保有: 取り込む・書き出すはアイコンのボタンで、取り込むは CSV と JSON を選ぶ', async () => {
  const { app, page } = await launch()
  await ready(page)
  await keys(page, 'Control+Shift+Digit7')
  const pf = page.locator('[data-widget="portfolio"]')
  // 説明文のラベル・キーの説明は出さない（ツールチップに入れる）
  await expect(pf).not.toContainText('楽天証券の CSV を取り込む')
  await expect(pf).not.toContainText('Enter 送る')
  const imp = await iconButton(pf, '取り込む', /楽天証券の CSV.*JSON/s)
  await iconButton(pf, '書き出す', /JSON/)
  await imp.click()
  const dlg = page.locator('.dialog')
  await expect(dlg).toContainText('楽天証券の CSV')
  await expect(dlg).toContainText('保有の JSON')
  await keys(page, 'Escape')
  await expect(dlg).toHaveCount(0)
  await app.close()
})

test('ほかのタブのツールバーもアイコンのボタンにそろえる', async () => {
  const { app, page } = await launch()
  await ready(page)
  // MTF: ウォッチリストの ★ だけ・列
  const wl = page.locator('[data-widget="watchlist"]').first()
  await expect(wl.locator('.filter')).not.toContainText('Ctrl+Shift+F')
  await iconButton(wl, '★のみ表示', /Ctrl\+Shift\+F/)
  await iconButton(wl, '列を選ぶ', /Ctrl\+Shift\+C/)
  // スクリーナー: 保存・名前を付けて保存・グリッドで開く・列
  await keys(page, 'Control+Shift+Digit2')
  const scr = page.locator('[data-widget="screener"]')
  await iconButton(scr, '名前を付けて保存', /Ctrl\+Shift\+S/)
  await iconButton(scr, 'グリッドで開く', /Ctrl\+Shift\+G/)
  await iconButton(scr, '列を選ぶ', /Ctrl\+Shift\+C/)
  // 銘柄情報: 取り直す
  const info = page.locator('[data-widget="info"]')
  await iconButton(info, '取り直す', /Shift\+F5/)
  // グリッド: 今の銘柄で固定・候補をリストへ
  await keys(page, 'Control+Shift+Digit3')
  const grid = page.locator('[data-widget="grid"]')
  await iconButton(grid, '今の銘柄で固定', /P/)
  await iconButton(grid, '売買候補をリストに追加', /Ctrl\+Shift\+A/)
  // トップバー: サイズを戻す
  await iconButton(page.locator('header'), 'サイズを戻す', /./)
  await app.close()
})
