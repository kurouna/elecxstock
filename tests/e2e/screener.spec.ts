// スクリーナー（FR-SC1〜SC16, FR-FD1, FR-H6）: 条件を選ぶダイアログ・条件の編集・金額の単位・0 件・スクリーンの一覧・★だけ表示・ツールバー。
// キーボードだけで操作する（重なりの確かめだけクリックする）。値はスタブ（架空）
import type { Locator, Page } from '@playwright/test'
import { expect, freeTab, holdings, keys, pane, rpc, tab, test, type } from './support'

const screener = (page: Page) => page.locator('[data-widget="screener"]')

/** スクリーナーのタブを開き、スクリーナーにフォーカスがある状態にする */
async function openScreener(page: Page): Promise<Locator> {
  await tab(page, 'screener')
  const scr = screener(page)
  await expect(scr).toHaveClass(/focused/)
  await expect(scr.locator('tbody tr').first()).toBeVisible()
  return scr
}

/** 条件を選ぶダイアログ（Insert）で打って足す */
async function addField(page: Page, q: string, opts: { keepOpen?: boolean } = {}) {
  const fp = page.locator('.dialog.picker')
  if (!(await fp.isVisible())) {
    await keys(page, 'Insert')
    await expect(fp).toBeVisible()
  }
  await type(page, q)
  await expect(fp.getByRole('option', { selected: true })).toBeVisible()
  await keys(page, opts.keepOpen ? 'Shift+Enter' : 'Enter')
  if (!opts.keepOpen) await expect(fp).toHaveCount(0)
}

/** 足した（フォーカスのある）条件の値を Enter で打つ */
async function typeValue(page: Page, text: string, label?: string | RegExp) {
  await keys(page, 'Enter')
  const dlg = page.locator('.dialog').last()
  await expect(dlg.locator('input')).toBeFocused()
  if (label) await expect(dlg).toContainText(label)
  await keys(page, 'Control+a')
  await type(page, text)
  await keys(page, 'Enter')
  await expect(page.locator('.dialog')).toHaveCount(0)
}

test.describe('条件を選ぶダイアログ（FR-SC1, FR-FD1）', () => {
  test('Insert で開き、打って絞り込み、Enter で足す。EPS は円のまま出す', async ({ start }) => {
    const { page } = await start()
    const scr = await openScreener(page)
    const conds = scr.locator('.cond')
    const n0 = await conds.count()
    await keys(page, 'Insert')
    const fp = page.locator('.dialog.picker')
    await expect(fp.getByRole('group', { name: '割安・財務' })).toBeVisible()
    await type(page, 'ROE')
    await expect(fp.getByRole('option', { selected: true })).toContainText('ROE')
    await keys(page, 'Enter')
    await expect(fp).toHaveCount(0)
    await expect(conds).toHaveCount(n0 + 1)
    await expect(conds.last()).toContainText('ROE')
    // EPS（1 株あたりの円）は円のまま出す（「0 万」にしない）。Enter で打つときも円
    await addField(page, 'EPS')
    await expect(conds.last().locator('.v')).toHaveText(/^100(.0)?$/)
    // 足した条件に移っているので、Enter で値を打つ（円）。Esc で戻り、Delete で外す
    await keys(page, 'Enter')
    await expect(page.locator('.dialog').last()).toContainText('EPS（円）')
    await keys(page, 'Escape')
    await expect(page.locator('.dialog')).toHaveCount(0)
    await keys(page, 'Delete', 'Escape')
    await expect(conds).toHaveCount(n0 + 1)
  })

  test('Shift+Enter は続けて足し、足した項目にすぐ ✓ が付く。Esc は検索を消してから閉じる。無い項目は理由を出す', async ({ start }) => {
    const { page } = await start({ settings: { recentFields: ['value.roe'] } })
    const scr = await openScreener(page)
    const conds = scr.locator('.cond')
    const n0 = await conds.count()
    const fp = page.locator('.dialog.picker')
    await keys(page, 'Insert')
    await expect(fp).toBeVisible()
    await expect(fp.locator('.recent')).toContainText('ROE') // よく使う
    await addField(page, '最低投資', { keepOpen: true })
    await expect(conds).toHaveCount(n0 + 1)
    await expect(fp).toBeVisible()
    await expect(fp.getByRole('option', { name: /最低投資金額/ }).locator('.ck')).toBeVisible()
    await keys(page, 'Escape')
    await expect(fp.locator('input')).toHaveValue('')
    await addField(page, 'ボラ', { keepOpen: true })
    await keys(page, 'Escape', 'Escape')
    await expect(fp).toHaveCount(0)
    await expect(conds).toHaveCount(n0 + 2)
    await expect(conds.nth(n0)).toContainText('最低投資金額')
    await expect(conds.nth(n0 + 1)).toContainText('ボラティリティ')

    // 無い項目は理由を出す
    await keys(page, 'Insert')
    await type(page, '自己資本比率')
    await expect(fp.locator('.empty')).toBeVisible()
    await keys(page, 'Escape', 'Escape')
    await expect(fp).toHaveCount(0)
    await expect(conds).toHaveCount(n0 + 2)
  })

  test('F で今の条件の指標を変える', async ({ start }) => {
    const { page } = await start()
    const scr = await openScreener(page)
    const first = scr.locator('.cond').first()
    await expect(first).not.toContainText('PBR')
    await keys(page, 'Tab')
    await expect(first).toHaveClass(/focus/)
    await keys(page, 'KeyF')
    const fp = page.locator('.dialog.picker')
    await expect(fp).toBeVisible()
    await type(page, 'PBR')
    await keys(page, 'Enter')
    await expect(fp).toHaveCount(0)
    await expect(first).toContainText('PBR')
  })
})

test.describe('条件の値の単位（FR-SC1, FR-FD1。アラートと同じ。alerts.spec.ts）', () => {
  test('時価総額は億円で打つ（100 → 100 億）。「30万」のように単位を付けてもよい', async ({ start }) => {
    const { page } = await start()
    const scr = await openScreener(page)
    const cond = scr.locator('.cond').last()
    await addField(page, '時価総額')
    await expect(cond).toContainText('時価総額')
    await typeValue(page, '100', '億円')
    await expect(cond.locator('.v')).toHaveText(/^100\s?億$/)
    // 直すときは表示の単位の数が入っている
    await keys(page, 'Enter')
    await expect(page.locator('.dialog').last().locator('input')).toHaveValue('100')
    await keys(page, 'Escape')
    await expect(page.locator('.dialog')).toHaveCount(0)
    await typeValue(page, '30万')
    await expect(cond.locator('.v')).toHaveText(/^30\s?万$/)
  })
})

test.describe('条件の編集（FR-SC1, FR-SC8, FR-H6）', () => {
  test('ウォッチリストは置かず、条件の並べ替え・記号は真ん中・保有の記録があれば「保有」を選べる', async ({ start }) => {
    const { page } = await start({ user: { holdings: holdings([{ code: '7203', quantity: 100, avgCost: 2500 }]) } })
    const scr = await openScreener(page)
    await expect(page.locator('[data-widget="watchlist"]')).toHaveCount(0)
    const conds = scr.locator('.cond')
    await expect(conds).toHaveCount(3)
    const first = (await conds.nth(0).locator('.f').textContent())!
    // ↓ で 1 番目を下へ、↑ で戻す
    await conds.nth(0).getByRole('button', { name: '下に移す' }).click()
    await expect(conds.nth(1).locator('.f')).toHaveText(first)
    await conds.nth(1).getByRole('button', { name: '上に移す' }).click()
    await expect(conds.nth(0).locator('.f')).toHaveText(first)
    // 比較の記号は真ん中
    expect(
      await conds
        .nth(0)
        .locator('.op')
        .evaluate((el) => getComputedStyle(el).justifyContent),
    ).toBe('center')
    // 指標をクリックすると選び直せる。保有の記録があるので「保有」を選べる
    await conds.nth(2).locator('.f').click()
    const dlg = page.locator('.dialog')
    await expect(dlg).toContainText('保有')
    await dlg.getByText('保有', { exact: true }).click()
    await expect(conds.nth(2).locator('.f')).toHaveText('保有')
  })

  test('結果が 0 件ならそう表示し、空の知らせが条件をふさがない（値をクリックして直せる）', async ({ start }) => {
    const { page } = await start()
    const scr = await openScreener(page)
    await addField(page, 'ボラ')
    await typeValue(page, '0.0001')
    await expect(scr.locator('.state')).toContainText('条件に合う銘柄はありません')
    await scr.locator('.cond').last().locator('.v').click({ timeout: 5000 })
    await expect(page.locator('.dialog').last()).toContainText('ボラティリティ')
    await keys(page, 'Escape')
  })
})

test.describe('スクリーンの一覧・★だけ表示（FR-SC12, FR-SC13, FR-FV2）', () => {
  test('スクリーン一覧: 末尾を消したあとも Enter で開ける', async ({ start }) => {
    const { page } = await start()
    await openScreener(page)
    await keys(page, 'Control+o')
    const list = page.locator('.dialog')
    await expect(list.locator('.sel')).toHaveCount(1)
    await keys(page, 'End')
    const last = (await list.locator('.sel').textContent())!.trim().slice(0, 6)
    await keys(page, 'Delete', 'Delete')
    await expect(list).not.toContainText(last)
    await expect(list.locator('.sel')).toHaveCount(1)
    await keys(page, 'Enter')
    await expect(list).toBeHidden()
  })

  test('条件を変えて（未保存）から別のスクリーンを開くと 3 択。← → でボタンを移れる', async ({ start }) => {
    const { page } = await start()
    const scr = await openScreener(page)
    await keys(page, 'Tab', 'Delete')
    await expect(scr).toContainText('変更あり')
    await keys(page, 'Control+o')
    await expect(page.locator('.dialog .sel')).toHaveCount(1)
    await keys(page, 'ArrowDown', 'Enter')
    const ask = page.getByRole('alertdialog')
    await expect(ask).toContainText('保存されていない変更があります')
    await expect(ask.locator('kbd', { hasText: 'Esc' })).toBeVisible()
    await expect(page.locator(':focus')).toHaveText('保存')
    await keys(page, 'ArrowLeft')
    await expect(page.locator(':focus')).toHaveText('破棄')
    await keys(page, 'ArrowLeft')
    await expect(page.locator(':focus')).toHaveText('キャンセル')
    await keys(page, 'ArrowRight', 'ArrowRight')
    await expect(page.locator(':focus')).toHaveText('保存')
    await keys(page, 'Escape')
    await expect(ask).toHaveCount(0)
  })

  test('Ctrl+Shift+F で★の銘柄だけにする（ほかの一覧と同じ）', async ({ start }) => {
    const { page } = await start()
    const scr = await openScreener(page)
    const rows = scr.locator('tbody tr')
    // 選んだ行を★にしてから絞る
    await keys(page, 'ArrowDown')
    await expect(scr.locator('tbody tr.sel')).toHaveCount(1)
    await keys(page, 'Control+d')
    await expect(scr.locator('tbody tr.sel .star')).toHaveClass(/on/)
    const all = await rows.count()
    await keys(page, 'Control+Shift+f')
    await expect(scr.getByRole('button', { name: '★のみ表示' })).toHaveClass(/on/)
    await expect(rows).toHaveCount(1)
    expect(all).toBeGreaterThan(1)
    await keys(page, 'Control+Shift+f')
    await expect(rows).toHaveCount(all)
  })

  test('ツールバーは説明文をラベルにせず、アイコンのボタンに名前とツールチップを付ける（FR-V13）', async ({ start }) => {
    const { page } = await start()
    const scr = await openScreener(page)
    for (const [name, tip] of [
      ['名前を付けて保存', /Ctrl\+Shift\+S/],
      ['グリッドで開く', /Ctrl\+Shift\+G/],
      ['列を選ぶ', /Ctrl\+Shift\+C/],
    ] as const) {
      const b = scr.getByRole('button', { name, exact: true })
      await expect(b).toBeVisible()
      await expect(b).toHaveAttribute('title', tip)
      expect(((await b.textContent()) ?? '').replace(/[\s\d]/g, '').length).toBeLessThanOrEqual(1)
    }
  })
})

test.describe('狭い一覧の列（FR-V12, FR-SC3）', () => {
  test('スクリーナーのタブ（左の列が狭い）でも、コードと銘柄名が読め、右の列から隠す', async ({ start }) => {
    const { page } = await start()
    await tab(page, 'screener')
    const head = screener(page).locator('thead th')
    await expect(head.nth(1)).toHaveText('コード')
    await expect(head.nth(2)).toHaveText('銘柄名')
    // 列を隠しても、選んでいる列の枠は見えている列に出る
    await expect(screener(page).locator('thead th.cur')).toHaveCount(1)
    const name = screener(page).locator('tbody tr:not(.spacer)').first().locator('td').nth(2)
    await expect(name).not.toBeEmpty()
    expect((await name.boundingBox())!.width).toBeGreaterThanOrEqual(96)
    // 右の列（既定の最後の「1年」）は隠れている。列を見せない分、全体の幅に収まる
    await expect(head.filter({ hasText: '1年' })).toHaveCount(0)
    const table = (await screener(page).locator('table.grid').boundingBox())!
    const pane = (await screener(page).boundingBox())!
    expect(table.width).toBeLessThanOrEqual(pane.width)
  })
})

test.describe('列挙の条件・条件の行と結果の行（FR-SC1, FR-SC10, FR-SC4）', () => {
  test('権利確定月は月の名前で出し、Enter で月を足しても — にならず、← → でも壊れない', async ({ start }) => {
    const { page } = await start()
    const scr = await openScreener(page)
    await addField(page, '権利確定月')
    const cond = scr.locator('.cond.focus')
    await expect(cond.locator('.v')).toHaveText(/^\d+月$/)
    // Enter で選択肢を開き、もう 1 つの月を足す
    await keys(page, 'Enter')
    const dlg = page.locator('.dialog').last()
    await expect(dlg.locator('.it').first()).toBeVisible()
    await keys(page, 'ArrowDown', 'ArrowDown', 'ArrowDown', 'Enter')
    await expect(cond.locator('.v')).toHaveText(/^\d+月, \d+月$/)
    // → で 1 つずつ巡る（数にならない・条件が無効にならない）
    await keys(page, 'ArrowRight')
    await expect(cond.locator('.v')).toHaveText(/^\d+月$/)
    await expect(scr.locator('.cond.invalid')).toHaveCount(0)
    await expect(page.locator('.toasts')).not.toContainText(/エラー|error/i)
  })

  test('ウォッチリストの条件は Enter でリストを選ぶ', async ({ start }) => {
    const { page } = await start()
    await openScreener(page)
    await addField(page, 'ウォッチリスト')
    await keys(page, 'Enter')
    const dlg = page.locator('.dialog').last()
    await expect(dlg.locator('.it').filter({ hasText: 'お気に入り' })).toBeVisible()
    await keys(page, 'Escape')
  })

  test('条件をすべて消しても、Tab で結果の行に残り ↓ で動ける。結果が減ったら選んでいる行は残る', async ({ start }) => {
    const { page } = await start()
    const scr = await openScreener(page)
    // 最後の行を選ぶ → 条件で結果を減らしても、選んでいる行が消えない
    await keys(page, 'End')
    await expect(scr.locator('tbody tr.sel')).toHaveCount(1)
    await keys(page, 'Tab')
    await expect(scr.locator('.cond.focus')).toHaveCount(1)
    // 利回りの下限を上げて、結果が減るが 0 件にはならない値を Core に聞いて選ぶ（0 件だと選べる行が無い。値はスタブの架空のデータで決まる）
    const u = await rpc<{ screens: { id: string; conditions: { field: string; value: unknown }[] }[] }>(page, 'user.load')
    const conds = u.screens.find((s) => s.id === 'high-yield')!.conditions
    expect(conds[0]!.field).toBe('income.yield')
    const count = async (v: number) =>
      (
        await rpc<{ ids: string[] }>(page, 'screener.run', {
          conditions: [{ ...conds[0], value: v }, ...conds.slice(1)],
          favorites: [],
          watchlists: {},
        })
      ).ids.length
    const n0 = await count(conds[0]!.value as number)
    let v = 0
    let n = 0
    for (let x = 4; x <= 10 && !v; x += 0.5) {
      n = await count(x)
      if (n > 0 && n < n0) v = x
    }
    expect(v).toBeGreaterThan(0)
    await typeValue(page, String(v))
    // 絞り込んだ結果が描かれてから確かめる（打った直後は前の結果のままのため）
    await expect(scr.locator('.num').filter({ hasText: '件' }).first()).toContainText(`${n} /`)
    await expect(scr.locator('tbody tr.sel')).toHaveCount(1)
    await expect(scr.locator('tbody tr:not(.spacer)').nth(n - 1)).toHaveClass(/sel/)
    // 条件をすべて消す
    for (let i = 0; i < 10 && (await scr.locator('.cond').count()) > 0; i++) await keys(page, 'Delete')
    await expect(scr.locator('.cond')).toHaveCount(0)
    // 条件なし（全銘柄）の結果が届いてから動く（途中の結果のうちにキーを押すと、届いた結果で選んでいる銘柄の行に移るため）
    const all = await rpc<{ ids: string[] }>(page, 'screener.run', { conditions: [], favorites: [], watchlists: {} })
    await expect(scr.locator('.num').filter({ hasText: '件' }).first()).toContainText(`${all.ids.length} /`)
    await keys(page, 'Tab', 'Home', 'ArrowDown')
    await expect(scr.locator('tbody tr:not(.spacer)').nth(1)).toHaveClass(/sel/)
  })

  test('条件を直しても、選んでいる行は先頭に戻らない（リンク色なしで、リンクから選び直さないとき。FR-SC3）', async ({ start }) => {
    const { page } = await start({ layout: freeTab(pane('screener', { screenId: 'high-yield' }, 0)) })
    const scr = screener(page)
    await expect(scr).toHaveClass(/focused/)
    await expect(scr.locator('tbody tr').first()).toBeVisible()
    await keys(page, 'Home', 'ArrowDown', 'ArrowDown')
    const sel = scr.locator('tbody tr.sel')
    const code = ((await sel.locator('td').nth(1).textContent()) ?? '').trim()
    expect(code).toMatch(/^\d{4}/)
    // 利回りの下限を ← で下げる（結果は増えるだけで、選んでいる銘柄は残る）
    await keys(page, 'Tab')
    const cond = scr.locator('.cond.focus')
    await expect(cond).toContainText('実績利回り')
    const v0 = (await cond.locator('.v').textContent()) ?? ''
    await keys(page, 'ArrowLeft')
    await expect(cond.locator('.v')).not.toHaveText(v0)
    const conds = await rpc<{ screens: { id: string; conditions: { value: unknown }[] }[] }>(page, 'user.load')
    const base = conds.screens.find((s) => s.id === 'high-yield')!.conditions
    const v1 = Number.parseFloat((await cond.locator('.v').textContent()) ?? '')
    const n = (
      await rpc<{ ids: string[] }>(page, 'screener.run', {
        conditions: [{ ...base[0], value: v1 }, ...base.slice(1)],
        favorites: [],
        watchlists: {},
      })
    ).ids.length
    await expect(scr.locator('.num').filter({ hasText: '件' }).first()).toContainText(`${n} /`)
    await expect(sel).toHaveCount(1)
    await expect(sel.locator('td').nth(1)).toHaveText(code)
  })

  test('結果の並びが変わっても、選んでいる銘柄から動かない（位置で覚えない。FR-SC3）', async ({ start }) => {
    const { page } = await start()
    const scr = await openScreener(page)
    await keys(page, 'Home', 'ArrowDown')
    const sel = scr.locator('tbody tr.sel')
    const code = ((await sel.locator('td').nth(1).textContent()) ?? '').trim()
    expect(code).toMatch(/^\d{4}/)
    // 条件をすべて消すと、全銘柄に増えて並びが変わる
    await keys(page, 'Tab')
    for (let i = 0; i < 10 && (await scr.locator('.cond').count()) > 0; i++) await keys(page, 'Delete')
    await expect(scr.locator('.cond')).toHaveCount(0)
    const all = await rpc<{ ids: string[] }>(page, 'screener.run', { conditions: [], favorites: [], watchlists: {} })
    await expect(scr.locator('.num').filter({ hasText: '件' }).first()).toContainText(`${all.ids.length} /`)
    await expect(sel).toHaveCount(1)
    await expect(sel.locator('td').nth(1)).toHaveText(code)
    await expect(scr.locator('tbody tr:not(.spacer)').nth(1)).not.toHaveClass(/sel/)
  })

  test('開いているスクリーンを一覧で消すと、残った最初のスクリーンを開く（「名前なし・変更あり」にならない）', async ({ start }) => {
    const { page } = await start()
    const scr = await openScreener(page)
    const name = (await scr.locator('.ph').first().textContent()) ?? ''
    await keys(page, 'Control+o')
    const list = page.locator('.dialog')
    await expect(list.locator('.sel')).toHaveCount(1)
    await expect(list.locator('.sel')).toContainText('高配当')
    await keys(page, 'Delete', 'Delete')
    await expect(list).not.toContainText('高配当銘柄')
    await keys(page, 'Escape')
    await expect(list).toBeHidden()
    await expect(scr.locator('.ph').first()).not.toContainText('名前なし')
    await expect(scr.locator('.ph').first()).not.toContainText('変更あり')
    expect(name).toContain('高配当')
  })

  test('既定の条件を戻す（FR-SC15）: すべてあれば案内を出さない。消すと件数つきで出て、Ctrl+Shift+R で戻すと消える', async ({ start }) => {
    const { page } = await start()
    await openScreener(page)
    await keys(page, 'Control+o')
    const list = page.locator('.dialog')
    const hint = list.locator('.lx-foot .restore')
    await expect(list.locator('.sel')).toHaveCount(1)
    await expect(list.locator('.lx-foot')).toContainText('Delete 削除')
    await expect(hint).toHaveCount(0)
    await keys(page, 'Control+Shift+r') // 戻すものが無ければ何もしない（「0 件」を出さない）
    await expect(page.locator('.toast')).toHaveCount(0)
    await keys(page, 'Delete', 'Delete')
    await expect(list).not.toContainText('高配当銘柄')
    await expect(hint).toHaveText('Ctrl+Shift+R 既定の条件を戻す（1 件）')
    await keys(page, 'Control+Shift+r')
    await expect(list).toContainText('高配当銘柄')
    await expect(hint).toHaveCount(0)
    await expect(page.locator('.toast')).toContainText('既定のスクリーニング条件を 1 件戻しました')
  })

  // 回帰（2026-11-17）: 製品版は再読み込みを止めるために Ctrl+R・Ctrl+Shift+R を main で握りつぶしていて、画面に届かなかった。
  // Playwright の打鍵は main の before-input-event を通らないので、実際のキー入力と同じ経路（sendInputEvent）で打つ
  test('製品版の扱いでも Ctrl+Shift+R が一覧に届き、Ctrl+R で再読み込みはしない（FR-SC15, NFR-S3）', async ({ start }) => {
    const { app, page } = await start({ env: { ELECXSTOCK_DEVTOOLS: '0' } })
    const native = (keyCode: string, modifiers: string[]) =>
      app.evaluate(
        ({ BrowserWindow }, a) => {
          const wc = BrowserWindow.getAllWindows()[0]!.webContents
          wc.sendInputEvent({ type: 'keyDown', keyCode: a.keyCode, modifiers: a.modifiers as never })
          wc.sendInputEvent({ type: 'keyUp', keyCode: a.keyCode, modifiers: a.modifiers as never })
        },
        { keyCode, modifiers },
      )
    await openScreener(page)
    await page.evaluate(() => {
      ;(window as unknown as { __kept: number }).__kept = 1
    })
    await keys(page, 'Control+o')
    const list = page.locator('.dialog')
    await expect(list.locator('.sel')).toHaveCount(1)
    await keys(page, 'Delete', 'Delete')
    await expect(list).not.toContainText('高配当銘柄')
    await native('R', ['control', 'shift'])
    await expect(list).toContainText('高配当銘柄')
    await keys(page, 'Escape')
    await expect(list).toBeHidden()
    await native('R', ['control'])
    await native('R', ['control', 'shift'])
    await expect(page.locator('[data-widget="screener"]')).toBeVisible()
    expect(await page.evaluate(() => (window as unknown as { __kept?: number }).__kept)).toBe(1)
  })
})

// 回帰（2026-11-16 のレビューで見つけた同じ作り）: 表示倍率を変えると、項目の説明が ⓘ から離れた位置に出ていた
test.describe('表示倍率と説明の位置（FR-V10・FR-SC1）', () => {
  test('表示倍率 150% でも、条件を選ぶダイアログの ⓘ の説明は ⓘ の右に出て、窓からはみ出さない', async ({ start }) => {
    const { page } = await start({ settings: { uiScale: 1.5 } })
    await openScreener(page)
    await keys(page, 'Insert')
    const fp = page.locator('.dialog.picker')
    await expect(fp).toBeVisible()
    const info = fp.locator('.it.sel .info')
    await info.hover()
    const tip = fp.locator('.tip')
    await expect(tip).toBeVisible()
    const ib = (await info.boundingBox())!
    const tb = (await tip.boundingBox())!
    const vw = await page.evaluate(() => window.innerWidth)
    expect(tb.x + tb.width).toBeLessThanOrEqual(vw + 1)
    expect(Math.abs(tb.y - ib.y)).toBeLessThan(20)
    expect(tb.x).toBeGreaterThan(ib.x)
    await page.mouse.move(0, 0)
  })
})
