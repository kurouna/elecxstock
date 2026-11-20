// 株価ボード（ヒートマップのペインのカードの表示。docs/design-quote-board.md・FR-QB1〜QB8）。キーボードだけで操作する。値はスタブ（架空）
import { expect, focusPane, keys, readUser, test, watchlists } from './support'
import { col, freeTab, pane, row } from './support/layout'

const layout = freeTab(row(pane('heatmap', {}, 1), col(pane('chart', {}, 1))))
const FAVS = ['7203', '8058', '8306', '9434', '6501']

/** 保存したレイアウトのヒートマップのペインの状態 */
const saved = (userData: string) => {
  const doc = readUser<{ entries: Record<string, unknown> }>(userData, 'layout')
  const m = JSON.stringify(doc.entries.free).match(/"widget":"heatmap"[^}]*"state":(\{[^}]*\})/)
  return m ? (JSON.parse(m[1]!) as Record<string, unknown>) : null
}

test.describe('株価ボード（FR-QB1, FR-QB2, FR-QB3, FR-QB5, FR-QB6）', () => {
  test('既定はヒートマップ。V で株価ボードとヒートマップを行き来し、戻るとヒートマップの期間が残る。名前はヒートマップのまま', async ({
    start,
  }) => {
    const { page } = await start({ layout })
    const heat = page.locator('[data-widget="heatmap"]')
    await expect(heat.locator('.map .cell').first()).toBeVisible()
    await focusPane(page, heat)
    await keys(page, 'p') // 期間を 1 か月に
    const pressedPeriod = heat.locator('.seg button[aria-pressed="true"]')
    await expect(pressedPeriod).toHaveText('1か月')
    // V で株価ボード
    await keys(page, 'v')
    await expect(heat.locator('.map')).toHaveCount(0)
    await expect(heat.locator('.grid .card').first()).toBeVisible()
    await expect(heat.locator('.vs button[aria-pressed="true"]')).toHaveAttribute('title', /株価ボード \(V\)/)
    await expect(heat.locator('.ph .title')).toHaveText('ヒートマップ')
    // 見出しに基準日と「終値」（日足であること）。指数のカード 3 枚と騰落の帯
    await expect(heat.locator('.asof')).toContainText(/\d+\/\d+\(.\)終値/)
    await expect(heat.locator('.idx .icard')).toHaveCount(3)
    await expect(heat.locator('.idx .icard').first()).toContainText('日経平均')
    await expect(heat.locator('.breadth .side.up b')).toHaveText(/^\d+$/)
    await expect(heat.locator('.breadth .side.down b')).toHaveText(/^\d+$/)
    // 未更新が無ければ出さない
    await expect(heat.locator('.breadth')).not.toContainText('未更新')
    // カードは銘柄名・終値・前日比（円と %）で、コードは出さない
    const card = heat.locator('.grid .card').first()
    await expect(card.locator('.nm')).not.toHaveText('')
    await expect(card.locator('.chg .pct')).toContainText('%')
    // V でヒートマップへ戻ると、期間は 1 か月のまま
    await keys(page, 'v')
    await expect(heat.locator('.map .cell').first()).toBeVisible()
    await expect(pressedPeriod).toHaveText('1か月')
  })

  test('見出しのボタンでも切り替えられ、保存して開き直すと株価ボードのまま', async ({ start }) => {
    const first = await start({ layout })
    const heat = first.page.locator('[data-widget="heatmap"]')
    await expect(heat.locator('.map .cell').first()).toBeVisible()
    await heat.locator('.vs button').nth(1).click()
    await expect(heat.locator('.grid .card').first()).toBeVisible()
    await expect.poll(() => saved(first.userData)).toMatchObject({ qbView: 'board' })
    await first.app.close()
    const second = await start({ userData: first.userData })
    await expect(second.page.locator('[data-widget="heatmap"] .grid .card').first()).toBeVisible()
  })
})

test.describe('株価ボードの操作（FR-QB4, FR-QB7, FR-QB8）', () => {
  test('← → でカードを選ぶと同じリンク色のチャートが追従し、下の 2 行にコードと詳しい値が出る', async ({ start }) => {
    const { page } = await start({ layout: freeTab(row(pane('heatmap', { qbView: 'board' }, 1), col(pane('chart', {}, 1)))) })
    const heat = page.locator('[data-widget="heatmap"]')
    const chart = page.locator('[data-widget="chart"]').first()
    await expect(heat.locator('.grid .card').first()).toBeVisible()
    await focusPane(page, heat)
    await keys(page, 'ArrowRight')
    const sel = heat.locator('.grid .card.sel')
    const id = (await sel.getAttribute('data-id'))!
    const code = id.slice(3)
    await expect(chart.locator('.sym .code')).toHaveText(code)
    await expect(heat.locator('.foot')).toContainText(code)
    await expect(heat.locator('.foot')).toContainText('前日終値')
    await keys(page, 'ArrowDown')
    await expect(heat.locator('.grid .card.sel')).not.toHaveAttribute('data-id', id)
    await expect(chart.locator('.sym .code')).not.toHaveText(code)
  })

  test('G・Ctrl+PageDown で一覧、S で並べ替え、B で分類、I で指数のカード、Ctrl+Shift+F で★のみ', async ({ start }) => {
    const { page } = await start({
      layout: freeTab(row(pane('heatmap', { qbView: 'board' }, 1), col(pane('chart', {}, 1)))),
      user: { watchlists: watchlists({ favorites: FAVS }) },
    })
    const heat = page.locator('[data-widget="heatmap"]')
    await expect(heat.locator('.grid .card').first()).toBeVisible()
    await focusPane(page, heat)
    const tab = heat.locator('.tabs button[aria-selected="true"]')
    await expect(tab).toContainText('時価総額 上位')
    const all = await heat.locator('.grid .card').count()
    // ★のみ（時価総額の上位のうち★の銘柄だけ）
    await keys(page, 'Control+Shift+F')
    await expect.poll(() => heat.locator('.grid .card').count()).toBeLessThan(all)
    await keys(page, 'Control+Shift+F')
    await expect.poll(() => heat.locator('.grid .card').count()).toBe(all)
    // G で次の一覧（★お気に入り）
    await keys(page, 'g')
    await expect(tab).toContainText('お気に入り')
    await expect(heat.locator('.grid .card')).toHaveCount(FAVS.length)
    await keys(page, 'Shift+G')
    await expect(tab).toContainText('時価総額 上位')
    await keys(page, 'Control+PageDown')
    await expect(tab).toContainText('お気に入り')
    // S で並べ替え（騰落率の降順）
    await keys(page, 's')
    await expect(heat.locator('.tools .chip').first()).toHaveText('騰落率 ↓')
    // B で業種の見出し
    await keys(page, 'b')
    await expect(heat.locator('.grid .ghead').first()).toBeVisible()
    // I で指数のカードを出し入れ
    await keys(page, 'i')
    await expect(heat.locator('.idx')).toHaveCount(0)
    await keys(page, 'i')
    await expect(heat.locator('.idx .icard')).toHaveCount(3)
  })
})
