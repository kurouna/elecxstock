// 利回りの変化の内訳（FR-I11。docs/design-yield-breakdown.md）: 銘柄情報の配当の欄。キーボードだけで、読み方（?）・平面（V）・月（← →）・期間（N）・閉じる（Esc）。
// トリプルのタブの銘柄情報は狭いので、V でペインを最大化して開き、Esc で元に戻る。値はスタブ（架空）
import { expect, focusPane, jump, keys, motionDone, tab, test } from './support'

test.describe('利回りの変化の内訳（FR-I11）', () => {
  test('欄（目盛りの言葉・棒 3 本・一言）→ ? で読み方 → V で平面（狭いので最大化）→ ← で月 → N で最長 → Esc で元の大きさ', async ({
    start,
  }) => {
    const { page } = await start()
    await tab(page, 'triple')
    const info = page.locator('[data-widget="info"]').first()
    await focusPane(page, info)
    await jump(page, '8951')
    const yd = info.getByTestId('yd')
    await expect(yd).toBeVisible()
    await expect(yd).toContainText('利回りの変化の内訳')
    await expect(yd).toContainText('← 利回りを下げた')
    await expect(yd.locator('[data-bar]')).toHaveCount(3)
    await expect(yd.getByTestId('yd-caption')).toContainText('利回りは')
    await expect(yd.getByTestId('yd-span')).toContainText('（5 年）')
    // 読み方
    await keys(page, 'Shift+Slash')
    // REIT は分配金（§4）
    await expect(info.getByTestId('yd-tip')).toContainText('利回り = 1口分配金 ÷ 株価')
    await keys(page, 'Escape')
    await expect(info.getByTestId('yd-tip')).toHaveCount(0)
    // 平面: 狭いペインは最大化して開く
    await keys(page, 'v')
    const over = info.getByTestId('yd-overlay')
    await expect(over).toBeVisible()
    await expect(info).toHaveClass(/maxed/)
    await motionDone(page)
    await expect(over.getByTestId('yd-plane').locator('svg')).toBeVisible()
    await expect(over.getByTestId('yd-read')).toContainText('← → で月を選ぶ')
    const dec0 = await over.getByTestId('yd-ovdec').textContent()
    await keys(page, 'ArrowLeft', 'Shift+ArrowLeft')
    await expect(over.getByTestId('yd-read')).toContainText('利回り')
    await expect(over.getByTestId('yd-cross')).toHaveCount(1)
    await expect(over.getByTestId('yd-ovdec')).not.toHaveText(dec0 ?? '')
    // 期間: 最長
    await keys(page, 'n')
    await expect(over.getByRole('radio', { name: '最長' })).toHaveAttribute('aria-checked', 'true')
    // Esc で閉じ、最大化も戻る
    await keys(page, 'Escape')
    await expect(over).toHaveCount(0)
    await motionDone(page)
    await expect(info).not.toHaveClass(/maxed/)
    // 期間は覚えている（欄も最長）
    await expect(yd.getByTestId('yd-span')).not.toContainText('（5 年）')
  })

  test('開いたまま最大化を戻すと層も閉じる。今が無配の 8002 は「内訳を出せません」（欄の高さは同じ）で V は効かない', async ({ start }) => {
    const { page } = await start()
    await tab(page, 'triple')
    const info = page.locator('[data-widget="info"]').first()
    await focusPane(page, info)
    await jump(page, '8951')
    await keys(page, 'v')
    await expect(info.getByTestId('yd-overlay')).toBeVisible()
    await motionDone(page)
    await keys(page, 'Control+Shift+Enter')
    await motionDone(page)
    await expect(info).not.toHaveClass(/maxed/)
    await expect(info.getByTestId('yd-overlay')).toHaveCount(0)
    const h = await info.getByTestId('yd').evaluate((e) => (e as HTMLElement).offsetHeight)
    await jump(page, '8002')
    await expect(info.getByTestId('yd-none')).toContainText('今は無配のため')
    // 欄の高さは変えない（棒と小さな図の場所を取ったまま見えなくする）
    expect(await info.getByTestId('yd').evaluate((e) => (e as HTMLElement).offsetHeight)).toBe(h)
    await keys(page, 'v')
    await expect(info.getByTestId('yd-overlay')).toHaveCount(0)
  })

  test('開いたまま銘柄を替えると新しい銘柄で描き直し、欄の出ない銘柄で閉じて元の大きさ。自分で最大化したペインは、戻すと層も閉じる', async ({
    start,
  }) => {
    const { page } = await start()
    await tab(page, 'triple')
    const info = page.locator('[data-widget="info"]').first()
    await focusPane(page, info)
    await jump(page, '8951')
    await keys(page, 'v')
    const over = info.getByTestId('yd-overlay')
    await expect(over).toContainText('8951')
    await motionDone(page)
    // 数字で銘柄ジャンプ（層の中でも全体のキーは通る）
    await jump(page, '8058')
    await expect(over).toContainText('8058')
    await expect(over.getByTestId('yd-plane').locator('svg')).toBeVisible()
    await jump(page, '8002')
    await expect(over).toHaveCount(0)
    await motionDone(page)
    await expect(info).not.toHaveClass(/maxed/)
    // 先に自分で最大化してから開き、最大化を戻すと層も閉じる
    await jump(page, '8058')
    await keys(page, 'Control+Shift+Enter')
    await motionDone(page)
    await expect(info).toHaveClass(/maxed/)
    await keys(page, 'v')
    await expect(over).toBeVisible()
    await keys(page, 'Control+Shift+Enter')
    await motionDone(page)
    await expect(info).not.toHaveClass(/maxed/)
    await expect(over).toHaveCount(0)
  })
})
