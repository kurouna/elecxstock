// 株価ボード（docs/design-quote-board.md。FR-QB1〜QB8）の純粋な関数。値は架空
import type { InstrumentId, MetricsRow, SavedScreen, Watchlist } from '@shared/types'
import { describe, expect, it, vi } from 'vitest'
import { isViewKey, otherView, withViewSwitch } from '../../../src/renderer/lib/paneView'
import {
  boardAsOf,
  boardBreadth,
  boardMove,
  boardRows,
  dayLabel,
  heldIds,
  type QbItem,
  type QbRect,
  readQbState,
  resolveSource,
  rowsInView,
  shortDate,
  sourceList,
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
    const s = readQbState({ qbView: 'table', qbSrc: 'wl:', qbSort: 'x', qbGroup: 3, qbSize: 4, qbIdx: 'yes', qbStar: 1 })
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
