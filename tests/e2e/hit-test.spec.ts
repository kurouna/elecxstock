// 重なり・当たり判定（docs/test-plan.md §8.2, NFR-Q2, FR-V11）: WIDGETS のすべてのペインを、空の状態（空のウォッチリスト・保有なし・0 件のスクリーン）と
// 通常の状態で並べ、見えていて有効なボタン・タブ・条件の行が、ほかの要素（空の知らせ・帯・ドロワーなど）にふさがれていないかを
// `click({ trial: true })` で確かめる（押さない。Playwright の当たり判定だけを使う）。
// ペインの一覧は src/renderer/stores/layout.svelte.ts の WIDGETS から読む（ペインを足すと自動で対象になる）
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { col, expect, freeTab, holdings, type Launched, type LaunchOpts, pane, row, TEST_NOW, test, watchlists } from './support'
import { ROOT } from './support/launch'

const WIDGETS = (() => {
  const src = readFileSync(join(ROOT, 'src/renderer/stores/layout.svelte.ts'), 'utf8')
  const body = src.match(/export const WIDGETS: WidgetId\[\] = \[([^\]]*)\]/)?.[1]
  if (!body) throw new Error('WIDGETS が見つからない')
  return [...body.matchAll(/'([a-z]+)'/g)].map((m) => m[1]!)
})()

const NOW_MS = Date.parse(TEST_NOW)
const STATES = {
  空: {
    user: {
      watchlists: watchlists(),
      holdings: [],
      screens: [
        {
          id: 'none',
          name: { ja: '0 件', en: 'none' },
          conditions: [{ field: 'income.yield', op: '>=', value: 1000 }],
          created: NOW_MS,
          updated: NOW_MS,
        },
      ],
    },
  },
  通常: {
    user: {
      watchlists: watchlists({ favorites: ['7203', '8058', '9434'], candidates: ['8306'], income: ['8951', '2914'], watch: ['8001'] }),
      holdings: holdings([
        { code: '7203', quantity: 100, avgCost: 2500 },
        { code: '8058', quantity: 200, avgCost: 3000 },
      ]),
    },
  },
} satisfies Record<string, LaunchOpts>

/** 4 枚ずつ 2 列 × 2 段に並べる。どのペインも最初のスクリーン・お気に入り・リンク 1 */
function layoutOf(ws: string[]) {
  const p = (w: string) => pane(w, w === 'grid' ? { src: 'live' } : {}, 1)
  const cols = []
  for (let i = 0; i < ws.length; i += 2) cols.push(ws[i + 1] ? col(p(ws[i]!), p(ws[i + 1]!)) : p(ws[i]!))
  return freeTab(row(...cols))
}

/** ふさがれている操作の要素（ペインの名前・要素の説明）を集める。checked はペインごとに確かめた数（0 なら何も確かめていない） */
async function blocked(page: Page): Promise<{ blocked: string[]; checked: Record<string, number> }> {
  const out: string[] = []
  const checked: Record<string, number> = {}
  // まず画面の中で、要素の中心にある要素がその要素（か子）かを一度に調べる。そうでないもの（画面の外にあるものを含む）だけを
  // Playwright の trial のクリック（スクロールして当たり判定を待つ）で確かめ直す
  const SEL = 'button:enabled, [role="tab"], .cond'
  const suspect = await page.evaluate((sel) => {
    const res: { pane: number; idx: number; widget: string }[] = []
    const counts: Record<string, number> = {}
    document.querySelectorAll('.main [data-pane-id]').forEach((p, pi) => {
      const w = p.getAttribute('data-widget') ?? '?'
      const els = [...p.querySelectorAll<HTMLElement>(sel)].filter((e) => e.checkVisibility() && e.getClientRects().length > 0)
      els.forEach((e, i) => {
        counts[w] = (counts[w] ?? 0) + 1
        const r = e.getBoundingClientRect()
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        if (!hit || !(hit === e || e.contains(hit))) res.push({ pane: pi, idx: i, widget: w })
      })
    })
    return { res, counts }
  }, SEL)
  Object.assign(checked, suspect.counts)
  const panes = page.locator('.main [data-pane-id]')
  for (const s of suspect.res) {
    {
      const w = s.widget
      const t = panes.nth(s.pane).locator(SEL).filter({ visible: true }).nth(s.idx)
      const ok = await t
        .click({ trial: true, timeout: 1000 })
        .then(() => true)
        .catch(() => false)
      if (ok) continue
      if (!(await t.isVisible()) || !(await t.isEnabled())) continue // 押せる状態から変わった（再描画）
      const name = (await t.getAttribute('aria-label')) ?? (await t.getAttribute('title')) ?? (await t.textContent())?.trim().slice(0, 20)
      out.push(`${w}: ${name}`)
    }
  }
  return { blocked: out, checked }
}

for (const [state, opts] of Object.entries(STATES)) {
  for (let i = 0; i < WIDGETS.length; i += 4) {
    const ws = WIDGETS.slice(i, i + 4)
    test(`重なり（§8.2, NFR-Q2, FR-V11）: ${state}の状態で、ペイン（${ws.join('・')}）の操作の要素がふさがれていない`, async ({
      start,
    }) => {
      const { page }: Launched = await start({ ...opts, layout: layoutOf(ws) })
      await expect(page.locator('.main [data-pane-id]')).toHaveCount(ws.length)
      for (const w of ws) await expect(page.locator(`.main [data-widget="${w}"]`)).toBeVisible()
      // 遅れて届くもの（スクリーンの結果・指標）を待つ: 一覧の行か空の知らせが出るまで
      if (ws.includes('screener')) await expect(page.locator('[data-widget="screener"]').locator('tbody tr, .state').first()).toBeVisible()
      const r = await blocked(page)
      // 描き直しの途中（結果が届いて行が入れ替わる・トーストが消える）に重なったものは数えない: 0.5 秒あけて 2 回ともふさがれたものだけ
      let still = r.blocked
      if (still.length) {
        await page.waitForTimeout(500)
        const again = (await blocked(page)).blocked
        still = still.filter((x) => again.includes(x))
      }
      expect(still).toEqual([])
      for (const w of ws) expect(r.checked[w], `${w} の操作の要素`).toBeGreaterThan(0) // 見出しの ✕ などは必ずある
    })
  }
}

test('重なり（§8.2）: 確かめ方は、上に重なった要素を見つける', async ({ start }) => {
  const { page } = await start()
  const first = page.locator('.main [data-pane-id]').first()
  expect((await blocked(page)).blocked).toEqual([])
  // 1 枚目のペインの「閉じる」ボタンの上に、透明な板を重ねる（空の知らせが条件をふさいだのと同じ形）
  await first.getByRole('button', { name: 'ペインを閉じる' }).evaluate((el) => {
    const r = el.getBoundingClientRect()
    const d = document.createElement('div')
    Object.assign(d.style, {
      position: 'fixed',
      left: `${r.left}px`,
      top: `${r.top}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
      zIndex: '9999',
    })
    document.body.appendChild(d)
  })
  expect((await blocked(page)).blocked).toEqual([expect.stringContaining('ペインを閉じる')])
})

test('重なり（§8.2）: WIDGETS を読めている', () => {
  expect(WIDGETS.length).toBeGreaterThanOrEqual(12)
  expect(WIDGETS).toContain('screener')
})
