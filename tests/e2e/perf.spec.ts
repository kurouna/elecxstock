// パフォーマンス比較（FR-PC1〜PC12。docs/design-perf.md）: マイレイアウトの新しいページの形「比較」から開き、キーボードだけで操作する。
// 値はスタブ（架空）と基準日時（ELECXSTOCK_NOW）
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { expect, keys, tab, test, type, typeJump } from './support'

const perf = (page: Page) => page.locator('[data-widget="perf"]')
/** マイレイアウトに新しいページ（形は「比較」）を作って開く */
async function openCompare(page: Page) {
  await tab(page, 'free')
  await keys(page, 'Control+Shift+Digit8', 'Insert')
  const dlg = page.getByRole('dialog', { name: '新しいページの初めの形' })
  await expect(dlg).toBeVisible()
  const opts = dlg.getByRole('option')
  await expect(opts.nth(5)).toContainText('比較')
  for (let i = 0; i < 5; i++) await keys(page, 'ArrowDown')
  await expect(opts.nth(5)).toHaveAttribute('aria-selected', 'true')
  await keys(page, 'Enter')
  await type(page, '比較')
  await keys(page, 'Enter')
  const p = perf(page)
  await expect(p).toHaveCount(1)
  await expect(p).toHaveClass(/focused/)
  return p
}
const rowIds = (p: ReturnType<typeof perf>) =>
  p.locator('.pf-rows [data-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-id')))

test.describe('パフォーマンス比較（FR-PC1・PC2・PC4・PC6・PC7・PC12）', () => {
  test('比較のページ: 銘柄ジャンプの Ctrl+Enter で足し、Delete で外し、カレンダーで基準日を選び、十字線で値を読む', async ({ start }) => {
    const { page } = await start()
    const p = await openCompare(page)
    // ひな形: パフォーマンス比較（リンク 2）と日足のチャート（リンク 2）
    await expect(p.locator('.link')).toHaveText('2')
    await expect(page.locator('.main [data-widget="chart"] .link')).toHaveText('2')
    await expect(p.getByTestId('pf-title')).toContainText('= 100')
    await expect(p.getByText('過去の値動きの比較です。')).toBeVisible()
    const before = await rowIds(p)
    // 銘柄ジャンプ: 足す先は「＋ パフォーマンス比較」
    await typeJump(page, '8058')
    await expect(page.locator('.dialog.jump .it.sel')).toContainText('＋ パフォーマンス比較')
    await keys(page, 'Control+Enter')
    await expect(page.locator('.dialog.jump')).toHaveCount(0)
    await typeJump(page, '8001')
    await keys(page, 'Control+Enter')
    await expect.poll(() => rowIds(p)).toEqual(expect.arrayContaining([...before, 'JP:8058', 'JP:8001']))
    await expect(p.getByTestId('pf-count')).toHaveText(`${before.filter((x) => x !== 'JP:1306').length + 2} / 5`)
    await expect(p.locator('svg[data-lines]')).toHaveAttribute('data-lines', String((await rowIds(p)).length))
    // 一覧へ（Tab: チャート → 基準日 → 銘柄）。Delete で選んだ行を外す
    await keys(page, 'Tab', 'Tab')
    await expect(p.getByTestId('pf-list')).toHaveClass(/focus/)
    // 足した銘柄の足が届くまで待つ（並びは終わりの日の値で決まるので、届く前と後で変わる）
    await expect(p.locator('.pf-rows .pf-v.why')).toHaveCount(0)
    const n = (await rowIds(p)).length
    const first = (await rowIds(p))[0]
    await keys(page, 'Delete')
    await expect.poll(async () => (await rowIds(p)).length).toBe(n - 1)
    expect(await rowIds(p)).not.toContain(first)
    // 基準日: Enter でカレンダー → PgUp で前の月 → Enter で決める（見出しの日付が変わる）
    await keys(page, 'Tab', 'Tab')
    await expect(p.getByTestId('pf-date')).toHaveClass(/focus/)
    const base0 = await p.locator('svg[data-base]').getAttribute('data-base')
    await keys(page, 'Enter')
    const cal = p.getByTestId('pf-cal')
    await expect(cal).toBeVisible()
    const ym0 = await p.getByTestId('pf-cal-ym').textContent()
    await keys(page, 'PageUp')
    await expect(p.getByTestId('pf-cal-ym')).not.toHaveText(ym0 ?? '')
    await keys(page, 'ArrowLeft', 'Enter')
    await expect(cal).toHaveCount(0)
    await expect(p.locator('svg[data-base]')).not.toHaveAttribute('data-base', base0 ?? '')
    const base1 = await p.locator('svg[data-base]').getAttribute('data-base')
    await expect(p.getByTestId('pf-base')).toContainText(base1!.replaceAll('-', '/'))
    // ← で 1 営業日前（カレンダーを開かずに）
    await keys(page, 'ArrowLeft')
    await expect(p.locator('svg[data-base]')).not.toHaveAttribute('data-base', base1!)
    // T で配当込み
    await keys(page, 't')
    await expect(p.getByTestId('pf-total')).toHaveAttribute('aria-checked', 'true')
    // チャート（Shift+Tab で基準日 → チャート）: Home で十字線。読み取りと一覧の値がその日の値になる（札は動かさない）
    await keys(page, 'Shift+Tab')
    await expect(p.locator('.pf-chartblk')).toHaveClass(/focus/)
    const label0 = await p.locator('text[data-label]').first().textContent()
    const v0 = await p.locator('.pf-rows [data-id] .pf-v').first().textContent()
    await keys(page, 'Home')
    await expect(p.getByTestId('pf-readout')).toContainText('基準日から 0 営業日')
    await expect(p.locator('.pf-rows [data-id] .pf-v').first()).toHaveText('100.0')
    expect(v0).not.toBe('100.0')
    await expect(p.locator('text[data-label]').first()).toHaveText(label0 ?? '')
    // P で % の表し方
    await keys(page, 'p')
    await expect(p.locator('.pf-rows [data-id] .pf-v').first()).toHaveText('±0.0%')
    await keys(page, 'Escape')
    await expect(p.getByTestId('pf-readout')).not.toContainText('基準日から')
  })

  test('上場前の銘柄（1605）は 3 年前の基準日で「データなし」と出し、線を描かない（FR-PC5）', async ({ start }) => {
    const { page } = await start()
    const p = await openCompare(page)
    await keys(page, 'Alt+Digit3')
    await typeJump(page, '1605')
    await keys(page, 'Control+Enter')
    const row = p.locator('.pf-rows [data-id="JP:1605"]')
    await expect(row).toContainText('データなし')
    await expect(p.locator('path[data-id="JP:1605"]')).toHaveCount(0)
    // 年初（Alt+1。2025 年の大納会）でもまだ無い。基準日の欄で ↓（1 か月後）を 3 回で 2026-03 末になり、線が出る
    await keys(page, 'Alt+Digit1')
    await expect(row).toContainText('データなし')
    await keys(page, 'Tab', 'ArrowDown', 'ArrowDown', 'ArrowDown')
    await expect(row).not.toContainText('データなし')
    await expect(p.locator('path[data-id="JP:1605"]')).toHaveCount(1)
  })

  test('比べる相手も Space で非表示にでき（一覧に残る）、Esc で十字線を消す（FR-PC4・PC7）', async ({ start }) => {
    const { page } = await start()
    const p = await openCompare(page)
    const bench = p.locator('.pf-rows [data-id="JP:1306"]')
    await expect(p.locator('path[data-id="JP:1306"]')).toHaveCount(1)
    await keys(page, 'ArrowLeft')
    await expect(p.getByTestId('pf-readout')).toContainText('基準日から')
    await keys(page, 'Tab', 'Tab')
    for (let i = 0; i < 6; i++) await keys(page, 'ArrowDown')
    await expect(bench).toHaveClass(/sel/)
    await keys(page, 'Space')
    await expect(p.locator('path[data-id="JP:1306"]')).toHaveCount(0)
    await expect(bench).toContainText('非表示')
    // 一覧にいても Esc で十字線を消す
    await keys(page, 'Escape')
    await expect(p.getByTestId('pf-readout')).not.toContainText('基準日から')
  })
  test('画像の保存: 設定がオンのときだけ見出しのボタンとチャートの S。ファイル名は基準日と終わりの日（FR-PC9）', async ({ start }) => {
    const { app, page, userData } = await start({ settings: { chartSave: true } })
    const file = join(userData, 'perf-shot.png')
    await app.evaluate(({ dialog }, f) => {
      const g = globalThis as { saveCalls?: string[] }
      g.saveCalls = []
      dialog.showSaveDialog = (async (_w: unknown, o: { defaultPath?: string }) => {
        g.saveCalls!.push(o.defaultPath ?? '')
        return { canceled: false, filePath: f }
      }) as unknown as typeof dialog.showSaveDialog
    }, file)
    const p = await openCompare(page)
    await expect(p.getByRole('button', { name: /画像/ })).toBeVisible()
    await expect(p.locator('svg[data-lines]')).toBeVisible()
    await keys(page, 's')
    await expect.poll(() => app.evaluate(() => (globalThis as { saveCalls?: string[] }).saveCalls ?? [])).toHaveLength(1)
    const name = (await app.evaluate(() => (globalThis as { saveCalls?: string[] }).saveCalls ?? []))[0]!
    expect(name).toMatch(/elecxstock-perf-\d{4}-\d{2}-\d{2}-2026-11-13\.png$/)
    await expect(page.locator('.toasts')).toContainText('保存')
    const png = readFileSync(file)
    expect([...png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
    expect(png.readUInt32BE(16)).toBeGreaterThan(400)
  })
})
