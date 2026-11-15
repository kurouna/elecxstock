// マーケット（ヒートマップ・ランキング）と配当カレンダー（§6.4 のプリセット、FR-V13）。値はスタブ（架空）
import type { Locator } from '@playwright/test'
import { expect, focusPane, keys, readUser, tab, test, watchlists } from './support'

const tip = async (l: Locator, text: RegExp) => {
  await expect(l).toHaveAttribute('title', text)
  expect(await l.getAttribute('title')).toMatch(/\S \(.+\)$/)
}

test.describe('マーケット（FR-L5, FR-V13）', () => {
  test('ヒートマップ（33 業種）の中へ Enter で入り Esc で戻る。期間は「騰落率」の期間と分かる', async ({ start }) => {
    const { page } = await start()
    await tab(page, 'market')
    const heat = page.locator('[data-widget="heatmap"]')
    await expect(heat.locator('.map .cell').first()).toBeVisible()
    await expect(heat.locator('.lbl')).toContainText('騰落率')
    await tip(heat.getByRole('button', { name: '1か月' }), /騰落率の期間 \(P\)/)
    // ★だけ表示はどのペインも同じ名前とキー
    await tip(heat.getByRole('button', { name: '★のみ表示' }), /★のみ表示 \(Ctrl\+Shift\+F\)/)
    await tip(page.locator('[data-widget="ranking"]').getByRole('button', { name: '★のみ表示' }), /Ctrl\+Shift\+F/)
    // 業種の中へ（Enter）→ 戻る（Esc）。左の列のウォッチリストから右のヒートマップへ
    await keys(page, 'Alt+ArrowRight')
    await expect(page.locator('.pane.focused')).toHaveAttribute('data-widget', 'heatmap')
    const sectors = await heat.locator('.map .cell').count()
    await keys(page, 'ArrowRight', 'Enter')
    await expect.poll(() => heat.locator('.map .cell').count()).not.toBe(sectors)
    await expect(heat.locator('.map .cell').first()).toBeVisible()
    await keys(page, 'Escape')
    await expect.poll(() => heat.locator('.map .cell').count()).toBe(sectors)
  })
})

test.describe('配当カレンダー（§6.4 インカム）', () => {
  test('9 銘柄以上の月も全部を選べる', async ({ start }) => {
    // お気に入りに 10 銘柄を入れておく（カレンダーはすべてのウォッチリストの銘柄を並べる。権利月はスタブの架空の値）
    const codes = ['7203', '8058', '8306', '9434', '8053', '8766', '5401', '6501', '7974', '4063']
    const { page } = await start({
      user: { watchlists: watchlists({ favorites: codes }) },
    })
    await tab(page, 'income')
    const cal = page.locator('[data-widget="divcal"]')
    await expect(cal).toBeVisible()
    await expect.poll(async () => Math.max(...(await cal.locator('.m h5 .num').allTextContents()).map(Number))).toBeGreaterThan(8)
    const counts = await cal.locator('.m h5 .num').allTextContents()
    const mi = counts.findIndex((c) => Number(c) > 8)
    const month = cal.locator('.m').nth(mi)
    await expect(month.locator('.row')).toHaveCount(Number(counts[mi]))
  })
})

test.describe('マーケットの指数のチャート（§6.3 market-overview・§6.5.6・FR-G3）', () => {
  /** 保存したレイアウトの market-overview の状態 */
  const saved = (userData: string) => {
    const doc = readUser<{ entries: Record<string, unknown> }>(userData, 'layout')
    const m = JSON.stringify(doc.entries.market).match(/"widget":"market"[^}]*"state":(\{[^}]*\})/)
    return m ? (JSON.parse(m[1]!) as { period?: number; tf?: string }) : null
  }
  test('Alt+1〜6 で表示期間を選べ、見出しの選択に出て、再起動しても残る', async ({ start }) => {
    const first = await start()
    await tab(first.page, 'market')
    const mkt = first.page.locator('[data-widget="market"]')
    const picker = mkt.locator('select.period')
    // 既定は時間軸ごとの本数（チャートと同じ「既定」）
    await expect(picker).toHaveValue('-1')
    await focusPane(first.page, mkt)
    await keys(first.page, 'Alt+Digit3')
    await expect(picker).toHaveValue('2') // 1 年
    await keys(first.page, 'KeyW')
    await expect(mkt.getByRole('button', { name: 'W', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(picker).toHaveValue('2') // 時間軸を変えても期間は残る
    await expect(mkt.locator('canvas').first()).toBeVisible()
    await expect.poll(() => saved(first.userData)).toMatchObject({ period: 2, tf: 'W' })
    await first.app.close()
    const second = await start({ userData: first.userData })
    await tab(second.page, 'market')
    await expect(second.page.locator('[data-widget="market"] select.period')).toHaveValue('2')
  })
})
