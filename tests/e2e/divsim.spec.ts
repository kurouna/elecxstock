// 配当シミュレータ（FR-SIM1〜SIM10。docs/design-simulator.md）: スクリーナーのタブの右下にリンク 2 で置き、
// スクリーナーの結果を仮想の銘柄群として計算する。キーボードだけで操作する。値はスタブ（架空）
import type { Page } from '@playwright/test'
import { expect, focusPane, holdings, jump, keys, pane, rpc, tab, test, watchlists } from './support'

const sim = (page: Page) => page.locator('[data-widget="divsim"]')

/** スクリーナーのタブを開き、右下の配当シミュレータへフォーカスを移して、最初の計算が終わるまで待つ。group なら O で群へ切り替える */
async function openSim(page: Page, scope: 'one' | 'group' = 'group') {
  // 開く前から読み込み中の回数を数える（最初の計算と、取得の完了での 1 回の計算し直しを待つため）
  const loads = await countLoads(page, '__simOpen')
  await tab(page, 'screener')
  const s = sim(page)
  await expect(s).toHaveCount(1)
  await keys(page, 'Alt+ArrowRight', 'Alt+ArrowRight', 'Alt+ArrowDown')
  await expect(s).toHaveClass(/focused/)
  await expect(s.getByTestId('sim-past')).toBeVisible({ timeout: 15_000 })
  // 最初の取得（月次系列など）が終わってから進める（取得の完了で 1 回計算し直すので、読み込み中のキーの扱いとぶつからないように）
  await expect
    .poll(() =>
      rpc<{ status: string }[]>(page, 'jobs.list').then((js) => js.every((j) => ['done', 'failed', 'cancelled'].includes(j.status))),
    )
    .toBe(true)
  // 最初の計算で月次系列の取得を頼んだら（refetch）、その完了の知らせ（少し遅れて届く）で 1 回計算し直すので、それも待つ
  const refetched = (await rpc<{ kind: string }[]>(page, 'jobs.list')).some((j) => j.kind === 'refetch')
  await expect.poll(loads).toBeGreaterThanOrEqual(refetched ? 2 : 1)
  await expect(s.getByTestId('sim-loading')).toHaveCount(0)
  if (scope === 'group') await toGroup(page)
  return s
}
/** O で 1 銘柄 → 群 */
async function toGroup(page: Page) {
  const s = sim(page)
  await keys(page, 'o')
  await expect(s.locator('[data-card="table"]')).toBeVisible()
  await expect(s.getByTestId('sim-loading')).toHaveCount(0)
}

test.describe('配当シミュレータ（FR-SIM1・SIM2・SIM5・SIM7・SIM9）', () => {
  test('スクリーナーのタブの右下にリンク 2 で置かれ、計算のたびに読み込み中を出してから全部を出す', async ({ start }) => {
    const { page } = await start()
    const s = await openSim(page)
    await expect(s.locator('.link')).toHaveText('2')
    await expect(s.getByTestId('sim-wealth')).toHaveText(/\d/)
    await expect(s.getByTestId('sim-basis')).toContainText('今上場している銘柄だけです')
    await expect(s.getByTestId('sim-disclaimer')).toContainText('投資助言ではありません。')
    // 超過分の分解と偶然との比較（群のとき）
    await expect(s.getByTestId('sim-wf')).toContainText('業種の配分')
    await expect(s.getByTestId('sim-luck')).toContainText('下から')
    // 設定を変える（R: 受け取る → 再投資）と、読み込み中を出してから計算し直す
    const before = await s.getByTestId('sim-wealth').textContent()
    await keys(page, 'r')
    await expect(s.getByTestId('sim-loading')).toBeVisible()
    await expect(s.getByTestId('sim-disclaimer')).toBeVisible()
    await expect(s.getByTestId('sim-past')).toBeVisible()
    await expect(s.locator('.cfg')).toContainText('再投資')
    await expect(s.getByTestId('sim-wealth')).not.toHaveText(before ?? '')
    // Alt+1 で基準日 1 年前
    await keys(page, 'Alt+Digit1')
    await expect(s.locator('.cfg')).toContainText('1 年前')
    await expect(s.getByTestId('sim-past')).toBeVisible()
    await expect(s.locator('.c-hero h3')).toContainText('1 年前に')
  })
})

/** 読み込み中が出た回数を数え始める（一瞬でも出たら数える。expect の待ち合わせで見逃さない） */
async function countLoads(page: Page, name = '__simLoads') {
  await page.evaluate((name) => {
    const w = window as unknown as Record<string, number>
    w[name] = 0
    let shown = false
    new MutationObserver(() => {
      const now = !!document.querySelector('[data-testid="sim-loading"]')
      if (now && !shown) w[name]!++
      shown = now
    }).observe(document.body, { subtree: true, childList: true })
  }, name)
  return () => page.evaluate((name) => (window as unknown as Record<string, number>)[name] ?? 0, name)
}

test.describe('表示の切り替えでは計算し直さない（FR-SIM7）', () => {
  test('B・P・V・PgDn・PgUp・S では読み込み中を一度も出さず、選んだ銘柄も動かない', async ({ start }) => {
    const { page } = await start()
    // 開く前から数える。最初の計算で月次系列の無い銘柄（1306 など）の取得を頼むと、その取得の完了で 1 回だけ計算し直す（正しい動き）
    const loads = await countLoads(page)
    const s = await openSim(page, 'one')
    await expect
      .poll(() =>
        rpc<{ status: string }[]>(page, 'jobs.list').then((js) => js.every((j) => ['done', 'failed', 'cancelled'].includes(j.status))),
      )
      .toBe(true)
    const refetched = (await rpc<{ kind: string }[]>(page, 'jobs.list')).some((j) => j.kind === 'refetch')
    await expect.poll(loads).toBe(refetched ? 2 : 1)
    await expect(s.getByTestId('sim-loading')).toHaveCount(0)
    await expect(s.getByTestId('sim-past')).toBeVisible()
    await toGroup(page)
    const base = await loads()
    await keys(page, 'ArrowDown', 'ArrowDown')
    const id = await s.locator('tbody tr.sel').getAttribute('data-id')
    await keys(page, 'b')
    await expect(s.locator('.cfg')).toContainText('比べる 1306')
    await keys(page, 'p')
    await expect(s.locator('.c-hist .tok').last()).toHaveText('%')
    await expect(s.locator('tbody tr.sel')).toHaveAttribute('data-id', id!)
    // 表を選んでいる間の PgDn は行を送るので、Esc でカードの選択を外してからタブを替える
    await keys(page, 'Escape', 'PageDown')
    await expect(s.getByTestId('sim-fwd')).toBeVisible()
    await keys(page, 'v', 'PageUp')
    await expect(s.getByTestId('sim-past')).toBeVisible()
    expect(await loads()).toBe(base)
    // 計算し直す入力（X: 税）では 1 回だけ出す
    await keys(page, 'x')
    await expect(s.locator('.cfg')).toContainText('税引前')
    await expect(s.getByTestId('sim-past')).toBeVisible()
    expect(await loads()).toBe(base + 1)
  })
})

test.describe('配当シミュレータのキー操作（FR-SIM3・SIM4・SIM6）', () => {
  test('B で比べる相手、PgDn でこれから、V で受取の目安 ⇔ 権利確定月、表の行の Enter でリンク先の銘柄が変わる', async ({ start }) => {
    const { page } = await start()
    const s = await openSim(page)
    await expect(s.locator('.cfg')).toContainText('1306 と同業種')
    // 最大化では入力が変わらないので計算し直さない（読み込み中を出さない）
    await keys(page, 'Control+Shift+Enter')
    await expect(s).toHaveClass(/maxed/)
    await expect(s.getByTestId('sim-past')).toBeVisible()
    await expect(s.getByTestId('sim-loading')).toHaveCount(0)
    await keys(page, 'b')
    await expect(s.locator('.cfg')).toContainText('比べる 1306')
    // 比べる相手は計算し直さない（読み込み中を出さない）
    await expect(s.getByTestId('sim-loading')).toHaveCount(0)
    await keys(page, 'PageDown')
    await expect(s.getByTestId('sim-fwd')).toBeVisible()
    await expect(s.getByTestId('sim-y1')).toHaveText(/\d/)
    // 年ごとの見込みは累計を 1 つの軸で。元本が遠ければ線を引かず、届く年数を文で出す
    await expect(s.getByTestId('sim-fy')).toBeVisible()
    await expect(s.locator('.c-fy h3')).toContainText('累計')
    await expect(s.getByTestId('sim-fy-note')).toContainText('元本')
    // 年を選ぶと、その年・累計をツールチップに出す（選ぶ前は出さない）
    await expect(s.getByTestId('sim-fy-read')).toBeHidden()
    await keys(page, 'Tab', 'Tab')
    await expect(s.locator('[data-card="fy"]')).toHaveClass(/sel/)
    await keys(page, 'ArrowRight', 'ArrowRight')
    await expect(s.getByTestId('sim-fy-read')).toContainText('2 年目')
    await expect(s.getByTestId('sim-fy-read')).toContainText('その年の配当')
    // 帯（10〜90%）: 凡例とツールチップ
    await expect(s.locator('.c-fy h3')).toContainText('帯（10〜90%）')
    await expect(s.getByTestId('sim-fy-read')).toContainText('10〜90%')
    // 減配への感応度（群のとき）と、目標の配当（未設定なら設定の案内）
    await expect(s.getByTestId('sim-sens').locator('li').first()).toBeVisible()
    await expect(s.getByTestId('sim-goal')).toContainText('配当の目標')
    await expect(s.getByTestId('sim-fy-read')).toContainText('累計')
    await keys(page, 'Escape', 'Escape')
    await expect(s.locator('.c-cal h3')).toContainText('受取の目安')
    await keys(page, 'v')
    await expect(s.locator('.c-cal h3')).toContainText('権利確定月')
    // 表の行: ↓ で選び、Enter で同じリンク色の銘柄情報に出す
    await keys(page, 'ArrowDown')
    const id = await s.locator('tbody tr.sel').getAttribute('data-id')
    expect(id).toBeTruthy()
    // ↓ で行を動かすだけでは最大化を解かない（表を見ている途中で画面が替わらない）
    await expect(s).toHaveClass(/maxed/)
    // 最大化したまま Enter: 最大化を解いてから送る（チャート・銘柄情報が見えるように。FR-L3）
    await expect(s.getByTestId('sim-loading')).toHaveCount(0)
    await keys(page, 'Enter')
    await expect(s).not.toHaveClass(/maxed/)
    await expect(page.locator('[data-widget="info"]').first()).toBeVisible()
    await expect(page.locator('[data-widget="info"]').first()).toContainText(id!.replace('JP:', ''))
    await expect(page.locator('[data-widget="chart"]').first()).toContainText(id!.replace('JP:', ''))
    // 並べ替えの名前を見出しに出す（狭い幅で列が隠れても何順か分かる）
    await expect(s.getByTestId('sim-sort')).toContainText('1 年目')
    await keys(page, 's')
    await expect(s.getByTestId('sim-sort')).toContainText('利回り')
    // N で前提のカードを選ぶ
    await keys(page, 'n')
    await expect(s.locator('[data-card="basis"]')).toHaveClass(/sel/)
    await expect(s.getByTestId('sim-basis')).toContainText('予想ではありません')
  })
})

test.describe('1 銘柄のシミュレーション（FR-SIM10）', () => {
  test('既定は 1 銘柄でリンク色の銘柄を計算し、表は出さない。スクリーナーの行を動かすと計算し直し、O で群へ切り替える', async ({
    start,
  }) => {
    const { page } = await start()
    const s = await openSim(page, 'one')
    const one = s.getByTestId('sim-one')
    await expect(one).toBeVisible()
    await expect(s.locator('.cfg .scope [aria-checked="true"]')).toContainText('1 銘柄')
    await expect(s.locator('[data-card="table"]')).toHaveCount(0)
    // ヒーローに 1 銘柄の値（取得単価・同業種の順位）
    await expect(s.locator('.c-hero')).toContainText('取得単価')
    await expect(s.locator('.c-hero')).toContainText('業種順位')
    const code0 = (await one.textContent())!.trim().slice(0, 4)
    await expect(page.locator('[data-widget="info"]').first()).toContainText(code0)
    // スクリーナーの行を ↓ で動かすと、その銘柄で計算し直す
    await keys(page, 'Alt+ArrowUp', 'Alt+ArrowLeft', 'Alt+ArrowLeft')
    await expect(page.locator('[data-widget="screener"]')).toHaveClass(/focused/)
    await keys(page, 'ArrowDown')
    await expect(one).not.toContainText(code0)
    const code1 = (await one.textContent())!.trim().slice(0, 4)
    await expect(page.locator('[data-widget="info"]').first()).toContainText(code1)
    await expect(s.getByTestId('sim-past')).toBeVisible()
    // これからのタブも 1 銘柄（1 株配当・ストレスの前年比をヒーローに）
    await keys(page, 'Alt+ArrowRight', 'Alt+ArrowRight', 'Alt+ArrowDown')
    await expect(s).toHaveClass(/focused/)
    await keys(page, 'PageDown')
    await expect(s.getByTestId('sim-fwd')).toBeVisible()
    await expect(s.locator('.c-hero')).toContainText('1 株配当')
    // O で群へ。表が出て、帯は出どころの銘柄数
    await toGroup(page)
    await expect(s.getByTestId('sim-one')).toHaveCount(0)
    await expect(s.locator('.cfg')).toContainText('銘柄へ均等に')
  })
})

test.describe('1 銘柄のときの操作（FR-SIM10。レビューの反映）', () => {
  test('Tab は表の無い 4 枚を巡る。L・S は受けない。銘柄名の語は押せず、見出しに全文の title。ストレスは 1 か所', async ({ start }) => {
    const { page } = await start()
    const s = await openSim(page, 'one')
    for (let i = 0; i < 5; i++) {
      await keys(page, 'Tab')
      await expect(s.locator('[data-card].sel')).toHaveCount(1)
    }
    await keys(page, 'Shift+Tab')
    await expect(s.locator('[data-card].sel')).toHaveCount(1)
    await keys(page, 'l')
    await expect(page.locator('.dialog')).toHaveCount(0)
    const name = (await s.getByTestId('sim-one').textContent())!.trim()
    await expect(s.getByTestId('sim-one')).toHaveAttribute('title', name)
    await expect(s.locator('.cfg button', { hasText: name })).toHaveCount(0)
    await expect(s.locator('.cfg .oneName')).toHaveText(name)
    await keys(page, 'PageDown')
    await expect(s.getByTestId('sim-fwd')).toBeVisible()
    await expect(s.locator('.c-hero dt', { hasText: '減配シナリオ' })).toHaveCount(1)
  })
})

test.describe('保有を出どころに（FR-SIM11）', () => {
  const HOLD = holdings([
    { code: '8058', account: 'nisa_growth', quantity: 100, avgCost: 11000 },
    { code: '8058', quantity: 50, avgCost: 11000 },
    { code: '8951', quantity: 2, avgCost: 95000 },
  ])
  test('L で保有を選ぶと、これからは実際の株数で計算し、プライバシーモードでは金額を隠す', async ({ start }) => {
    const { page } = await start({ user: { holdings: HOLD } })
    const s = await openSim(page)
    await keys(page, 'l')
    const dlg = page.locator('.dialog')
    await expect(dlg).toContainText('保有')
    await keys(page, 'ArrowDown')
    await expect(dlg.locator('.it.sel')).toContainText('保有')
    await keys(page, 'Enter')
    await expect(dlg).toHaveCount(0)
    await expect(s.getByTestId('sim-past')).toBeVisible()
    await expect(s.locator('.src')).toContainText('保有 · 2 銘柄')
    await keys(page, 'PageDown')
    await expect(s.getByTestId('sim-fwd')).toBeVisible()
    await expect(s.locator('.cfg')).toContainText('今の保有')
    // 保有のこれからのヒーローは「今の保有なら」（「今 ○○ を入れたら」ではない）
    await expect(s.locator('.c-hero h3')).toContainText('今の保有')
    await expect(s.locator('.c-hero')).toContainText('評価額に対する利回り')
    // 帯の保有の語を押すと出どころの一覧
    await s.locator('.cfg .sent button.tok', { hasText: '銘柄' }).click()
    await expect(page.locator('.dialog')).toContainText('出どころを選ぶ')
    await keys(page, 'Escape')
    await expect(page.locator('.dialog')).toHaveCount(0)
    // これからに効かないキー（X・A・R・G）は受けない: 読み込み中を出さない
    const loads = await countLoads(page)
    await keys(page, 'x', 'r', 'g')
    await expect(s.locator('.cfg')).toContainText('税は口座ごと')
    expect(await loads()).toBe(0)
    await keys(page, 'a')
    await expect(page.locator('.dialog')).toHaveCount(0)
    await expect(s.getByTestId('sim-basis')).toContainText('今の株数と口座ごとの税')
    await expect(s.locator('tbody tr[data-id="JP:8058"] td.c-shares')).toHaveText('150.0')
    await expect(s.getByTestId('sim-y1')).toHaveText(/\d/)
    await keys(page, 'Control+Shift+H')
    await expect(s.getByTestId('sim-y1')).toContainText('****')
  })
})

test.describe('銘柄ジャンプで 1 銘柄へ（FR-SIM10）', () => {
  test('群を出しているときに銘柄ジャンプで選ぶと、1 銘柄に切り替えてその銘柄を計算する。チャート・銘柄情報も同じ銘柄', async ({
    start,
  }) => {
    const { page } = await start()
    const s = await openSim(page)
    await expect(s.locator('[data-card="table"]')).toBeVisible()
    await jump(page, '8316')
    await expect(s.getByTestId('sim-one')).toContainText('8316')
    await expect(s.locator('.cfg .scope [aria-checked="true"]')).toContainText('1 銘柄')
    await expect(s.getByTestId('sim-past')).toBeVisible()
    await expect(s.locator('[data-card="table"]')).toHaveCount(0)
    await expect(page.locator('[data-widget="info"]').first()).toContainText('8316')
    // 1 銘柄のまま別の銘柄へジャンプしても 1 銘柄
    await jump(page, '8058')
    await expect(s.getByTestId('sim-one')).toContainText('8058')
  })
  test('ほかのペイン（スクリーナー）で行を動かしても、群は群のまま', async ({ start }) => {
    const { page } = await start()
    const s = await openSim(page)
    await keys(page, 'Alt+ArrowUp', 'Alt+ArrowLeft', 'Alt+ArrowLeft')
    await expect(page.locator('[data-widget="screener"]')).toHaveClass(/focused/)
    await keys(page, 'ArrowDown')
    await expect(s.locator('.cfg .scope [aria-checked="true"]')).toContainText('群')
    await expect(s.locator('[data-card="table"]')).toBeVisible()
  })
})

test.describe('伸びを見込む（FR-SIM12。M で横ばい ⇔ 伸びを見込む）', () => {
  test('これからで M を押すと伸びを見込んで計算し直す。前提に伸びの決め方、表に試算の伸び。過去では M を受けない', async ({ start }) => {
    const { page } = await start()
    const s = await openSim(page)
    await keys(page, 'm')
    await expect(s.locator('.cfg')).not.toContainText('伸びを見込む')
    await keys(page, 'PageDown')
    await expect(s.getByTestId('sim-fwd')).toBeVisible()
    await expect(s.locator('.cfg')).toContainText('横ばいと減配シナリオで試算')
    await keys(page, 'm')
    await expect(s.getByTestId('sim-loading')).toBeVisible()
    await expect(s.getByTestId('sim-fwd')).toBeVisible()
    await expect(s.locator('.cfg')).toContainText('伸びを見込むと減配シナリオで試算')
    await expect(s.getByTestId('sim-basis')).toContainText('Theil–Sen')
    await expect(s.locator('thead')).toContainText('試算の伸び')
  })
})

test.describe('保有のタブ（FR-H11・FR-SIM11）', () => {
  test('スクリーナーのタブと同じ 3 列: 保有・銘柄情報・右の列（日足と配当シミュレータ）。すべてリンク 4', async ({ start }) => {
    const { page } = await start()
    await tab(page, 'holdings')
    for (const w of ['portfolio', 'info', 'chart', 'divsim']) await expect(page.locator(`[data-widget="${w}"]`)).toHaveCount(1)
    await expect(page.locator('[data-widget="divsim"] .link')).toHaveText('4')
  })
})

test.describe('基準日 10 年・日付・配分・積立（FR-SIM8）', () => {
  test('Alt+4 で 10 年前、Alt+5 で日付、W で利回りに比例、D で毎月の積立', async ({ start }) => {
    const { page } = await start()
    const s = await openSim(page)
    await keys(page, 'Alt+Digit4')
    await expect(s.locator('.cfg')).toContainText('10 年前')
    await expect(s.getByTestId('sim-past')).toBeVisible()
    // 日付
    await keys(page, 'Alt+Digit5')
    const dlg = page.locator('.dialog').last()
    await expect(dlg).toContainText('基準日')
    await keys(page, 'Control+a')
    await page.keyboard.type('2022-04-03')
    await keys(page, 'Enter')
    await expect(s.locator('.cfg')).toContainText('2022-04-03')
    await expect(s.locator('.c-hero h3')).toContainText('2022-04-01 に')
    // 配分
    await keys(page, 'w')
    await expect(s.locator('.cfg')).toContainText('利回りに比例')
    await expect(s.getByTestId('sim-basis')).toContainText('利回り（その時点の直近 1 年の 1 株配当')
    // 積立
    await keys(page, 'd')
    await expect(page.locator('.dialog').last()).toContainText('毎月の積立')
    await keys(page, 'Control+a')
    await page.keyboard.type('3')
    await keys(page, 'Enter')
    await expect(s.locator('.cfg')).toContainText('毎月 3.00万円を積み立て')
    await expect(s.locator('.c-hero')).toContainText('入れた元本（積立を含む）')
    await expect(s.getByTestId('sim-basis')).toContainText('積立は毎月末に')
  })
})

test.describe('当時の条件で選び直す・シナリオ（FR-SIM8）', () => {
  test('H で過去を当時の条件で選び直す。K で今の設定を名前で保存し、あとで読み込む', async ({ start }) => {
    const { page } = await start()
    const s = await openSim(page)
    await expect(s.locator('.cfg')).toContainText('当時の条件で選び直さない')
    await keys(page, 'h')
    await expect(s.locator('.cfg')).toContainText('当時の条件で選び直す')
    await expect(s.getByTestId('sim-past')).toBeVisible()
    await expect(s.getByTestId('sim-basis')).toContainText('当時の条件で選び直す')
    // シナリオ: 保存
    await keys(page, 'k')
    const dlg = page.locator('.dialog').last()
    await expect(dlg).toContainText('今の設定を名前を付けて保存')
    await keys(page, 'Enter')
    await expect(page.locator('.dialog').last()).toContainText('シナリオの名前')
    await page.keyboard.type('税引前で選び直し')
    await keys(page, 'Enter')
    await expect(page.locator('.dialog')).toHaveCount(0)
    // 設定を変えてから読み込むと戻る
    await keys(page, 'h')
    await expect(s.locator('.cfg')).toContainText('選び直さない')
    await keys(page, 'k')
    await expect(page.locator('.dialog').last()).toContainText('税引前で選び直し')
    await keys(page, 'ArrowDown', 'Enter')
    await expect(page.locator('.dialog')).toHaveCount(0)
    await expect(s.locator('.cfg')).toContainText('当時の条件で選び直す')
  })
})

test.describe('フリーの窓に置く（FR-SIM8）', () => {
  test('フリー 2 に置くと出どころは★お気に入り。今のスクリーナーは選べず、目標の配当は 1 枚目の窓で決める案内', async ({ start }) => {
    const { app } = await start({
      viewport: null,
      user: { watchlists: watchlists({ favorites: ['8058', '8001', '9434'] }) },
      freeWindows: { free2: pane('divsim', {}, 0) },
    })
    await expect.poll(() => app.windows().length, { timeout: 20_000 }).toBe(2)
    const free = app.windows().find((x) => x.url().includes('w=free2'))!
    const s = free.locator('[data-widget="divsim"]')
    await expect(s).toHaveCount(1, { timeout: 20_000 })
    await focusPane(free, s)
    // リンク 0 のペインは群だけ。出どころは★お気に入りの 3 銘柄
    await expect(s.getByTestId('sim-past')).toBeVisible({ timeout: 15_000 })
    await expect(s.locator('.src')).toContainText('★お気に入り')
    await expect(s.locator('.src')).toContainText('3 銘柄')
    // L の出どころの一覧に「今のスクリーナー」は無い
    await keys(free, 'l')
    const dlg = free.locator('.dialog')
    await expect(dlg).toContainText('出どころを選ぶ')
    await expect(dlg).not.toContainText('今のスクリーナー')
    await keys(free, 'Escape')
    await expect(dlg).toHaveCount(0)
    // これから: 目標の配当は 1 枚目の窓のポートフォリオで決める（フリー N では開けない）
    await expect(s.getByTestId('sim-loading')).toHaveCount(0)
    await keys(free, 'PageDown')
    await expect(s.getByTestId('sim-fwd')).toBeVisible()
    await expect(s.getByTestId('sim-goal')).toContainText('1 枚目の窓')
    await expect(s.getByTestId('sim-goal').locator('button')).toHaveCount(0)
  })
})
