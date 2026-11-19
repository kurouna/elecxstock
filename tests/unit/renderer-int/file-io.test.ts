// ファイルの書き出し・取り込みの失敗を知らせる（L4）: main が「失敗」を返したら、取りやめと同じに黙らず、エラーのトーストを出す
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { installBridge } from '../../support/bridge'
import { makeCore } from '../../support/core'

const core = makeCore()
const fake = installBridge(core)
afterAll(() => core.dispose())
const { app, t } = await import('../../../src/renderer/stores/app.svelte')
const { exportUser, importUser } = await import('../../../src/renderer/lib/commands')

const last = () => app.toasts.at(-1)
beforeEach(() => {
  app.toasts = []
  fake.nextSave = 'saved'
  fake.nextOpen = null
})

describe('利用者のデータの書き出し・取り込みの失敗（FR-S12）', () => {
  it('書けたら「書き出しました」、取りやめは何も出さない、書けなかったらエラーで知らせる', async () => {
    await exportUser()
    expect(last()?.msg).toBe(t('set.exported'))
    app.toasts = []
    fake.nextSave = 'cancelled'
    await exportUser()
    expect(app.toasts).toEqual([])
    fake.nextSave = 'failed'
    await exportUser()
    expect(last()).toMatchObject({ kind: 'error', msg: t('file.saveFailed') })
  })

  it('選んだファイルを読めなかったら知らせる（取りやめは何も出さない）', async () => {
    await importUser()
    expect(app.toasts).toEqual([])
    fake.nextOpen = { error: 'read' }
    await importUser()
    expect(last()).toMatchObject({ kind: 'error', msg: t('file.openFailed') })
    fake.nextOpen = { error: 'too-large' }
    await importUser()
    expect(last()).toMatchObject({ kind: 'error', msg: t('file.tooLarge') })
  })
})
