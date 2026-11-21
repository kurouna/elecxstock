// 設定のレビューの指摘（2026-11-21）の再現: キーの割り当て・ニュースのフィード・目標利回りの欄・ステッパー・探す（FR-KB11, FR-KB6, FR-NW2）
import type { Page } from '@playwright/test'
import { expect, keys, test, type } from './support'

const keymap = (page: Page) =>
  page.evaluate(
    async () =>
      (
        await (
          window as unknown as {
            elecxstock: { call: (m: string, p: unknown) => Promise<{ settings: { keymap: Record<string, string> } }> }
          }
        ).elecxstock.call('user.load', {})
      ).settings.keymap,
  )
const settings = async (page: Page, downs: number) => {
  await keys(page, 'Control+Comma')
  const dlg = page.getByRole('dialog', { name: '設定' })
  await expect(dlg.getByRole('tab', { name: '一般' })).toBeFocused()
  for (let i = 0; i < downs; i++) await keys(page, 'ArrowDown')
  return dlg
}

test.describe('キーの割り当ての回帰（FR-KB6）', () => {
  test('上の段のボタンで Enter・Delete を押しても、一覧の行の操作にならない', async ({ start }) => {
    const { page } = await start()
    const dlg = await settings(page, 4)
    await expect(dlg.getByRole('tab', { name: 'キー' })).toHaveAttribute('aria-selected', 'true')
    await keys(page, 'ArrowRight')
    await expect(dlg.getByRole('textbox', { name: '操作・キーで探す' })).toBeFocused()
    await keys(page, 'Tab')
    const chip = dlg.getByRole('button', { name: /変えたものだけ/ })
    await expect(chip).toBeFocused()
    // Enter はボタンを押す（記録を始めない）
    await keys(page, 'Enter')
    await expect(dlg.locator('.rec')).toHaveCount(0)
    await expect(chip).toHaveAttribute('aria-pressed', 'true')
    await keys(page, 'Enter')
    await expect(chip).toHaveAttribute('aria-pressed', 'false')
    // Delete は選んだ行の割り当てを外さない
    await keys(page, 'Delete')
    await expect(dlg.locator('.krow .def')).toHaveCount(0)
    expect(await keymap(page)).toEqual({})
  })

  test('重なりを知らせている間に別の行をクリックしたら、知らせを消す（前の行のキーを割り当てない）', async ({ start }) => {
    const { page } = await start()
    const dlg = await settings(page, 4)
    await dlg.locator('#key-max').click()
    await expect(dlg.locator('.rec')).toBeVisible()
    await keys(page, 'Control+Shift+KeyW')
    await expect(dlg.locator('#key-max .cf')).toBeVisible()
    const other = dlg.locator('.krow:not(#key-max)').first()
    await other.click()
    await expect(dlg.locator('.cf')).toHaveCount(0)
    await keys(page, 'Enter')
    await expect(dlg.locator('.krow .def')).toHaveCount(0)
    expect(await keymap(page)).toEqual({})
  })

  test('行の ↺ を押したら記録をやめる', async ({ start }) => {
    const { page } = await start()
    const dlg = await settings(page, 4)
    await keys(page, 'ArrowRight')
    await type(page, '最大化')
    await keys(page, 'ArrowDown', 'Enter', 'Control+Alt+KeyM')
    await expect.poll(() => keymap(page)).toEqual({ max: 'Ctrl+Alt+M' })
    await dlg.locator('#key-max').click()
    await expect(dlg.locator('.rec')).toBeVisible()
    await dlg.locator('#key-max .rst').click()
    await expect.poll(() => keymap(page)).toEqual({})
    await expect(dlg.locator('.rec')).toHaveCount(0)
  })
})

test.describe('ニュースのフィードの一覧の回帰（FR-NW2, FR-KB11）', () => {
  test('フィードの一覧は Tab で 1 回だけ止まる（行のスイッチに止まらない）', async ({ start }) => {
    const { page } = await start()
    const dlg = await settings(page, 5)
    await expect(dlg.getByRole('tab', { name: 'ニュース' })).toHaveAttribute('aria-selected', 'true')
    await keys(page, 'ArrowRight')
    const feeds = dlg.getByRole('listbox', { name: 'フィード' })
    await expect(feeds.locator('.frow').first()).toBeVisible()
    const at = (sel: string) => page.evaluate((s) => !!document.activeElement?.matches(s), sel)
    for (let i = 0; i < 12 && !(await at('.feeds')); i++) await keys(page, 'Tab')
    await expect(feeds).toBeFocused()
    await keys(page, 'Tab')
    await expect(dlg.getByRole('list', { name: 'このアプリの通信先' })).toBeFocused()
  })
})

test.describe('設定の本文の回帰（FR-KB11, FR-C12, FR-V10）', () => {
  test('目標利回りの線がオフのとき、目標の行は行そのものに止まり、← でタブへ戻れる', async ({ start }) => {
    const { page } = await start()
    const dlg = await settings(page, 2)
    await expect(dlg.getByRole('tab', { name: 'チャート' })).toHaveAttribute('aria-selected', 'true')
    await keys(page, 'ArrowRight', 'ArrowDown')
    await expect(dlg.locator('[data-row="yieldTargets"]')).toBeFocused()
    await keys(page, 'ArrowLeft')
    await expect(dlg.getByRole('tab', { name: 'チャート' })).toBeFocused()
  })

  test('「決める」のボタンで決めたら、フォーカスは値のボタンへ戻る', async ({ start }) => {
    const { page } = await start()
    const dlg = await settings(page, 1)
    await keys(page, 'ArrowRight', 'ArrowDown')
    const v = dlg.locator('[data-row="scale"] .v')
    await expect(v).toBeFocused()
    await keys(page, 'ArrowRight', 'Tab', 'Tab')
    const commit = dlg.locator('[data-row="scale"] .commit')
    await expect(commit).toBeFocused()
    await keys(page, 'Enter')
    await expect(commit).toBeHidden()
    await expect(v).toBeFocused()
  })

  test('仮の値のまま探す欄へ移ったら、仮の値と下の段の「決める」を消す', async ({ start }) => {
    const { page } = await start()
    const dlg = await settings(page, 1)
    await keys(page, 'ArrowRight', 'ArrowDown', 'ArrowRight')
    await expect(dlg.locator('[data-row="scale"] .commit')).toBeVisible()
    await expect(dlg.locator('.sfoot')).toContainText('決める')
    await keys(page, 'Control+KeyF')
    await expect(dlg.getByRole('textbox', { name: '設定を探す' })).toBeFocused()
    await expect(dlg.locator('.sfoot')).not.toContainText('決める')
    await expect(dlg.locator('[data-row="scale"] .commit')).toBeHidden()
  })

  test('キーのタブから探した結果の行でも / で探す欄へ', async ({ start }) => {
    const { page } = await start()
    const dlg = await settings(page, 4)
    await expect(dlg.getByRole('tab', { name: 'キー' })).toHaveAttribute('aria-selected', 'true')
    await keys(page, 'Control+KeyF')
    await type(page, '自動で更新')
    await keys(page, 'ArrowDown')
    await expect(dlg.getByRole('switch', { name: '自動で更新する' })).toBeFocused()
    await keys(page, '/')
    await expect(dlg.getByRole('textbox', { name: '設定を探す' })).toBeFocused()
  })
})

// コードレビュー（2026-11-21、2 回目）: 一覧の行を押したときに、本文のスクロールを一覧の上端へ戻さない
test.describe('一覧の行を押しても本文がスクロールで戻らない（FR-KB6, FR-NW2, FR-KB11）', () => {
  /** 本文を下へスクロールし、見えている行のうち下のほうを押して、本文のスクロール位置が変わらないか */
  const clickLowerRow = async (page: Page, row: string) => {
    const body = page.locator('.sbody')
    await body.evaluate((b) => {
      b.scrollTop = b.scrollHeight
    })
    const before = await body.evaluate((b) => b.scrollTop)
    expect(before).toBeGreaterThan(0)
    // 本文の中で見えている行の最後
    const idx = await page.locator(row).evaluateAll((rs) => {
      const box = document.querySelector('.sbody')!.getBoundingClientRect()
      let k = -1
      rs.forEach((r, i) => {
        const b = r.getBoundingClientRect()
        if (b.top >= box.top && b.bottom <= box.bottom) k = i
      })
      return k
    })
    expect(idx).toBeGreaterThanOrEqual(0)
    await page.locator(row).nth(idx).click()
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))))
    expect(Math.abs((await body.evaluate((b) => b.scrollTop)) - before)).toBeLessThanOrEqual(1)
  }
  test('キーのタブ', async ({ start }) => {
    const { page } = await start()
    await keys(page, 'Control+Comma', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown')
    await expect(page.getByRole('tab', { name: 'キー' })).toHaveAttribute('aria-selected', 'true')
    await clickLowerRow(page, '.krow')
  })
  test('ニュースのタブ', async ({ start }) => {
    const { page } = await start()
    await keys(page, 'Control+Comma', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown')
    await expect(page.getByRole('tab', { name: 'ニュース' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('.frow').first()).toBeVisible()
    await clickLowerRow(page, '.frow')
  })
})
