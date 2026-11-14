// ドロワー（FR-DR1〜DR3, DR6）: 見出しのボタンで移す・戻す、ポインタで開く・自動で隠れる・ピン留め。
// ポインタが離れたら隠れる動きを確かめるのでマウスを使う（キーでは Ctrl+B で開閉できる。keyboard.spec.ts）。
// ポインタの位置に頼るので、並列のあとの直列の project で回す
import { expect, tab, test } from './support'

test.describe('ドロワー（FR-DR2, FR-DR3, FR-DR6）', () => {
  test('見出しから移す・ポインタで開く・自動で隠れる・ピン留め・本体に戻す', async ({ start }) => {
    const { page } = await start()
    await tab(page, 'mtf')
    const wl = page.locator('[data-pane-id]').first()
    await wl.hover()
    await wl.getByRole('button', { name: 'ペインを左のドロワーへ' }).click()
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
    await wl.getByRole('button', { name: 'ペインを左のドロワーへ' }).click()
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
