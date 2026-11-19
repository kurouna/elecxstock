// フリー N（2 枚目以降の窓。FR-L7, docs/design-multimonitor.md）の画面のロジック。窓の種類は URL で決まるので、読み込む前に location を置く
import type { SavedScreen } from '@shared/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { stubWindow } from '../../support/window'

vi.stubGlobal('location', { search: '?w=free2&shape=empty' })
stubWindow()
vi.stubGlobal('CSS', { escape: (s: string) => s })

const { IS_FREE, blockedInFree } = await import('../../../src/renderer/lib/windowSlot')
const { app } = await import('../../../src/renderer/stores/app.svelte')
const L = await import('../../../src/renderer/stores/layout.svelte')
const C = await import('../../../src/renderer/lib/commands')
const S = await import('../../../src/renderer/lib/screens')

const scr = (id: string): SavedScreen =>
  ({ id, name: { ja: id, en: id }, conditions: [{ field: 'income.yield', op: '>=', value: 3 }], created: 1, updated: 1 }) as SavedScreen

/** 配当シミュレータだけのフリー N（リンク色のチャートが無い） */
function divsimOnly(): void {
  L.useFreeWindow({
    doc: L.normalizeDoc({
      version: 1,
      active: 'free',
      entries: { free: { root: { kind: 'pane', id: 'd1', widget: 'divsim', link: 1, state: {} }, docks: {} } },
      links: {},
    }),
    origin: 'free:empty',
  } as Parameters<typeof L.useFreeWindow>[0])
  app.focus = 'd1'
}

beforeEach(() => {
  app.overlay = null
  divsimOnly()
})

describe('フリー N の銘柄の受け取り（FR-L7, FR-K1）', () => {
  it('前提: この窓はフリー N', () => {
    expect(IS_FREE).toBe(true)
  })
  it('チャートの無い窓で銘柄を選んでも、1 枚目の MTF のタブに切り替えない（窓の配置を壊さない）', () => {
    C.sendSymbol('JP:7203')
    expect(L.layout.doc.active).toBe('free')
    expect(L.allPanes(L.layout.entry).map((p) => p.widget)).toEqual(['divsim'])
    expect(L.layout.doc.links['1']).toBe('JP:7203') // リンク色の銘柄は変わる（ほかの窓のチャートが追う）
  })
})

describe('フリー N のコマンドバー（FR-L7, FR-KB1）', () => {
  it('フリー N で使えないアクションを出さない', () => {
    const ids = C.paletteActions().map((a) => a.id)
    expect(ids.length).toBeGreaterThan(0)
    for (const id of ids) expect(blockedInFree(id), id).toBe(false)
    expect(ids).not.toContain('settings')
    expect(ids).not.toContain('toDrawer')
  })
  it('スクリーニング条件を出さず、開こうとしてもスクリーナーのタブに切り替えない', () => {
    app.screens = [scr('a')]
    expect(S.paletteScreens()).toEqual([])
    S.openScreenAnywhere('a')
    expect(L.layout.doc.active).toBe('free')
    expect(L.allPanes(L.layout.entry).map((p) => p.widget)).toEqual(['divsim'])
  })
  it('ペインの見出しにドロワーへ移すボタンを出さない（分割・最大化は出す）', () => {
    expect(C.allowedHere('toDrawer')).toBe(false)
    expect(C.allowedHere('split')).toBe(true)
    expect(C.allowedHere('max')).toBe(true)
  })
})
