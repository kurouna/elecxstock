// 状態の変化への追従（docs/test-plan.md §8.1）のうち、窓をまたぐ行: 別の窓での★ → 1 枚目、1 枚目での保有の変更 → フリー N。
// フリー N は起動と同時に開く（前回開いていた窓として userData に書いておく）。OS の窓に頼るので直列の project で回す
import type { ElectronApplication, Locator, Page } from '@playwright/test'
import { expect, focusPane, freeTab, holdings, keys, pane, row, TEST_NOW, test, type, watchlists } from './support'

const NOW_MS = Date.parse(TEST_NOW)
const SCREENS = [
  {
    id: 'fav',
    name: { ja: '★の銘柄', en: 'fav' },
    conditions: [{ field: 'user.favorite', op: '=', value: true }],
    created: NOW_MS,
    updated: NOW_MS,
  },
  {
    id: 'held',
    name: { ja: '保有している', en: 'held' },
    conditions: [{ field: 'user.held', op: '=', value: true }],
    created: NOW_MS,
    updated: NOW_MS,
  },
]
const rows = (l: Locator) => l.locator('tbody tr')

async function freeWindow(app: ElectronApplication): Promise<Page> {
  await expect.poll(() => app.windows().length, { timeout: 20_000 }).toBe(2)
  const w = app.windows().find((x) => x.url().includes('w=free2'))!
  await expect(w.locator('.main [data-pane-id]').first()).toBeVisible({ timeout: 20_000 })
  return w
}

test.describe('状態の変化への追従: 窓をまたぐ（§8.1, FR-L7, FR-FV5）', () => {
  // フリー 2 のチャート（8058）で★ → 1 枚目のウォッチリスト・スクリーナー
  const opts = {
    layout: freeTab(row(pane('watchlist', { list: 'favorites' }, 3), pane('screener', { screenId: 'fav' }, 4))),
    freeWindows: { free2: pane('chart', { tf: 'D', sym: 'JP:8058' }, 0) },
    user: { screens: SCREENS, watchlists: watchlists({ favorites: ['7203'] }) },
  }

  test('別の窓での★: 1 枚目のウォッチリストに入る', async ({ start }) => {
    const { app, page } = await start(opts)
    const free = await freeWindow(app)
    const wl = page.locator('[data-widget="watchlist"]')
    await expect(rows(wl)).toHaveCount(1)
    await expect(free.locator('.pane.focused')).toHaveCount(1)
    await keys(free, 'Control+d')
    await expect(free.locator('.toasts')).toContainText('お気に入りに')
    await expect(rows(wl)).toHaveCount(2)
    await expect(wl.locator('tbody')).toContainText('8058')
  })

  // 回帰（2026-11-15 に E2E で見つけて直した不具合）
  test('別の窓での★: 1 枚目のスクリーナーの結果が追従する', async ({ start }) => {
    const { app, page } = await start(opts)
    const free = await freeWindow(app)
    const scr = page.locator('[data-widget="screener"]')
    await expect(rows(scr)).toHaveCount(1)
    await expect(free.locator('.pane.focused')).toHaveCount(1)
    await keys(free, 'Control+d')
    await expect(free.locator('.toasts')).toContainText('お気に入りに')
    await expect(rows(page.locator('[data-widget="watchlist"]'))).toHaveCount(2)
    await expect(rows(scr)).toHaveCount(2)
  })

  test('1 枚目で保有を足すと、フリー N のグリッド（保有のスクリーン）と銘柄情報の保有の帯が追従する', async ({ start }) => {
    const { app, page } = await start({
      layout: freeTab(row(pane('portfolio', {}, 2), pane('chart', {}, 2))),
      freeWindows: { free2: row(pane('grid', { src: 'scr:held' }, 0), pane('info', { sym: 'JP:8058' }, 0)) },
      user: { screens: SCREENS, holdings: holdings([{ code: '7203', quantity: 100, avgCost: 2500 }]) },
    })
    const free = await freeWindow(app)
    const grid = free.locator('[data-widget="grid"]')
    const info = free.locator('[data-widget="info"]')
    await expect(grid.locator('.tile')).toHaveCount(1)
    await expect(info).toContainText('8058')
    await expect(info.locator('.heldbar')).toHaveCount(0)
    // 1 枚目で 8058 を足す
    await focusPane(page, page.locator('[data-widget="portfolio"]'))
    await keys(page, 'Insert')
    const form = page.locator('.dialog.holding')
    await expect(form.locator('input[name="code"]')).toBeFocused()
    await type(page, '8058')
    await expect(form).toContainText('三菱商事')
    await keys(page, 'Tab', 'Tab')
    await type(page, '100')
    await keys(page, 'Tab')
    await type(page, '3000')
    await keys(page, 'Enter')
    await expect(form).toHaveCount(0)
    await expect(grid.locator('.tile')).toHaveCount(2)
    await expect(info.locator('.heldbar')).toContainText('100')
  })
})
