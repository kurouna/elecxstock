// 安全策（NFR-A2, NFR-S1）: renderer は sandbox・contextIsolation で、window.elecxstock 以外の手段を持たない。CSP で外へ通信できない
import { expect, test } from './support'

test.describe('renderer の隔離と通信の制限（NFR-A2, NFR-S1）', () => {
  test('窓は sandbox・contextIsolation・nodeIntegration なしで作られ、画面から Node に触れない', async ({ start }) => {
    const { app, page } = await start()
    const prefs = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().map((w) => {
        const p = (w.webContents as unknown as { getLastWebPreferences(): Record<string, unknown> | null }).getLastWebPreferences() ?? {}
        return { sandbox: p.sandbox, contextIsolation: p.contextIsolation, nodeIntegration: p.nodeIntegration }
      }),
    )
    expect(prefs.length).toBeGreaterThan(0)
    for (const p of prefs) expect(p).toEqual({ sandbox: true, contextIsolation: true, nodeIntegration: false })
    const g = await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>
      return { require: typeof w.require, process: typeof w.process, module: typeof w.module, api: typeof w.elecxstock }
    })
    expect(g).toEqual({ require: 'undefined', process: 'undefined', module: 'undefined', api: 'object' })
  })

  test("CSP は connect-src 'none'。画面からの fetch は外へ出ずに止まる", async ({ start }) => {
    const { page } = await start()
    const r = await page.evaluate(async () => {
      const violated = new Promise<string>((res) =>
        document.addEventListener('securitypolicyviolation', (e) => res(e.effectiveDirective), { once: true }),
      )
      const blocked = await fetch('https://query1.finance.yahoo.com/').then(
        () => false,
        () => true,
      )
      return { blocked, directive: await violated }
    })
    expect(r).toEqual({ blocked: true, directive: 'connect-src' })
  })
})
