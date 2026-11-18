// 同じリンク色のチャートの同期（FR-K3 十字線・FR-K4 表示期間）。十字線は凡例の日付で、表示期間はチャートの data-range（表示中の論理範囲）で
// 確かめる（キャンバスの中は読めない）。マウスは Playwright の合成の動きだけを使う（実際のカーソルの位置に頼らない）。値はスタブ（架空）
import type { Locator, Page } from '@playwright/test'
import { expect, freeTab, keys, pane, row, test } from './support'

const legendDate = (chart: Locator) => chart.locator('.legend .ohlc span').nth(1)
const dates = async (page: Page) => {
  const charts = page.locator('[data-widget="chart"]')
  const out: string[] = []
  for (let i = 0; i < (await charts.count()); i++) out.push((await legendDate(charts.nth(i)).textContent()) ?? '')
  return out
}
/** 描き直しの 2 フレームを待つ（ライブラリの知らせと、それを受けた側の当てはめが終わるまで。時間では待たない） */
const frames = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))
/** MTF のタブの上の広い日足のチャートへ */
async function topChart(page: Page): Promise<Locator> {
  const chart = page.locator('[data-widget="chart"]').first()
  await keys(page, 'Alt+ArrowRight', 'Alt+ArrowUp')
  await expect(chart).toHaveClass(/focused/)
  return chart
}

test.describe('十字線の同期（FR-K3）', () => {
  test('マウスを日足に載せると週足・月足も合わせ、チャートの外へ出すと消える', async ({ start }) => {
    const { page } = await start()
    const chart = page.locator('[data-widget="chart"]').first()
    await expect(legendDate(chart)).toHaveText(/\d{4}\/\d{2}\/\d{2}/)
    const initial = await dates(page)
    const box = (await chart.locator('.host').boundingBox())!
    await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.4)
    await expect.poll(async () => (await dates(page))[1]).not.toBe(initial[1])
    await expect.poll(async () => (await dates(page))[2]).not.toBe(initial[2])
    await page.mouse.move(0, 0)
    await expect.poll(() => dates(page)).toEqual(initial)
  })

  test('キーボード十字線（X と ← →）でも、週足・月足をその日を含む足に合わせる', async ({ start }) => {
    const { page } = await start()
    const chart = await topChart(page)
    await keys(page, 'x')
    for (let i = 0; i < 12; i++) await keys(page, 'ArrowLeft')
    const day = (await legendDate(chart).textContent())!.replaceAll('/', '-')
    // 週足はその日を含む週（月曜〜）、月足はその月の足
    const [w, m] = (await dates(page)).slice(1).map((s) => s.replaceAll('/', '-'))
    expect(w! <= day).toBe(true)
    expect(Date.parse(day) - Date.parse(w!)).toBeLessThan(7 * 86400_000)
    expect(m!.slice(0, 7)).toBe(day.slice(0, 7))
    // 描き直しのあとも、日足の十字線は動かない（週足・月足から送り返されない）
    await frames(page)
    await frames(page)
    expect((await legendDate(chart).textContent())!.replaceAll('/', '-')).toBe(day)
    await keys(page, 'Escape')
  })
})

test.describe('十字線の同期: 自分のキーボード十字線（FR-K3。レビュー 2 回目）', () => {
  test('週足で X の十字線を出したまま、日足で X を出して消しても、週足の十字線は自分の位置に戻る', async ({ start }) => {
    const { page } = await start()
    await topChart(page)
    const weekly = page.locator('[data-widget="chart"]').nth(1)
    await keys(page, 'Alt+ArrowDown')
    await expect(weekly).toHaveClass(/focused/)
    await keys(page, 'x', 'ArrowLeft', 'ArrowLeft', 'ArrowLeft')
    const w = await legendDate(weekly).textContent()
    await keys(page, 'Alt+ArrowUp', 'x', 'x')
    await expect(legendDate(weekly)).toHaveText(w!)
  })
})

test.describe('表示期間の同期（FR-K4）', () => {
  const range = async (c: Locator) =>
    JSON.parse((await c.locator('.host').getAttribute('data-range')) ?? 'null') as { from: number; to: number } | null
  test('同じリンク色・同じ時間軸で「表示期間をそろえる」にしたチャートは、片方の表示期間に合わせ、送り返して戻さない', async ({
    start,
  }) => {
    const both = { tf: 'D', syncRange: true, sym: 'JP:7203' }
    const { page } = await start({ layout: freeTab(row(pane('chart', both, 1), pane('chart', both, 1))) })
    const [left, right] = [page.locator('[data-widget="chart"]').nth(0), page.locator('[data-widget="chart"]').nth(1)]
    await expect(left.locator('.host')).toHaveAttribute('data-range', /from/)
    for (let i = 0; i < 4 && !(await left.getAttribute('class'))?.includes('focused'); i++) await keys(page, 'F6')
    await expect(left).toHaveClass(/focused/)
    // 拡大（+）を 2 回: 右も同じ期間になる
    const l0 = (await range(left))!
    await keys(page, 'NumpadAdd', 'NumpadAdd')
    // 拡大を当てはめたあと（左端が右へ動く）の範囲を読む
    await expect.poll(async () => (await range(left))!.from).toBeGreaterThan(l0.from + 1)
    const l1 = (await range(left))!
    await expect.poll(async () => Math.round((await range(right))!.from)).toBe(Math.round(l1.from))
    // 既定の期間（0）は右に余白を取る。右のチャートから送り返されても、左の余白は消えない
    await keys(page, 'Digit0')
    // 既定の期間は右端の足より 3 本先まで（右の余白）。当てはめを待つ
    // （拡大で狭めた期間が既定の幅へ戻る）
    await expect.poll(async () => (await range(left))!.from).toBeLessThan(l1.from - 1)
    const l2 = (await range(left))!
    // 右のチャートが同じ範囲になり、送り返しがあればそのあとに届く。そのあとも左の余白は残る
    await expect.poll(async () => Math.round((await range(right))!.to)).toBe(Math.round(l2.to))
    await frames(page)
    await frames(page)
    expect((await range(left))!.to).toBeCloseTo(l2.to, 3)
  })
})
