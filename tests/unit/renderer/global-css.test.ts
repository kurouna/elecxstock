// 全体の CSS（app.css・コンポーネントの :global）が、よくある名前のクラスでほかのペインに漏れないこと（レビューの指摘。株価ボードの .foot の衝突）。
// 漏れると、同じ名前のクラスを使ったペイン・ダイアログの見た目が、知らないうちに崩れる
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (p: string) => readFileSync(join(__dirname, '../../../', p), 'utf8')
/** CSS の規則のセレクタ（{ の前）を、コメントを除いて取り出す */
const selectors = (css: string) =>
  css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('}')
    .map((r) => r.split('{')[0]!.trim())
    .filter(Boolean)

describe('全体の CSS の漏れ（FR-V5）', () => {
  it('Overlays.svelte の :global はダイアログ（.dialog）か背景（.scrim）の中に閉じる', () => {
    const style = read('src/renderer/components/overlays/Overlays.svelte').split('<style>')[1] ?? ''
    const globals = [...style.matchAll(/:global\(([^)]*)\)/g)].map((m) => m[1]!.trim())
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
  /** CSS の規則（セレクタと中身）。コメントを除く */
  const rules = (css: string) =>
    [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1]!.trim(), body: m[2]! }))
  for (const [file, sel] of FILES) {
    it(`${file} の ${sel}`, () => {
      const src = read(file)
      const css = file.endsWith('.svelte') ? (src.split('<style>')[1] ?? '') : src
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
