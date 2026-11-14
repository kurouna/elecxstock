// 銘柄情報（FR-I1〜I4・I6〜I9）: 枠の幅で並びを変える（広いときは 1 段目に値段と主な数字、2 段目に配当と値動き）。
// 配当のグラフはキーで棒を選び、年と回を切り替えられる（FR-KB4）。値はスタブ（架空）
import { expect, type Page, test } from '@playwright/test'
import { keys, launch } from './helpers'

async function ready(page: Page) {
  await expect(page.getByRole('dialog', { name: /elecxstock/ })).toBeVisible()
  await keys(page, 'Enter', 'Enter')
  await expect(page.locator('footer')).toContainText(/待機/, { timeout: 60_000 })
}
const box = async (l: import('@playwright/test').Locator) => (await l.boundingBox())!

test('銘柄情報: 広いペインでは値段と主な数字を横に並べ、配当のグラフはキーで棒を選べる', async () => {
  const { app, page } = await launch()
  await ready(page)
  await keys(page, 'Control+Shift+Digit5') // トリプル: 下に横長の銘柄情報
  const info = page.locator('[data-widget="info"]')
  await info.locator('.meta').click() // 見出しの銘柄名は押すと銘柄を変える画面が開くので、本文を押す
  await keys(page, 'Control+Shift+Enter') // 最大化して横に広げる
  expect((await box(info)).width).toBeGreaterThan(1100)

  // 1 段目: 値段の欄（左）と主な数字・予定（右）。2 段目: 配当（左）と値動きなど（右）
  const hero = await box(info.locator('.hero'))
  const tiles = await box(info.locator('.tiles'))
  const div = await box(info.locator('.c-div'))
  const tech = await box(info.locator('.c-tech'))
  expect(tiles.x).toBeGreaterThanOrEqual(hero.x + hero.width - 1)
  expect(div.y).toBeGreaterThanOrEqual(hero.y + hero.height - 1)
  expect(tech.x).toBeGreaterThanOrEqual(div.x + div.width - 1)
  // 主な数字は 4 つ。値段・52 週・当日の値
  await expect(info.locator('.tile')).toHaveCount(4)
  await expect(info.locator('.tiles')).toContainText('実績利回り')
  await expect(info.locator('.hero')).toContainText('52週高値')
  await expect(info.locator('.hero .ohlc')).toContainText('前日終値')
  // 予定: 次の決算発表（スタブは推定）と権利付最終日（目安）。あと何日か
  await expect(info.locator('.ev')).toContainText('決算発表')
  await expect(info.locator('.ev')).toContainText('推定')
  await expect(info.locator('.ev')).toContainText(/権利付最終日 .* 目安 あと \d+ 日/)
  // 値動き: 値段と配当込みの騰落率
  await expect(info.locator('.c-tech')).toContainText('配当込み')
  await expect(info.locator('.c-tech')).toContainText('最大下落')

  // 配当のグラフ: 既定は年ごとの合計。棒は 52px まで、年の札が見える
  const chart = info.locator('.dchart')
  const bars = chart.locator('.b i')
  await expect(bars.first()).toBeVisible()
  for (const b of await bars.all()) expect((await box(b)).width).toBeLessThanOrEqual(52.5)
  await expect(chart.locator('.y').last()).toBeVisible()
  await expect(chart.getByRole('button', { name: '年' })).toHaveAttribute('aria-pressed', 'true')
  // ← → で棒を選ぶと詳細が出る。Y で回ごとに切り替える
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
  await app.close()
})

test('銘柄情報: 保有は値段の欄の帯とカードに出し、縦長の細い枠では 1 列に並べる', async () => {
  const { app, page } = await launch()
  await ready(page)
  // 7203 を保有する（保有タブを開くと読み込む）
  await page.evaluate(async () => {
    const meta = { broker: 'rakuten', importedAt: '2026-11-14T00:00:00Z', realized: null, dividends: null }
    await (window as unknown as { elecxstock: { call: (m: string, p: unknown) => Promise<unknown> } }).elecxstock.call(
      'portfolio.applyCsv',
      { holdings: [{ code: '7203', account: 'tokutei', quantity: 100, avgCost: 2500 }], meta },
    )
  })
  await keys(page, 'Control+Shift+Digit7', 'Control+Shift+Digit2') // 保有 → スクリーナー（左の列が縦長）
  const info = page.locator('[data-widget="info"]')
  await expect(info).toContainText('7203')
  // 保有の帯（損益・取得利回り・年間配当の見込み）とカード
  const bar = info.locator('.heldbar')
  await expect(bar).toContainText('100')
  await expect(bar).toContainText('評価損益')
  await expect(bar).toContainText('年間配当の見込み')
  await expect(info.locator('section.held')).toContainText('取得単価')
  // 幅で並びが変わる: 700px 未満は 1 列（値段の欄 → 主な数字 → 予定 → 配当）、700px からは右に配当
  const check = async () => {
    const w = (await box(info.locator('.si'))).width
    const hero = await box(info.locator('.hero'))
    const tiles = await box(info.locator('.tiles'))
    const div = await box(info.locator('.c-div'))
    expect(tiles.y).toBeGreaterThan(hero.y)
    expect(Math.abs(tiles.x - hero.x)).toBeLessThan(2)
    if (w < 700) expect(div.y).toBeGreaterThan(tiles.y)
    else expect(div.x).toBeGreaterThan(hero.x + hero.width - 1)
    return w
  }
  const wide = await check()
  // 窓を狭くして、1 列になることも確かめる
  await page.setViewportSize({ width: 1000, height: 960 })
  await expect.poll(async () => (await box(info.locator('.si'))).width).toBeLessThan(700)
  expect(await check()).toBeLessThan(wide)
  // 業種の中央値と比べる（スタブの卸売業は 5 銘柄）。銘柄ジャンプで 8058 にする
  await info.locator('.meta').click()
  await keys(page, 'Digit8', 'Digit0', 'Digit5', 'Digit8', 'Enter')
  await expect(info.locator('.sym')).toContainText('8058')
  await expect(info.locator('.tiles')).toContainText(/業種 [\d.]+%（[+−±]\d+%）/)
  // ↓ と PageDown で本文を縦にスクロールする（マウスを使わずに下のカードまで見る。FR-KB4）
  const scroller = info.locator('.scroll')
  expect(await scroller.evaluate((e) => e.scrollTop)).toBe(0)
  await keys(page, 'PageDown')
  await expect.poll(() => scroller.evaluate((e) => e.scrollTop)).toBeGreaterThan(100)
  await keys(page, 'PageUp', 'PageUp')
  await expect.poll(() => scroller.evaluate((e) => e.scrollTop)).toBe(0)
  // 注釈は (i) のボタンに入れる
  await expect(info.getByRole('button', { name: '説明', exact: true })).toHaveAttribute('title', /過去12か月/)
  await expect(info.getByRole('button', { name: '説明', exact: true })).toHaveAttribute('title', /業種/)
  await app.close()
})
