// カバレッジの下限（docs/testing.md「漏れを見つける仕組み」）。`npm run coverage` のあとに動く（CI のジョブだけ。verify には入れない）。
// 下限はフォルダごとに持ち（ファイル間でコードを移すだけで落ちないように）、1 ポイントの幅を持たせる。
// 上がったら `node scripts/coverage-check.mjs --update` で基準（tests/coverage-baseline.json）を上げる
import { readFileSync, writeFileSync } from 'node:fs'

const SLACK = 1
const summary = JSON.parse(readFileSync('coverage/coverage-summary.json', 'utf8'))
const groups = {}
for (const [file, v] of Object.entries(summary)) {
  if (file === 'total') continue
  const k = file.replaceAll(String.fromCharCode(92), '/').match(/src\/(core|shared|renderer\/lib|renderer\/stores)\//)?.[1]
  if (!k) continue
  groups[k] ??= { covered: 0, total: 0 }
  groups[k].covered += v.lines.covered
  groups[k].total += v.lines.total
}
const now = Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, Math.round((v.covered / v.total) * 1000) / 10]))
const path = 'tests/coverage-baseline.json'
if (process.argv.includes('--update')) {
  writeFileSync(path, `${JSON.stringify(now, null, 2)}\n`)
  console.log('coverage: baseline updated', now)
  process.exit(0)
}
const base = JSON.parse(readFileSync(path, 'utf8'))
let ok = true
for (const [k, pct] of Object.entries(now)) {
  const min = (base[k] ?? 0) - SLACK
  console.log(`coverage: src/${k} lines ${pct}%（下限 ${min.toFixed(1)}%）`)
  if (pct < min) ok = false
}
if (!ok) {
  console.error('coverage: 行のカバレッジが基準より下がった。テストを足す')
  process.exit(1)
}
