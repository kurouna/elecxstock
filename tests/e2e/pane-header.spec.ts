// ペインの見出し（FR-V5）: 狭いペインでも閉じるボタンと銘柄コードが見え、隠れた操作は「⋯」から選べる
import { expect, type Locator, type Page, test } from '@playwright/test'
import { keys, launch } from './helpers'

async function ready(page: Page) {
  await expect(page.getByRole('dialog', { name: /elecxstock/ })).toBeVisible()
  await keys(page, 'Enter', 'Enter')
  await expect(page.locator('footer')).toContainText(/待機/, { timeout: 60_000 })
}
/** ✕ と銘柄コードがペインの中に収まって見えるか */
const fits = (pane: Locator) =>
  pane.evaluate((el) => {
    const p = el.getBoundingClientRect()
    const close = el.querySelector('.ph .tools button:last-child')?.getBoundingClientRect()
    const code = el.querySelector('.ph .sym .code') as HTMLElement | null
    const sym = el.querySelector('.ph .sym')?.getBoundingClientRect()
    return {
      close: !!close && close.width > 0 && close.right <= p.right + 0.5,
      code: !!code && !!sym && sym.width >= code.offsetWidth && code.getBoundingClientRect().right <= sym.right + 0.5,
    }
  })

test('狭いチャートのペイン: ✕ と銘柄が見え、隠れた期間・時間軸は ⋯ とチップで変えられる', async () => {
  const { app, page } = await launch()
  await ready(page)
  await page.setViewportSize({ width: 1000, height: 900 })
  // トリプル（チャートを 3 つ横に並べる。1 つが約 250px）
  await keys(page, 'Control+Shift+Digit5')
  const charts = page.locator('[data-widget="chart"]')
  await expect(charts.first()).toBeVisible()
  const widths: number[] = []
  for (const c of await charts.all()) {
    expect(await fits(c)).toEqual({ close: true, code: true })
    widths.push((await c.boundingBox())?.width ?? 0)
  }
  // いちばん狭いチャートで確かめる
  const first = charts.nth(widths.indexOf(Math.min(...widths)))
  expect(Math.min(...widths)).toBeLessThan(300)
  // 時間軸は 1 つのチップ（押すと D → W → M → D）
  await expect(first.locator('.ph .seg')).toBeHidden()
  const tf = (await first.locator('.ph .tfc').textContent())?.trim() as 'D' | 'W' | 'M'
  await first.locator('.ph .tfc').click()
  await expect(first.locator('.ph .tfc')).toHaveText({ D: 'W', W: 'M', M: 'D' }[tf])
  // 表示期間は ⋯ から
  await expect(first.locator('.ph .period')).toBeHidden()
  await first.getByRole('button', { name: 'その他の操作' }).click()
  const dlg = page.locator('.dialog')
  await expect(dlg).toContainText('右に分割')
  await dlg.getByText('表示期間', { exact: true }).click()
  await dlg.getByText('1年', { exact: true }).click()
  await first.getByRole('button', { name: 'その他の操作' }).click()
  await expect(dlg.locator('li, button, [role="option"]').filter({ hasText: '表示期間' }).first()).toContainText('1年')
  await keys(page, 'Escape')
  // ⋯ からペインの操作も選べる（最大化）。広くなると従来どおり期間・D/W/M・操作ボタンが並ぶ
  await first.getByRole('button', { name: 'その他の操作' }).click()
  await dlg.getByText('ペインを最大化 / 戻す', { exact: true }).click()
  const wide = page.locator('.pane.maxed')
  await expect.poll(async () => (await wide.boundingBox())?.width ?? 0).toBeGreaterThan(820)
  await expect(wide.locator('.ph .period')).toBeVisible()
  await expect(wide.locator('.ph .seg')).toBeVisible()
  await expect(wide.getByRole('button', { name: 'その他の操作' })).toBeHidden()
  await expect(wide.getByRole('button', { name: 'ペインを閉じる' })).toBeVisible()
  expect(await fits(wide)).toEqual({ close: true, code: true })
  await app.close()
})
