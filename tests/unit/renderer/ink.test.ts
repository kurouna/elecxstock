// タブの下線（FR-V9。lib/ink.ts）: 偽の要素と ResizeObserver で、滑らせるとき・滑らせないとき・測り直しを確かめる
import { describe, expect, it } from 'vitest'
import { type InkEnv, type InkParams, ink } from '../../../src/renderer/lib/ink'

interface FakeBtn {
  offsetLeft: number
  offsetWidth: number
}
function setup(btns: FakeBtn[], sel: () => FakeBtn[]) {
  const observed = new Set<unknown>()
  let fire = () => {}
  let t = 0
  const queue: (() => void)[] = []
  const classes = new Set<string>()
  const box = { children: [] as unknown[] }
  const bar = {
    style: { transform: '', width: '', visibility: '' },
    classList: { toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c)) },
    parentElement: box,
  }
  box.children = [...btns, bar]
  const env: InkEnv = {
    observe: (cb) => {
      fire = cb
      return { observe: (e) => observed.add(e), disconnect: () => observed.clear() }
    },
    now: () => t,
    duration: () => 200,
    defer: (f) => queue.push(f),
  }
  const params = (key: string, more: Partial<InkParams> = {}): InkParams => ({
    key,
    pick: () => sel() as unknown as HTMLElement[],
    ...more,
  })
  const flush = () => {
    for (const f of queue.splice(0)) f()
  }
  return {
    bar,
    box,
    classes,
    observed,
    params,
    flush,
    resize: () => fire(),
    tick: (ms: number) => (t += ms),
    mount: (p: InkParams) => ink(bar as unknown as HTMLElement, p, env),
  }
}

describe('タブの下線（FR-V9）', () => {
  it('初めて置くときは滑らせず、選んだタブが変わったら滑らせる', () => {
    const a = { offsetLeft: 0, offsetWidth: 80 }
    const b = { offsetLeft: 80, offsetWidth: 100 }
    let cur = [a]
    const s = setup([a, b], () => cur)
    const act = s.mount(s.params('a'))
    expect(s.bar.style.transform).toBe('translateX(0px)')
    expect(s.bar.style.width).toBe('80px')
    expect(s.classes.has('slide')).toBe(false)
    cur = [b]
    act.update(s.params('b'))
    s.flush()
    expect(s.bar.style.transform).toBe('translateX(80px)')
    expect(s.classes.has('slide')).toBe(true)
  })
  it('幅が変わって測り直すとき（名前・言語・省略）は滑らせない。ただし滑っている途中なら滑りを保つ', () => {
    const a = { offsetLeft: 0, offsetWidth: 80 }
    const b = { offsetLeft: 80, offsetWidth: 100 }
    let cur = [a]
    const s = setup([a, b], () => cur)
    const act = s.mount(s.params('a'))
    cur = [b]
    act.update(s.params('b'))
    s.flush()
    s.tick(50)
    b.offsetWidth = 120 // 滑っている途中に文字が読み込まれた
    s.resize()
    expect(s.bar.style.width).toBe('120px')
    expect(s.classes.has('slide')).toBe(true)
    s.tick(300)
    b.offsetWidth = 140
    s.resize()
    expect(s.classes.has('slide')).toBe(false)
  })
  it('持ち主が替わった（使い回されたドロワー）・slide が false（閉じている）なら滑らせない', () => {
    const a = { offsetLeft: 0, offsetWidth: 80 }
    const b = { offsetLeft: 80, offsetWidth: 100 }
    let cur = [a]
    const s = setup([a, b], () => cur)
    const act = s.mount(s.params('a', { group: '1' }))
    cur = [b]
    act.update(s.params('b', { group: '2' }))
    s.flush()
    expect(s.bar.style.transform).toBe('translateX(80px)')
    expect(s.classes.has('slide')).toBe(false)
    cur = [a]
    act.update(s.params('a', { group: '2', slide: false }))
    s.flush()
    expect(s.classes.has('slide')).toBe(false)
  })
  it('選んだものが無ければ隠し、見せるときは inline の指定を外すだけ（閉じたドロワーの hidden を打ち消さない）', () => {
    const a = { offsetLeft: 0, offsetWidth: 80 }
    let cur: FakeBtn[] = []
    const s = setup([a], () => cur)
    const act = s.mount(s.params(''))
    expect(s.bar.style.visibility).toBe('hidden')
    cur = [a]
    act.update(s.params('a'))
    s.flush()
    expect(s.bar.style.visibility).toBe('')
  })
  it('あとから足したタブの大きさも見る（測るたびに子を見直す）', () => {
    const a = { offsetLeft: 0, offsetWidth: 80 }
    const s = setup([a], () => [a])
    const act = s.mount(s.params('a'))
    const added = { offsetLeft: 80, offsetWidth: 90 }
    s.box.children = [a, added, s.bar]
    act.update(s.params('a2'))
    s.flush()
    expect(s.observed.has(added)).toBe(true)
    expect(s.observed.has(s.bar)).toBe(false)
  })
  it('マイレイアウトはタブと ▾ の 2 つにまたがる', () => {
    const tabBtn = { offsetLeft: 400, offsetWidth: 90 }
    const menu = { offsetLeft: 490, offsetWidth: 20 }
    const s = setup([tabBtn, menu], () => [tabBtn, menu])
    s.mount(s.params('free'))
    expect(s.bar.style.width).toBe('110px')
  })

  describe('滑った直後（--motion-tab の 200ms 以内）の切り替え', () => {
    const slid = () => {
      const a = { offsetLeft: 0, offsetWidth: 80 }
      const b = { offsetLeft: 80, offsetWidth: 100 }
      const c = { offsetLeft: 180, offsetWidth: 60 }
      let cur = [a]
      const s = setup([a, b, c], () => cur)
      const act = s.mount(s.params('a', { group: '1' }))
      cur = [b]
      act.update(s.params('b', { group: '1' }))
      s.flush()
      expect(s.classes.has('slide')).toBe(true)
      s.tick(50)
      return { s, act, set: (x: FakeBtn[]) => (cur = x), c }
    }
    it('持ち主が替わったら、滑っている途中でも滑らせない（別のタブのドロワーに替わっただけ）', () => {
      const { s, act, set, c } = slid()
      set([c])
      act.update(s.params('c', { group: '2' }))
      s.flush()
      expect(s.bar.style.transform).toBe('translateX(180px)')
      expect(s.classes.has('slide')).toBe(false)
      // そのあとの測り直しでも滑らない
      c.offsetWidth = 70
      s.resize()
      expect(s.classes.has('slide')).toBe(false)
    })
    it('slide が false（閉じたドロワーから選んで開いた）なら、滑っている途中でも滑らせない', () => {
      const { s, act, set, c } = slid()
      set([c])
      act.update(s.params('c', { group: '1', slide: false }))
      s.flush()
      expect(s.classes.has('slide')).toBe(false)
    })
    it('同じフラッシュでタブが替わってから持ち主が替わっても、まとめて滑らせない', () => {
      const { s, act, set, c } = slid()
      s.tick(500)
      set([c])
      act.update(s.params('c', { group: '1' }))
      act.update(s.params('c', { group: '2' }))
      s.flush()
      expect(s.classes.has('slide')).toBe(false)
    })
    it('同じフラッシュで持ち主が替わってから、新しい持ち主の中でタブが替わっても滑らせない（順番によらない）', () => {
      const { s, act, set, c } = slid()
      s.tick(500)
      set([c])
      act.update(s.params('b', { group: '2' }))
      act.update(s.params('c', { group: '2' }))
      s.flush()
      expect(s.bar.style.transform).toBe('translateX(180px)')
      expect(s.classes.has('slide')).toBe(false)
    })
    it('選んだものが無くなって隠すときは滑りも消す（また出たときに前の滑りが残らない）', () => {
      const { s, act, set, c } = slid()
      set([])
      act.update(s.params('', { group: '1' }))
      s.flush()
      expect(s.bar.style.visibility).toBe('hidden')
      expect(s.classes.has('slide')).toBe(false)
      set([c])
      c.offsetWidth = 61
      s.resize()
      expect(s.classes.has('slide')).toBe(false)
    })
  })
})
