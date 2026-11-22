// 探して選ぶダイアログ（docs/design-dialogs.md）: ペインの種類・ショートカット一覧・コマンドバー・設定をキーボードだけで操作する。
// 絞り込み・格子の移動・文言の組み立ては単体テスト（tests/unit/renderer/widget-picker.test.ts など）で、ここでは画面の流れを見る
import type { Page } from '@playwright/test'
import { expect, focused, keys, motionDone, tab, test, type } from './support'

const panes = (page: Page) => page.locator('.main [data-pane-id]')

test.describe('ペインの種類を選ぶ（§6.5, FR-KB10, FR-L11）', () => {
  test('Ctrl+Shift+N: 今の種類から始まり、打って絞り込み、Enter で変える。Esc は語を消してから閉じる', async ({ start }) => {
    const { page } = await start()
    await tab(page, 'mtf')
    const f = focused(page)
    const was = await f.getAttribute('data-widget')
    await keys(page, 'Control+Shift+KeyN')
    const dlg = page.getByRole('dialog', { name: 'ペインの種類を変える' })
    await expect(dlg).toBeVisible()
    // 選択は今の種類のカードから。「いま」の札
    await expect(dlg.locator('.card.sel')).toHaveAttribute('data-widget', was!)
    await expect(dlg.locator('.card.sel')).toContainText('いま')
    // 別名でも当たる（株価ボード → ヒートマップ）
    await type(page, '株価ボード')
    await expect(dlg.locator('.card')).toHaveCount(1)
    await expect(dlg.locator('.card.sel')).toHaveAttribute('data-widget', 'heatmap')
    // 変えると何が起きるかを下の段に
    await expect(dlg.locator('.lx-desc')).toContainText('初期に戻ります')
    // Esc は語を消すだけ（閉じない）
    await keys(page, 'Escape')
    await expect(dlg).toBeVisible()
    await expect(dlg.locator('.card')).toHaveCount(18)
    // 打っている間の ↓ は読む順に 1 枚ずつ（同じ行の 2 枚目へ）
    await type(page, 'マーケット')
    await expect(dlg.locator('.card')).toHaveCount(2)
    await expect(dlg.locator('.card.sel')).toHaveAttribute('data-widget', 'market')
    await keys(page, 'ArrowDown')
    await expect(dlg.locator('.card.sel')).toHaveAttribute('data-widget', 'board')
    await keys(page, 'Enter')
    await expect(dlg).toHaveCount(0)
    await expect(focused(page)).toHaveAttribute('data-widget', 'board')
  })

  test('右に分割: 種類を続けて選んで足す。Esc でやめると分割しない', async ({ start }) => {
    const { page } = await start()
    await tab(page, 'mtf')
    const n = await panes(page).count()
    await keys(page, 'Control+Shift+KeyE')
    const dlg = page.getByRole('dialog', { name: '右に分割: 新しいペインの種類' })
    await expect(dlg).toBeVisible()
    // 分割では「いま」の札は無い
    await expect(dlg.locator('.card .cur')).toHaveCount(0)
    await keys(page, 'Escape')
    await expect(dlg).toHaveCount(0)
    await expect(panes(page)).toHaveCount(n)
    await keys(page, 'Control+Shift+KeyE')
    await expect(dlg).toBeVisible()
    await type(page, 'はいとう')
    await expect(dlg.locator('.card.sel')).toHaveAttribute('data-widget', 'divcal')
    await keys(page, 'Enter')
    await expect(panes(page)).toHaveCount(n + 1)
    await expect(focused(page)).toHaveAttribute('data-widget', 'divcal')
    await motionDone(page)
  })
})

test.describe('ショートカット一覧（FR-KB7）', () => {
  test('フォーカス中のペインの段が先頭。文字で絞り込み、Tab でキーを押して探す。Esc は段ずつ戻る', async ({ start }) => {
    const { page } = await start()
    await tab(page, 'mtf')
    // 日足のチャートへ
    await keys(page, 'Alt+ArrowRight', 'Alt+ArrowUp')
    await expect(focused(page)).toHaveAttribute('data-widget', 'chart')
    await keys(page, 'F1')
    const help = page.getByRole('dialog', { name: 'ショートカット' })
    await expect(help).toBeVisible()
    // いまのペイン（チャート）の段が先頭
    await expect(help.locator('.sec').first()).toContainText('チャート')
    await expect(help.locator('.sec').first()).toContainText('いまのペイン')
    await expect(help.locator('.row.sel')).toContainText('日足')
    // 文字で: 当たった文字を強調。行から実行はしない（Enter で閉じない）
    await type(page, '対数')
    await expect(help.locator('.row').first()).toContainText('対数軸')
    await expect(help.locator('.row mark').first()).toHaveText('対数')
    await keys(page, 'Enter')
    await expect(help).toBeVisible()
    // Tab でキーを押して探す: Alt+3 は「表示期間」などに当たる（範囲 Alt+1–6）。当たったキーだけ印
    await keys(page, 'Tab')
    await expect(help.locator('.lx-chip.on')).toHaveText('キーで探す')
    await keys(page, 'Alt+Digit3')
    await expect(help.locator('.row').first()).toContainText('表示期間')
    await expect(help.locator('.row').first().locator('kbd.hit')).toHaveCount(2)
    // アプリ全体のキーも探せる（押しても実行されない）
    await keys(page, 'Control+Shift+KeyN')
    await expect(help.locator('.row').first()).toContainText('ペインの種類を変える')
    await expect(page.locator('.dialog.wpick')).toHaveCount(0)
    // Esc: 押したキーを消す → 文字で探すへ → 打った語を消す → 閉じる
    await keys(page, 'Escape')
    await expect(help.locator('.lx-search .ph')).toBeVisible()
    await keys(page, 'Escape')
    await expect(help.locator('.lx-chip.on')).toHaveText('文字で探す')
    await expect(help.locator('input')).toHaveValue('対数')
    await keys(page, 'Escape')
    await expect(help.locator('input')).toHaveValue('')
    await keys(page, 'Escape')
    await expect(help).toHaveCount(0)
  })
})

test.describe('コマンドバー（FR-KB1, FR-KB9）', () => {
  test('語を分けて探す・使えないアクションは理由を出す・ペインの種類とペインの中のキーも候補・最近使ったものを先に', async ({ start }) => {
    const { page } = await start()
    await tab(page, 'mtf')
    await keys(page, 'Alt+ArrowRight', 'Alt+ArrowUp')
    await expect(focused(page)).toHaveAttribute('data-widget', 'chart')
    const pal = page.locator('.dialog.palette')
    await keys(page, 'Control+k')
    await expect(pal).toBeVisible()
    // 空のとき: このペインの操作（チャート）
    await expect(pal.locator('.lx-grp').first()).toContainText('このペインの操作')
    // 語を分けても当たる
    await type(page, '保有 書き出')
    await expect(pal.locator('.it.sel')).toContainText('保有の記録を JSON に書き出す')
    // 一覧のペインが要るアクションはチャートでは使えない: 理由を出し、Enter でも閉じない
    await keys(page, 'Control+a')
    await type(page, '列の選択')
    await expect(pal.locator('.it.sel')).toHaveClass(/off/)
    await expect(pal.locator('.lx-desc')).toContainText('今は使えません')
    await keys(page, 'Enter')
    await expect(pal).toBeVisible()
    // Esc は語を消すだけ
    await keys(page, 'Escape')
    await expect(pal.locator('input')).toHaveValue('')
    await expect(pal).toBeVisible()
    // ペインの中のキー: Enter で F1 をその語で開く
    await type(page, '対数軸')
    const keyRow = pal.locator('.it', { hasText: '対数軸' }).last()
    await expect(keyRow).toBeVisible()
    for (let i = 0; i < 10 && !(await keyRow.evaluate((e) => e.classList.contains('sel'))); i++) await keys(page, 'ArrowDown')
    await keys(page, 'Enter')
    const help = page.getByRole('dialog', { name: 'ショートカット' })
    await expect(help).toBeVisible()
    await expect(help.locator('input')).toHaveValue('対数軸')
    await keys(page, 'Escape', 'Escape')
    await expect(help).toHaveCount(0)
    // @ でペインの種類: このペインをヒートマップにする
    await keys(page, 'Control+k')
    await type(page, '@ひーと')
    await expect(pal.locator('.lx-chip.on')).toHaveText('ペイン')
    await expect(pal.locator('.it.sel')).toContainText('ヒートマップ')
    await keys(page, 'Enter')
    await expect(pal).toHaveCount(0)
    await expect(focused(page)).toHaveAttribute('data-widget', 'heatmap')
    // 実行したアクションは「最近使ったアクション」に出る
    await keys(page, 'Control+k')
    await type(page, '>サイズを元に戻す')
    await expect(pal.locator('.it.sel')).toContainText('サイズを元に戻す')
    await keys(page, 'Enter')
    await expect(pal).toHaveCount(0)
    await keys(page, 'Control+k')
    await expect(pal.locator('[role="group"]', { hasText: '最近使ったアクション' })).toContainText('サイズを元に戻す')
    // Tab で範囲を送る
    await keys(page, 'Tab')
    await expect(pal.locator('.lx-chip.on')).toContainText('銘柄')
  })
})

test.describe('設定（FR-KB11, FR-KB6, FR-V10）', () => {
  test('探して行へ・スイッチを切り替えて既定に戻す・表示倍率は仮の値を Enter で決める・キーの重なりを行の中で知らせる', async ({
    start,
  }) => {
    const { page } = await start()
    const user = async () =>
      (
        await page.evaluate(() =>
          (
            window as unknown as { elecxstock: { call: (m: string, p: unknown) => Promise<{ settings: Record<string, unknown> }> } }
          ).elecxstock.call('user.load', {}),
        )
      ).settings
    await keys(page, 'Control+Comma')
    const dlg = page.getByRole('dialog', { name: '設定' })
    await expect(dlg).toBeVisible()
    // 探す（Ctrl+F）: 全タブから。↓ で行へ
    await keys(page, 'Control+KeyF')
    await type(page, '自動で更新')
    await expect(dlg.locator('.shead')).toContainText('「自動で更新」の設定')
    await keys(page, 'ArrowDown')
    const sw = dlg.getByRole('switch', { name: '自動で更新する' })
    await expect(sw).toBeFocused()
    await expect(sw).toHaveAttribute('aria-checked', 'true')
    await keys(page, 'Space')
    await expect(sw).toHaveAttribute('aria-checked', 'false')
    // 既定から変えた印と「既定: オン」。Backspace で既定に戻す
    await expect(dlg.locator('[data-row="autoUpdate"]')).toContainText('既定: オン')
    await keys(page, 'Backspace')
    await expect(sw).toHaveAttribute('aria-checked', 'true')
    await expect.poll(async () => (await user()).autoUpdate).toBe(true)
    // Esc: 探すのをやめる → 閉じる
    await keys(page, 'Escape', 'Escape')
    await expect(dlg).toHaveCount(0)

    // 表示倍率: ← → は仮の値（見本だけ）。Enter で決める
    await keys(page, 'Control+Comma', 'ArrowDown')
    await expect(dlg.getByRole('tab', { name: '表示' })).toHaveAttribute('aria-selected', 'true')
    await keys(page, 'ArrowRight', 'ArrowDown')
    await expect(dlg.locator('[data-row="scale"] .v')).toBeFocused()
    await keys(page, 'ArrowRight', 'ArrowRight')
    await expect(dlg.locator('[data-row="scale"]')).toContainText('125% にする')
    expect((await user()).uiScale).toBe(1)
    await keys(page, 'Enter')
    await expect.poll(async () => (await user()).uiScale).toBe(1.25)
    await keys(page, 'Backspace')
    await expect.poll(async () => (await user()).uiScale).toBe(1)

    // キー: 重なるキーは行の中で知らせ、Esc でやめる。重ならないキーは割り当て、Backspace で既定に戻す
    await keys(page, 'Escape', 'ArrowDown', 'ArrowDown', 'ArrowDown')
    await expect(dlg.getByRole('tab', { name: 'キー' })).toHaveAttribute('aria-selected', 'true')
    await keys(page, 'ArrowRight')
    await expect(dlg.getByRole('textbox', { name: '操作・キーで探す' })).toBeFocused()
    await type(page, '最大化')
    await keys(page, 'ArrowDown', 'Enter')
    await expect(dlg.locator('.krow.sel')).toContainText('キーを押す')
    await keys(page, 'Control+Shift+KeyW')
    await expect(dlg.locator('.krow.sel .cf')).toContainText('ペインを閉じる')
    await keys(page, 'Escape')
    await expect(dlg.locator('.cf')).toHaveCount(0)
    await keys(page, 'Enter', 'Control+Alt+KeyM')
    await expect.poll(async () => (await user()).keymap).toEqual({ max: 'Ctrl+Alt+M' })
    await expect(dlg.locator('.krow.sel')).toContainText('既定: Ctrl+Shift+Enter')
    await keys(page, 'Backspace')
    await expect.poll(async () => (await user()).keymap).toEqual({})
  })
})

// レビューの指摘（2026-11-21）の再現: どれも直す前は落ちた
test.describe('設定のキー操作の回帰（FR-KB11, FR-KB2）', () => {
  test('使えない行・操作の無い行も ↓ で越える。← → で行の中の部品を巡り、先頭の ← でタブへ', async ({ start }) => {
    const { page } = await start()
    await keys(page, 'Control+Comma')
    const dlg = page.getByRole('dialog', { name: '設定' })
    await expect(dlg.getByRole('tab', { name: '一般' })).toBeFocused()
    // 一般: 開発版ではサインイン時の起動が使えず、その下の「起動したら通知領域」も使えない。それでも最後の行まで行ける
    await keys(page, 'ArrowRight', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown')
    const last = dlg.locator('[data-row="checkUpdates"]')
    await expect(last.getByRole('switch')).toBeFocused()
    await keys(page, 'ArrowRight')
    await expect(last.getByRole('button', { name: '新しいバージョンを確かめる' })).toBeFocused()
    await keys(page, 'ArrowLeft', 'ArrowLeft')
    await expect(dlg.getByRole('tab', { name: '一般' })).toBeFocused()
    // チャート: 目標利回りの線がオフ（既定）でも、目標の行を越えて画像の保存へ
    await keys(page, 'ArrowDown', 'ArrowDown', 'ArrowRight', 'ArrowDown', 'ArrowDown')
    await expect(dlg.getByRole('switch', { name: 'チャートの画像の保存' })).toBeFocused()
    // このアプリについて: → で本文に入れる（最初の行のボタン）
    await keys(page, 'Escape', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowRight')
    await expect(dlg.getByRole('tab', { name: 'このアプリについて' })).toHaveAttribute('aria-selected', 'true')
    await expect(dlg.locator('[data-row="app"]').getByRole('button', { name: '新しいバージョンを確かめる' })).toBeFocused()
  })

  test('探した結果は同じタブの枠が 1 つだけ。割り当てを記録している間の Ctrl+F は、探す欄ではなく割り当てに回る', async ({ start }) => {
    const { page } = await start()
    await keys(page, 'Control+Comma')
    const dlg = page.getByRole('dialog', { name: '設定' })
    await keys(page, 'Control+KeyF')
    await type(page, 'データ')
    const heads = await dlg.locator('.card2 > h4').allInnerTexts()
    expect(heads.length).toBeGreaterThan(1)
    expect(new Set(heads).size).toBe(heads.length)
    await keys(page, 'Escape', 'Escape')
    await expect(dlg).toHaveCount(0)
    await keys(page, 'Control+Comma', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown')
    await expect(dlg.getByRole('tab', { name: 'キー' })).toHaveAttribute('aria-selected', 'true')
    await keys(page, 'ArrowRight')
    await type(page, '最大化')
    await keys(page, 'ArrowDown', 'Enter', 'Control+KeyF')
    await expect
      .poll(
        async () =>
          (
            await page.evaluate(() =>
              (
                window as unknown as {
                  elecxstock: { call: (m: string, p: unknown) => Promise<{ settings: { keymap: Record<string, string> } }> }
                }
              ).elecxstock.call('user.load', {}),
            )
          ).settings.keymap,
      )
      .toEqual({ max: 'Ctrl+F' })
    await expect(dlg.getByRole('textbox', { name: '設定を探す' })).not.toBeFocused()
  })
})

test.describe('ペインの種類の回帰（FR-KB10）', () => {
  test('当たらない語でも Esc で語を消す（閉じない）', async ({ start }) => {
    const { page } = await start()
    await keys(page, 'Control+Shift+KeyN')
    const dlg = page.locator('.dialog.wpick')
    await type(page, 'zzzz')
    await expect(dlg.locator('.card')).toHaveCount(0)
    await keys(page, 'Escape')
    await expect(dlg.locator('input')).toHaveValue('')
    await expect(dlg.locator('.card')).toHaveCount(18)
  })
})

// 設計・モックとの突き合わせ（2026-11-21）の再現
test.describe('設計との突き合わせの回帰（FR-KB7, FR-KB9, FR-KB11）', () => {
  test('F1 のキーで探す: 読み上げの文は画面に出さず、選んだ行を combobox が指す', async ({ start }) => {
    const { page } = await start()
    await keys(page, 'F1')
    const help = page.getByRole('dialog', { name: 'ショートカット' })
    await keys(page, 'Tab')
    const field = help.getByRole('combobox', { name: 'キーで探す' })
    await expect(field).toBeFocused()
    // 読み上げだけの文（.lx-sr: 1px に切り抜く）。以前は定義の無い .sr で、フッターの下に出ていた
    const live = help.getByText('キーを押して探しています', { exact: false })
    await expect(live).toHaveClass(/lx-sr/)
    expect((await live.boundingBox())?.width ?? 0).toBeLessThanOrEqual(1)
    await keys(page, 'Control+KeyK')
    await expect(field).toHaveAttribute('aria-activedescendant', /^help-\d+$/)
    await expect(help.locator('.row.sel')).toContainText('コマンドバー')
  })

  test('コマンドバーのペインの候補は、変えると何が起きるかを出す。範囲が銘柄で空なら打つものを案内する', async ({ start }) => {
    const { page } = await start()
    await tab(page, 'mtf')
    await keys(page, 'Alt+ArrowRight', 'Alt+ArrowUp')
    const pal = page.locator('.dialog.palette')
    await keys(page, 'Control+k')
    await type(page, '@銘柄情報')
    await expect(pal.locator('.it.sel')).toContainText('銘柄情報')
    await expect(pal.locator('.lx-desc')).toContainText('初期に戻ります')
    await keys(page, 'Control+a', 'Backspace')
    // 範囲のチップを「銘柄」へ（Tab で次の範囲）
    await keys(page, 'Tab')
    await expect(pal.locator('.lx-chip.on')).toHaveText('銘柄')
    await expect(pal.locator('.lx-empty')).toContainText('コード・銘柄名')
  })

  test('設定: タブにいる間の案内・キーのタブの探す欄の Esc は語を消す', async ({ start }) => {
    const { page } = await start()
    await keys(page, 'Control+Comma')
    const dlg = page.getByRole('dialog', { name: '設定' })
    await expect(dlg.locator('.sfoot')).toContainText('本文に移る')
    await keys(page, 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowRight')
    await expect(dlg.locator('.sfoot')).not.toContainText('本文に移る')
    const box = dlg.getByRole('textbox', { name: '操作・キーで探す' })
    await expect(box).toBeFocused()
    // 分類の名前でも当たる
    await type(page, 'アプリ')
    await expect(dlg.locator('.krow').first()).toBeVisible()
    await keys(page, 'Escape')
    await expect(box).toHaveValue('')
    await expect(box).toBeFocused()
    await keys(page, 'Escape')
    await expect(dlg.getByRole('tab', { name: 'キー' })).toBeFocused()
  })
})

// 利用者の指摘（2026-11-21）の再現: どれも直す前は落ちた
test.describe('設定の見た目の回帰（FR-KB11, FR-NW2）', () => {
  /** 文字が何行に折れているか */
  const lines = (els: import('@playwright/test').Locator) =>
    els.evaluateAll((xs) =>
      xs.map((x) => {
        const r = document.createRange()
        r.selectNodeContents(x)
        return new Set([...r.getClientRects()].map((b) => Math.round(b.top))).size
      }),
    )
  test('データの状態は見出しを折り返さず値も切らない・ニュースのフィードは 1 行に収まる・このアプリについてはアイコンと個人利用の注意', async ({
    start,
  }) => {
    const { page } = await start()
    await keys(page, 'Control+Comma')
    const dlg = page.getByRole('dialog', { name: '設定' })
    await keys(page, 'ArrowDown', 'ArrowDown', 'ArrowDown')
    await expect(dlg.getByRole('tab', { name: 'データ' })).toHaveAttribute('aria-selected', 'true')
    const cells = dlg.locator('.stats > div')
    await expect(cells).toHaveCount(4)
    expect(await lines(dlg.locator('.stats .k'))).toEqual([1, 1, 1, 1])
    expect(await dlg.locator('.stats b').evaluateAll((bs) => bs.filter((b) => b.scrollWidth > b.clientWidth).length)).toBe(0)

    // ニュース: スイッチ（オン／オフの文字とつまみ）・配信元・名前・分類・状態が 1 行の中
    await keys(page, 'ArrowDown', 'ArrowDown')
    await expect(dlg.getByRole('tab', { name: 'ニュース' })).toHaveAttribute('aria-selected', 'true')
    const rows = dlg.locator('.frow')
    await expect(rows.first()).toBeVisible()
    const out = await rows.evaluateAll((rs) =>
      rs.flatMap((r) => {
        const b = r.getBoundingClientRect()
        return [...r.querySelectorAll('.swl, .sw, .src, .nm, .gp, .st')]
          .map((c) => c.getBoundingClientRect())
          .filter((c) => c.height && (c.top < b.top - 1 || c.bottom > b.bottom + 1))
          .map(() => r.textContent)
      }),
    )
    expect(out).toEqual([])
    // オン／オフの文字はつまみの左（同じ列の中）
    const [l, s] = await Promise.all([rows.first().locator('.swl').boundingBox(), rows.first().locator('.sw').boundingBox()])
    expect(l!.x + l!.width).toBeLessThanOrEqual(s!.x + 1)

    // このアプリについて: アプリのアイコン（画像）と、個人の利用に限る注意
    await keys(page, 'ArrowDown')
    await expect(dlg.getByRole('tab', { name: 'このアプリについて' })).toHaveAttribute('aria-selected', 'true')
    const logo = dlg.locator('.appcard img.logo')
    await expect(logo).toBeVisible()
    expect(await logo.evaluate((i) => (i as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
    await expect(dlg.locator('[data-row="usage"]')).toContainText('個人の利用')
  })
})

test.describe('選ぶダイアログ（FR-KB2, FR-L14）', () => {
  test('新しいページの初めの形: 共通の骨格・形の図・下の段のキー。↓ Enter で決め、Esc でメニューに戻る', async ({ start }) => {
    const { page } = await start()
    await tab(page, 'free')
    await keys(page, 'Control+Shift+Digit8', 'Insert')
    const dlg = page.getByRole('dialog', { name: '新しいページの初めの形' })
    await expect(dlg).toBeVisible()
    await expect(dlg).toHaveClass(/\blx\b/)
    const opts = dlg.getByRole('option')
    await expect(opts).toHaveCount(6)
    await expect(dlg.locator('svg.lx-fig')).toHaveCount(6)
    await expect(opts.first()).toHaveAttribute('aria-selected', 'true')
    // 説明は切らずに名前の下に
    await expect(opts.nth(3)).toContainText('格子・期間・並べ替えは今のグリッドと同じ')
    expect(
      await opts
        .nth(3)
        .locator('.s')
        .evaluate((s) => s.scrollWidth <= s.clientWidth),
    ).toBe(true)
    await expect(dlg.locator('.lx-foot')).toContainText('Enter')
    await keys(page, 'ArrowDown')
    await expect(opts.nth(1)).toHaveAttribute('aria-selected', 'true')
    await keys(page, 'Escape')
    await expect(dlg).toHaveCount(0)
    await expect(page.locator('.page-menu[role="menu"]')).toBeVisible()
  })
})

test.describe('スクリーニング条件の一覧（FR-SC12, FR-KB2）', () => {
  test('Ctrl+O: 共通の骨格。選んだ条件の中身を下の段に出し、指標の名前でも探せる。Esc は語を消してから閉じる', async ({ start }) => {
    const { page } = await start()
    await tab(page, 'screener')
    await keys(page, 'Control+o')
    const dlg = page.getByRole('dialog', { name: '保存したスクリーニング条件' })
    await expect(dlg).toHaveClass(/\blx\b/)
    const sel = dlg.getByRole('option', { selected: true })
    await expect(sel).toHaveCount(1)
    // 下の段: 選んだ条件の中身（かつ・または）
    await expect(dlg.locator('.lx-desc')).toContainText(/≥|≤|∈/)
    await keys(page, 'End')
    await expect(dlg.getByRole('option').last()).toHaveAttribute('aria-selected', 'true')
    await keys(page, 'Home')
    await expect(dlg.getByRole('option').first()).toHaveAttribute('aria-selected', 'true')
    const n = await dlg.getByRole('option').count()
    await type(page, '利回り')
    await expect.poll(() => dlg.getByRole('option').count()).toBeLessThan(n)
    await expect(dlg.locator('.lx-desc')).toContainText('利回り')
    await keys(page, 'Escape')
    await expect(dlg).toBeVisible()
    await expect(dlg.getByRole('option')).toHaveCount(n)
    await expect(dlg.locator('.lx-foot')).toContainText('F2')
    await keys(page, 'Escape')
    await expect(dlg).toHaveCount(0)
  })
})

test.describe('条件を選ぶ（FR-SC17, FR-KB2）', () => {
  test('Insert: 共通の骨格。打った語を名前の中で強調し、下の段に説明、キーは kbd で出す', async ({ start }) => {
    const { page } = await start()
    await tab(page, 'screener')
    await keys(page, 'Insert')
    const fp = page.getByRole('dialog', { name: '条件を追加' })
    await expect(fp).toHaveClass(/\blx\b/)
    await type(page, '利回り')
    await expect(fp.getByRole('option', { selected: true }).locator('mark')).toHaveText('利回り')
    await expect(fp.locator('.lx-desc b')).toContainText('利回り')
    await expect(fp.locator('.lx-foot kbd', { hasText: 'Tab' })).toBeVisible()
    await keys(page, 'Escape', 'Escape')
    await expect(fp).toHaveCount(0)
  })
})

test.describe('マイレイアウトのページのメニュー（FR-L14, FR-KB2）', () => {
  test('操作の行は線のアイコンとキーの kbd。下の段にメニューのキー', async ({ start }) => {
    const { page } = await start()
    await tab(page, 'free')
    await keys(page, 'Control+Shift+Digit8')
    const menu = page.locator('.page-menu[role="menu"]')
    await expect(menu).toBeVisible()
    const acts = menu.getByRole('menuitem')
    await expect(acts.first().locator('svg.icon')).toBeVisible()
    await expect(menu.locator('kbd', { hasText: 'Insert' }).first()).toBeVisible()
    await expect(menu.locator('kbd', { hasText: 'F2' })).toBeVisible()
    await expect(menu).not.toContainText('🗑')
    // 名前の入力（F2）も下の段に kbd でキー
    await keys(page, 'F2')
    const pr = page.locator('.dialog.box')
    await expect(pr.locator('kbd', { hasText: 'Enter' })).toBeVisible()
    await keys(page, 'Escape')
    await expect(menu).toBeVisible()
    await expect(menu.locator('.lx-foot')).toContainText('Alt')
    await keys(page, 'Escape')
    await expect(menu).toHaveCount(0)
  })
})

test.describe('アラート・保有のキーの案内（FR-AL8, FR-H7, FR-KB2）', () => {
  test('アラートの一覧・アラートのフォーム・保有のフォームは、下の段のキーを kbd で出す', async ({ start }) => {
    const { page } = await start()
    await keys(page, 'Control+Alt+l')
    const pop = page.locator('.dialog.alerts')
    await expect(pop.locator('.lx-foot kbd', { hasText: 'Insert' })).toBeVisible()
    await keys(page, 'KeyH')
    await expect(pop.locator('.lx-foot kbd', { hasText: /^R$/ })).toBeVisible()
    await keys(page, 'KeyH')
    await keys(page, 'Insert')
    const form = page.locator('.dialog.alertform')
    await expect(form.locator('.dkeys kbd', { hasText: 'Enter' })).toBeVisible()
    await keys(page, 'Escape')
    await expect(form).toHaveCount(0)
    await keys(page, 'Escape')
    await expect(pop).toHaveCount(0)
    await tab(page, 'holdings')
    await keys(page, 'Insert')
    const hold = page.locator('.dialog.holding')
    await expect(hold.locator('.dkeys kbd', { hasText: 'Tab' })).toBeVisible()
    await keys(page, 'Escape')
    await expect(hold).toHaveCount(0)
  })
})

// Fable のレビュー（2026-11-21）の再現: どれも直す前は落ちた
test.describe('ダイアログのレビューの回帰（FR-KB1, FR-KB2, FR-KB10）', () => {
  test('コマンドバー: 取得の対象外の銘柄（グロース）も名前と市場で出す（コードを 2 度出さない）', async ({ start }) => {
    const { page } = await start()
    await keys(page, 'Control+KeyK')
    const pal = page.locator('.dialog.palette')
    await type(page, 'Veritas')
    const row = pal.getByRole('option').filter({ hasText: '130A' }).first()
    await expect(row.locator('.n')).toHaveText('Veritas In Silico')
    await expect(row.locator('.mk')).not.toBeEmpty()
    await expect(pal.locator('.lx-desc b')).toHaveText('130A Veritas In Silico')
  })
})

test.describe('一覧をクリックしても検索欄のフォーカスを失わない（FR-KB4, FR-KB10）', () => {
  test('コマンドバー・ペインの種類で、一覧の見出しや閉じない行をクリックしたあとも打てる', async ({ start }) => {
    const { page } = await start()
    await keys(page, 'Control+KeyK')
    const pal = page.locator('.dialog.palette')
    await pal.locator('.lx-grp').first().click()
    await type(page, 'abc')
    await expect(pal.locator('input')).toHaveValue('abc')
    await keys(page, 'Escape', 'Escape')
    await keys(page, 'Control+Shift+KeyN')
    const wp = page.locator('.dialog.wpick')
    await wp.locator('.lx-grp').first().click()
    await type(page, 'チャ')
    await expect(wp.locator('input')).toHaveValue('チャ')
    await keys(page, 'Escape', 'Escape')
  })
})

test.describe('Tab でダイアログの外へ出ない（FR-KB2, FR-KB10）', () => {
  test('選ぶダイアログ・ペインの種類・スクリーニング条件の一覧・ページのメニューで Tab を押しても、フォーカスはダイアログの中', async ({
    start,
  }) => {
    const { page } = await start()
    const inside = (sel: string) => page.evaluate((s) => !!document.activeElement?.closest(s), sel)
    await tab(page, 'free')
    await keys(page, 'Control+Shift+Digit8')
    await keys(page, 'Tab')
    expect(await inside('.page-menu')).toBe(true)
    await keys(page, 'Insert')
    const shape = page.getByRole('dialog', { name: '新しいページの初めの形' })
    await keys(page, 'Tab')
    expect(await inside('.dialog.pick')).toBe(true)
    // Tab は次の候補（↓ と同じ）
    await expect(shape.getByRole('option').nth(1)).toHaveAttribute('aria-selected', 'true')
    await keys(page, 'Escape', 'Escape')
    await keys(page, 'Control+Shift+KeyN', 'Tab')
    expect(await inside('.dialog.wpick')).toBe(true)
    await keys(page, 'Escape')
    await tab(page, 'screener')
    await keys(page, 'Control+o', 'Tab')
    expect(await inside('.dialog.scrlist')).toBe(true)
    await keys(page, 'Escape')
  })
})

test.describe('キーの割り当ての記録（FR-KB6）', () => {
  test('行をクリックして記録を始め、一覧の外をクリックしたら記録をやめる（キーを取ったままにしない）', async ({ start }) => {
    const { page } = await start()
    await keys(page, 'Control+Comma', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown')
    const dlg = page.getByRole('dialog', { name: '設定' })
    await expect(dlg.getByRole('tab', { name: 'キー' })).toHaveAttribute('aria-selected', 'true')
    await dlg.locator('.krow').first().click()
    await expect(dlg.locator('.rec')).toBeVisible()
    await dlg.locator('.shead').click()
    await expect(dlg.locator('.rec')).toHaveCount(0)
  })
})
