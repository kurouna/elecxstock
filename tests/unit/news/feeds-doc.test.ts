// ニュースのフィードの一覧（docs/news-feeds.md）が、登録表と合っている（FR-NW2）。登録表を直したら npm run gen:news-feeds-doc で作り直す
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
// @ts-expect-error 型の無い .mjs（文書を作る純粋な関数）
import { newsFeedsDoc } from '../../../scripts/news-feeds-doc.mjs'

describe('FR-NW2 フィードの一覧の文書', () => {
  it('docs/news-feeds.md は登録表から作ったものと同じ（npm run gen:news-feeds-doc）', () => {
    const reg = JSON.parse(readFileSync('resources/news/feeds.json', 'utf8'))
    expect(readFileSync('docs/news-feeds.md', 'utf8').replaceAll('\r\n', '\n')).toBe(newsFeedsDoc(reg))
  })
})
