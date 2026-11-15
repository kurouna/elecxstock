// docs/screener-fields.md を指標の登録表から作る。使い方: npm run gen:fields-doc（指標を足す・直したら回す）
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { fieldsDoc } from './fields-doc.mjs'

const reg = await import(pathToFileURL(join(process.cwd(), 'src', 'shared', 'fields.ts')).href)
writeFileSync(join(process.cwd(), 'docs', 'screener-fields.md'), fieldsDoc(reg))
console.log('docs/screener-fields.md')
