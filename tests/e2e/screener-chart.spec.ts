// スクリーナーの条件（保有・並べ替え・指標の変更・記号の位置）、チャートの期間、F5 の知らせ、保有の候補、★の色
import { expect, type Page, test } from '@playwright/test'
import { keys, launch } from './helpers'

async function ready(page: Page) {
  await expect(page.getByRole('dialog', { name: /elecxstock/ })).toBeVisible()
  await keys(page, 'Enter', 'Enter')
  await expect(page.locator('footer')).toContainText(/待機/, { timeout: 60_000 })
}
async function hold(page: Page) {
  await page.evaluate(async () => {
    const meta = { broker: 'rakuten', importedAt: '2026-11-14T00:00:00Z', realized: null, dividends: null }
    await (window as unknown as { elecxstock: { call: (m: string, p: unknown) => Promise<unknown> } }).elecxstock.call(
      'portfolio.applyCsv',
      {
        holdings: [{ code: '7203', account: 'tokutei', quantity: 100, avgCost: 2500 }],
        meta,
      },
    )
  })
  await keys(page, 'Control+Shift+Digit7') // 保有タブを開くと読み込む
}

test('スクリーナー: ウォッチリストは置かず、保有の条件・並べ替え・クリックで指標を変える', async () => {
  const { app, page } = await launch()
  await ready(page)
  await hold(page)
  await keys(page, 'Control+Shift+Digit2')
  await expect(page.locator('[data-widget="watchlist"]')).toHaveCount(0)
  const scr = page.locator('[data-widget="screener"]')
  const conds = scr.locator('.cond')
  await expect(conds).toHaveCount(3)
  const first = await conds.nth(0).locator('.f').textContent()
  // ↓ で 1 番目を下へ、↑ で戻す
  await conds.nth(0).getByRole('button', { name: '下へ' }).click()
  await expect(conds.nth(1).locator('.f')).toHaveText(first!)
  await conds.nth(1).getByRole('button', { name: '上へ' }).click()
  await expect(conds.nth(0).locator('.f')).toHaveText(first!)
  // 比較の記号は真ん中
  expect(
    await conds
      .nth(0)
      .locator('.op')
      .evaluate((el) => getComputedStyle(el).justifyContent),
  ).toBe('center')
  // 指標をクリックすると選び直せる。保有の記録があるので「保有」を選べる
  await conds.nth(2).locator('.f').click()
  const dlg = page.locator('.dialog')
  await expect(dlg).toContainText('保有')
  await dlg.getByText('保有', { exact: true }).click()
  await expect(conds.nth(2).locator('.f')).toHaveText('保有')
  await app.close()
})

test('チャートの期間・F5 の知らせ・保有の候補・ライトテーマの★', async () => {
  const { app, page } = await launch()
  await ready(page)
  // F5: 取得が終わった直後は「最新」と知らせる（何も起きないように見えない）
  await keys(page, 'F5')
  await expect(page.locator('.toasts')).toContainText(/最新|更新中|更新を始めました/)

  // MTF のチャート: 見出しの期間を選ぶ・Alt+1〜6
  await keys(page, 'Control+Shift+Digit4')
  const chart = page.locator('[data-widget="chart"]').first()
  const per = chart.locator('select.per')
  await expect(per).toBeVisible()
  await chart.click({ position: { x: 300, y: 200 } })
  await keys(page, 'Alt+Digit1')
  await expect(per).toHaveValue('0')
  await per.selectOption({ label: '1年' })
  await expect(per).toHaveValue('2')

  // 保有を足す: コードの一部で候補が出て、↓ と Enter で選べる
  await keys(page, 'Control+Shift+Digit7', 'Insert')
  const form = page.locator('.dialog.holding')
  await page.keyboard.type('80')
  await expect(form.locator('.cands li').first()).toBeVisible()
  await keys(page, 'Enter')
  await expect(form.locator('input[name="code"]')).toHaveValue(/^80/)
  expect(await form.locator('input[name="qty"]').evaluate((el) => getComputedStyle(el).textAlign)).toBe('right')
  expect(await form.locator('input[name="code"]').evaluate((el) => getComputedStyle(el).textAlign)).toBe('center')
  await keys(page, 'Escape')

  // ライトテーマ: ★の入っている・いないの色がはっきり違う
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
  const colors = await page.evaluate(() => {
    const s = getComputedStyle(document.documentElement)
    return [s.getPropertyValue('--star-off').trim(), s.getPropertyValue('--star-on').trim()]
  })
  expect(colors[0]).not.toBe(colors[1])
  await app.close()
})
