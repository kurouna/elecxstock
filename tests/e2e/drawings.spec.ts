// チャートの描画（トレンドライン。FR-C13・C14・C16・C18。docs/design-drawings.md）: キーだけで引く・選ぶ・動かす・消す・戻す、
// 時間軸を替えても同じ日付・再起動しても残る・グリッドのタイルにも出る。キャンバスの中は読めないので、チャートの要素の
// data-drawings（図形）・data-draw-state（状態とカーソル）と、タイルの canvas[data-drawings]（描いた本数）で確かめる。値はスタブ（架空）
import type { Locator, Page } from '@playwright/test'
import { expect, keys, readUser, rpc, tab, test } from './support'

type Shown = {
  id: string
  a: { date: string; raw: number; shown: number | null }
  b: { date: string; raw: number; shown: number | null }
  extend: string
}
type State = { m: string; id?: string; target?: string; date?: string; price?: number; snap?: string | null; note?: string }
const host = (chart: Locator) => chart.locator('.host').first()
const drawings = async (chart: Locator): Promise<Shown[]> => JSON.parse((await host(chart).getAttribute('data-drawings')) ?? '[]')
const state = async (chart: Locator): Promise<State> => JSON.parse((await host(chart).getAttribute('data-draw-state')) ?? '{"m":"idle"}')

/** MTF のタブの上の広い日足のチャートへ（chart.spec.ts と同じ道） */
async function topChart(page: Page): Promise<Locator> {
  const chart = page.locator('[data-widget="chart"]').first()
  await keys(page, 'Alt+ArrowRight', 'Alt+ArrowUp')
  await expect(chart).toHaveClass(/focused/)
  await expect(host(chart)).toHaveAttribute('data-drawings', /^\[/)
  return chart
}
/** 始点を 20 本前の高値、終点を 10 本後の高値にして引く */
async function drawOne(page: Page, chart: Locator): Promise<void> {
  await keys(page, 'Alt+t')
  await expect.poll(async () => (await state(chart)).m).toBe('start')
  await keys(page, 'Shift+ArrowLeft', 'Shift+ArrowLeft', 'Enter')
  await expect.poll(async () => (await state(chart)).m).toBe('end')
  await keys(page, 'Shift+ArrowRight', 'Enter')
  await expect.poll(async () => (await state(chart)).m).toBe('sel')
}

test.describe('トレンドラインをキーだけで引く（FR-C13, FR-C14）', () => {
  test('Alt+T → ← → で足 → Enter で始点 → Enter で終点。引いた線は選ばれ、案内の行が出る', async ({ start }) => {
    const { page, userData } = await start()
    const chart = await topChart(page)
    const guide = chart.locator('[data-draw-guide]')
    await expect(guide).toHaveCSS('visibility', 'hidden')
    await keys(page, 'Alt+t')
    await expect(guide).toHaveCSS('visibility', 'visible')
    await expect(guide).toContainText('始点')
    // 最初は高値に吸着している。↓ で次の点（値の小さい方）へ、Shift+↓ で吸着を外す
    expect((await state(chart)).snap).toBe('h')
    await keys(page, 'ArrowDown')
    expect((await state(chart)).snap).not.toBe('h')
    await keys(page, 'Shift+ArrowDown')
    expect((await state(chart)).snap).toBeNull()
    await keys(page, 'ArrowUp')
    await keys(page, 'Shift+ArrowLeft', 'Shift+ArrowLeft', 'Enter')
    const s1 = await state(chart)
    expect(s1.m).toBe('end')
    await expect(guide).toContainText('終点')
    // 同じ足では決められない
    await keys(page, 'Enter')
    await expect.poll(async () => (await state(chart)).note).toBe('sameBar')
    await keys(page, 'Shift+ArrowRight', 'Enter')
    await expect.poll(async () => (await state(chart)).m).toBe('sel')
    const [d] = await drawings(chart)
    expect(d).toBeTruthy()
    expect(d!.a.date < d!.b.date).toBe(true)
    expect(d!.extend).toBe('none')
    await expect(guide).toContainText('Space')
    // Core に保存されている
    await expect.poll(() => Object.values(readUser<Record<string, unknown[]>>(userData, 'drawings') ?? {}).flat().length).toBe(1)
    // Esc で選択を外すと案内も消える
    await keys(page, 'Escape')
    await expect(guide).toHaveCSS('visibility', 'hidden')
  })

  test('Esc: 終点から始点へ戻り、始点でやめる。引いている途中に時間軸を替えるとやめる', async ({ start }) => {
    const { page } = await start()
    const chart = await topChart(page)
    await keys(page, 'Alt+t', 'ArrowLeft', 'Enter')
    expect((await state(chart)).m).toBe('end')
    await keys(page, 'Escape')
    expect((await state(chart)).m).toBe('start')
    await keys(page, 'Escape')
    expect((await state(chart)).m).toBe('idle')
    await keys(page, 'Alt+t', 'Enter')
    await keys(page, 'w')
    await expect.poll(async () => (await state(chart)).m).toBe('idle')
    expect(await drawings(chart)).toHaveLength(0)
  })

  test('Ctrl+← → で山・谷へ跳ぶ', async ({ start }) => {
    const { page } = await start()
    const chart = await topChart(page)
    await keys(page, 'Alt+t')
    const d0 = (await state(chart)).date!
    await keys(page, 'Control+ArrowLeft')
    const s = await state(chart)
    expect(s.date! < d0).toBe(true)
    expect(['h', 'l']).toContain(s.snap)
  })
})

test.describe('選ぶ・動かす・消す・戻す（FR-C14）', () => {
  test('G で選び、Space で全体を動かす。E で延長、Delete で消し、Ctrl+Z で戻す・Ctrl+Y でやり直す', async ({ start }) => {
    const { page } = await start()
    const chart = await topChart(page)
    await drawOne(page, chart)
    await keys(page, 'Escape')
    expect((await state(chart)).m).toBe('idle')
    await keys(page, 'g')
    const sel = await state(chart)
    expect(sel).toMatchObject({ m: 'sel', target: 'none' })
    const before = (await drawings(chart))[0]!
    // 見るだけのときの ← は表示のスクロールで、線は動かない
    await keys(page, 'ArrowLeft')
    expect((await drawings(chart))[0]!.a.date).toBe(before.a.date)
    // Space で全体: → で 1 本右、↑ で上へ
    await keys(page, 'Space')
    expect((await state(chart)).target).toBe('all')
    await keys(page, 'ArrowRight')
    const moved = (await drawings(chart))[0]!
    expect(moved.a.date > before.a.date).toBe(true)
    expect(moved.b.date > before.b.date).toBe(true)
    await keys(page, 'ArrowUp')
    expect((await drawings(chart))[0]!.a.shown!).toBeGreaterThan(moved.a.shown!)
    // Space で始点だけ
    await keys(page, 'Space')
    expect((await state(chart)).target).toBe('a')
    const b0 = (await drawings(chart))[0]!.b
    await keys(page, 'ArrowLeft')
    const one = (await drawings(chart))[0]!
    expect(one.b).toEqual(b0)
    // E で延長（なし → 右）
    await keys(page, 'e')
    expect((await drawings(chart))[0]!.extend).toBe('right')
    // Delete で消し、Ctrl+Z で戻す
    await keys(page, 'Delete')
    await expect.poll(async () => (await drawings(chart)).length).toBe(0)
    expect((await state(chart)).m).toBe('idle')
    await keys(page, 'Control+z')
    await expect.poll(async () => (await drawings(chart)).length).toBe(1)
    expect((await drawings(chart))[0]!.extend).toBe('right')
    await keys(page, 'Control+y')
    await expect.poll(async () => (await drawings(chart)).length).toBe(0)
  })

  test('Enter のメニューで延長・価格ラベルを選ぶ', async ({ start }) => {
    const { page } = await start()
    const chart = await topChart(page)
    await drawOne(page, chart)
    await keys(page, 'Enter')
    const dlg = page.locator('.dialog')
    await expect(dlg).toContainText('トレンドライン')
    // 延長（なし・右・左・左右）の 4 つ目
    await keys(page, 'ArrowDown', 'ArrowDown', 'ArrowDown', 'Enter')
    await expect.poll(async () => (await drawings(chart))[0]?.extend).toBe('both')
  })

  test('I のメニューの「トレンドライン」: 線が無いときは「トレンドラインを選ぶ」「すべて消す」を出さない', async ({ start }) => {
    const { page } = await start()
    const chart = await topChart(page)
    const dlg = page.locator('.dialog')
    await keys(page, 'i', 'End', 'Enter')
    await expect(dlg).toContainText('トレンドラインを引く')
    await expect(dlg).not.toContainText('トレンドラインを選ぶ')
    await expect(dlg).not.toContainText('すべて消す')
    await keys(page, 'Escape')
    await expect(dlg).toHaveCount(0)
    await drawOne(page, chart)
    await keys(page, 'Escape', 'i', 'End', 'Enter')
    await expect(dlg).toContainText('トレンドラインを選ぶ')
    await expect(dlg).toContainText('この銘柄のトレンドラインをすべて消す')
    // 選ぶ（2 つ目）で、引いた線が選ばれる
    await keys(page, 'ArrowDown', 'Enter')
    await expect.poll(async () => (await state(chart)).m).toBe('sel')
  })

  test('I のメニューの「トレンドライン」から、この銘柄のトレンドラインをすべて消す（Ctrl+Z で戻せる）', async ({ start }) => {
    const { page } = await start()
    const chart = await topChart(page)
    await drawOne(page, chart)
    await keys(page, 'Escape')
    await drawOne(page, chart)
    await keys(page, 'Escape')
    expect(await drawings(chart)).toHaveLength(2)
    // 「トレンドライン」はメニューの最後、「すべて消す」はその中の最後
    await keys(page, 'i')
    await expect(page.locator('.dialog')).toContainText('トレンドライン')
    await keys(page, 'End', 'Enter')
    await expect(page.locator('.dialog')).toContainText('この銘柄のトレンドラインをすべて消す')
    await keys(page, 'End', 'Enter')
    await expect(page.getByRole('alertdialog')).toContainText('2 本')
    await keys(page, 'ArrowRight', 'Enter')
    await expect.poll(async () => (await drawings(chart)).length).toBe(0)
    await keys(page, 'Control+z')
    await expect.poll(async () => (await drawings(chart)).length).toBe(2)
  })
})

test.describe('時間軸・再起動・表示の切り替え（FR-C13, FR-C16）', () => {
  test('週足に替えても同じ日付・価格のまま。再起動しても残る', async ({ start, launch }) => {
    const { app, page, userData } = await start()
    const chart = await topChart(page)
    await drawOne(page, chart)
    const d = (await drawings(chart))[0]!
    await keys(page, 'w')
    await expect(chart.locator('.tfb').first()).toHaveText('W')
    expect((await drawings(chart))[0]).toEqual(d)
    await app.close()
    const again = await launch({ userData })
    await expect(again.page.locator('[data-widget="chart"]').first().locator('.host')).toHaveAttribute('data-drawings', /"id"/, {
      timeout: 20_000,
    })
    const c2 = again.page.locator('[data-widget="chart"]').first()
    expect((await drawings(c2))[0]!.a).toEqual(d.a)
  })

  test('未調整の表示でも点は同じ未調整の価格。配当込み・比較の表示では引けない', async ({ start }) => {
    const { page } = await start()
    const chart = await topChart(page)
    await drawOne(page, chart)
    const d = (await drawings(chart))[0]!
    await keys(page, 'Escape', 'a') // 分割調整 → 未調整
    await expect.poll(async () => (await drawings(chart))[0]?.a.shown).toBe(d.a.raw)
    await keys(page, 'a') // → 配当込み
    await expect.poll(async () => (await drawings(chart)).length).toBe(0)
    await keys(page, 'Alt+t')
    await expect(page.locator('.toasts')).toContainText('配当込みの表示ではトレンドラインを引けません')
    expect((await state(chart)).m).toBe('idle')
  })
})

test.describe('グリッドのタイル（FR-C18）', () => {
  test('引いた線はタイルにも出る（見るだけ）', async ({ start }) => {
    const { page } = await start()
    await tab(page, 'grid')
    const grid = page.locator('[data-widget="grid"]')
    const first = grid.locator('canvas[data-id]').first()
    await expect(first).toHaveAttribute('data-drawings', '0')
    const id = (await first.getAttribute('data-id'))!
    await rpc(page, 'drawings.create', {
      id,
      drawing: {
        id: 'g1',
        kind: 'trend',
        a: { date: '2026-08-03', raw: 3000 },
        b: { date: '2026-11-02', raw: 3100 },
        extend: 'right',
        priceLabel: true,
        log: false,
      },
    })
    // タブを替えて戻ると読み直す（自分の窓の書き込みは手元のストアを通るので、ここでは開き直して確かめる）
    await tab(page, 'mtf')
    await tab(page, 'grid')
    await expect(grid.locator(`canvas[data-id="${id}"]`)).toHaveAttribute('data-drawings', '1')
    await expect(grid.locator(`canvas[data-id]:not([data-id="${id}"])`).first()).toHaveAttribute('data-drawings', '0')
  })
})
