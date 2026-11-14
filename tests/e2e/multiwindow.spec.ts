// マルチモニタ（docs/design-multimonitor.md）: タブなしのフリー N。キーだけで開く・足す・送る・リンク・★・窓の移動・再起動
import { type ElectronApplication, expect, type Page, test } from '@playwright/test'
import { keys, launch } from './helpers'

type Info = { open: string[]; active: string; self: string | null }
const info = (p: Page) =>
  p.evaluate(() => (window as unknown as { elecxstock: { windowInfo: () => Promise<Info> } }).elecxstock.windowInfo())

async function ready(page: Page) {
  await expect(page.getByRole('dialog', { name: /elecxstock/ })).toBeVisible()
  await keys(page, 'Enter', 'Enter')
  await expect(page.locator('footer')).toContainText(/待機/, { timeout: 60_000 })
}
/** Ctrl+Alt+N で開き、初期の形を選ぶ（label の行で Enter） */
async function openFree(app: ElectronApplication, page: Page, label: string): Promise<Page> {
  const next = app.waitForEvent('window')
  await keys(page, 'Control+Alt+n')
  const dlg = page.locator('.dialog')
  await expect(dlg).toContainText('初期の形')
  await dlg.getByText(label, { exact: true }).click()
  const w = await next
  await w.waitForLoadState('domcontentloaded')
  await w.setViewportSize({ width: 1400, height: 900 }).catch(() => {})
  await expect(w.locator('.wname')).toBeVisible({ timeout: 20_000 })
  return w
}

test('フリー 2: キーで開き、銘柄ジャンプで足し、タブ・設定は 1 枚目だけ', async () => {
  const { app, page } = await launch()
  await ready(page)
  // タイトルバーのボタンでも開ける（Ctrl+Alt+N と同じダイアログ）
  await page.getByRole('button', { name: '新しいウィンドウ（フリー）を開く' }).click()
  await expect(page.locator('.dialog')).toContainText('初期の形')
  await keys(page, 'Escape')
  const free = await openFree(app, page, 'チャートグリッド')
  await expect(free.locator('.wname')).toHaveText('フリー 2')
  await expect(free.locator('.presets')).toHaveCount(0)
  const grid = free.locator('[data-widget="grid"]')
  await expect(grid).toBeVisible()
  // 銘柄ジャンプで足す（フリー 2 の中で完結）
  await grid.click({ position: { x: 200, y: 200 } })
  await keys(free, 'Digit8', 'Digit0', 'Digit5', 'Digit8')
  await expect(free.locator('.dialog.jump')).toContainText('三菱商事')
  await keys(free, 'Enter')
  await expect(grid.locator('.tile').first()).toContainText('8058')
  // タブの切り替え・設定は使えない（理由を知らせる）
  await keys(free, 'Control+Shift+Digit1')
  await expect(free.locator('.toasts')).toContainText('フリーのウィンドウでは使えません')
  // ペインの種類はチャートを並べるものだけ
  await keys(free, 'Control+Shift+n')
  await expect(free.locator('.dialog')).not.toContainText('ウォッチリスト')
  await keys(free, 'Escape')
  // Ctrl+F6 で窓を移る（OS の前面ではなく main の「いま前にある窓」で確かめる）
  await keys(page, 'Control+F6')
  await expect.poll(async () => (await info(page))?.active).toBe('free2')
  await keys(free, 'Control+F6')
  await expect.poll(async () => (await info(page))?.active).toBe('main')
  await app.close()
})

test('フリー 2: キーで送る・★は 1 枚目に届く・リンク色を付けると 1 枚目の銘柄を追う・再起動で戻る', async () => {
  const first = await launch()
  const { app, page } = first
  await ready(page)
  const free = await openFree(app, page, '4 分割')
  const charts = free.locator('[data-widget="chart"]')
  await expect(charts).toHaveCount(4)

  // 1 枚目の MTF（リンク 1）で 8306 を表示 → Ctrl+Alt+Enter でフリー 2 へ送る（フォーカス中のチャートが変わる）
  await charts.first().click({ position: { x: 200, y: 150 } })
  await keys(page, 'Control+Shift+Digit4')
  await page
    .locator('[data-widget="chart"]')
    .first()
    .click({ position: { x: 300, y: 200 } })
  await keys(page, 'Digit8', 'Digit3', 'Digit0', 'Digit6')
  await expect(page.locator('.dialog.jump')).toContainText('三菱UFJ')
  await keys(page, 'Enter')
  await keys(page, 'Control+Alt+Enter')
  await expect(page.locator('.toasts')).toContainText('フリー 2 へ 1 銘柄を送りました')
  await expect(charts.first()).toContainText('8306')

  // フリー 2 で★（Ctrl+D）→ 1 枚目のお気に入りに入る
  await charts.first().click({ position: { x: 200, y: 150 } })
  await keys(free, 'Control+d')
  await expect(free.locator('.toasts')).toContainText('お気に入りに')
  await keys(page, 'Control+Shift+Digit4')
  await expect(page.locator('[data-widget="watchlist"]').first().locator('tbody')).toContainText('8306')

  // フリー 2 の 2 枚目のチャートにリンク色 1 を付けると、1 枚目で選んだ銘柄を追う（R3）
  await charts.nth(1).click({ position: { x: 200, y: 150 } })
  await keys(free, 'Control+Digit1')
  await page
    .locator('[data-widget="chart"]')
    .first()
    .click({ position: { x: 300, y: 200 } })
  await keys(page, 'Digit9', 'Digit4', 'Digit3', 'Digit2')
  await expect(page.locator('.dialog.jump')).toContainText('9432')
  await keys(page, 'Enter')
  await expect(charts.nth(1)).toContainText('9432')

  // 再起動: フリー 2 が開き直し、並び（4 枚・送った銘柄）が残る（終了の前に main が全窓の保存を待つので、待たずに閉じる）
  await app.close()
  const second = await launch({ userData: first.userData })
  await expect.poll(() => second.app.windows().length, { timeout: 20_000 }).toBe(2)
  const again = second.app.windows().find((w) => w.url().includes('w=free2'))!
  await expect(again.locator('[data-widget="chart"]')).toHaveCount(4)
  await expect(again.locator('[data-widget="chart"]').first()).toContainText('8306')
  await second.app.close()
})

test('フリーのウィンドウが無いときに送ると、グリッドで開いて銘柄が並ぶ（R4）', async () => {
  const { app, page } = await launch()
  await ready(page)
  await keys(page, 'Control+Shift+Digit4')
  await page
    .locator('[data-widget="chart"]')
    .first()
    .click({ position: { x: 300, y: 200 } })
  await keys(page, 'Digit8', 'Digit0', 'Digit5', 'Digit8')
  await expect(page.locator('.dialog.jump')).toContainText('三菱商事')
  await keys(page, 'Enter')
  const next = app.waitForEvent('window')
  await keys(page, 'Control+Alt+Enter')
  const free = await next
  await expect(free.locator('[data-widget="grid"] .tile').first()).toContainText('8058', { timeout: 20_000 })
  // 初期の形は 1 度だけ（URL から外れる）
  expect(free.url()).not.toContain('shape=')
  await app.close()
})

test('フリー 2: このウィンドウだけ文字を大きくでき、メモリを測る（R2・R4）', async () => {
  const { app, page } = await launch()
  await ready(page)
  const free = await openFree(app, page, 'チャートグリッド')
  await free.locator('[data-widget="grid"]').click({ position: { x: 200, y: 200 } })
  await keys(free, 'Control+Alt+Equal')
  // 窓ごとの倍率は CSS の zoom（Chromium のズームは同じオリジンの窓で共有されるため）
  const z = (p: Page) => p.evaluate(() => document.documentElement.style.zoom)
  const zooms = async () => [await z(page), await z(free)]
  await expect.poll(zooms).toEqual(['1', '1.1'])
  await keys(free, 'Control+Alt+Digit0')
  await expect.poll(zooms).toEqual(['1', '1'])
  // メモリ（docs/decisions.md に記録する）: renderer 1 つあたりの作業セット
  await page.waitForTimeout(1500)
  const mem = await app.evaluate(({ app: a }) =>
    a.getAppMetrics().map((m) => ({ type: m.type, mb: Math.round(m.memory.workingSetSize / 1024) })),
  )
  console.log('MEMORY', JSON.stringify(mem))
  await app.close()
})
