// アクションの登録表（§6.5, FR-KB4〜KB6）: すべてのアクションについて、キーが重ならない・上書きが効く（docs/testing.md の L2）
import { describe, expect, it } from 'vitest'
import { stubWindow } from '../../support/window'

stubWindow()
const { ACTIONS, conflicts, keyOf } = await import('../../../src/renderer/lib/commands')
const { app } = await import('../../../src/renderer/stores/app.svelte')
const { DICTS } = await import('../../../src/renderer/lib/i18n')

describe('アクションの登録表（FR-KB4〜KB6）', () => {
  it('ID が重ならず、日英の名前がある', () => {
    const ids = ACTIONS.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const lang of ['ja', 'en'] as const) {
      app.settings.lang = lang
      for (const a of ACTIONS) expect(a.label().length, `${lang} ${a.id}`).toBeGreaterThan(0)
    }
    app.settings.lang = 'ja'
  })
  it('コマンドバーの別名（actAlias.<id>）は、どれも登録表のアクションのもの（FR-KB9。打ち間違いで効かない別名を作らない）', () => {
    const ids = new Set(ACTIONS.map((a) => a.id))
    for (const lang of ['ja', 'en'] as const) {
      const keys = Object.keys(DICTS[lang]).filter((k) => k.startsWith('actAlias.'))
      expect(keys.length, lang).toBeGreaterThan(0)
      for (const k of keys) expect(ids.has(k.slice('actAlias.'.length)), `${lang} ${k}`).toBe(true)
    }
  })
  it('既定のキーはほかのアクションと重ならない', () => {
    for (const a of ACTIONS.filter((x) => x.key))
      expect(
        conflicts(a.id, keyOf(a)).map((x) => x.id),
        a.id,
      ).toEqual([])
  })
  // F1 の一覧に載ること・挙げた ID が実在することは tests/unit/registry/shortcuts.test.ts（登録表 lib/shortcuts.ts）
  it('設定の keymap でキーを変えられ、空にすると外せる（FR-KB6）', () => {
    const a = ACTIONS.find((x) => x.key)!
    app.settings.keymap = { [a.id]: 'Ctrl+Alt+F12' }
    expect(keyOf(a.id)).toBe('Ctrl+Alt+F12')
    app.settings.keymap = { [a.id]: '' }
    expect(keyOf(a.id)).toBe('')
    app.settings.keymap = {}
    expect(keyOf(a.id)).toBe(a.key)
  })
})
