// ショートカット一覧の並びと絞り込み（docs/design-dialogs.md §4。FR-KB7）
import { describe, expect, it } from 'vitest'
import { filterShortcuts, type ShortcutRow, sectionOrder } from '../../../src/renderer/lib/shortcuts'

const R = (sec: ShortcutRow['sec'], ja: string, en: string, keys: string, act?: string, alias?: string[]): ShortcutRow => ({
  sec,
  grp: ['表示', 'View'],
  label: [ja, en],
  ...(act ? { act } : { keys }),
  ...(alias ? { alias } : {}),
})
const rows = [
  R('chart', '対数軸', 'Log scale', 'L', undefined, ['ログ']),
  R('chart', '表示期間', 'Visible period', 'Alt+1–6'),
  R('grid', '全タイルの期間', 'All tiles: period', 'D W M / Alt+1–6'),
  R('general', 'ペインの種類を変える', 'Change pane type', '', 'changeWidget'),
]
const keyOf = (id: string) => (id === 'changeWidget' ? 'Ctrl+Shift+N' : '')

describe('ショートカット一覧の並び（FR-KB7）', () => {
  it('フォーカス中のペインの段を先頭に、ほかは決まった順', () => {
    const o = sectionOrder('chart')
    expect(o[0]).toBe('chart')
    expect(o.filter((s) => s === 'chart')).toHaveLength(1)
    expect(sectionOrder('')[0]).toBe('general')
  })
})

describe('ショートカット一覧の絞り込み（FR-KB7）', () => {
  it('文字で: 名前・別名・キーの表記で当てる（言語ごと）', () => {
    expect(filterShortcuts(rows, { q: '対数', combo: '', lang: 'ja', keyOf }).map((x) => x.row.label[0])).toEqual(['対数軸'])
    expect(filterShortcuts(rows, { q: 'ろぐ', combo: '', lang: 'ja', keyOf }).map((x) => x.row.label[0])).toEqual(['対数軸'])
    expect(filterShortcuts(rows, { q: 'period', combo: '', lang: 'en', keyOf })).toHaveLength(2)
    // キーの表記（アクションは今の割り当て）
    expect(filterShortcuts(rows, { q: 'ctrl+shift', combo: '', lang: 'ja', keyOf }).map((x) => x.row.act)).toEqual(['changeWidget'])
    expect(filterShortcuts(rows, { q: '', combo: '', lang: 'ja', keyOf })).toHaveLength(4)
  })
  it('キーを押して: その組み合わせを使う行だけ（範囲にも当たる）', () => {
    expect(filterShortcuts(rows, { q: '', combo: 'Alt+3', lang: 'ja', keyOf }).map((x) => x.row.label[0])).toEqual([
      '表示期間',
      '全タイルの期間',
    ])
    expect(filterShortcuts(rows, { q: '', combo: 'Ctrl+Shift+N', lang: 'ja', keyOf }).map((x) => x.row.act)).toEqual(['changeWidget'])
    expect(filterShortcuts(rows, { q: '', combo: 'Ctrl+Q', lang: 'ja', keyOf })).toEqual([])
  })
  it('当たった文字の範囲を返す', () => {
    expect(filterShortcuts(rows, { q: '期間', combo: '', lang: 'ja', keyOf })[0]!.ranges).toEqual([[2, 4]])
  })
})

describe('ショートカット一覧の段の中と段の移動（FR-KB7）', () => {
  it('blocks: 続いた同じ小見出しを 1 つのまとまりに', async () => {
    const { blocks } = await import('../../../src/renderer/lib/shortcuts')
    const g = (ja: string) => ({ row: { grp: [ja, ja] } }) as never
    expect(blocks([g('a'), g('a'), g('b'), g('a')]).map((b) => [b.grp[0], b.items.length])).toEqual([
      ['a', 2],
      ['b', 1],
      ['a', 1],
    ])
  })
  it('jumpSection: 前・次の段の先頭へ（端では止まる）', async () => {
    const { jumpSection } = await import('../../../src/renderer/lib/shortcuts')
    const secs = ['chart', 'chart', 'grid', 'grid', 'news'] as const
    expect(jumpSection(secs, 0, 1)).toBe(2)
    expect(jumpSection(secs, 3, 1)).toBe(4)
    expect(jumpSection(secs, 4, 1)).toBe(4)
    expect(jumpSection(secs, 3, -1)).toBe(0)
    expect(jumpSection(secs, 1, -1)).toBe(0)
    expect(jumpSection([], 0, 1)).toBe(0)
  })
})

describe('レイアウトのプリセットの行（FR-KB6, FR-KB7）', () => {
  it('既定のままなら Ctrl+Shift+1–9 の 1 つ。変えたら今の割り当てを並べる（外したものは出さない）', async () => {
    const { presetKeysText } = await import('../../../src/renderer/lib/shortcuts')
    const def = Array.from({ length: 9 }, (_, i) => `Ctrl+Shift+${i + 1}`)
    expect(presetKeysText(def)).toBe('Ctrl+Shift+1–9')
    const changed = [...def]
    changed[2] = 'Ctrl+Alt+3'
    changed[4] = ''
    expect(presetKeysText(changed)).toBe(
      'Ctrl+Shift+1 / Ctrl+Shift+2 / Ctrl+Alt+3 / Ctrl+Shift+4 / Ctrl+Shift+6 / Ctrl+Shift+7 / Ctrl+Shift+8 / Ctrl+Shift+9',
    )
  })
  it('ペインの中のキーの候補に、全体の段のキーは入れない', async () => {
    const { PANE_KEY_ROWS } = await import('../../../src/renderer/lib/shortcuts')
    expect(PANE_KEY_ROWS.length).toBeGreaterThan(50)
    expect(PANE_KEY_ROWS.every((r) => r.sec !== 'general' && !r.act)).toBe(true)
  })
})
