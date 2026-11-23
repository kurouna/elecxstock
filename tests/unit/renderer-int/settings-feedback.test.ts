// 設定画面から実行したときの知らせ（L4）: 新しい版の確認は画面の中に出し、全データの削除は Core が応答するまで「削除中」にする
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { installBridge } from '../../support/bridge'
import { makeCore } from '../../support/core'

const core = makeCore()
installBridge(core)
afterAll(() => core.dispose())
const { app, t } = await import('../../../src/renderer/stores/app.svelte')
const { checkUpdate, resetAllData } = await import('../../../src/renderer/lib/commands')

beforeEach(() => {
  app.toasts = []
  app.updateCheck = null
  app.overlay = null
})

describe('新しい版の確認の結果を設定画面に出す（NFR-Q9）', () => {
  it('設定画面を開いているときは、結果を画面の中に残し、トーストは出さない', async () => {
    app.overlay = { kind: 'settings', tab: 'about' }
    const p = checkUpdate(true)
    expect(app.updateCheck).toEqual({ state: 'checking' })
    await p
    expect(app.updateCheck).toMatchObject({ state: 'latest' })
    expect(app.toasts).toEqual([])
  })
  it('コマンドバーなど設定画面の外からは、これまでどおりトーストで知らせる', async () => {
    await checkUpdate(true)
    expect(app.toasts.at(-1)?.msg).toBe(t('update.latest'))
  })
  it('起動時の自動の確認は、最新なら何も出さず、設定画面の行も変えない', async () => {
    await checkUpdate(false)
    expect(app.toasts).toEqual([])
    expect(app.updateCheck).toBeNull()
  })
})

describe('全データの削除の間の知らせ（FR-S6）', () => {
  it('押してすぐ「削除中」になり、Core が応答したら戻ってトーストを出す', async () => {
    const p = resetAllData(true)
    expect(app.resetting).toBe(true)
    await p
    expect(app.resetting).toBe(false)
    expect(app.toasts.at(-1)?.msg).toBe(t('reset.started'))
  })
})
