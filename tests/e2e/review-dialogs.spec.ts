// コードレビュー（2026-11-21）の指摘の再現: ダイアログ・ポップアップ（docs/design-dialogs.md）。どれも直す前は落ちた。
// ツールチップはマウスだけの補助なので、そこだけマウスを使う
import type { Page } from '@playwright/test'
import { expect, keys, rpc, tab, test, type } from './support'

/** フォーカスがその要素の中にあるか */
const inside = (page: Page, sel: string) => page.evaluate((s) => !!document.activeElement?.closest(s), sel)

test.describe('条件を選ぶダイアログ（FR-SC17, FR-KB2）', () => {
  test('説明のツールチップは ⓘ の横に出て、窓からはみ出さない', async ({ start }) => {
    const { page } = await start()
    await tab(page, 'screener')
    await keys(page, 'Insert')
    const fp = page.locator('.dialog.picker')
    const info = fp.locator('.it.sel .info')
    await info.hover()
    const tip = page.locator('.tip')
    await expect(tip).toBeVisible()
    const [i, b, vw] = await Promise.all([info.boundingBox(), tip.boundingBox(), page.evaluate(() => window.innerWidth)])
    // ⓘ のすぐ横（右か左）で、縦も ⓘ の近く
    expect(Math.min(Math.abs(b!.x - (i!.x + i!.width)), Math.abs(b!.x + b!.width - i!.x))).toBeLessThan(40)
    expect(Math.abs(b!.y - i!.y)).toBeLessThan(80)
    expect(b!.x + b!.width).toBeLessThanOrEqual(vw)
  })

  test('当たる項目が 0 件のときの Enter・Shift+Enter は何も足さない（前に選んでいた項目を足さない）', async ({ start }) => {
    const { page } = await start()
    await tab(page, 'screener')
    const conds = page.locator('[data-widget="screener"] .cond')
    const n0 = await conds.count()
    await keys(page, 'Insert')
    const fp = page.locator('.dialog.picker')
    await type(page, 'zzzzqq')
    await expect(fp.getByRole('option')).toHaveCount(0)
    await expect(fp.locator('.lx-desc b')).toHaveCount(0)
    await keys(page, 'Shift+Enter', 'Enter')
    await expect(fp).toBeVisible()
    await keys(page, 'Escape', 'Escape')
    await expect(fp).toHaveCount(0)
    await expect(conds).toHaveCount(n0)
  })
})

test.describe('コマンドバーの銘柄だけを探すとき（FR-KB1）', () => {
  test('C で開いた（範囲の無い）コマンドバーで、語が空なら打つものを案内する（Tab の案内を出さない）', async ({ start }) => {
    const { page } = await start()
    await tab(page, 'mtf')
    await keys(page, 'KeyC')
    const pal = page.locator('.dialog.palette')
    await expect(pal).toContainText('代わりに表示する銘柄')
    await expect(pal.locator('.lx-empty')).toContainText('コード・銘柄名')
    await expect(pal.locator('.lx-empty')).not.toContainText('Tab')
  })
})

test.describe('ペインの種類（FR-KB10）', () => {
  test('語を消して全件に戻ったら、選んでいるカードが見える', async ({ start }) => {
    const { page } = await start()
    await keys(page, 'Control+Shift+KeyN')
    const dlg = page.locator('.dialog.wpick')
    await type(page, 'ジョブ')
    await expect(dlg.locator('.card.sel')).toHaveAttribute('data-widget', 'jobs')
    await keys(page, 'Escape')
    await expect(dlg.locator('.card')).toHaveCount(17)
    await expect(dlg.locator('.card.sel')).toBeInViewport({ ratio: 1 })
  })
})

test.describe('スクリーニング条件の一覧（FR-SC12）', () => {
  const many = Array.from({ length: 30 }, (_, k) => ({
    id: `s${k}`,
    name: { ja: k === 29 ? `とても長い名前のスクリーニング条件 ${'あ'.repeat(60)}` : `条件 ${k}`, en: `Screen ${k}` },
    conditions: [{ field: 'income.yield', op: '>=', value: 3 }],
    created: 1,
    updated: 1,
  }))
  test('キーで末尾まで送ると選んだ行が見え、長い名前でも「もう一度 Delete」の札が切れない', async ({ start }) => {
    const { page } = await start({ user: { screens: many } })
    await tab(page, 'screener')
    await keys(page, 'Control+o')
    const dlg = page.locator('.dialog.scrlist')
    await keys(page, 'End')
    const sel = dlg.locator('.it.sel')
    await expect(sel).toContainText('とても長い名前')
    await expect(sel).toBeInViewport({ ratio: 1 })
    await keys(page, 'Delete')
    const tag = sel.locator('.tag.del')
    await expect(tag).toBeVisible()
    const [t, r] = await Promise.all([tag.boundingBox(), sel.boundingBox()])
    expect(t!.x + t!.width).toBeLessThanOrEqual(r!.x + r!.width)
    // 札の文字が切れていない（はみ出しを隠していない）
    expect(await tag.evaluate((x) => x.scrollWidth <= x.clientWidth + 1)).toBe(true)
  })
})

test.describe('Tab でダイアログの外へ出ない（FR-KB2）', () => {
  test('名前の入力・アラートの一覧・アラートと保有のフォーム', async ({ start }) => {
    const { page } = await start()
    const tabs = async (n: number) => {
      for (let k = 0; k < n; k++) await keys(page, 'Tab')
    }
    // 名前の入力（ページのメニューの F2）
    await tab(page, 'free')
    await keys(page, 'Control+Shift+Digit8', 'F2')
    await tabs(6)
    expect(await inside(page, '.dialog.box')).toBe(true)
    await keys(page, 'Shift+Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab')
    expect(await inside(page, '.dialog.box')).toBe(true)
    await keys(page, 'Escape', 'Escape')
    // アラートの一覧
    await keys(page, 'Control+Alt+l')
    await tabs(8)
    expect(await inside(page, '.dialog.alerts')).toBe(true)
    // アラートのフォーム
    await keys(page, 'Insert')
    await expect(page.locator('.dialog.alertform')).toBeVisible()
    await tabs(14)
    expect(await inside(page, '.dialog.alertform')).toBe(true)
    await keys(page, 'Escape', 'Escape')
    // 保有のフォーム
    await tab(page, 'holdings')
    await keys(page, 'Insert')
    await tabs(9)
    expect(await inside(page, '.dialog.holding')).toBe(true)
    await keys(page, 'Escape')
  })

  test('保有のフォームで「キャンセル」にフォーカスして Enter を押すと、保存せずに閉じる', async ({ start }) => {
    const { page } = await start()
    await tab(page, 'holdings')
    await keys(page, 'Insert')
    const form = page.locator('.dialog.holding')
    await type(page, '7203')
    await keys(page, 'Tab', 'Tab')
    await type(page, '100')
    await keys(page, 'Tab')
    await type(page, '2500')
    await keys(page, 'Tab')
    await expect(form.getByRole('button', { name: 'キャンセル' })).toBeFocused()
    await keys(page, 'Enter')
    await expect(form).toHaveCount(0)
    const list = await rpc<unknown[]>(page, 'portfolio.list')
    expect(list).toHaveLength(0)
  })
})
