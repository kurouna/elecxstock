// ウォッチリスト・お気に入り（FR-W1〜W10, FR-FV1〜FV5）: 銘柄ジャンプからの★と追加・保有のタブ・ツールバー・★の色
import type { Locator } from '@playwright/test'
import { expect, holdings, jump, keys, tab, test, typeJump } from './support'

async function iconButton(scope: Locator, name: string, tipText: RegExp) {
  const b = scope.getByRole('button', { name, exact: true })
  await expect(b).toBeVisible()
  await expect(b).toHaveAttribute('title', tipText)
  expect(((await b.textContent()) ?? '').replace(/[\s\d]/g, '').length).toBeLessThanOrEqual(1)
}

test.describe('銘柄ジャンプから入れる（FR-W4, FR-FV1）', () => {
  test('ジャンプの ☆（Ctrl+D）は閉じずに次のコードを待ち、ジャンプ後の Ctrl+D は表示中の銘柄を入れる', async ({ start }) => {
    const { page } = await start()
    await tab(page, 'triple') // 左の列にウォッチリストとスクリーナーを置くタブ（MTF の左はスクリーナー 2 つ）
    // トリプル: ウォッチリスト（お気に入り）にフォーカス。ジャンプ → Ctrl+D でお気に入りに入れる（コマンドバーは開いたまま）
    await expect(page.locator('.pane.focused')).toHaveAttribute('data-widget', 'watchlist')
    await typeJump(page, '7203', 'トヨタ')
    const pal = page.locator('.dialog.jump')
    await keys(page, 'Control+d')
    // ☆ のあとはコードが空になり、閉じずに次のコードを待つ
    await expect(pal).toContainText('続けて次のコード')
    await typeJump(page, '7203')
    await expect(pal.getByRole('button', { name: 'お気に入りから外す' }).first()).toBeVisible()
    await keys(page, 'Enter')
    await expect(pal).toHaveCount(0)
    // 別の銘柄にジャンプしてから Ctrl+D: 前の行（7203）を外さずに、表示中の銘柄を入れる
    await jump(page, '8001', '伊藤忠')
    await keys(page, 'Control+d')
    await expect(page.locator('.toasts')).toContainText('伊藤忠')
    const wl = page.locator('[data-pane-id]').first()
    await expect(wl).toContainText('7203')
    await expect(wl).toContainText('8001')
  })

  test('高配当のリストにフォーカスして Ctrl+Enter でそのリストに足す', async ({ start }) => {
    const { page } = await start()
    await tab(page, 'income')
    await expect(page.locator('.pane.focused')).toHaveAttribute('data-widget', 'watchlist')
    await typeJump(page, '8058')
    await expect(page.locator('.dialog.jump')).toContainText('高配当 に追加')
    await keys(page, 'Control+Enter')
    await expect(page.locator('[data-pane-id]').first()).toContainText('8058')
  })
})

test.describe('銘柄ジャンプの閉じ方（FR-W4）', () => {
  test('銘柄ジャンプは外をクリックすると閉じる', async ({ start }) => {
    const { page } = await start()
    await keys(page, 'Digit8', 'Digit0')
    await expect(page.locator('.dialog.jump')).toBeVisible()
    await page.mouse.click(1200, 300)
    await expect(page.locator('.dialog.jump')).toHaveCount(0)
  })
})

test.describe('保有のタブ（FR-W10）', () => {
  test('保有が無いときは、取り込み方を案内する', async ({ start }) => {
    const { page } = await start()
    await tab(page, 'triple') // 左の列にウォッチリストとスクリーナーを置くタブ（MTF の左はスクリーナー 2 つ）
    const wl = page.locator('[data-widget="watchlist"]').first()
    await wl.getByRole('tab', { name: /保有/ }).click()
    await expect(wl).toContainText('保有タブ（Ctrl+Shift+7）')
  })

  test('保有の銘柄が 1 行ずつ並び、めくるとチャートが追従し、外す・並べ替えはできない', async ({ start }) => {
    const { page } = await start({
      user: {
        holdings: holdings([
          { code: '8058', account: 'nisa_growth', quantity: 100, avgCost: 3500 },
          { code: '7203', quantity: 200, avgCost: 2500 },
          { code: '7203', account: 'nisa_growth', quantity: 100, avgCost: 2600 },
        ]),
      },
    })
    await tab(page, 'triple') // 左の列にウォッチリストとスクリーナーを置くタブ（MTF の左はスクリーナー 2 つ）
    const wl = page.locator('[data-widget="watchlist"]').first()
    const holdTab = wl.getByRole('tab', { name: /保有/ })
    await holdTab.click()
    await expect(holdTab).toHaveAttribute('aria-selected', 'true')
    // 同じ銘柄を 2 つの口座で持っていても 1 行
    await expect(wl.locator('tbody tr')).toHaveCount(2)
    await expect(wl.locator('tbody')).toContainText('7203')
    await expect(wl.locator('tbody')).toContainText('8058')
    await expect(holdTab).toContainText('2')

    // ↓ でめくるとチャートが追従する
    await wl.locator('tbody tr').first().click()
    await keys(page, 'ArrowDown')
    await expect(page.locator('[data-widget="chart"]').first()).toContainText('8058')
    // Delete で外そうとしても外れず、理由を知らせる
    await keys(page, 'Delete')
    await expect(page.locator('.toasts')).toContainText('「保有」のタブは保有の記録から作る')
    await expect(wl.locator('tbody tr')).toHaveCount(2)
    // Ctrl+PgDn でほかのリストへ移れる
    await keys(page, 'Control+PageDown')
    await expect(holdTab).toHaveAttribute('aria-selected', 'false')
  })
})

test.describe('ツールバーと★の色（FR-V13, FR-V8, FR-FV1）', () => {
  test('★だけ表示・列はアイコンのボタンで、説明はツールチップに入れる', async ({ start }) => {
    const { page } = await start()
    await tab(page, 'triple') // 左の列にウォッチリストとスクリーナーを置くタブ（MTF の左はスクリーナー 2 つ）
    const wl = page.locator('[data-widget="watchlist"]').first()
    await expect(wl.locator('.filter')).not.toContainText('Ctrl+Shift+F')
    await iconButton(wl, '★のみ表示', /Ctrl\+Shift\+F/)
    await iconButton(wl, '列を選ぶ', /Ctrl\+Shift\+C/)
  })

  test('ライトテーマでも★の入っている・いないの色がはっきり違う', async ({ start }) => {
    const { page } = await start({ settings: { theme: 'light' } })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    const colors = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement)
      return [s.getPropertyValue('--star-off').trim(), s.getPropertyValue('--star-on').trim()]
    })
    expect(colors[0]).not.toBe(colors[1])
  })
})
