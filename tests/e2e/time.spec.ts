// 時間の経過（docs/test-plan.md §3.2・§4 の T、FR-I8, FR-SC8, FR-T1）: ELECXSTOCK_NOW を進めて再起動する。
// 実行時に数える日数（権利付最終日まで）は、保存した日付を過ぎても次の更新を待たずに次の権利付最終日へ繰り越す（空にしない）。
// 自動の更新を止めて、保存した指標が古いままの状態を作る。値はスタブ（架空）
import type { Page } from '@playwright/test'
import { expect, freeTab, pane, readUser, rpc, TEST_NOW, test } from './support'

const NOW_MS = Date.parse(TEST_NOW)
const screens = [
  {
    id: 'rights',
    name: { ja: '権利が近い', en: 'rights' },
    conditions: [{ field: 'event.rightsDays', op: '<=', value: 400 }],
    columns: ['code', 'name', 'event.rightsDays'],
    created: NOW_MS,
    updated: NOW_MS,
  },
]
/** スクリーナーの結果で、code の行の最後の列（権利付最終日まで） */
async function daysOf(page: Page, code: string): Promise<string> {
  const row = page.locator('[data-widget="screener"] tbody tr', { hasText: code })
  await expect(row).toBeVisible()
  return ((await row.locator('td').last().textContent()) ?? '').trim()
}

test.describe('時間の経過（FR-I8, FR-SC8）', () => {
  test('権利付最終日を過ぎても、次の更新を待たずに次の権利付最終日までの日数になる', async ({ start }) => {
    // 基準日時（11/13）: 3281（スタブの権利確定は 5 月・11 月）の次の権利付最終日は 11 月
    const first = await start({ layout: freeTab(pane('screener', { screenId: 'rights' }, 1)), user: { screens } })
    const [m] = await rpc<{ rightsDay: number | null; asOf: string }[]>(first.page, 'metrics.get', { ids: ['JP:3281'] })
    expect(m?.asOf).toBe('2026-11-13')
    const d0 = Number(await daysOf(first.page, '3281'))
    expect(d0).toBeGreaterThan(0)
    expect(d0).toBeLessThan(31) // 11 月の権利付最終日
    await first.app.close()

    // 12/1 に、自動の更新を止めて起動する: 保存した権利付最終日（11 月）は過ぎている
    const { page } = await start({ userData: first.userData, now: '2026-12-01T18:00:00+09:00', settings: { autoUpdate: false } })
    expect(await page.evaluate(() => new Date().toISOString().slice(0, 10))).toBe('2026-12-01')
    const [m2] = await rpc<{ rightsDay: number | null; asOf: string }[]>(page, 'metrics.get', { ids: ['JP:3281'] })
    expect(m2?.asOf).toBe('2026-11-13') // 更新していない
    expect(m2!.rightsDay!).toBeLessThan(Date.UTC(2026, 11, 1) / 86_400_000) // 保存した権利付最終日（日付の数）は過ぎている
    const d1 = await daysOf(page, '3281')
    expect(d1).not.toBe('—')
    // 次は 5 月（およそ 150〜190 日後）
    expect(Number(d1)).toBeGreaterThan(150)
    expect(Number(d1)).toBeLessThan(190)
    expect(readUser<{ autoUpdate: boolean }>(first.userData, 'settings').autoUpdate).toBe(false)
  })
})
