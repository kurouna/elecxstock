import { cpus } from 'node:os'
import { defineConfig } from '@playwright/test'

// docs/test-plan.md §6: 並列（手元は CPU の半分・上限 6、CI は 2）。OS のフォーカス・窓に頼るテストと見た目の回帰は、並列のあとに直列で回す
const SERIAL = /(multiwindow|state-windows|visual|drawer)\.spec\.ts$/
const workers = process.env.CI ? 2 : Math.max(1, Math.min(6, Math.floor(cpus().length / 2)))

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/support/global-setup.ts',
  globalTeardown: './tests/e2e/support/global-teardown.ts',
  fullyParallel: true,
  workers,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  retries: process.env.CI ? 1 : 0,
  reportSlowTests: { max: 10, threshold: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { trace: 'on-first-retry' },
  // 基準画像の名前に project を入れない（どの project で回しても同じ画像と比べる）
  snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}-{platform}{ext}',
  projects: [
    { name: 'parallel', testIgnore: SERIAL },
    { name: 'serial', testMatch: SERIAL, dependencies: ['parallel'], fullyParallel: false, workers: 1 },
  ],
})
