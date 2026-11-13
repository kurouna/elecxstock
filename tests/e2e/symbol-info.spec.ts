// 銘柄情報（FR-I1）: 幅が広いときは左に指標、右に配当のグラフ。指標は間延びさせず、グラフは年ごとの合計の細い棒。
// キーで棒を選ぶ・年と回を切り替えられる（FR-KB4）
import { expect, test } from '@playwright/test'
import { keys, launch } from './helpers'

test('銘柄情報: 広いペインでは指標とグラフを左右に並べ、キーで棒を選べる', async () => {
  const { app, page } = await launch()
  await expect(page.getByRole('dialog', { name: /elecxstock/ })).toBeVisible()
  await keys(page, 'Enter', 'Enter')
  await expect(page.locator('footer')).toContainText(/待機/, { timeout: 60_000 })
  await keys(page, 'Control+Shift+Digit5') // トリプル: 下に横長の銘柄情報
  const info = page.locator('[data-widget="info"]')
  await info.click({ position: { x: 200, y: 8 } })
  await keys(page, 'Control+Shift+Enter') // 最大化して横に広げる
  const box = (await info.boundingBox())!
  expect(box.width).toBeGreaterThan(1100)

  // 指標の塊は幅を抑え（ラベルと値が離れない）、グラフはその右
  const metrics = info.locator('.metrics')
  const chart = info.locator('.dchart')
  const mb = (await metrics.boundingBox())!
  const cb = (await chart.boundingBox())!
  expect(mb.width).toBeLessThanOrEqual(640)
  expect(cb.x).toBeGreaterThanOrEqual(mb.x + mb.width - 1)
  expect(cb.height).toBeGreaterThanOrEqual(120)
  // 指標は「配当」「割安度」「値動き」のまとまり。52 週の高値・安値は 1 行
  await expect(metrics).toContainText('配当')
  await expect(metrics).toContainText('割安度')
  await expect(metrics).toContainText('値動き')
  await expect(metrics).toContainText('52週 安値–高値')
  // 価格はペインの見出しにあるので、本文で大きく繰り返さない。権利落ち日の長い一覧も出さない
  await expect(info.locator('.pxl')).toHaveCount(0)
  await expect(info.locator('.exlist .kv')).toHaveCount(0)

  // 既定は年ごとの合計。棒は細く（28px まで）、右（最新）に寄せる
  const bars = chart.locator('.b i')
  await expect(bars.first()).toBeVisible()
  for (const b of await bars.all()) expect((await b.boundingBox())!.width).toBeLessThanOrEqual(28.5)
  await expect(chart.getByRole('button', { name: '年' })).toHaveAttribute('aria-pressed', 'true')

  // ← → で棒を選ぶと詳細が出る。Y で回ごとに切り替える
  await keys(page, 'End')
  await expect(chart.locator('.tip')).toBeVisible()
  await expect(chart.locator('.tip')).toContainText('年')
  await keys(page, 'ArrowLeft')
  await expect(chart.locator('.b.on')).toHaveCount(1)
  // 詳細は選んだ棒の近くに出る（棒は右に寄せてあるので、グラフの幅の比率で置くとずれる）
  const on = (await chart.locator('.b.on').boundingBox())!
  const tip = (await chart.locator('.tip').boundingBox())!
  expect(Math.abs(tip.x + tip.width / 2 - (on.x + on.width / 2))).toBeLessThan(tip.width)
  await keys(page, 'Escape')
  await expect(chart.locator('.tip')).toHaveCount(0)
  await keys(page, 'y')
  await expect(chart.getByRole('button', { name: '回' })).toHaveAttribute('aria-pressed', 'true')
  await keys(page, 'End')
  await expect(chart.locator('.tip')).toContainText('権利落ち日')
  await app.close()
})
