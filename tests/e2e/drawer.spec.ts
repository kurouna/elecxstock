// ドロワー（FR-DR1〜DR3, DR6）: 見出しのボタンで移す・戻す、ポインタで開く・自動で隠れる・ピン留め。
// ポインタが離れたら隠れる動きを確かめるのでマウスを使う（キーでは Ctrl+B で開閉できる。keyboard.spec.ts）。
// ポインタの位置に頼るので、並列のあとの直列の project で回す
import { expect, keys, tab, test } from './support'

test.describe('ドロワー（FR-DR2, FR-DR3, FR-DR6）', () => {
  test('見出しから移す・ポインタで開く・自動で隠れる・ピン留め・本体に戻す', async ({ start }) => {
    const { page } = await start()
    await tab(page, 'mtf')
    const wl = page.locator('[data-pane-id]').first()
    await wl.hover()
    await wl.getByRole('button', { name: 'ペインを左のドロワーに移す' }).click()
    const rail = page.locator('[data-dock-rail="left"]')
    await expect(rail).toBeVisible()
    await page.mouse.move(1000, 400)
    await page.mouse.click(1000, 400)
    await expect(page.locator('.dock')).not.toHaveClass(/open/)
    const box = (await rail.boundingBox())!
    await page.mouse.move(box.x + 10, box.y + 300, { steps: 5 })
    await expect(page.locator('.dock')).toHaveClass(/open/)
    await page.mouse.move(box.x + 10, box.y + 2, { steps: 10 }) // 帯に沿って上へ離れる
    await page.mouse.move(400, 0, { steps: 2 })
    await expect(page.locator('.dock')).not.toHaveClass(/open/)
    await page.mouse.move(box.x + 10, box.y + 300, { steps: 5 })
    await expect(page.locator('.dock')).toHaveClass(/open/)
    await page.locator('.dock .pin').click()
    await page.mouse.move(1200, 500, { steps: 10 })
    await page.waitForTimeout(500) // ピン留めしたら、離れても隠れないこと（隠れるまでの待ちより長く待つ）
    await expect(page.locator('.dock')).toHaveClass(/pinned/)
    await expect(page.locator('.dock')).toHaveClass(/open/)
    await page.locator('.dock [data-pane-id]').first().hover()
    await page.locator('.dock').getByRole('button', { name: 'ドロワーのペインを本体に戻す' }).click()
    await expect(rail).toHaveCount(0)
  })

  test('ドロワーから本体へ戻すと、元の位置（左の列の上）に戻る', async ({ start }) => {
    const { page } = await start()
    await tab(page, 'income')
    const wl = page.locator('[data-pane-id]').first()
    const before = (await wl.boundingBox())!
    await wl.hover()
    await wl.getByRole('button', { name: 'ペインを左のドロワーに移す' }).click()
    await page.locator('[data-dock-rail="left"]').hover()
    await page.locator('.dock .pin').click()
    await page.locator('.dock [data-pane-id]').first().hover()
    await page.locator('.dock').getByRole('button', { name: 'ドロワーのペインを本体に戻す' }).click()
    await expect(page.locator('[data-dock-rail]')).toHaveCount(0)
    await expect
      .poll(async () => {
        const after = (await page.locator('[data-pane-id]').first().boundingBox())!
        return [Math.abs(after.x - before.x) < 4, Math.abs(after.width - before.width) < 8, Math.abs(after.height - before.height) < 8]
      })
      .toEqual([true, true, true])
  })
})

// 回帰（2026-11-16 のレビューで見つけた同じ作り）: 表示倍率を変えると、ドロワーの幅がポインタより速く（倍率の分だけ）変わっていた
test.describe('ドロワーの幅と表示倍率（FR-DR5・FR-V10）', () => {
  test('文字の倍率を上げても、ドロワーの端をドラッグした分だけ幅が変わる', async ({ start }) => {
    const { page } = await start()
    await tab(page, 'mtf')
    const wl = page.locator('[data-pane-id]').first()
    await wl.hover()
    await wl.getByRole('button', { name: 'ペインを左のドロワーに移す' }).click()
    const rail = page.locator('[data-dock-rail="left"]')
    const box = (await rail.boundingBox())!
    await page.mouse.move(box.x + 10, box.y + 300, { steps: 5 })
    await expect(page.locator('.dock')).toHaveClass(/open/)
    await page.locator('.dock .pin').click()
    // 窓の文字の倍率を上げる（見出しのボタンは倍率が大きいと畳まれるので、ドロワーに移してから上げる）
    await keys(page, 'Control+Alt+Equal', 'Control+Alt+Equal', 'Control+Alt+Equal')
    await expect.poll(() => page.evaluate(() => Number(document.documentElement.style.zoom))).toBeGreaterThan(1.2)
    const panel = page.locator('.dock .panel')
    const w0 = (await panel.boundingBox())!.width
    const eb = (await page.locator('.dock .edge').boundingBox())!
    const x = eb.x + eb.width / 2
    const y = eb.y + eb.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 60, y, { steps: 6 })
    await page.mouse.up()
    await expect.poll(async () => Math.round((await panel.boundingBox())!.width - w0)).toBeGreaterThan(52)
    expect((await panel.boundingBox())!.width - w0).toBeLessThan(68)
  })
})
