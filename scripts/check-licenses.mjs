// 配布物に入る OSS が MIT と両立するライセンスかを確かめる（NFR-CI4）。GPL / AGPL / LGPL / SSPL を見つけたら失敗させる。
import { readFileSync } from 'node:fs'

const text = readFileSync(new URL('../out/THIRD_PARTY_NOTICES.txt', import.meta.url), 'utf8')
const heads = text.split('\n').filter((l) => / — /.test(l) && !l.startsWith('elecxstock'))
const bad = heads.filter((l) => /\b(A?GPL|LGPL|SSPL)\b/i.test(l.split(' — ')[1] ?? ''))
for (const l of heads) console.log(l)
if (bad.length) {
  console.error(`incompatible licenses:\n${bad.join('\n')}`)
  process.exit(1)
}
console.log(`ok: ${heads.length} packages`)
