// 保有の編集（FR-H7）: Insert で足す・E で直す・Delete で外す。説明は (i) のボタン。タブの並びとキーの表示
import { expect, test } from '@playwright/test'
import { keys, launch } from './helpers'

async function ready(page: import('@playwright/test').Page) {
  await expect(page.getByRole('dialog', { name: /elecxstock/ })).toBeVisible()
  await keys(page, 'Enter', 'Enter')
  await expect(page.locator('footer')).toContainText(/待機/, { timeout: 60_000 })
}

test('保有: キーだけで足す・直す・外す。注釈は (i) のボタンに入れる', async () => {
  const { app, page } = await launch()
  await ready(page)
  // タブの並び: マーケットが最初、保有は 7。数字はキーの形で出す
  const tabs = page.locator('.presets button')
  await expect(tabs.first()).toContainText('マーケット')
  await expect(tabs.nth(6)).toContainText('保有')
  await expect(tabs.first().locator('kbd.keycap')).toHaveText('1')
  await keys(page, 'Control+Shift+Digit7')
  const pf = page.locator('[data-widget="portfolio"]')
  await expect(pf).toHaveClass(/focused/)
  // 下の注釈は出さず、(i) のボタンのツールチップで説明する
  await expect(pf.locator('.note')).toHaveCount(0)
  await expect(pf.getByRole('button', { name: '説明', exact: true })).toHaveAttribute('title', /数量と平均取得単価/)

  // Insert で足す: 銘柄 → 口座区分 → 数量 → 平均取得単価 → Enter
  await keys(page, 'Insert')
  const form = page.locator('.dialog.holding')
  await expect(form).toBeVisible()
  await page.keyboard.type('7203')
  await expect(form).toContainText('トヨタ')
  await keys(page, 'Tab', 'ArrowRight', 'ArrowLeft') // 口座区分は ← → で選ぶ（既定の特定口座に戻す）
  await keys(page, 'Tab')
  await page.keyboard.type('100')
  await keys(page, 'Tab')
  await page.keyboard.type('2500')
  await keys(page, 'Enter')
  await expect(form).toHaveCount(0)
  const row = pf.locator('tbody tr', { hasText: '7203' })
  await expect(row).toContainText('100')
  await expect(pf).toContainText('特定口座')

  // E で直す: 数量を 200 に
  await keys(page, 'e')
  await expect(form).toBeVisible()
  await expect(form.locator('input[name="qty"]')).toHaveValue('100')
  await form.locator('input[name="qty"]').fill('200')
  await keys(page, 'Enter')
  await expect(row).toContainText('200')

  // Delete で外す（確認は取り消しから始まる）
  await keys(page, 'Delete')
  await expect(page.getByRole('alertdialog')).toContainText('7203')
  await keys(page, 'ArrowRight', 'Enter')
  await expect(pf.locator('tbody tr', { hasText: '7203' })).toHaveCount(0)
  await app.close()
})

test('C キー: MTF のウォッチリストや銘柄情報からも、表示する銘柄を変えられる', async () => {
  const { app, page } = await launch()
  await ready(page)
  await keys(page, 'Control+Shift+Digit4') // MTF
  await expect(page.locator('.presets [aria-current="true"]')).toContainText('MTF')
  await page
    .locator('[data-widget="watchlist"]')
    .first()
    .click({ position: { x: 100, y: 8 } })
  await keys(page, 'c')
  const pal = page.locator('.dialog.palette')
  await expect(pal).toContainText('の代わりに表示する銘柄')
  await page.keyboard.type('8058')
  // 候補は打つたびに引き直すので、選んでいる行が 8058 になってから決める
  await expect(pal.locator('.it.sel')).toContainText('8058')
  await keys(page, 'Enter')
  await expect(page.locator('[data-widget="chart"]').first()).toContainText('8058')
  await app.close()
})
