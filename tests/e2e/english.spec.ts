// 英語の画面での主な流れ（FR-N1, FR-N2, FR-N4, NFR-Q6）: 文言・銘柄名・トーストが英語で出て、日本語が混ざらない。値はスタブ（架空）
import type { Locator } from '@playwright/test'
import { expect, jump, keys, tab, test, type } from './support'

/** かな・漢字が無い（銘柄の日本語名・文言の訳し漏れが混ざっていない） */
// biome-ignore lint/performance/useDomNodeTextContent: 見えている文字だけを見る（隠れた要素の文字は含めない）
const noJapanese = async (l: Locator) => expect(await l.innerText()).not.toMatch(/[぀-ヿ一-鿿]/)

test.describe('英語の画面（FR-N1, FR-N4, NFR-Q6）', () => {
  test('英語で起動し、銘柄ジャンプ → ★ → スクリーナー → 条件を足す → ショートカット・設定まで通す', async ({ start }) => {
    const { page } = await start({ lang: 'en' })
    await tab(page, 'triple', 'en') // 左の列にウォッチリストとスクリーナー、右にチャートを置くタブ
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await noJapanese(page.locator('.presets'))
    await expect(page.locator('footer')).toContainText('Idle')
    // 銘柄ジャンプ: 英語名で出る（FR-N4）→ ★
    await keys(page, 'Alt+ArrowRight')
    await expect(page.locator('.pane.focused')).toHaveAttribute('data-widget', 'chart')
    await jump(page, '8058')
    const chart = page.locator('.pane.focused')
    await expect(chart).toContainText('8058')
    await noJapanese(chart.locator('.ph'))
    await keys(page, 'Control+d')
    await expect(page.locator('.toasts')).toContainText('Added to favorites')
    await noJapanese(page.locator('[data-widget="watchlist"]').first())

    // スクリーナー: 既定のスクリーンの名前・条件・列が英語
    await tab(page, 'screener', 'en')
    const scr = page.locator('[data-widget="screener"]')
    await expect(scr).toHaveClass(/focused/)
    await expect(scr).toContainText('High yield')
    await expect(scr.locator('tbody tr').first()).toBeVisible()
    await noJapanese(scr)
    // 条件を選ぶダイアログ（英語の名前で探す）
    await keys(page, 'Insert')
    const fp = page.locator('.dialog.picker')
    await expect(fp).toBeVisible()
    await type(page, 'Market cap')
    await expect(fp.getByRole('option', { selected: true })).toContainText('Market cap')
    await noJapanese(fp)
    await keys(page, 'Enter')
    await expect(fp).toHaveCount(0)
    await expect(scr.locator('.cond').last()).toContainText('Market cap')
    // 金額の単位も英語（億円 → ¥100M）
    await expect(scr.locator('.cond').last().locator('.v')).not.toContainText('億')

    // ペインの種類（docs/design-dialogs.md §5）
    await keys(page, 'Control+Shift+KeyN')
    const wp = page.getByRole('dialog', { name: 'Change pane type' })
    await expect(wp).toBeVisible()
    await noJapanese(wp)
    await keys(page, 'Escape')
    await expect(wp).toHaveCount(0)
    // ショートカット一覧・設定
    await keys(page, 'F1')
    const help = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
    await expect(help).toBeVisible()
    await noJapanese(help)
    await keys(page, 'Escape')
    await expect(help).toHaveCount(0)
    await keys(page, 'Control+Comma')
    const set = page.getByRole('dialog', { name: 'Settings' })
    await expect(set).toBeVisible()
    await keys(page, 'Escape')
    await expect(set).toHaveCount(0)
  })
})
