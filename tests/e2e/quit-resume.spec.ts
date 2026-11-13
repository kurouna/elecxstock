// 取得中に Ctrl+Shift+Q で閉じる（FR-F1）: Core が取得を止めて DB を閉じてから終わり、次の起動で続きから完了する
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { keys, launch } from './helpers'

type Call = (m: string, p: unknown) => Promise<unknown>
const rpc = (page: import('@playwright/test').Page, m: string, p: unknown = {}) =>
  page.evaluate(([m, p]) => (window as unknown as { elecxstock: { call: Call } }).elecxstock.call(m as string, p), [m, p] as const)

test('初回の取得中に Ctrl+Shift+Q で閉じても、次の起動で続きから終わる', async () => {
  const first = await launch()
  await expect(first.page.getByRole('dialog', { name: /elecxstock/ })).toBeVisible()
  await keys(first.page, 'Enter', 'Enter') // 同意 → 取得を始める
  await expect.poll(async () => ((await rpc(first.page, 'jobs.list')) as { kind: string }[]).length).toBeGreaterThan(0)
  const exited = new Promise<void>((r) => first.app.process().once('exit', () => r()))
  await first.page.keyboard.press('Control+Shift+q').catch(() => {}) // 押した直後に窓が閉じる
  await exited

  // Core は止めてから終わった（強制終了ではない）
  const logs = join(first.userData, 'data', 'logs')
  const core = readdirSync(logs).filter((f) => f.startsWith('core-'))
  expect(core.map((f) => readFileSync(join(logs, f), 'utf8')).join('\n')).toContain('core shutdown')

  const second = await launch({ userData: first.userData })
  const page = second.page
  // 同意は済んでいるので初回のダイアログは出ず、取得の続きが終わる
  await expect(page.locator('footer')).toContainText(/待機/, { timeout: 60_000 })
  await expect
    .poll(async () => ((await rpc(page, 'jobs.list')) as { kind: string; status: string }[]).filter((j) => j.kind === 'initial'))
    .toEqual([expect.objectContaining({ status: 'done' })])
  const st = (await rpc(page, 'data.status')) as { instruments: number; withBars: number }
  expect(st.withBars).toBe(st.instruments)
  await second.app.close()
})
