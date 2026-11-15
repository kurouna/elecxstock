// 状態の変化への追従（docs/test-plan.md §8.1）: 変える元（保有・★・ウォッチリスト・スクリーンの条件・保有の取り込み・データの更新）を
// キーで変え、追従する先（スクリーナーの結果・グリッドのスクリーン・ウォッチリストの並び・保有の列・アラートの「いまの状態」）が
// 再起動なしで変わることを確かめる。窓をまたぐ行（別の窓での★・1 枚目での保有の変更 → フリー N）は state-windows.spec.ts。
// 期待値は Core の窓口（screener.run・metrics.get）から導き、画面の数と突き合わせる。値はスタブ（架空）
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Locator, Page } from '@playwright/test'
import {
  col,
  command,
  expect,
  focusPane,
  freeTab,
  holdings,
  keys,
  pane,
  row,
  rpc,
  TEST_NOW,
  test,
  type,
  typeJump,
  watchlists,
} from './support'

const NOW_MS = Date.parse(TEST_NOW)
const screen = (id: string, ja: string, conditions: unknown[], columns?: string[]) => ({
  id,
  name: { ja, en: id },
  conditions,
  ...(columns ? { columns } : {}),
  created: NOW_MS,
  updated: NOW_MS,
})
const SCREENS = [
  screen('held', '保有している', [{ field: 'user.held', op: '=', value: true }], ['star', 'code', 'name', 'holding.weight']),
  screen('fav', '★の銘柄', [{ field: 'user.favorite', op: '=', value: true }]),
  screen('wl', '監視の銘柄', [{ field: 'user.watchlist', op: 'in', value: ['watch'] }]),
  // ★の銘柄のうち前日比がプラス（グリッドの 1 ページに収まる数）
  screen('up', '上げた★', [
    { field: 'user.favorite', op: '=', value: true },
    { field: 'price.chgPct', op: '>=', value: 0 },
  ]),
]
const alert = (id: string, code: string, field: string, op: '>=' | '<=', value: number) => ({
  id,
  target: { kind: 'symbol', id: `JP:${code}` },
  conditions: [{ field, op, value }],
  basis: '2026-11-13',
  repeat: false,
  enabled: true,
  created: TEST_NOW,
})

const widget = (page: Page, w: string, n = 0) => page.locator(`[data-widget="${w}"]`).nth(n)
const rows = (l: Locator) => l.locator('tbody tr')
const tiles = (l: Locator) => l.locator('.tile')
/** 一覧の行のコード（先頭の 4〜5 桁） */
const codes = async (l: Locator) => (await rows(l).allTextContents()).map((t) => t.match(/\d{4}[0-9A-Z]?/)?.[0] ?? '')

/** Core の判定（期待値）: スクリーンの条件に合う銘柄の数 */
async function screenCount(page: Page, id: string): Promise<number> {
  const u = await rpc<{
    screens: { id: string; conditions: unknown[] }[]
    watchlists: { id: string; builtin?: string; items: string[] }[]
  }>(page, 'user.load')
  const s = u.screens.find((x) => x.id === id)!
  const r = await rpc<{ ids: string[] }>(page, 'screener.run', {
    conditions: s.conditions,
    favorites: u.watchlists.find((w) => w.builtin === 'favorites')?.items ?? [],
    watchlists: Object.fromEntries(u.watchlists.map((w) => [w.id, w.items])),
  })
  return r.ids.length
}

/** 一覧のペインで、Home から ↓ で text の行を選ぶ */
async function selectRow(page: Page, list: Locator, text: string) {
  await keys(page, 'Home')
  for (let i = 0; i < 30 && !((await list.locator('tbody tr.sel').textContent()) ?? '').includes(text); i++) await keys(page, 'ArrowDown')
  await expect(list.locator('tbody tr.sel')).toContainText(text)
}

/** アラートのポップアップの「いま」の列（1 つ目の条件の値） */
async function alertNow(page: Page, code: string): Promise<string> {
  await keys(page, 'Control+Alt+l')
  const r = page.locator('.dialog.alerts tbody tr', { hasText: code })
  await expect(r).toBeVisible()
  const text = (await r.locator('td.num.r').first().textContent())!.trim()
  await keys(page, 'Escape')
  await expect(page.locator('.dialog.alerts')).toHaveCount(0)
  return text
}

test.describe('状態の変化への追従: 保有（§8.1, FR-H4, FR-H6, FR-H7, FR-AL1）', () => {
  // 左: 保有・ウォッチリスト（★、保有割合の大きい順）。右: スクリーナー（保有している）・グリッド（同じスクリーン）
  const layout = freeTab(
    row(
      col(
        pane('portfolio', {}, 2),
        pane('watchlist', { list: 'favorites', cols: ['code', 'name', 'holding.weight'], sort: { k: 'holding.weight', dir: -1 } }, 3),
        pane('chart', {}, 2),
      ),
      col(pane('screener', { screenId: 'held' }, 4), pane('grid', { src: 'scr:held' }, 0)),
    ),
  )
  const user = {
    screens: SCREENS,
    watchlists: watchlists({ favorites: ['7203', '8058', '9434'] }),
    holdings: holdings([{ code: '7203', quantity: 100, avgCost: 2500 }]),
    alerts: [alert('pnl', '8058', 'holding.pnlPct', '>=', -100)],
  }

  test('保有を足す・直す・外すと、スクリーナー・グリッド・ウォッチリストの並び・保有割合の列・アラートの「いま」が追従する', async ({
    start,
  }) => {
    const { page } = await start({ layout, user })
    expect(await alertNow(page, '8058')).toBe('—') // 持っていない銘柄の損益率は欠損
    const pf = widget(page, 'portfolio')
    const wl = widget(page, 'watchlist')
    const scr = widget(page, 'screener')
    const grid = widget(page, 'grid')
    const weightOf = (code: string) => rows(wl).filter({ hasText: code }).locator('td').last()
    // はじめ: 7203 だけを持つ
    await expect(rows(scr)).toHaveCount(1)
    await expect(tiles(grid)).toHaveCount(1)
    await expect.poll(() => codes(wl)).toEqual(['7203', expect.any(String), expect.any(String)])
    await expect(weightOf('7203')).toHaveText(/^100(\.0+)?%$/)

    // 足す: 8058 を 1,000 株（評価額は 7203 より大きい）
    await focusPane(page, pf)
    await keys(page, 'Insert')
    const form = page.locator('.dialog.holding')
    await expect(form.locator('input[name="code"]')).toBeFocused()
    await type(page, '8058')
    await expect(form).toContainText('三菱商事')
    await keys(page, 'Tab', 'Tab')
    await type(page, '1000')
    await keys(page, 'Tab')
    await type(page, '100')
    await keys(page, 'Enter')
    await expect(form).toHaveCount(0)
    await expect(rows(scr)).toHaveCount(2)
    await expect(tiles(grid)).toHaveCount(2)
    await expect.poll(async () => (await codes(wl))[0]).toBe('8058')
    await expect(weightOf('7203')).not.toHaveText(/^100(\.0+)?%$/)
    // アラートの「いま」（保有の損益率）も今の保有で数え直す（Core の alerts.list は今の保有で数える）
    await expect.poll(() => alertNow(page, '8058')).toMatch(/%$/)

    // 直す: 8058 を 1 株に（7203 が大きい側に戻る）
    await focusPane(page, pf)
    await selectRow(page, pf, '8058')
    await keys(page, 'e')
    await expect(form.locator('input[name="qty"]')).toHaveValue('1000')
    await form.locator('input[name="qty"]').fill('1')
    await keys(page, 'Enter')
    await expect(form).toHaveCount(0)
    await expect.poll(async () => (await codes(wl))[0]).toBe('7203')

    // 外す: 8058 が結果・グリッド・アラートから外れる
    await selectRow(page, pf, '8058')
    await keys(page, 'Delete')
    await expect(page.getByRole('alertdialog')).toContainText('8058')
    await keys(page, 'ArrowRight', 'Enter')
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    await expect(rows(scr)).toHaveCount(1)
    await expect(tiles(grid)).toHaveCount(1)
    await expect(weightOf('7203')).toHaveText(/^100(\.0+)?%$/)
    await expect.poll(() => alertNow(page, '8058')).toBe('—') // 持っていない銘柄に戻る
  })

  test('保有の JSON の取り込みと元に戻すに、スクリーナーと保有割合の列が追従する（FR-H9）', async ({ start }) => {
    const { app, page, userData } = await start({ layout, user })
    const wl = widget(page, 'watchlist')
    const scr = widget(page, 'screener')
    const weightOf = (code: string) => rows(wl).filter({ hasText: code }).locator('td').last()
    await expect(rows(scr)).toHaveCount(1)
    // 取り込むファイル（架空の保有）。OS のファイルの選択は main で置き換える
    const file = join(userData, 'import.json')
    writeFileSync(
      file,
      JSON.stringify({
        format: 'elecxstock.holdings',
        version: 1,
        holdings: [
          { code: '8058', account: 'tokutei', quantity: 1000, avgCost: 100 },
          { code: '9434', account: 'tokutei', quantity: 100, avgCost: 100 },
        ],
      }),
    )
    await app.evaluate(({ dialog }, f) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [f] })) as typeof dialog.showOpenDialog
    }, file)
    await command(page, '保有の記録を JSON から取り込む')
    await expect(page.locator('.dialog')).toContainText('次へ')
    await keys(page, 'Enter') // 次へ
    await expect(page.locator('.dialog')).toContainText('今の記録に合わせる')
    await keys(page, 'Enter') // 今の記録に合わせる（7203 は残る）
    await expect(page.locator('.toasts')).toContainText('元に戻す')
    await expect(rows(scr)).toHaveCount(3)
    await expect(weightOf('7203')).not.toHaveText(/^100(\.0+)?%$/)
    // 元に戻す
    await command(page, '保有の取り込みを元に戻す')
    await expect(rows(scr)).toHaveCount(1)
    await expect(weightOf('7203')).toHaveText(/^100(\.0+)?%$/)
  })
})

test.describe('状態の変化への追従: ★・ウォッチリスト・スクリーンの条件（§8.1, FR-SC9, FR-SC10, FR-W6, FR-G1）', () => {
  const favLayout = freeTab(
    row(
      col(pane('watchlist', { list: 'favorites' }, 3), pane('chart', {}, 3)),
      col(pane('screener', { screenId: 'fav' }, 4), pane('grid', { src: 'scr:fav' }, 0)),
    ),
  )
  const wlLayout = freeTab(
    row(
      col(pane('watchlist', { list: 'watch' }, 3), pane('chart', {}, 3)),
      col(pane('screener', { screenId: 'wl' }, 4), pane('grid', { src: 'scr:wl' }, 0)),
    ),
  )

  /** ★を銘柄ジャンプの ☆（Ctrl+D）で入れ、一覧の行の Ctrl+D で外す。each で入れたあと・外したあとを確かめる */
  async function toggleStars(page: Page, each: (n: number) => Promise<void>) {
    const wl = widget(page, 'watchlist')
    await each(1)
    await focusPane(page, wl)
    await typeJump(page, '8058')
    await keys(page, 'Control+d')
    await expect(page.locator('.dialog.jump')).toContainText('続けて次のコード')
    await keys(page, 'Escape')
    await expect(page.locator('.dialog.jump')).toHaveCount(0)
    await each(2)
    await focusPane(page, wl)
    await selectRow(page, wl, '7203')
    await keys(page, 'Control+d')
    await each(1)
  }
  /** 監視のリストに銘柄ジャンプの Ctrl+Enter で足し、Delete で外す */
  async function editWatch(page: Page, each: (n: number) => Promise<void>) {
    const wl = widget(page, 'watchlist')
    await each(1)
    await focusPane(page, wl)
    await expect(wl.getByRole('tab', { name: /監視/ })).toHaveAttribute('aria-selected', 'true')
    await typeJump(page, '8058')
    await keys(page, 'Control+Enter')
    await expect(page.locator('.dialog.jump')).toHaveCount(0)
    await expect(page.locator('.presets [aria-current="true"]')).toContainText('フリー') // このタブのチャートに出す
    await each(2)
    await focusPane(page, wl)
    await selectRow(page, wl, '7203')
    await keys(page, 'Delete')
    await each(1)
  }

  /** ★の銘柄のスクリーンのアラート（「いま」は結果の件数） */
  const favAlert = {
    id: 'sfav',
    target: { kind: 'screen', screenId: 'fav' },
    conditions: [],
    basis: '2026-11-13',
    repeat: true,
    enabled: true,
    created: TEST_NOW,
  }
  const wlAlert = { ...favAlert, id: 'swl', target: { kind: 'screen', screenId: 'wl' } }

  test('★を入れる・外すと、ウォッチリスト・グリッド・スクリーナーとスクリーンのアラートの件数が追従する', async ({ start }) => {
    const { page } = await start({
      layout: favLayout,
      user: { screens: SCREENS, watchlists: watchlists({ favorites: ['7203'] }), alerts: [favAlert] },
    })
    let changed = false
    await toggleStars(page, async (n) => {
      await expect(rows(widget(page, 'watchlist'))).toHaveCount(n)
      await expect(tiles(widget(page, 'grid'))).toHaveCount(n)
      await expect(rows(widget(page, 'screener'))).toHaveCount(n)
      // 自分の窓での変更でも、Core が基準を取り直した件数をポップアップに出す（はじめは基準が無いので見ない）
      if (changed) await expect.poll(() => alertNow(page, '★の銘柄')).toBe(`${n} 件`)
      changed = true
    })
  })

  test('ウォッチリストの銘柄を足す・外すと、ウォッチリスト・グリッド・スクリーナーとスクリーンのアラートの件数が追従する', async ({
    start,
  }) => {
    const { page } = await start({
      layout: wlLayout,
      user: { screens: SCREENS, watchlists: watchlists({ watch: ['7203'] }), alerts: [wlAlert] },
    })
    let changed = false
    await editWatch(page, async (n) => {
      await expect(rows(widget(page, 'watchlist'))).toHaveCount(n)
      await expect(tiles(widget(page, 'grid'))).toHaveCount(n)
      await expect(rows(widget(page, 'screener'))).toHaveCount(n)
      if (changed) await expect.poll(() => alertNow(page, '監視の銘柄')).toBe(`${n} 件`)
      changed = true
    })
  })

  test('スクリーンの条件を変えると、編集中はグリッドの「今のスクリーン」が、保存するとそのスクリーンのグリッドが追従する', async ({
    start,
  }) => {
    const yieldScreen = screen('y', '利回り', [{ field: 'income.yield', op: '>=', value: 3.5 }])
    const layout = freeTab(
      row(pane('screener', { screenId: 'y' }, 4), col(pane('grid', { src: 'live' }, 0), pane('grid', { src: 'scr:y' }, 0))),
    )
    const { page } = await start({ layout, user: { screens: [yieldScreen, ...SCREENS] } })
    const scr = widget(page, 'screener')
    const live = widget(page, 'grid', 0)
    const saved = widget(page, 'grid', 1)
    const n0 = await screenCount(page, 'y')
    expect(n0).toBeGreaterThan(1)
    // グリッドは 1 ページ分（格子の枚数まで）しか並べないので、ページの表示（全体の数）で比べる
    const total = (g: Locator) => g.locator('.bar').textContent()
    await expect(rows(scr)).toHaveCount(n0)
    const liveBefore = await total(live)
    const savedBefore = await total(saved)
    // 条件の値を 5% に上げる（未保存）
    await focusPane(page, scr)
    await keys(page, 'Tab')
    await expect(scr.locator('.cond').first()).toHaveClass(/focus/)
    await keys(page, 'Enter')
    await expect(page.locator('.dialog').last().locator('input')).toBeFocused()
    await keys(page, 'Control+a')
    await type(page, '5')
    await keys(page, 'Enter')
    await expect(scr).toContainText('変更あり')
    await expect.poll(() => rows(scr).count()).toBeLessThan(n0)
    await expect.poll(() => total(live)).not.toBe(liveBefore)
    expect(await total(saved)).toBe(savedBefore)
    // 保存すると、保存したスクリーンのグリッドも追従する
    await keys(page, 'Control+s')
    await expect(scr).not.toContainText('変更あり')
    await expect.poll(() => total(saved)).not.toBe(savedBefore)
  })
})

test.describe('状態の変化への追従: データの更新（§8.1, FR-F9, FR-SC3, FR-AL3）', () => {
  // スタブは毎日の最新の終値を同じ値（基準値）にするので、更新で値はほとんど変わらない。基準日（asOf）が新しい日になることで、
  // 一覧が読み直したことを確かめ、並び・件数・保有割合・アラートは Core の値と突き合わせる
  test('更新（data.updated）のあと、スクリーナー・グリッド・ウォッチリストの並び・保有割合・アラートが Core の新しい値と一致する', async ({
    start,
  }) => {
    // 次の営業日に、自動の更新を止めて起動する（画面は前の営業日の値）→ F5 で更新する
    const layout = freeTab(
      row(
        pane(
          'watchlist',
          { list: 'favorites', cols: ['code', 'name', 'price.chgPct', 'holding.weight', 'asOf'], sort: { k: 'price.chgPct', dir: -1 } },
          3,
        ),
        col(pane('screener', { screenId: 'up' }, 4), pane('grid', { src: 'scr:up' }, 0)),
      ),
    )
    const favs = ['7203', '8058', '9434', '8306', '2914', '8001']
    const { page } = await start({
      now: '2026-11-16T18:00:00+09:00',
      settings: { autoUpdate: false },
      layout,
      user: {
        screens: SCREENS.map((x) => (x.id === 'up' ? { ...x, columns: ['star', 'code', 'name', 'price.chgPct', 'asOf'] } : x)),
        watchlists: watchlists({ favorites: favs }),
        holdings: holdings([
          { code: '7203', quantity: 100, avgCost: 2500 },
          { code: '8058', quantity: 100, avgCost: 2500 },
        ]),
        alerts: [alert('pnl', '7203', 'holding.pnlPct', '>=', -100)],
      },
    })
    const wl = widget(page, 'watchlist')
    const scr = widget(page, 'screener')
    const grid = widget(page, 'grid')
    await expect(rows(wl).first()).toContainText('2026/11/13')
    await expect(rows(scr).first()).toContainText('2026/11/13')

    await keys(page, 'F5')
    await expect(page.locator('footer')).toContainText('2026/11/16', { timeout: 20_000 })
    await expect(page.locator('footer')).toContainText(/待機/, { timeout: 20_000 })
    // 期待値は Core から（新しい日の値）
    const ms = await rpc<{ id: string; close: number; chgPct: number; asOf: string }[]>(page, 'metrics.get', {
      ids: favs.map((c) => `JP:${c}`),
    })
    expect(ms.every((m) => m.asOf === '2026-11-16')).toBe(true)
    const n = await screenCount(page, 'up')
    for (const r of await rows(wl).all()) await expect(r).toContainText('2026/11/16')
    for (const r of await rows(scr).all()) await expect(r).toContainText('2026/11/16')
    await expect(rows(scr)).toHaveCount(n)
    await expect(tiles(grid)).toHaveCount(n)
    // ウォッチリストは前日比の大きい順（同じ値は元の順）
    const chg = new Map(ms.map((m) => [m.id.slice(3), m.chgPct]))
    await expect.poll(async () => (await codes(wl)).map((c) => chg.get(c)!)).toEqual([...chg.values()].sort((a, b) => b - a))
    const close = (c: string) => ms.find((m) => m.id === `JP:${c}`)!.close
    const w = (close('7203') / (close('7203') + close('8058'))) * 100
    await expect(rows(wl).filter({ hasText: '7203' }).locator('td').nth(-2)).toHaveText(new RegExp(`^${w.toFixed(1).replace('.', '.')}`))
    const pnl = (close('7203') / 2500 - 1) * 100
    const now = Number((await alertNow(page, '7203')).replace(/[,%]/g, ''))
    expect(Math.abs(now - pnl)).toBeLessThan(0.1)
  })
})
