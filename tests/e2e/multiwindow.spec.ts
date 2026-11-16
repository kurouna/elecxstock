// マルチモニタ（FR-L7, docs/design-multimonitor.md）: タブなしのフリー N。キーで開く・足す・送る・リンク・★・窓の移動・再起動・アラート。
// OS の窓とフォーカスに頼るので、並列のあとの直列の project で回す
import type { ElectronApplication, Page } from '@playwright/test'
import { expect, expectDraggableTitleBar, jump, keys, pane, readUser, resizeWindow, tab, test, type } from './support'

/** userData に保存したフリー 2 の配置に出てくる銘柄（並びの順） */
const savedFree2 = (userData: string) =>
  JSON.stringify(readUser<{ windows?: { free2?: unknown } }>(userData, 'layout').windows?.free2 ?? null).match(/JP:\w+/g) ?? []

type Info = { open: string[]; active: string; self: string | null }
const info = (p: Page) =>
  p.evaluate(() => (window as unknown as { elecxstock: { windowInfo: () => Promise<Info> } }).elecxstock.windowInfo())

/** Ctrl+Alt+N で開き、初期の形を選ぶ */
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
  await expect(w.locator('.main [data-pane-id]').first()).toBeVisible()
  return w
}

test.describe('フリー N でマイレイアウトのページを開く（FR-L7, FR-L14）', () => {
  test('ページの写しを開き（一覧はチャートにして知らせる）、初期状態に戻すとページの今の中身を写し直す', async ({ start }) => {
    const { app, page } = await start()
    // MTF のタブを写して「朝」のページを作る（メニューの「今のタブを写して足す」は削除の 1 つ上）
    await tab(page, 'mtf')
    await keys(page, 'Control+Shift+l', 'End', 'ArrowUp', 'Enter')
    await type(page, '朝')
    await keys(page, 'Enter')
    await expect(page.locator('.presets [aria-current="true"]')).toContainText('朝')
    const free = await openFree(app, page, 'マイレイアウト: 朝')
    const panes = free.locator('.main [data-pane-id]')
    // MTF の 5 枚（ウォッチリスト・スクリーナーはフリー N に置けないのでチャートに）
    await expect(panes).toHaveCount(5)
    await expect(free.locator('.main [data-widget="chart"]')).toHaveCount(5)
    await expect(free.locator('.toasts')).toContainText('チャートにするか外しました')
    // 1 枚閉じてから（開いたときに最初のペインにフォーカスがある）初期状態に戻すと、ページの中身を写し直す。確認には窓の名前と元のページを出す
    await keys(free, 'Control+Shift+w')
    await expect(panes).toHaveCount(4)
    await keys(free, 'Control+k')
    await type(free, 'このタブのレイアウトを初期状態に戻す')
    await keys(free, 'Enter')
    await expect(free.getByRole('alertdialog')).toContainText('フリー 2（朝 から）')
    await keys(free, 'ArrowRight', 'Enter')
    await expect(free.locator('.toasts')).toContainText('「フリー 2（朝 から）」のレイアウトを初期状態に戻しました')
    await expect(panes).toHaveCount(5)
    // 1 枚目のページはフリー 2 の変更で変わらない
    await expect(page.locator('.main [data-pane-id]')).toHaveCount(5)
    await expect(page.locator('.main [data-widget="watchlist"]')).toHaveCount(1)
  })
})

test.describe('フリー N（FR-L7）', () => {
  test('キーで開き、銘柄ジャンプで足し、タブ・設定は 1 枚目だけ。Ctrl+F6 で窓を移る', async ({ start }) => {
    const { app, page } = await start()
    // タイトルバーのボタンでも開ける（Ctrl+Alt+N と同じダイアログ）
    await page.getByRole('button', { name: '新しいウィンドウ（フリー）を開く' }).click()
    await expect(page.locator('.dialog')).toContainText('初期の形')
    await keys(page, 'Escape')
    await expect(page.locator('.dialog')).toHaveCount(0)
    const free = await openFree(app, page, 'チャートグリッド')
    await expect(free.locator('.wname')).toHaveText('フリー 2')
    await expect(free.locator('.presets')).toHaveCount(0)
    // 狭い窓でも窓の名前は切れない（検索欄の側が縮む）
    await free.setViewportSize({ width: 600, height: 700 })
    expect(await free.locator('.wname').evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true)
    await free.setViewportSize({ width: 1400, height: 900 })
    const grid = free.locator('[data-widget="grid"]')
    await expect(grid).toBeVisible()
    // 銘柄ジャンプで足す（フリー 2 の中で完結）
    await grid.click({ position: { x: 200, y: 200 } })
    await jump(free, '8058', '三菱商事')
    await expect(grid.locator('.tile').first()).toContainText('8058')
    // タブの切り替え・設定は使えない（理由を知らせる）
    await keys(free, 'Control+Shift+Digit1')
    await expect(free.locator('.toasts')).toContainText('フリーのウィンドウでは使えません')
    // ペインの種類はチャートを並べるものだけ
    await keys(free, 'Control+Shift+n')
    await expect(free.locator('.dialog')).toBeVisible()
    await expect(free.locator('.dialog')).not.toContainText('ウォッチリスト')
    await keys(free, 'Escape')
    // Ctrl+F6 で窓を移る（OS の前面ではなく main の「いま前にある窓」で確かめる）
    await keys(page, 'Control+F6')
    await expect.poll(async () => (await info(page))?.active).toBe('free2')
    await keys(free, 'Control+F6')
    await expect.poll(async () => (await info(page))?.active).toBe('main')
  })

  test('キーで送る・★は 1 枚目に届く・リンク色を付けると 1 枚目の銘柄を追う・再起動で戻る', async ({ start }) => {
    const first = await start()
    const { app, page } = first
    await tab(page, 'triple') // 1 枚目は、左の列にウォッチリスト（★）とチャートを置くタブ
    const free = await openFree(app, page, '4 分割')
    const charts = free.locator('[data-widget="chart"]')
    await expect(charts).toHaveCount(4)

    // 1 枚目のトリプル（リンク 2）で 8306 を表示 → Ctrl+Alt+Enter でフリー 2 へ送る（フォーカス中のチャートが変わる）
    await charts.first().click({ position: { x: 200, y: 150 } })
    const mainChart = page.locator('[data-widget="chart"]').first()
    await mainChart.click({ position: { x: 300, y: 200 } })
    await jump(page, '8306', '三菱UFJ')
    await keys(page, 'Control+Alt+Enter')
    await expect(page.locator('.toasts')).toContainText('フリー 2 へ 1 銘柄を送りました')
    await expect(charts.first()).toContainText('8306')

    // フリー 2 で★（Ctrl+D）→ 1 枚目のお気に入りに入る
    await charts.first().click({ position: { x: 200, y: 150 } })
    await keys(free, 'Control+d')
    await expect(free.locator('.toasts')).toContainText('お気に入りに')
    await expect(page.locator('[data-widget="watchlist"]').first().locator('tbody')).toContainText('8306')

    // フリー 2 の 2 枚目のチャートにリンク色 1 を付けると、1 枚目で選んだ銘柄を追う（R3）
    await charts.nth(1).click({ position: { x: 200, y: 150 } })
    await keys(free, 'Control+Digit2')
    await mainChart.click({ position: { x: 300, y: 200 } })
    await jump(page, '9432')
    await expect(charts.nth(1)).toContainText('9432')

    // 再起動: フリー 2 が開き直し、並び（4 枚・送った銘柄）が残る。フリー 2 の保存（0.4 秒遅らせる）が届いてから閉じる
    // （届く前に閉じても保存されることは下のテストで確かめる）
    await expect.poll(() => savedFree2(first.userData)[0]).toBe('JP:8306')
    await app.close()
    const second = await start({ userData: first.userData })
    await expect.poll(() => second.app.windows().length, { timeout: 20_000 }).toBe(2)
    const again = second.app.windows().find((w) => w.url().includes('w=free2'))!
    await expect(again.locator('[data-widget="chart"]')).toHaveCount(4)
    await expect(again.locator('[data-widget="chart"]').first()).toContainText('8306')
  })

  // 回帰（2026-11-15 に E2E で見つけて直した不具合）
  test('フリー 2 で配置を変えた直後に終了しても、再起動で戻る', async ({ start }) => {
    const first = await start()
    const free = await openFree(first.app, first.page, '4 分割')
    const charts = free.locator('[data-widget="chart"]')
    await expect.poll(() => savedFree2(first.userData)[0]).toBe('JP:7203') // 開いたときの形は保存済み
    await charts.first().click({ position: { x: 200, y: 150 } })
    await jump(free, '8306')
    await expect(charts.first()).toContainText('8306')
    await first.app.close()
    expect(savedFree2(first.userData)[0]).toBe('JP:8306')
  })

  test('フリーのウィンドウが無いときに送ると、グリッドで開いて銘柄が並ぶ（R4）', async ({ start }) => {
    const { app, page } = await start()
    await page
      .locator('[data-widget="chart"]')
      .first()
      .click({ position: { x: 300, y: 200 } })
    await jump(page, '8058', '三菱商事')
    const next = app.waitForEvent('window')
    await keys(page, 'Control+Alt+Enter')
    const free = await next
    await expect(free.locator('[data-widget="grid"] .tile').first()).toContainText('8058', { timeout: 20_000 })
    // 初期の形は 1 度だけ（URL から外れる）
    expect(free.url()).not.toContain('shape=')
  })

  test('このウィンドウだけ文字を大きくでき、メモリを測る（R2・R4）', async ({ start }) => {
    const { app, page } = await start()
    const free = await openFree(app, page, 'チャートグリッド')
    await free.locator('[data-widget="grid"]').click({ position: { x: 200, y: 200 } })
    await keys(free, 'Control+Alt+Equal')
    // 窓ごとの倍率は CSS の zoom（Chromium のズームは同じオリジンの窓で共有されるため）
    const z = (p: Page) => p.evaluate(() => document.documentElement.style.zoom)
    const zooms = async () => [await z(page), await z(free)]
    await expect.poll(zooms).toEqual(['1', '1.1'])
    await keys(free, 'Control+Alt+Digit0')
    await expect.poll(zooms).toEqual(['1', '1'])
    // メモリ（docs/decisions.md に記録する）: renderer 1 つあたりの作業セット。レポートの注記に残す
    const mem = await app.evaluate(({ app: a }) =>
      a.getAppMetrics().map((m) => ({ type: m.type, mb: Math.round(m.memory.workingSetSize / 1024) })),
    )
    test.info().annotations.push({ type: 'memory', description: JSON.stringify(mem) })
  })

  test('フリーのウィンドウからもアラートを作れ、1 枚目の一覧に届く。ポップアップは 1 枚目だけ（FR-AL7）', async ({ start }) => {
    const { app, page } = await start()
    const free = await openFree(app, page, 'チャートグリッド')
    const grid = free.locator('[data-widget="grid"]')
    await grid.click({ position: { x: 200, y: 200 } })
    await jump(free, '8058')
    await expect(grid.locator('.tile').first()).toContainText('8058')
    await keys(free, 'Control+Alt+a')
    await expect(free.locator('.dialog.alertform')).toContainText('三菱商事')
    await keys(free, 'Control+Enter')
    await expect(free.locator('.toasts')).toContainText('アラートを作りました: 8058')
    // ポップアップはフリーでは開かない
    await keys(free, 'Control+Alt+l')
    await expect(free.locator('.dialog.alerts')).toHaveCount(0)
    // 1 枚目の一覧に届く（user.changed）
    await keys(page, 'Control+Alt+l')
    await expect(page.locator('.dialog.alerts tbody tr', { hasText: '8058' })).toBeVisible()
  })

  test('1 枚目の設定で目標利回りの線を ON・OFF すると、開いているフリー 2 のタイルにもすぐ描く・消す（FR-C12, user.changed）', async ({
    start,
  }) => {
    const { app, page } = await start({ settings: { yieldLine: false, yieldTargets: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] } })
    const free = await openFree(app, page, 'チャートグリッド')
    const grid = free.locator('[data-widget="grid"]')
    await grid.click({ position: { x: 200, y: 200 } })
    await jump(free, '8951')
    await expect(grid.locator('.tile').first()).toContainText('8951')
    const drawn = grid.locator('canvas[data-yield]:not([data-yield=""])')
    await expect(grid.locator('canvas[data-id]').first()).toBeVisible()
    await expect(drawn).toHaveCount(0)
    // 1 枚目: 設定 → チャート → Tab で「目標利回りの線」→ Space で ON
    const toggle = () => keys(page, 'Control+Comma', 'ArrowDown', 'ArrowDown', 'Tab', 'Space', 'Escape')
    await toggle()
    await expect.poll(() => drawn.count()).toBeGreaterThan(0)
    await toggle()
    await expect(drawn).toHaveCount(0)
  })
})

test.describe('フリー N のタイトルバー（FR-L7, FR-L13）', () => {
  test('最小の幅（480px）でも窓の名前を残し、検索欄の左右と閉じるボタンの左にドラッグできる場所が残る', async ({ start }) => {
    const { app } = await start({ viewport: null, freeWindows: { free2: pane('chart', { tf: 'D', sym: 'JP:8058' }, 0) } })
    await expect.poll(() => app.windows().length, { timeout: 20_000 }).toBe(2)
    const free = app.windows().find((x) => x.url().includes('w=free2'))!
    await expect(free.locator('.wname')).toBeVisible({ timeout: 20_000 })
    for (const width of [1400, 760, 480]) {
      await resizeWindow(app, free, width, 600)
      const m = await expectDraggableTitleBar(free, `フリー 2 / ${width}px`)
      expect(m.regions.wname).toBe('drag')
      expect(await free.locator('.wname').evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true)
    }
  })
})
