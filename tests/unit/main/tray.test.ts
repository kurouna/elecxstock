// 通知領域のアイコンの後始末（FR-BG2。src/main/background.ts の realTray）: Electron の Tray は偽物にする
import { afterEach, describe, expect, it, vi } from 'vitest'

const made: { destroyed: boolean }[] = []
vi.mock('electron', () => {
  class Tray {
    destroyed = false
    constructor() {
      made.push(this)
    }
    setToolTip() {}
    setContextMenu() {}
    on() {}
    isDestroyed() {
      return this.destroyed
    }
    destroy() {
      this.destroyed = true
    }
  }
  return {
    app: {},
    Menu: { buildFromTemplate: () => ({}) },
    Notification: class {},
    nativeImage: { createFromPath: () => ({}) },
    Tray,
  }
})
const { realTray } = await import('../../../src/main/background')
const noop = () => {}
afterEach(() => {
  made.length = 0
})

describe('通知領域のアイコンを残さない（FR-BG2）', () => {
  it('隠した直後（壊すのを次のイベントまで待っている間）に終了しても、そのアイコンをすぐに壊す', () => {
    const t = realTray('icon.png', { open: noop, settings: noop, quit: noop })
    t.show('ja')
    t.hide() // トレイのクリックの中から: 次のイベントで壊す
    expect(made[0]!.destroyed).toBe(false)
    t.destroy() // will-quit
    expect(made[0]!.destroyed).toBe(true)
  })
  it('隠したあとは次のイベントで壊す。もう一度出したら新しいアイコンを作る', async () => {
    const t = realTray('icon.png', { open: noop, settings: noop, quit: noop })
    t.show('ja')
    t.hide()
    await new Promise<void>((r) => setImmediate(r))
    expect(made[0]!.destroyed).toBe(true)
    t.show('en')
    expect(made).toHaveLength(2)
    t.destroy()
    expect(made[1]!.destroyed).toBe(true)
  })
})
