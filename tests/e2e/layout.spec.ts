// レイアウト（FR-L1〜L5, L9〜L11, FR-V5, FR-K1）: ペインの操作（ドラッグで落とす位置・キーでの分割と閉じる・最大化）、
// フリーのタブ、狭いペインの見出し、名前付きのレイアウト、再起動のあとも残ること。
// 木の操作そのものは単体テスト（tests/unit/renderer/layout.test.ts）で、ここでは当たり判定と見た目の位置を見る。
// ドラッグ（FR-L2）はポインタの操作そのものを確かめるのでマウスを使う（同じ操作はコマンドバーからもできる。下のキーのテスト）
import type { Locator, Page } from '@playwright/test'
import {
  command,
  expect,
  jump,
  keys,
  type Launched,
  type LaunchOpts,
  type LayoutDoc,
  pane,
  replaceSymbol,
  tab,
  test,
  type,
} from './support'

type Box = { x: number; y: number; width: number; height: number }
const boxOf = async (l: Locator): Promise<Box> => {
  const b = await l.boundingBox()
  if (!b) throw new Error('not visible')
  return b
}
const near = (a: number, b: number, tol = 12) => Math.abs(a - b) <= tol
const panes = (page: Page) => page.locator('.main [data-pane-id]')
const byId = (page: Page, id: string) => page.locator(`[data-pane-id="${id}"]`)
const idOf = async (l: Locator) => (await l.getAttribute('data-pane-id'))!

/** フリーのタブ（左に大きいチャート、右の列に 3 枚）を開いた状態で始める */
async function openFree(start: (o?: LaunchOpts) => Promise<Launched>, opts?: LaunchOpts): Promise<Launched> {
  const r = await start(opts)
  await tab(r.page, 'free')
  await expect(panes(r.page)).toHaveCount(4)
  return r
}

/** 画面（本体）の外側の端に落とす。端の帯はドラッグを始めてから出るので、本体の端の位置をねらう */
async function dragToEdge(page: Page, src: Locator, side: 'right' | 'bottom') {
  const mb = await boxOf(page.locator('.main'))
  const pos = side === 'right' ? { x: mb.width - 5, y: mb.height / 2 } : { x: mb.width / 2, y: mb.height - 5 }
  await src.locator('.ph').dragTo(page.locator('.main'), { sourcePosition: { x: 60, y: 8 }, targetPosition: pos, force: true })
}
/** ペインの見出しをつかんで、(x, y) まで動かして落とす（HTML5 のドラッグ） */
async function dragHeader(src: Locator, to: Locator, pos: { x: number; y: number }) {
  await src.locator('.ph').dragTo(to, { sourcePosition: { x: 60, y: 8 }, targetPosition: pos, force: true })
}

test.describe('ドラッグで落とす位置（FR-L2）', () => {
  for (const side of ['left', 'right', 'top', 'bottom'] as const) {
    test(`ペインを別のペインの${{ left: '左', right: '右', top: '上', bottom: '下' }[side]}端に落とすと、そのペインの半分に入る`, async ({
      start,
    }) => {
      const { page } = await openFree(start)
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
      await dragHeader(src, target, pos)
      // 落とした先のペインがあった場所の、その側の半分に入る
      await expect
        .poll(async () => {
          const m = await boxOf(byId(page, srcId))
          return side === 'left' || side === 'right'
            ? near(m.width, tb.width / 2, 16) && near(m.height, tb.height, 4) && near(m.x, side === 'left' ? tb.x : tb.x + tb.width / 2, 16)
            : near(m.height, tb.height / 2, 16) && near(m.width, tb.width, 4) && near(m.y, side === 'top' ? tb.y : tb.y + tb.height / 2, 16)
        })
        .toBe(true)
      await expect(panes(page)).toHaveCount(4)
    })
  }

  test('真ん中に落とすと 2 枚が入れ替わる', async ({ start }) => {
    const { page } = await openFree(start)
    const a = panes(page).nth(0)
    const b = panes(page).nth(3)
    const [aId, bId] = [await idOf(a), await idOf(b)]
    const [ab, bb] = [await boxOf(a), await boxOf(b)]
    await dragHeader(byId(page, bId), byId(page, aId), { x: ab.width / 2, y: ab.height / 2 })
    await expect
      .poll(async () => {
        const [na, nb] = [await boxOf(byId(page, aId)), await boxOf(byId(page, bId))]
        return near(nb.x, ab.x) && near(nb.width, ab.width) && near(na.x, bb.x) && near(na.y, bb.y)
      })
      .toBe(true)
  })

  test('一番右の列が上下に分かれていても、画面の右端に落とすと新しい列が増える', async ({ start }) => {
    const { page } = await openFree(start)
    const mb = await boxOf(page.locator('.main'))
    const src = panes(page).nth(1) // 右の列の一番上
    const srcId = await idOf(src)
    // ドラッグを始めると画面の端に帯が出る。右端の帯に落とす
    await dragToEdge(page, src, 'right')
    // 画面の右端に、上から下まで通しの列として入る（ほかの列の右）
    await expect
      .poll(async () => {
        const m = await boxOf(byId(page, srcId))
        return near(m.x + m.width, mb.x + mb.width, 4) && near(m.height, mb.height, 4)
      })
      .toBe(true)
    // 落としたあとは画面の端の帯が隠れる（見出しのボタンを覆わない）
    await expect(page.locator('[data-edge="top"]')).toBeHidden()
    // 3 列になり、元の右の列には 2 枚が残る
    const xs = new Set<number>()
    for (const p of await panes(page).all()) xs.add(Math.round((await boxOf(p)).x / 10))
    expect(xs.size).toBe(3)
    await expect(panes(page)).toHaveCount(4)
  })

  test('画面の下端に落とすと、全幅の新しい行が増える', async ({ start }) => {
    const { page } = await openFree(start)
    const mb = await boxOf(page.locator('.main'))
    const src = panes(page).nth(0)
    const srcId = await idOf(src)
    await dragToEdge(page, src, 'bottom')
    await expect
      .poll(async () => {
        const m = await boxOf(byId(page, srcId))
        return near(m.width, mb.width, 4) && near(m.y + m.height, mb.y + mb.height, 4)
      })
      .toBe(true)
  })
})

test.describe('キーでのペインの操作（FR-L1, FR-L3, FR-L9, FR-KB4）', () => {
  test('キーだけで: 分割・端の新しい列へ移す（コマンドバー）・閉じるとフォーカスが残ったペインへ', async ({ start }) => {
    const { page } = await openFree(start)
    const mb = await boxOf(page.locator('.main'))
    const focused = page.locator('.main .pane.focused')
    const ids = await Promise.all((await panes(page).all()).map(idOf))
    // 右の列の 3 枚目へ（F6 で順に巡る）
    await keys(page, 'F6', 'F6', 'F6')
    const fid = ids[3]!
    await expect(focused).toHaveAttribute('data-pane-id', fid)
    await command(page, '右端の新しい列')
    await expect
      .poll(async () => {
        const m = await boxOf(byId(page, fid))
        return near(m.x + m.width, mb.x + mb.width, 4) && near(m.height, mb.height, 4)
      })
      .toBe(true)
    await expect(byId(page, fid)).toHaveClass(/focused/)

    // Ctrl+Shift+E で右に分割 → 新しいペインにフォーカス → Ctrl+Shift+W で閉じると元のペインにフォーカスが戻る
    await keys(page, 'Control+Shift+e')
    await expect(panes(page)).toHaveCount(5)
    await expect(focused).not.toHaveAttribute('data-pane-id', fid)
    await keys(page, 'Control+Shift+w')
    await expect(panes(page)).toHaveCount(4)
    await expect(focused).toHaveCount(1)
    // 閉じたあとの区切りは残った列で埋まる（右端まで届く）
    await expect
      .poll(async () => {
        const m = await boxOf(byId(page, fid))
        return near(m.x + m.width, mb.x + mb.width, 4)
      })
      .toBe(true)
  })

  test('最大化したまま別のペイン（ドロワーのスクリーナー）を開くと、最大化を戻して見せる', async ({ start }) => {
    const { page } = await start()
    // グリッドのタブでグリッドを最大化する（スクリーナーは左のドロワーにある）
    await tab(page, 'grid')
    await expect(page.locator('.pane.focused')).toHaveAttribute('data-widget', 'grid')
    await keys(page, 'Control+Shift+Enter')
    await expect(page.locator('.pane.maxed')).toHaveCount(1)
    // スクリーンの一覧（Ctrl+O）から開く → 最大化を戻し、ドロワーのスクリーナーを見せる
    await keys(page, 'Control+o')
    await expect(page.locator('.dialog')).toBeVisible()
    await keys(page, 'Enter')
    await expect(page.locator('.pane.maxed')).toHaveCount(0)
    await expect(page.locator('[data-widget="screener"]')).toBeVisible()
  })

  test('サイズを戻す: 既定の大きさのままなら押せず、変えると押せる', async ({ start }) => {
    const { page } = await start()
    const reset = page.locator('header').getByRole('button', { name: 'サイズを戻す', exact: true })
    // トップバーのアイコンのボタン（名前とツールチップを持ち、見える文字は記号だけ。FR-V13）
    await expect(reset).toHaveAttribute('title', /./)
    expect(((await reset.textContent()) ?? '').replace(/[\s\d]/g, '').length).toBeLessThanOrEqual(1)
    await tab(page, 'grid')
    await expect(reset).toBeDisabled()
    await tab(page, 'mtf')
    await keys(page, 'Alt+Shift+ArrowRight')
    await expect(reset).toBeEnabled()
    await keys(page, 'Control+Alt+r')
    await expect(page.locator('.toasts')).toContainText('サイズを元に戻しました')
    await expect(reset).toBeDisabled()
  })
})

test.describe('フリーのタブ（FR-L11, FR-L10）', () => {
  test('チャートごとに別の銘柄・ジャンプはそのチャートだけ・C でこのチャートだけ変える', async ({ start }) => {
    const { page } = await openFree(start)
    await expect(panes(page).nth(0).locator('.ph')).toContainText('7203')
    await expect(panes(page).nth(1).locator('.ph')).toContainText('8306')
    // 左のドロワーにウォッチリスト・スクリーナーがある
    await expect(page.locator('[data-dock-rail="left"]')).toContainText('スクリーナー')

    // 2 枚目にフォーカスして銘柄ジャンプ: 2 枚目だけが変わる（F6 でペインを順に巡る）
    const ids = await Promise.all((await panes(page).all()).map(idOf))
    await keys(page, 'F6')
    await expect(page.locator('.pane.focused')).toHaveAttribute('data-pane-id', ids[1]!)
    await jump(page, '8001')
    await expect(panes(page).nth(1).locator('.ph')).toContainText('8001')
    await expect(panes(page).nth(0).locator('.ph')).toContainText('7203')
    await expect(panes(page).nth(2).locator('.ph')).toContainText('8058')

    // C キーでこのチャート（リンク色なし）の銘柄だけを変える
    await keys(page, 'F6')
    await expect(page.locator('.pane.focused')).toHaveAttribute('data-pane-id', ids[2]!)
    await keys(page, 'c')
    await replaceSymbol(page, '2914')
    await expect(panes(page).nth(2).locator('.ph')).toContainText('2914')
    await expect(panes(page).nth(1).locator('.ph')).toContainText('8001')
  })

  test('見出しの ⋯ から下に分割すると元の銘柄を引き継ぎ、初期状態に戻す確認は取り消しから始まる', async ({ start }) => {
    const { page } = await openFree(start)
    // 見出しから下に分割すると 5 枚になり、新しいチャートは元の銘柄を引き継ぐ（この幅では操作ボタンは「⋯」にまとまっている）
    await panes(page).nth(0).hover()
    await panes(page).nth(0).getByRole('button', { name: 'その他の操作' }).click()
    await page.locator('.dialog').getByText('下に分割', { exact: true }).click()
    await expect(panes(page)).toHaveCount(5)
    await expect(panes(page).nth(1).locator('.ph')).toContainText('7203')

    // このタブのレイアウトを初期状態に戻す: 確認は ← → で選び Enter で決める（危険な操作なので取り消しから始まる）
    const reset = async () => {
      await command(page, '初期状態')
      await expect(page.getByRole('alertdialog')).toContainText('「マイレイアウト · フリー」のレイアウト')
    }
    await reset()
    await keys(page, 'Enter') // 取り消し
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    await expect(panes(page)).toHaveCount(5)
    await reset()
    await keys(page, 'ArrowRight', 'Enter') // 実行
    await expect(page.locator('.toasts')).toContainText('「マイレイアウト · フリー」のレイアウトを初期状態に戻しました')
    await expect(panes(page)).toHaveCount(4)
  })
})

test.describe('狭いペインの見出し（FR-V5）', () => {
  /** ✕ と銘柄コードがペインの中に収まって見えるか */
  const fits = (pane: Locator) =>
    pane.evaluate((el) => {
      const p = el.getBoundingClientRect()
      const close = el.querySelector('.ph .tools button:last-child')?.getBoundingClientRect()
      const code = el.querySelector('.ph .sym .code') as HTMLElement | null
      const sym = el.querySelector('.ph .sym')?.getBoundingClientRect()
      return {
        close: !!close && close.width > 0 && close.right <= p.right + 0.5,
        code: !!code && !!sym && sym.width >= code.offsetWidth && code.getBoundingClientRect().right <= sym.right + 0.5,
      }
    })

  test('狭いチャートのペイン: ✕ と銘柄が見え、隠れた期間・時間軸は ⋯ とチップで変えられる', async ({ start }) => {
    const { page } = await start({ viewport: { width: 1000, height: 900 } })
    // トリプル（チャートを 3 つ横に並べる。1 つが約 250px）
    await tab(page, 'triple')
    const charts = page.locator('[data-widget="chart"]')
    await expect(charts.first()).toBeVisible()
    const widths: number[] = []
    for (const c of await charts.all()) {
      expect(await fits(c)).toEqual({ close: true, code: true })
      widths.push((await c.boundingBox())?.width ?? 0)
    }
    // いちばん狭いチャートで確かめる
    const first = charts.nth(widths.indexOf(Math.min(...widths)))
    expect(Math.min(...widths)).toBeLessThan(300)
    // 時間軸は 1 つのチップ（押すと D → W → M → D）
    await expect(first.locator('.ph .seg')).toBeHidden()
    const tf = (await first.locator('.ph .tfc').textContent())?.trim() as 'D' | 'W' | 'M'
    await first.locator('.ph .tfc').click()
    await expect(first.locator('.ph .tfc')).toHaveText({ D: 'W', W: 'M', M: 'D' }[tf])
    // 表示期間は ⋯ から
    await expect(first.locator('.ph .period')).toBeHidden()
    await first.getByRole('button', { name: 'その他の操作' }).click()
    const dlg = page.locator('.dialog')
    await expect(dlg).toContainText('右に分割')
    await dlg.getByText('表示期間', { exact: true }).click()
    await dlg.getByText('1年', { exact: true }).click()
    await first.getByRole('button', { name: 'その他の操作' }).click()
    await expect(dlg.locator('li, button, [role="option"]').filter({ hasText: '表示期間' }).first()).toContainText('1年')
    await keys(page, 'Escape')
    await expect(dlg).toHaveCount(0)
    // ⋯ からペインの操作も選べる（最大化）。広くなると従来どおり期間・D/W/M・操作ボタンが並ぶ
    await first.getByRole('button', { name: 'その他の操作' }).click()
    await dlg.getByText('ペインを最大化 / 戻す', { exact: true }).click()
    const wide = page.locator('.pane.maxed')
    await expect.poll(async () => (await wide.boundingBox())?.width ?? 0).toBeGreaterThan(820)
    await expect(wide.locator('.ph .period')).toBeVisible()
    await expect(wide.locator('.ph .seg')).toBeVisible()
    await expect(wide.getByRole('button', { name: 'その他の操作' })).toBeHidden()
    await expect(wide.getByRole('button', { name: 'ペインを閉じる' })).toBeVisible()
    expect(await fits(wide)).toEqual({ close: true, code: true })
  })
})

test.describe('銘柄を見える場所に出す・リンク色（FR-K1）', () => {
  test('コマンドバーの銘柄: 今のタブに出せないときは MTF タブに移って表示する', async ({ start }) => {
    const { page } = await start()
    const active = page.locator('.presets [aria-current="true"]')
    // トリプル: 同じリンク色のチャートがあるので、このタブのまま表示する
    await tab(page, 'triple')
    await command(page, '8058')
    await expect(active).toContainText('トリプル')
    await expect(page.locator('[data-widget="chart"]').first()).toContainText('8058')

    // グリッド: 左のドロワーのウォッチリストから（グリッドにはリンクのチャートが無い）→ MTF で表示する
    await tab(page, 'grid')
    await keys(page, 'Control+b')
    await expect(page.locator('.dock.open')).toBeVisible()
    await command(page, '9432')
    await expect(active).toContainText('MTF')
    await expect(page.locator('[data-widget="chart"]').first()).toContainText('9432')
    await expect(page.locator('.toasts')).toContainText('MTF')
  })

  test('リンク色を外した一覧（Ctrl+0）は、行を動かしてもチャートに銘柄を送らない', async ({ start }) => {
    const { page } = await start()
    const scr = page.locator('[data-widget="screener"]').first()
    const chart = page.locator('[data-widget="chart"]').first()
    await scr.locator('tbody tr').nth(1).click()
    const sym = async () => ((await chart.locator('.ph .sym .code').textContent()) ?? '').trim()
    /** チャートの銘柄が、一覧で選んでいる行の銘柄か（行の先頭がコード） */
    const followsSel = async () => {
      const code = await sym()
      const row = ((await scr.locator('tbody tr.sel').first().textContent()) ?? '').replace(/^\W*/, '')
      return !!code && row.startsWith(code)
    }
    await expect.poll(followsSel).toBe(true)
    // 外すと送らない
    await keys(page, 'Control+Digit0')
    await expect(scr.locator('.ph .link')).toHaveText('·')
    const before = await sym()
    expect(before).toMatch(/^[0-9]/)
    const selBefore = (await scr.locator('tbody tr.sel').textContent()) ?? ''
    await keys(page, 'ArrowDown', 'Enter')
    await expect(scr.locator('tbody tr.sel')).not.toHaveText(selBefore)
    await page.waitForTimeout(300) // 送らないことを確かめる（送る場合は 100ms 以内。FR-K2）
    expect(await sym()).toBe(before)
    // 付け直すと、また送る
    await keys(page, 'Control+Digit2', 'ArrowDown')
    await expect.poll(sym).not.toBe(before)
    await expect.poll(followsSel).toBe(true)
  })
})

test.describe('マイレイアウトのページ・再起動（FR-L4, FR-L14, FR-G11, FR-SC14）', () => {
  test('ほかのタブを写してページに足すとそのページを開き、メニューの数字でページを替えられ、再起動しても残る', async ({ start }) => {
    const first = await start()
    const { page } = first
    const grid = page.locator('[data-widget="grid"]')
    const menu = page.locator('.pmenu[role="menu"]')
    const current = page.locator('.presets [aria-current="true"]')
    await tab(page, 'grid')
    // Ctrl+Shift+L はどのタブからでもメニューを開く（タブは変えない）。「今のタブを写して足す」は削除の 1 つ上
    await keys(page, 'Control+Shift+l')
    await expect(menu).toBeVisible()
    await expect(current).toContainText('グリッド')
    await keys(page, 'End', 'ArrowUp', 'Enter')
    await type(page, '朝の確認')
    await keys(page, 'Enter')
    await expect(page.locator('.toasts')).toContainText('ページを足しました: 朝の確認')
    await expect(current).toContainText('マイレイアウト')
    await expect(current).toContainText('朝の確認') // タブに表示中のページの名前
    await expect(grid).toHaveCount(1)
    // マイレイアウトで Ctrl+Shift+8 をもう一度押すとメニュー。1 枚目（元のフリーのタブ）にグリッドは無く、2 枚目でまた出る
    await keys(page, 'Control+Shift+Digit8')
    await expect(menu).toContainText('朝の確認')
    await keys(page, 'Digit1')
    await expect(menu).toHaveCount(0)
    await expect(grid).toHaveCount(0)
    await keys(page, 'Control+Shift+Digit8', 'Digit2')
    await expect(grid).toHaveCount(1)
    // 開いたまま同じキーで閉じる
    await keys(page, 'Control+Shift+Digit8')
    await expect(menu).toBeVisible()
    await keys(page, 'Control+Shift+Digit8')
    await expect(menu).toHaveCount(0)
    await first.app.close() // 終了の前に main が全窓の保存を待つ

    const again = await start({ userData: first.userData })
    await expect(again.page.locator('[data-widget="grid"]')).toHaveCount(1)
    await keys(again.page, 'Control+Shift+l')
    await expect(again.page.locator('.pmenu [aria-checked="true"]')).toContainText('朝の確認')
  })

  test('新しいページを形を選んで作り、名前を変え、消して Ctrl+Z で戻す。コマンドバーからも開ける', async ({ start }) => {
    const { page } = await start()
    const menu = page.locator('.pmenu[role="menu"]')
    const charts = page.locator('.main [data-widget="chart"]')
    await tab(page, 'free')
    await keys(page, 'Control+Shift+Digit8', 'Insert')
    // 形: マイレイアウトの初めの並び → 空 → 4 分割
    await expect(page.locator('.dialog')).toContainText('4 分割')
    await keys(page, 'ArrowDown', 'ArrowDown', 'Enter')
    await type(page, '四つ')
    await keys(page, 'Enter')
    await expect(page.locator('.presets [aria-current="true"]')).toContainText('四つ')
    await expect(charts).toHaveCount(4)
    // F2 で名前を変える（終わるとメニューに戻る）
    await keys(page, 'Control+Shift+Digit8', 'F2')
    await keys(page, 'Control+a')
    await type(page, '四分割')
    await keys(page, 'Enter')
    await expect(menu).toContainText('四分割')
    // Delete を 2 回で消すと 1 枚目に移る。Ctrl+Z で戻る
    await keys(page, 'Delete')
    await expect(menu).toContainText('もう一度 Delete')
    await keys(page, 'Delete')
    await expect(page.locator('.toasts')).toContainText('ページを消しました: 四分割')
    await expect(menu).not.toContainText('四分割')
    await keys(page, 'Control+z')
    await expect(menu).toContainText('四分割')
    await keys(page, 'Escape')
    await expect(page.locator('.presets [aria-current="true"]')).toContainText('四分割')
    // コマンドバーの「マイレイアウト: <名前> を開く」
    await keys(page, 'Control+Shift+Digit8', 'Digit1')
    await expect(page.locator('.presets [aria-current="true"]')).not.toContainText('四分割')
    await keys(page, 'Control+k')
    await type(page, '四分割 を開く')
    await keys(page, 'Enter')
    await expect(page.locator('.presets [aria-current="true"]')).toContainText('四分割')
    await expect(charts).toHaveCount(4)
  })

  test('再起動してもタブ・グリッドの銘柄と時間軸・動かしたペインが残る', async ({ start }) => {
    const first = await start()
    // グリッド: 月足・この銘柄に固定（G11）
    await tab(first.page, 'grid')
    await keys(first.page, 'm', 'Alt+Digit5')
    await jump(first.page, '8951')
    await expect(first.page.locator('.bar select.srcsel')).toHaveValue('own')
    // フリー: 右の列の 1 枚目を画面の右端へ（L4）
    await tab(first.page, 'free')
    await expect(panes(first.page)).toHaveCount(4)
    const src = panes(first.page).nth(1)
    const srcId = await idOf(src)
    const mb = await boxOf(first.page.locator('.main'))
    await dragToEdge(first.page, src, 'right')
    await expect.poll(async () => near((await boxOf(byId(first.page, srcId))).height, mb.height, 4)).toBe(true)
    await first.app.close() // 終了の前に main が全窓の保存を待つ

    const { page } = await start({ userData: first.userData })
    await expect(page.locator('.presets [aria-current="true"]')).toContainText('マイレイアウト')
    const moved = await boxOf(byId(page, srcId))
    expect(near(moved.x + moved.width, mb.x + mb.width, 4)).toBe(true)
    expect(near(moved.height, mb.height, 4)).toBe(true)
    await tab(page, 'grid')
    await expect(page.locator('.bar select.srcsel')).toHaveValue('own')
    await expect(page.locator('.tile')).toHaveCount(1)
    await expect(page.locator('.seg button[aria-pressed="true"]').first()).toHaveText('M')
  })
})

test.describe('すべてのタブのレイアウトを初期状態に戻す（FR-L10）', () => {
  test('コマンドパレットから実行し、確認すると、崩したタブも初期の並びに戻る。表示中のタブはそのまま', async ({ start }) => {
    // MTF とスクリーナーのタブを、チャート 1 枚だけに崩した状態から起動する（表示中はフリー）
    const one = (doc: LayoutDoc) => {
      for (const id of ['mtf', 'screener']) doc.entries[id] = { root: pane('chart', { tf: 'D' }), docks: {} }
      doc.active = 'free'
    }
    const { page } = await start({ layout: one })
    await command(page, 'すべてのタブのレイアウトを初期状態に戻す')
    const dlg = page.getByRole('alertdialog')
    await expect(dlg).toContainText('すべてのタブ')
    await expect(dlg).toContainText('マイレイアウトのページ')
    await keys(page, 'ArrowRight', 'Enter')
    await expect(page.locator('.toasts')).toContainText('すべてのタブのレイアウトを初期状態に戻しました')
    await expect(page.locator('.presets [aria-current="true"]')).toContainText('マイレイアウト')
    await tab(page, 'mtf')
    await expect(page.locator('[data-widget="watchlist"]')).toHaveCount(1)
    await expect(page.locator('[data-widget="screener"]')).toHaveCount(1)
    await expect(page.locator('[data-widget="chart"]')).toHaveCount(3)
    await tab(page, 'screener')
    await expect(page.locator('[data-widget="info"]')).toHaveCount(1)
    await expect(page.locator('[data-widget="chart"]')).toHaveCount(2)
  })
})

test.describe('設定の「表示」から、すべてのタブのレイアウトを初期状態に戻す（FR-L10）', () => {
  test('ボタンを押して確認すると、崩したタブが初期の並びに戻る', async ({ start }) => {
    const one = (doc: LayoutDoc) => {
      doc.entries.mtf = { root: pane('chart', { tf: 'D' }), docks: {} }
      doc.active = 'free'
    }
    const { page } = await start({ layout: one })
    await keys(page, 'Control+Comma')
    const set = page.getByRole('dialog', { name: '設定' })
    await keys(page, 'ArrowDown') // 表示
    await expect(set).toContainText('テーマ')
    const btn = set.getByRole('button', { name: 'すべてのタブのレイアウトを初期状態に戻す' })
    await btn.focus()
    await keys(page, 'Enter')
    const dlg = page.getByRole('alertdialog')
    await expect(dlg).toContainText('すべてのタブ')
    await keys(page, 'ArrowRight', 'Enter')
    await expect(page.locator('.toasts')).toContainText('すべてのタブのレイアウトを初期状態に戻しました')
    await keys(page, 'Escape')
    await expect(set).toHaveCount(0)
    await tab(page, 'mtf')
    await expect(page.locator('[data-widget="watchlist"]')).toHaveCount(1)
    await expect(page.locator('[data-widget="screener"]')).toHaveCount(1)
    await expect(page.locator('[data-widget="chart"]')).toHaveCount(3)
  })
})
