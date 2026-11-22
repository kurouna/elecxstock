// ペインの種類を選ぶダイアログの判定（docs/design-dialogs.md §5。§6.5「一覧から選ぶ」・FR-L7・FR-L11）
import { describe, expect, it } from 'vitest'
import { type Card, gridMove, pickerGroups, pickOutcome } from '../../../src/renderer/lib/widgetPicker'

const tr = (k: string) => {
  const d: Record<string, string> = {
    'widget.chart': 'チャート',
    'widget.mtf': 'マルチ時間軸',
    'widget.heatmap': 'ヒートマップ',
    'widget.market': 'マーケット',
    'widget.board': 'マーケット一覧',
    'widget.divsim': '配当シミュレータ',
    'widget.divcal': '配当カレンダー',
    'widget.jobs': 'ジョブ',
    'widgetAlias.heatmap': 'ぎょうしゅ,株価ボード,カード',
    'widgetAlias.mtf': 'MTF',
    'widgetAlias.divsim': 'はいとう',
    'widgetAlias.divcal': 'はいとう',
    'widgetAlias.jobs': 'ログ',
  }
  return d[k] ?? (k.startsWith('widgetAlias.') ? '' : k)
}
const base = { q: '', free: false, current: 'chart' as const, counts: {}, tr }
const ids = (gs: ReturnType<typeof pickerGroups>) => gs.flatMap((g) => g.cards.map((c) => c.id))

describe('ペインの種類の一覧（§6.5, FR-L7）', () => {
  it('5 つの分類の順に、すべての種類を出す（ニュースは「その他」）', () => {
    const gs = pickerGroups(base)
    expect(gs.map((g) => g.group)).toEqual(['view', 'compare', 'market', 'folio', 'other'])
    expect(ids(gs)).toHaveLength(18)
    expect(gs.find((g) => g.group === 'other')!.cards.map((c) => c.id)).toEqual(['news', 'jobs'])
    expect(gs.every((g) => g.cards.length <= 4)).toBe(true)
  })
  it('名前・別名・読みで絞り込み、当たらない分類は出さない', () => {
    expect(ids(pickerGroups({ ...base, q: '株価ボード' }))).toEqual(['heatmap'])
    expect(ids(pickerGroups({ ...base, q: 'mtf' }))).toEqual(['mtf'])
    expect(ids(pickerGroups({ ...base, q: 'はいとう' }))).toEqual(['divcal', 'divsim'])
    expect(ids(pickerGroups({ ...base, q: 'ろぐ' }))).toEqual(['jobs'])
    const m = pickerGroups({ ...base, q: 'マーケット' })
    expect(ids(m)).toEqual(['market', 'board'])
    expect(m[0]!.cards[0]!.ranges).toEqual([[0, 5]])
    expect(pickerGroups({ ...base, q: 'zzz' })).toEqual([])
  })
  it('今の種類に印、このタブにある数（対象のペインは数えない）', () => {
    const gs = pickerGroups({ ...base, counts: { chart: 2, heatmap: 1 } })
    const c = (id: string) => gs.flatMap((g) => g.cards).find((x) => x.id === id)!
    expect(c('chart').current).toBe(true)
    expect(c('chart').inTab).toBe(1)
    expect(c('heatmap').inTab).toBe(1)
    expect(c('mtf').inTab).toBe(0)
    // 分割では今の種類は無い
    const sp = pickerGroups({ ...base, current: null, counts: { chart: 2 } })
    expect(sp.flatMap((g) => g.cards).find((x) => x.id === 'chart')!).toMatchObject({ current: false, inTab: 2 })
  })
  it('フリー N では 6 種類だけ選べ、ほかは消さずに選べない印を付ける（FR-L7）', () => {
    const gs = pickerGroups({ ...base, free: true })
    const cards = gs.flatMap((g) => g.cards)
    expect(cards).toHaveLength(18)
    expect(
      cards
        .filter((c) => !c.disabled)
        .map((c) => c.id)
        .sort(),
    ).toEqual(['chart', 'divsim', 'grid', 'info', 'mtf', 'perf'])
  })
})

describe('カードの格子をキーで動く（§5, FR-KB2）', () => {
  const card = (id: string, disabled = false) => ({ id, disabled }) as Card
  // 4 列: [a b c] / [d e f g] / [h] の 3 つの分類
  const gs = [{ cards: [card('a'), card('b'), card('c')] }, { cards: [card('d'), card('e'), card('f'), card('g')] }, { cards: [card('h')] }]
  it('← → は同じ行。行の端では読む順の前後へ', () => {
    expect(gridMove(gs, 4, 'a', 'right')).toBe('b')
    expect(gridMove(gs, 4, 'c', 'right')).toBe('d')
    expect(gridMove(gs, 4, 'd', 'left')).toBe('c')
    expect(gridMove(gs, 4, 'a', 'left')).toBe('a')
    expect(gridMove(gs, 4, 'h', 'right')).toBe('h')
  })
  it('↑ ↓ は次の行の近い列。下にカードが無ければ読む順の次へ（同じ行の 2 枚目にも行ける）', () => {
    expect(gridMove(gs, 4, 'b', 'down')).toBe('e')
    expect(gridMove(gs, 4, 'f', 'up')).toBe('c')
    expect(gridMove(gs, 4, 'g', 'up')).toBe('c')
    expect(gridMove(gs, 4, 'e', 'down')).toBe('h')
    expect(gridMove(gs, 4, 'h', 'down')).toBe('h')
    // 絞り込みで 1 行に 2 枚: ↓ で 2 枚目へ
    const one = [{ cards: [card('market'), card('board')] }]
    expect(gridMove(one, 4, 'market', 'down')).toBe('board')
    expect(gridMove(one, 4, 'board', 'up')).toBe('market')
  })
  it('選べないカードは飛ばす。next / prev は読む順', () => {
    const g2 = [{ cards: [card('a'), card('b', true), card('c')] }, { cards: [card('d', true), card('e')] }]
    expect(gridMove(g2, 4, 'a', 'right')).toBe('c')
    expect(gridMove(g2, 4, 'c', 'down')).toBe('e')
    expect(gridMove(g2, 4, 'a', 'down')).toBe('e')
    expect(gridMove(g2, 4, 'c', 'next')).toBe('e')
    expect(gridMove(g2, 4, 'e', 'prev')).toBe('c')
    // 2 列のとき
    expect(gridMove(gs, 2, 'a', 'down')).toBe('c')
  })
})

describe('変えると何が起きるか（FR-L11）', () => {
  it('リンク色があればリンクの銘柄に従い、無ければ銘柄を引き継ぐ。今の種類なら何もしない', () => {
    expect(pickOutcome({ mode: 'change', current: 'chart', target: 'chart', link: 1, inTab: 0 })).toEqual({ kind: 'same' })
    expect(pickOutcome({ mode: 'change', current: 'chart', target: 'info', link: 2, inTab: 0 })).toEqual({
      kind: 'change',
      follow: 'link',
      link: 2,
      resets: true,
      inTab: 0,
    })
    expect(pickOutcome({ mode: 'change', current: 'chart', target: 'info', link: 0, inTab: 1 })).toEqual({
      kind: 'change',
      follow: 'own',
      link: 0,
      resets: true,
      inTab: 1,
    })
    expect(pickOutcome({ mode: 'split', dir: 'col', current: null, target: 'chart', link: 1, inTab: 2 })).toEqual({
      kind: 'split',
      follow: 'link',
      link: 1,
      resets: false,
      inTab: 2,
      dir: 'col',
    })
  })
})
describe('このタブにある種類の数（§5）', () => {
  it('ペインの種類ごとに数える', async () => {
    const { paneCounts } = await import('../../../src/renderer/lib/widgetPicker')
    expect(paneCounts([{ widget: 'chart' }, { widget: 'chart' }, { widget: 'info' }] as never)).toEqual({ chart: 2, info: 1 })
    expect(paneCounts([])).toEqual({})
  })
})
describe('下の段の文（FR-L11）', () => {
  it('引き継ぐ銘柄・設定が戻ること・このタブにある数を 2 行に', async () => {
    const { outcomeText } = await import('../../../src/renderer/lib/widgetPicker')
    const tr = (k: string, a?: Record<string, string | number>) => `${k}${a ? JSON.stringify(a) : ''}`
    expect(outcomeText({ kind: 'same' }, { tr, sym: '', curName: 'チャート' })).toEqual(['wpick.same', ''])
    expect(
      outcomeText({ kind: 'change', follow: 'link', link: 2, resets: true, inTab: 0 }, { tr, sym: '7203 トヨタ', curName: 'チャート' }),
    ).toEqual(['wpick.followLinkSym{"n":2,"sym":"7203 トヨタ"}', 'wpick.resets{"name":"チャート"}'])
    expect(outcomeText({ kind: 'change', follow: 'own', link: 0, resets: true, inTab: 1 }, { tr, sym: '', curName: 'チャート' })).toEqual([
      'wpick.keepNone',
      'wpick.resets{"name":"チャート"} · wpick.already{"n":1}',
    ])
    // 分割は、どこに何を足すかを先に（docs/mock/panetype.html）
    expect(
      outcomeText(
        { kind: 'split', follow: 'link', link: 1, resets: false, inTab: 0, dir: 'row' },
        { tr, sym: '', curName: '', targetName: 'チャート' },
      ),
    ).toEqual(['wpick.addRow{"name":"チャート"} wpick.followLink{"n":1}', ''])
    expect(
      outcomeText(
        { kind: 'split', follow: 'own', link: 0, resets: false, inTab: 0, dir: 'col' },
        { tr, sym: '', curName: '', targetName: '保有' },
      ),
    ).toEqual(['wpick.addCol{"name":"保有"} wpick.keepNone', ''])
  })
})
describe('選ぶカード（§5）', () => {
  it('初めは今の種類。打ったら今の種類以外の先頭（Enter で何も起きないのを避ける）。選んでいるカードが残れば動かさない', async () => {
    const { pickSel } = await import('../../../src/renderer/lib/widgetPicker')
    expect(pickSel(['chart', 'mtf', 'info'], 'chart', '', null)).toBe('chart')
    expect(pickSel(['chart', 'mtf'], 'chart', 'ちゃ', 'chart')).toBe('mtf')
    expect(pickSel(['chart'], 'chart', 'ちゃ', 'chart')).toBe('chart')
    expect(pickSel(['mtf', 'info'], 'chart', 'm', 'info')).toBe('info')
    expect(pickSel(['mtf', 'info'], null, 'm', 'grid')).toBe('mtf')
    expect(pickSel([], 'chart', 'zzz', 'chart')).toBeNull()
  })
})
