// 目標利回りの線（FR-C12）: 設定の「チャート」で ON にして目標の % を打つと、チャートとグリッドのタイルに、その利回りになる株価の点線を引く。
// 値はスタブの架空の値。キャンバスの線は読めないので、チャートは凡例の値、タイルは描いた線のラベル（canvas の data-yield）で確かめる
import { expect, jump, keys, rpc, tab, test } from './support'

type Settings = { yieldLine: boolean; yieldTargets: number[] }
const metricOf = async (page: Parameters<typeof rpc>[0], id: string) =>
  ((await rpc<{ id: string; div12: number | null; close: number | null }[]>(page, 'metrics.get', { ids: [id] })) ?? [])[0]!

test.describe('目標利回りの線（FR-C12）', () => {
  test('設定の「チャート」で ON にして目標を打つと、チャートの凡例に目標の株価が出る。OFF なら出ない', async ({ start }) => {
    const { page } = await start()
    const chart = page.locator('[data-widget="chart"]').first()
    await keys(page, 'Alt+ArrowRight', 'Alt+ArrowUp')
    await expect(chart).toHaveClass(/focused/)
    await jump(page, '8951')
    await expect(chart.locator('.legend')).toBeVisible()
    // 既定は OFF
    await expect(chart.locator('.legend .yl')).toHaveCount(0)

    // 設定（Ctrl+,）→ ↓↓ で「チャート」→ Tab で中へ。Space で ON、目標は 3 つまで打てる
    await keys(page, 'Control+Comma')
    const dlg = page.getByRole('dialog', { name: '設定' })
    await keys(page, 'ArrowDown', 'ArrowDown')
    await expect(dlg.getByRole('tab', { name: 'チャート' })).toHaveAttribute('aria-selected', 'true')
    await keys(page, 'Tab')
    await expect(dlg.getByRole('button', { name: '目標利回りの線' })).toBeFocused()
    await keys(page, 'Space')
    await expect(dlg.getByRole('button', { name: '目標利回りの線' })).toHaveAttribute('aria-pressed', 'true')
    const inputs = dlg.getByRole('textbox', { name: /^目標利回り \d$/ })
    await expect(inputs).toHaveCount(3)
    await expect(inputs.first()).toHaveValue('4')
    await keys(page, 'Tab', 'Control+a')
    await page.keyboard.type('５．５')
    await keys(page, 'Tab')
    await page.keyboard.type('4%')
    await keys(page, 'Tab')
    // 読めない値は保存しない（前の値のまま）
    await page.keyboard.type('abc')
    await keys(page, 'Enter')
    await expect.poll(async () => (await rpc<{ settings: Settings }>(page, 'user.load')).settings.yieldTargets).toEqual([4, 5.5])
    await expect(inputs.nth(2)).toHaveValue('')
    await keys(page, 'Escape')
    await expect(dlg).toHaveCount(0)

    // 凡例: 利回りの低い順（株価の高い順）に、目標の利回り・株価・今の株価からの差
    const m = await metricOf(page, 'JP:8951')
    expect(m.div12).toBeGreaterThan(0)
    const yl = chart.locator('.legend .yl')
    await expect(yl).toHaveCount(2)
    await expect(yl.nth(0)).toContainText('目標 4%')
    await expect(yl.nth(0)).toContainText(Math.round(m.div12! / 0.04).toLocaleString('ja-JP'))
    await expect(yl.nth(1)).toContainText('目標 5.5%')
    await expect(yl.nth(1)).toContainText(Math.round(m.div12! / 0.055).toLocaleString('ja-JP'))

    // OFF に戻すと消える
    await keys(page, 'Control+Comma', 'ArrowDown', 'ArrowDown', 'Tab', 'Space', 'Escape')
    await expect(yl).toHaveCount(0)
  })

  test('チャートは設定の画面の上限（3 つ）より多い目標も全部引く。グリッドのタイルは目盛りの範囲に入る線だけを描く', async ({ start }) => {
    const targets = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const { page } = await start({ settings: { yieldLine: true, yieldTargets: targets } })
    const chart = page.locator('[data-widget="chart"]').first()
    await keys(page, 'Alt+ArrowRight', 'Alt+ArrowUp')
    await jump(page, '8951')
    await expect(chart.locator('.legend .yl')).toHaveCount(targets.length)

    await tab(page, 'grid')
    const grid = page.locator('[data-widget="grid"]')
    await expect(grid.locator('canvas[data-id]').first()).toBeVisible()
    // 配当のある銘柄のどれかのタイルに、範囲に入った線が描かれる。描いたラベルは目標のどれか
    await expect.poll(() => grid.locator('canvas[data-yield]:not([data-yield=""])').count()).toBeGreaterThan(0)
    const drawn = await grid.locator('canvas[data-yield]:not([data-yield=""])').first().getAttribute('data-yield')
    for (const l of drawn!.split(' ')) expect(targets.map((p) => `${p}%`)).toContain(l)
  })

  test('OFF のときは、グリッドのタイルにも描かない', async ({ start }) => {
    const { page } = await start({ settings: { yieldLine: false, yieldTargets: [1, 2, 3, 4, 5] } })
    await tab(page, 'grid')
    const grid = page.locator('[data-widget="grid"]')
    await expect(grid.locator('canvas[data-id]').first()).toBeVisible()
    await expect(grid.locator('canvas[data-yield]:not([data-yield=""])')).toHaveCount(0)
  })
})
