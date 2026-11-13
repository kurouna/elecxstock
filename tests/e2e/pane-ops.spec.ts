// ペインの操作（FR-L2）を実際のアプリで確かめる: ドラッグで落とす位置（上下左右・真ん中・画面の外側の端）、
// キー・コマンドバーでの分割・閉じる・端への移動、再起動のあとも残ること。
// 木の操作そのものは単体テスト（tests/unit/renderer/layout.test.ts）で、ここでは当たり判定と見た目の位置を見る
import { expect, type Locator, type Page, test } from '@playwright/test'
import { keys, launch } from './helpers'

type Box = { x: number; y: number; width: number; height: number }
const boxOf = async (l: Locator): Promise<Box> => {
  const b = await l.boundingBox()
  if (!b) throw new Error('not visible')
  return b
}
const near = (a: number, b: number, tol = 12) => Math.abs(a - b) <= tol

/** フリーのタブ（左に大きいチャート、右の列に 3 枚）を開いた状態で始める */
async function openFree() {
  const r = await launch()
  await r.page.getByRole('dialog').first().waitFor()
  await keys(r.page, 'Enter', 'Enter')
  await expect(r.page.locator('footer')).toContainText(/待機中/, { timeout: 60_000 })
  await keys(r.page, 'Control+Shift+Digit8')
  await expect(r.page.locator('.main [data-pane-id]')).toHaveCount(4)
  return r
}
const panes = (page: Page) => page.locator('.main [data-pane-id]')
const byId = (page: Page, id: string) => page.locator(`[data-pane-id="${id}"]`)
const idOf = async (l: Locator) => (await l.getAttribute('data-pane-id'))!

/** 画面（本体）の外側の端に落とす。端の帯はドラッグを始めてから出るので、本体の端の位置をねらう */
async function dragToEdge(page: Page, src: Locator, side: 'right' | 'bottom') {
  const mb = await boxOf(page.locator('.main'))
  const pos = side === 'right' ? { x: mb.width - 5, y: mb.height / 2 } : { x: mb.width / 2, y: mb.height - 5 }
  await src.locator('.ph').dragTo(page.locator('.main'), { sourcePosition: { x: 60, y: 8 }, targetPosition: pos, force: true })
  await page.waitForTimeout(150)
}
/** ペインの見出しをつかんで、(x, y) まで動かして落とす（HTML5 のドラッグ） */
async function dragHeader(page: Page, src: Locator, to: Locator, pos: { x: number; y: number }) {
  await src.locator('.ph').dragTo(to, { sourcePosition: { x: 60, y: 8 }, targetPosition: pos, force: true })
  await page.waitForTimeout(150)
}

for (const side of ['left', 'right', 'top', 'bottom'] as const) {
  test(`ペインを別のペインの${{ left: '左', right: '右', top: '上', bottom: '下' }[side]}端に落とすと、そのペインの半分に入る`, async () => {
    const { app, page } = await openFree()
    const target = panes(page).nth(0) // 左の大きいチャート
    const src = panes(page).nth(2) // 右の列の 2 枚目
    const srcId = await idOf(src)
    const tb = await boxOf(target)
    const inset = 32 // 画面の外側の端の帯（14px）にかからない、ペインの端の 25% の内側
    const pos = {
      left: { x: inset, y: tb.height / 2 },
      right: { x: tb.width - inset, y: tb.height / 2 },
      top: { x: tb.width / 2, y: inset + 30 },
      bottom: { x: tb.width / 2, y: tb.height - inset },
    }[side]
    await dragHeader(page, src, target, pos)
    const moved = await boxOf(byId(page, srcId))
    // 落とした先のペインがあった場所の、その側の半分に入る
    if (side === 'left' || side === 'right') {
      expect(near(moved.width, tb.width / 2, 16)).toBe(true)
      expect(near(moved.height, tb.height, 4)).toBe(true)
      expect(near(moved.x, side === 'left' ? tb.x : tb.x + tb.width / 2, 16)).toBe(true)
    } else {
      expect(near(moved.height, tb.height / 2, 16)).toBe(true)
      expect(near(moved.width, tb.width, 4)).toBe(true)
      expect(near(moved.y, side === 'top' ? tb.y : tb.y + tb.height / 2, 16)).toBe(true)
    }
    await expect(panes(page)).toHaveCount(4)
    await app.close()
  })
}

test('真ん中に落とすと 2 枚が入れ替わる', async () => {
  const { app, page } = await openFree()
  const a = panes(page).nth(0)
  const b = panes(page).nth(3)
  const [aId, bId] = [await idOf(a), await idOf(b)]
  const [ab, bb] = [await boxOf(a), await boxOf(b)]
  await dragHeader(page, byId(page, bId), byId(page, aId), { x: ab.width / 2, y: ab.height / 2 })
  const [na, nb] = [await boxOf(byId(page, aId)), await boxOf(byId(page, bId))]
  expect(near(nb.x, ab.x) && near(nb.width, ab.width)).toBe(true)
  expect(near(na.x, bb.x) && near(na.y, bb.y)).toBe(true)
  await app.close()
})

test('一番右の列が上下に分かれていても、画面の右端に落とすと新しい列が増える', async () => {
  const { app, page } = await openFree()
  const main = page.locator('.main')
  const mb = await boxOf(main)
  const src = panes(page).nth(1) // 右の列の一番上
  const srcId = await idOf(src)
  // ドラッグを始めると画面の端に帯が出る。右端の帯に落とす
  await dragToEdge(page, src, 'right')
  const moved = await boxOf(byId(page, srcId))
  // 画面の右端に、上から下まで通しの列として入る（ほかの列の右）
  expect(near(moved.x + moved.width, mb.x + mb.width, 4)).toBe(true)
  expect(near(moved.height, mb.height, 4)).toBe(true)
  // 落としたあとは画面の端の帯が隠れる（見出しのボタンを覆わない）
  await expect(page.locator('[data-edge="top"]')).toBeHidden()
  // 3 列になり、元の右の列には 2 枚が残る
  const xs = new Set<number>()
  for (const p of await panes(page).all()) xs.add(Math.round((await boxOf(p)).x / 10))
  expect(xs.size).toBe(3)
  await expect(panes(page)).toHaveCount(4)
  await app.close()
})

test('画面の下端に落とすと、全幅の新しい行が増える', async () => {
  const { app, page } = await openFree()
  const mb = await boxOf(page.locator('.main'))
  const src = panes(page).nth(0)
  const srcId = await idOf(src)
  await dragToEdge(page, src, 'bottom')
  const moved = await boxOf(byId(page, srcId))
  expect(near(moved.width, mb.width, 4)).toBe(true)
  expect(near(moved.y + moved.height, mb.y + mb.height, 4)).toBe(true)
  await app.close()
})

test('キーだけで: 分割・端の新しい列へ移す（コマンドバー）・閉じるとフォーカスが残ったペインへ', async () => {
  const { app, page } = await openFree()
  const mb = await boxOf(page.locator('.main'))
  // 右の列の 3 枚目へ（F6 で順に巡る）
  await keys(page, 'F6', 'F6', 'F6')
  const focused = page.locator('.main .pane.focused')
  const fid = await idOf(focused)
  await keys(page, 'Control+k')
  await page.keyboard.type('右端の新しい列')
  await keys(page, 'Enter')
  const moved = await boxOf(byId(page, fid))
  expect(near(moved.x + moved.width, mb.x + mb.width, 4)).toBe(true)
  expect(near(moved.height, mb.height, 4)).toBe(true)
  await expect(byId(page, fid)).toHaveClass(/focused/)

  // Ctrl+Shift+E で右に分割 → 新しいペインにフォーカス → Ctrl+Shift+W で閉じると元のペインにフォーカスが戻る
  await keys(page, 'Control+Shift+e')
  await expect(panes(page)).toHaveCount(5)
  const added = await idOf(page.locator('.main .pane.focused'))
  expect(added).not.toBe(fid)
  await keys(page, 'Control+Shift+w')
  await expect(panes(page)).toHaveCount(4)
  await expect(page.locator('.main .pane.focused')).toHaveCount(1)
  // 閉じたあとの区切りは残った列で埋まる（右端まで届く）
  const after = await boxOf(byId(page, fid))
  expect(near(after.x + after.width, mb.x + mb.width, 4)).toBe(true)
  await app.close()
})

test('動かしたレイアウトは再起動のあとも残る', async () => {
  const first = await openFree()
  const src = panes(first.page).nth(1)
  const srcId = await idOf(src)
  await dragToEdge(first.page, src, 'right')
  const mb = await boxOf(first.page.locator('.main'))
  await first.page.waitForTimeout(800) // 保存を待つ
  await first.app.close()
  const second = await launch({ userData: first.userData })
  const page = second.page
  await expect(page.locator('.presets [aria-current="true"]')).toContainText('フリー')
  const moved = await boxOf(byId(page, srcId))
  expect(near(moved.x + moved.width, mb.x + mb.width, 4)).toBe(true)
  expect(near(moved.height, mb.height, 4)).toBe(true)
  await second.app.close()
})
