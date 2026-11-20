// コマンドバーの候補の組み立て（docs/design-dialogs.md §3。FR-KB1・FR-KB9）
import { describe, expect, it } from 'vitest'
import { buildPalette, type PalAction, parseQuery, pushRecent } from '../../../src/renderer/lib/palette'

const act = (id: string, label: string, group: PalAction['group'], key = '', reason: string | null = null): PalAction => ({
  id,
  label,
  key,
  group,
  reason,
})
const ACTS = [
  act('alertNew', 'アラートを作る', 'alert', 'Ctrl+Alt+A'),
  act('exportHoldings', '保有の記録を JSON に書き出す', 'folio'),
  act('columns', '列の選択', 'sym', 'Ctrl+Shift+C', '一覧のペインにフォーカスしてから'),
  act('update', 'データを更新', 'data', 'F5'),
]
const sym = (code: string, name: string) => ({ id: `JP:${code}`, code, name })
const base = {
  scope: 'all' as const,
  actions: ACTS,
  screens: [{ id: 's1', name: '高配当・大型' }],
  syms: [] as ReturnType<typeof sym>[],
  widgets: [
    { id: 'heatmap' as const, name: 'ヒートマップ', alias: ['株価ボード'], current: false },
    { id: 'chart' as const, name: 'チャート', alias: [], current: true },
  ],
  paneKeys: [{ label: '対数軸', alias: ['ログ'], grp: '表示', sec: 'chart', keys: 'L' }],
  recentSyms: ['JP:7203'],
  recentActs: ['update'],
  context: ['alertNew'],
  contextName: 'チャート',
  symbolsOnly: false,
  tr: (k: string, a?: Record<string, string | number>) => (a ? `${k}${JSON.stringify(a)}` : k),
}

describe('コマンドバーの語（FR-KB9）', () => {
  it('接頭辞で範囲を決める（> アクション・# 条件・@ ペインの種類）', () => {
    expect(parseQuery('>保有', 'all')).toEqual({ scope: 'act', q: '保有' })
    expect(parseQuery('# 高配当', 'all')).toEqual({ scope: 'scr', q: '高配当' })
    expect(parseQuery('@ヒート', 'sym')).toEqual({ scope: 'pane', q: 'ヒート' })
    expect(parseQuery('　とよた ', 'all')).toEqual({ scope: 'all', q: 'とよた' })
    expect(parseQuery('', 'act')).toEqual({ scope: 'act', q: '' })
  })
})

describe('コマンドバーの候補（FR-KB1, FR-KB9）', () => {
  it('空のとき: 最近の銘柄（チップ）・最近使ったアクション・このペインで・分類ごとのすべてのアクション', () => {
    const gs = buildPalette({ ...base, q: '' })
    expect(gs.map((g) => g.id)).toEqual(['recentSyms', 'recentActs', 'context', 'ag:sym', 'ag:folio', 'ag:alert', 'ag:data'])
    expect(gs[0]!.chips).toBe(true)
    expect(gs[0]!.items).toEqual([{ kind: 'sym', id: 'JP:7203', ranges: [] }])
    // 分類の札は「最近」「このペイン」と検索結果だけに出す（分類の見出しの下では出さない）
    expect(gs[1]!.tags).toBe(true)
    expect(gs[3]!.tags).toBe(false)
  })
  it('打ったとき: 銘柄・条件・アクション（点数の順）・ペインの種類・ペインの中のキー（5 件まで）', () => {
    const gs = buildPalette({ ...base, q: '書き出', syms: [] })
    expect(gs.map((g) => g.id)).toEqual(['acts'])
    expect(gs[0]!.items[0]).toMatchObject({ kind: 'act', id: 'exportHoldings' })
    const all = buildPalette({ ...base, q: 'ヒート' })
    expect(all.find((g) => g.id === 'panes')!.items).toEqual([{ kind: 'pane', id: 'heatmap', ranges: [[0, 3]] }])
    const keys = buildPalette({ ...base, q: 'ろぐ' })
    expect(keys.find((g) => g.id === 'paneKeys')!.items).toMatchObject([{ kind: 'key', index: 0 }])
    // 語を分けても当たる
    expect(buildPalette({ ...base, q: '保有 書き出' }).flatMap((g) => g.items)).toMatchObject([{ kind: 'act', id: 'exportHoldings' }])
  })
  it('一覧に無いコードは「追加して取得する」を先頭に', () => {
    const gs = buildPalette({ ...base, q: '1234', syms: [] })
    expect(gs[0]!.items[0]).toEqual({ kind: 'add', code: '1234' })
    const hit = buildPalette({ ...base, q: '7203', syms: [sym('7203', 'トヨタ自動車')] })
    expect(hit[0]!.items.map((x) => x.kind)).toEqual(['sym'])
  })
  it('範囲を決めたら、その種類だけ', () => {
    expect(buildPalette({ ...base, q: '', scope: 'scr' }).map((g) => g.id)).toEqual(['screens'])
    expect(buildPalette({ ...base, q: '', scope: 'pane' }).map((g) => g.id)).toEqual(['panes'])
    expect(buildPalette({ ...base, q: '高', scope: 'act' })).toEqual([])
  })
  it('銘柄だけを選ぶとき（C キーの差し替え）は銘柄だけ', () => {
    expect(buildPalette({ ...base, q: 'デ', symbolsOnly: true, syms: [sym('7203', 'トヨタ')] }).map((g) => g.id)).toEqual(['syms'])
  })
})

describe('最近使ったもの（FR-KB9）', () => {
  it('先頭に足し、同じものは前から外し、決まった数まで', () => {
    expect(pushRecent(['act:a', 'sym:x'], 'sym:x', 3)).toEqual(['sym:x', 'act:a'])
    expect(pushRecent(['a', 'b', 'c'], 'd', 3)).toEqual(['d', 'a', 'b'])
    expect(pushRecent([], 'a', 3)).toEqual(['a'])
  })
})

describe('レビューの指摘の再現（FR-KB9）', () => {
  it('範囲が「銘柄」で空のとき、最近の銘柄のチップを出す', () => {
    expect(buildPalette({ ...base, q: '', scope: 'sym' }).map((g) => g.id)).toEqual(['recentSyms'])
  })
  it('recentOf: 最近使ったものを銘柄とアクションに分ける', async () => {
    const { recentOf } = await import('../../../src/renderer/lib/palette')
    expect(recentOf(['sym:JP:7203', 'act:max', 'sym:JP:8306', 'act:fav', 'act:update', 'act:close'])).toEqual({
      syms: ['JP:7203', 'JP:8306'],
      acts: ['max', 'fav', 'update'],
    })
    expect(recentOf([])).toEqual({ syms: [], acts: [] })
  })
  it('終値・前日比の書き方（言語に合わせ、値が無ければ空）', async () => {
    const { fmtClose, fmtChgPct } = await import('../../../src/renderer/lib/palette')
    expect(fmtClose(2841.5, 'ja')).toBe('2,841.5')
    expect(fmtClose(null, 'ja')).toBe('')
    expect(fmtChgPct(1.234)).toBe('+1.23%')
    expect(fmtChgPct(-0.5)).toBe('-0.50%')
    expect(fmtChgPct(0)).toBe('0.00%')
    expect(fmtChgPct(undefined)).toBe('')
  })
})
