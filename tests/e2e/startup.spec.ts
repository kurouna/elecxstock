// 起動（§6.13 初回起動・FR-F1 中断と再開）。空の userData から始めるのはこのファイルだけ
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, jobsDone, keys, rpc, test } from './support'

test.describe('初回起動（FR-F1, FR-S1, FR-FR1）', () => {
  test('空の userData: 同意 → 取得を始める → 初回取得が終わる', async ({ launch }) => {
    const { page } = await launch({ fresh: true })
    const dlg = page.getByRole('dialog', { name: /elecxstock/ })
    await expect(dlg).toBeVisible()
    // 免責（投資助言ではない・非公式のデータ）を示してから同意を求める（FR-FR1）
    await expect(dlg).toContainText('投資助言を目的としたものではありません')
    await expect(dlg).toContainText('Yahoo Finance（非公式）')
    await expect(dlg.getByRole('button', { name: '同意して次へ' })).toBeVisible()
    await keys(page, 'Enter') // 同意
    await expect(dlg).toContainText('TradingView')
    // Lightweight Charts の NOTICE の 2 行（§10）
    await expect(dlg).toContainText('Copyright (с) 2025 TradingView, Inc. https://www.tradingview.com/')
    // ニュースを取るか（FR-NW3）。初期値は「取る」で、取得を始めると答えたことになる
    await expect(dlg.getByRole('button', { name: 'ニュースの見出しを取る' })).toHaveAttribute('aria-pressed', 'true')
    await keys(page, 'Enter') // 取得を始める
    await jobsDone(page)
    await expect(page.locator('footer')).toContainText(/待機/)
    const st = await rpc<{ instruments: number; withBars: number }>(page, 'data.status')
    expect(st.instruments).toBeGreaterThan(0)
    expect(st.withBars).toBe(st.instruments)
    expect((await rpc<{ state: string }>(page, 'news.list')).state).toBe('on')
  })

  test('初回の取得中に Ctrl+Shift+Q で閉じても、次の起動で続きから終わる', async ({ launch }) => {
    const first = await launch({ fresh: true })
    await expect(first.page.getByRole('dialog', { name: /elecxstock/ })).toBeVisible()
    await keys(first.page, 'Enter')
    await expect(first.page.getByRole('dialog').first()).toContainText('TradingView')
    await keys(first.page, 'Enter') // 同意 → 取得を始める
    await expect.poll(async () => (await rpc<{ kind: string }[]>(first.page, 'jobs.list')).length).toBeGreaterThan(0)
    const exited = new Promise<void>((r) => first.app.process().once('exit', () => r()))
    await first.page.keyboard.press('Control+Shift+q').catch(() => {}) // 押した直後に窓が閉じる
    await exited

    // Core は止めてから終わった（強制終了ではない）
    const logs = join(first.userData, 'data', 'logs')
    const core = readdirSync(logs).filter((f) => f.startsWith('core-'))
    expect(core.map((f) => readFileSync(join(logs, f), 'utf8')).join('\n')).toContain('core shutdown')
    // 強制終了に頼っていない（Core が閉じ終えた知らせで main が進む。重い PC でプロセスが消えるのを待たない）
    const main = readdirSync(logs).filter((f) => f.startsWith('main-'))
    expect(main.map((f) => readFileSync(join(logs, f), 'utf8')).join('\n')).not.toContain('did not stop in time')

    const { page } = await launch({ userData: first.userData })
    // 同意は済んでいるので初回のダイアログは出ず、取得の続きが終わる
    await jobsDone(page)
    await expect(page.locator('footer')).toContainText(/待機/)
    await expect(page.getByRole('dialog', { name: /elecxstock/ })).toHaveCount(0)
    await expect
      .poll(async () => (await rpc<{ kind: string; status: string }[]>(page, 'jobs.list')).filter((j) => j.kind === 'initial'))
      .toEqual([expect.objectContaining({ status: 'done' })])
    const st = await rpc<{ instruments: number; withBars: number }>(page, 'data.status')
    expect(st.withBars).toBe(st.instruments)
  })
})

test.describe('種からの起動（§3.1）', () => {
  test('基準日時で起動し、初回のダイアログは出ない', async ({ start }) => {
    const { page } = await start()
    await expect(page.getByRole('dialog', { name: /elecxstock/ })).toHaveCount(0)
    expect(await page.evaluate(() => new Date().toISOString().slice(0, 10))).toBe('2026-11-13')
    await expect(page.locator('.presets [aria-current="true"]')).toContainText('MTF')
  })
})

test.describe('起動の最初の色（NFR-Q3, FR-V8）', () => {
  test('ライトテーマで保存していれば、窓の地とページの最初の描画からライトの色で出る（一度黒くならない）', async ({ start }) => {
    const { app, page } = await start({ settings: { theme: 'light' } })
    // main は窓を作る前に保存した設定を読み、preload が renderer に渡す（設定を Core から読むより前に当てる）
    expect(await page.evaluate(() => (window as unknown as { elecxstock: { initialTheme?: string } }).elecxstock.initialTheme)).toBe(
      'light',
    )
    const bg = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getBackgroundColor())
    expect(bg.toLowerCase()).toBe('#e9ecf0')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  })
  test('ダーク（既定）なら、これまでどおり暗い色で出る', async ({ start }) => {
    const { page } = await start()
    expect(await page.evaluate(() => (window as unknown as { elecxstock: { initialTheme?: string } }).elecxstock.initialTheme)).toBe('dark')
  })
})
