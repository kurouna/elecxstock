// 株価ボード（ヒートマップのペインのカードの表示。docs/design-quote-board.md・FR-QB1〜QB8）。キーボードだけで操作する。値はスタブ（架空）
import { expect, focusPane, jobsDone, jump, keys, readUser, test, watchlists } from './support'
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
  test('既定はヒートマップ。V で株価ボードとヒートマップを行き来し、戻るとヒートマップの期間が残る。見出しの名前は表示に合わせる', async ({
    start,
  }) => {
    const { page } = await start({ layout })
    const heat = page.locator('[data-widget="heatmap"]')
    await expect(heat.locator('.map .cell').first()).toBeVisible()
    await focusPane(page, heat)
    await keys(page, 'p') // 期間を 1 か月に
    const pressedPeriod = heat.locator('.seg button[aria-pressed="true"]')
    await expect(pressedPeriod).toHaveText('1か月')
    await expect(heat.locator('.ph .title')).toHaveText('ヒートマップ')
    // 切り替えのボタンはアイコンだけ。名前はツールチップと読み上げ（aria-label）で出す
    const views = heat.locator('.vs button')
    await expect(views).toHaveCount(2)
    for (const b of await views.all()) await expect(b).toHaveText('')
    await expect(views.nth(0)).toHaveAttribute('aria-label', 'ヒートマップ')
    await expect(views.nth(0)).toHaveAttribute('title', 'ヒートマップ（表示中）')
    await expect(views.nth(1)).toHaveAttribute('aria-label', '株価ボード')
    await expect(views.nth(1)).toHaveAttribute('title', '株価ボードに切り替える (V)')
    // V で株価ボード
    await keys(page, 'v')
    await expect(heat.locator('.map')).toHaveCount(0)
    await expect(heat.locator('.grid .card').first()).toBeVisible()
    await expect(heat.locator('.vs button[aria-pressed="true"]')).toHaveAttribute('title', '株価ボード（表示中）')
    await expect(views.nth(0)).toHaveAttribute('title', 'ヒートマップに切り替える (V)')
    await expect(heat.locator('.ph .title')).toHaveText('株価ボード')
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
    await expect(heat.locator('.ph .title')).toHaveText('ヒートマップ')
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

test.describe('株価ボードの取り直しとリンク（FR-QB4, FR-QB7, FR-QB8。レビューの指摘）', () => {
  const favScreen = {
    id: 'fav',
    name: { ja: '★の銘柄', en: 'Favorites' },
    conditions: [{ field: 'user.favorite', op: '=', value: true }],
    created: 0,
    updated: 0,
  }
  const boardLayout = (state: Record<string, unknown>) =>
    freeTab(row(pane('heatmap', { qbView: 'board', ...state }, 1), col(pane('chart', {}, 1))))

  test('スクリーニング条件の一覧で★を付け外ししても（条件の取り直し）、読み込み中に戻らず、選んだカードから動かない', async ({ start }) => {
    const wlScreen = {
      id: 'wl',
      name: { ja: '監視の銘柄', en: 'Watch' },
      conditions: [{ field: 'user.watchlist', op: 'in', value: ['watch'] }],
      created: 0,
      updated: 0,
    }
    const { page } = await start({
      layout: boardLayout({ qbSrc: 'scr:wl' }),
      user: { screens: [wlScreen], watchlists: watchlists({ watch: FAVS }) },
    })
    const heat = page.locator('[data-widget="heatmap"]')
    await expect(heat.locator('.grid .card')).toHaveCount(FAVS.length)
    await focusPane(page, heat)
    await keys(page, 'ArrowRight', 'ArrowRight')
    const id = (await heat.locator('.grid .card.sel').getAttribute('data-id'))!
    const seen: number[] = []
    await page.exposeFunction('__qbSkel', (n: number) => seen.push(n))
    await heat.evaluate((el) => {
      new MutationObserver(() =>
        (window as unknown as { __qbSkel: (n: number) => void }).__qbSkel(el.querySelectorAll('.grid .skel').length),
      ).observe(el, { childList: true, subtree: true })
    })
    await keys(page, 'Control+d') // ★を付ける（ウォッチリストが変わり、条件を取り直す）
    await expect(page.locator('.toasts')).toContainText('お気に入り')
    await keys(page, 'Control+d') // 外す
    await expect.poll(() => heat.locator('.grid .card.sel').getAttribute('data-id')).toBe(id)
    await jobsDone(page)
    expect(seen.filter((n) => n > 0)).toEqual([])
    await expect(heat.locator('.grid .card.sel')).toHaveAttribute('data-id', id)
  })

  test('結果があとで届く一覧（スクリーニング条件）へ替えると、届いた一覧の先頭の銘柄をリンクのチャートに送る', async ({ start }) => {
    const { page } = await start({ layout: boardLayout({}), user: { screens: [favScreen], watchlists: watchlists({ favorites: FAVS }) } })
    const heat = page.locator('[data-widget="heatmap"]')
    const chart = page.locator('[data-widget="chart"]').first()
    await expect(heat.locator('.grid .card').first()).toBeVisible()
    await focusPane(page, heat)
    await keys(page, 'Shift+G') // 時価総額の上位 → 最後の出どころ（スクリーニング条件）
    await expect(heat.locator('.tabs button[aria-selected="true"]')).toContainText('★の銘柄')
    await expect(heat.locator('.grid .card')).toHaveCount(FAVS.length)
    const first = (await heat.locator('.grid .card').first().getAttribute('data-id'))!.slice(3)
    await expect(chart.locator('.sym .code')).toHaveText(first)
  })

  test('ツールチップの値は右寄せ（上昇・下落の値も）。「⋯」のメニューに指数のカードと大きさがある', async ({ start }) => {
    const { page } = await start({ layout: boardLayout({}) })
    const heat = page.locator('[data-widget="heatmap"]')
    await expect(heat.locator('.grid .card').first()).toBeVisible()
    const moved = heat.locator('.grid .card.up, .grid .card.down').first()
    await moved.hover()
    const val = page.locator('.tip .tdl .num.up, .tip .tdl .num.down').first()
    await expect(val).toBeVisible()
    expect(await val.evaluate((el) => getComputedStyle(el).textAlign)).toBe('right')
    await page.mouse.move(0, 0)
    // 広いペインでは、指数のカードと大きさを見出しの下のボタンでも操作できる
    await heat.getByRole('button', { name: '指数のカード' }).click()
    await expect(heat.locator('.idx')).toHaveCount(0)
    await heat.getByRole('button', { name: 'カードを大きく' }).click()
    await expect(heat.locator('.grid')).toHaveClass(/s3/)
  })

  test('狭いペインでは、見出しの下で隠れた操作（分類・指数のカード・大きさ）が「⋯」のメニューに入る。大きさは上限・下限で出し分ける', async ({
    start,
  }) => {
    const { page } = await start({
      layout: freeTab(row(pane('heatmap', { qbView: 'board', qbSize: 3 }, 1), pane('chart', {}, 1), pane('chart', {}, 0))),
    })
    const heat = page.locator('[data-widget="heatmap"]')
    await expect(heat.locator('.grid .card').first()).toBeVisible()
    // 見出しの下の分類・指数・大きさのボタンは狭いと隠れる
    await expect(heat.getByRole('button', { name: '分類なし' })).toBeHidden()
    await heat.locator('.ph .more').click()
    const menu = page.getByRole('dialog')
    await expect(menu).toContainText('ヒートマップに切り替える')
    await expect(menu).toContainText('指数のカードを隠す')
    await expect(menu).toContainText('分類: 分類なし')
    // いちばん大きいので「大きく」は出さない
    await expect(menu).not.toContainText('カードを大きく')
    await expect(menu).toContainText('カードを小さく')
    // メニューから分類を変えられる
    await menu.getByText('分類: 分類なし').click()
    await expect(heat.locator('.grid .ghead').first()).toBeVisible()
  })

  test('一覧のタブが多いときは、タブを潰さずに横へ送る', async ({ start }) => {
    const { page } = await start({ layout: boardLayout({}) })
    const heat = page.locator('[data-widget="heatmap"]')
    await expect(heat.locator('.grid .card').first()).toBeVisible()
    const tabs = heat.locator('.tabs')
    const n = await tabs.locator('button').count()
    expect(n).toBeGreaterThan(5)
    // 横に溢れて送れる
    expect(await tabs.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
    // どのタブも名前が読める幅を保つ（24px まで縮まない）
    const widths = await tabs.locator('button').evaluateAll((bs) => bs.map((b) => (b as HTMLElement).offsetWidth))
    expect(Math.min(...widths)).toBeGreaterThan(40)
  })
})

test.describe('株価ボードの操作の細部（FR-QB4, FR-QB7, FR-QB8。Fable のレビュー）', () => {
  const boardLayout = (state: Record<string, unknown> = {}) =>
    freeTab(row(pane('heatmap', { qbView: 'board', ...state }, 1), col(pane('chart', {}, 1))))

  test('「+」キー（Shift が要る配列）でもカードが大きくなる', async ({ start }) => {
    const { page } = await start({ layout: boardLayout() })
    const heat = page.locator('[data-widget="heatmap"]')
    await expect(heat.locator('.grid .card').first()).toBeVisible()
    await focusPane(page, heat)
    await keys(page, 'Shift+Equal')
    await expect(heat.locator('.grid')).toHaveClass(/s3/)
    await keys(page, 'Minus')
    await expect(heat.locator('.grid')).toHaveClass(/s2/)
  })

  test('ツールチップは、右側に置いたペインでもカードの横に出る', async ({ start }) => {
    const { page } = await start({ layout: freeTab(row(col(pane('chart', {}, 1)), pane('heatmap', { qbView: 'board' }, 1))) })
    const heat = page.locator('[data-widget="heatmap"]')
    const card = heat.locator('.grid .card').first()
    await expect(card).toBeVisible()
    await card.hover()
    const tip = page.locator('.tip')
    await expect(tip).toBeVisible()
    const c = (await card.boundingBox())!
    const b = (await tip.boundingBox())!
    expect(b.x).toBeGreaterThanOrEqual(c.x + c.width - 2)
    expect(b.x).toBeLessThan(c.x + c.width + 40)
    await page.mouse.move(0, 0)
  })

  test('溢れたタブはホイールで横に送れる。選んでいるタブは省略しない', async ({ start }) => {
    const { page } = await start({ layout: boardLayout() })
    const heat = page.locator('[data-widget="heatmap"]')
    await expect(heat.locator('.grid .card').first()).toBeVisible()
    const tabs = heat.locator('.tabs')
    await tabs.hover()
    await page.mouse.wheel(0, 300)
    await expect.poll(() => tabs.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0)
    await page.mouse.move(0, 0)
    await focusPane(page, heat)
    // 最後の出どころ（名前の長いスクリーニング条件）を選んでも、その名前は省略しない
    await keys(page, 'Shift+G')
    const sel = heat.locator('.tabs button[aria-selected="true"]')
    expect(await sel.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  })

  test('下へ送ってから並べ替えると、先頭のカードが見える位置まで戻る', async ({ start }) => {
    const { page } = await start({
      layout: freeTab(row(pane('heatmap', { qbView: 'board', qbSize: 3 }, 0), pane('chart', {}, 1), pane('chart', {}, 2))),
    })
    const heat = page.locator('[data-widget="heatmap"]')
    await expect(heat.locator('.grid .card').first()).toBeVisible()
    await focusPane(page, heat)
    await keys(page, 'End')
    await expect.poll(() => heat.locator('.grid').evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
    await keys(page, 's')
    await expect.poll(() => heat.locator('.grid').evaluate((el) => el.scrollTop)).toBe(0)
  })

  test('ほかのペイン（銘柄ジャンプ）でリンク先の銘柄が変わると、一覧にあればそのカードを選ぶ', async ({ start }) => {
    const { page } = await start({ layout: boardLayout() })
    const heat = page.locator('[data-widget="heatmap"]')
    await expect(heat.locator('.grid .card').first()).toBeVisible()
    const id = (await heat.locator('.grid .card').nth(4).getAttribute('data-id'))!
    await focusPane(page, page.locator('[data-widget="chart"]').first())
    await jump(page, id.slice(3))
    await expect(heat.locator('.grid .card.sel')).toHaveAttribute('data-id', id)
  })
})
