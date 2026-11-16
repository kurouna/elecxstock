// タイトルバー（FR-L13）: 押せないところはすべて窓のドラッグに使え、検索欄の左右と閉じるボタンなどの左に、
// 窓の幅・文字の大きさによらずドラッグできる場所が残る。実際の窓の大きさを変えて測る（閉じるボタンなどの位置は窓から読む）
import { expect, expectDraggableTitleBar, measureTitleBar, resizeWindow, test } from './support'

test.describe('タイトルバーのドラッグできる場所（FR-L13）', () => {
  test('最小の幅から広い窓まで、検索欄の左右と閉じるボタンの左にドラッグできる場所が残る', async ({ start }) => {
    const { app, page } = await start({ viewport: null })
    for (const width of [1920, 1600, 1400, 1250, 1100]) {
      await resizeWindow(app, page, width, 800)
      await expectDraggableTitleBar(page, `${width}px`)
      // タブはどの幅でも押せる（名前を省いてもキーの数字とツールチップは残る）
      const tabs = page.locator('.presets button')
      await expect(tabs).toHaveCount(9)
      for (const b of await tabs.all()) {
        await expect(b).toBeVisible()
        await expect(b).toHaveAttribute('title', /\S/)
      }
    }
    // 広い窓ではタブの名前を出す
    await resizeWindow(app, page, 1920, 800)
    await expect(page.locator('.presets button').first()).toContainText('マーケット')
  })

  for (const uiScale of [0.8, 1.5]) {
    test(`文字の大きさ ${uiScale * 100}% の最小の幅でも、閉じるボタンなどに重ならない`, async ({ start }) => {
      const { app, page } = await start({ viewport: null, settings: { uiScale } })
      await expect.poll(() => page.evaluate(() => document.documentElement.style.zoom)).toBe(String(uiScale))
      for (const width of [1600, 1100]) {
        await resizeWindow(app, page, width, 800)
        await expectDraggableTitleBar(page, `${uiScale} / ${width}px`)
      }
    })
  }

  test('閉じるボタンなどの幅は窓から読む（Window Controls Overlay が出ている）', async ({ start }) => {
    const { page } = await start({ viewport: null })
    const m = await measureTitleBar(page)
    expect(Number.isFinite(m.reserve)).toBe(true)
  })
})
