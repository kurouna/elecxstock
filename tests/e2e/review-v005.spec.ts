// v0.0.5 のレビューで見つかった画面の問題の回帰テスト（スタブのプロバイダ）
import { expect, type Page, test } from '@playwright/test'
import { keys, launch } from './helpers'

async function ready(page: Page) {
  await expect(page.getByRole('dialog', { name: /elecxstock/ })).toBeVisible()
  await keys(page, 'Enter', 'Enter')
  await expect(page.locator('footer')).toContainText(/待機/, { timeout: 60_000 })
}

test('グリッドの − / ＋: − は粗く（枚数が減る）、＋ は細かく（枚数が増える）', async () => {
  const { app, page } = await launch()
  await ready(page)
  await keys(page, 'Control+Shift+Digit3')
  const grid = page.locator('[data-widget="grid"]')
  const dims = async () => {
    const [c, r] = ((await grid.locator('.bar .num').filter({ hasText: '×' }).first().textContent()) ?? '').split('×').map(Number)
    return c! * r!
  }
  const n0 = await dims()
  const finer = grid.getByRole('button', { name: '格子を細かく' })
  await expect(finer).toHaveText('＋')
  await expect(finer).toHaveAttribute('title', /\(\+\)/)
  await finer.click()
  expect(await dims()).toBeGreaterThan(n0)
  const coarser = grid.getByRole('button', { name: '格子を粗く' })
  await expect(coarser).toHaveText('−')
  await coarser.click()
  expect(await dims()).toBe(n0)
  await app.close()
})

test('スクリーン一覧: 末尾を消したあとも Enter で開ける / 未保存の 3 択は ← → で選べる', async () => {
  const { app, page } = await launch()
  await ready(page)
  await keys(page, 'Control+Shift+Digit2')
  // 一覧の末尾を Delete 2 回で消す
  await keys(page, 'Control+o')
  const list = page.locator('.dialog')
  const items = list.locator('li, .it, tr').filter({ hasText: /./ })
  await expect(items.first()).toBeVisible()
  await keys(page, 'End')
  for (let i = 0; i < 40; i++) await keys(page, 'ArrowDown')
  const before = await list.locator('.sel').textContent()
  await keys(page, 'Delete', 'Delete')
  await expect(list).not.toContainText(before!.trim().slice(0, 6))
  await expect(list.locator('.sel')).toHaveCount(1)
  await keys(page, 'Enter')
  await expect(list).toBeHidden()

  // 条件を変えて（未保存）から別のスクリーンを開くと 3 択。← → でボタンを移れる
  const scr = page.locator('[data-widget="screener"]').first()
  await scr.click({ position: { x: 100, y: 10 } })
  await keys(page, 'Control+o', 'ArrowDown', 'Enter')
  await keys(page, 'Tab', 'Delete')
  await keys(page, 'Control+o', 'Home', 'Enter')
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
  await app.close()
})

test('スクリーナー: Ctrl+Shift+F で★の銘柄だけにする（ほかの一覧と同じ）', async () => {
  const { app, page } = await launch()
  await ready(page)
  await keys(page, 'Control+Shift+Digit2')
  const scr = page.locator('[data-widget="screener"]').first()
  const rows = scr.locator('tbody tr')
  await expect(rows.first()).toBeVisible()
  // 1 行目を★にしてから絞る
  await scr.locator('tbody tr').first().click()
  await keys(page, 'Control+d')
  const all = await rows.count()
  await keys(page, 'Control+Shift+f')
  await expect(scr.getByRole('button', { name: '★のみ表示' })).toHaveClass(/on/)
  await expect.poll(() => rows.count()).toBeLessThan(all)
  await expect(rows).toHaveCount(1)
  await keys(page, 'Control+Shift+f')
  await expect.poll(() => rows.count()).toBe(all)
  await app.close()
})

test('保有のフォーム: 銘柄の候補を出しても下の欄が動かない', async () => {
  const { app, page } = await launch()
  await ready(page)
  await keys(page, 'Control+Shift+Digit7')
  await expect(page.locator('[data-widget="portfolio"]')).toHaveClass(/focused/)
  await keys(page, 'Insert')
  const form = page.locator('.dialog.holding')
  await expect(form).toContainText('口座区分')
  const acc = form.getByRole('radiogroup', { name: '口座区分' })
  const y0 = (await acc.boundingBox())!.y
  await form.locator('input[name="code"]').fill('72')
  await expect(form.locator('.cands')).toBeVisible()
  expect((await acc.boundingBox())!.y).toBe(y0)
  await keys(page, 'Escape')
  await app.close()
})

test('配当カレンダー: 9 銘柄以上の月も全部を選べる', async () => {
  const { app, page } = await launch()
  await ready(page)
  // お気に入りに 3 月に権利が確定する 10 銘柄を足す（スタブの架空の権利月）（カレンダーはすべてのウォッチリストの銘柄を並べる）
  await keys(page, 'Control+Shift+Digit4')
  for (const c of ['7203', '8058', '8306', '9434', '8053', '8766', '5401', '6501', '7974', '4063']) {
    await keys(page, ...[...c].map((d) => `Digit${d}`))
    await expect(page.locator('.dialog.jump')).toContainText(c)
    await keys(page, 'Enter', 'Control+d')
    await expect(page.locator('.toasts')).toContainText('お気に入り')
  }
  await keys(page, 'Control+Shift+Digit6')
  const cal = page.locator('[data-widget="divcal"]')
  await expect(cal).toBeVisible()
  await expect.poll(async () => Math.max(...(await cal.locator('.m h5 .num').allTextContents()).map(Number))).toBeGreaterThan(8)
  const counts = await cal.locator('.m h5 .num').allTextContents()
  const mi = counts.findIndex((c) => Number(c) > 8)
  expect(mi, `9 銘柄以上の月がある: ${counts.join(',')}`).toBeGreaterThanOrEqual(0)
  const month = cal.locator('.m').nth(mi)
  await expect(month.locator('.row')).toHaveCount(Number(counts[mi]))
  await app.close()
})

test('リンク色を外した一覧（Ctrl+0）は、行を動かしてもチャートに銘柄を送らない', async () => {
  const { app, page } = await launch()
  await ready(page)
  await keys(page, 'Control+Shift+Digit4')
  const scr = page.locator('[data-widget="screener"]').first()
  const chart = page.locator('[data-widget="chart"]').first()
  await scr.locator('tbody tr').nth(1).click()
  const sym = async () => ((await chart.locator('.ph .sym .code').textContent()) ?? '').trim()
  /** チャートの銘柄が、一覧で選んでいる行の銘柄か（行の先頭がコード） */
  const followsSel = async () => {
    const code = await sym()
    const row = ((await scr.locator('tbody tr.sel').first().textContent()) ?? '').replace(/^\W*/, '')
    return !!code && row.startsWith(code)
  }
  await expect.poll(followsSel).toBe(true)
  // 外すと送らない
  await keys(page, 'Control+Digit0')
  await expect(scr.locator('.ph .link')).toHaveText('·')
  const before = await sym()
  expect(before).toMatch(/^[0-9]/)
  await keys(page, 'ArrowDown', 'Enter')
  await page.waitForTimeout(300)
  expect(await sym()).toBe(before)
  // 付け直すと、また送る
  await keys(page, 'Control+Digit1', 'ArrowDown')
  await expect.poll(sym).not.toBe(before)
  await expect.poll(followsSel).toBe(true)
  await app.close()
})

test('保有のフォームでグロースの銘柄を足しても、利用者の銘柄（設定）には入れない（保有として取得する）', async () => {
  const { app, page } = await launch()
  await ready(page)
  await keys(page, 'Control+Shift+Digit7')
  await expect(page.locator('[data-widget="portfolio"]')).toHaveClass(/focused/)
  await keys(page, 'Insert')
  const form = page.locator('.dialog.holding')
  // コードを打ち切ってすぐ Tab: 候補が「130」の古い結果（先頭が 1306）のままでも、打ったコード 130A になる
  await page.keyboard.type('130A')
  await keys(page, 'Tab', 'Tab')
  await page.keyboard.type('100')
  await keys(page, 'Tab')
  await page.keyboard.type('900')
  await keys(page, 'Enter')
  await expect(form).toHaveCount(0)
  await expect(page.locator('[data-widget="portfolio"] tbody tr', { hasText: '130A' })).toContainText('Veritas')
  const user = (await page.evaluate(() =>
    (window as unknown as { elecxstock: { call: (m: string, p: unknown) => Promise<unknown> } }).elecxstock.call('user.load', {}),
  )) as { settings: { userInstruments: string[] } }
  expect(user.settings.userInstruments).not.toContain('130A')
  const [ins] = (await page.evaluate(() =>
    (window as unknown as { elecxstock: { call: (m: string, p: unknown) => Promise<unknown> } }).elecxstock.call('instruments.get', {
      ids: ['JP:130A'],
    }),
  )) as { userAdded: boolean }[]
  expect(ins?.userAdded).toBe(true)
  await app.close()
})
