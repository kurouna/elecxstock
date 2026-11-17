// ペインの最大化と戻すの流れ（FR-L3・FR-V9。lib/paneMax.ts）。DOM は最小の偽物で、矩形は最大化の状態から決める
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { elecxstock: { call: async () => undefined, on: () => () => {}, prioritize: () => {} } })

const SLOT = { left: 100, top: 50, width: 200, height: 100 }
const FULL = { left: 0, top: 37, width: 1000, height: 500 }
/** 飛んでいる途中の見た目の矩形（transform 込み） */
const MID = { left: 40, top: 40, width: 600, height: 300 }
let tokens: Record<string, string> = {}
interface FakeAnim {
  id: string
  cancel: () => void
  finish?: () => void
}
interface FakeEl {
  isConnected: boolean
  ring: string
  animate: ReturnType<typeof vi.fn>
  anims: FakeAnim[]
  getAnimations: () => FakeAnim[]
  getBoundingClientRect: () => typeof SLOT
}
const els = new Map<string, FakeEl>()
const { app } = await import('../../../src/renderer/stores/app.svelte')
function el(id: string, ring = 'none'): FakeEl {
  const e: FakeEl = {
    isConnected: true,
    ring,
    anims: [],
    animate: vi.fn((_k: unknown, o: { id: string }) => {
      const a = { id: o.id, cancel: vi.fn(() => (e.anims = e.anims.filter((x) => x !== a))) }
      e.anims.push(a)
      return a
    }),
    getAnimations: () => e.anims,
    // 飛んでいる間は transform の掛かった矩形を返す（止める前に測ると、今の見た目の位置から折り返せる）
    getBoundingClientRect: () => (e.anims.some((a) => a.id === 'pane-max') ? MID : app.maximized === id ? FULL : SLOT),
  }
  els.set(id, e)
  return e
}
let docAnims: FakeAnim[] = []
vi.stubGlobal('CSS', { escape: (s: string) => s })
vi.stubGlobal('document', {
  documentElement: { style: { zoom: '' } },
  getAnimations: () => docAnims,
  querySelector: (sel: string) => els.get(/data-pane-id="(.+)"/.exec(sel)?.[1] ?? '') ?? null,
})
vi.stubGlobal('getComputedStyle', (x: { ring?: string }) => ({
  boxShadow: x?.ring ?? 'none',
  getPropertyValue: (n: string) => tokens[n] ?? '',
}))

const { setMaximized, clearMaximized, playIn, liftShadow, MAX_IDS, setTabHint, takeTabHint } = await import(
  '../../../src/renderer/lib/paneMax'
)

beforeEach(() => {
  els.clear()
  app.maximized = null
  docAnims = []
  tokens = {
    '--motion-view': '200ms',
    '--ease-view': 'cubic-bezier(0.2, 0, 0, 1)',
    '--motion-max': '150ms',
    '--motion-restore': '120ms',
    '--ease-out': 'ease-out',
    '--shadow': '0 12px 32px black',
  }
})

const calls = (e: FakeEl, id: string) => e.animate.mock.calls.filter((c) => (c[1] as { id: string }).id === id)

describe('最大化と戻すの動き（FR-L3・FR-V9）', () => {
  it('広げる: 状態をすぐ変え、元のスロットに見える transform から none へ 150ms で飛ばす', () => {
    const a = el('a')
    setMaximized('a')
    expect(app.maximized).toBe('a')
    const [frames, opts] = calls(a, 'pane-max')[0]!
    expect(frames[0].transform).toBe('translate(-300px, -187px) scale(0.2, 0.2)')
    expect(frames[1].transform).toBe('none')
    expect(opts.duration).toBe(150)
  })
  it('合成スレッドで動くよう、飛ぶ動きは transform だけ。前に出す・影は別の動き（同じ時間・一定の値）', () => {
    const a = el('a')
    setMaximized('a')
    const [frames] = calls(a, 'pane-max')[0]!
    for (const f of frames) expect(Object.keys(f)).toEqual(['transform'])
    const [lift, opts] = calls(a, 'pane-max-lift')[0]!
    expect(lift[0]).toEqual(lift[1])
    expect(lift[0]).toMatchObject({ zIndex: 31 })
    expect(opts.duration).toBe(150)
    expect(MAX_IDS).toEqual(['pane-max', 'pane-max-lift'])
  })
  it('飛んでいる間もキーのフォーカスの枠を消さない（影は今の枠に足す）', () => {
    const a = el('a', 'rgb(0, 0, 255) 0px 0px 0px 1px inset')
    setMaximized('a')
    const [lift] = calls(a, 'pane-max-lift')[0]!
    expect(lift[0].boxShadow).toBe('rgb(0, 0, 255) 0px 0px 0px 1px inset, 0 12px 32px black')
  })
  it('戻す: 状態はすぐ戻り、広い矩形から 120ms でスロットへ着地する（後始末の状態を持たない）', () => {
    const a = el('a')
    app.maximized = 'a'
    setMaximized(null)
    expect(app.maximized).toBeNull()
    const [frames, opts] = calls(a, 'pane-max')[0]!
    expect(frames[0].transform).toBe('translate(300px, 187px) scale(5, 5)')
    expect(opts.duration).toBe(120)
  })
  it('飛んでいる途中のトグルは、止める前の見た目の矩形から折り返す', () => {
    const a = el('a')
    setMaximized('a')
    const first = a.anims.slice()
    setMaximized(null)
    for (const x of first) expect(x.cancel).toHaveBeenCalled()
    expect(a.anims.map((x) => x.id)).toEqual(['pane-max', 'pane-max-lift'])
    // MID（中心 340, 190）から SLOT（中心 200, 100）へ。比は 600/200・300/100
    const [frames] = calls(a, 'pane-max')[1]!
    expect(frames[0].transform).toBe('translate(140px, 90px) scale(3, 3)')
  })
  it('別のペインを最大化すると、前のペインの動きは止めて新しいペインだけ飛ばす', () => {
    const a = el('a')
    const b = el('b')
    setMaximized('a')
    setMaximized('b')
    expect(app.maximized).toBe('b')
    expect(a.anims).toHaveLength(0)
    expect(calls(b, 'pane-max')).toHaveLength(1)
  })
  it('動きを減らす（トークンが 0ms）ときは飛ばさず、状態だけ変える', () => {
    tokens['--motion-max'] = '0ms'
    const a = el('a')
    setMaximized('a')
    expect(app.maximized).toBe('a')
    expect(a.animate).not.toHaveBeenCalled()
  })
  it('ペインが DOM に無い（ドロワーの中など）ときも状態だけ変える', () => {
    setMaximized('ghost')
    expect(app.maximized).toBe('ghost')
  })
  it('clearMaximized は動きなしで戻し、飛んでいる動きも止める', () => {
    const a = el('a')
    setMaximized('a')
    clearMaximized()
    expect(app.maximized).toBeNull()
    expect(a.anims).toHaveLength(0)
    expect(calls(a, 'pane-max')).toHaveLength(1)
  })
})

describe('飛んでいる間の影（FR-V9・FR-KB3）', () => {
  it('枠が無ければ影だけ、影が無ければ枠だけ', () => {
    expect(liftShadow('none', 'S')).toBe('S')
    expect(liftShadow('', 'S')).toBe('S')
    expect(liftShadow('R', '')).toBe('R')
    expect(liftShadow('R', 'S')).toBe('R, S')
  })
})

describe('タブの中身が入ってくる動き（FR-V9）', () => {
  it('一度だけ 200ms で再生し、続けて替えたら前の動きを止める', () => {
    const e = el('main')
    playIn(e as unknown as Element, 1)
    playIn(e as unknown as Element, -1)
    expect(e.animate).toHaveBeenCalledTimes(2)
    expect(e.anims).toHaveLength(1)
    const [frames, opts] = e.animate.mock.calls[1]!
    expect(frames[0].transform).toBe('translateX(-16px)')
    expect(opts).toMatchObject({ id: 'view-in', duration: 200, easing: 'cubic-bezier(0.2, 0, 0, 1)' })
  })
  it('連打（前の動きの途中）なら薄くし直さず、滑らせるだけ（作業域が明滅しない）', () => {
    const e = el('main')
    playIn(e as unknown as Element, 1)
    expect(e.animate.mock.calls[0]![0][0].opacity).toBe(0.3)
    playIn(e as unknown as Element, 1)
    expect(e.animate.mock.calls[1]![0][0].opacity).toBe(1)
  })
  it('前の動きは scope の中で探す（ドロワーは前のタブの slot で動いている）', () => {
    const body = el('body')
    const prev = { id: 'view-in', cancel: vi.fn(() => (body.anims = [])) }
    body.anims = [prev]
    const slot = el('slot')
    playIn(slot as unknown as Element, 1, body as unknown as Element)
    expect(prev.cancel).toHaveBeenCalled()
    expect(slot.animate.mock.calls[0]![0][0].opacity).toBe(1)
  })
  it('動きを減らす（0ms）・要素が無いときは何もしない', () => {
    tokens['--motion-view'] = '0ms'
    const e = el('main')
    playIn(e as unknown as Element, 1)
    playIn(null, 1)
    expect(e.animate).not.toHaveBeenCalled()
  })
  it('中身が入ってくる途中に最大化したら、その動きを先に終わらせる（transform の途中は fixed の基準がずれる）', () => {
    const view = { id: 'view-in', cancel: vi.fn(), finish: vi.fn() }
    docAnims = [view]
    el('a')
    setMaximized('a')
    expect(view.finish).toHaveBeenCalled()
  })
})

describe('ドロワーのタブをキーで替えた向き（FR-V9・FR-DR4）', () => {
  it('一度だけ受け取れる（受け取ったら 0 に戻る）', () => {
    setTabHint(-1)
    expect(takeTabHint()).toBe(-1)
    expect(takeTabHint()).toBe(0)
  })
})
