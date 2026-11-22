// 異常値の「！」の説明に、取り直しの実際の操作を出す（FR-D5・FR-S7・FR-KB6）。キーの上書き・外したとき・言語で変わる（L4）
import { beforeEach, describe, expect, it } from 'vitest'
import { stubWindow } from '../../support/window'

stubWindow()
const { app } = await import('../../../src/renderer/stores/app.svelte')
const { actionAliases, anomalyHint } = await import('../../../src/renderer/lib/commands')

beforeEach(() => {
  app.settings = { ...app.settings, lang: 'ja', keymap: {} }
})

describe('異常値の説明と取り直しのコマンド（FR-D5・FR-S7）', () => {
  it('既定のキー（Shift+F5）とコマンドの名前を出す', () => {
    const s = anomalyHint()
    expect(s).toContain('Shift+F5')
    expect(s).toContain('「選択銘柄を取り直す」')
    expect(s).toContain('Ctrl+K')
  })
  it('キーを上書きしたらそのキー、外したらコマンドバーだけを出す（FR-KB6）', () => {
    app.settings = { ...app.settings, keymap: { refetch: 'Ctrl+Alt+R' } }
    expect(anomalyHint()).toContain('Ctrl+Alt+R')
    app.settings = { ...app.settings, keymap: { refetch: '' } }
    const s = anomalyHint()
    expect(s).not.toContain('Shift+F5')
    expect(s).toContain('「選択銘柄を取り直す」')
  })
  it('英語でも実際のキーとコマンドの名前を出す', () => {
    app.settings = { ...app.settings, lang: 'en' }
    expect(anomalyHint()).toContain('Shift+F5')
    expect(anomalyHint()).toContain('"Refetch the selected symbol"')
  })
  it('取り直しのコマンドは「取り直し」の別名を持つ（無いアクションは空）', () => {
    expect(actionAliases('refetch')).toContain('取り直し')
    expect(actionAliases('refetchList')).toContain('取り直し')
    expect(actionAliases('no-such-action')).toEqual([])
  })
})
