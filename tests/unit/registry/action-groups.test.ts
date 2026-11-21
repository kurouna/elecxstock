// アクションの分類（コマンドバーの段と札。docs/design-dialogs.md §3）: すべてのアクションに分類があり、名前が日英にある（L2）
import { describe, expect, it } from 'vitest'
import { stubWindow } from '../../support/window'

stubWindow()
const { ACTIONS } = await import('../../../src/renderer/lib/commands')
const { app } = await import('../../../src/renderer/stores/app.svelte')
const { ACTION_GROUPS, groupOf, CONTEXT_ACTIONS } = await import('../../../src/renderer/lib/palette')
const { ja, en } = await import('../../../src/renderer/lib/i18n')

describe('アクションの分類（FR-KB1, FR-KB9）', () => {
  it('すべてのアクションに決まった分類がある', () => {
    for (const a of ACTIONS) expect(ACTION_GROUPS, a.id).toContain(groupOf(a.id))
  })
  it('分類の名前（段の見出し・行の札）が日英にある', () => {
    for (const g of ACTION_GROUPS)
      for (const d of [ja, en] as Record<string, string>[]) {
        expect(d[`agroup.${g}`], g).toBeTruthy()
        expect(d[`agroupShort.${g}`], g).toBeTruthy()
      }
  })
  it('「このペインで」に出すアクションは実在する', () => {
    const ids = new Set(ACTIONS.map((a) => a.id))
    for (const [w, list] of Object.entries(CONTEXT_ACTIONS)) for (const id of list) expect(ids.has(id), `${w} ${id}`).toBe(true)
  })
})

describe('今使えないアクション（FR-KB9）: 表示と実行が同じ判定を使う', () => {
  it('一覧の操作は、フォーカス中のペインが受ける操作（runs）と一覧（columns）で決まる', async () => {
    const { registerPane } = await import('../../../src/renderer/lib/panes')
    const en = (id: string) => ACTIONS.find((a) => a.id === id)!.enabled?.() ?? null
    app.focus = 'p-test'
    expect(en('columns')).toBe('cmd.need.list')
    expect(en('limit')).toBe('cmd.need.screener')
    expect(en('duplicateList')).toBe('cmd.need.watchlist')
    expect(en('exportCsv')).toBe('cmd.need.list')
    // ランキングのように一覧（columns）を持っても run('columns') を受けないペインでは、列の選択は使えない
    const off = registerPane('p-test', { columns: () => ({ ids: [], cols: [], name: 'x' }) })
    expect(en('columns')).toBe('cmd.need.list')
    expect(en('exportCsv')).toBeNull()
    off()
    const off2 = registerPane('p-test', { runs: ['columns', 'limit'], columns: () => ({ ids: [], cols: [], name: 'x' }) })
    expect(en('columns')).toBeNull()
    expect(en('limit')).toBeNull()
    expect(en('duplicateList')).toBe('cmd.need.watchlist')
    off2()
    app.focus = null
  })
  it('リストに追加（addTo）: 銘柄が無ければ使えない。選択が空でもフォーカス中の銘柄で開く', async () => {
    const { registerPane } = await import('../../../src/renderer/lib/panes')
    const { layout } = await import('../../../src/renderer/stores/layout.svelte')
    const addTo = ACTIONS.find((a) => a.id === 'addTo')!
    const links = layout.doc.links
    layout.doc.links = {}
    app.focus = 'p-add'
    const off = registerPane('p-add', { selected: () => [] })
    expect(addTo.enabled?.() ?? null).toBe('cmd.need.symbol')
    off()
    // 一覧が空（選択 []）でも、フォーカス中の銘柄があれば足す先を選ぶダイアログを開く
    const off2 = registerPane('p-add', { selected: () => [], current: () => 'JP:7203' })
    expect(addTo.enabled?.() ?? null).toBeNull()
    app.overlay = null
    void addTo.run()
    // 代入で null に絞られた型を、run のあとの値として読み直す
    const opened = app.overlay as unknown as { kind: string; resolve: (v: string | null) => void } | null
    expect(opened?.kind).toBe('choice')
    opened?.resolve(null)
    app.overlay = null
    off2()
    layout.doc.links = links
    app.focus = null
  })
  it('判定に使う理由の文言は日英にある', () => {
    for (const k of ['cmd.need.list', 'cmd.need.screener', 'cmd.need.watchlist', 'cmd.need.symbol', 'cmd.need.drawer'])
      for (const d of [ja, en] as Record<string, string>[]) expect(d[k], k).toBeTruthy()
  })
  it('分類の表に無い ID は、決まった形（layout.・paneToEdge-・open.・page:）だけ', async () => {
    const { knownGroup } = await import('../../../src/renderer/lib/palette')
    expect(ACTIONS.filter((a) => !knownGroup(a.id)).map((a) => a.id)).toEqual([])
    expect(knownGroup('zzz')).toBe(false)
  })
})
