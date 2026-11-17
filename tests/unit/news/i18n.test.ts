// ニュースの文言（L2）: 定義した文言は、どれも画面のコードから使われている（使われない文言を残さない）
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { NEWS_JA } from '@shared/news/i18n'
import { describe, expect, it } from 'vitest'

const SRC = resolve(__dirname, '../../../src')
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? files(p) : /\.(ts|svelte)$/.test(n) ? [p] : []
  })
}
const code = files(SRC)
  .filter((p) => !p.endsWith(join('news', 'i18n.ts')) && !p.endsWith(join('lib', 'i18n.ts')))
  .map((p) => readFileSync(p, 'utf8'))
  .join('\n')

/**
 * 組み立てて使う接頭辞と、その後ろに入る値（分類・言語・印・失敗の理由）。ここに無い接頭辞は、キーをそのまま書いていないと「使われていない」
 */
const COMPOSED: Record<string, readonly string[]> = {
  'news.tab': ['all', 'market', 'reading', 'official'],
  'news.tag': ['ja', 'en'],
  'news.err': ['timeout', 'network', 'parse', 'too-large', 'blocked'],
  'set.news.lang': ['ja', 'en'],
  'set.news.badge': ['ja', 'en'],
  set: ['news'], // 設定のタブの名前（Settings.svelte の TABS）
}
/** キーがそのまま書かれているか、決めた接頭辞の `接頭辞.${…}` の形で、決めた値として組み立てられている */
const used = (k: string) => {
  if (code.includes(`'${k}'`) || code.includes(`"${k}"`)) return true
  const i = k.lastIndexOf('.')
  const values = COMPOSED[k.slice(0, i)]
  return !!values?.includes(k.slice(i + 1)) && code.includes(`\`${k.slice(0, i)}.\${`)
}

describe('FR-NW1 ニュースの文言', () => {
  it('定義した文言はどれもコードから使われている', () => {
    expect(Object.keys(NEWS_JA).filter((k) => !used(k))).toEqual([])
  })
})
