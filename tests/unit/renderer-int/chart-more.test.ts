// チャートの見出しの「⋯」（FR-C11）: 画像の保存の項目は、設定で ON にしたときだけ出す（既定 OFF のオプトイン）
import { afterAll, describe, expect, it } from 'vitest'
import { installBridge } from '../../support/bridge'
import { makeCore } from '../../support/core'

const core = makeCore()
installBridge(core)
afterAll(() => core.dispose())
const { app } = await import('../../../src/renderer/stores/app.svelte')
// chartMenu.ts は .svelte の型を読むので、tsc（このテストの型検査）には形だけを渡す
type MoreItem = { id: string; hint?: string; run: () => void }
const menu: string = '../../../src/renderer/lib/chartMenu'
const { chartMore } = (await import(/* @vite-ignore */ menu)) as { chartMore: (pane: unknown, save?: () => void) => MoreItem[] }

const pane = { kind: 'pane', id: 'p1', widget: 'chart', state: {} }

describe('チャートの画像の保存の「⋯」の項目（FR-C11）', () => {
  it('既定（OFF）では出さない。ON にすると S のヒント付きで出て、押すと保存を呼ぶ', () => {
    expect(app.settings.chartSave).toBe(false)
    let saved = 0
    const save = () => saved++
    expect(chartMore(pane, save).map((x) => x.id)).not.toContain('saveImage')

    app.settings.chartSave = true
    const item = chartMore(pane, save).find((x) => x.id === 'saveImage')
    expect(item?.hint).toBe('S')
    item?.run()
    expect(saved).toBe(1)
    // 保存の手段を渡さない呼び出し（ほかの見出し）には出さない
    expect(chartMore(pane).map((x) => x.id)).not.toContain('saveImage')
    app.settings.chartSave = false
  })
})
