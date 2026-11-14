// アラート（FR-AL1〜AL10）: キーだけで作る・ポップアップで直す・止める・消す・戻す。鳴ったらトーストとベル、履歴の Enter で銘柄・スクリーンを開く。
// 金額はスクリーナーと同じ単位で打つ。値はスタブ（架空）。フリーのウィンドウからの作成は multiwindow.spec.ts
import type { Page } from '@playwright/test'
import { expect, jump, keys, TEST_NOW, tab, test, type } from './support'

const created = TEST_NOW
/** 次の営業日の大引けのあと。起動すると日々の更新が走り、終わりにアラートを判定する（FR-AL3） */
const NEXT_DAY = '2026-11-16T18:00:00+09:00'
/** 銘柄のアラート（alerts.json の 1 件） */
const symbolAlert = (id: string, code: string, op: '>=' | '<=', value: number) => ({
  id,
  target: { kind: 'symbol', id: `JP:${code}` },
  conditions: [{ field: 'price.close', op, value }],
  basis: '2026-11-13',
  repeat: false,
  enabled: true,
  created,
})
const screenAlert = (id: string, screenId: string) => ({
  id,
  target: { kind: 'screen', screenId },
  conditions: [],
  basis: '2026-11-13',
  repeat: false,
  enabled: true,
  created,
})

/** チャートに銘柄を出してフォーカスを置き、Ctrl+Alt+A でアラートのフォームを開く */
async function openFormOn(page: Page, code: string, name: string) {
  await keys(page, 'Alt+ArrowRight')
  await expect(page.locator('.pane.focused')).toHaveAttribute('data-widget', 'chart')
  await jump(page, code)
  await expect(page.locator('.pane.focused')).toContainText(code)
  await keys(page, 'Control+Alt+a')
  const form = page.locator('.dialog.alertform')
  await expect(form).toContainText(name)
  return form
}

test.describe('銘柄のアラートを作る（FR-AL1, FR-AL7, FR-AL9）', () => {
  test('フォーカス中の銘柄で作る。O で比べ方を変えると「いまの状態」が変わり、Esc は値の欄では行に戻るだけ', async ({ start }) => {
    const { page } = await start()
    const form = await openFormOn(page, '7203', 'トヨタ自動車')
    await expect(form).toContainText('アラートを作る')
    // 既定は終値 ≤ 今の 5% 下。いまは成り立っていない
    await expect(form.locator('.nowline')).toContainText('成り立っていない')
    // 条件の行で O を押すと ≥ に変わり、いまは成り立つ（作った直後は鳴らさないと出す）
    await keys(page, 'KeyO')
    await expect(form.locator('.nowline')).toContainText('成り立っています')
    await keys(page, 'KeyO', 'ArrowLeft')
    await expect(form.locator('.nowline')).toContainText('成り立っていない')
    // Esc は値の欄では行に戻るだけ。行で Esc ならダイアログを閉じる
    await keys(page, 'Enter')
    await expect(form.locator('input.val').first()).toBeFocused()
    await keys(page, 'Escape')
    await expect(form).toBeVisible()
    await keys(page, 'Control+Enter')
    await expect(form).toHaveCount(0)
    await expect(page.locator('.toasts')).toContainText('アラートを作りました: 7203')
  })

  test('金額はスクリーナーと同じ単位で打つ（時価総額は億円。「30万」のように単位を付けてもよい）', async ({ start }) => {
    const { page } = await start()
    const form = await openFormOn(page, '7203', 'トヨタ自動車')
    // F で指標の欄へ。↓で時価総額まで送り、Enter で行に戻る
    await keys(page, 'KeyF')
    const field = form.locator('.row select').first()
    await expect(field).toBeFocused()
    for (let n = 0; n < 120 && (await field.inputValue()) !== 'value.marketCap'; n++) await keys(page, 'ArrowDown')
    await expect(field).toHaveValue('value.marketCap')
    await keys(page, 'Enter')
    const val = form.locator('input.val').first()
    await expect(val).toHaveAttribute('aria-label', /億円/)
    // Enter で値の欄。100 と打てば 100 億円
    await keys(page, 'Enter')
    await expect(val).toBeFocused()
    await keys(page, 'Control+a')
    await type(page, '100')
    await keys(page, 'Enter')
    await expect(val).toHaveValue(/^100\s?億$/)
    // 直すときは表示の単位の数が入っている
    await keys(page, 'Enter')
    await expect(val).toHaveValue('100')
    await keys(page, 'Control+a')
    await type(page, '30万')
    await keys(page, 'Enter')
    await expect(val).toHaveValue(/^30\s?万$/)
  })
})

test.describe('アラートのポップアップ（FR-AL8, FR-AL10）', () => {
  test('一覧に出て、E で直す・Space で止める・Delete で消す・Ctrl+Z で戻す', async ({ start }) => {
    const { page } = await start({ user: { alerts: [symbolAlert('a1', '7203', '<=', 1000)] } })
    await keys(page, 'Control+Alt+l')
    const pop = page.locator('.dialog.alerts')
    const row = pop.locator('tbody tr', { hasText: '7203' })
    await expect(row).toContainText('有効')
    await expect(row).toContainText('終値 ≤')
    // E で直す → Esc でポップアップに戻る
    await keys(page, 'KeyE')
    const form = page.locator('.dialog.alertform')
    await expect(form).toContainText('アラートを直す')
    await keys(page, 'Escape')
    await expect(form).toHaveCount(0)
    await expect(pop).toBeVisible()
    // Space で止める・もう一度で再開
    await keys(page, 'Space')
    await expect(row).toContainText('停止')
    await keys(page, 'Space')
    await expect(row).toContainText('有効')
    // Delete で消す → ポップアップの中でも Ctrl+Z で戻せる
    await keys(page, 'Delete')
    await expect(row).toHaveCount(0)
    await keys(page, 'Control+z')
    await expect(row).toContainText('有効')
    // Delete で消す → Esc → Ctrl+Z で戻す
    await keys(page, 'Delete')
    await expect(row).toHaveCount(0)
    await keys(page, 'Escape')
    await expect(pop).toHaveCount(0)
    await keys(page, 'Control+z')
    await expect(page.locator('.toasts')).toContainText('アラートを元に戻しました')
    await keys(page, 'Control+Alt+l')
    await expect(row).toContainText('有効')
    // Ctrl+Alt+L でもう一度押すと閉じる
    await keys(page, 'Control+Alt+l')
    await expect(pop).toHaveCount(0)
  })
})

test.describe('鳴る・履歴（FR-AL3〜AL6）', () => {
  test('銘柄のアラートが鳴るとトーストとベルで知らせ、履歴の Enter で銘柄を開いて既読にする', async ({ start }) => {
    // 必ず成り立つ条件で、前回の判定を「成り立たない・古い日付」にしておき、次の営業日に起動する（日々の更新のあとに判定する）
    const { page } = await start({
      user: { alerts: [symbolAlert('a1', '7203', '>=', 1)], alertState: { a1: { met: false, asOf: '2000-01-04' } } },
      now: NEXT_DAY,
    })
    await expect(page.locator('.toasts')).toContainText('アラート: 7203', { timeout: 20_000 })
    const bell = page.getByRole('button', { name: 'アラート', exact: true })
    await expect(bell.locator('.unread')).toHaveText('1')
    // 未読があれば履歴を開く。Enter で閉じて銘柄を開き、既読にする
    await keys(page, 'Control+Alt+l')
    const hist = page.locator('.dialog.alerts tbody tr', { hasText: '7203' })
    await expect(hist).toHaveClass(/unread/)
    await keys(page, 'Enter')
    await expect(page.locator('.dialog.alerts')).toHaveCount(0)
    await expect(bell.locator('.unread')).toHaveCount(0)
    await expect(page.locator('[data-widget="chart"]').first()).toContainText('7203')
  })
})

test.describe('スクリーンのアラート（FR-AL2）', () => {
  test('スクリーナーから作ると対象は開いているスクリーン。← → で銘柄に切り替えられる', async ({ start }) => {
    const { page } = await start()
    await tab(page, 'screener')
    await expect(page.locator('[data-widget="screener"]')).toContainText('高配当銘柄')
    await keys(page, 'Control+Alt+a')
    const form = page.locator('.dialog.alertform')
    const screenRadio = form.getByRole('radio', { name: 'スクリーン' })
    await expect(screenRadio).toHaveAttribute('aria-checked', 'true')
    await expect(form).toContainText('新しく入った銘柄')
    await expect(form.locator('.nowline')).toContainText('外れた銘柄は知らせません')
    await keys(page, 'ArrowLeft')
    await expect(screenRadio).toHaveAttribute('aria-checked', 'false')
    await keys(page, 'ArrowRight')
    await expect(screenRadio).toHaveAttribute('aria-checked', 'true')
    await keys(page, 'Control+Enter')
    await expect(page.locator('.toasts')).toContainText('アラートを作りました: [高配当銘柄]')
    await keys(page, 'Control+Alt+l')
    const row = page.locator('.dialog.alerts tbody tr', { hasText: '[高配当銘柄]' })
    await expect(row).toContainText('新しく入った銘柄')
    await expect(row).toContainText(/\d+ 件/)
    await keys(page, 'Escape')
  })

  test('新しく入った銘柄で鳴り、履歴の Enter でスクリーナーにそのスクリーンを開く（グリッドのタブではドロワーを開いて見せる）', async ({
    start,
  }) => {
    // 前の結果を空・古い日付にしておく → 次の営業日の更新のあとの判定で、結果の銘柄がすべて「新しく入った」
    const { page } = await start({
      user: { alerts: [screenAlert('s1', 'high-yield')], alertState: { s1: { met: false, asOf: '2000-01-04', members: [] } } },
      now: NEXT_DAY,
    })
    await expect(page.locator('.toasts')).toContainText(/\[高配当銘柄\] に \d+ 件入りました/, { timeout: 20_000 })
    await tab(page, 'grid')
    await keys(page, 'Control+Alt+l')
    const hist = page.locator('.dialog.alerts tbody tr', { hasText: '[高配当銘柄]' })
    await expect(hist).toHaveClass(/unread/)
    await keys(page, 'Enter')
    await expect(page.locator('[data-widget="screener"]')).toBeVisible()
    await expect(page.locator('[data-widget="screener"]')).toContainText('高配当銘柄')
  })
})
