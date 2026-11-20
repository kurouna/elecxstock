// チャートグリッド（FR-G1〜G11）: ページ送り・格子の細かさ・タイルの差し替え・拡大・★だけ表示・ツールバー・一覧からのドラッグ
import type { Locator } from '@playwright/test'
import { expect, keys, recordToasts, replaceSymbol, tab, test, toastsSeen } from './support'

/** アイコンのボタン: 見える文字は無く（または記号だけ）、名前とツールチップを持つ（FR-V13） */
async function iconButton(scope: Locator, name: string, tipText: RegExp) {
  const b = scope.getByRole('button', { name, exact: true })
  await expect(b).toBeVisible()
  await expect(b).toHaveAttribute('title', tipText)
  expect(((await b.textContent()) ?? '').replace(/[\s\d]/g, '').length).toBeLessThanOrEqual(1)
}

test.describe('格子とページ（FR-G2, FR-G9）', () => {
  test('‹ › と矢印でページをめくる', async ({ start }) => {
    const { page } = await start()
    await tab(page, 'grid')
    const grid = page.locator('[data-widget="grid"]')
    const label = grid.getByText(/^ページ \d+\/\d+$/)
    // いちばん小さい格子（2×2）にしてページを増やす
    await keys(page, 'Minus', 'Minus', 'Minus', 'Minus', 'Minus', 'Minus')
    await expect(grid.locator('.bar .num').filter({ hasText: '×' }).first()).toHaveText('2×2')
    await expect(label).toHaveText(/^ページ 1\/[2-9]\d*$/)
    const prev = grid.getByRole('button', { name: '前のページ' })
    const next = grid.getByRole('button', { name: '次のページ' })
    await expect(prev).toBeDisabled()

    // 最後のタイルで → は次のページの先頭、先頭で ← は前のページの最後
    const tiles = grid.locator('.tile')
    await keys(page, 'End', 'ArrowRight')
    await expect(label).toHaveText(/^ページ 2\//)
    await expect(tiles.first()).toHaveClass(/sel/)
    await keys(page, 'ArrowLeft')
    await expect(label).toHaveText(/^ページ 1\//)
    await expect(tiles.last()).toHaveClass(/sel/)
    // 最下段で ↓ は次のページ、最上段で ↑ は前のページ
    await keys(page, 'Home', 'ArrowDown', 'ArrowDown')
    await expect(label).toHaveText(/^ページ 2\//)
    await keys(page, 'ArrowUp')
    await expect(label).toHaveText(/^ページ 1\//)

    // ツールバーのボタン
    await next.click()
    await expect(label).toHaveText(/^ページ 2\//)
    await prev.click()
    await expect(label).toHaveText(/^ページ 1\//)
    await expect(prev).toBeDisabled()
  })

  test('− / ＋: − は粗く（枚数が減る）、＋ は細かく（枚数が増える）', async ({ start }) => {
    const { page } = await start()
    await tab(page, 'grid')
    const grid = page.locator('[data-widget="grid"]')
    const dims = grid.locator('.bar .num').filter({ hasText: '×' }).first()
    const n = async () => {
      const [c, r] = ((await dims.textContent()) ?? '').split('×').map(Number)
      return c! * r!
    }
    const n0 = await n()
    const finer = grid.getByRole('button', { name: '格子を細かく' })
    await expect(finer).toHaveText('＋')
    await expect(finer).toHaveAttribute('title', /\(\+\)/)
    await finer.click()
    await expect.poll(n).toBeGreaterThan(n0)
    const coarser = grid.getByRole('button', { name: '格子を粗く' })
    await expect(coarser).toHaveText('−')
    await coarser.click()
    await expect.poll(n).toBe(n0)
  })
})

test.describe('タイルの操作（FR-G7, FR-G10）', () => {
  test('C で選んだタイルの銘柄を差し替えると、このグリッドの銘柄に固定される', async ({ start }) => {
    const { page } = await start()
    await tab(page, 'grid')
    const grid = page.locator('[data-widget="grid"]')
    await expect(grid.locator('.tile').first()).toBeVisible()
    await recordToasts(page)
    await keys(page, 'c')
    await replaceSymbol(page, '8058')
    await expect.poll(() => toastsSeen(page)).toContain('差し替えました')
    await expect(page.locator('.bar select.srcsel')).toHaveValue('own')
    await expect(grid.locator('.tile').first()).toContainText('8058')
  })

  test('タイルをダブルクリックで拡大し、「グリッドに戻る」で戻る', async ({ start }) => {
    const { page } = await start()
    await tab(page, 'grid')
    await page.locator('.tile').first().dblclick()
    await expect(page.locator('.tile')).toHaveCount(1)
    await page.getByRole('button', { name: /グリッドに戻る/ }).click()
    await expect(page.locator('.tile').nth(1)).toBeVisible()
  })

  test('ドロワーのスクリーナーの行をタイルにドラッグすると、ドロワーが畳まれてタイルが差し替わる（FR-DR7）', async ({ start }) => {
    const { page } = await start()
    await tab(page, 'grid')
    await keys(page, 'Control+b')
    const rowsIn = page.locator('.dock .slot:not([hidden]) tbody tr[draggable="true"]')
    await expect(rowsIn.first()).toBeVisible()
    // 落とす行は、3 枚目のタイルとは別の銘柄にする。グリッドにもう出ている銘柄なら、同じ銘柄は 1 つだけ残すのでタイルが 1 枚減る（replaceInOwn）
    const shown = (await page.locator('.tile .h').allTextContents()).map((t) => t.match(/^[0-9A-Z]{4,5}/)?.[0] ?? '')
    const codes = (await rowsIn.locator('td.code').allTextContents()).map((t) => t.trim())
    const at = codes.findIndex((c) => c && c !== shown[2])
    expect(at).toBeGreaterThanOrEqual(0)
    const row = rowsIn.nth(at)
    const code = codes[at]!
    const tile = page.locator('.tile').nth(2)
    const tiles = (await page.locator('.tile').count()) - (shown.includes(code) ? 1 : 0)
    await row.dragTo(tile)
    await expect(page.locator('.dock')).not.toHaveClass(/open/)
    await expect(page.locator('.tile').nth(2).locator('.h')).toContainText(code)
    // 対象がスクリーナーから「このグリッドの銘柄」に固定されても、ほかのタイルは残る（落とした 1 枚だけにならない）
    await expect(page.locator('.tile')).toHaveCount(tiles)
  })
})

test.describe('ツールバー（FR-V13, FR-FV2）', () => {
  test('★だけ表示は Ctrl+Shift+F でも切り替わり、ツールバーはアイコンのボタン', async ({ start }) => {
    const { page } = await start()
    await tab(page, 'grid')
    const grid = page.locator('[data-widget="grid"]')
    const fav = grid.getByRole('button', { name: '★のみ表示' })
    await expect(fav).toHaveAttribute('title', /Ctrl\+Shift\+F\)$/)
    await keys(page, 'Control+Shift+f')
    await expect(fav).toHaveClass(/on/)
    await expect(grid.locator('select.srcsel')).toHaveAttribute('title', /対象 \(G \/ Shift\+G\)$/)
    await iconButton(grid, '今の銘柄で固定', /P/)
    await iconButton(grid, '売買候補をリストに追加', /Ctrl\+Shift\+A/)
  })
})
