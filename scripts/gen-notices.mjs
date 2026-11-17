// 同梱する OSS のライセンス一覧（THIRD_PARTY_NOTICES.txt）を out/ に書く（§10）。
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname.replace(/^\/(\w:)/, '$1')
// 製品版に入るもの: 実行時の依存と、renderer に入るライブラリ・フォント
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
// 依存はすべて devDependencies に置き、使うものだけをバンドルに入れる（yahoo-finance2 の MCP 用の依存を配布物に入れないため）
const bundled = [
  'yahoo-finance2',
  'tough-cookie',
  'tldts',
  'tldts-core',
  'zod',
  'fflate',
  'fast-xml-parser',
  'strnum',
  'anynum',
  '@nodable/entities',
  'fast-xml-builder',
  'xml-naming',
  'is-unsafe',
  'path-expression-matcher',
  'lightweight-charts',
  'fancy-canvas',
  'svelte',
  'clsx',
  'esm-env',
  '@fontsource-variable/noto-sans-jp',
  '@fontsource/noto-sans-mono',
  'electron',
]
const seen = new Set()
const out = ['elecxstock — third-party notices', '='.repeat(40), '']

function add(name) {
  if (seen.has(name)) return
  seen.add(name)
  const dir = join(root, 'node_modules', name)
  if (!existsSync(join(dir, 'package.json'))) return
  const p = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  const lic = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license', 'LICENCE'].map((f) => join(dir, f)).find((f) => existsSync(f))
  out.push(`${name} ${p.version} — ${typeof p.license === 'string' ? p.license : JSON.stringify(p.license)}`)
  out.push('-'.repeat(40))
  out.push(lic ? readFileSync(lic, 'utf8').trim() : '(license text not found in package)')
  // Apache-2.0 §4(d): NOTICE があれば中身も入れる。パッケージに入っていないもの（lightweight-charts）は scripts/notices/<名前>.NOTICE に上流のまま置く
  const notice = [join(dir, 'NOTICE'), join(root, 'scripts', 'notices', `${name.replace('/', '__')}.NOTICE`)].find((f) => existsSync(f))
  if (notice) out.push('', 'NOTICE:', readFileSync(notice, 'utf8').trim())
  out.push('', '')
  // バンドルに入る推移的な依存は bundled に並べる（yahoo-finance2 の MCP 用の依存は入らない）
}
for (const n of [...Object.keys(pkg.dependencies ?? {}), ...bundled]) add(n)
writeFileSync(join(root, 'out', 'THIRD_PARTY_NOTICES.txt'), out.join('\n'))
console.log(`notices: ${seen.size} packages`)
