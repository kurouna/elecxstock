// チャートの描画（トレンドライン）の純粋な関数（FR-C13・C14・C16。docs/design-drawings.md）。値はすべて架空
import { splitFactor } from '@core/series'
import {
  covers,
  type Drawing,
  type DrawMode,
  distToSegment,
  extendNext,
  indexOfDate,
  nearestSnap,
  nextSelection,
  nextSnap,
  normalizeDrawing,
  readDrawings,
  segment,
  selectionOrder,
  snapLevels,
  splitFactorAt,
  step,
  swingFrom,
  tileLines,
  toRaw,
  toShown,
  yAtX,
} from '@shared/drawings'
import { describe, expect, it } from 'vitest'
import { parseHit } from '../../../src/renderer/lib/drawings/primitive'

const trend = (o: Partial<Drawing> = {}): Drawing =>
  ({
    id: 'd1',
    kind: 'trend',
    a: { date: '2026-10-01', raw: 1000 },
    b: { date: '2026-11-02', raw: 1200 },
    extend: 'none',
    priceLabel: true,
    log: false,
    created: '2026-11-13T09:00:00.000Z',
    updated: '2026-11-13T09:00:00.000Z',
    ...o,
  }) as Drawing

describe('日付 → 足の論理番号（FR-C13）', () => {
  const D = ['2026-11-02', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-09']
  it('日足: その日以前で最後の足。休日は前の足', () => {
    expect(indexOfDate('2026-11-02', D, 'D')).toBe(0)
    expect(indexOfDate('2026-11-03', D, 'D')).toBe(0) // 文化の日
    expect(indexOfDate('2026-11-04', D, 'D')).toBe(1)
    expect(indexOfDate('2026-11-08', D, 'D')).toBe(3) // 日曜
    expect(indexOfDate('2026-11-09', D, 'D')).toBe(4)
  })
  it('日足: 最後の足より後は営業日の数で外挿する', () => {
    expect(indexOfDate('2026-11-10', D, 'D')).toBe(5)
    // 11/10〜11/24 の営業日（11/23 は勤労感謝の日）は 10 日
    expect(indexOfDate('2026-11-24', D, 'D')).toBe(14)
    expect(indexOfDate('2026-11-23', D, 'D')).toBe(13)
  })
  it('日足: 最初の足より前は負の番号に外挿する', () => {
    expect(indexOfDate('2026-10-30', D, 'D')).toBe(-1)
    expect(indexOfDate('2026-11-01', D, 'D')).toBe(-1) // 日曜は前の金曜
    expect(indexOfDate('2026-10-29', D, 'D')).toBe(-2)
  })
  it('週足: その日を含む週の足。範囲の外は週の数で外挿する', () => {
    const W = ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-24']
    expect(indexOfDate('2026-11-05', W, 'W')).toBe(0)
    expect(indexOfDate('2026-11-20', W, 'W')).toBe(2)
    expect(indexOfDate('2026-11-23', W, 'W')).toBe(2) // 月曜が休日の週の足は火曜から。月曜はその前の足
    expect(indexOfDate('2026-11-27', W, 'W')).toBe(3)
    expect(indexOfDate('2026-12-02', W, 'W')).toBe(4)
    expect(indexOfDate('2026-10-28', W, 'W')).toBe(-1)
    expect(indexOfDate('2026-10-20', W, 'W')).toBe(-2)
  })
  it('月足: その日を含む月の足。範囲の外は月の数で外挿する', () => {
    const M = ['2026-09-01', '2026-10-01', '2026-11-02']
    expect(indexOfDate('2026-10-15', M, 'M')).toBe(1)
    expect(indexOfDate('2026-11-30', M, 'M')).toBe(2)
    expect(indexOfDate('2027-01-10', M, 'M')).toBe(4)
    expect(indexOfDate('2026-07-31', M, 'M')).toBe(-2)
  })
  it('足が無ければ NaN', () => {
    expect(indexOfDate('2026-11-02', [], 'D')).toBeNaN()
  })
})

describe('価格の換算（FR-C16）', () => {
  const splits = [{ date: '2026-06-01', ratio: 2 }]
  it('分割係数は Core の splitFactor と同じ', () => {
    for (const d of ['2026-05-29', '2026-06-01', '2026-06-02']) expect(splitFactorAt(d, splits)).toBe(splitFactor(d, splits as never))
  })
  it('分割調整の表示は 未調整 ÷ 係数、未調整の表示はそのまま、配当込みは出さない', () => {
    expect(toShown(2000, '2026-05-01', 'split', splits)).toBe(1000)
    expect(toShown(1000, '2026-07-01', 'split', splits)).toBe(1000)
    expect(toShown(2000, '2026-05-01', 'unadjusted', splits)).toBe(2000)
    expect(toShown(2000, '2026-05-01', 'total', splits)).toBeNull()
  })
  it('表示 → 未調整 → 表示 で戻る', () => {
    for (const adj of ['split', 'unadjusted'] as const)
      for (const d of ['2026-05-01', '2026-06-01', '2026-07-01'])
        expect(toShown(toRaw(1234, d, adj, splits)!, d, adj, splits)).toBeCloseTo(1234, 9)
    expect(toRaw(1000, '2026-05-01', 'total', splits)).toBeNull()
  })
  it('分割を取り込む前に引いた線も、取り込んだ後に足とそろう（作った日を基準にしない）', () => {
    // 分割を知らないうちに、分割の前の日（足は 2000 円）と後の日（1000 円）に点を置いた
    const a = toRaw(2000, '2026-05-01', 'split', [])!
    const b = toRaw(1000, '2026-06-02', 'split', [])!
    // 分割を取り込むと、前の日の足は 1000 円に調整される。線も同じ所に出る
    expect(toShown(a, '2026-05-01', 'split', splits)).toBe(1000)
    expect(toShown(b, '2026-06-02', 'split', splits)).toBe(1000)
  })
})

describe('吸着の点（FR-C14）', () => {
  it('OHLC を値の大きい順に、同じ値はまとめる。ラインは終値だけ', () => {
    expect(snapLevels({ o: 100, h: 110, l: 90, c: 105 }, 'candle')).toEqual([
      { k: 'h', v: 110 },
      { k: 'c', v: 105 },
      { k: 'o', v: 100 },
      { k: 'l', v: 90 },
    ])
    expect(snapLevels({ o: 100, h: 100, l: 90, c: 90 }, 'bar').map((x) => x.k)).toEqual(['h', 'l'])
    expect(snapLevels({ o: 100, h: 110, l: 90, c: 105 }, 'line')).toEqual([{ k: 'c', v: 105 }])
  })
  it('↑ ↓ で隣の点へ。端では止まる', () => {
    const lv = snapLevels({ o: 100, h: 110, l: 90, c: 105 }, 'candle')
    expect(nextSnap(lv, 110, -1).k).toBe('c')
    expect(nextSnap(lv, 105, -1).k).toBe('o')
    expect(nextSnap(lv, 90, -1).k).toBe('l')
    expect(nextSnap(lv, 110, 1).k).toBe('h')
    expect(nextSnap(lv, 100, 1).k).toBe('c')
    // 同じ値はまとめた点から動く
    const flat = snapLevels({ o: 100, h: 100, l: 90, c: 90 }, 'candle')
    expect(nextSnap(flat, 100, -1).k).toBe('l')
  })
  it('自由な価格からは、その向きで最も近い点へ（無ければ端の点）', () => {
    const lv = snapLevels({ o: 100, h: 110, l: 90, c: 105 }, 'candle')
    expect(nextSnap(lv, 107, -1).k).toBe('c')
    expect(nextSnap(lv, 107, 1).k).toBe('h')
    expect(nextSnap(lv, 200, 1).k).toBe('h')
    expect(nextSnap(lv, 50, -1).k).toBe('l')
  })
})

describe('山・谷へ跳ぶ（FR-C14）', () => {
  //          0    1    2    3    4    5    6    7    8    9   10   11   12
  const hi = [10, 11, 12, 13, 20, 13, 12, 11, 10, 9, 10, 11, 12]
  const lo = [9, 10, 11, 12, 19, 12, 11, 10, 9, 5, 9, 10, 11]
  it('右へ: 次の山か谷（前後の足の範囲で最大・最小）', () => {
    expect(swingFrom(hi, lo, 0, 1, 3)).toEqual({ i: 4, kind: 'h' })
    expect(swingFrom(hi, lo, 4, 1, 3)).toEqual({ i: 9, kind: 'l' })
    expect(swingFrom(hi, lo, 9, 1, 3)).toBeNull()
  })
  it('左へ', () => {
    expect(swingFrom(hi, lo, 12, -1, 3)).toEqual({ i: 9, kind: 'l' })
    expect(swingFrom(hi, lo, 9, -1, 3)).toEqual({ i: 4, kind: 'h' })
  })
})

describe('線の形（FR-C13）', () => {
  const a = { x: 10, y: 100 }
  const b = { x: 30, y: 80 }
  it('延長なしは 2 点のまま', () => {
    expect(segment(a, b, 'none', 200)).toEqual([a, b])
  })
  it('右・左右へ延長する（px で外挿し、描く範囲の端まで）', () => {
    expect(segment(a, b, 'right', 200)).toEqual([a, { x: 200, y: -90 }])
    expect(segment(b, a, 'left', 200)).toEqual([{ x: 0, y: 110 }, b])
    expect(segment(a, b, 'both', 200)).toEqual([
      { x: 0, y: 110 },
      { x: 200, y: -90 },
    ])
  })
  it('2 点が同じ足（x が同じ）なら延長しない（NaN を出さない）', () => {
    const s = segment({ x: 10, y: 100 }, { x: 10, y: 80 }, 'both', 200)!
    expect(s).toEqual([
      { x: 10, y: 100 },
      { x: 10, y: 80 },
    ])
    expect(yAtX({ x: 10, y: 100 }, { x: 10, y: 80 }, 10)).toBeNull()
  })
  it('線の上の y', () => {
    expect(yAtX(a, b, 20)).toBe(90)
    expect(yAtX(a, b, 50)).toBe(60)
  })
  it('線までの距離（端の外は端点まで）', () => {
    expect(distToSegment({ x: 20, y: 95 }, a, b)).toBeCloseTo(5 / Math.SQRT2, 9)
    expect(distToSegment({ x: 0, y: 100 }, a, b)).toBe(10)
    expect(distToSegment({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBeCloseTo(Math.hypot(5, 5), 9)
  })
  it('価格ラベルの足が線の範囲にあるか（延長を含む）', () => {
    expect(covers(5, 2, 8, 'none')).toBe(true)
    expect(covers(9, 2, 8, 'none')).toBe(false)
    expect(covers(9, 2, 8, 'right')).toBe(true)
    expect(covers(1, 2, 8, 'right')).toBe(false)
    expect(covers(1, 2, 8, 'left')).toBe(true)
    expect(covers(5, 5, 5, 'both')).toBe(false) // 同じ足の 2 点はラベルを出さない
  })
  it('E キーの延長の順: なし → 右 → 左右 → なし（左はメニューから。左からは右へ）', () => {
    expect(extendNext('none')).toBe('right')
    expect(extendNext('right')).toBe('both')
    expect(extendNext('both')).toBe('none')
    expect(extendNext('left')).toBe('right')
  })
})

describe('図形を選ぶ順（FR-C14）', () => {
  const items = [
    { id: 'far', ai: 0, bi: 5 },
    { id: 'near', ai: 40, bi: 60 },
    { id: 'in', ai: 55, bi: 90 },
    { id: 'out', ai: 200, bi: 220 },
  ]
  it('表示範囲に掛かる図形を先に、基準の足に近い順', () => {
    expect(selectionOrder(items, 30, 100, 95)).toEqual(['in', 'near', 'far', 'out'])
    expect(selectionOrder(items, 30, 100, 50)).toEqual(['near', 'in', 'far', 'out'])
  })
  it('G で次、Shift+G で前（端で回る）。選んでいなければ先頭・末尾', () => {
    const o = ['x', 'y', 'z']
    expect(nextSelection(o, null, 1)).toBe('x')
    expect(nextSelection(o, null, -1)).toBe('z')
    expect(nextSelection(o, 'x', 1)).toBe('y')
    expect(nextSelection(o, 'z', 1)).toBe('x')
    expect(nextSelection(o, 'x', -1)).toBe('z')
    expect(nextSelection(o, 'gone', 1)).toBe('x')
    expect(nextSelection([], null, 1)).toBeNull()
  })
})

describe('描画の状態の遷移（FR-C14。design-drawings.md §3.1・§8）', () => {
  const idle: DrawMode = { m: 'idle' }
  const pt = { date: '2026-11-02', raw: 1000 }
  it('引く: 通常 → 始点 → 終点 → 選択（見るだけ）', () => {
    let s = step(idle, { t: 'begin' })
    expect(s).toEqual({ m: 'start' })
    s = step(s, { t: 'enter', point: pt })
    expect(s).toEqual({ m: 'end', a: pt })
    s = step(s, { t: 'created', id: 'n1' })
    expect(s).toEqual({ m: 'sel', id: 'n1', target: 'none' })
  })
  it('Esc: 終点 → 始点 → 通常。選択 → 通常', () => {
    expect(step({ m: 'end', a: pt }, { t: 'esc' })).toEqual({ m: 'start' })
    expect(step({ m: 'start' }, { t: 'esc' })).toEqual(idle)
    expect(step({ m: 'sel', id: 'x', target: 'a' }, { t: 'esc' })).toEqual(idle)
  })
  it('Space: 見るだけ → 全体 → 始点 → 終点 → 見るだけ', () => {
    let s: DrawMode = { m: 'sel', id: 'x', target: 'none' }
    const seen: string[] = []
    for (let i = 0; i < 4; i++) {
      s = step(s, { t: 'space' })
      seen.push((s as { target: string }).target)
    }
    expect(seen).toEqual(['all', 'a', 'b', 'none'])
  })
  it('G で選ぶ・選び直す。引いている途中は選べない', () => {
    expect(step(idle, { t: 'select', id: 'x' })).toEqual({ m: 'sel', id: 'x', target: 'none' })
    expect(step({ m: 'sel', id: 'x', target: 'all' }, { t: 'select', id: 'y' })).toEqual({ m: 'sel', id: 'y', target: 'none' })
    expect(step({ m: 'start' }, { t: 'select', id: 'y' })).toEqual({ m: 'start' })
  })
  it('作り直し（時間軸・調整・種類）は引いている途中をやめ、選択は保つ', () => {
    expect(step({ m: 'end', a: pt }, { t: 'rebuild' })).toEqual(idle)
    expect(step({ m: 'start' }, { t: 'rebuild' })).toEqual(idle)
    expect(step({ m: 'sel', id: 'x', target: 'a' }, { t: 'rebuild' })).toEqual({ m: 'sel', id: 'x', target: 'a' })
  })
  it('フォーカスが外れた・銘柄が変わった・描けない表示になったら、どの状態でも通常に戻る', () => {
    for (const s of [{ m: 'start' }, { m: 'end', a: pt }, { m: 'sel', id: 'x', target: 'all' }] as DrawMode[])
      for (const t of ['blur', 'symbol', 'hidden'] as const) expect(step(s, { t })).toEqual(idle)
  })
  it('選んでいる図形が消えたら通常に戻る。ほかの図形が消えても変わらない', () => {
    expect(step({ m: 'sel', id: 'x', target: 'none' }, { t: 'removed', id: 'x' })).toEqual(idle)
    expect(step({ m: 'sel', id: 'x', target: 'none' }, { t: 'removed', id: 'y' })).toEqual({ m: 'sel', id: 'x', target: 'none' })
  })
  it('選択中に Alt+T で引き始める', () => {
    expect(step({ m: 'sel', id: 'x', target: 'none' }, { t: 'begin' })).toEqual({ m: 'start' })
  })
})

describe('図形の読み込みと正規化（FR-C13）', () => {
  it('知らない kind・通らない図形は読み飛ばす（ファイルからは消さない。Core の役目）', () => {
    const ok = trend()
    expect(readDrawings([ok, { id: 'h', kind: 'hline', price: 1 }, { id: 'bad', kind: 'trend' }, null])).toEqual([ok])
  })
  it('色・太さ・線種は省略できる。色はトークン名だけ', () => {
    expect(readDrawings([trend({ color: '--draw-2', width: 2, dash: 'dashed' } as Partial<Drawing>)])).toHaveLength(1)
    expect(readDrawings([trend({ color: 'red' } as unknown as Partial<Drawing>)])).toHaveLength(0)
  })
  it('a は b より前の日付に入れ替える', () => {
    const d = normalizeDrawing(trend({ a: { date: '2026-11-02', raw: 1200 }, b: { date: '2026-10-01', raw: 1000 } }))
    expect(d.a.date).toBe('2026-10-01')
    expect(d.b.raw).toBe(1200)
  })
})

describe('マウスの吸着とタイル（FR-C15, FR-C18）', () => {
  it('弱い吸着: 8px 以内で最も近い点。外なら null', () => {
    const lv = [
      { k: 'h' as const, y: 100 },
      { k: 'c' as const, y: 110 },
      { k: 'l' as const, y: 140 },
    ]
    expect(nearestSnap(lv, 104, 8)).toBe('h')
    expect(nearestSnap(lv, 106, 8)).toBe('c')
    expect(nearestSnap(lv, 125, 8)).toBeNull()
    expect(nearestSnap([{ k: 'h', y: Number.NaN }], 100, 8)).toBeNull()
  })
  it('hitTest の ID: 線と取っ手', () => {
    expect(parseHit('draw:d1')).toEqual({ id: 'd1', part: 'line' })
    expect(parseHit('draw:d1:a')).toEqual({ id: 'd1', part: 'a' })
    expect(parseHit('other')).toBeNull()
  })
  it('タイルの線: Core が換算した点を足の番号に。色は既定のトークン', () => {
    const time = ['2026-11-02', '2026-11-04', '2026-11-05']
    const l = tileLines(
      [{ id: 'x', a: { date: '2026-10-30', price: 100 }, b: { date: '2026-11-05', price: 110 }, extend: 'right' }],
      time,
      'D',
    )
    expect(l).toEqual([{ ai: -1, ap: 100, bi: 2, bp: 110, extend: 'right', color: '--draw-1', dash: 'solid' }])
    expect(tileLines(undefined, time, 'D')).toEqual([])
    expect(tileLines([], ['2026-11-02'], 'D')).toEqual([])
  })
})

describe('山・谷の同じ値（FR-C14。デモで見つけた不具合）', () => {
  it('同じ高値が隣り合っても、山は 1 つ（左の足だけ）', () => {
    //          0   1   2   3   4   5   6   7   8   9  10  11  12
    const hi = [10, 11, 12, 13, 20, 20, 13, 12, 11, 10, 11, 12, 13]
    const lo = hi.map((h) => h - 1)
    expect(swingFrom(hi, lo, 0, 1, 3)).toEqual({ i: 4, kind: 'h' })
    // 左へ: 5 は 4 と同じ値なので山にしない
    expect(swingFrom(hi, lo, 9, -1, 3)).toEqual({ i: 4, kind: 'h' })
  })
  it('同じ安値が隣り合っても、谷は 1 つ', () => {
    const lo = [20, 19, 18, 17, 10, 10, 17, 18, 19, 20, 19, 18, 17]
    const hi = lo.map((l) => l + 1)
    expect(swingFrom(hi, lo, 0, 1, 3)).toEqual({ i: 4, kind: 'l' })
    expect(swingFrom(hi, lo, 9, -1, 3)).toEqual({ i: 4, kind: 'l' })
  })
})
