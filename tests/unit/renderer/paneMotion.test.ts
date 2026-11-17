// ペインの最大化・戻すの動き（FLIP）とタブの下線（FR-L3・FR-V9。docs/design-motion.md）
import { describe, expect, it } from 'vitest'
import {
  drawerSlide,
  enterFrames,
  flipFrom,
  flipTransform,
  identity,
  inkSpan,
  motionMs,
  slideDir,
} from '../../../src/renderer/lib/paneMotion'

describe('最大化の動きの transform（FR-L3・FR-V9）', () => {
  const slot = { left: 100, top: 50, width: 200, height: 100 }
  const full = { left: 0, top: 0, width: 1000, height: 500 }
  it('後の矩形に置いた要素を前の矩形に重ねる（中心の差と縦横の比）', () => {
    expect(flipFrom(slot, full, 1)).toEqual({ dx: 200 - 500, dy: 100 - 250, sx: 0.2, sy: 0.2 })
  })
  it('戻すときは逆向き（広い矩形から狭いスロットへ）', () => {
    expect(flipFrom(full, slot, 1)).toEqual({ dx: 300, dy: 150, sx: 5, sy: 5 })
  })
  it('表示倍率: 矩形は倍率が掛かった px、translate は zoom の中で倍率が掛かるので差だけ割る（比は割らない）', () => {
    const z = 1.25
    const f = flipFrom(
      { left: slot.left * z, top: slot.top * z, width: slot.width * z, height: slot.height * z },
      { left: 0, top: 0, width: full.width * z, height: full.height * z },
      z,
    )!
    expect(f.dx).toBeCloseTo(-300)
    expect(f.dy).toBeCloseTo(-150)
    expect(f.sx).toBeCloseTo(0.2)
    expect(f.sy).toBeCloseTo(0.2)
  })
  it('面積 0（まだ並んでいない・隠れている）や動かない場合は飛ばさない', () => {
    expect(flipFrom({ ...slot, width: 0 }, full, 1)).toBeNull()
    expect(flipFrom(slot, { ...full, height: 0 }, 1)).toBeNull()
    expect(flipFrom(slot, slot, 1)).toBeNull()
  })
  it('倍率が 0 や負なら 1 として扱う', () => {
    expect(flipFrom(slot, full, 0)).toEqual(flipFrom(slot, full, 1))
  })
  it('CSS の transform にする（小数は 4 桁まで）', () => {
    expect(flipTransform({ dx: -300, dy: 1 / 3, sx: 0.2, sy: 2 / 3 })).toBe('translate(-300px, 0.3333px) scale(0.2, 0.6667)')
  })
})

describe('動きの時間のトークン（FR-V9: 動きを減らすときは 0ms で動かさない）', () => {
  it('ms と s を読む', () => {
    expect(motionMs('150ms')).toBe(150)
    expect(motionMs(' 0.12s ')).toBe(120)
  })
  it('0・負・読めない値は 0', () => {
    expect(motionMs('0ms')).toBe(0)
    expect(motionMs('-5ms')).toBe(0)
    expect(motionMs('')).toBe(0)
    expect(motionMs('calc(var(--motion) * 2)')).toBe(0)
  })
})

describe('タブの下線の位置（FR-V9・FR-L14）', () => {
  it('選んだボタンの左端から右端まで（マイレイアウトはタブと ▾ の 2 つにまたがる）', () => {
    expect(inkSpan([{ left: 120, width: 80 }])).toEqual({ left: 120, width: 80 })
    expect(
      inkSpan([
        { left: 400, width: 90 },
        { left: 490, width: 20 },
      ]),
    ).toEqual({ left: 400, width: 110 })
  })
  it('選んだものが無い・幅 0（省略で隠れた）なら引かない', () => {
    expect(inkSpan([])).toBeNull()
    expect(inkSpan([{ left: 10, width: 0 }])).toBeNull()
  })
})

describe('タブの中身が入ってくる動き（FR-V9）', () => {
  const order = ['market', 'screener', 'grid', 'free']
  it('並びで右のタブへ移ったら右から、左なら左から', () => {
    expect(slideDir('market', 'grid', order)).toBe(1)
    expect(slideDir('grid', 'screener', order)).toBe(-1)
    expect(slideDir('grid', 'free:p1', order)).toBe(1)
    expect(slideDir('free:p2', 'market', order)).toBe(-1)
  })
  it('マイレイアウトのページどうし・並びに無いものは滑らせない', () => {
    expect(slideDir('free:p1', 'free:p2', order)).toBe(0)
    expect(slideDir('nope', 'grid', order)).toBe(0)
  })
  it('透明から始めず（0.3）、向きの分だけ 16px 滑らせて元の位置で終わる', () => {
    expect(enterFrames(1)).toEqual([
      { opacity: 0.3, transform: 'translateX(16px)' },
      { opacity: 1, transform: 'none' },
    ])
    expect(enterFrames(-1)[0]!.transform).toBe('translateX(-16px)')
    expect(enterFrames(0)[0]!.transform).toBe('translateX(0px)')
    expect(enterFrames(1, false)[0]).toEqual({ opacity: 1, transform: 'translateX(16px)' })
  })
})

describe('ドロワーのタブを替えたときの向き（FR-V9・FR-DR4）', () => {
  const ids = ['a', 'b', 'c']
  it('開いて落ち着いているときだけ、並びの位置で向きを決める', () => {
    expect(drawerSlide('a', 'c', ids, 0, true)).toBe(1)
    expect(drawerSlide('c', 'b', ids, 0, true)).toBe(-1)
  })
  it('キーの向き（Ctrl+Tab）があればそれを使う（端で折り返しても向きを保つ）', () => {
    expect(drawerSlide('c', 'a', ids, 1, true)).toBe(1)
    expect(drawerSlide('a', 'c', ids, -1, true)).toBe(-1)
  })
  it('閉じている・初めて・同じペイン（前のペインを外して番号が詰まった）・前のペインが無い なら動かさない', () => {
    expect(drawerSlide('a', 'b', ids, 0, false)).toBeNull()
    expect(drawerSlide(null, 'b', ids, 0, true)).toBeNull()
    expect(drawerSlide('b', 'b', ids, 0, true)).toBeNull()
    expect(drawerSlide('gone', 'b', ids, 0, true)).toBeNull()
  })
})

describe('オブジェクトの同一性（使い回されたドロワーの持ち主）', () => {
  it('同じオブジェクトは同じ数、別のオブジェクトは別の数', () => {
    const x = {}
    const y = {}
    expect(identity(x)).toBe(identity(x))
    expect(identity(x)).not.toBe(identity(y))
  })
})
