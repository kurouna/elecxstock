// よく使う操作（キーボードだけ）
import { expect, type Page } from '@playwright/test'
import { codeKeys, keys, type } from './keys'

/** タブ（プリセット）を Ctrl+Shift+数字で開く。開いたタブの名前を確かめる */
export const TABS = {
  market: { n: 1, ja: 'マーケット', en: 'Market' },
  screener: { n: 2, ja: 'スクリーナー', en: 'Screener' },
  grid: { n: 3, ja: 'グリッド', en: 'Grid' },
  mtf: { n: 4, ja: 'MTF', en: 'MTF' },
  triple: { n: 5, ja: 'トリプル', en: 'Triple' },
  income: { n: 6, ja: 'インカム', en: 'Income' },
  holdings: { n: 7, ja: '保有', en: 'Holdings' },
  free: { n: 8, ja: 'マイレイアウト', en: 'Pages' },
  folio: { n: 9, ja: 'ポートフォリオ', en: 'Portfolio' },
} as const
export type Tab = keyof typeof TABS

export async function tab(page: Page, t: Tab, lang: 'ja' | 'en' = 'ja'): Promise<void> {
  // マイレイアウトにいるときにもう一度押すとページのメニューが開く（FR-L14）ので、すでにそのタブなら押さない
  const cur = await page.locator('.presets [aria-current="true"]').getAttribute('data-preset')
  if (cur !== t || t !== 'free') await keys(page, `Control+Shift+Digit${TABS[t].n}`)
  await expect(page.locator('.presets [aria-current="true"]')).toContainText(TABS[t][lang])
  // 中身が入ってくる動き（16px・200ms）の途中に矩形を読むテストがずれないよう、終わるまで待つ
  await motionDone(page)
}

/** 銘柄ジャンプでコードを打ち、選んでいる候補がその銘柄になるまで待つ（打った数字は候補より先に出るので、候補の行で確かめる） */
export async function typeJump(page: Page, code: string, expectText?: string | RegExp): Promise<void> {
  await keys(page, ...codeKeys(code))
  const sel = page.locator('.dialog.jump .it.sel')
  await expect(sel.locator('.c')).toHaveText(code)
  if (expectText) await expect(sel).toContainText(expectText)
}
/** 銘柄ジャンプ: コードを打ち、候補が出てから Enter（フォーカスのあるペインに出す） */
export async function jump(page: Page, code: string, expectText?: string | RegExp): Promise<void> {
  await typeJump(page, code, expectText)
  await keys(page, 'Enter')
  await expect(page.locator('.dialog.jump')).toHaveCount(0)
}

/** コマンドバー（Ctrl+K）で打って、選んだ行が text を含んでから Enter */
export async function command(page: Page, text: string, sel: string | RegExp = text): Promise<void> {
  await keys(page, 'Control+k')
  await expect(page.locator('.dialog.palette')).toBeVisible()
  await type(page, text)
  await expect(page.locator('.dialog.palette .it.sel')).toContainText(sel)
  await keys(page, 'Enter')
}

/** C キーの「代わりに表示する銘柄」で、選んでいる行が code になってから決める */
export async function replaceSymbol(page: Page, code: string): Promise<void> {
  const pal = page.locator('.dialog.palette')
  await expect(pal).toContainText('の代わりに表示する銘柄')
  await type(page, code)
  await expect(pal.locator('.it.sel')).toContainText(code)
  await keys(page, 'Enter')
  await expect(pal).toHaveCount(0)
}

/** フォーカスのあるペイン */
export const focused = (page: Page) => page.locator('.pane.focused').first()

/** 窓口（window.elecxstock.call）。状態の確かめと、OS のダイアログを通る取り込みの代わりにだけ使う */
export const rpc = <T = unknown>(page: Page, method: string, params: unknown = {}) =>
  page.evaluate(
    ([m, p]) =>
      (window as unknown as { elecxstock: { call: (m: string, p: unknown) => Promise<unknown> } }).elecxstock.call(m as string, p),
    [method, params] as const,
  ) as Promise<T>

/**
 * ジョブがすべて終わるまで待つ（1 つ以上あって、どれも終わっている）。状態の帯の「待機中」は、ジョブを積む前にも出るので使わない
 */
export async function jobsDone(page: Page, timeout = 20_000): Promise<void> {
  await expect
    .poll(
      async () => {
        const js = await rpc<{ status: string }[]>(page, 'jobs.list')
        return js.length > 0 && js.every((j) => j.status === 'done' || j.status === 'failed' || j.status === 'cancelled')
      },
      { timeout },
    )
    .toBe(true)
}

export type HoldingIn = { code: string; account?: string; quantity: number; avgCost: number }
/**
 * 保有の記録（holdings.json の中身）。起動の前に書く（launch の user.holdings）。
 * 窓口から portfolio.applyCsv を呼ぶと、同じ窓の変更として user.changed が無視され画面が読み直さないので使わない
 */
export const holdings = (hs: HoldingIn[]) => hs.map((h) => ({ account: 'tokutei', broker: 'rakuten', ...h }))

/** 既定の 4 つのウォッチリスト（userstore の defaultWatchlists と同じ形）に銘柄を入れたもの。コードは 'JP:' を付けずに渡す */
export function watchlists(items: Partial<Record<'favorites' | 'candidates' | 'income' | 'watch', string[]>> = {}) {
  const ids = (k: keyof typeof items) => (items[k] ?? []).map((c) => `JP:${c}`)
  return [
    { id: 'favorites', builtin: 'favorites', name: { ja: '★お気に入り', en: '★ Favorites' }, items: ids('favorites') },
    { id: 'candidates', builtin: 'candidates', name: { ja: '◆売買候補', en: '◆ Candidates' }, items: ids('candidates') },
    { id: 'income', name: { ja: '高配当', en: 'High yield' }, items: ids('income') },
    { id: 'watch', name: { ja: '監視', en: 'Watch' }, items: ids('watch') },
  ]
}

/** F6 でペインを順に巡り、target にフォーカスを置く（マウスを使わない） */
export async function focusPane(page: Page, target: import('@playwright/test').Locator): Promise<void> {
  for (let i = 0; i < 16; i++) {
    if (await target.evaluate((e) => e.classList.contains('focused'))) return
    await keys(page, 'F6')
  }
  await expect(target).toHaveClass(/focused/)
}

/**
 * トーストの文言を記録し始める（トーストは 2 秒ほどで消えるので、負荷の高いときに expect が間に合わないことがある）。
 * toastsSeen で、記録を始めてから出た文言を読む
 */
export const recordToasts = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __toasts?: string[] }
    w.__toasts = []
    const box = document.querySelector('.toasts') ?? document.body
    new MutationObserver(() => {
      for (const el of document.querySelectorAll('.toasts > *')) {
        const t = el.textContent?.trim()
        if (t && !w.__toasts!.includes(t)) w.__toasts!.push(t)
      }
    }).observe(box, { childList: true, subtree: true, characterData: true })
  })
export const toastsSeen = (page: Page) => page.evaluate(() => ((window as unknown as { __toasts?: string[] }).__toasts ?? []).join('\n'))

/** ペインの最大化・戻す（'pane-max'・'pane-max-lift'）とタブの中身（'view-in'）の動き（lib/paneMax.ts）が終わるまで待つ（固定の待ちを使わない。docs/design-motion.md） */
export async function motionDone(page: Page): Promise<void> {
  await page.waitForFunction(() => !document.getAnimations().some((a) => ['pane-max', 'pane-max-lift', 'view-in'].includes(a.id)))
}
