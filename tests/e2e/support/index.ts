// E2E の共通の部品。テストは `import { test, expect, keys, ... } from './support'` で使う。
// fixture の `launch`・`start` で起動したアプリは、テストが失敗しても終わりに閉じる
import { test as base, type ElectronApplication } from '@playwright/test'
import { type Launched, type LaunchOpts, launch as rawLaunch, ready } from './launch'

export { expect } from '@playwright/test'
export { TEST_NOW } from '../../../src/shared/clock'
export * from './keys'
export { type Launched, type LaunchOpts, readUser, ready, type UserFile, userFile, writeUser } from './launch'
export * from './layout'
export * from './ops'

type Launch = (opts?: LaunchOpts) => Promise<Launched>

export const test = base.extend<{ launch: Launch; start: Launch }>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright の fixture の形
  launch: async ({}, use) => {
    const apps: ElectronApplication[] = []
    await use(async (opts) => {
      const r = await rawLaunch(opts)
      apps.push(r.app)
      return r
    })
    for (const a of apps) await a.close().catch(() => {})
  },
  /** 種から起動して、操作できるまで待つ */
  start: async ({ launch }, use) => {
    await use(async (opts) => {
      const r = await launch(opts)
      await ready(r.page)
      return r
    })
  },
})
