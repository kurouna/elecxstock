// チャート（FR-C1〜C6, FR-V13, FR-V14, FR-DR7）: 表示期間・指標のメニュー・ツールチップ・C キーでの銘柄の差し替え・一覧からのドラッグ
import type { Locator } from '@playwright/test'
import { expect, keys, replaceSymbol, tab, test, watchlists } from './support'

/** ツールチップは「説明 (キー)」の形 */
const tip = async (l: Locator, text: RegExp) => {
  await expect(l).toHaveAttribute('title', text)
  expect(await l.getAttribute('title')).toMatch(/\S \(.+\)$/)
}

test.describe('表示期間（FR-C1, FR-G3）', () => {
  test('チャートの見出しの期間を選ぶ・Alt+1〜6', async ({ start }) => {
    const { page } = await start()
    // ウォッチリストから右の列の下のチャートへ移り、上の広い日足のチャートへ
    const chart = page.locator('[data-widget="chart"]').first()
    await keys(page, 'Alt+ArrowRight', 'Alt+ArrowUp')
    await expect(chart).toHaveClass(/focused/)
    const per = chart.locator('select.period')
    await expect(per).toBeVisible()
    await keys(page, 'Alt+Digit1')
    await expect(per).toHaveValue('0')
    await per.selectOption({ label: '1年' })
    await expect(per).toHaveValue('2')
  })

  test('表示期間はグリッドとチャートで同じ形（選択・Alt+1〜6 のツールチップ）', async ({ start }) => {
    const { page } = await start()
    await tab(page, 'grid')
    const grid = page.locator('[data-widget="grid"]')
    const gp = grid.locator('select.period')
    await expect(gp).toHaveAttribute('title', /表示期間.*Alt\+1/)
    await expect(grid.getByRole('button', { name: '3か月' })).toHaveCount(0)
    await keys(page, 'Alt+Digit5')
    await expect(gp).toHaveValue('4')
    await tab(page, 'mtf')
    const cp = page.locator('[data-widget="chart"]').first().locator('select.period')
    await expect(cp).toHaveAttribute('title', /表示期間.*Alt\+1/)
  })
})

test.describe('指標とツールチップ（FR-C6, FR-V13, FR-V14）', () => {
  test('I の指標メニューから RSI を足すと下に段が増える', async ({ start }) => {
    const { page } = await start()
    await tab(page, 'triple')
    await keys(page, 'Alt+ArrowRight') // 左の列のウォッチリストから右の日足のチャートへ
    await expect(page.locator('.pane.focused')).toHaveAttribute('data-widget', 'chart')
    await keys(page, 'i', 'Enter')
    await expect(page.locator('.dialog')).toContainText('RSI')
    await keys(page, 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'Space', 'Enter')
    await expect(page.locator('[data-widget="chart"]').first()).toContainText('RSI14')
  })

  test('★・指標・時間軸のツールチップに説明とキーを付ける', async ({ start }) => {
    const { page } = await start()
    const chart = page.locator('[data-widget="chart"]').first()
    await tip(chart.locator('.star'), /お気に入り.* \(Ctrl\+D\)/)
    await tip(chart.getByRole('button', { name: '指標' }), /指標.* \(I\)/)
    await tip(chart.getByRole('button', { name: 'D', exact: true }), /日足 \(D\)/)
  })
})

test.describe('表示する銘柄を変える（FR-L11, FR-DR7）', () => {
  test('C キー: MTF のウォッチリストからも、表示する銘柄を変えられる', async ({ start }) => {
    const { page } = await start()
    await expect(page.locator('.pane.focused')).toHaveAttribute('data-widget', 'watchlist')
    await keys(page, 'c')
    await replaceSymbol(page, '8058')
    await expect(page.locator('[data-widget="chart"]').first()).toContainText('8058')
  })

  test('ウォッチリストの行を日足のチャートに落とすと、リンク色の同じチャートがその銘柄になる', async ({ start }) => {
    const { page } = await start({ user: { watchlists: watchlists({ favorites: ['7203', '8001'] }) } })
    const src = page.locator('[data-pane-id]').first().locator('tbody tr[draggable="true"]', { hasText: '8001' })
    const chart = page.locator('[data-widget="chart"]').first()
    const a = (await src.boundingBox())!
    const b = (await chart.boundingBox())!
    await page.mouse.move(a.x + 40, a.y + a.height / 2)
    await page.mouse.down()
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 })
    await expect(chart).toHaveAttribute('data-drop', 'on')
    await page.mouse.up()
    await expect(chart.locator('.ph')).toContainText('8001')
  })
})
