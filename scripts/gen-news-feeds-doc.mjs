// docs/news-feeds.md をニュースの登録表から作る。使い方: npm run gen:news-feeds-doc（resources/news/feeds.json を直したら回す）
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { newsFeedsDoc } from './news-feeds-doc.mjs'

const reg = JSON.parse(readFileSync(join(process.cwd(), 'resources', 'news', 'feeds.json'), 'utf8'))
writeFileSync(join(process.cwd(), 'docs', 'news-feeds.md'), newsFeedsDoc(reg))
console.log('docs/news-feeds.md')
