// 同じ考えの操作は、どのペインでも同じ形・同じ言葉・同じツールチップ（「説明 (キー)」）にそろえる（FR-V13）
import { expect, type Locator, test } from '@playwright/test'
import { keys, launch } from './helpers'

/** ツールチップは「説明 (キー)」の形 */
const tip = async (l: Locator, text: RegExp) => {
  await expect(l).toHaveAttribute('title', text)
  expect(await l.getAttribute('title')).toMatch(/\S \(.+\)$/)
}

test('ツールチップ・★だけ表示・騰落率の期間の表示をペインをまたいでそろえる', async () => {
  const { app, page } = await launch()
  await expect(page.getByRole('dialog', { name: /elecxstock/ })).toBeVisible()
  await keys(page, 'Enter', 'Enter')
  await expect(page.locator('footer')).toContainText(/待機/, { timeout: 60_000 })

  // マーケット: ヒートマップの期間は「騰落率」の期間だと分かるようにする。★だけ表示はどのペインも同じ名前とキー
  await keys(page, 'Control+Shift+Digit1')
  const heat = page.locator('[data-widget="heatmap"]')
  await expect(heat.locator('.lbl')).toContainText('騰落率')
  await tip(heat.getByRole('button', { name: '1か月' }), /騰落率の期間 \(P\)/)
  await tip(heat.getByRole('button', { name: '★のみ表示' }), /★のみ表示 \(Ctrl\+Shift\+F\)/)
  await tip(page.locator('[data-widget="ranking"]').getByRole('button', { name: '★のみ表示' }), /Ctrl\+Shift\+F/)

  // チャート: ★・指標・並べ方のツールチップに説明を付ける
  await keys(page, 'Control+Shift+Digit4')
  const chart = page.locator('[data-widget="chart"]').first()
  await tip(chart.locator('.star'), /お気に入り.* \(Ctrl\+D\)/)
  await tip(chart.getByRole('button', { name: '指標' }), /指標.* \(I\)/)

  // グリッド: ★だけ表示は Ctrl+Shift+F でも切り替わる（ほかのペインと同じキー）
  await keys(page, 'Control+Shift+Digit3')
  const grid = page.locator('[data-widget="grid"]')
  const fav = grid.getByRole('button', { name: '★のみ表示' })
  await tip(fav, /Ctrl\+Shift\+F/)
  await keys(page, 'Control+Shift+f')
  await expect(fav).toHaveClass(/on/)
  await tip(grid.locator('select.srcsel'), /対象 \(G \/ Shift\+G\)/)
  await app.close()
})

test('時間軸のツールチップ・銘柄情報の銘柄名・スクリーナーの 0 件', async () => {
  const { app, page } = await launch()
  await expect(page.getByRole('dialog', { name: /elecxstock/ })).toBeVisible()
  await keys(page, 'Enter', 'Enter')
  await expect(page.locator('footer')).toContainText(/待機/, { timeout: 60_000 })
  await keys(page, 'Control+Shift+Digit2')
  const chart = page.locator('[data-widget="chart"]').first()
  await tip(chart.getByRole('button', { name: 'D', exact: true }), /日足 \(D\)/)
  // 銘柄情報の銘柄名もチャートと同じく押して変えられる（C）
  const info = page.locator('[data-widget="info"]')
  await info.locator('button.sym').click()
  await expect(page.locator('.dialog.palette')).toContainText('の代わりに表示する銘柄')
  await keys(page, 'Escape')
  // 条件に合う銘柄が無いときは、そう表示する
  const scr = page.locator('[data-widget="screener"]')
  await scr.locator('.cond').first().locator('.v').click()
  await page.keyboard.press('Control+a')
  await page.keyboard.type('99')
  await keys(page, 'Enter')
  await expect(scr.locator('.state')).toContainText('条件に合う銘柄はありません')
  await app.close()
})
