// 設定の画面の項目の登録表（docs/design-dialogs.md §6。FR-KB11）: Settings のどの項目も、画面にちょうど 1 回出るか、出さない理由がある（L2）
import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../../../src/shared/settings'
import { stubWindow } from '../../support/window'

stubWindow()
const { SETTING_ROWS, NOT_ON_SCREEN, SETTING_TABS } = await import('../../../src/renderer/lib/settingsSpec')
const { ja, en } = await import('../../../src/renderer/lib/i18n')

describe('設定の画面の登録表（FR-KB11）', () => {
  it('Settings の項目は、画面の行にちょうど 1 回出るか、出さない理由の一覧にある', () => {
    const onScreen = SETTING_ROWS.flatMap((r) => (r.setting ? [r.setting] : []))
    expect(new Set(onScreen).size).toBe(onScreen.length)
    expect([...onScreen, ...Object.keys(NOT_ON_SCREEN)].sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort())
  })
  it('行の ID は重ならず、タブ・節・名前・説明が日英にある', () => {
    const ids = SETTING_ROWS.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const r of SETTING_ROWS) {
      expect(SETTING_TABS, r.id).toContain(r.tab)
      for (const d of [ja, en] as Record<string, string>[]) {
        expect(d[r.label], `${r.id} ${r.label}`).toBeTruthy()
        if (r.desc) expect(d[r.desc], `${r.id} ${r.desc}`).toBeTruthy()
        expect(d[`setsec.${r.section}`], `${r.id} setsec.${r.section}`).toBeTruthy()
      }
    }
    for (const tab of SETTING_TABS) for (const d of [ja, en] as Record<string, string>[]) expect(d[`set.${tab}`], tab).toBeTruthy()
  })
  it('依存する行の相手は実在する', () => {
    const ids = new Set(SETTING_ROWS.map((r) => r.id))
    for (const r of SETTING_ROWS) if (r.dependsOn) expect(ids.has(r.dependsOn), r.id).toBe(true)
  })
})
