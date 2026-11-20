// 目標利回りの線（FR-C12）: 設定の「チャート」で ON にして目標の % を打つと、チャートとグリッドのタイルに、その利回りになる株価の点線を引く。
// 値はスタブの架空の値。キャンバスの線は読めないので、チャートは凡例の値、タイルは描いた線のラベル（canvas の data-yield）で確かめる
import { expect, jump, keys, rpc, tab, test } from './support'

type Settings = { yieldLine: boolean; yieldTargets: number[] }
const metricOf = async (page: Parameters<typeof rpc>[0], id: string) =>
  ((await rpc<{ id: string; div12: number | null; close: number | null }[]>(page, 'metrics.get', { ids: [id] })) ?? [])[0]!

test.describe('目標利回りの線（FR-C12）', () => {
  test('設定の「チャート」で ON にして目標を打つと、チャートの凡例に目標の株価が出る。OFF なら出ない', async ({ start }) => {
    const { page } = await start()
    const chart = page.locator('[data-widget="chart"]').first()
    await keys(page, 'Alt+ArrowRight', 'Alt+ArrowUp')
    await expect(chart).toHaveClass(/focused/)
    await jump(page, '8951')
    await expect(chart.locator('.legend')).toBeVisible()
    // 既定は OFF
    await expect(chart.locator('.legend .yl')).toHaveCount(0)

    // 設定（Ctrl+,）→ ↓↓ で「チャート」→ Tab で中へ。Space で ON、目標は 3 つまで打てる
    await keys(page, 'Control+Comma')
    const dlg = page.getByRole('dialog', { name: '設定' })
    await keys(page, 'ArrowDown', 'ArrowDown')
    await expect(dlg.getByRole('tab', { name: 'チャート' })).toHaveAttribute('aria-selected', 'true')
    await keys(page, 'Tab')
    await expect(dlg.getByRole('switch', { name: '目標利回りの線' })).toBeFocused()
    await keys(page, 'Space')
    await expect(dlg.getByRole('switch', { name: '目標利回りの線' })).toHaveAttribute('aria-checked', 'true')
    const inputs = dlg.getByRole('textbox', { name: /^目標利回り \d$/ })
    await expect(inputs).toHaveCount(3)
    await expect(inputs.first()).toHaveValue('4')
    await keys(page, 'Tab', 'Control+a')
    await page.keyboard.type('５．５')
    await keys(page, 'Tab')
    await page.keyboard.type('4%')
    await keys(page, 'Tab')
    // 読めない値は保存しない（前の値のまま）
    await page.keyboard.type('abc')
    await keys(page, 'Enter')
    await expect.poll(async () => (await rpc<{ settings: Settings }>(page, 'user.load')).settings.yieldTargets).toEqual([4, 5.5])
    await expect(inputs.nth(2)).toHaveValue('')
    await keys(page, 'Escape', 'Escape')
    await expect(dlg).toHaveCount(0)

    // 凡例: 利回りの低い順（株価の高い順）に、目標の利回り・株価・今の株価からの差
    const m = await metricOf(page, 'JP:8951')
    expect(m.div12).toBeGreaterThan(0)
    const yl = chart.locator('.legend .yl')
    await expect(yl).toHaveCount(2)
    await expect(yl.nth(0)).toContainText('目標 4%')
    await expect(yl.nth(0)).toContainText(Math.round(m.div12! / 0.04).toLocaleString('ja-JP'))
    await expect(yl.nth(1)).toContainText('目標 5.5%')
    await expect(yl.nth(1)).toContainText(Math.round(m.div12! / 0.055).toLocaleString('ja-JP'))

    // OFF に戻すと消える
    await keys(page, 'Control+Comma', 'ArrowDown', 'ArrowDown', 'Tab', 'Space', 'Escape', 'Escape')
    await expect(yl).toHaveCount(0)
  })

  test('チャートは設定の画面の上限（3 つ）より多い目標も全部引く。グリッドのタイルは目盛りの範囲に入る線だけを描く', async ({ start }) => {
    const targets = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const { page } = await start({ settings: { yieldLine: true, yieldTargets: targets } })
    const chart = page.locator('[data-widget="chart"]').first()
    await keys(page, 'Alt+ArrowRight', 'Alt+ArrowUp')
    await jump(page, '8951')
    await expect(chart.locator('.legend .yl')).toHaveCount(targets.length)
    // 幅の狭いペイン（560px 以下。MTF の週足・月足など）の凡例は、今の株価からの差を省いて折り返しを減らす（出来高と同じ）
    const legends = await page.locator('.pane').evaluateAll((ps) =>
      ps.flatMap((p) => {
        const d = p.querySelector('.legend .yl .dim')
        return d ? [{ w: p.getBoundingClientRect().width, shown: getComputedStyle(d).display !== 'none' }] : []
      }),
    )
    expect(legends.some((x) => x.w <= 560)).toBe(true)
    expect(legends.some((x) => x.w > 560)).toBe(true)
    for (const x of legends) expect(x.shown, `幅 ${x.w}`).toBe(x.w > 560)

    await tab(page, 'grid')
    const grid = page.locator('[data-widget="grid"]')
    await expect(grid.locator('canvas[data-id]').first()).toBeVisible()
    // 配当のある銘柄のどれかのタイルに、範囲に入った線が描かれる。描いたラベルは目標のどれか
    await expect.poll(() => grid.locator('canvas[data-yield]:not([data-yield=""])').count()).toBeGreaterThan(0)
    const drawn = await grid.locator('canvas[data-yield]:not([data-yield=""])').first().getAttribute('data-yield')
    for (const l of drawn!.split(' ')) expect(targets.map((p) => `${p}%`)).toContain(l)
  })

  // 回帰（2026-11-16 のレビュー）: 欄に打ったまま Enter・Tab を押さずに Esc で閉じると、打った値が保存されなかった
  test('欄に打ったまま Esc で設定を閉じても、打った目標を保存する', async ({ start }) => {
    const { page } = await start({ settings: { yieldLine: true, yieldTargets: [4] } })
    await keys(page, 'Control+Comma', 'ArrowDown', 'ArrowDown', 'Tab', 'Tab', 'Tab')
    const dlg = page.getByRole('dialog', { name: '設定' })
    await expect(dlg.getByRole('textbox', { name: '目標利回り 2' })).toBeFocused()
    await page.keyboard.type('6')
    await keys(page, 'Escape', 'Escape')
    await expect(dlg).toHaveCount(0)
    await expect.poll(async () => (await rpc<{ settings: Settings }>(page, 'user.load')).settings.yieldTargets).toEqual([4, 6])
  })

  test('比較の表示（% 目盛り）にすると線と凡例が消え、比較をやめると戻る。グリッドの比較% でも描かない', async ({ start }) => {
    const { page } = await start({ settings: { yieldLine: true, yieldTargets: [4, 5.5] } })
    const chart = page.locator('[data-widget="chart"]').first()
    await keys(page, 'Alt+ArrowRight', 'Alt+ArrowUp')
    await jump(page, '8951')
    const yl = chart.locator('.legend .yl')
    await expect(yl).toHaveCount(2)
    // I → 「比較する銘柄を足す…」（↓ で送る）→ 銘柄を選ぶ
    await keys(page, 'i')
    await expect(page.locator('.dialog')).toContainText('比較する銘柄を足す')
    await keys(page, 'ArrowDown', 'ArrowDown', 'ArrowDown', 'Enter')
    const pal = page.locator('.dialog.palette')
    await expect(pal).toContainText('重ねて比べる銘柄を選ぶ')
    await page.keyboard.type('8058')
    await expect(pal.locator('.it.sel')).toContainText('8058')
    await keys(page, 'Enter')
    await expect(chart.locator('.legend')).toContainText('比較')
    await expect(yl).toHaveCount(0)
    // 比較をやめる（↓ で 5 つ目）→ 戻る
    await keys(page, 'i')
    await expect(page.locator('.dialog')).toContainText('比較をやめる')
    await keys(page, 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'Enter')
    await expect(chart.locator('.legend')).not.toContainText('比較')
    await expect(yl).toHaveCount(2)

    // グリッド: N で比較%（線を描かない）、もう一度 N で戻すと描く
    await tab(page, 'grid')
    const grid = page.locator('[data-widget="grid"]')
    const drawn = grid.locator('canvas[data-yield]:not([data-yield=""])')
    await expect.poll(() => drawn.count()).toBeGreaterThan(0)
    await keys(page, 'n')
    await expect(grid.getByRole('button', { name: '比較%' })).toHaveAttribute('aria-pressed', 'true')
    await expect(drawn).toHaveCount(0)
    await keys(page, 'n')
    await expect.poll(() => drawn.count()).toBeGreaterThan(0)
  })

  test('無配に転じた銘柄・上場 12 か月未満の銘柄には引かない', async ({ start }) => {
    const { page } = await start({ settings: { yieldLine: true, yieldTargets: [4] } })
    const chart = page.locator('[data-widget="chart"]').first()
    await keys(page, 'Alt+ArrowRight', 'Alt+ArrowUp')
    // スタブの境界の銘柄（架空の設定）: 8002 は 2024 年を最後に無配、1605 は 2026-03-02 に上場（配当はあるが 12 か月に満たない）
    const noDiv = await metricOf(page, 'JP:8002')
    expect(noDiv.div12 ?? 0).toBe(0)
    const young = await rpc<{ div12: number | null; yieldTrailing: number | null }[]>(page, 'metrics.get', { ids: ['JP:1605'] })
    expect(young[0]!.yieldTrailing).toBeNull()
    for (const code of ['8002', '1605']) {
      await jump(page, code)
      await expect(chart.locator('.ph').first()).toContainText(code)
      await expect(chart.locator('.legend')).toBeVisible()
      await expect(chart.locator('.legend .yl')).toHaveCount(0)
    }
    // 引ける銘柄に戻すと出る（銘柄を変えたときに描き直す）
    await jump(page, '8951')
    await expect(chart.locator('.legend .yl')).toHaveCount(1)
  })

  test('OFF のときは、グリッドのタイルにも描かない', async ({ start }) => {
    const { page } = await start({ settings: { yieldLine: false, yieldTargets: [1, 2, 3, 4, 5] } })
    await tab(page, 'grid')
    const grid = page.locator('[data-widget="grid"]')
    await expect(grid.locator('canvas[data-id]').first()).toBeVisible()
    await expect(grid.locator('canvas[data-yield]:not([data-yield=""])')).toHaveCount(0)
  })
})
