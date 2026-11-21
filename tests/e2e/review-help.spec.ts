// ショートカット一覧（F1。docs/design-dialogs.md §4）: キーで探すときの Ctrl+Tab・プリセットの行の鉛筆の印をキーボードだけで確かめる。
// 印と既定のキーの判定は単体テスト（tests/unit/renderer/shortcuts-filter.test.ts）で、ここでは画面に出るかを見る
import { expect, keys, test, type } from './support'

test.describe('ショートカット一覧のキーで探す・割り当ての印（FR-KB6, FR-KB7）', () => {
  test('キーで探す間の Ctrl+Tab・Ctrl+Shift+Tab は、文字で探すへ戻らずにそのキーを探す', async ({ start }) => {
    const { page } = await start()
    await keys(page, 'F1')
    const help = page.getByRole('dialog', { name: 'ショートカット' })
    await expect(help).toBeVisible()
    await keys(page, 'Tab')
    await expect(help.locator('.lx-chip.on')).toHaveText('キーで探す')
    await keys(page, 'Control+Tab')
    await expect(help.locator('.lx-chip.on')).toHaveText('キーで探す')
    await expect(help.locator('.row').first()).toContainText('ドロワーのタブを切り替え')
    await keys(page, 'Control+Shift+Tab')
    await expect(help.locator('.lx-chip.on')).toHaveText('キーで探す')
    await expect(help.locator('.row').first()).toContainText('ドロワーのタブを切り替え')
    // 修飾キーのない Tab は今まで通り切り替える
    await keys(page, 'Tab')
    await expect(help.locator('.lx-chip.on')).toHaveText('文字で探す')
  })

  test('レイアウト（プリセット）の行は割り当てを変えられる印（鉛筆・title）を出し、説明も変えられる旨', async ({ start }) => {
    const { page } = await start()
    await keys(page, 'F1')
    const help = page.getByRole('dialog', { name: 'ショートカット' })
    await expect(help).toBeVisible()
    await type(page, 'プリセット')
    const row = help.locator('.row.sel')
    await expect(row).toContainText('レイアウト（プリセット）')
    await expect(row.locator('.pen')).toHaveCount(1)
    await expect(row.locator('[title="割り当てを変えられます"]')).toHaveCount(1)
    await expect(help.locator('.lx-desc')).toContainText('設定 > キー')
    await expect(help.locator('.lx-desc')).not.toContainText('変えられません')
    // アクションの行の鉛筆にも title
    await keys(page, 'Escape')
    await type(page, '全画面')
    await expect(help.locator('.row.sel')).toContainText('全画面')
    await expect(help.locator('.row.sel [title="割り当てを変えられます"]')).toHaveCount(1)
  })
})
