// アクションの登録表（§6.5, FR-KB4〜KB6）: すべてのアクションについて、キーが重ならない・F1 の一覧に載る・上書きが効く（docs/testing.md の L2）
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { stubWindow } from '../../support/window'

stubWindow()
const { ACTIONS, conflicts, keyOf } = await import('../../../src/renderer/lib/commands')
const { app } = await import('../../../src/renderer/stores/app.svelte')
const help = readFileSync('src/renderer/components/overlays/Help.svelte', 'utf8')
const inHelp = new Set([...help.matchAll(/K\(([^)]*)\)/g)].flatMap((m) => [...m[1]!.matchAll(/'([^']+)'/g)].map((x) => x[1]!)))

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
  it('既定のキーはほかのアクションと重ならない', () => {
    for (const a of ACTIONS.filter((x) => x.key))
      expect(
        conflicts(a.id, keyOf(a)).map((x) => x.id),
        a.id,
      ).toEqual([])
  })
  it('F1 の一覧が挙げるアクションはすべて実在する', () => {
    const ids = new Set(ACTIONS.map((a) => a.id))
    expect(inHelp.size).toBeGreaterThan(20)
    for (const id of inHelp) expect(ids.has(id), id).toBe(true)
  })
  it('キーを持つアクションは F1 の一覧に載る', () => {
    // レイアウトのプリセット（Ctrl+Shift+1〜9）は「Ctrl+Shift+1–9」の 1 行にまとめて載せる
    const ranged = (a: (typeof ACTIONS)[number]) => a.id.startsWith('layout.') && /^Ctrl\+Shift\+[1-9]$/.test(a.key ?? '')
    const missing = ACTIONS.filter((a) => a.key && !inHelp.has(a.id) && !ranged(a)).map((a) => a.id)
    expect(missing).toEqual([])
  })
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
