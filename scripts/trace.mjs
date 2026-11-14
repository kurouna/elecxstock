// 要求の ID とテストの突き合わせ（docs/testing.md「漏れを見つける仕組み」）。
// requirements.md の ID（表の 1 列目）と、テストのファイル（describe・it・test の名前とコメント）に書いた ID を比べる。
// 落とすのは次のときだけ（ID を名前に足すだけの作業を誘わないように）:
//   - テストに書いた ID が requirements.md に無い（古い・打ち間違い）
//   - テストも除外（tests/trace-exempt.json）も無い ID の数が、基準（tests/trace-baseline.json）より増えた
// 減ったら `node scripts/trace.mjs --update` で基準を下げる。`--list` で、テストの無い ID を出す
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const req = readFileSync('docs/requirements.md', 'utf8')
// 要求の ID: 表の 1 列目（| FR-U1 |）と、箇条書きの見出し（- FR-I1（P1）:）
const ids = new Set([...req.matchAll(/^(?:\|\s*|-\s+)((?:FR|NFR)-[A-Z]+\d+)(?:\s*\||（)/gm)].map((m) => m[1]))

/** 「FR-H7〜H9」「FR-AL3・AL4」「NFR-P2, P3」のような書き方も読む */
function idsIn(text) {
  const out = new Set()
  for (const m of text.matchAll(/\b(FR|NFR)-([A-Z]+)(\d+)((?:\s*[〜~・,、/]\s*[A-Z]*\d+)*)/g)) {
    const [, kind, area, n0, rest] = m
    out.add(`${kind}-${area}${n0}`)
    let prev = Number(n0)
    for (const r of rest.matchAll(/([〜~・,、/])\s*([A-Z]*)(\d+)/g)) {
      const a = r[2] || area
      const n = Number(r[3])
      if ((r[1] === '〜' || r[1] === '~') && a === area) for (let i = prev + 1; i <= n; i++) out.add(`${kind}-${a}${i}`)
      else out.add(`${kind}-${a}${n}`)
      prev = n
    }
  }
  return out
}

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : /\.(test|spec)\.ts$/.test(e.name) ? [join(dir, e.name)] : [],
  )
}
const covered = new Map()
for (const f of [...files('tests/unit'), ...files('tests/e2e')])
  for (const id of idsIn(readFileSync(f, 'utf8'))) covered.set(id, [...(covered.get(id) ?? []), f.replaceAll('\\', '/')])

const exempt = JSON.parse(readFileSync('tests/trace-exempt.json', 'utf8'))
const unknown = [...covered.keys()].filter((id) => !ids.has(id))
const unknownExempt = Object.keys(exempt).filter((id) => !ids.has(id))
const missing = [...ids].filter((id) => !covered.has(id) && !exempt[id])
const baselinePath = 'tests/trace-baseline.json'
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')).missing

if (process.argv.includes('--list')) for (const id of missing) console.log(id)
if (process.argv.includes('--update')) {
  writeFileSync(baselinePath, `${JSON.stringify({ missing: missing.length }, null, 2)}\n`)
  console.log(`trace: baseline -> ${missing.length}`)
}
console.log(
  `trace: 要求 ${ids.size} 件 / テストあり ${[...ids].filter((id) => covered.has(id)).length} / 除外 ${Object.keys(exempt).length} / テストなし ${missing.length}（基準 ${baseline}）`,
)
let ok = true
if (unknown.length) {
  console.error(`trace: requirements.md に無い ID がテストにある: ${unknown.join(', ')}`)
  ok = false
}
if (unknownExempt.length) {
  console.error(`trace: requirements.md に無い ID が除外にある: ${unknownExempt.join(', ')}`)
  ok = false
}
if (!process.argv.includes('--update') && missing.length > baseline) {
  console.error(
    `trace: テストの無い要求が基準より増えた（${missing.length} > ${baseline}）。テストを足すか、tests/trace-exempt.json に理由を書く`,
  )
  ok = false
}
if (!ok) process.exit(1)
