// マーケット（ヒートマップ・ランキング）と配当カレンダー（§6.4 のプリセット、FR-V13）。値はスタブ（架空）
import type { Locator } from '@playwright/test'
import { expect, focusPane, keys, readUser, tab, test, watchlists } from './support'

const tip = async (l: Locator, text: RegExp) => {
  await expect(l).toHaveAttribute('title', text)
  expect(await l.getAttribute('title')).toMatch(/\S \(.+\)$/)
}

test.describe('マーケット（FR-L5, FR-V13）', () => {
  test('ヒートマップ（33 業種）の中へ Enter で入り Esc で戻る。期間は「騰落率」の期間と分かる', async ({ start }) => {
    const { page } = await start()
    await tab(page, 'market')
    const heat = page.locator('[data-widget="heatmap"]')
    await expect(heat.locator('.map .cell').first()).toBeVisible()
    await expect(heat.locator('.lbl')).toContainText('騰落率')
    await tip(heat.getByRole('button', { name: '1か月' }), /騰落率の期間 \(P\)/)
    // ★だけ表示はどのペインも同じ名前とキー
    await tip(heat.getByRole('button', { name: '★のみ表示' }), /★のみ表示 \(Ctrl\+Shift\+F\)/)
    await tip(page.locator('[data-widget="ranking"]').getByRole('button', { name: '★のみ表示' }), /Ctrl\+Shift\+F/)
    // 業種の中へ（Enter）→ 戻る（Esc）。左の列のウォッチリストから右のヒートマップへ
    await keys(page, 'Alt+ArrowRight')
    await expect(page.locator('.pane.focused')).toHaveAttribute('data-widget', 'heatmap')
    const sectors = await heat.locator('.map .cell').count()
    await keys(page, 'ArrowRight')
    const entered = (await heat.locator('.map .cell.sel .n').textContent())!
    await keys(page, 'Enter')
    await expect.poll(() => heat.locator('.map .cell').count()).not.toBe(sectors)
    await expect(heat.locator('.map .cell').first()).toBeVisible()
    await keys(page, 'Escape')
    await expect.poll(() => heat.locator('.map .cell').count()).toBe(sectors)
    // 戻ると、入った業種のタイルを選んでいる
    await expect(heat.locator('.map .cell.sel .n')).toHaveText(entered)
  })
})

test.describe('配当カレンダー（§6.4 インカム）', () => {
  test('9 銘柄以上の月も全部を選べる', async ({ start }) => {
    // お気に入りに 10 銘柄を入れておく（カレンダーはすべてのウォッチリストの銘柄を並べる。権利月はスタブの架空の値）
    const codes = ['7203', '8058', '8306', '9434', '8053', '8766', '5401', '6501', '7974', '4063']
    const { page } = await start({
      user: { watchlists: watchlists({ favorites: codes }) },
    })
    await tab(page, 'income')
    const cal = page.locator('[data-widget="divcal"]')
    await expect(cal).toBeVisible()
    await expect.poll(async () => Math.max(...(await cal.locator('.m h5 .num').allTextContents()).map(Number))).toBeGreaterThan(8)
    const counts = await cal.locator('.m h5 .num').allTextContents()
    const mi = counts.findIndex((c) => Number(c) > 8)
    const month = cal.locator('.m').nth(mi)
    await expect(month.locator('.row')).toHaveCount(Number(counts[mi]))
  })

  test('選んでいる最後の銘柄を★から外して月の銘柄が減っても、選んでいる行は最後の行に残る', async ({ start }) => {
    const codes = ['7203', '8058', '8306', '9434', '8053', '8766', '5401', '6501', '7974', '4063']
    const { page } = await start({ user: { watchlists: watchlists({ favorites: codes }) } })
    await tab(page, 'income')
    const cal = page.locator('[data-widget="divcal"]')
    await expect.poll(async () => Math.max(...(await cal.locator('.m h5 .num').allTextContents()).map(Number))).toBeGreaterThan(1)
    const counts = (await cal.locator('.m h5 .num').allTextContents()).map(Number)
    const mi = counts.findIndex((c) => c > 1)
    await focusPane(page, cal)
    for (
      let i = 0;
      i < 12 &&
      !(await cal
        .locator('.m')
        .nth(mi)
        .evaluate((el) => el.classList.contains('cur')));
      i++
    )
      await keys(page, 'ArrowRight')
    const month = cal.locator('.m').nth(mi)
    await expect(month).toHaveClass(/cur/)
    // ↑ で最後の行へ回り、Ctrl+D で★から外す（ほかのリストに無いので月から消える）
    await keys(page, 'ArrowUp')
    await expect(month.locator('.row').last()).toHaveClass(/sel/)
    await keys(page, 'Control+d')
    await expect(month.locator('.row')).toHaveCount(counts[mi]! - 1)
    await expect(month.locator('.row.sel')).toHaveCount(1)
    await expect(month.locator('.row').last()).toHaveClass(/sel/)
  })
})

test.describe('マーケットの指数のチャート（§6.3 market-overview・§6.5.6・FR-G3）', () => {
  /** 保存したレイアウトの market-overview の状態 */
  const saved = (userData: string) => {
    const doc = readUser<{ entries: Record<string, unknown> }>(userData, 'layout')
    const m = JSON.stringify(doc.entries.market).match(/"widget":"market"[^}]*"state":(\{[^}]*\})/)
    return m ? (JSON.parse(m[1]!) as { period?: number; tf?: string }) : null
  }
  test('Alt+1〜6 で表示期間を選べ、見出しの選択に出て、再起動しても残る', async ({ start }) => {
    const first = await start()
    await tab(first.page, 'market')
    const mkt = first.page.locator('[data-widget="market"]')
    const picker = mkt.locator('select.period')
    // 既定は時間軸ごとの本数（チャートと同じ「既定」）
    await expect(picker).toHaveValue('-1')
    await focusPane(first.page, mkt)
    await keys(first.page, 'Alt+Digit3')
    await expect(picker).toHaveValue('2') // 1 年
    await keys(first.page, 'KeyW')
    await expect(mkt.getByRole('button', { name: 'W', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(picker).toHaveValue('2') // 時間軸を変えても期間は残る
    await expect(mkt.locator('canvas').first()).toBeVisible()
    await expect.poll(() => saved(first.userData)).toMatchObject({ period: 2, tf: 'W' })
    await first.app.close()
    const second = await start({ userData: first.userData })
    await tab(second.page, 'market')
    await expect(second.page.locator('[data-widget="market"] select.period')).toHaveValue('2')
  })
})

test.describe('マーケット一覧（FR-MB1, FR-MB2, FR-MB4, FR-MB5）', () => {
  test('マーケットのタブの左上にあり、区分・並べ替え・チャートの追従をキーだけで操作できる', async ({ start }) => {
    const { page } = await start()
    await tab(page, 'market')
    const board = page.locator('[data-widget="board"]')
    // ウォッチリストの代わりに左の列の上に置く（FR-MB5）
    await expect(board).toBeVisible()
    await expect(page.locator('[data-widget="watchlist"]')).toHaveCount(0)
    const rows = board.locator('tbody tr')
    await expect(rows).toHaveCount(20)
    await expect(board.getByRole('tab', { selected: true })).toContainText('全て')
    // 連動 ETF は表示名に「連動ETF」と ETF の名前を出す（FR-U6）
    await expect(board.locator('tr[data-id="JP:1308"] td.name')).toContainText('TOPIX 連動ETF')
    await expect(board.locator('tr[data-id="JP:1308"] td.name .sub')).toContainText('上場インデックスファンド')
    await focusPane(page, board)
    // ↓ でめくると、同じリンク色のチャートがその行になる（FR-MB4）
    await keys(page, 'Home', 'ArrowDown')
    const chart = page.locator('[data-widget="chart"]').first()
    await expect(chart.locator('.sym .code')).toHaveText('1308')
    // G で区分を次へ（日本）、Ctrl+PageDown でも次へ（米国）、Shift+G で戻る
    await keys(page, 'KeyG')
    await expect(board.getByRole('tab', { selected: true })).toContainText('日本')
    await expect(rows).toHaveCount(6)
    await keys(page, 'Control+PageDown')
    await expect(board.getByRole('tab', { selected: true })).toContainText('米国')
    await expect(rows).toHaveCount(5)
    await expect(chart.locator('.sym .code')).toHaveText('DJI')
    await keys(page, 'Shift+KeyG')
    await expect(board.getByRole('tab', { selected: true })).toContainText('日本')
    // 為替・金利: 価格は登録表の桁（ドル/円は 3 桁。FR-MB2）
    await keys(page, 'KeyG', 'KeyG', 'KeyG')
    await expect(board.getByRole('tab', { selected: true })).toContainText('為替・金利')
    const close = board.locator('tr[data-id="IDX:USDJPY"] td').nth(2)
    await expect(close).toHaveText(/^\d{3}\.\d{3}$/)
    // ← → と S で並べ替える（前日比の列で 2 回押すと逆順）
    await keys(page, 'ArrowRight', 'KeyS')
    await expect(board.locator('th', { hasText: '▼' })).toHaveCount(1)
    await keys(page, 'KeyS')
    await expect(board.locator('th', { hasText: '▲' })).toHaveCount(1)
  })
})

test.describe('騰落（FR-BR1, FR-BR2, FR-BR3, FR-BR4）', () => {
  test('市場と業種別をタブで切り替え、業種の中の銘柄でチャートが追従し、Esc で戻る（キーだけ）', async ({ start }) => {
    const { page } = await start()
    await tab(page, 'market')
    const br = page.locator('[data-widget="breadth"]')
    await expect(br).toBeVisible()
    // 市場: プライムと J-REIT の 2 行。基準日を出す（FR-BR2）
    await expect(br.getByRole('tab', { selected: true })).toContainText('市場')
    await expect(br.locator('tbody tr')).toHaveCount(2)
    await expect(br.locator('tbody tr').first()).toContainText('プライム')
    await expect(br.locator('.filter')).toContainText('基準日')
    await focusPane(page, br)
    // G で業種別へ。既定は 1日（前日比）の高い順（FR-BR3）
    await keys(page, 'KeyG')
    await expect(br.getByRole('tab', { selected: true })).toContainText('業種別')
    await expect.poll(() => br.locator('tbody tr').count()).toBeGreaterThan(3)
    await expect(br.locator('th', { hasText: '▼' })).toContainText('前日比')
    // 2 行目の業種の中へ（FR-BR4）
    await keys(page, 'Home', 'ArrowDown')
    const sector = (await br.locator('tbody tr.sel').getAttribute('data-key'))!
    await keys(page, 'Enter')
    await expect(br).toContainText(`› ${sector}`)
    const rows = br.locator('tbody tr[data-id]')
    await expect.poll(() => rows.count()).toBeGreaterThan(0)
    // ↓ でめくると、同じリンク色のチャートがその銘柄になる
    await keys(page, 'ArrowDown')
    const id = (await br.locator('tbody tr.sel').getAttribute('data-id'))!
    await expect(page.locator('[data-widget="chart"]').first().locator('.sym .code')).toHaveText(id.slice(3))
    // Esc で戻ると、入った業種の行を選んでいる
    await keys(page, 'Escape')
    await expect(br.locator('tbody tr.sel')).toHaveAttribute('data-key', sector)
    // Ctrl+PageDown で市場へ戻る（タブは 2 つで回る）
    await keys(page, 'Control+PageDown')
    await expect(br.getByRole('tab', { selected: true })).toContainText('市場')
  })
})
