// タイトルバー（トップバー）のドラッグできる場所を測る（FR-L13）。tests/e2e/titlebar.spec.ts と multiwindow.spec.ts が使う
import type { ElectronApplication, Page } from '@playwright/test'
import { expect } from '@playwright/test'

/** 窓の中身の大きさを実際に変える（setViewportSize のエミュレーションでは閉じるボタンなどの位置が変わらないため） */
export async function resizeWindow(app: ElectronApplication, page: Page, width: number, height: number): Promise<void> {
  const url = page.url()
  await app.evaluate(
    ({ BrowserWindow }, [u, w, h]) => {
      const win = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL() === u)
      if (!win) throw new Error(`窓が見つからない: ${u}`)
      win.unmaximize()
      win.setContentSize(w as number, h as number)
    },
    [url, width, height] as const,
  )
  await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(width)
}

export interface TitleBarMeasure {
  /** トップバーの中身がはみ出していない */
  fits: boolean
  /** 検索欄の左右のドラッグ用の場所の幅（隣の要素から検索欄まで。トップバーの CSS の px＝文字の大きさで割った値） */
  gaps: number[]
  /** 右端のボタンの並びの右から、閉じるボタンなど（Window Controls Overlay）の左までの幅（同じく CSS の px） */
  reserve: number
  /** その点が窓のドラッグに使えるか（名前 → drag / no-drag / none） */
  regions: Record<string, string>
}

/**
 * トップバーを測る。ドラッグの可否は、その点にある要素から祖先へたどって最初に app-region を持つものの値
 * （Chromium はドラッグの領域の中の no-drag の要素を除く）
 */
export function measureTitleBar(page: Page): Promise<TitleBarMeasure> {
  return page.evaluate(() => {
    const top = document.querySelector('header.top') as HTMLElement
    const regionAt = (x: number, y: number) => {
      for (let el = document.elementFromPoint(x, y); el; el = el.parentElement) {
        const cs = getComputedStyle(el)
        const v = cs.getPropertyValue('app-region') || cs.getPropertyValue('-webkit-app-region')
        if (v === 'drag' || v === 'no-drag') return v
      }
      return 'none'
    }
    const tb = top.getBoundingClientRect()
    const cy = tb.top + tb.height / 2
    const center = (sel: string) => {
      const el = top.querySelector(sel)
      if (!el) return 'missing'
      const r = el.getBoundingClientRect()
      if (r.width === 0) return 'hidden'
      return regionAt(r.left + r.width / 2, r.top + r.height / 2)
    }
    const wco = (navigator as unknown as { windowControlsOverlay?: { visible: boolean; getTitlebarAreaRect(): DOMRect } })
      .windowControlsOverlay
    const area = wco?.visible ? wco.getTitlebarAreaRect() : null
    const capLeft = area ? area.x + area.width : Number.NaN
    const zoom = Number(document.documentElement.style.zoom) || 1
    const right = top.querySelector('.right')!.getBoundingClientRect()
    const cmd = top.querySelector('.cmd')!.getBoundingClientRect()
    const [gl, gr] = [...top.querySelectorAll('.drag-gap')]
    const gaps =
      gl && gr
        ? [
            (cmd.left - gl.previousElementSibling!.getBoundingClientRect().right) / zoom,
            (gr.nextElementSibling!.getBoundingClientRect().left - cmd.right) / zoom,
          ]
        : []
    const regions: Record<string, string> = {
      brand: center('.brand'),
      pill: center('.pill'),
      clock: center('.clock'),
      wname: center('.wname'),
      cmd: center('.cmd'),
      tab: center('.presets button'),
      gear: center('.right button:not(.opt)') === 'missing' ? center('.right button') : center('.right button:not(.opt)'),
      reserve: regionAt(capLeft - 20, cy),
    }
    top.querySelectorAll('.drag-gap').forEach((g, i) => {
      const r = g.getBoundingClientRect()
      regions[`gap${i}`] = regionAt(r.left + r.width / 2, cy)
    })
    return { fits: top.scrollWidth <= top.clientWidth + 1, gaps, reserve: (capLeft - right.right) / zoom, regions }
  })
}

/** FR-L13 の約束: はみ出さない・検索欄の左右に 48px 以上・閉じるボタンの左に 40px 以上・押せないものはドラッグできる */
export async function expectDraggableTitleBar(page: Page, label: string): Promise<TitleBarMeasure> {
  const m = await measureTitleBar(page)
  expect(m.fits, `${label}: はみ出さない`).toBe(true)
  expect(m.gaps, `${label}: 検索欄の左右`).toHaveLength(2)
  for (const g of m.gaps) expect(g, `${label}: 検索欄の左右の幅`).toBeGreaterThanOrEqual(47.5)
  expect(m.reserve, `${label}: 閉じるボタンの左`).toBeGreaterThanOrEqual(39.5)
  for (const k of ['brand', 'pill', 'clock', 'gap0', 'gap1', 'reserve']) {
    if ((k === 'clock' || k === 'pill') && m.regions[k] === 'hidden') continue // 狭い窓では省く
    expect(m.regions[k], `${label}: ${k} はドラッグできる`).toBe('drag')
  }
  expect(m.regions.cmd, `${label}: 検索欄は押せる`).toBe('no-drag')
  // 右のボタン（フリー N の最小の幅ではすべて省く）
  if (m.regions.gear !== 'hidden') expect(m.regions.gear, `${label}: ボタンは押せる`).toBe('no-drag')
  return m
}
