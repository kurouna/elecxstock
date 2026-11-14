// 銘柄のアラート（FR-AL5・AL7・AL8）: キーだけで作る・ポップアップで直す・止める・消す・戻す。鳴ったらトーストとベル、
// 履歴の Enter で銘柄を開く。値はスタブ（架空）
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, type Page, test } from '@playwright/test'
import { keys, launch } from './helpers'

async function ready(page: Page) {
  await expect(page.getByRole('dialog', { name: /elecxstock/ })).toBeVisible()
  await keys(page, 'Enter', 'Enter')
  await expect(page.locator('footer')).toContainText(/待機/, { timeout: 60_000 })
}

test('アラート: キーだけで作る・直す・止める・消す・戻す。鳴ったら知らせて、履歴から銘柄を開く', async () => {
  test.setTimeout(180_000)
  const first = await launch()
  const { page } = first
  await ready(page)
  // チャートに 7203 を出してから、フォーカス中の銘柄でアラートを作る（Ctrl+Alt+A）
  await keys(page, 'Alt+ArrowRight', 'Digit7', 'Digit2', 'Digit0', 'Digit3', 'Enter')
  await expect(page.locator('[data-widget="chart"]').first()).toContainText('7203')
  await keys(page, 'Control+Alt+a')
  const form = page.locator('.dialog.alertform')
  await expect(form).toContainText('アラートを作る')
  await expect(form).toContainText('トヨタ自動車')
  // 既定は終値 ≤ 今の 5% 下。いまは成り立っていない
  await expect(form.locator('.nowline')).toContainText('成り立っていない')
  await page.screenshot({ path: 'test-results/alerts-1-form.png' })
  // 条件の行で O を押すと ≥ に変わり、いまは成り立つ（作った直後は鳴らさないと出す）
  await keys(page, 'KeyO')
  await expect(form.locator('.nowline')).toContainText('成り立っています')
  await keys(page, 'KeyO', 'ArrowLeft')
  await expect(form.locator('.nowline')).toContainText('成り立っていない')
  // Esc は値の欄では行に戻るだけ。行で Esc ならダイアログを閉じる
  await keys(page, 'Enter', 'Escape')
  await expect(form).toBeVisible()
  await keys(page, 'Control+Enter')
  await expect(form).toHaveCount(0)
  await expect(page.locator('.toasts')).toContainText('アラートを作りました: 7203')

  // ポップアップ（Ctrl+Alt+L）: 一覧に出る
  await keys(page, 'Control+Alt+l')
  const pop = page.locator('.dialog.alerts')
  const row = pop.locator('tbody tr', { hasText: '7203' })
  await expect(row).toContainText('有効')
  await expect(row).toContainText('終値 ≤')
  await page.screenshot({ path: 'test-results/alerts-2-popup.png' })
  // E で直す → Esc でポップアップに戻る
  await keys(page, 'KeyE')
  await expect(form).toContainText('アラートを直す')
  await keys(page, 'Escape')
  await expect(pop).toBeVisible()
  // Space で止める・もう一度で再開
  await keys(page, 'Space')
  await expect(row).toContainText('停止')
  await keys(page, 'Space')
  await expect(row).toContainText('有効')
  // Delete で消す → Esc → Ctrl+Z で戻す
  await keys(page, 'Delete')
  await expect(pop.locator('tbody tr', { hasText: '7203' })).toHaveCount(0)
  await keys(page, 'Escape')
  await expect(pop).toHaveCount(0)
  await keys(page, 'Control+z')
  await expect(page.locator('.toasts')).toContainText('アラートを元に戻しました')
  await keys(page, 'Control+Alt+l')
  await expect(row).toContainText('有効')
  // Ctrl+Alt+L でもう一度押すと閉じる
  await keys(page, 'Control+Alt+l')
  await expect(pop).toHaveCount(0)
  await first.app.close()

  // 鳴らす: 必ず成り立つ条件に直し、前回の判定を「成り立たない・古い日付」にしておく（判定の状態だけを書き換える）
  const dir = join(first.userData, 'data', 'user')
  const alerts = JSON.parse(readFileSync(join(dir, 'alerts.json'), 'utf8'))
  const list = Array.isArray(alerts) ? alerts : alerts.data
  list[0].conditions = [{ field: 'price.close', op: '>=', value: 1 }]
  writeFileSync(join(dir, 'alerts.json'), JSON.stringify(alerts))
  writeFileSync(join(dir, 'alertState.json'), JSON.stringify({ version: 1, data: { [list[0].id]: { met: false, asOf: '2000-01-04' } } }))

  const second = await launch({ userData: first.userData })
  const p2 = second.page
  await expect(p2.locator('footer')).toContainText(/待機/, { timeout: 60_000 })
  await keys(p2, 'F5')
  await expect(p2.locator('.toasts')).toContainText('アラート: 7203', { timeout: 60_000 })
  const bell = p2.getByRole('button', { name: 'アラート', exact: true })
  await expect(bell.locator('.unread')).toHaveText('1')
  // 未読があれば履歴を開く。Enter で閉じて銘柄を開き、既読にする
  await keys(p2, 'Control+Alt+l')
  const hist = p2.locator('.dialog.alerts tbody tr', { hasText: '7203' })
  await expect(hist).toHaveClass(/unread/)
  await p2.screenshot({ path: 'test-results/alerts-3-history.png' })
  await keys(p2, 'Enter')
  await expect(p2.locator('.dialog.alerts')).toHaveCount(0)
  await expect(bell.locator('.unread')).toHaveCount(0)
  await expect(p2.locator('[data-widget="chart"]').first()).toContainText('7203')
  await second.app.close()
})
