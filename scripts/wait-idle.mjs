// 取得のジョブが終わるまで待つ（スクリプト共通）。状態の帯の「待機中」はジョブを積む前にも出るので、Core にジョブを聞いて待つ
export async function waitIdle(page, timeout = 120_000) {
  const t0 = Date.now()
  for (;;) {
    const js = await page.evaluate(() => window.elecxstock.call('jobs.list', {})).catch(() => [])
    if (js.length && js.every((j) => j.status === 'done' || j.status === 'failed' || j.status === 'cancelled')) break
    if (Date.now() - t0 > timeout) throw new Error('jobs did not finish')
    await new Promise((r) => setTimeout(r, 100))
  }
  await page
    .locator('footer')
    .getByText(/待機|Idle/)
    .waitFor({ timeout })
}
