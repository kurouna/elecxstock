// スクリーナー（FR-SC1〜SC16, FR-FD1, FR-H6）: 条件を選ぶダイアログ・条件の編集・金額の単位・0 件・スクリーンの一覧・★だけ表示・ツールバー。
// キーボードだけで操作する（重なりの確かめだけクリックする）。値はスタブ（架空）
import type { Locator, Page } from '@playwright/test'
import { expect, holdings, keys, tab, test, type } from './support'

const screener = (page: Page) => page.locator('[data-widget="screener"]')

/** スクリーナーのタブを開き、スクリーナーにフォーカスがある状態にする */
async function openScreener(page: Page): Promise<Locator> {
  await tab(page, 'screener')
  const scr = screener(page)
  await expect(scr).toHaveClass(/focused/)
  await expect(scr.locator('tbody tr').first()).toBeVisible()
  return scr
}

/** 条件を選ぶダイアログ（Insert）で打って足す */
async function addField(page: Page, q: string, opts: { keepOpen?: boolean } = {}) {
  const fp = page.locator('.dialog.picker')
  if (!(await fp.isVisible())) {
    await keys(page, 'Insert')
    await expect(fp).toBeVisible()
  }
  await type(page, q)
  await expect(fp.getByRole('option', { selected: true })).toBeVisible()
  await keys(page, opts.keepOpen ? 'Shift+Enter' : 'Enter')
  if (!opts.keepOpen) await expect(fp).toHaveCount(0)
}

/** 足した（フォーカスのある）条件の値を Enter で打つ */
async function typeValue(page: Page, text: string, label?: string | RegExp) {
  await keys(page, 'Enter')
  const dlg = page.locator('.dialog').last()
  await expect(dlg.locator('input')).toBeFocused()
  if (label) await expect(dlg).toContainText(label)
  await keys(page, 'Control+a')
  await type(page, text)
  await keys(page, 'Enter')
  await expect(page.locator('.dialog')).toHaveCount(0)
}

test.describe('条件を選ぶダイアログ（FR-SC1, FR-FD1）', () => {
  test('Insert で開き、打って絞り込み、Enter で足す。EPS は円のまま出す', async ({ start }) => {
    const { page } = await start()
    const scr = await openScreener(page)
    const conds = scr.locator('.cond')
    const n0 = await conds.count()
    await keys(page, 'Insert')
    const fp = page.locator('.dialog.picker')
    await expect(fp.getByRole('group', { name: '割安・財務' })).toBeVisible()
    await type(page, 'ROE')
    await expect(fp.getByRole('option', { selected: true })).toContainText('ROE')
    await keys(page, 'Enter')
    await expect(fp).toHaveCount(0)
    await expect(conds).toHaveCount(n0 + 1)
    await expect(conds.last()).toContainText('ROE')
    // EPS（1 株あたりの円）は円のまま出す（「0 万」にしない）。Enter で打つときも円
    await addField(page, 'EPS')
    await expect(conds.last().locator('.v')).toHaveText(/^100(.0)?$/)
    // 足した条件に移っているので、Enter で値を打つ（円）。Esc で戻り、Delete で外す
    await keys(page, 'Enter')
    await expect(page.locator('.dialog').last()).toContainText('EPS（円）')
    await keys(page, 'Escape')
    await expect(page.locator('.dialog')).toHaveCount(0)
    await keys(page, 'Delete', 'Escape')
    await expect(conds).toHaveCount(n0 + 1)
  })

  test('Shift+Enter は続けて足し、足した項目にすぐ ✓ が付く。Esc は検索を消してから閉じる。無い項目は理由を出す', async ({ start }) => {
    const { page } = await start({ settings: { recentFields: ['value.roe'] } })
    const scr = await openScreener(page)
    const conds = scr.locator('.cond')
    const n0 = await conds.count()
    const fp = page.locator('.dialog.picker')
    await keys(page, 'Insert')
    await expect(fp).toBeVisible()
    await expect(fp.locator('.recent')).toContainText('ROE') // よく使う
    await addField(page, '最低投資', { keepOpen: true })
    await expect(conds).toHaveCount(n0 + 1)
    await expect(fp).toBeVisible()
    await expect(fp.getByRole('option', { name: /最低投資金額/ }).locator('.ck')).toBeVisible()
    await keys(page, 'Escape')
    await expect(fp.locator('input')).toHaveValue('')
    await addField(page, 'ボラ', { keepOpen: true })
    await keys(page, 'Escape', 'Escape')
    await expect(fp).toHaveCount(0)
    await expect(conds).toHaveCount(n0 + 2)
    await expect(conds.nth(n0)).toContainText('最低投資金額')
    await expect(conds.nth(n0 + 1)).toContainText('ボラティリティ')

    // 無い項目は理由を出す
    await keys(page, 'Insert')
    await type(page, '自己資本比率')
    await expect(fp.locator('.empty')).toBeVisible()
    await keys(page, 'Escape', 'Escape')
    await expect(fp).toHaveCount(0)
    await expect(conds).toHaveCount(n0 + 2)
  })

  test('F で今の条件の指標を変える', async ({ start }) => {
    const { page } = await start()
    const scr = await openScreener(page)
    const first = scr.locator('.cond').first()
    await expect(first).not.toContainText('PBR')
    await keys(page, 'Tab')
    await expect(first).toHaveClass(/focus/)
    await keys(page, 'KeyF')
    const fp = page.locator('.dialog.picker')
    await expect(fp).toBeVisible()
    await type(page, 'PBR')
    await keys(page, 'Enter')
    await expect(fp).toHaveCount(0)
    await expect(first).toContainText('PBR')
  })
})

test.describe('条件の値の単位（FR-SC1, FR-FD1。アラートと同じ。alerts.spec.ts）', () => {
  test('時価総額は億円で打つ（100 → 100 億）。「30万」のように単位を付けてもよい', async ({ start }) => {
    const { page } = await start()
    const scr = await openScreener(page)
    const cond = scr.locator('.cond').last()
    await addField(page, '時価総額')
    await expect(cond).toContainText('時価総額')
    await typeValue(page, '100', '億円')
    await expect(cond.locator('.v')).toHaveText(/^100\s?億$/)
    // 直すときは表示の単位の数が入っている
    await keys(page, 'Enter')
    await expect(page.locator('.dialog').last().locator('input')).toHaveValue('100')
    await keys(page, 'Escape')
    await expect(page.locator('.dialog')).toHaveCount(0)
    await typeValue(page, '30万')
    await expect(cond.locator('.v')).toHaveText(/^30\s?万$/)
  })
})

test.describe('条件の編集（FR-SC1, FR-SC8, FR-H6）', () => {
  test('ウォッチリストは置かず、条件の並べ替え・記号は真ん中・保有の記録があれば「保有」を選べる', async ({ start }) => {
    const { page } = await start({ user: { holdings: holdings([{ code: '7203', quantity: 100, avgCost: 2500 }]) } })
    const scr = await openScreener(page)
    await expect(page.locator('[data-widget="watchlist"]')).toHaveCount(0)
    const conds = scr.locator('.cond')
    await expect(conds).toHaveCount(3)
    const first = (await conds.nth(0).locator('.f').textContent())!
    // ↓ で 1 番目を下へ、↑ で戻す
    await conds.nth(0).getByRole('button', { name: '下へ' }).click()
    await expect(conds.nth(1).locator('.f')).toHaveText(first)
    await conds.nth(1).getByRole('button', { name: '上へ' }).click()
    await expect(conds.nth(0).locator('.f')).toHaveText(first)
    // 比較の記号は真ん中
    expect(
      await conds
        .nth(0)
        .locator('.op')
        .evaluate((el) => getComputedStyle(el).justifyContent),
    ).toBe('center')
    // 指標をクリックすると選び直せる。保有の記録があるので「保有」を選べる
    await conds.nth(2).locator('.f').click()
    const dlg = page.locator('.dialog')
    await expect(dlg).toContainText('保有')
    await dlg.getByText('保有', { exact: true }).click()
    await expect(conds.nth(2).locator('.f')).toHaveText('保有')
  })

  test('結果が 0 件ならそう表示し、空の知らせが条件をふさがない（値をクリックして直せる）', async ({ start }) => {
    const { page } = await start()
    const scr = await openScreener(page)
    await addField(page, 'ボラ')
    await typeValue(page, '0.0001')
    await expect(scr.locator('.state')).toContainText('条件に合う銘柄はありません')
    await scr.locator('.cond').last().locator('.v').click({ timeout: 5000 })
    await expect(page.locator('.dialog').last()).toContainText('ボラティリティ')
    await keys(page, 'Escape')
  })
})

test.describe('スクリーンの一覧・★だけ表示（FR-SC12, FR-SC13, FR-FV2）', () => {
  test('スクリーン一覧: 末尾を消したあとも Enter で開ける', async ({ start }) => {
    const { page } = await start()
    await openScreener(page)
    await keys(page, 'Control+o')
    const list = page.locator('.dialog')
    await expect(list.locator('.sel')).toHaveCount(1)
    await keys(page, 'End')
    const last = (await list.locator('.sel').textContent())!.trim().slice(0, 6)
    await keys(page, 'Delete', 'Delete')
    await expect(list).not.toContainText(last)
    await expect(list.locator('.sel')).toHaveCount(1)
    await keys(page, 'Enter')
    await expect(list).toBeHidden()
  })

  test('条件を変えて（未保存）から別のスクリーンを開くと 3 択。← → でボタンを移れる', async ({ start }) => {
    const { page } = await start()
    const scr = await openScreener(page)
    await keys(page, 'Tab', 'Delete')
    await expect(scr).toContainText('変更あり')
    await keys(page, 'Control+o')
    await expect(page.locator('.dialog .sel')).toHaveCount(1)
    await keys(page, 'ArrowDown', 'Enter')
    const ask = page.getByRole('alertdialog')
    await expect(ask).toContainText('保存されていない変更があります')
    await expect(page.locator(':focus')).toHaveText('保存')
    await keys(page, 'ArrowLeft')
    await expect(page.locator(':focus')).toHaveText('破棄')
    await keys(page, 'ArrowLeft')
    await expect(page.locator(':focus')).toHaveText('キャンセル')
    await keys(page, 'ArrowRight', 'ArrowRight')
    await expect(page.locator(':focus')).toHaveText('保存')
    await keys(page, 'Escape')
    await expect(ask).toHaveCount(0)
  })

  test('Ctrl+Shift+F で★の銘柄だけにする（ほかの一覧と同じ）', async ({ start }) => {
    const { page } = await start()
    const scr = await openScreener(page)
    const rows = scr.locator('tbody tr')
    // 選んだ行を★にしてから絞る
    await keys(page, 'ArrowDown')
    await expect(scr.locator('tbody tr.sel')).toHaveCount(1)
    await keys(page, 'Control+d')
    await expect(scr.locator('tbody tr.sel .star')).toHaveClass(/on/)
    const all = await rows.count()
    await keys(page, 'Control+Shift+f')
    await expect(scr.getByRole('button', { name: '★のみ表示' })).toHaveClass(/on/)
    await expect(rows).toHaveCount(1)
    expect(all).toBeGreaterThan(1)
    await keys(page, 'Control+Shift+f')
    await expect(rows).toHaveCount(all)
  })

  test('ツールバーは説明文をラベルにせず、アイコンのボタンに名前とツールチップを付ける（FR-V13）', async ({ start }) => {
    const { page } = await start()
    const scr = await openScreener(page)
    for (const [name, tip] of [
      ['名前を付けて保存', /Ctrl\+Shift\+S/],
      ['グリッドで開く', /Ctrl\+Shift\+G/],
      ['列を選ぶ', /Ctrl\+Shift\+C/],
    ] as const) {
      const b = scr.getByRole('button', { name, exact: true })
      await expect(b).toBeVisible()
      await expect(b).toHaveAttribute('title', tip)
      expect(((await b.textContent()) ?? '').replace(/[\s\d]/g, '').length).toBeLessThanOrEqual(1)
    }
  })
})
