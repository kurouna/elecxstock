// スクリーナーの条件を選ぶダイアログ: キーボードだけで探す・足す・続けて足す・閉じる（スタブのプロバイダ）
import { expect, type Page, test } from '@playwright/test'
import { keys, launch } from './helpers'

async function ready(page: Page) {
  await expect(page.getByRole('dialog', { name: /elecxstock/ })).toBeVisible()
  await keys(page, 'Enter', 'Enter')
  await expect(page.locator('footer')).toContainText(/待機/, { timeout: 60_000 })
}

test('Insert で開き、打って絞り込み、Enter で足す。Shift+Enter は続けて足す。Esc は検索を消してから閉じる', async () => {
  const { app, page } = await launch()
  await ready(page)
  await keys(page, 'Control+Shift+Digit2')
  const scr = page.locator('[data-widget="screener"]')
  await expect(scr).toHaveClass(/focused/)
  const conds = scr.locator('.cond')
  const n0 = await conds.count()

  // 打って絞り込み → Enter で足して閉じる
  await keys(page, 'Insert')
  const fp = page.locator('.dialog.picker')
  await expect(fp).toBeVisible()
  await expect(fp.getByRole('group', { name: '割安・財務' })).toBeVisible()
  await page.keyboard.type('ROE')
  await expect(fp.getByRole('option', { selected: true })).toContainText('ROE')
  await keys(page, 'Enter')
  await expect(fp).toHaveCount(0)
  await expect(conds).toHaveCount(n0 + 1)
  await expect(conds.last()).toContainText('ROE')

  // Shift+Enter で 2 つ続けて足し、Esc（検索を消す）→ Esc（閉じる）
  await keys(page, 'Insert')
  await expect(fp).toBeVisible()
  await expect(fp.locator('.recent')).toContainText('ROE') // よく使う
  await page.keyboard.type('最低投資')
  await keys(page, 'Shift+Enter')
  await expect(conds).toHaveCount(n0 + 2)
  await expect(fp).toBeVisible()
  await keys(page, 'Escape')
  await expect(fp.locator('input')).toHaveValue('')
  await page.keyboard.type('ボラ')
  await keys(page, 'Shift+Enter', 'Escape', 'Escape')
  await expect(fp).toHaveCount(0)
  await expect(conds).toHaveCount(n0 + 3)
  await expect(conds.nth(n0 + 1)).toContainText('最低投資金額')
  await expect(conds.nth(n0 + 2)).toContainText('ボラティリティ')

  // 無い項目は理由を出す
  await keys(page, 'Insert')
  await page.keyboard.type('自己資本比率')
  await expect(fp.locator('.empty')).toBeVisible()
  await keys(page, 'Escape', 'Escape')
  await expect(fp).toHaveCount(0)
  await expect(conds).toHaveCount(n0 + 3)
  await app.close()
})

test('F で今の条件の指標を変える', async () => {
  const { app, page } = await launch()
  await ready(page)
  await keys(page, 'Control+Shift+Digit2')
  const scr = page.locator('[data-widget="screener"]')
  const first = scr.locator('.cond').first()
  const before = (await first.textContent()) ?? ''
  await keys(page, 'Tab', 'KeyF')
  const fp = page.locator('.dialog.picker')
  await expect(fp).toBeVisible()
  await page.keyboard.type('PBR')
  await keys(page, 'Enter')
  await expect(fp).toHaveCount(0)
  await expect(first).toContainText('PBR')
  expect(before).not.toContain('PBR')
  await app.close()
})
