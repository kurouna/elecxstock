// ニュース（FR-NW1〜NW9。docs/design-news.md）。スタブのフィード（src/core/news/stub.ts。見出しはすべて架空）を、キーだけで操作する。
// クリップボードは main から読む。記事を開く操作は main の shell.openExternal を記録に差し替えて確かめる（ブラウザを開かない）
import type { ElectronApplication, Page } from '@playwright/test'
import { command, expect, focusPane, keys, recordToasts, rpc, tab, test, toastsSeen, type } from './support'

/** 答えた状態（取る）。既定オンは日銀・JPX・Bloomberg */
const ON = {
  enabled: true,
  interval: 10,
  feeds: {},
  acceptedDefaults: ['ja.jpxmkt', 'ja.jpxnews', 'ja.boj', 'en.bbgmkt', 'en.boj', 'en.jpx'],
}
const news = (page: Page) => page.locator('[data-widget="news"]')
const clip = (app: ElectronApplication) => app.evaluate(({ clipboard }) => clipboard.readText())
async function openNews(page: Page) {
  await tab(page, 'market')
  await focusPane(page, news(page))
}
async function recordOpen(app: ElectronApplication) {
  await app.evaluate(({ shell }) => {
    const g = globalThis as unknown as { __opened: string[] }
    g.__opened = []
    shell.openExternal = async (u: string) => {
      g.__opened.push(u)
    }
  })
}

test.describe.configure({ mode: 'serial' }) // クリップボードは PC で 1 つ

test.describe('ニュースのペイン（FR-NW1, FR-NW7, FR-NW8, FR-NW9）', () => {
  test('キーだけで選ぶ・タブ・絞り込み・開く（既読）', async ({ start }) => {
    const { app, page } = await start({ news: ON })
    await recordOpen(app)
    await openNews(page)
    const rows = news(page).locator('.row')
    await expect(rows.first()).toBeVisible()
    const n = await rows.count()
    expect(n).toBeGreaterThanOrEqual(8)
    // Bloomberg（英語）は日本語の表示でも既定でオン。要約は出さない・権利の表記
    await expect(news(page).locator('.row', { hasText: 'Asian stocks' }).locator('.tag')).toHaveText('英語')
    await keys(page, 'End')
    await expect(rows.nth(n - 1)).toHaveClass(/sel/)
    await keys(page, 'Home')
    await expect(rows.first()).toHaveClass(/sel/)
    await expect(news(page).locator('.detail')).toContainText('© Bloomberg L.P.')
    // タブ（G）: 全て → 市況。Shift+G で戻る
    await keys(page, 'g')
    await expect(news(page).getByRole('tab', { selected: true })).toContainText('市況')
    await expect(rows.filter({ hasNotText: 'fictional' })).toHaveCount(0)
    await keys(page, 'Shift+G')
    await expect(news(page).getByRole('tab', { selected: true })).toContainText('全て')
    // 絞り込み（/）: 出所の名前でも引ける。Esc で消す
    await keys(page, 'Slash')
    await type(page, '日銀')
    await expect(rows.locator('.src').filter({ hasNotText: '日銀' })).toHaveCount(0)
    await expect(rows).not.toHaveCount(0)
    await keys(page, 'Escape')
    await expect(rows).toHaveCount(n)
    // 絞り込みを消しても、選んでいた見出し（日銀の 1 件目）から動かない
    await expect(rows.nth(1)).toHaveClass(/sel/)
    await expect(rows.nth(1).locator('.src')).toHaveText('日銀')
    // Enter: ブラウザで開き、既読（文字を薄く）
    await keys(page, 'Enter')
    await expect
      .poll(() => app.evaluate(() => (globalThis as unknown as { __opened: string[] }).__opened))
      .toEqual([expect.stringMatching(/^https:\/\/www\.boj\.or\.jp\/fictional\//)])
    await expect(rows.nth(1)).toHaveClass(/read/)
  })

  test('Ctrl+C で選んだ見出し、Ctrl+Alt+C で表示中の見出しをコピーする。文字を選んでいれば選んだ文字', async ({ start }) => {
    const { app, page } = await start({ news: ON })
    await openNews(page)
    await expect(news(page).locator('.row').first()).toBeVisible()
    await recordToasts(page)
    await keys(page, 'Home', 'Control+c')
    await expect
      .poll(() => clip(app))
      .toMatch(
        /^Asian stocks edge lower .*\(fictional\)\nBloomberg Markets · 2026-11-13 17:55 JST\nhttps:\/\/www\.bloomberg\.com\/.+\n© Bloomberg L\.P\.$/,
      )
    // 要約を出さないフィード（Bloomberg）の要約はコピーにも入らない
    expect(await clip(app)).not.toContain('Not shown')
    await keys(page, 'Control+Alt+c')
    await expect.poll(() => clip(app)).toContain('11/13 17:55  BBG  Asian stocks edge lower')
    const all = await clip(app)
    expect(all).toContain('© Bloomberg L.P.')
    expect(all).not.toContain('https://')
    await expect.poll(() => toastsSeen(page)).toMatch(/コピーしました（\d+ 件）/)
    // 詳細の行の文字を選んでいるときは、選んだ文字をそのままコピーする（ペインのコピーにしない）
    await page.evaluate(() => {
      const el = document.querySelector('[data-widget="news"] .detail .nm')!
      const r = document.createRange()
      r.selectNodeContents(el)
      const s = window.getSelection()!
      s.removeAllRanges()
      s.addRange(r)
    })
    await keys(page, 'Control+c')
    await expect.poll(() => clip(app)).toBe('Bloomberg Markets')
  })

  test('FR-NW7 Ctrl+C はキーの設定で全体のアクションに割り当てられない', async ({ start }) => {
    const { page } = await start()
    await recordToasts(page)
    await keys(page, 'Control+Comma')
    await expect(page.getByRole('dialog', { name: '設定' })).toBeVisible()
    // 一般 → 表示 → チャート → データ → キー（↓）。Tab で検索の欄、↓ で一覧へ
    await keys(page, 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown')
    await expect(page.getByRole('dialog', { name: '設定' }).getByRole('tab', { selected: true })).toHaveText('キー')
    await keys(page, 'Tab', 'ArrowDown')
    await expect(page.locator('.keys .klist')).toBeFocused()
    await keys(page, 'Enter', 'Control+c')
    await expect.poll(() => toastsSeen(page)).toContain('Ctrl+C はニュースのペインのコピーに使うので割り当てられません')
  })
})

test.describe('見えている間だけ取る（FR-NW4, FR-NW8）', () => {
  test('別のタブに移ると次の巡回を止め、その時点を「ここまで見た」にする。戻ると予定を戻す', async ({ start }) => {
    const { page } = await start({ news: ON })
    type L = { seenAt: number; round: { last?: number; next?: number } }
    await openNews(page)
    await expect(news(page).locator('.row').first()).toBeVisible()
    await expect.poll(async () => (await rpc<L>(page, 'news.list')).round.next).toBeGreaterThan(0)
    const before = (await rpc<L>(page, 'news.list')).seenAt
    await tab(page, 'grid')
    await expect.poll(async () => (await rpc<L>(page, 'news.list')).round.next).toBeUndefined()
    expect((await rpc<L>(page, 'news.list')).seenAt).toBeGreaterThanOrEqual(before)
    await tab(page, 'market')
    await expect.poll(async () => (await rpc<L>(page, 'news.list')).round.next).toBeGreaterThan(0)
  })
})

test.describe('表示言語と未回答・オフの画面（FR-NW1, FR-NW3）', () => {
  test('表示言語を切り替えると、取得済みの言語へ戻ったときも一覧がすぐ変わる', async ({ start }) => {
    const { page } = await start({ news: ON })
    await openNews(page)
    const srcs = news(page).locator('.row .src')
    await expect(srcs.filter({ hasText: '日銀' }).first()).toBeVisible()
    await command(page, '言語を切り替え')
    // 英語の表示: 日銀（日本語）ではなく BOJ（英語）のフィード
    await expect(srcs.filter({ hasText: 'BOJ' }).first()).toBeVisible()
    await expect(srcs.filter({ hasText: '日銀' })).toHaveCount(0)
    await command(page, 'Switch language')
    await expect(srcs.filter({ hasText: '日銀' }).first()).toBeVisible()
    await expect(srcs.filter({ hasText: 'BOJ' })).toHaveCount(0)
  })

  test('未回答の画面の「取らない」で切り、オフの画面の「設定を開く」で設定のニュースのタブへ', async ({ start }) => {
    const { page } = await start({ news: { enabled: null, interval: 10, feeds: {}, acceptedDefaults: [] } })
    await openNews(page)
    const no = news(page).getByRole('button', { name: '取らない' })
    await no.focus() // ボタンは Tab で届く（ここでは Tab の回数に頼らない）
    await keys(page, 'Enter')
    await expect(news(page)).toContainText('ニュースは切っています。')
    expect((await rpc<{ state: string }>(page, 'news.list')).state).toBe('off')
    const open = news(page).getByRole('button', { name: /設定を開く/ })
    await open.focus()
    await keys(page, 'Enter')
    await expect(page.getByRole('dialog', { name: '設定' }).getByRole('tab', { selected: true })).toHaveText('ニュース')
  })
})

test.describe('取るか・切る・管理者の停止（FR-NW3, FR-NW4）', () => {
  test('答えるまで取らない（版を上げた利用者には一度だけ案内）。Enter で取り、N の設定で切ると通信しない', async ({ start }) => {
    const { page } = await start({ news: { enabled: null, interval: 10, feeds: {}, acceptedDefaults: [] } })
    // 既存の利用者（初回起動は済み）には、ペインを置けることを一度だけ案内する。マーケットのタブは自動では変えない
    await expect(page.locator('.toast')).toContainText('ニュースのペインを置けます')
    expect((await rpc<{ intro: boolean }>(page, 'news.list')).intro).toBe(false)
    await openNews(page)
    await expect(news(page)).toContainText('ニュースの見出しを取りますか。')
    const before = await rpc<{ state: string; round: { last?: number } }>(page, 'news.list')
    expect(before).toMatchObject({ state: 'unanswered', round: {} })
    expect(before.round.last).toBeUndefined()
    await keys(page, 'Enter')
    await expect(news(page).locator('.row').first()).toBeVisible()
    // N: 設定のニュースのタブ。取る / 取らない のスイッチは Tab で入り Space で切る
    await keys(page, 'n')
    const set = page.getByRole('dialog', { name: '設定' })
    await expect(set.getByRole('tab', { selected: true })).toHaveText('ニュース')
    await expect(set).toContainText('このアプリの通信先')
    await expect(set).toContainText('www.boj.or.jp')
    await keys(page, 'Tab')
    await expect(set.getByRole('switch', { name: 'ニュースの見出しを取る' })).toBeFocused()
    // 本文の Esc はタブへ戻る（もう一度で閉じる。docs/design-dialogs.md §6）
    await keys(page, 'Space', 'Escape', 'Escape')
    await expect(news(page)).toContainText('ニュースは切っています。')
    const off = await rpc<{ state: string; round: { last?: number; next?: number } }>(page, 'news.list')
    expect(off.state).toBe('off')
    expect(off.round.next).toBeUndefined()
    await keys(page, 'r')
    expect((await rpc<{ round: { last?: number } }>(page, 'news.list')).round.last).toBe(off.round.last)
  })

  test('管理者が止めているときは「管理者がニュースを切っています。」で、取れない', async ({ start }) => {
    const { page } = await start({ news: ON, env: { ELECXSTOCK_NEWS: 'off' } })
    await openNews(page)
    await expect(news(page)).toContainText('管理者がニュースを切っています。')
    expect((await rpc<{ state: string }>(page, 'news.list')).state).toBe('policy-off')
  })
})
