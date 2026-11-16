// マウスを一切使わず「起動 → 更新 → ウォッチリストをめくる → スクリーニング → 結果をウォッチリストに追加 → レイアウト切り替え」を通す（FR-KB8）。
// 長い流れは段ごとに分ける（どれも種から起動したアプリをキーだけで操作する）
import { expect, jump, keys, tab, test, type } from './support'

test.describe('一日の流れ（FR-KB8, FR-K2, FR-W4）', () => {
  test('銘柄ジャンプで★を付け、ウォッチリストをめくるとチャートが追従する', async ({ start }) => {
    const { page } = await start()
    await tab(page, 'triple') // 左の列にウォッチリストとスクリーナー、右にチャートを置くタブ
    // トリプルのタブを開くとウォッチリストにフォーカスがある。チャートに移ってから銘柄ジャンプ → お気に入り
    await expect(page.locator('.pane.focused')).toHaveAttribute('data-widget', 'watchlist')
    await keys(page, 'Alt+ArrowRight')
    await expect(page.locator('.pane.focused')).toHaveAttribute('data-widget', 'chart')
    await jump(page, '8058', '三菱商事')
    await expect(page.locator('[data-widget="chart"]').first()).toContainText('8058')
    await keys(page, 'Control+d')
    await jump(page, '7203')
    await keys(page, 'Control+d')
    await jump(page, '94345')
    await keys(page, 'Control+d')
    // ウォッチリスト（★お気に入り）に移ってめくる → チャートが追従する（FR-K2）
    await keys(page, 'Alt+ArrowLeft', 'Alt+ArrowUp') // 左の列へ移り、上のウォッチリストへ
    await expect(page.locator('.pane.focused')).toHaveAttribute('data-widget', 'watchlist')
    await expect(page.locator('[data-pane-id]').first()).toContainText('94345')
    // 先頭の行（最初に★を付けた 8058）へめくると、最後に出していた 94345 からチャートが追従する
    await keys(page, 'Home')
    await expect(page.locator('[data-pane-id]').first().locator('tbody tr.sel')).toContainText('8058')
    await expect(page.locator('[data-widget="chart"]').first()).toContainText('8058')
    await keys(page, 'w') // ウォッチリストにフォーカスがあるので週足キーは効かない（一覧のキー）
    // チャートの凡例の時間軸は日足のまま（3 枚並べた狭いチャートでは D/W/M のボタンは ⋯ に入るので、凡例で見る）
    await expect(page.locator('[data-widget="chart"]').first().locator('.legend .tfb')).toHaveText('D')
  })

  test('スクリーナーで条件を変え、2 行を選んでリストに足し、名前を付けて保存する（FR-SC12）', async ({ start }) => {
    const { page } = await start()
    await tab(page, 'screener')
    const scr = page.locator('[data-widget="screener"]') // タブを開くとここにフォーカス
    await expect(scr).toHaveClass(/focused/)
    await expect(scr).toContainText('高配当銘柄')
    await expect(scr.locator('tbody tr').nth(2)).toBeVisible()
    await keys(page, 'Tab', 'ArrowRight') // 条件へ移り、利回りの閾値を上げる
    await expect(scr).toContainText('変更あり')
    await keys(page, 'Escape', 'ArrowDown', 'Shift+ArrowDown') // 2 行を選ぶ（§6.5.3 複数選択）
    await expect(scr.locator('tbody tr.multi')).toHaveCount(2)
    await keys(page, 'Control+Shift+a')
    await expect(page.locator('.dialog')).toContainText('追加先のリストを選ぶ')
    await keys(page, 'ArrowDown', 'ArrowDown', 'Enter') // 「監視」
    await expect(page.locator('.toasts')).toContainText('「監視」に追加しました: 2')
    await keys(page, 'Control+Shift+s')
    await expect(page.locator('.dialog')).toBeVisible()
    await type(page, '高配当4%')
    await keys(page, 'Enter')
    await expect(scr).toContainText('高配当4%')
    await expect(scr).not.toContainText('変更あり')
  })

  test('グリッドで開いて週足・2 年にし、売買候補の印を付けてリストへ送る（FR-G3, G5, G6）', async ({ start }) => {
    const { page } = await start()
    await tab(page, 'screener')
    await keys(page, 'Control+Shift+g')
    const grid = page.locator('[data-widget="grid"]')
    await expect(grid.locator('.tile').first()).toBeVisible()
    await expect(page.locator('.pane.focused')).toHaveAttribute('data-widget', 'grid')
    await keys(page, 'w', 'Alt+Digit4', 'Space', 'ArrowRight', 'Space')
    await expect(grid.locator('.tile.cand')).toHaveCount(2)
    await keys(page, 'Shift+Space') // 印の付いたタイルだけ
    await expect(grid.locator('.tile')).toHaveCount(2)
    // 印の銘柄をまとめてリストへ（FR-G5）
    await keys(page, 'Control+Shift+a')
    await expect(page.locator('.dialog')).toContainText('追加先のリストを選ぶ')
    await keys(page, 'ArrowDown', 'Enter') // 「インカム」
    await expect(page.locator('.toasts')).toContainText(': 2')
    await keys(page, 'Shift+Space', 'Control+b')
    await expect(page.locator('.dock.open')).toBeVisible()
    await keys(page, 'Escape')
  })

  test('レイアウトの切り替え・サイズのリセット・F1・設定（FR-L5, FR-L9, FR-KB7）', async ({ start }) => {
    const { page } = await start()
    await tab(page, 'mtf')
    await keys(page, 'Alt+Shift+ArrowRight', 'Alt+Shift+ArrowRight', 'Control+Alt+r')
    await expect(page.locator('.toasts')).toContainText('サイズを元に戻しました')
    await keys(page, 'F1')
    await expect(page.getByRole('dialog', { name: 'ショートカット' })).toBeVisible()
    await keys(page, 'Escape')
    await expect(page.getByRole('dialog', { name: 'ショートカット' })).toHaveCount(0)
    await keys(page, 'Control+Comma')
    await expect(page.getByRole('dialog', { name: '設定' })).toBeVisible()
    await keys(page, 'ArrowDown', 'ArrowDown')
    // このアプリについて（最後のタブ。↑ で先頭から回る）: Lightweight Charts の NOTICE の 2 行（§10）
    await keys(page, 'ArrowUp', 'ArrowUp', 'ArrowUp')
    await expect(page.getByRole('dialog', { name: '設定' })).toContainText('TradingView Lightweight Charts™')
    await expect(page.getByRole('dialog', { name: '設定' })).toContainText(
      'Copyright (с) 2025 TradingView, Inc. https://www.tradingview.com/',
    )
    await keys(page, 'Escape')
    await expect(page.getByRole('dialog', { name: '設定' })).toHaveCount(0)
  })
})

test.describe('タブ・知らせ・フォーカスの枠（FR-L5, FR-F10, FR-KB3）', () => {
  test('タブの並びとキーの表示・F5 の知らせ', async ({ start }) => {
    const { page } = await start()
    // タブの並び: マーケットが最初、保有は 7。数字はキーの形で出す
    const tabs = page.locator('.presets button')
    await expect(tabs.first()).toContainText('マーケット')
    await expect(tabs.nth(6)).toContainText('保有')
    await expect(tabs.first().locator('kbd.keycap')).toHaveText('1')
    // F5: 取得が終わった直後は「最新」と知らせる（何も起きないように見えない）
    await keys(page, 'F5')
    await expect(page.locator('.toasts')).toContainText(/最新|更新中|更新を始めました/)
  })

  test('フォーカスの枠はキーで操作しているときだけ出し、クリックしたら消す', async ({ start }) => {
    const { page } = await start()
    const ring = () =>
      page
        .locator('.pane.focused')
        .first()
        .evaluate((el) => getComputedStyle(el).boxShadow)
    await keys(page, 'Alt+ArrowRight')
    await expect(page.locator('html')).toHaveAttribute('data-input', 'keyboard')
    expect(await ring()).not.toBe('none')
    await page
      .locator('.pane')
      .first()
      .click({ position: { x: 40, y: 8 } })
    await expect(page.locator('html')).toHaveAttribute('data-input', 'pointer')
    expect(await ring()).toBe('none')
    await keys(page, 'Alt+ArrowRight')
    expect(await ring()).not.toBe('none')
  })
})
