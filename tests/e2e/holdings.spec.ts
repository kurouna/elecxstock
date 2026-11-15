// 保有（FR-H7〜H11）: Insert で足す・E で直す・Delete で外す。銘柄の候補・グロースの銘柄・ツールバー。値はスタブ（架空）
import type { Page } from '@playwright/test'
import { expect, holdings, keys, rpc, tab, test, type } from './support'

const portfolio = (page: Page) => page.locator('[data-widget="portfolio"]')

/** 保有のタブを開き（一覧にフォーカス）、Insert で保有のフォームを開く */
async function openForm(page: Page) {
  await tab(page, 'holdings')
  await expect(portfolio(page)).toHaveClass(/focused/)
  await keys(page, 'Insert')
  const form = page.locator('.dialog.holding')
  await expect(form.locator('input[name="code"]')).toBeFocused()
  return form
}

test.describe('保有の記録（FR-H7）', () => {
  test('キーだけで足す・直す・外す。注釈は (i) のボタンに入れる', async ({ start }) => {
    const { page } = await start()
    await tab(page, 'holdings')
    const pf = portfolio(page)
    await expect(pf).toHaveClass(/focused/)
    // 下の注釈は出さず、(i) のボタンのツールチップで説明する
    await expect(pf.locator('.note')).toHaveCount(0)
    await expect(pf.getByRole('button', { name: '説明', exact: true })).toHaveAttribute('title', /数量と平均取得単価/)

    // Insert で足す: 銘柄 → 口座区分 → 数量 → 平均取得単価 → Enter
    await keys(page, 'Insert')
    const form = page.locator('.dialog.holding')
    await expect(form.locator('input[name="code"]')).toBeFocused()
    await type(page, '7203')
    await expect(form).toContainText('トヨタ')
    await keys(page, 'Tab', 'ArrowRight', 'ArrowLeft') // 口座区分は ← → で選ぶ（既定の特定口座に戻す）
    await keys(page, 'Tab')
    await expect(form.locator('input[name="qty"]')).toBeFocused()
    await type(page, '100')
    await keys(page, 'Tab')
    await type(page, '2500')
    await keys(page, 'Enter')
    await expect(form).toHaveCount(0)
    const row = pf.locator('tbody tr', { hasText: '7203' })
    await expect(row).toContainText('100')
    await expect(pf).toContainText('特定口座')

    // E で直す: 数量を 200 に
    await keys(page, 'e')
    await expect(form.locator('input[name="qty"]')).toHaveValue('100')
    await form.locator('input[name="qty"]').fill('200')
    await keys(page, 'Enter')
    await expect(form).toHaveCount(0)
    await expect(row).toContainText('200')

    // Delete で外す（確認は取り消しから始まる）
    await keys(page, 'Delete')
    await expect(page.getByRole('alertdialog')).toContainText('7203')
    await keys(page, 'ArrowRight', 'Enter')
    await expect(pf.locator('tbody tr', { hasText: '7203' })).toHaveCount(0)
  })

  test('数量を直して並びが入れ替わっても、選んでいる保有から動かない（位置で覚えない）', async ({ start }) => {
    const { page } = await start({
      user: {
        holdings: holdings([
          { code: '7203', quantity: 100, avgCost: 2500 },
          { code: '9433', quantity: 100, avgCost: 4000 },
          { code: '2914', quantity: 100, avgCost: 3000 },
        ]),
      },
    })
    await tab(page, 'holdings')
    const pf = portfolio(page)
    await expect(pf).toHaveClass(/focused/)
    await expect(pf.locator('tbody tr', { hasText: '2914' })).toBeVisible()
    // 評価額の小さい最後の行を選び、数量を大きくして先頭に上げる
    await keys(page, 'End')
    const sel = pf.locator('tbody tr.sel')
    const code = ((await sel.textContent()) ?? '').match(/\d{4}/)![0]
    await keys(page, 'e')
    const form = page.locator('.dialog.holding')
    await form.locator('input[name="qty"]').fill('100000')
    await keys(page, 'Enter')
    await expect(form).toHaveCount(0)
    await expect(sel).toHaveCount(1)
    await expect(sel).toContainText(code)
    await expect(sel).toContainText('100,000')
  })

  test('銘柄の候補: コードの一部で候補が出て Enter で選べる。候補を出しても下の欄が動かない。数量は右揃え', async ({ start }) => {
    const { page } = await start()
    const form = await openForm(page)
    const acc = form.getByRole('radiogroup', { name: '口座区分' })
    const y0 = (await acc.boundingBox())!.y
    await type(page, '80')
    await expect(form.locator('.cands li').first()).toBeVisible()
    expect((await acc.boundingBox())!.y).toBe(y0)
    await keys(page, 'Enter')
    await expect(form.locator('input[name="code"]')).toHaveValue(/^80/)
    expect(await form.locator('input[name="qty"]').evaluate((el) => getComputedStyle(el).textAlign)).toBe('right')
    expect(await form.locator('input[name="code"]').evaluate((el) => getComputedStyle(el).textAlign)).toBe('center')
    await keys(page, 'Escape')
    await expect(form).toHaveCount(0)
  })

  test('グロースの銘柄を足しても、利用者の銘柄（設定）には入れない（保有として取得する）', async ({ start }) => {
    const { page } = await start()
    const form = await openForm(page)
    // コードを打ち切ってすぐ Tab: 候補が「130」の古い結果（先頭が 1306）のままでも、打ったコード 130A になる
    await page.keyboard.type('130A')
    await keys(page, 'Tab', 'Tab')
    await type(page, '100')
    await keys(page, 'Tab')
    await type(page, '900')
    await keys(page, 'Enter')
    await expect(form).toHaveCount(0)
    await expect(portfolio(page).locator('tbody tr', { hasText: '130A' })).toContainText('Veritas')
    const user = await rpc<{ settings: { userInstruments: string[] } }>(page, 'user.load')
    expect(user.settings.userInstruments).not.toContain('130A')
    const [ins] = await rpc<{ userAdded: boolean }[]>(page, 'instruments.get', { ids: ['JP:130A'] })
    expect(ins?.userAdded).toBe(true)
  })
})

test.describe('取り込み・書き出し（FR-H8, FR-H9, FR-H11, FR-V13）', () => {
  test('楽天証券の CSV の取り込みを案内し、取り込む・書き出すはアイコンのボタン。取り込むは CSV と JSON を選ぶ', async ({ start }) => {
    const { page } = await start()
    await tab(page, 'holdings')
    const pf = portfolio(page)
    await expect(pf).toContainText('楽天証券の保有商品の CSV')
    // 説明文のラベル・キーの説明は出さない（ツールチップに入れる）
    await expect(pf).not.toContainText('楽天証券の CSV を取り込む')
    await expect(pf).not.toContainText('Enter 送る')
    const icon = async (name: string, tip: RegExp) => {
      const b = pf.getByRole('button', { name, exact: true })
      await expect(b).toBeVisible()
      await expect(b).toHaveAttribute('title', tip)
      expect(((await b.textContent()) ?? '').replace(/[\s\d]/g, '').length).toBeLessThanOrEqual(1)
      return b
    }
    const imp = await icon('取り込む', /楽天証券の CSV.*JSON/s)
    await icon('書き出す', /JSON/)
    // ファイルの選択は OS のダイアログなので、その前の選択肢まで
    await imp.click()
    const dlg = page.locator('.dialog')
    await expect(dlg).toContainText('楽天証券の CSV')
    await expect(dlg).toContainText('保有の JSON')
    await keys(page, 'Escape')
    await expect(dlg).toHaveCount(0)
  })
})
