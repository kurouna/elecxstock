// 全体の CSS（app.css・コンポーネントの :global）が、よくある名前のクラスでほかのペインに漏れないこと（レビューの指摘。株価ボードの .foot の衝突）。
// 漏れると、同じ名前のクラスを使ったペイン・ダイアログの見た目が、知らないうちに崩れる
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (p: string) => readFileSync(join(__dirname, '../../../', p), 'utf8')
/** コンポーネントの <style> の中身 */
const style = (file: string) => read(file).split('<style>')[1] ?? ''
/** CSS の規則（セレクタと中身）。コメントを除く */
const rules = (css: string) =>
  [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1]!.trim(), body: m[2]! }))
const zOf = (body: string) => Number(body.match(/z-index:\s*(\d+)/)?.[1] ?? Number.NaN)
/** CSS の規則のセレクタ（{ の前）を、コメントを除いて取り出す */
const selectors = (css: string) =>
  css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('}')
    .map((r) => r.split('{')[0]!.trim())
    .filter(Boolean)

describe('全体の CSS の漏れ（FR-V5）', () => {
  it('Overlays.svelte の :global はダイアログ（.dialog）か背景（.scrim）の中に閉じる', () => {
    const css = style('src/renderer/components/overlays/Overlays.svelte')
    const globals = [...css.matchAll(/:global\(([^)]*)\)/g)].map((m) => m[1]!.trim())
    expect(globals.length).toBeGreaterThan(0)
    const leaked = globals.filter((g) => !/^(\.dialog|\.scrim|:root)\b/.test(g))
    expect(leaked).toEqual([])
  })

  it('app.css の一覧の表の規則は table.grid に限る（div.grid の中の別の表に当たらない）', () => {
    const leaked = selectors(read('src/renderer/app.css'))
      .flatMap((s) => s.split(','))
      .map((s) => s.trim())
      .filter((s) => /(^|\s)\.grid\b/.test(s) && !/(^|\s)table\.grid\b/.test(s))
    expect(leaked).toEqual([])
  })
})

describe('動きを減らす（FR-V9）', () => {
  it('app.css の --motion* のトークンは、設定（data-reduce-motion）と OS（prefers-reduced-motion）の両方で 0ms にする', () => {
    const css = read('src/renderer/app.css').replace(/\/\*[\s\S]*?\*\//g, '')
    const all = new Set([...css.matchAll(/(--motion[\w-]*)\s*:/g)].map((m) => m[1]!))
    const block = (head: RegExp) => {
      const i = css.search(head)
      expect(i).toBeGreaterThanOrEqual(0)
      // 最初の } まで（@media は中の :root の規則の終わりまで）
      const body = css.slice(i, css.indexOf('}', i))
      return new Set([...body.matchAll(/(--motion[\w-]*)\s*:\s*0ms/g)].map((m) => m[1]!))
    }
    const bySetting = block(/:root\[data-reduce-motion="true"\]\s*\{/)
    const byOs = block(/@media \(prefers-reduced-motion: reduce\)/)
    expect([...bySetting].sort()).toEqual([...all].sort())
    expect([...byOs].sort()).toEqual([...all].sort())
  })
})

describe('フォーカス・選択の枠は中身より上に重ねる（FR-KB3。中の背景・帯・ラベルに上書きされない）', () => {
  // 枠（var(--focus) の inset の box-shadow）を要素そのものに描くと、背景を持つ子（表の選んだ行・見出し・帯・チャートの足）が上に重なって線が消える
  const FILES: [string, string][] = [
    ['src/renderer/app.css', '.pane.focused'],
    ['src/renderer/components/widgets/ChartGrid.svelte', '.tile.sel'],
    ['src/renderer/components/widgets/MarketOverview.svelte', '.tile.sel'],
    ['src/renderer/components/widgets/folio/AllocMap.svelte', '.tile.sel'],
    ['src/renderer/components/Dock.svelte', '.rail:focus-visible'],
  ]
  for (const [file, sel] of FILES) {
    it(`${file} の ${sel}`, () => {
      const src = read(file)
      const css = file.endsWith('.svelte') ? style(file) : src
      const rs = rules(css)
      // 要素そのものには var(--focus) の inset の枠を描かない
      const own = rs.filter(
        (r) => r.sel.split(',').some((s) => s.trim().endsWith(sel)) && /box-shadow:\s*inset[^;]*var\(--focus\)/.test(r.body),
      )
      expect(own.map((r) => r.sel)).toEqual([])
      // ::before に描き、ポインタは素通し・中身より上
      const pseudo = rs.find((r) => r.sel.split(',').some((s) => s.trim().endsWith(`${sel}::before`)) && /var\(--focus\)/.test(r.body))
      expect(pseudo, `${sel}::before`).toBeDefined()
      expect(pseudo!.body).toMatch(/pointer-events:\s*none/)
      expect(pseudo!.body).toMatch(/position:\s*absolute/)
      expect(pseudo!.body).toMatch(/inset:\s*0/)
      expect(pseudo!.body).toMatch(/z-index:\s*\d+/)
    })
  }
  it('ペインの枠は、中の説明（5）より上で、銘柄を落とす場所の表示（30）より下。ペインの ::after は落とす場所の表示だけ', () => {
    const rs = rules(read('src/renderer/app.css'))
    const z = Number(rs.find((r) => r.sel === '.pane.focused::before')!.body.match(/z-index:\s*(\d+)/)![1])
    expect(z).toBeGreaterThan(5)
    expect(z).toBeLessThan(30)
    expect(rs.filter((r) => /\.pane[^\s,]*::after/.test(r.sel)).map((r) => r.sel)).toEqual([])
  })
})

describe('枠の重なりの順番（FR-KB3。レビューで見つけた不具合）', () => {
  it('タイルの枠は、タイルの中の見出し・印（z-index を持つ子）より上', () => {
    for (const file of [
      'src/renderer/components/widgets/ChartGrid.svelte',
      'src/renderer/components/widgets/MarketOverview.svelte',
      'src/renderer/components/widgets/folio/AllocMap.svelte',
    ]) {
      const rs = rules(style(file))
      const frame = zOf(rs.find((r) => /\.tile\.sel::before$/.test(r.sel))!.body)
      // タイルそのもの（.tile・.tile:hover・.tile.sel）と枠の疑似要素を除いた、z-index を持つ子
      const kids = rs.filter((r) => /z-index/.test(r.body) && !/\.tile(\.sel|:hover)?(::before)?$/.test(r.sel) && !/::before$/.test(r.sel))
      for (const k of kids) expect(frame, `${file} ${k.sel}`).toBeGreaterThan(zOf(k.body))
    }
  })
  it('ペインの中の z-index は、フォーカスの枠より下（中身）か、銘柄を落とす場所の表示（30）以上（説明・メニュー）', () => {
    const frame = zOf(rules(read('src/renderer/app.css')).find((r) => r.sel === '.pane.focused::before')!.body)
    const dir = (d: string): string[] =>
      readdirSync(join(__dirname, '../../../', d), { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? dir(`${d}/${e.name}`) : e.name.endsWith('.svelte') ? [`${d}/${e.name}`] : [],
      )
    const bad = [...dir('src/renderer/components/widgets'), ...dir('src/renderer/news')].flatMap((f) =>
      rules(style(f))
        .filter((r) => /z-index/.test(r.body) && zOf(r.body) >= frame && zOf(r.body) < 30)
        .map((r) => `${f} ${r.sel}`),
    )
    expect(bad).toEqual([])
  })
  it('チャートグリッド: マウスを載せた淡い枠は、選んだタイルには青い枠を消しているときだけ掛ける（「枠を常に出す」のとき青い枠が灰色にならない）', () => {
    const hover = rules(style('src/renderer/components/widgets/ChartGrid.svelte')).filter((r) => /\.tile[^\s]*:hover::before$/.test(r.sel))
    expect(hover.length).toBeGreaterThan(0)
    for (const r of hover) expect(r.sel.includes(':not(.sel)') || r.sel.includes('not([data-focus-always'), r.sel).toBe(true)
    // 選んだタイルにも、マウスで操作しているとき（青い枠を消しているとき）は淡い枠を出す
    const sel = hover.find((r) => r.sel.includes('.tile.sel:hover::before'))
    expect(sel?.sel).toContain('not([data-focus-always')
    expect(sel?.body).toMatch(/box-shadow:\s*inset[^;]*var\(--line-strong\)/)
  })
})

describe('マウスで操作しているときは枠を出さない（FR-KB3。::before に移しても効く）', () => {
  it('ペインとチャートグリッドの選んだタイルの枠は、ポインタの操作で（枠を常に出す設定でなければ）消す', () => {
    for (const [css, target] of [
      [read('src/renderer/app.css'), '.pane.focused::before'],
      [style('src/renderer/components/widgets/ChartGrid.svelte'), '.tile.sel::before'],
    ] as const) {
      const off = rules(css).find((r) => r.sel.includes('data-input') && r.sel.includes('not([data-focus-always') && r.sel.endsWith(target))
      expect(off?.body, target).toMatch(/box-shadow:\s*none/)
    }
  })
})

describe('カードの見出しは縮まない・幅でたたむ（FR-PF1。見出しの 2 行目が下に重なった）', () => {
  it('ポートフォリオと配当シミュレータのカードの見出しは flex: none（高さの決まったカードの中で 1 行分に縮まない）', () => {
    const folio = rules(style('src/renderer/components/widgets/Folio.svelte')).find((r) => r.sel === '.card h3')
    expect(folio?.body).toMatch(/flex:\s*none/)
    const sim = rules(style('src/renderer/components/widgets/DivSim.svelte')).find((r) => r.sel === 'h3')
    expect(sim?.body).toMatch(/flex:\s*none/)
  })
  it('ポートフォリオの見出しは名前付きのコンテナで、分類の切り替えは見出しの幅でたたむ（ペインの幅ではない）', () => {
    const css = style('src/renderer/components/widgets/Folio.svelte')
    expect(rules(css).find((r) => r.sel === '.card h3')?.body).toMatch(/container:\s*fhead\s*\/\s*inline-size/)
    expect(css).toMatch(/@container fhead \(max-width: \d+px\) \{\s*\.gseg/)
    expect(css).not.toMatch(/@container \(max-width: 759px\) \{\s*\.gseg/)
  })
})

describe('押せないボタンはマウスを載せても見た目を変えない（FR-V5。aria-disabled のボタンの枠線が hover で変わった）', () => {
  it('app.css の :hover:not(:disabled) の規則は、aria-disabled のボタンも除く', () => {
    const hovers = selectors(read('src/renderer/app.css'))
      .flatMap((s) => s.split(','))
      .map((s) => s.trim())
      .filter((s) => s.includes(':hover:not(:disabled)'))
    expect(hovers.length).toBeGreaterThan(0)
    // 引用符は Biome の整形で " になる（' でも可）
    expect(hovers.filter((s) => !/:not\(\[aria-disabled=["']true["']\]\)/.test(s))).toEqual([])
  })
})

describe('一杯で足せない「＋ ★」は、マウスを載せても明るくしない（FR-V5。銘柄ジャンプ・コマンドバー）', () => {
  it('.side:hover は .full（足せない。Jump では aria-disabled）を除く', () => {
    for (const f of ['src/renderer/components/overlays/Jump.svelte', 'src/renderer/components/overlays/Palette.svelte']) {
      const hovers = selectors(style(f)).filter((s) => /\.side:hover/.test(s))
      expect(hovers.length, f).toBeGreaterThan(0)
      expect(
        hovers.filter((s) => !s.includes(':not(.full)')),
        f,
      ).toEqual([])
    }
  })
})
