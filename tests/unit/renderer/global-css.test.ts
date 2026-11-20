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
