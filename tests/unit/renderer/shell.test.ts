// 画面のシェル（オーバーレイ・キー・フォーカス・ドロワー）の流れ。DOM は最小の偽物（docs/testing.md の L1）
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { stubWindow } from '../../support/window'

stubWindow()
vi.stubGlobal('CSS', { escape: (s: string) => s.replace(/["\\]/g, '\\$&') })

/** 偽物のペインの要素（data-pane-id・矩形・フォーカス） */
interface FakeEl {
  dataset: Record<string, string>
  offsetParent: object | null
  focus: ReturnType<typeof vi.fn>
  contains: (x: unknown) => boolean
  getBoundingClientRect: () => {
    x: number
    y: number
    left: number
    top: number
    right: number
    bottom: number
    width: number
    height: number
  }
}
const els: FakeEl[] = []
function paneEl(id: string, x: number): FakeEl {
  const r = { x, y: 0, left: x, top: 0, right: x + 100, bottom: 100, width: 100, height: 100 }
  const e: FakeEl = { dataset: { paneId: id }, offsetParent: {}, focus: vi.fn(), contains: () => false, getBoundingClientRect: () => r }
  els.push(e)
  return e
}
const doc = {
  activeElement: null as unknown,
  querySelector: (sel: string) => els.find((e) => sel === `[data-pane-id="${e.dataset.paneId}"]`) ?? null,
  querySelectorAll: () => els,
  getAnimations: () => [],
  documentElement: { style: { zoom: '' } },
}
vi.stubGlobal('document', doc)
vi.stubGlobal('getComputedStyle', () => ({ boxShadow: 'none', getPropertyValue: () => '' }))

const { app, closeOverlay, holdingDialog, fieldPicker, alertDialog } = await import('../../../src/renderer/stores/app.svelte')
const L = await import('../../../src/renderer/stores/layout.svelte')
const C = await import('../../../src/renderer/lib/commands')
const { registerPane, paneSelector } = await import('../../../src/renderer/lib/panes')
const { helpSection } = await import('../../../src/renderer/lib/shortcuts')
const { composing } = await import('../../../src/renderer/lib/keys')

const ev = (code: string, o: Partial<KeyboardEvent> = {}) =>
  ({
    code,
    key: code,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    isComposing: false,
    keyCode: 0,
    target: null,
    ...o,
  }) as KeyboardEvent
const settle = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  els.length = 0
  app.overlay = null
  app.maximized = null
  app.focus = null
  L.layout.doc = L.defaultDoc()
  L.layout.dockOpen = null
})

describe('答えを待つダイアログを閉じる（FR-H7, FR-AL7, FR-SC2）', () => {
  it('保有のフォームを Esc・背景・Ctrl+K で閉じると「取り消し」（null）が返る（待っている側が止まらない）', async () => {
    const p = holdingDialog()
    closeOverlay()
    await expect(Promise.race([p, settle().then(() => 'pending')])).resolves.toBeNull()
  })
  it('条件を選ぶ・アラートのダイアログも null を返す', async () => {
    const a = fieldPicker({ title: 't', fields: [], used: [] })
    closeOverlay()
    await expect(a).resolves.toBeNull()
    const b = alertDialog({})
    closeOverlay()
    await expect(b).resolves.toBeNull()
  })
})

describe('初回起動のダイアログ（FR-FR1）', () => {
  it('免責に同意するまで Esc・Ctrl+K で閉じない', () => {
    app.overlay = { kind: 'firstrun' }
    C.handleKey(ev('Escape'))
    expect(app.overlay?.kind).toBe('firstrun')
    C.handleKey(ev('KeyK', { ctrlKey: true }))
    expect(app.overlay?.kind).toBe('firstrun')
  })
  it('トレイの「設定」・通知のクリック（キー以外の経路）でも置き換えない', async () => {
    const { toggleAlerts } = await import('../../../src/renderer/lib/alerts')
    app.overlay = { kind: 'firstrun' }
    C.runAction('settings')
    expect(app.overlay?.kind).toBe('firstrun')
    toggleAlerts('history')
    expect(app.overlay?.kind).toBe('firstrun')
    app.overlay = { kind: 'palette' }
    expect(app.overlay?.kind).toBe('firstrun')
  })
  it('答えを待つダイアログは開かずに「取り消し」を返す（待っている側が止まらない）', async () => {
    const { confirmDialog, promptDialog } = await import('../../../src/renderer/stores/app.svelte')
    app.overlay = { kind: 'firstrun' }
    await expect(confirmDialog({ title: 't', ok: 'ok' })).resolves.toEqual({ ok: false, checked: false })
    await expect(promptDialog('t', '')).resolves.toBeNull()
    expect(app.overlay?.kind).toBe('firstrun')
  })
  it('同意して閉じたあとは、ほかのダイアログを開ける', () => {
    app.overlay = { kind: 'firstrun' }
    app.overlay = null
    C.runAction('settings')
    expect((app.overlay as { kind: string } | null)?.kind).toBe('settings') // 代入で null に絞られるのを外す
  })
  it('ほかのダイアログは Esc で閉じる', () => {
    app.overlay = { kind: 'help' }
    C.handleKey(ev('Escape'))
    expect(app.overlay).toBeNull()
  })
})

describe('IME の変換中は何もしない（FR-KB5）', () => {
  it('keyCode 229（変換を始めるキー）も変換中とみなす', () => {
    expect(composing(ev('KeyA', { keyCode: 229 }))).toBe(true)
    expect(composing(ev('KeyA', { isComposing: true }))).toBe(true)
    expect(composing(ev('KeyA'))).toBe(false)
  })
  it('変換を始めるキーで銘柄ジャンプを開かない', () => {
    expect(C.handleKey(ev('Digit1', { keyCode: 229 }))).toBe(false)
    expect(app.overlay).toBeNull()
  })
})

describe('ペインの要素を引くセレクタ（FR-KB2）', () => {
  it('ID に " や \\ があっても壊れない（ディスクから読んだレイアウトの ID）', () => {
    expect(paneSelector('a"b')).toBe('[data-pane-id="a\\"b"]')
    expect(paneSelector('p1')).toBe('[data-pane-id="p1"]')
  })
})

describe('最大化中の F6（FR-L3, FR-KB2）', () => {
  it('ほかのペインへ巡るときは最大化を戻す（最大化したペインの裏へフォーカスだけ移らない）', () => {
    paneEl('a', 0)
    paneEl('b', 200)
    app.focus = 'a'
    app.maximized = 'a'
    C.handleKey(ev('F6'))
    expect(app.focus).toBe('b')
    expect(app.maximized).toBeNull()
  })
  it('最大化していなければ最大化に触れずに巡る', () => {
    paneEl('a', 0)
    paneEl('b', 200)
    app.focus = 'b'
    C.handleKey(ev('F6'))
    expect(app.focus).toBe('a')
  })
})

describe('最大化中の Alt+矢印（FR-L3, FR-KB2）', () => {
  /** 最大化したペインは窓いっぱい（.pane.maxed は position: fixed）。それ以外は並びどおりの矩形 */
  function maxAware(id: string, x: number): FakeEl {
    const e = paneEl(id, x)
    const tiled = e.getBoundingClientRect()
    const full = { x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800 }
    e.getBoundingClientRect = () => (app.maximized === id ? full : tiled)
    return e
  }
  it('最大化を戻して、並びの上で隣のペインへ移る', () => {
    maxAware('a', 0)
    maxAware('b', 200)
    app.focus = 'a'
    app.maximized = 'a'
    C.handleKey(ev('ArrowRight', { altKey: true }))
    expect(app.focus).toBe('b')
    expect(app.maximized).toBeNull()
  })
  it('その向きに隣が無ければ最大化のまま（何も変えない）', () => {
    maxAware('a', 0)
    maxAware('b', 200)
    app.focus = 'a'
    app.maximized = 'a'
    C.handleKey(ev('ArrowLeft', { altKey: true }))
    expect(app.focus).toBe('a')
    expect(app.maximized).toBe('a')
  })
  it('最大化していなければ今までどおり隣へ移る', () => {
    maxAware('a', 0)
    maxAware('b', 200)
    app.focus = 'b'
    C.handleKey(ev('ArrowLeft', { altKey: true }))
    expect(app.focus).toBe('a')
    expect(app.maximized).toBeNull()
  })
})

describe('オーバーレイを閉じたらフォーカスを戻す（FR-KB2, KB3）', () => {
  it('フォーカスしていたペインの要素へ戻す', async () => {
    const e = paneEl('a', 0)
    app.focus = 'a'
    C.refocusPane()
    await settle()
    expect(e.focus).toHaveBeenCalled()
  })
  it('ドロワーの帯にいた（ペインのフォーカスなし）ときは何もしない', async () => {
    const e = paneEl('a', 0)
    app.focus = null
    C.refocusPane()
    await settle()
    expect(e.focus).not.toHaveBeenCalled()
  })
})

describe('ドロワーをマウスで開く・ピン留めする（FR-DR3, FR-L3）', () => {
  it('開くときは最大化を戻す（最大化したペインがドロワーを覆わない）', () => {
    L.setPreset('grid')
    const side = L.layout.entry.docks.left ? 'left' : 'right'
    app.maximized = 'x'
    C.openDock(side)
    expect(L.layout.dockOpen).toBe(side)
    expect(app.maximized).toBeNull()
  })
  it('ピン留めするときも戻す。外すときは触れない', () => {
    L.setPreset('grid')
    const side = L.layout.entry.docks.left ? 'left' : 'right'
    const d = L.layout.entry.docks[side]!
    d.pinned = false
    app.maximized = 'x'
    C.togglePin(side)
    expect(d.pinned).toBe(true)
    expect(L.layout.dockOpen).toBe(side)
    expect(app.maximized).toBeNull()
    app.maximized = 'y'
    C.togglePin(side)
    expect(d.pinned).toBe(false)
    expect(app.maximized).toBe('y')
  })
})

describe('フリーへ送る（FR-L7）', () => {
  it('Svelte の状態（Proxy）の配列でも、素の配列にしてから main に渡す', async () => {
    const sent: unknown[] = []
    ;(window as unknown as { elecxstock: Record<string, unknown> }).elecxstock.sendToFree = async (ids: unknown) => {
      sent.push(structuredClone(ids)) // main への IPC と同じく構造化複製する
      return 'free2'
    }
    const off = registerPane('lst', { selected: () => new Proxy(['JP:7203', 'JP:8306'], {}) as string[] })
    app.focus = 'lst'
    await C.ACTIONS.find((a) => a.id === 'sendToFree')!.run()
    off()
    expect(sent).toEqual([['JP:7203', 'JP:8306']])
  })
})

describe('F1 の一覧の「いまのペイン」の段（FR-KB7）', () => {
  // すべての種類に段があることは tests/unit/registry/shortcuts.test.ts
  it('ペインの種類ごとの段（保有・ポートフォリオ・銘柄情報・配当シミュレータはそれぞれの段）', () => {
    expect(helpSection('folio')).toBe('folio')
    expect(helpSection('portfolio')).toBe('folio')
    expect(helpSection('info')).toBe('info')
    expect(helpSection('divsim')).toBe('divsim')
    expect(helpSection('mtf')).toBe('chart')
    expect(helpSection('unknown')).toBe('')
  })
})
