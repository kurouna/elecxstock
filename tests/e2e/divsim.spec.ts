// 配当シミュレータ（FR-SIM1〜SIM9。docs/design-simulator.md）: スクリーナーのタブの右下にリンク 2 で置き、
// スクリーナーの結果を仮想の銘柄群として計算する。キーボードだけで操作する。値はスタブ（架空）
import type { Page } from '@playwright/test'
import { expect, keys, rpc, tab, test } from './support'

const sim = (page: Page) => page.locator('[data-widget="divsim"]')

/** スクリーナーのタブを開き、右下の配当シミュレータへフォーカスを移して、最初の計算が終わるまで待つ */
async function openSim(page: Page) {
  await tab(page, 'screener')
  const s = sim(page)
  await expect(s).toHaveCount(1)
  await keys(page, 'Alt+ArrowRight', 'Alt+ArrowRight', 'Alt+ArrowDown')
  await expect(s).toHaveClass(/focused/)
  await expect(s.getByTestId('sim-past')).toBeVisible({ timeout: 15_000 })
  return s
}

test.describe('配当シミュレータ（FR-SIM1・SIM2・SIM5・SIM7・SIM9）', () => {
  test('スクリーナーのタブの右下にリンク 2 で置かれ、計算のたびに読み込み中を出してから全部を出す', async ({ start }) => {
    const { page } = await start()
    const s = await openSim(page)
    await expect(s.locator('.link')).toHaveText('2')
    await expect(s.getByTestId('sim-wealth')).toHaveText(/\d/)
    await expect(s.getByTestId('sim-basis')).toContainText('今上場している銘柄だけです')
    await expect(s.getByTestId('sim-disclaimer')).toContainText('投資助言ではありません。')
    // 設定を変える（R: 受け取る → 再投資）と、読み込み中を出してから計算し直す
    const before = await s.getByTestId('sim-wealth').textContent()
    await keys(page, 'r')
    await expect(s.getByTestId('sim-loading')).toBeVisible()
    await expect(s.getByTestId('sim-disclaimer')).toBeVisible()
    await expect(s.getByTestId('sim-past')).toBeVisible()
    await expect(s.locator('.cfg')).toContainText('再投資')
    await expect(s.getByTestId('sim-wealth')).not.toHaveText(before ?? '')
    // Alt+1 で基準日 1 年前
    await keys(page, 'Alt+Digit1')
    await expect(s.locator('.cfg')).toContainText('1 年前')
    await expect(s.getByTestId('sim-past')).toBeVisible()
    await expect(s.locator('.c-hero h3')).toContainText('1 年前に')
  })
})

/** 読み込み中が出た回数を数え始める（一瞬でも出たら数える。expect の待ち合わせで見逃さない） */
async function countLoads(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __simLoads: number }
    w.__simLoads = 0
    let shown = false
    new MutationObserver(() => {
      const now = !!document.querySelector('[data-testid="sim-loading"]')
      if (now && !shown) w.__simLoads++
      shown = now
    }).observe(document.body, { subtree: true, childList: true })
  })
  return () => page.evaluate(() => (window as unknown as { __simLoads: number }).__simLoads)
}

test.describe('表示の切り替えでは計算し直さない（FR-SIM7）', () => {
  test('B・P・V・PgDn・PgUp・S では読み込み中を一度も出さず、選んだ銘柄も動かない', async ({ start }) => {
    const { page } = await start()
    // 開く前から数える。最初の計算で月次系列の無い銘柄（1306 など）の取得を頼むと、その取得の完了で 1 回だけ計算し直す（正しい動き）
    const loads = await countLoads(page)
    const s = await openSim(page)
    await expect
      .poll(() =>
        rpc<{ status: string }[]>(page, 'jobs.list').then((js) => js.every((j) => ['done', 'failed', 'cancelled'].includes(j.status))),
      )
      .toBe(true)
    const refetched = (await rpc<{ kind: string }[]>(page, 'jobs.list')).some((j) => j.kind === 'refetch')
    await expect.poll(loads).toBe(refetched ? 2 : 1)
    await expect(s.getByTestId('sim-loading')).toHaveCount(0)
    await expect(s.getByTestId('sim-past')).toBeVisible()
    const base = await loads()
    await keys(page, 'ArrowDown', 'ArrowDown')
    const id = await s.locator('tbody tr.sel').getAttribute('data-id')
    await keys(page, 'b')
    await expect(s.locator('.cfg')).toContainText('比べる 1306')
    await keys(page, 'p')
    await expect(s.locator('.c-hist .tok').last()).toHaveText('%')
    await expect(s.locator('tbody tr.sel')).toHaveAttribute('data-id', id!)
    // 表を選んでいる間の PgDn は行を送るので、Esc でカードの選択を外してからタブを替える
    await keys(page, 'Escape', 'PageDown')
    await expect(s.getByTestId('sim-fwd')).toBeVisible()
    await keys(page, 'v', 'PageUp')
    await expect(s.getByTestId('sim-past')).toBeVisible()
    expect(await loads()).toBe(base)
    // 計算し直す入力（X: 税）では 1 回だけ出す
    await keys(page, 'x')
    await expect(s.locator('.cfg')).toContainText('税引前')
    await expect(s.getByTestId('sim-past')).toBeVisible()
    expect(await loads()).toBe(base + 1)
  })
})

test.describe('配当シミュレータのキー操作（FR-SIM3・SIM4・SIM6）', () => {
  test('B で比べる相手、PgDn でこれから、V で受取の目安 ⇔ 権利確定月、表の行の Enter でリンク先の銘柄が変わる', async ({ start }) => {
    const { page } = await start()
    const s = await openSim(page)
    await expect(s.locator('.cfg')).toContainText('1306 と同業種')
    // 最大化では入力が変わらないので計算し直さない（読み込み中を出さない）
    await keys(page, 'Control+Shift+Enter')
    await expect(s).toHaveClass(/maxed/)
    await expect(s.getByTestId('sim-past')).toBeVisible()
    await expect(s.getByTestId('sim-loading')).toHaveCount(0)
    await keys(page, 'b')
    await expect(s.locator('.cfg')).toContainText('比べる 1306')
    // 比べる相手は計算し直さない（読み込み中を出さない）
    await expect(s.getByTestId('sim-loading')).toHaveCount(0)
    await keys(page, 'PageDown')
    await expect(s.getByTestId('sim-fwd')).toBeVisible()
    await expect(s.getByTestId('sim-y1')).toHaveText(/\d/)
    await expect(s.locator('.c-cal h3')).toContainText('受取の目安')
    await keys(page, 'v')
    await expect(s.locator('.c-cal h3')).toContainText('権利確定月')
    // 表の行: ↓ で選び、Enter で同じリンク色の銘柄情報に出す
    await keys(page, 'ArrowDown')
    const id = await s.locator('tbody tr.sel').getAttribute('data-id')
    expect(id).toBeTruthy()
    await keys(page, 'Enter')
    await expect(page.locator('[data-widget="info"]').first()).toContainText(id!.replace('JP:', ''))
    // 並べ替えの名前を見出しに出す（狭い幅で列が隠れても何順か分かる）
    await expect(s.getByTestId('sim-sort')).toContainText('1 年目')
    await keys(page, 's')
    await expect(s.getByTestId('sim-sort')).toContainText('利回り')
    // N で前提のカードを選ぶ
    await keys(page, 'n')
    await expect(s.locator('[data-card="basis"]')).toHaveClass(/sel/)
    await expect(s.getByTestId('sim-basis')).toContainText('予想ではありません')
  })
})
