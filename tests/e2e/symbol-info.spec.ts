// 銘柄情報（FR-I1〜I4・I6〜I9）: 枠の幅で並びを変える（広いときは 1 段目に値段と主な数字、2 段目に配当と値動き）。
// 配当のグラフはキーで棒を選び、年と回を切り替えられる（FR-KB4）。値はスタブ（架空）
import type { Locator, Page } from '@playwright/test'
import { expect, focusPane, freeTab, holdings, jump, keys, pane, row, rpc, tab, test } from './support'

const box = async (l: Locator) => (await l.boundingBox())!
const info = (page: Page) => page.locator('[data-widget="info"]')

test.describe('並び（FR-I6）', () => {
  test('広いペインでは値段と主な数字を横に並べ、予定と値動きを出す', async ({ start }) => {
    const { page } = await start()
    await tab(page, 'triple') // 下に横長の銘柄情報
    const si = info(page)
    await si.locator('.meta').click() // 見出しの銘柄名は押すと銘柄を変える画面が開くので、本文を押す
    await expect(si).toHaveClass(/focused/)
    await keys(page, 'Control+Shift+Enter') // 最大化して横に広げる
    await expect.poll(async () => (await box(si)).width).toBeGreaterThan(1100)

    // 1 段目: 値段の欄（左）と主な数字・予定（右）。2 段目: 配当（左）と値動きなど（右）
    const hero = await box(si.locator('.hero'))
    const tiles = await box(si.locator('.tiles'))
    const div = await box(si.locator('.c-div'))
    const tech = await box(si.locator('.c-tech'))
    expect(tiles.x).toBeGreaterThanOrEqual(hero.x + hero.width - 1)
    expect(div.y).toBeGreaterThanOrEqual(hero.y + hero.height - 1)
    expect(tech.x).toBeGreaterThanOrEqual(div.x + div.width - 1)
    // 主な数字は 4 つ。値段・52 週・当日の値
    await expect(si.locator('.tile')).toHaveCount(4)
    await expect(si.locator('.tiles')).toContainText('実績利回り')
    await expect(si.locator('.hero')).toContainText('52週高値')
    await expect(si.locator('.hero .ohlc')).toContainText('前日終値')
    // 予定: 次の決算発表（スタブは推定）と権利付最終日（目安）。あと何日か（FR-I8, I9）
    await expect(si.locator('.ev')).toContainText('決算発表')
    await expect(si.locator('.ev')).toContainText('推定')
    await expect(si.locator('.ev')).toContainText(/権利付最終日 .* 目安 あと \d+ 日/)
    // 値動き: 値段と配当込みの騰落率
    await expect(si.locator('.c-tech')).toContainText('配当込み')
    await expect(si.locator('.c-tech')).toContainText('最大下落')
  })

  test('保有は値段の欄の帯とカードに出し、縦長の細い枠では 1 列に並べる', async ({ start }) => {
    const { page } = await start({ user: { holdings: holdings([{ code: '7203', quantity: 100, avgCost: 2500 }]) } })
    await tab(page, 'screener') // 左の列が縦長
    const si = info(page)
    await expect(si).toContainText('7203')
    // 保有の帯（損益・取得利回り・年間配当の見込み）とカード
    const bar = si.locator('.heldbar')
    await expect(bar).toContainText('100')
    await expect(bar).toContainText('評価損益')
    await expect(bar).toContainText('年間配当の見込み')
    await expect(si.locator('section.held')).toContainText('取得単価')
    // 幅で並びが変わる: 700px 未満は 1 列（値段の欄 → 主な数字 → 予定 → 配当）、700px からは右に配当
    const check = async () => {
      const w = (await box(si.locator('.si'))).width
      const hero = await box(si.locator('.hero'))
      const tiles = await box(si.locator('.tiles'))
      const div = await box(si.locator('.c-div'))
      expect(tiles.y).toBeGreaterThan(hero.y)
      expect(Math.abs(tiles.x - hero.x)).toBeLessThan(2)
      if (w < 700) expect(div.y).toBeGreaterThan(tiles.y)
      else expect(div.x).toBeGreaterThan(hero.x + hero.width - 1)
      return w
    }
    const wide = await check()
    // 窓を狭くして、1 列になることも確かめる
    await page.setViewportSize({ width: 1000, height: 960 })
    await expect.poll(async () => (await box(si.locator('.si'))).width).toBeLessThan(700)
    expect(await check()).toBeLessThan(wide)
  })

  test('業種の中央値と比べ、↓ と PageDown で本文を縦にスクロールする。注釈は (i) のボタン', async ({ start }) => {
    const { page } = await start()
    await tab(page, 'screener')
    const si = info(page)
    // 業種の中央値と比べる（スタブの卸売業は 5 銘柄）。銘柄ジャンプで 8058 にする（FR-I7）
    await si.locator('.meta').click()
    await expect(si).toHaveClass(/focused/)
    await jump(page, '8058')
    await expect(si.locator('.sym')).toContainText('8058')
    await expect(si.locator('.tiles')).toContainText(/業種 [\d.]+%（[+−±]\d+%）/)
    // ↓ と PageDown で本文を縦にスクロールする（マウスを使わずに下のカードまで見る。FR-KB4）
    const scroller = si.locator('.scroll')
    expect(await scroller.evaluate((e) => e.scrollTop)).toBe(0)
    await keys(page, 'PageDown')
    await expect.poll(() => scroller.evaluate((e) => e.scrollTop)).toBeGreaterThan(100)
    await keys(page, 'PageUp', 'PageUp')
    await expect.poll(() => scroller.evaluate((e) => e.scrollTop)).toBe(0)
    // 注釈は (i) のボタンに入れる
    const help = si.getByRole('button', { name: '説明', exact: true })
    await expect(help).toHaveAttribute('title', /過去12か月/)
    await expect(help).toHaveAttribute('title', /業種/)
    // 取り直すはアイコンのボタン（FR-V13）
    const refetch = si.getByRole('button', { name: '取り直す', exact: true })
    await expect(refetch).toHaveAttribute('title', /Shift\+F5/)
    expect(((await refetch.textContent()) ?? '').replace(/[\s\d]/g, '').length).toBeLessThanOrEqual(1)
  })

  test('見出しの銘柄名もチャートと同じく押して変えられる（C）', async ({ start }) => {
    const { page } = await start()
    await tab(page, 'screener')
    await info(page).locator('button.sym').click()
    await expect(page.locator('.dialog.palette')).toContainText('の代わりに表示する銘柄')
    await keys(page, 'Escape')
    await expect(page.locator('.dialog.palette')).toHaveCount(0)
  })
})

test.describe('配当のグラフ（FR-I6, FR-KB4）', () => {
  test('既定は年ごとの合計。← → で棒を選ぶと詳細が出て、Y で回ごとに切り替える', async ({ start }) => {
    const { page } = await start()
    await tab(page, 'triple')
    const si = info(page)
    await si.locator('.meta').click()
    await expect(si).toHaveClass(/focused/)
    await keys(page, 'Control+Shift+Enter')
    const chart = si.locator('.dchart')
    const bars = chart.locator('.b i')
    await expect(bars.first()).toBeVisible()
    // 棒は 52px まで、年の札が見える
    for (const b of await bars.all()) expect((await box(b)).width).toBeLessThanOrEqual(52.5)
    await expect(chart.locator('.y').last()).toBeVisible()
    await expect(chart.getByRole('button', { name: '年' })).toHaveAttribute('aria-pressed', 'true')
    await keys(page, 'End')
    await expect(chart.locator('.tip')).toBeVisible()
    await keys(page, 'ArrowLeft')
    await expect(chart.locator('.b.on')).toHaveCount(1)
    const on = await box(chart.locator('.b.on'))
    const tip = await box(chart.locator('.tip'))
    expect(Math.abs(tip.x + tip.width / 2 - (on.x + on.width / 2))).toBeLessThan(tip.width)
    await keys(page, 'Escape')
    await expect(chart.locator('.tip')).toHaveCount(0)
    await keys(page, 'y')
    await expect(chart.getByRole('button', { name: '回' })).toHaveAttribute('aria-pressed', 'true')
    await keys(page, 'End')
    await expect(chart.locator('.tip')).toContainText('権利落ち日')
  })

  test('棒に金額が出て、ポインタを載せると詳細が出る（年ごと → 回ごとでは権利落ち日）', async ({ start }) => {
    const { page } = await start()
    await tab(page, 'income')
    const bars = page.locator('.dchart')
    await expect(bars.locator('.bv.show').first()).toBeVisible()
    await bars.locator('.b').last().hover()
    await expect(bars.locator('.tip')).toContainText('年')
    await bars.getByRole('button', { name: '回' }).click()
    await bars.locator('.b').last().hover()
    await expect(bars.locator('.tip')).toContainText('権利落ち日')
  })
})

test.describe('値動きの表の幅（FR-V12）', () => {
  test('どの幅でも、値動きの表の数字がカードからはみ出さない（騰落率が 100% を超える銘柄で）', async ({ start }) => {
    const { page } = await start({ layout: freeTab(row(pane('info'), pane('chart'))) })
    // 騰落率の大きい銘柄（3 桁の %）を出す
    const all = await rpc<{ id: string; market: string }[]>(page, 'instruments.all')
    const ms = await rpc<{ id: string; ret3y: number | null }[]>(page, 'metrics.get', {
      ids: all.filter((i) => i.market === 'P' || i.market === 'R').map((i) => i.id),
    })
    const big = ms.filter((m) => m.ret3y != null).sort((a, b) => Math.abs(b.ret3y!) - Math.abs(a.ret3y!))[0]!
    await focusPane(page, page.locator('[data-widget="chart"]'))
    await jump(page, big.id.slice(3))
    const card = info(page).locator('.card.c-tech')
    await expect(card.locator('.rt td').nth(4)).toContainText('%')
    // 窓の幅を変えて、銘柄情報のペイン（窓の半分）を 800px から 400px まで細くする
    for (let w = 1600; w >= 800; w -= 40) {
      await page.setViewportSize({ width: w, height: 960 })
      const over = await card.evaluate((c) => {
        const t = c.querySelector('.rt') as HTMLElement
        return Math.round(t.getBoundingClientRect().right - c.getBoundingClientRect().right)
      })
      expect(over, `窓の幅 ${w}px`).toBeLessThanOrEqual(0)
    }
  })
})
