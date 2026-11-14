// マーケット（ヒートマップ・ランキング）と配当カレンダー（§6.4 のプリセット、FR-V13）。値はスタブ（架空）
import type { Locator } from '@playwright/test'
import { expect, keys, tab, test, watchlists } from './support'

const tip = async (l: Locator, text: RegExp) => {
  await expect(l).toHaveAttribute('title', text)
  expect(await l.getAttribute('title')).toMatch(/\S \(.+\)$/)
}

test.describe('マーケット（FR-L5, FR-V13）', () => {
  test('ヒートマップ（33 業種）の中へ Enter で入り Esc で戻る。期間は「騰落率」の期間と分かる', async ({ start }) => {
    const { page } = await start()
    await tab(page, 'market')
    const heat = page.locator('[data-widget="heatmap"]')
    await expect(heat.locator('.map .cell').first()).toBeVisible()
    await expect(heat.locator('.lbl')).toContainText('騰落率')
    await tip(heat.getByRole('button', { name: '1か月' }), /騰落率の期間 \(P\)/)
    // ★だけ表示はどのペインも同じ名前とキー
    await tip(heat.getByRole('button', { name: '★のみ表示' }), /★のみ表示 \(Ctrl\+Shift\+F\)/)
    await tip(page.locator('[data-widget="ranking"]').getByRole('button', { name: '★のみ表示' }), /Ctrl\+Shift\+F/)
    // 業種の中へ（Enter）→ 戻る（Esc）。左の列のウォッチリストから右のヒートマップへ
    await keys(page, 'Alt+ArrowRight')
    await expect(page.locator('.pane.focused')).toHaveAttribute('data-widget', 'heatmap')
    const sectors = await heat.locator('.map .cell').count()
    await keys(page, 'ArrowRight', 'Enter')
    await expect.poll(() => heat.locator('.map .cell').count()).not.toBe(sectors)
    await expect(heat.locator('.map .cell').first()).toBeVisible()
    await keys(page, 'Escape')
    await expect.poll(() => heat.locator('.map .cell').count()).toBe(sectors)
  })
})

test.describe('配当カレンダー（§6.4 インカム）', () => {
  test('9 銘柄以上の月も全部を選べる', async ({ start }) => {
    // お気に入りに 10 銘柄を入れておく（カレンダーはすべてのウォッチリストの銘柄を並べる。権利月はスタブの架空の値）
    const codes = ['7203', '8058', '8306', '9434', '8053', '8766', '5401', '6501', '7974', '4063']
    const { page } = await start({
      user: { watchlists: watchlists({ favorites: codes }) },
    })
    await tab(page, 'income')
    const cal = page.locator('[data-widget="divcal"]')
    await expect(cal).toBeVisible()
    await expect.poll(async () => Math.max(...(await cal.locator('.m h5 .num').allTextContents()).map(Number))).toBeGreaterThan(8)
    const counts = await cal.locator('.m h5 .num').allTextContents()
    const mi = counts.findIndex((c) => Number(c) > 8)
    const month = cal.locator('.m').nth(mi)
    await expect(month.locator('.row')).toHaveCount(Number(counts[mi]))
  })
})
