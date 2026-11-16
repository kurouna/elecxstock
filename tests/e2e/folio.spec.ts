// ポートフォリオ（FR-PF1〜PF8）: 9 つ目のタブ・カードを Tab で巡る・資産推移の期間と十字線の連動・損益寄与の期間・
// 配当の分析（分類・アコーディオン）・段の移動。キーボードだけで操作する。値はスタブ（架空）と架空の記録

import type { Page } from '@playwright/test'
import { addDays, isTradingDay } from '../../src/shared/calendar'
import type { FolioPoint } from '../../src/shared/types'
import { expect, holdings, keys, tab, test } from './support'

/** 目で確かめるためのスクリーンショット（FOLIO_SHOTS=<フォルダ> のときだけ） */
const shot = async (page: Page, name: string) => {
  if (process.env.FOLIO_SHOTS) await page.screenshot({ path: `${process.env.FOLIO_SHOTS}/${name}.png` })
}

const HOLD = holdings([
  { code: '7203', quantity: 100, avgCost: 15000 },
  { code: '8306', account: 'nisa_growth', quantity: 300, avgCost: 15000 },
  { code: '8058', quantity: 200, avgCost: 11000 },
  { code: '2914', quantity: 100, avgCost: 14000 },
  { code: '8951', account: 'nisa_growth', quantity: 2, avgCost: 95000 },
  { code: '1306', account: 'nisa_tsumitate', quantity: 300, avgCost: 2600 },
])
/** 架空の記録（約 1 年半。8306 は 1 年前は 200 株＝買い増し、2914 は今年の新規） */
function history(): FolioPoint[] {
  const out: FolioPoint[] = []
  let d = '2025-05-01'
  let v = 9_000_000
  let i = 0
  while (d < '2026-11-13') {
    if (isTradingDay(d)) {
      v *= 1 + Math.sin(i / 9) * 0.004 + 0.0006
      const later = d >= '2026-04-01'
      const pos = [
        { code: '7203', acct: 'tokutei' as const, qty: 100, cost: 15000 },
        { code: '8306', acct: 'nisa_growth' as const, qty: later ? 300 : 200, cost: 15000 },
        { code: '8058', acct: 'tokutei' as const, qty: 200, cost: 11000 },
        ...(later ? [{ code: '2914', acct: 'tokutei' as const, qty: 100, cost: 14000 }] : []),
        { code: '8951', acct: 'nisa_growth' as const, qty: 2, cost: 95000 },
        { code: '1306', acct: 'nisa_tsumitate' as const, qty: 300, cost: 2600 },
      ]
      const cost = pos.reduce((s, p) => s + p.qty * p.cost, 0)
      out.push({ d, src: i % 13 === 5 ? 'fill' : 'rec', final: true, value: Math.round(v + cost - 9_000_000), cost, pos, at: 1 })
      i++
    }
    d = addDays(d, 1)
  }
  return out
}

test.describe('ポートフォリオ（FR-PF1）', () => {
  test('Ctrl+Shift+9 で開き、カードが出る。Tab で巡り、資産推移の期間・十字線の連動・Esc で戻る', async ({ start }) => {
    const { page } = await start({ user: { holdings: HOLD, portfolioHistory: history() } })
    await tab(page, 'folio')
    const f = page.locator('[data-widget="folio"]')
    await expect(f).toHaveClass(/focused/)
    await expect(f.locator('.c-hero')).toContainText('評価額')
    // TOPIX そのものは取れないので、比べているのは TOPIX 連動 ETF（1306）と分かるように出す（FR-U6）
    await expect(f.locator('.c-hero')).toContainText('TOPIX ETF')
    await expect(f.locator('.c-hist .chart svg')).toBeVisible()
    await expect(f.locator('.c-alloc .tile').first()).toBeVisible()
    await expect(f.locator('.c-contrib .crow').first()).toBeVisible()
    await expect(f.locator('.c-events')).toContainText('今後 30 日の予定')
    // 期間の内訳は足すと期末と一致する（受取配当は別枠）
    await expect(f.locator('.c-hist .wfbox')).toContainText('期首')

    // Tab で資産推移を選び、Alt+3（3M）、← で十字線の日 → 評価額のカードがその日の値になる
    await keys(page, 'Tab')
    await expect(f.locator('.c-hist')).toHaveClass(/focus/)
    await keys(page, 'Alt+Digit3')
    await expect(f.locator('.c-hist .seg button.on').first()).toHaveText('3M')
    const before = await f.locator('.hero-value').textContent()
    await keys(page, 'ArrowLeft', 'ArrowLeft', 'ArrowLeft')
    await expect(f.locator('.c-hero .crossday')).toBeVisible()
    await expect(f.locator('.c-alloc .crossday')).toBeVisible()
    await expect.poll(() => f.locator('.hero-value').textContent()).not.toBe(before)
    await shot(page, 'folio-cross')
    await keys(page, 'Escape')
    await expect(f.locator('.c-hero .crossday')).toHaveCount(0)
    await expect.poll(() => f.locator('.hero-value').textContent()).toBe(before)

    // P で % にすると時間加重。B でベンチマーク
    await keys(page, 'p')
    await expect(f.locator('.c-hist .histhead')).toContainText('時間加重収益率')
    await keys(page, 'p')
    await shot(page, 'folio-top')
  })

  test('損益寄与は T で今日・今月・今年・取得来。行は ↓ で送り、Enter で同じリンク色のチャートに出す', async ({ start }) => {
    const { page } = await start({ user: { holdings: HOLD, portfolioHistory: history() } })
    await tab(page, 'folio')
    const f = page.locator('[data-widget="folio"]')
    await keys(page, 'Tab', 'Tab', 'Tab')
    const c = f.locator('.c-contrib')
    await expect(c).toHaveClass(/focus/)
    for (const label of ['今月', '今年', '取得来', '今日']) {
      await keys(page, 't')
      await expect(c.locator('.seg button.on')).toHaveText(label)
    }
    await keys(page, 'ArrowDown')
    await expect(c.locator('.crow.sel')).toHaveCount(1)
    const code = (await c.locator('.crow.sel .nm .num').textContent())!.trim()
    await keys(page, 'Enter')
    await expect(page.locator('[data-widget="chart"]').first()).toContainText(code)
  })

  test('配当の分析: PgDn で段を移り、分類を G で替え、表は → で開き ← で閉じる（FR-PF7）', async ({ start }) => {
    const { page } = await start({ user: { holdings: HOLD, portfolioHistory: history() } })
    await tab(page, 'folio')
    const f = page.locator('[data-widget="folio"]')
    await expect(f.locator('.c-dsum')).toBeVisible() // 読み込みが終わってから
    await keys(page, 'PageDown')
    await expect(f.locator('.nav button.on')).toHaveText(/配当の分析/)
    await expect(f.locator('.c-dsum')).toContainText('年間配当（税引後）')
    await expect(f.locator('.c-dwf')).toContainText('買い増し')
    // 表を選ぶ（Shift+Tab で後ろから）。初期値は銘柄ごと・銘柄コードの順
    await keys(page, 'Shift+Tab')
    const tb = f.locator('.c-dtab')
    await expect(tb).toHaveClass(/focus/)
    await expect(tb.locator('.seg button.on')).toHaveText('銘柄')
    await expect(tb.locator('th.on')).toHaveText(/銘柄/)
    const codes = await tb.locator('tbody tr td:first-child .num').allTextContents()
    expect(codes).toEqual([...codes].sort())
    // G で業種に分ける（アコーディオン）
    await keys(page, 'g')
    await expect(tb.locator('tr.g').first()).toBeVisible()
    const groups = await tb.locator('tr.g').count()
    await keys(page, 'ArrowRight')
    await expect(tb.locator('tr.g.open')).toHaveCount(1)
    expect(await tb.locator('tbody tr').count()).toBeGreaterThan(groups)
    await keys(page, 'ArrowDown', 'ArrowLeft')
    await expect(tb.locator('tr.g.open')).toHaveCount(0)
    // G で分類（業種 → 17 業種）、S で並べ替え（銘柄 → 年間）
    await keys(page, 'g')
    await expect(tb.locator('.seg button.on')).toHaveText('17 業種')
    await keys(page, 's')
    await expect(tb.locator('th.on')).toHaveText(/年間/)
    await shot(page, 'folio-div')
    // 表を選んでいる間の PgUp は表の行。Esc でカードの選択を外すと、段を移る
    // 見出しの分類と列名は押しても選べる（キーの G・S と同じ）
    await tb.getByRole('radio', { name: '市場区分' }).click()
    await expect(tb.locator('.seg button.on')).toHaveText('市場区分')
    await expect(f.locator('.c-dshare .seg button.on')).toHaveText('市場区分')
    await tb.locator('th', { hasText: '前年比' }).click()
    await expect(tb.locator('th.on')).toHaveText(/前年比/)
    await f.locator('.c-contrib').getByRole('radio', { name: '今年' }).click()
    await expect(f.locator('.c-contrib .seg button.on')).toHaveText('今年')
    await keys(page, 'Escape', 'PageUp')
    await expect(f.locator('.nav button.on')).toHaveText(/概要/)
  })

  test('配当の表: 銘柄を選んだあと、分類の行を押して開く・並べ替えると、選んでいる行は前の銘柄に戻らない（FR-PF7）', async ({ start }) => {
    const { page } = await start({ user: { holdings: HOLD, portfolioHistory: history() } })
    await tab(page, 'folio')
    const f = page.locator('[data-widget="folio"]')
    await expect(f.locator('.c-dsum')).toBeVisible()
    await keys(page, 'PageDown', 'Shift+Tab')
    const tb = f.locator('.c-dtab')
    await expect(tb).toHaveClass(/focus/)
    // 業種に分け、最初の分類を開いて中の銘柄を選ぶ
    await keys(page, 'g')
    await expect(tb.locator('tr.g').nth(1)).toBeVisible()
    await keys(page, 'Home', 'ArrowRight', 'ArrowDown')
    await expect(tb.locator('tr.child.sel')).toHaveCount(1)
    // 2 つ目の分類の行を押して開く → 選んでいるのはその分類の行
    const g2 = tb.locator('tr.g').nth(1)
    const name = ((await g2.locator('td').first().textContent()) ?? '').trim().replace(/^[▶▼]/, '') // 開閉の印は除く
    await g2.click()
    await expect(tb.locator('tr.g.open')).toHaveCount(2)
    await expect(tb.locator('tr.sel')).toHaveCount(1)
    await expect(tb.locator('tr.sel')).toHaveClass(/\bg\b/)
    await expect(tb.locator('tr.sel td').first()).toContainText(name)
    // 中の銘柄を選び直してから S で並べ替える → 先頭の行から
    await keys(page, 'ArrowDown')
    await expect(tb.locator('tr.child.sel')).toHaveCount(1)
    await keys(page, 's')
    await expect(tb.locator('tbody tr').first()).toHaveClass(/sel/)
  })

  test('資産構成・損益寄与・予定・配当の表の銘柄を押すと、同じリンク色のチャートと銘柄情報に出る。キーで選んでも追従する（FR-PF6）', async ({
    start,
  }) => {
    const { page } = await start({ user: { holdings: HOLD, portfolioHistory: history() } })
    await tab(page, 'folio')
    const f = page.locator('[data-widget="folio"]')
    const chart = page.locator('[data-widget="chart"]').first()
    const info = page.locator('[data-widget="info"]').first()
    // 口座区分の構成比の円グラフ
    await expect(f.locator('.c-hero .ring path')).toHaveCount(3)
    await expect(f.locator('.c-hero .ring')).toContainText('NISA')
    // 損益寄与の行
    // 取得のジョブで値が変わると行の並びが入れ替わるので、押したあとに選ばれた行のコードを読む
    await f.locator('.c-contrib .crow').nth(1).click()
    const code = (await f.locator('.c-contrib .crow.sel .nm .num').textContent())!.trim()
    await expect(chart).toContainText(code)
    await expect(info).toContainText(code)
    // 資産構成のタイル（銘柄コードを読み、押すとその銘柄）
    await f.locator('.c-alloc .tile').first().click()
    const t0 = (await f.locator('.c-alloc .tile.sel').getAttribute('title'))!.slice(0, 4)
    await expect(chart).toContainText(t0)
    // キーで選んでも追従する（タイルを押して資産構成を選んだので、Tab で次の損益寄与）
    await keys(page, 'Tab')
    await expect(f.locator('.c-contrib')).toHaveClass(/focus/)
    await keys(page, 'Home')
    await expect(f.locator('.c-contrib .crow').first()).toHaveClass(/sel/)
    const first = (await f.locator('.c-contrib .crow.sel .nm .num').textContent())!.trim()
    await expect(chart).toContainText(first)
    // 配当の表（銘柄ごと）の行（損益寄与を選んでいる間の PgDn は行なので、Esc で外してから段を移る）
    await keys(page, 'Escape', 'PageDown')
    await f.locator('.c-dshare .seg button').first().waitFor()
    await keys(page, 'Shift+Tab')
    // 初期値は銘柄ごと
    const tr = f.locator('.c-dtab tbody tr').nth(2)
    const c2 = (await tr.locator('td').first().locator('.num').textContent())!.trim()
    await tr.click()
    await expect(info).toContainText(c2)
  })

  // 回帰（2026-11-15 に利用者が見つけた不具合）: 損益寄与の行を押すと、操作キーの案内の行が出入りしてカードの高さが変わり、
  // 資産構成のツリーマップが並び直していた
  test('カードを Tab で選び替えても、カードとツリーマップの大きさ・タイルの並びは変わらない（FR-PF1）', async ({ start }) => {
    const { page } = await start({ user: { holdings: HOLD, portfolioHistory: history() } })
    await tab(page, 'folio')
    const f = page.locator('[data-widget="folio"]')
    await expect(f.locator('.c-alloc .tile').first()).toBeVisible()
    const measure = () =>
      f.evaluate((el) => ({
        cards: [...el.querySelectorAll('.grid > .card')].map((c) => Math.round(c.getBoundingClientRect().height)),
        tm: el.querySelector('.c-alloc .tm')!.getBoundingClientRect().height,
        tiles: [...el.querySelectorAll('.c-alloc .tile')].map((t) => t.getAttribute('title')).join('|'),
      }))
    const base = await measure()
    for (const name of ['hist', 'alloc', 'contrib', 'div', 'events']) {
      await keys(page, 'Tab')
      await expect(f.locator(`.c-${name}`)).toHaveClass(/focus/)
      if (name !== 'events') await expect(f.locator(`.c-${name} .keys`)).toBeVisible()
      expect(await measure(), name).toEqual(base)
    }
  })

  // 回帰（2026-11-15 に利用者が見つけた見た目の不具合）: 1920 の画面（L の並び）で、口座で分けた配当の内訳の名前と年間配当の値が切れない
  test('配当の内訳の名前・年間配当の値と注記が切れない（L の並び）', async ({ start }) => {
    const { page } = await start({ user: { holdings: HOLD }, viewport: { width: 1920, height: 1040 } })
    await tab(page, 'folio')
    const f = page.locator('[data-widget="folio"]')
    await expect(f.locator('.c-dsum')).toBeVisible()
    await keys(page, 'PageDown')
    await f.locator('.c-dshare').getByRole('radio', { name: '口座' }).click()
    await keys(page, 'PageDown')
    const clipped = (sel: string) =>
      f.locator(sel).evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent))
    await expect(f.locator('.c-dshare .shr .nm').first()).toBeVisible()
    expect(await clipped('.c-dshare .shr .nm')).toEqual([])
    expect(await clipped('.c-dsum .stat .v')).toEqual([])
    expect(await clipped('.c-dsum .note')).toEqual([])
    expect(await clipped('.c-hero .ring .nm')).toEqual([])
    await shot(page, 'folio-div-l')
  })

  // 回帰（2026-11-15 のレビューで見つけた不具合）
  test('配当見込みの月を押して選び Enter で表に移るとリンク色に送る。分類の行を押すと表を選ぶ。ベンチマーク・試算も見出しで選べる', async ({
    start,
  }) => {
    const { page } = await start({ user: { holdings: HOLD, portfolioHistory: history() } })
    await tab(page, 'folio')
    const f = page.locator('[data-widget="folio"]')
    const chart = page.locator('[data-widget="chart"]').first()
    await expect(f.locator('.c-dsum')).toBeVisible()
    // 配当見込み: 権利月の銘柄がある月を押して選ぶ → Enter で配当の表に移り、その銘柄をチャートに出す
    const cells = f.locator('.c-div .ribbon .cell')
    const n = await cells.count()
    let pickedMonth = -1
    for (let i = 0; i < n; i++)
      if ((await cells.nth(i).locator('i').count()) > 0) {
        pickedMonth = i
        break
      }
    expect(pickedMonth).toBeGreaterThanOrEqual(0)
    await cells.nth(pickedMonth).click()
    await expect(f.locator('.c-div')).toHaveClass(/focus/)
    await expect(cells.nth(pickedMonth)).toHaveClass(/sel/)
    const code = (await f.locator('.c-div .mlist .num').first().textContent())!.trim()
    // 月の棒のツールチップに、その月の合計と銘柄の内訳が出る
    const tip = await f.locator('.c-div .bars .hit title').nth(pickedMonth).textContent()
    expect(tip).toContain('前年同月')
    expect(tip).toContain(code)
    // 増減要因の棒のツールチップに、その要因の銘柄が出る（8306 は買い増し、2914 は新規）
    const wf = f.locator('.c-dwf .hit title')
    await expect(wf.nth(0)).toContainText('前年')
    expect(await wf.allTextContents()).toEqual(expect.arrayContaining([expect.stringMatching(/^新規[^\n]*\n {2}2914 /)]))
    // 配当の内訳: スライスのツールチップに年間配当と割合。一覧の行にマウスを載せるとそのスライスが外へせり出し、離すと戻る
    const sl = f.locator('.c-dshare .sl').first()
    await expect(sl.locator('title')).toContainText('年間配当（税引後）')
    await f.locator('.c-dshare .r').first().hover()
    await expect(sl).toHaveClass(/on/)
    await expect.poll(() => sl.evaluate((e) => getComputedStyle(e).transform)).not.toBe('none')
    await shot(page, 'folio-dshare-hover')
    await page.mouse.move(0, 0)
    await expect(sl).not.toHaveClass(/on/)
    // 増減要因: マウスを載せた棒だけが縁取られ、ほかの棒の色（不透明度）は変わらない
    const bars = f.locator('.c-dwf rect.b')
    const opac = () => bars.evaluateAll((es) => es.map((e) => getComputedStyle(e).opacity))
    const before = await opac()
    await f.locator('.c-dwf .hit').nth(1).hover()
    await expect(bars.nth(1)).toHaveClass(/hov/)
    await expect(bars.and(f.locator('.hov'))).toHaveCount(1)
    expect(await opac()).toEqual(before)
    await shot(page, 'folio-dwf-hover')
    // 年間配当の推移: マウスを載せると、その日の縦線・点と値が出る。離すと消える
    const trend = f.locator('.c-dsum .trend')
    const box = (await trend.boundingBox())!
    await page.mouse.move(box.x + 4, box.y + box.height / 2)
    await expect(trend.locator('.tread')).toHaveAttribute('data-trend-at', /^\d{4}-\d{2}-\d{2}$/)
    await expect(trend.locator('.tread')).toContainText('最初の記録から')
    await shot(page, 'folio-trend-hover')
    await page.mouse.move(0, 0)
    await expect(trend.locator('.tread')).toHaveCount(0)
    // 1 株配当（5 年）: 見出しに色の意味、行に年ごとの値
    await expect(f.locator('.c-dtab th', { hasText: '1 株配当（5 年）' })).toHaveAttribute('title', /金 = 増配/)
    await expect(f.locator('.c-dtab td[title^="1 株配当（1 年ごと"]').first()).toHaveAttribute('title', /直近 1 年/)
    await keys(page, 'Enter')
    await expect(f.locator('.c-dtab')).toHaveClass(/focus/)
    await expect(f.locator('.c-dtab tr.sel')).toContainText(code)
    await expect(chart).toContainText(code)
    // 分類の行を押すと表を選んだことになり、続けて → ← が効く
    await f.locator('.c-dtab').getByRole('radio', { name: '業種', exact: true }).click()
    await keys(page, 'Escape')
    await f.locator('.c-dtab tr.g').first().click()
    await expect(f.locator('.c-dtab')).toHaveClass(/focus/)
    await expect(f.locator('.c-dtab tr.g.open')).toHaveCount(1)
    await keys(page, 'ArrowLeft')
    await expect(f.locator('.c-dtab tr.g.open')).toHaveCount(0)
    // 資産推移: 円では「記録前の試算」、% ではベンチマークを見出しで選べる。なしに戻すと線が消える
    await keys(page, 'Escape', 'PageUp')
    const hist = f.locator('.c-hist')
    await hist.getByRole('button', { name: /記録前の試算/ }).click()
    await expect(hist.getByRole('button', { name: /記録前の試算/ })).toHaveAttribute('aria-pressed', 'true')
    await hist.getByRole('radio', { name: '%' }).click()
    await hist.getByRole('radio', { name: '日経平均' }).click()
    await expect(hist.locator('.histhead')).toContainText('日経平均')
    await expect(hist.locator('path.bench')).toHaveCount(1)
    await hist.getByRole('radio', { name: 'なし' }).click()
    await expect(hist.locator('path.bench')).toHaveCount(0)
  })

  test('保有が無ければ取り込みの案内', async ({ start }) => {
    const { page } = await start()
    await tab(page, 'folio')
    const f = page.locator('[data-widget="folio"]')
    await expect(f.locator('.empty')).toContainText('保有がありません')
  })
})
