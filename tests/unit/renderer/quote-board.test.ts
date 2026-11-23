// 株価ボード（docs/design-quote-board.md。FR-QB1〜QB8）の純粋な関数。値は架空
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { InstrumentId, MetricsRow, SavedScreen, Watchlist } from '@shared/types'
import { describe, expect, it, vi } from 'vitest'
import { wheelToX } from '../../../src/renderer/lib/hscroll'
import { isViewKey, otherView, withViewSwitch } from '../../../src/renderer/lib/paneView'
import {
  boardAsOf,
  boardBreadth,
  boardMove,
  boardRows,
  breadthShares,
  chgView,
  dayLabel,
  heldIds,
  keepIdsWhileLoading,
  nextOf,
  prevCloseOf,
  QB_SIZE_MAX,
  QB_SIZE_MIN,
  QB_SIZES,
  type QbItem,
  type QbRect,
  readQbState,
  resolveSource,
  rowsInView,
  shortDate,
  sizePos,
  sourceList,
  stepSize,
  stepSource,
  topByCap,
} from '../../../src/renderer/lib/quoteBoard'
import { holding, metricsRow } from '../../support/fixtures'

const id = (c: string) => `JP:${c}` as InstrumentId
const item = (c: string, m: Partial<MetricsRow> | null, o: Partial<QbItem> = {}): QbItem => ({
  id: id(c),
  m: m ? metricsRow({ id: id(c), asOf: '2026-11-13', close: 100, chg: 0, chgPct: 0, ...m }) : undefined,
  sector: '電気機器',
  reit: false,
  ...o,
})
const wl = (wid: string, builtin?: Watchlist['builtin']): Watchlist => ({
  id: wid,
  name: { ja: wid, en: wid },
  items: [],
  ...(builtin ? { builtin } : {}),
})
const scr = (sid: string): SavedScreen => ({ id: sid, name: { ja: sid, en: sid }, conditions: [], created: 0, updated: 0 })

describe('状態の読み取り（FR-QB1）', () => {
  it('無い状態は既定（ヒートマップ・時価総額の上位・登録順・分類なし・中の大きさ・指数あり・★のみでない）', () => {
    expect(readQbState(undefined)).toEqual({ view: 'map', src: 'cap', sort: 'reg', group: 'none', size: 2, idx: true, star: false })
  })
  it('壊れた値・知らない値は既定に戻す', () => {
    const s = readQbState({ qbView: 'table', qbSrc: 'wl:', qbSort: 'x', qbGroup: 3, qbSize: 7, qbIdx: 'yes', qbStar: 1 })
    expect(s).toEqual(readQbState({}))
  })
  it('qb で始まるキーだけを読む（ヒートマップの starOnly・period・sector は読まない）', () => {
    const s = readQbState({ starOnly: true, period: 2, sector: '電気機器', qbView: 'board', qbSrc: 'scr:a', qbStar: true, qbSize: 1 })
    expect(s.view).toBe('board')
    expect(s.src).toBe('scr:a')
    expect(s.star).toBe(true)
    expect(s.size).toBe(1)
    expect(readQbState({ starOnly: true }).star).toBe(false)
  })
})

describe('一覧の出どころ（FR-QB4）', () => {
  const lists = [wl('mine'), wl('favorites', 'favorites'), wl('candidates', 'candidates')]
  it('タブの順は 時価総額の上位・組み込みのリスト・利用者のリスト・保有・スクリーニング条件', () => {
    expect(sourceList(lists, [scr('a')])).toEqual(['cap', 'wl:favorites', 'wl:candidates', 'wl:mine', 'held', 'scr:a'])
  })
  it('消したウォッチリスト・スクリーンを指していたら cap に戻す', () => {
    const deps = { watchlists: lists, screens: [scr('a')] }
    expect(resolveSource('wl:mine', deps)).toBe('wl:mine')
    expect(resolveSource('wl:gone', deps)).toBe('cap')
    expect(resolveSource('scr:a', deps)).toBe('scr:a')
    expect(resolveSource('scr:gone', deps)).toBe('cap')
    expect(resolveSource('held', deps)).toBe('held')
    expect(resolveSource('???', deps)).toBe('cap')
  })
  it('G / Shift+G は一巡する。知らない出どころからは先頭の次', () => {
    const l = ['cap', 'wl:a', 'held']
    expect(stepSource('held', l, 1)).toBe('cap')
    expect(stepSource('cap', l, -1)).toBe('held')
    expect(stepSource('x', l, 1)).toBe('wl:a')
    expect(stepSource('cap', [], 1)).toBe('cap')
  })
  it('保有はウォッチリストの「保有」タブと同じ: 数量 0 を外し、口座の重複をまとめ、コード順', () => {
    const hs = [
      holding({ code: '8058', quantity: 100 }),
      holding({ code: '7203', quantity: 0 }),
      holding({ code: '1605', quantity: 10, account: 'nisa_growth' }),
      holding({ code: '1605', quantity: 5 }),
    ]
    expect(heldIds(hs)).toEqual(['JP:1605', 'JP:8058'])
  })
  it('時価総額の上位: 値の無い銘柄・0 以下は外し、同じ値は元の並び', () => {
    const caps: Record<string, number | null> = { 'JP:a': 10, 'JP:b': null, 'JP:c': 30, 'JP:d': 10, 'JP:e': 0 }
    const ids = ['JP:a', 'JP:b', 'JP:c', 'JP:d', 'JP:e'] as InstrumentId[]
    expect(topByCap(ids, (x) => caps[x], 3)).toEqual(['JP:c', 'JP:a', 'JP:d'])
    expect(topByCap(ids, (x) => caps[x], 1)).toEqual(['JP:c'])
  })
})

describe('並べ替え・★のみ・分類（FR-QB4）', () => {
  const items = [
    item('1', { chgPct: 1, turnover: 5 }),
    item('2', { chgPct: null, turnover: null }),
    item('3', { chgPct: -2, turnover: 9 }, { sector: '銀行業' }),
    item('4', { chgPct: 1, turnover: 1 }, { reit: true, sector: 'REIT' }),
  ]
  const codes = (g: { items: QbItem[] }[]) => g.map((x) => x.items.map((i) => i.id.slice(3)).join(''))
  it('登録順はそのまま', () => {
    expect(codes(boardRows(items, 'reg', 'none', false, () => true))).toEqual(['1234'])
  })
  it('騰落率の降順・昇順。値の無い銘柄は最後、同じ値は元の並び', () => {
    expect(codes(boardRows(items, 'pctD', 'none', false, () => true))).toEqual(['1432'])
    expect(codes(boardRows(items, 'pctA', 'none', false, () => true))).toEqual(['3142'])
  })
  it('売買代金の降順', () => {
    expect(codes(boardRows(items, 'valD', 'none', false, () => true))).toEqual(['3142'])
  })
  it('★のみは★の銘柄だけ', () => {
    expect(codes(boardRows(items, 'reg', 'none', true, (x) => x === id('3') || x === id('4')))).toEqual(['34'])
  })
  it('業種が空の銘柄（ETF など）は「—」の見出しにまとめる（ヒートマップの sectorTileKey と同じ）', () => {
    const g = boardRows([item('1', {}), item('2', {}, { sector: '' })], 'reg', 'sector', false, () => true)
    expect(g.map((x) => x.key)).toEqual(['電気機器', '—'])
  })
  it('業種・株と REIT で分類し、分類の順は最初に出た順。並べ替えは分類の中にも効く', () => {
    const g = boardRows(items, 'pctA', 'sector', false, () => true)
    expect(g.map((x) => x.key)).toEqual(['銀行業', '電気機器', 'REIT'])
    expect(codes(g)).toEqual(['3', '12', '4'])
    expect(boardRows(items, 'reg', 'kind', false, () => true).map((x) => x.key)).toEqual(['stock', 'reit'])
  })
})

describe('騰落の帯（FR-QB6）', () => {
  it('上昇・下落・変わらずを数え、単純平均を出す', () => {
    const b = boardBreadth([item('1', { chg: 5, chgPct: 2 }), item('2', { chg: -1, chgPct: -1 }), item('3', { chg: 0, chgPct: 0 })])
    expect(b).toEqual({ up: 1, down: 1, flat: 1, stale: 0, avgPct: 1 / 3 })
  })
  it('未更新（stale）は数・平均に入れず、別に数える。0 件なら 0（帯に出さない）', () => {
    const b = boardBreadth([item('1', { chg: 5, chgPct: 4 }), item('2', { chg: -9, chgPct: -9, stale: true })])
    expect(b.up).toBe(1)
    expect(b.down).toBe(0)
    expect(b.stale).toBe(1)
    expect(b.avgPct).toBe(4)
    expect(boardBreadth([item('1', { chg: 1, chgPct: 1 })]).stale).toBe(0)
  })
  it('値の無い銘柄（指標が無い・close が無い）は未更新にも数えない。数える銘柄が無ければ平均は null', () => {
    const b = boardBreadth([item('1', null), item('2', { close: null, stale: true })])
    expect(b).toEqual({ up: 0, down: 0, flat: 0, stale: 0, avgPct: null })
  })
})

describe('騰落の数の欠損（FR-QB6）', () => {
  it('前日比が NaN・Infinity の銘柄は数えない', () => {
    const b = boardBreadth([
      item('1', { chg: Number.NaN, chgPct: Number.NaN }),
      item('2', { chg: 1, chgPct: Number.POSITIVE_INFINITY }),
      item('3', { chg: 2, chgPct: 1 }),
    ])
    expect(b).toEqual({ up: 1, down: 0, flat: 0, stale: 0, avgPct: 1 })
  })
})

describe('前日比の色と矢印（FR-QB2）', () => {
  it('表示の桁で丸めて 0 になる値は変わらず（色・矢印なし）。符号の書き方（sgn）とそろう', () => {
    expect(chgView(0.2, 0)).toEqual({ cls: 'flat', arrow: '' })
    expect(chgView(-0.04, 1)).toEqual({ cls: 'flat', arrow: '' })
    expect(chgView(0.06, 1)).toEqual({ cls: 'up', arrow: '▲' })
    expect(chgView(-12, 0)).toEqual({ cls: 'down', arrow: '▼' })
    expect(chgView(0, 0)).toEqual({ cls: 'flat', arrow: '' })
    expect(chgView(null, 0)).toEqual({ cls: '', arrow: '' })
  })
})

describe('取り直しの間の一覧（FR-QB8。新しい値が届いてから置き換える）', () => {
  it('同じ出どころの取り直しの間は前の一覧のまま。別の出どころへ替えたときだけ読み込み中（null）', () => {
    const prev = [id('1'), id('2')]
    expect(keepIdsWhileLoading('scr:a', 'scr:a', prev)).toBe(prev)
    expect(keepIdsWhileLoading('scr:a', 'scr:b', prev)).toBeNull()
    expect(keepIdsWhileLoading(null, 'scr:a', null)).toBeNull()
  })
})

describe('基準日（FR-QB3）', () => {
  it('最も新しい asOf と、その前の営業日（週末をまたぐ）', () => {
    const r = boardAsOf([item('1', { asOf: '2026-11-12' }), item('2', { asOf: '2026-11-16' })])
    expect(r).toEqual({ date: '2026-11-16', prev: '2026-11-13', provisional: false })
  })
  it('祝日をまたぐ（2026-11-23 勤労感謝の日の翌日の前の営業日は 11-20）', () => {
    expect(boardAsOf([item('1', { asOf: '2026-11-24' })]).prev).toBe('2026-11-20')
  })
  it('その日の値に仮の足が混じれば provisional。古い日の仮は数えない', () => {
    expect(boardAsOf([item('1', { asOf: '2026-11-13', provisional: true }), item('2', { asOf: '2026-11-13' })]).provisional).toBe(true)
    expect(boardAsOf([item('1', { asOf: '2026-11-12', provisional: true }), item('2', { asOf: '2026-11-13' })]).provisional).toBe(false)
  })
  it('見出しの日付は曜日つき（日本語・英語）。カードの日付は月/日', () => {
    expect(dayLabel('2026-11-13', 'ja')).toBe('11/13(金)')
    expect(dayLabel('2026-11-16', 'en')).toBe('11/16 (Mon)')
    expect(shortDate('2026-01-05')).toBe('1/5')
  })
  it('値が無ければ null', () => {
    expect(boardAsOf([item('1', null)])).toEqual({ date: null, prev: null, provisional: false })
  })
})

describe('カードの移動（FR-QB8）', () => {
  // 3 列 × 2 行 + 最後の短い行（1 枚）。2 行目の後に分類の見出し（高さ 20）を挟む
  const R = (x: number, y: number): QbRect => ({ x: x * 100, y, w: 100, h: 60 })
  const rects = [R(0, 0), R(1, 0), R(2, 0), R(0, 60), R(1, 60), R(2, 60), R(0, 140)]
  it('← → は読む順で、端で止まる', () => {
    expect(boardMove(rects, 0, 'left')).toBe(0)
    expect(boardMove(rects, 2, 'right')).toBe(3)
    expect(boardMove(rects, 6, 'right')).toBe(6)
  })
  it('↑ ↓ は上下の行で横の位置が最も近いカード。分類の見出しをまたぎ、最後の短い行にも入る', () => {
    expect(boardMove(rects, 1, 'down')).toBe(4)
    expect(boardMove(rects, 5, 'down')).toBe(6)
    expect(boardMove(rects, 6, 'up')).toBe(3)
    expect(boardMove(rects, 0, 'up')).toBe(0)
    expect(boardMove(rects, 6, 'down')).toBe(6)
  })
  it('PgUp / PgDn は見えている行の数だけ。Home / End は先頭と最後。空なら 0', () => {
    expect(boardMove(rects, 0, 'pageDown', 2)).toBe(6)
    expect(boardMove(rects, 6, 'pageUp', 5)).toBe(0)
    expect(boardMove(rects, 4, 'home')).toBe(0)
    expect(boardMove(rects, 0, 'end')).toBe(6)
    expect(boardMove([], 3, 'down')).toBe(0)
  })
  it('見えている行の数は少なくとも 1', () => {
    expect(rowsInView(400, 65)).toBe(5)
    expect(rowsInView(50, 65)).toBe(1)
    expect(rowsInView(400, 0)).toBe(1)
  })
})

describe('表示の切り替え（FR-QB1）', () => {
  const ev = (o: Partial<KeyboardEvent>) =>
    ({
      code: 'KeyV',
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      shiftKey: false,
      isComposing: false,
      keyCode: 86,
      ...o,
    }) as KeyboardEvent
  it('修飾なしの V だけを取る。修飾つき・IME の変換中は元の key に渡す', () => {
    const toggle = vi.fn()
    const key = vi.fn(() => true)
    const api = withViewSwitch({ key }, toggle)
    expect(api.key!(ev({}))).toBe(true)
    expect(toggle).toHaveBeenCalledTimes(1)
    expect(key).not.toHaveBeenCalled()
    for (const o of [{ ctrlKey: true }, { shiftKey: true }, { altKey: true }, { isComposing: true }, { keyCode: 229 }, { code: 'KeyP' }])
      api.key!(ev(o))
    expect(toggle).toHaveBeenCalledTimes(1)
    expect(key).toHaveBeenCalledTimes(6)
  })
  it('ほかの項目はそのまま。元に key が無ければ V 以外は false', () => {
    const current = () => id('7203')
    const api = withViewSwitch({ current }, () => {})
    expect(api.current).toBe(current)
    expect(api.key!(ev({ code: 'KeyP' }))).toBe(false)
    expect(isViewKey(ev({}))).toBe(true)
    expect(otherView('map')).toBe('board')
    expect(otherView('board')).toBe('map')
  })
})

describe('画面の計算（コンポーネントから移したもの。FR-QB4, FR-QB6, FR-QB7）', () => {
  it('前日終値は 終値 − 前日比。どちらかが無い・数でなければ null', () => {
    expect(prevCloseOf({ close: 573, chg: -1 })).toBe(574)
    expect(prevCloseOf({ close: 573, chg: null })).toBeNull()
    expect(prevCloseOf({ close: null, chg: 1 })).toBeNull()
    expect(prevCloseOf({ close: Number.NaN, chg: 1 })).toBeNull()
    expect(prevCloseOf(undefined)).toBeNull()
  })
  it('騰落の帯の割合は合計 100。数える銘柄が無ければすべて 0', () => {
    expect(breadthShares({ up: 1, flat: 2, down: 1 })).toEqual({ up: 25, flat: 50, down: 25 })
    expect(breadthShares({ up: 0, flat: 0, down: 0 })).toEqual({ up: 0, flat: 0, down: 0 })
  })
  it('大きさは 0〜6 で止まる（1〜3 は前からの段。0 は縮小・4〜6 は拡大の方向に足した段）', () => {
    expect(stepSize(2, 1)).toBe(3)
    expect(stepSize(3, 1)).toBe(4)
    expect(stepSize(5, 1)).toBe(6)
    expect(stepSize(6, 1)).toBe(6)
    expect(stepSize(1, -1)).toBe(0)
    expect(stepSize(0, -1)).toBe(0)
    expect([QB_SIZE_MIN, QB_SIZE_MAX]).toEqual([0, 6])
  })
  it('保存した大きさは 0〜6 の整数だけを読む（前の版の 1〜3 はそのまま）', () => {
    for (const n of [0, 1, 2, 3, 4, 5, 6]) expect(readQbState({ qbSize: n }).size).toBe(n)
    for (const n of [-1, 7, 2.5, '3', null]) expect(readQbState({ qbSize: n }).size).toBe(2)
  })
  it('今の段の位置は 1 から数える（ツールチップの「大きさ 1/7」〜「7/7」）', () => {
    expect(sizePos(0)).toEqual({ n: 1, total: 7 })
    expect(sizePos(2)).toEqual({ n: 3, total: 7 })
    expect(sizePos(6)).toEqual({ n: 7, total: 7 })
  })
  it('QB_SIZES の段ごとに見た目（.grid.s<段> の幅・高さ・終値の文字）があり、余分な段の規則が無い', () => {
    const css = readFileSync(join(__dirname, '../../../src/renderer/components/widgets/QuoteBoard.svelte'), 'utf8')
      .split('<style>')[1]!
      .replace(/\/\*[\s\S]*?\*\//g, '')
    const rule = (n: number) => css.match(new RegExp(`\\.grid\\.s${n}\\s*\\{([^}]*)\\}`))?.[1] ?? ''
    for (const n of QB_SIZES) {
      for (const v of ['--tile-w', '--tile-h', '--price-fs']) expect(rule(n), `.grid.s${n} ${v}`).toContain(`${v}:`)
    }
    const declared = [...css.matchAll(/\.grid\.s(\d+)\s*\{/g)].map((m) => Number(m[1]))
    expect(declared.sort((a, b) => a - b)).toEqual([...QB_SIZES])
  })
  it('並べ替え・分類の次は一巡する。知らない値からは先頭の次', () => {
    expect(nextOf(['a', 'b', 'c'], 'c')).toBe('a')
    expect(nextOf(['a', 'b', 'c'], 'a')).toBe('b')
    expect(nextOf(['a', 'b', 'c'], 'x')).toBe('b')
  })
})

describe('タブの帯のホイール（FR-KB4。マウスでも溢れたタブに届く）', () => {
  it('縦の回転が主なら縦の量で横に送る。横の回転が主ならブラウザに任せる（null）', () => {
    expect(wheelToX(0, 120)).toBe(120)
    expect(wheelToX(5, -100)).toBe(-100)
    expect(wheelToX(80, 10)).toBeNull()
    expect(wheelToX(0, 0)).toBeNull()
  })
  it('Ctrl・Cmd つきのホイール（表示倍率の操作）は横に送らない（ブラウザ・アプリに任せる）', () => {
    expect(wheelToX(0, 120, true)).toBeNull()
    expect(wheelToX(0, 120, false)).toBe(120)
  })
})
