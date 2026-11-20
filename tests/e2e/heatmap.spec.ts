// ヒートマップ（§6.3。FR-FV2）の今の振る舞い。株価ボード（FR-QB1〜QB8）を足しても変わらないことを確かめる（デグレの検知。docs/design-quote-board.md §7）。
// 値はスタブ（架空）
import { expect, focusPane, keys, test, watchlists } from './support'
import { col, freeTab, pane, row } from './support/layout'

const layout = freeTab(row(pane('heatmap', {}, 1), col(pane('chart', {}, 1))))
const FAVS = ['7203', '8058', '8306', '9434', '6501']

test.describe('ヒートマップの操作（§6.3, FR-FV2）', () => {
  test('P で騰落率の期間が変わり、Shift+P で戻る', async ({ start }) => {
    const { page } = await start({ layout })
    const heat = page.locator('[data-widget="heatmap"]')
    await expect(heat.locator('.map .cell').first()).toBeVisible()
    await focusPane(page, heat)
    const pressed = heat.locator('.seg button[aria-pressed="true"]')
    await expect(pressed).toHaveText('1日')
    await keys(page, 'p')
    await expect(pressed).toHaveText('1か月')
    await keys(page, 'p', 'p')
    await expect(pressed).toHaveText('1年')
    await keys(page, 'Shift+P')
    await expect(pressed).toHaveText('3か月')
  })

  test('Ctrl+Shift+F で★のみに絞り、もう一度で戻る', async ({ start }) => {
    const { page } = await start({ layout, user: { watchlists: watchlists({ favorites: FAVS }) } })
    const heat = page.locator('[data-widget="heatmap"]')
    await expect(heat.locator('.map .cell').first()).toBeVisible()
    await focusPane(page, heat)
    const all = await heat.locator('.map .cell').count()
    const star = heat.getByRole('button', { name: '★のみ表示' })
    await keys(page, 'Control+Shift+F')
    await expect(star).toHaveClass(/on/)
    await expect.poll(() => heat.locator('.map .cell').count()).toBeLessThan(all)
    await keys(page, 'Control+Shift+F')
    await expect(star).not.toHaveClass(/on/)
    await expect.poll(() => heat.locator('.map .cell').count()).toBe(all)
  })

  test('業種の中で矢印を押すと、同じリンク色のチャートの銘柄が変わる。Esc で業種へ戻る', async ({ start }) => {
    const { page } = await start({ layout })
    const heat = page.locator('[data-widget="heatmap"]')
    const chart = page.locator('[data-widget="chart"]').first()
    await expect(heat.locator('.map .cell').first()).toBeVisible()
    await focusPane(page, heat)
    const sectors = await heat.locator('.map .cell').count()
    await keys(page, 'Enter')
    await expect.poll(() => heat.locator('.map .cell').count()).not.toBe(sectors)
    // 業種の中で、銘柄の長方形を移るとチャートが追従する
    await keys(page, 'ArrowRight')
    const first = (await chart.locator('.sym .code').textContent())!
    await keys(page, 'ArrowLeft')
    await expect(chart.locator('.sym .code')).not.toHaveText(first)
    await keys(page, 'Escape')
    await expect.poll(() => heat.locator('.map .cell').count()).toBe(sectors)
  })
})
