// E2E の globalSetup（docs/test-plan.md §3.1）:
// 1. out/ が src/ より古ければ止める（古いビルドで合格しない）
// 2. 基準日時（TEST_NOW）のアプリを空の userData で 1 回起動し、初回の確認と初回取得を済ませて閉じる
// 3. DB と利用者の JSON だけを種にする（Chromium のプロファイルは写さない）。種は毎回作り直す
import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { _electron as electron, expect } from '@playwright/test'
import { TEST_NOW } from '../../../src/shared/clock'
import { CHROMIUM_ARGS, ROOT } from './launch'
import { newRunDir, RUN_ENV, SEED_ENV } from './paths'

function newest(dir: string): { t: number; f: string } {
  let best = { t: 0, f: '' }
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    const r = e.isDirectory() ? newest(p) : { t: statSync(p).mtimeMs, f: p }
    if (r.t > best.t) best = r
  }
  return best
}

function checkBuild(): void {
  const outs = ['out/main/index.js', 'out/preload/index.cjs', 'out/preload/index.js', 'out/renderer/index.html']
    .map((f) => join(ROOT, f))
    .filter(existsSync)
  if (outs.length < 3) throw new Error('out/ にビルドがありません。`npm run build` を実行してから E2E を動かしてください')
  const built = Math.min(...outs.map((f) => statSync(f).mtimeMs))
  const src = newest(join(ROOT, 'src'))
  if (src.t > built)
    throw new Error(
      `out/ が src/ より古い（${src.f} が ${new Date(src.t).toISOString()} に変わった。ビルドは ${new Date(built).toISOString()}）。` +
        '`npm run build` を実行してから E2E を動かしてください',
    )
}

/** DB と利用者の JSON だけを写す（世代のバックアップ・ログ・Chromium のプロファイルは写さない） */
function keepSeed(from: string, to: string): void {
  mkdirSync(join(to, 'data', 'user'), { recursive: true })
  cpSync(join(from, 'data', 'market.db'), join(to, 'data', 'market.db'))
  for (const f of readdirSync(join(from, 'data', 'user')))
    if (f.endsWith('.json')) cpSync(join(from, 'data', 'user', f), join(to, 'data', 'user', f))
  if (existsSync(join(from, 'window.json'))) cpSync(join(from, 'window.json'), join(to, 'window.json'))
}

export default async function globalSetup(): Promise<void> {
  checkBuild()
  const run = newRunDir()
  const first = join(run, 'first-run')
  const seed = join(run, 'seed')
  mkdirSync(first, { recursive: true })
  const app = await electron.launch({
    args: [...CHROMIUM_ARGS, '.'],
    cwd: ROOT,
    env: { ...process.env, ELECXSTOCK_PROVIDER: 'stub', ELECXSTOCK_NOW: TEST_NOW, ELECXSTOCK_USER_DATA: first },
  })
  try {
    const page = await app.firstWindow()
    await expect(page.getByRole('dialog', { name: /elecxstock/ })).toBeVisible({ timeout: 30_000 })
    await page.keyboard.press('Enter') // 同意
    await expect(page.getByRole('dialog').first()).toContainText('TradingView')
    await page.keyboard.press('Enter') // 取得を始める
    // 状態の帯の「待機中」はジョブを積む前にも出るので、ジョブが終わったことを Core に聞いて待つ
    await expect
      .poll(
        async () => {
          const js = (await page.evaluate(() =>
            (window as unknown as { elecxstock: { call: (m: string, p: unknown) => Promise<unknown> } }).elecxstock.call('jobs.list', {}),
          )) as { status: string }[]
          return js.length > 0 && js.every((j) => j.status === 'done' || j.status === 'failed' || j.status === 'cancelled')
        },
        { timeout: 60_000 },
      )
      .toBe(true)
    await expect(page.locator('footer')).toContainText(/待機/)
    const st = (await page.evaluate(() =>
      (window as unknown as { elecxstock: { call: (m: string, p: unknown) => Promise<unknown> } }).elecxstock.call('data.status', {}),
    )) as { instruments: number; withBars: number }
    if (!st.instruments || st.withBars !== st.instruments) throw new Error(`初回取得が終わっていない: ${JSON.stringify(st)}`)
  } finally {
    await app.close()
  }
  keepSeed(first, seed)
  process.env[SEED_ENV] = seed
  process.env[RUN_ENV] = run
}
