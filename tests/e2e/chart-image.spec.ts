// チャートの画像の保存（FR-C11）: 既定は OFF で、見出しのボタンは出ず S も効かない。設定の「チャート」で ON にして初めてボタンが出て、
// S で PNG を保存する（保存ダイアログは main で差し替える）。値はスタブの架空の値
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, jump, keys, rpc, test } from './support'

test.describe('チャートの画像の保存（FR-C11）', () => {
  test('既定の OFF ではボタンが無く S も効かない。ON にするとボタンが出て、S で PNG を保存する', async ({ start }) => {
    const { app, page, userData } = await start()
    const file = join(userData, 'chart-shot.png')
    // 保存ダイアログを差し替え、呼ばれた回数と既定のファイル名を残す
    await app.evaluate(({ dialog }, f) => {
      const g = globalThis as { saveCalls?: string[] }
      g.saveCalls = []
      dialog.showSaveDialog = (async (_w: unknown, o: { defaultPath?: string }) => {
        g.saveCalls!.push(o.defaultPath ?? '')
        return { canceled: false, filePath: f }
      }) as unknown as typeof dialog.showSaveDialog
    }, file)
    const calls = () => app.evaluate(() => (globalThis as { saveCalls?: string[] }).saveCalls ?? [])

    const chart = page.locator('[data-widget="chart"]').first()
    await keys(page, 'Alt+ArrowRight', 'Alt+ArrowUp')
    await expect(chart).toHaveClass(/focused/)
    await jump(page, '8306')
    await expect(chart.locator('.legend')).toBeVisible()
    const btn = chart.getByRole('button', { name: '画像を保存' })

    // 既定は OFF: ボタンは無く、S を押しても保存しない
    expect((await rpc<{ settings: { chartSave: boolean } }>(page, 'user.load')).settings.chartSave).toBe(false)
    await expect(btn).toHaveCount(0)
    await keys(page, 's')
    await expect(page.locator('.toasts')).not.toContainText('チャートの画像を保存しました')
    expect(await calls()).toEqual([])

    // 設定（Ctrl+,）→ ↓↓ で「チャート」→ Tab で目標利回りの線、もう一度 Tab で画像の保存（目標の欄は OFF で飛ばす）→ Space で ON
    await keys(page, 'Control+Comma')
    const dlg = page.getByRole('dialog', { name: '設定' })
    await keys(page, 'ArrowDown', 'ArrowDown', 'Tab', 'Tab')
    const toggle = dlg.getByRole('button', { name: 'チャートの画像の保存' })
    await expect(toggle).toBeFocused()
    await expect(dlg).toContainText('公開・再配布しないでください')
    await keys(page, 'Space')
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(async () => (await rpc<{ settings: { chartSave: boolean } }>(page, 'user.load')).settings.chartSave).toBe(true)
    await keys(page, 'Escape')
    await expect(dlg).toHaveCount(0)

    // ボタンが出る。S で保存する
    await expect(btn).toBeVisible()
    await expect(chart).toHaveClass(/focused/)
    await keys(page, 's')
    await expect(page.locator('.toasts')).toContainText('チャートの画像を保存しました')
    expect(await calls()).toEqual(['elecxstock-8306-D-2026-11-13.png'])
    expect(existsSync(file)).toBe(true)
    // PNG で、チャートの本体の上に見出しの 1 行を足した大きさ
    const png = readFileSync(file)
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const w = png.readUInt32BE(16)
    const h = png.readUInt32BE(20)
    const box = (await chart.locator('.host').boundingBox())!
    const dpr = await page.evaluate(() => window.devicePixelRatio)
    expect(Math.abs(w - box.width * dpr)).toBeLessThanOrEqual(2)
    expect(Math.abs(h - (box.height + 28) * dpr)).toBeLessThanOrEqual(2)

    // OFF に戻すとボタンは消え、S も効かない
    await keys(page, 'Control+Comma', 'ArrowDown', 'ArrowDown', 'Tab', 'Tab', 'Space', 'Escape')
    await expect(btn).toHaveCount(0)
    await keys(page, 's')
    expect(await calls()).toHaveLength(1)
  })
})
